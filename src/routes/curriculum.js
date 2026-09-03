const express = require('express');
const db = require('../db');

const router = express.Router();

function getAllSubjects() {
  return db.prepare('SELECT * FROM subjects ORDER BY name').all();
}

function getParallels() {
  return db.prepare('SELECT DISTINCT parallel FROM classes ORDER BY parallel').all().map((r) => r.parallel);
}

function getAll() {
  return db.prepare(`
    SELECT c.id, c.parallel, c.lessons_per_week, s.id AS subject_id, s.name AS subject_name
    FROM curriculum c JOIN subjects s ON s.id = c.subject_id
    ORDER BY c.parallel, s.name
  `).all();
}

function renderList(res, opts = {}) {
  res.render('curriculum/_list', {
    entries: getAll(),
    allSubjects: getAllSubjects(),
    parallels: getParallels(),
    editId: null,
    error: null,
    layout: false,
    ...opts,
  });
}

router.get('/', (req, res) => {
  res.render('curriculum/index', {
    entries: getAll(),
    allSubjects: getAllSubjects(),
    parallels: getParallels(),
    editId: null,
    error: null,
  });
});

router.get('/new', (req, res) => {
  renderList(res, { editId: 'new' });
});

router.post('/', (req, res) => {
  const parallel = (req.body.parallel || '').trim();
  const subjectId = Number(req.body.subject_id);
  const lessons = Number(req.body.lessons_per_week);
  if (!parallel || !subjectId || !lessons) return renderList(res, { editId: 'new', error: res.locals.t('field_required') });
  try {
    db.prepare('INSERT INTO curriculum (parallel, subject_id, lessons_per_week) VALUES (?, ?, ?)').run(parallel, subjectId, lessons);
    renderList(res);
  } catch (e) {
    renderList(res, { editId: 'new', error: e.message });
  }
});

router.get('/:id/edit', (req, res) => {
  renderList(res, { editId: Number(req.params.id) });
});

router.put('/:id', (req, res) => {
  const parallel = (req.body.parallel || '').trim();
  const subjectId = Number(req.body.subject_id);
  const lessons = Number(req.body.lessons_per_week);
  if (!parallel || !subjectId || !lessons) return renderList(res, { editId: Number(req.params.id), error: res.locals.t('field_required') });
  try {
    db.prepare('UPDATE curriculum SET parallel = ?, subject_id = ?, lessons_per_week = ? WHERE id = ?').run(parallel, subjectId, lessons, req.params.id);
    renderList(res);
  } catch (e) {
    renderList(res, { editId: Number(req.params.id), error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM curriculum WHERE id = ?').run(req.params.id);
  renderList(res);
});

module.exports = router;
