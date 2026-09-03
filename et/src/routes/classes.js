const express = require('express');
const db = require('../db');

const router = express.Router();
const DAYS = [1, 2, 3, 4, 5, 6, 7];

function getAll() {
  const classes = db.prepare('SELECT * FROM classes ORDER BY parallel, name').all();
  const gridStmt = db.prepare('SELECT day_of_week, lessons_count FROM class_day_grid WHERE class_id = ? ORDER BY day_of_week');
  for (const c of classes) {
    c.grid = gridStmt.all(c.id);
  }
  return classes;
}

function gridFromBody(body) {
  const grid = {};
  for (const d of DAYS) {
    const v = parseInt(body[`day_${d}`], 10);
    if (v > 0) grid[d] = v;
  }
  return grid;
}

function saveGrid(classId, grid) {
  db.prepare('DELETE FROM class_day_grid WHERE class_id = ?').run(classId);
  const insert = db.prepare('INSERT INTO class_day_grid (class_id, day_of_week, lessons_count) VALUES (?, ?, ?)');
  for (const [day, count] of Object.entries(grid)) {
    insert.run(classId, Number(day), count);
  }
}

function renderList(res, opts = {}) {
  res.render('classes/_list', { classes: getAll(), editId: null, error: null, DAYS, layout: false, ...opts });
}

router.get('/', (req, res) => {
  res.render('classes/index', { classes: getAll(), editId: null, error: null, DAYS });
});

router.get('/new', (req, res) => {
  renderList(res, { editId: 'new' });
});

router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  const parallel = (req.body.parallel || '').trim();
  const shift = Number(req.body.shift) === 2 ? 2 : 1;
  if (!name || !parallel) return renderList(res, { editId: 'new', error: res.locals.t('field_required') });
  try {
    const info = db.prepare('INSERT INTO classes (name, parallel, shift) VALUES (?, ?, ?)').run(name, parallel, shift);
    saveGrid(info.lastInsertRowid, gridFromBody(req.body));
    renderList(res);
  } catch (e) {
    renderList(res, { editId: 'new', error: e.message });
  }
});

router.get('/:id/edit', (req, res) => {
  renderList(res, { editId: Number(req.params.id) });
});

router.put('/:id', (req, res) => {
  const name = (req.body.name || '').trim();
  const parallel = (req.body.parallel || '').trim();
  const shift = Number(req.body.shift) === 2 ? 2 : 1;
  if (!name || !parallel) return renderList(res, { editId: Number(req.params.id), error: res.locals.t('field_required') });
  try {
    db.prepare('UPDATE classes SET name = ?, parallel = ?, shift = ? WHERE id = ?').run(name, parallel, shift, req.params.id);
    saveGrid(req.params.id, gridFromBody(req.body));
    renderList(res);
  } catch (e) {
    renderList(res, { editId: Number(req.params.id), error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id);
  renderList(res);
});

module.exports = router;
