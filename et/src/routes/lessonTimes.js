const express = require('express');
const db = require('../db');

const router = express.Router();
const MAX_LESSON = 12;

function getAll() {
  const rows = db.prepare('SELECT * FROM lesson_time_slots').all();
  const map = {};
  for (const r of rows) map[`${r.shift}_${r.lesson_number}`] = r;
  return map;
}

router.get('/', (req, res) => {
  res.render('lessonTimes/index', { times: getAll(), MAX_LESSON, saved: false });
});

router.post('/', (req, res) => {
  const upsert = db.prepare(`
    INSERT INTO lesson_time_slots (shift, lesson_number, start_time, end_time) VALUES (?, ?, ?, ?)
    ON CONFLICT(shift, lesson_number) DO UPDATE SET start_time = excluded.start_time, end_time = excluded.end_time
  `);
  const del = db.prepare('DELETE FROM lesson_time_slots WHERE shift = ? AND lesson_number = ?');

  for (const shift of [1, 2]) {
    for (let n = 1; n <= MAX_LESSON; n++) {
      const start = req.body[`start_${shift}_${n}`];
      const end = req.body[`end_${shift}_${n}`];
      if (start && end) {
        upsert.run(shift, n, start, end);
      } else {
        del.run(shift, n);
      }
    }
  }
  res.render('lessonTimes/index', { times: getAll(), MAX_LESSON, saved: true });
});

module.exports = router;
