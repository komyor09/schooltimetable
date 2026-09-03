const express = require('express');
const db = require('../db');

const router = express.Router();

function getClasses() {
  return db.prepare('SELECT id, name FROM classes ORDER BY parallel, name').all();
}

function getSubjects() {
  return db.prepare('SELECT id, name FROM subjects ORDER BY name').all();
}

function getAll() {
  return db.prepare(`
    SELECT csc.id, c.id AS class_id, c.name AS class_name, s.id AS subject_id, s.name AS subject_name
    FROM class_subject_config csc
    JOIN classes c ON c.id = csc.class_id
    JOIN subjects s ON s.id = csc.subject_id
    WHERE csc.is_subgroup = 1
    ORDER BY c.name, s.name
  `).all();
}

function renderList(res, opts = {}) {
  res.render('subgroups/_list', {
    items: getAll(),
    classes: getClasses(),
    subjects: getSubjects(),
    error: null,
    layout: false,
    ...opts,
  });
}

router.get('/', (req, res) => {
  res.render('subgroups/index', { items: getAll(), classes: getClasses(), subjects: getSubjects(), error: null });
});

router.post('/', (req, res) => {
  const classId = Number(req.body.class_id);
  const subjectId = Number(req.body.subject_id);
  if (!classId || !subjectId) return renderList(res, { error: res.locals.t('field_required') });
  try {
    db.prepare(`
      INSERT INTO class_subject_config (class_id, subject_id, is_subgroup) VALUES (?, ?, 1)
      ON CONFLICT(class_id, subject_id) DO UPDATE SET is_subgroup = 1
    `).run(classId, subjectId);
    renderList(res);
  } catch (e) {
    renderList(res, { error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM class_subject_config WHERE id = ?').run(req.params.id);
  renderList(res);
});

module.exports = router;
