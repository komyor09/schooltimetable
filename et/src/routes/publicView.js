const express = require('express');
const sd = require('../services/scheduleData');

const router = express.Router();

router.get('/', (req, res) => {
  const version = sd.getPublishedVersion();
  const classes = sd.getClasses();
  const teachers = sd.getTeachers();
  const mode = req.query.mode === 'teacher' ? 'teacher' : 'class';

  let grid = null;
  let selectedClass = null;
  let teacherWeek = null;
  let selectedTeacher = null;

  if (version) {
    if (mode === 'class') {
      const classId = Number(req.query.classId) || (classes[0] && classes[0].id);
      selectedClass = classes.find((c) => c.id === classId) || null;
      if (selectedClass) grid = sd.buildClassGrid(version.id, selectedClass);
    } else {
      const teacherId = Number(req.query.teacherId) || (teachers[0] && teachers[0].id);
      selectedTeacher = teachers.find((t) => t.id === teacherId) || null;
      if (selectedTeacher) teacherWeek = sd.getTeacherWeek(version.id, selectedTeacher.id);
    }
  }

  res.render('publicView/index', {
    version,
    classes,
    teachers,
    mode,
    grid,
    selectedClass,
    teacherWeek,
    selectedTeacher,
  });
});

module.exports = router;
