const db = require('../db');

function isTeacherFreeOnDay(teacherId, dayOfWeek) {
  const teacher = db.prepare('SELECT methodical_day FROM teachers WHERE id = ?').get(teacherId);
  if (!teacher) return false;
  if (teacher.methodical_day === dayOfWeek) return false;
  const busy = db
    .prepare('SELECT 1 FROM teacher_busy_days WHERE teacher_id = ? AND day_of_week = ?')
    .get(teacherId, dayOfWeek);
  return !busy;
}

/**
 * Returns the conflicting lesson (with class/subject names) if `teacherId` is already
 * teaching another lesson in the same version at the same (day, lesson_number, shift) slot.
 * `shift` is the shift of the class the lesson is being placed into — lessons in different
 * shifts on the same day never conflict.
 */
function findTeacherConflict(versionId, teacherId, dayOfWeek, lessonNumber, shift, excludeLessonId) {
  return db
    .prepare(
      `SELECT l.id, l.class_id, c.name AS class_name, s.name AS subject_name
       FROM lessons l
       JOIN classes c ON c.id = l.class_id
       LEFT JOIN subjects s ON s.id = l.subject_id
       WHERE l.version_id = ? AND l.teacher_id = ? AND l.day_of_week = ? AND l.lesson_number = ? AND c.shift = ?
         AND l.id != ?`
    )
    .get(versionId, teacherId, dayOfWeek, lessonNumber, shift, excludeLessonId || -1);
}

module.exports = { isTeacherFreeOnDay, findTeacherConflict };
