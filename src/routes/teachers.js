const express = require('express');
const db = require('../db');

const router = express.Router();
const DAYS = [1, 2, 3, 4, 5, 6, 7];

function getAllSubjects() {
  return db.prepare('SELECT * FROM subjects ORDER BY name').all();
}

function getAll() {
  const teachers = db.prepare('SELECT * FROM teachers ORDER BY full_name').all();
  const subjStmt = db.prepare(`
    SELECT s.id, s.name FROM teacher_subjects ts
    JOIN subjects s ON s.id = ts.subject_id
    WHERE ts.teacher_id = ? ORDER BY s.name
  `);
  const busyStmt = db.prepare('SELECT day_of_week FROM teacher_busy_days WHERE teacher_id = ? ORDER BY day_of_week');
  for (const t of teachers) {
    t.subjects = subjStmt.all(t.id);
    t.busyDays = busyStmt.all(t.id).map((r) => r.day_of_week);
  }
  return teachers;
}

function subjectIdsFromBody(body) {
  let ids = body.subject_ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  return ids.map(Number).filter(Boolean);
}

function busyDaysFromBody(body) {
  let days = body.busy_days || [];
  if (!Array.isArray(days)) days = [days];
  return days.map(Number).filter((d) => DAYS.includes(d));
}

function saveRelations(teacherId, subjectIds, busyDays) {
  db.prepare('DELETE FROM teacher_subjects WHERE teacher_id = ?').run(teacherId);
  const insSubj = db.prepare('INSERT OR IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)');
  for (const sid of subjectIds) insSubj.run(teacherId, sid);

  db.prepare('DELETE FROM teacher_busy_days WHERE teacher_id = ?').run(teacherId);
  const insBusy = db.prepare('INSERT OR IGNORE INTO teacher_busy_days (teacher_id, day_of_week) VALUES (?, ?)');
  for (const d of busyDays) insBusy.run(teacherId, d);
}

function renderList(res, opts = {}) {
  res.render('teachers/_list', {
    teachers: getAll(),
    allSubjects: getAllSubjects(),
    editId: null,
    error: null,
    DAYS,
    layout: false,
    ...opts,
  });
}

router.get('/', (req, res) => {
  res.render('teachers/index', { teachers: getAll(), allSubjects: getAllSubjects(), editId: null, error: null, DAYS });
});

router.get('/new', (req, res) => {
  renderList(res, { editId: 'new' });
});

router.post('/', (req, res) => {
  const fullName = (req.body.full_name || '').trim();
  const methodicalDay = req.body.methodical_day ? Number(req.body.methodical_day) : null;
  if (!fullName) return renderList(res, { editId: 'new', error: res.locals.t('field_required') });
  try {
    const info = db.prepare('INSERT INTO teachers (full_name, methodical_day) VALUES (?, ?)').run(fullName, methodicalDay);
    saveRelations(info.lastInsertRowid, subjectIdsFromBody(req.body), busyDaysFromBody(req.body));
    renderList(res);
  } catch (e) {
    renderList(res, { editId: 'new', error: e.message });
  }
});

router.get('/:id/edit', (req, res) => {
  renderList(res, { editId: Number(req.params.id) });
});

router.put('/:id', (req, res) => {
  const fullName = (req.body.full_name || '').trim();
  const methodicalDay = req.body.methodical_day ? Number(req.body.methodical_day) : null;
  if (!fullName) return renderList(res, { editId: Number(req.params.id), error: res.locals.t('field_required') });
  try {
    db.prepare('UPDATE teachers SET full_name = ?, methodical_day = ? WHERE id = ?').run(fullName, methodicalDay, req.params.id);
    saveRelations(req.params.id, subjectIdsFromBody(req.body), busyDaysFromBody(req.body));
    renderList(res);
  } catch (e) {
    renderList(res, { editId: Number(req.params.id), error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM teachers WHERE id = ?').run(req.params.id);
  renderList(res);
});

module.exports = router;
