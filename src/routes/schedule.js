const express = require('express');
const db = require('../db');
const { generateDraft } = require('../services/scheduler');

const router = express.Router();

function getDraft() {
  return db.prepare("SELECT * FROM schedule_versions WHERE status = 'draft'").get();
}

function getClasses() {
  return db.prepare('SELECT * FROM classes ORDER BY parallel, name').all();
}

function getGridDays(classId) {
  return db.prepare('SELECT day_of_week, lessons_count FROM class_day_grid WHERE class_id = ? ORDER BY day_of_week').all(classId);
}

function getLessonTimes(shift) {
  const rows = db.prepare('SELECT lesson_number, start_time, end_time FROM lesson_time_slots WHERE shift = ? ORDER BY lesson_number').all(shift);
  const map = {};
  for (const r of rows) map[r.lesson_number] = r;
  return map;
}

function getAllSubjects() {
  return db.prepare('SELECT * FROM subjects ORDER BY name').all();
}

function getAllTeachers() {
  return db.prepare('SELECT * FROM teachers ORDER BY full_name').all();
}

function getAllRooms() {
  return db.prepare('SELECT * FROM rooms ORDER BY name').all();
}

function getGaps(versionId) {
  return db
    .prepare(
      `SELECT l.day_of_week, l.lesson_number, c.name AS class_name, s.name AS subject_name
       FROM lessons l JOIN classes c ON c.id = l.class_id LEFT JOIN subjects s ON s.id = l.subject_id
       WHERE l.version_id = ? AND l.subject_id IS NOT NULL AND l.teacher_id IS NULL
       ORDER BY c.name, l.day_of_week, l.lesson_number`
    )
    .all(versionId);
}

function buildGrid(versionId, cls) {
  const days = getGridDays(cls.id);
  const maxLesson = Math.max(0, ...days.map((d) => d.lessons_count));
  const rows = db
    .prepare(
      `SELECT l.*, s.name AS subject_name, t.full_name AS teacher_name, r.name AS room_name
       FROM lessons l
       LEFT JOIN subjects s ON s.id = l.subject_id
       LEFT JOIN teachers t ON t.id = l.teacher_id
       LEFT JOIN rooms r ON r.id = l.room_id
       WHERE l.version_id = ? AND l.class_id = ?
       ORDER BY l.day_of_week, l.lesson_number, l.subgroup_slot`
    )
    .all(versionId, cls.id);

  const cellMap = {};
  for (const r of rows) {
    const key = `${r.day_of_week}_${r.lesson_number}`;
    if (!cellMap[key]) cellMap[key] = [];
    cellMap[key].push(r);
  }

  const times = getLessonTimes(cls.shift);
  return { days, maxLesson, cellMap, times };
}

function renderSchedulePage(req, res, opts = {}) {
  const classes = getClasses();
  const draft = getDraft();
  const classId = Number(req.query.classId || req.body.classId) || (classes[0] && classes[0].id);
  const selectedClass = classes.find((c) => c.id === classId) || null;
  const grid = draft && selectedClass ? buildGrid(draft.id, selectedClass) : null;
  const gaps = draft ? getGaps(draft.id) : [];

  res.render('schedule/index', {
    classes,
    draft,
    selectedClass,
    grid,
    gaps,
    warnings: opts.warnings || [],
    generated: !!opts.generated,
    published: !!opts.published,
  });
}

router.get('/', (req, res) => renderSchedulePage(req, res));

router.get('/grid', (req, res) => {
  const classes = getClasses();
  const draft = getDraft();
  const classId = Number(req.query.classId) || (classes[0] && classes[0].id);
  const selectedClass = classes.find((c) => c.id === classId) || null;
  const grid = draft && selectedClass ? buildGrid(draft.id, selectedClass) : null;
  res.render('schedule/_grid_content', { classes, draft, selectedClass, grid, layout: false });
});

router.post('/generate', (req, res) => {
  const { warnings } = generateDraft();
  renderSchedulePage(req, res, { warnings, generated: true });
});

router.post('/publish', (req, res) => {
  const draft = getDraft();
  if (draft) {
    const oldPublished = db.prepare("SELECT id FROM schedule_versions WHERE status = 'published'").get();
    if (oldPublished) db.prepare("UPDATE schedule_versions SET status = 'archived' WHERE id = ?").run(oldPublished.id);
    db.prepare("UPDATE schedule_versions SET status = 'published', published_at = datetime('now') WHERE id = ?").run(draft.id);
  }
  renderSchedulePage(req, res, { published: true });
});

