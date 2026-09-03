const db = require('../db');
const { isTeacherFreeOnDay } = require('./conflicts');

const ATTEMPTS = 6;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadClasses() {
  const classes = db.prepare('SELECT * FROM classes ORDER BY parallel, name').all();
  const gridStmt = db.prepare('SELECT day_of_week, lessons_count FROM class_day_grid WHERE class_id = ? ORDER BY day_of_week');
  for (const c of classes) c.grid = gridStmt.all(c.id);
  return classes;
}

function loadCurriculum() {
  const rows = db.prepare('SELECT parallel, subject_id, lessons_per_week FROM curriculum').all();
  const byParallel = {};
  for (const r of rows) {
    if (!byParallel[r.parallel]) byParallel[r.parallel] = [];
    byParallel[r.parallel].push({ subjectId: r.subject_id, lessonsPerWeek: r.lessons_per_week });
  }
  return byParallel;
}

function loadSubgroupConfig() {
  const rows = db.prepare('SELECT class_id, subject_id FROM class_subject_config WHERE is_subgroup = 1').all();
  const set = new Set(rows.map((r) => `${r.class_id}_${r.subject_id}`));
  return (classId, subjectId) => set.has(`${classId}_${subjectId}`);
}

function loadTeachersBySubject() {
  const rows = db
    .prepare(
      `SELECT ts.subject_id, t.id AS teacher_id
       FROM teacher_subjects ts JOIN teachers t ON t.id = ts.teacher_id`
    )
    .all();
  const map = {};
  for (const r of rows) {
    if (!map[r.subject_id]) map[r.subject_id] = [];
    map[r.subject_id].push(r.teacher_id);
  }
  return map;
}

/**
 * Step 1: for every class, greedily distribute its curriculum subjects across its own
 * day/lesson grid. Largest-remaining-count-first, avoiding same-day repeats where possible.
 * Returns { placements: [{classId, day, lessonNumber, subjectId}], warnings: [] }
 */
function placeSubjects(classes, curriculumByParallel) {
  const placements = [];
  const warnings = [];

  for (const cls of classes) {
    const plan = curriculumByParallel[cls.parallel] || [];
    let bag = plan.map((p) => ({ subjectId: p.subjectId, remaining: p.lessonsPerWeek }));
    const totalPlan = bag.reduce((s, b) => s + b.remaining, 0);
    const totalSlots = cls.grid.reduce((s, g) => s + g.lessons_count, 0);

    for (const dayEntry of cls.grid) {
      const usedToday = new Set();
      for (let n = 1; n <= dayEntry.lessons_count; n++) {
        // Shuffle before the (stable) sort so classes that share an identical curriculum
        // — siblings in the same parallel — don't all place the same subject in the same
        // slot every time, which would force them to compete for one teacher at once.
        bag = shuffle(bag);
        bag.sort((a, b) => b.remaining - a.remaining);
        let chosen = bag.find((b) => b.remaining > 0 && !usedToday.has(b.subjectId));
        if (!chosen) chosen = bag.find((b) => b.remaining > 0);
        if (chosen) {
          chosen.remaining--;
          usedToday.add(chosen.subjectId);
          placements.push({ classId: cls.id, day: dayEntry.day_of_week, lessonNumber: n, subjectId: chosen.subjectId });
        } else {
          placements.push({ classId: cls.id, day: dayEntry.day_of_week, lessonNumber: n, subjectId: null });
        }
      }
    }

    const leftover = bag.reduce((s, b) => s + b.remaining, 0);
    if (leftover > 0) {
      warnings.push({ classId: cls.id, className: cls.name, type: 'plan_exceeds_grid', count: leftover });
    } else if (totalSlots > totalPlan && plan.length > 0) {
      warnings.push({ classId: cls.id, className: cls.name, type: 'grid_exceeds_plan', count: totalSlots - totalPlan });
    }
  }

  return { placements, warnings };
}

/**
 * Step 2: assign teachers to every (class, day, lessonNumber, subject) placement,
 * expanding subgroup placements into two independent needs. Solved per shift since
 * shifts never share time slots. Tries several randomized attempts and keeps the
 * one with fewest unresolved needs.
 */
