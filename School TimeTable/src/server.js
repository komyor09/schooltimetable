const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const cookieParser = require('cookie-parser');
const path = require('node:path');

const { i18nMiddleware, SUPPORTED_LANGS } = require('./i18n');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(i18nMiddleware);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/lang/:lang', (req, res) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : 'ru';
  res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  res.redirect(req.get('referer') || '/');
});

app.get('/', (req, res) => {
  res.render('home');
});

app.use('/classes', require('./routes/classes'));
app.use('/teachers', require('./routes/teachers'));
app.use('/subjects', require('./routes/subjects'));
app.use('/rooms', require('./routes/rooms'));
app.use('/curriculum', require('./routes/curriculum'));
app.use('/subgroups', require('./routes/subgroups'));
app.use('/lesson-times', require('./routes/lessonTimes'));
app.use('/schedule', require('./routes/schedule'));
app.use('/public-view', require('./routes/publicView'));
app.use('/tv', require('./routes/tv'));
app.use('/print', require('./routes/print'));

app.use((req, res) => {
  res.status(404).render('404', { layout: 'layout' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Электронное расписание уроков — сервер запущен: http://localhost:${PORT}`);
});
