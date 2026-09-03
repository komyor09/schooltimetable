const express = require('express');
const sd = require('../services/scheduleData');

const router = express.Router();

function isoDayOfWeek(date) {
  return ((date.getDay() + 6) % 7) + 1;
}

router.get('/', (req, res) => {
  res.render('tv/index');
});

router.get('/api/version', (req, res) => {
  const version = sd.getPublishedVersion();
  res.json({ versionId: version ? version.id : null });
});

router.get('/day', (req, res) => {
  const version = sd.getPublishedVersion();
  const dayOfWeek = isoDayOfWeek(new Date());
  let matrix1 = null;
  let matrix2 = null;
  if (version) {
    matrix1 = sd.buildTodayMatrix(version.id, 1, dayOfWeek);
    matrix2 = sd.buildTodayMatrix(version.id, 2, dayOfWeek);
  }
  res.render('tv/day', { version, dayOfWeek, matrix1, matrix2, layout: 'tv_layout' });
});

router.get('/week', (req, res) => {
  const version = sd.getPublishedVersion();
  const classes = sd.getClasses();
  const grids = version ? classes.map((c) => ({ cls: c, grid: sd.buildClassGrid(version.id, c) })) : [];
  res.render('tv/week', { version, grids, layout: 'tv_layout' });
});

module.exports = router;
