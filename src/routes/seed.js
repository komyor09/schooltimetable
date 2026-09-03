const express = require('express');
const { generateFakeData } = require('../services/fakeData');

const router = express.Router();

router.post('/generate', (req, res) => {
  generateFakeData();
  res.redirect('/classes');
});

module.exports = router;