router.get('/cell/:classId/:day/:lessonNumber/edit', (req, res) => {
  const draft = getDraft();
  const classId = Number(req.params.classId);
  const day = Number(req.params.day);
  const lessonNumber = Number(req.params.lessonNumber);
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
  const lessons = draft
    ? db
        .prepare('SELECT * FROM lessons WHERE version_id = ? AND class_id = ? AND day_of_week = ? AND lesson_number = ? ORDER BY subgroup_slot')
        .all(draft.id, classId, day, lessonNumber)
    : [];

  res.render('schedule/_cell_form', {
    layout: false,
    draft,
    cls,
    day,
    lessonNumber,
    lessons,
    isSubgroup: lessons.length === 2,
    allSubjects: getAllSubjects(),
    allTeachers: getAllTeachers(),
    allRooms: getAllRooms(),
    error: null,
  });
});

router.put('/cell/:classId/:day/:lessonNumber', (req, res) => {
  const draft = getDraft();
  const classId = Number(req.params.classId);
  const day = Number(req.params.day);
  const lessonNumber = Number(req.params.lessonNumber);
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);

  if (!draft || !cls) return res.status(400).send('No draft');

  const subjectId = req.body.subject_id ? Number(req.body.subject_id) : null;
  const isSubgroup = req.body.is_subgroup === 'on';
  const roomId1 = req.body.room_id_1 ? Number(req.body.room_id_1) : null;
  const roomId2 = req.body.room_id_2 ? Number(req.body.room_id_2) : null;
  const teacherId1 = req.body.teacher_id_1 ? Number(req.body.teacher_id_1) : null;
  const teacherId2 = req.body.teacher_id_2 ? Number(req.body.teacher_id_2) : null;

  const existingIds = db
    .prepare('SELECT id FROM lessons WHERE version_id = ? AND class_id = ? AND day_of_week = ? AND lesson_number = ?')
    .all(draft.id, classId, day, lessonNumber)
    .map((r) => r.id);

  const renderError = (message) => {
    const lessons = db
      .prepare('SELECT * FROM lessons WHERE version_id = ? AND class_id = ? AND day_of_week = ? AND lesson_number = ? ORDER BY subgroup_slot')
      .all(draft.id, classId, day, lessonNumber);
    res.render('schedule/_cell_form', {
      layout: false,
      draft,
      cls,
      day,
      lessonNumber,
      lessons,
      isSubgroup,
      allSubjects: getAllSubjects(),
      allTeachers: getAllTeachers(),
      allRooms: getAllRooms(),
      error: message,
    });
  };

  if (teacherId1) {
    const realConflict = db
      .prepare(
        `SELECT l.id, c.name AS class_name, s.name AS subject_name FROM lessons l
         JOIN classes c ON c.id = l.class_id LEFT JOIN subjects s ON s.id = l.subject_id
         WHERE l.version_id = ? AND l.teacher_id = ? AND l.day_of_week = ? AND l.lesson_number = ? AND c.shift = ?
           AND l.id NOT IN (${existingIds.length ? existingIds.map(() => '?').join(',') : '-1'})`
      )
      .get(draft.id, teacherId1, day, lessonNumber, cls.shift, ...existingIds);
    if (realConflict) {
      return renderError(res.locals.t('schedule_conflict', realConflict.subject_name, realConflict.class_name));
    }
  }
  if (isSubgroup && teacherId2) {
    if (teacherId2 === teacherId1) {
      return renderError(res.locals.t('schedule_conflict_same_teacher'));
    }
    const realConflict = db
      .prepare(
        `SELECT l.id, c.name AS class_name, s.name AS subject_name FROM lessons l
         JOIN classes c ON c.id = l.class_id LEFT JOIN subjects s ON s.id = l.subject_id
         WHERE l.version_id = ? AND l.teacher_id = ? AND l.day_of_week = ? AND l.lesson_number = ? AND c.shift = ?
           AND l.id NOT IN (${existingIds.length ? existingIds.map(() => '?').join(',') : '-1'})`
      )
      .get(draft.id, teacherId2, day, lessonNumber, cls.shift, ...existingIds);
    if (realConflict) {
      return renderError(res.locals.t('schedule_conflict', realConflict.subject_name, realConflict.class_name));
    }
  }

  db.prepare('DELETE FROM lessons WHERE version_id = ? AND class_id = ? AND day_of_week = ? AND lesson_number = ?').run(
    draft.id,
    classId,
    day,
    lessonNumber
  );

  const insert = db.prepare(`
    INSERT INTO lessons (version_id, class_id, day_of_week, lesson_number, subject_id, teacher_id, room_id, subgroup_slot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  if (isSubgroup) {
    insert.run(draft.id, classId, day, lessonNumber, subjectId, teacherId1, roomId1, 1);
    insert.run(draft.id, classId, day, lessonNumber, subjectId, teacherId2, roomId2, 2);
  } else {
    insert.run(draft.id, classId, day, lessonNumber, subjectId, teacherId1, roomId1, null);
  }

  const grid = buildGrid(draft.id, cls);
  res.render('schedule/_cell_saved', { draft, selectedClass: cls, grid, layout: false });
});

module.exports = router;