function assignTeachers(classes, placements, teachersBySubject, isSubgroup) {
  const classById = new Map(classes.map((c) => [c.id, c]));

  const needs = [];
  for (const p of placements) {
    if (p.subjectId == null) continue;
    const cls = classById.get(p.classId);
    if (isSubgroup(p.classId, p.subjectId)) {
      needs.push({ ...p, shift: cls.shift, subgroupSlot: 1 });
      needs.push({ ...p, shift: cls.shift, subgroupSlot: 2 });
    } else {
      needs.push({ ...p, shift: cls.shift, subgroupSlot: null });
    }
  }

  let best = null;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const occupied = new Set(); // `${shift}_${day}_${lessonNumber}_${teacherId}`
    const teacherLoad = new Map();
    const assigned = [];

    const bySlot = new Map();
    for (const need of needs) {
      const key = `${need.shift}_${need.day}_${need.lessonNumber}`;
      if (!bySlot.has(key)) bySlot.set(key, []);
      bySlot.get(key).push(need);
    }

    const slotKeys = shuffle([...bySlot.keys()]).sort((a, b) => {
      const [sa, da, la] = a.split('_').map(Number);
      const [sb, db_, lb] = b.split('_').map(Number);
      return sa - sb || da - db_ || la - lb;
    });

    for (const slotKey of slotKeys) {
      const slotNeeds = shuffle(bySlot.get(slotKey));
      const candidatesFor = (need) => {
        const subjectTeachers = teachersBySubject[need.subjectId] || [];
        return subjectTeachers.filter((tid) => {
          const occKey = `${need.shift}_${need.day}_${need.lessonNumber}_${tid}`;
          return isTeacherFreeOnDay(tid, need.day) && !occupied.has(occKey);
        });
      };

      slotNeeds
        .map((need) => ({ need, candidates: candidatesFor(need) }))
        .sort((a, b) => a.candidates.length - b.candidates.length)
        .forEach(({ need }) => {
          const candidates = candidatesFor(need);
          if (candidates.length === 0) {
            assigned.push({ ...need, teacherId: null });
            return;
          }
          candidates.sort((a, b) => (teacherLoad.get(a) || 0) - (teacherLoad.get(b) || 0));
          const best4 = candidates.filter((c) => (teacherLoad.get(c) || 0) === (teacherLoad.get(candidates[0]) || 0));
          const teacherId = best4[Math.floor(Math.random() * best4.length)];
          occupied.add(`${need.shift}_${need.day}_${need.lessonNumber}_${teacherId}`);
          teacherLoad.set(teacherId, (teacherLoad.get(teacherId) || 0) + 1);
          assigned.push({ ...need, teacherId });
        });
    }

    const gapsCount = assigned.filter((a) => a.teacherId == null).length;
    if (!best || gapsCount < best.gapsCount) {
      best = { assigned, gapsCount };
      if (gapsCount === 0) break;
    }
  }

  return best ? best.assigned : [];
}

function generateDraft() {
  const classes = loadClasses();
  const curriculumByParallel = loadCurriculum();
  const teachersBySubject = loadTeachersBySubject();
  const isSubgroup = loadSubgroupConfig();

  const { placements, warnings } = placeSubjects(classes, curriculumByParallel);
  const assignedNeeds = assignTeachers(classes, placements, teachersBySubject, isSubgroup);

  const assignedByPlacement = new Map();
  for (const a of assignedNeeds) {
    const key = `${a.classId}_${a.day}_${a.lessonNumber}_${a.subgroupSlot || 0}`;
    assignedByPlacement.set(key, a);
  }

  const classById = new Map(classes.map((c) => [c.id, c]));
  const gaps = [];
  let versionId;

  db.exec('BEGIN');
  try {
    const oldDraft = db.prepare("SELECT id FROM schedule_versions WHERE status = 'draft'").get();
    if (oldDraft) db.prepare('DELETE FROM schedule_versions WHERE id = ?').run(oldDraft.id);

    const versionInfo = db.prepare("INSERT INTO schedule_versions (status) VALUES ('draft')").run();
    versionId = versionInfo.lastInsertRowid;

    const insertLesson = db.prepare(`
      INSERT INTO lessons (version_id, class_id, day_of_week, lesson_number, subject_id, teacher_id, room_id, subgroup_slot)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    `);

    for (const p of placements) {
      if (p.subjectId == null) {
        insertLesson.run(versionId, p.classId, p.day, p.lessonNumber, null, null, null);
        continue;
      }
      if (isSubgroup(p.classId, p.subjectId)) {
        for (const slot of [1, 2]) {
          const key = `${p.classId}_${p.day}_${p.lessonNumber}_${slot}`;
          const a = assignedByPlacement.get(key);
          insertLesson.run(versionId, p.classId, p.day, p.lessonNumber, p.subjectId, a ? a.teacherId : null, slot);
          if (!a || a.teacherId == null) {
            gaps.push(gapInfo(classById.get(p.classId), p, slot));
          }
        }
      } else {
        const key = `${p.classId}_${p.day}_${p.lessonNumber}_0`;
        const a = assignedByPlacement.get(key);
        insertLesson.run(versionId, p.classId, p.day, p.lessonNumber, p.subjectId, a ? a.teacherId : null, null);
        if (!a || a.teacherId == null) {
          gaps.push(gapInfo(classById.get(p.classId), p, null));
        }
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return { versionId, gaps, warnings };
}

function gapInfo(cls, placement, subgroupSlot) {
  const subject = db.prepare('SELECT name FROM subjects WHERE id = ?').get(placement.subjectId);
  return {
    className: cls.name,
    day: placement.day,
    lessonNumber: placement.lessonNumber,
    subjectName: subject ? subject.name : '',
    subgroupSlot,
  };
}

module.exports = { generateDraft };
