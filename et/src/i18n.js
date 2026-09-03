const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_LANGS = ['ru', 'tg'];
const DEFAULT_LANG = 'ru';

const dictionaries = {};
for (const lang of SUPPORTED_LANGS) {
  const file = path.join(__dirname, '..', 'locales', `${lang}.json`);
  dictionaries[lang] = JSON.parse(fs.readFileSync(file, 'utf8'));
}

function translate(lang, key, ...args) {
  const dict = dictionaries[lang] || dictionaries[DEFAULT_LANG];
  let str = dict[key] ?? dictionaries[DEFAULT_LANG][key] ?? key;
  for (const arg of args) {
    str = str.replace('%s', arg);
  }
  return str;
}

function i18nMiddleware(req, res, next) {
  let lang = req.cookies && req.cookies.lang;
  if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
  req.lang = lang;
  res.locals.lang = lang;
  res.locals.t = (key, ...args) => translate(lang, key, ...args);
  res.locals.SUPPORTED_LANGS = SUPPORTED_LANGS;
  next();
}

module.exports = { i18nMiddleware, SUPPORTED_LANGS, DEFAULT_LANG, translate };
