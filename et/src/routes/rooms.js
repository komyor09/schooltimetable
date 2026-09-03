const express = require('express');
const db = require('../db');

const router = express.Router();

function getAll() {
  return db.prepare('SELECT * FROM rooms ORDER BY name').all();
}

function renderList(res, opts = {}) {
  res.render('rooms/_list', { rooms: getAll(), editId: null, error: null, layout: false, ...opts });
}

router.get('/', (req, res) => {
  res.render('rooms/index', { rooms: getAll() });
});

router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return renderList(res, { error: res.locals.t('field_required') });
  try {
    db.prepare('INSERT INTO rooms (name) VALUES (?)').run(name);
    renderList(res);
  } catch (e) {
    renderList(res, { error: e.message });
  }
});

router.get('/:id/edit', (req, res) => {
  renderList(res, { editId: Number(req.params.id) });
});

router.put('/:id', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return renderList(res, { editId: Number(req.params.id), error: res.locals.t('field_required') });
  try {
    db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(name, req.params.id);
    renderList(res);
  } catch (e) {
    renderList(res, { editId: Number(req.params.id), error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  renderList(res);
});

module.exports = router;
