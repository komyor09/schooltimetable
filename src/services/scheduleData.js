const db = require('../db');

function getPublishedVersion() {
  return db.prepare("SELECT * FROM schedule_versions WHERE status = 'published'").get();
}

function getDraftVersion() {
  return db.prepare("SELECT * FROM schedule_versions WHERE status = 'draft'").get();
}

function getClasses() {
  return db.prepare('SELECT * FROM classes ORDER BY parallel, name').all();
}

function getTeachers() {
  return db.prepare('SELECT * FROM teachers ORDER BY full_name').all();
}

function getGridDays(classId) {
  return db
    .prepare('SELECT day_of_week, lessons_count FROM class_day_grid WHERE class_id = ? ORDER BY day_of_week')
    .all(classId);
}

function getLessonTimes(shift) {
  const rows = db
    .prepare('SELECT lesson_number, start_time, end_time FROM lesson_time_slots WHERE shift = ? ORDER BY lesson_number')
    .all(shift);
  const map = {};
  for (const r of rows) map[r.lesson_number] = r;
  return map;
}

/** Full week grid for one class: { days, maxLesson, cellMap, times } — cellMap[day_lessonNumber] = lesson rows[] */
function buildClassGrid(versionId, cls) {
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

  return { days, maxLesson, cellMap, times: getLessonTimes(cls.shift) };
}

/** All lessons for one teacher across the week, with class/subject/room names, grouped by day. */
function getTeacherWeek(versionId, teacherId) {
  const rows = db
    .prepare(
      `SELECT l.*, c.name AS class_name, c.shift AS class_shift, s.name AS subject_name, r.name AS room_name
       FROM lessons l
       JOIN classes c ON c.id = l.class_id
       LEFT JOIN subjects s ON s.id = l.subject_id
       LEFT JOIN rooms r ON r.id = l.room_id
       WHERE l.version_id = ? AND l.teacher_id = ?
       ORDER BY l.day_of_week, l.lesson_number`
    )
    .all(versionId, teacherId);

  const byDay = {};
  for (const r of rows) {
    if (!byDay[r.day_of_week]) byDay[r.day_of_week] = [];
    const times = getLessonTimes(r.class_shift)[r.lesson_number];
    byDay[r.day_of_week].push({ ...r, start_time: times && times.start_time, end_time: times && times.end_time });
  }
  return byDay;
}

/** Today's lessons for every class in the given shift, as { classes, maxLesson, cellMap, times } for day `dayOfWeek`. */
function buildTodayMatrix(versionId, shift, dayOfWeek) {
  const classes = db.prepare('SELECT * FROM classes WHERE shift = ? ORDER BY parallel, name').all(shift);
  const times = getLessonTimes(shift);
  let maxLesson = 0;
  const cellMap = {};
  for (const cls of classes) {
    const rows = db
      .prepare(
        `SELECT l.*, s.name AS subject_name, t.full_name AS teacher_name, r.name AS room_name
         FROM lessons l
         LEFT JOIN subjects s ON s.id = l.subject_id
         LEFT JOIN teachers t ON t.id = l.teacher_id
         LEFT JOIN rooms r ON r.id = l.room_id
         WHERE l.version_id = ? AND l.class_id = ? AND l.day_of_week = ?
         ORDER BY l.lesson_number, l.subgroup_slot`
      )
      .all(versionId, cls.id, dayOfWeek);
    for (const r of rows) {
      maxLesson = Math.max(maxLesson, r.lesson_number);
      const key = `${cls.id}_${r.lesson_number}`;
      if (!cellMap[key]) cellMap[key] = [];
      cellMap[key].push(r);
    }
  }
  return { classes, maxLesson, cellMap, times };
}

module.exports = {
  getPublishedVersion,
  getDraftVersion,
  getClasses,
  getTeachers,
  getGridDays,
  getLessonTimes,
  buildClassGrid,
  getTeacherWeek,
  buildTodayMatrix,
};
