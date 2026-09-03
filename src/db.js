const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.join(__dirname, '..', 'data', 'schedule.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'data', 'schema.sql');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

function seedDefaultLessonTimes() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM lesson_time_slots').get();
  if (row.n > 0) return;

  const insert = db.prepare(
    'INSERT INTO lesson_time_slots (shift, lesson_number, start_time, end_time) VALUES (?, ?, ?, ?)'
  );
  const LESSON_MINUTES = 45;
  const BREAK_MINUTES = 10;
  const shiftStarts = { 1: '08:00', 2: '13:30' };

  for (const shift of [1, 2]) {
    let [h, m] = shiftStarts[shift].split(':').map(Number);
    for (let lessonNumber = 1; lessonNumber <= 8; lessonNumber++) {
      const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      m += LESSON_MINUTES;
      h += Math.floor(m / 60);
      m = m % 60;
      const end = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      insert.run(shift, lessonNumber, start, end);
      m += BREAK_MINUTES;
      h += Math.floor(m / 60);
      m = m % 60;
    }
  }
}

seedDefaultLessonTimes();

module.exports = db;
