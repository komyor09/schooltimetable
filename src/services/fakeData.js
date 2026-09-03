const db = require('../db');

const SUBJECTS = [
  'Математика', 'Русский язык', 'Таджикский язык', 'Английский язык',
  'Физика', 'Химия', 'Биология', 'История', 'География', 'Физкультура', 'Информатика',
];

const ROOMS = ['101', '102', '103', '104', '201', '202', 'Спортзал'];

const FIRST_NAMES = ['Алишер', 'Фарида', 'Дилшод', 'Нигина', 'Рустам', 'Зарина', 'Хуршед', 'Мадина', 'Собир', 'Гулнора', 'Пётр', 'Анна', 'Игорь', 'Оксана', 'Умед', 'Шахноза'];
const LAST_NAMES = ['Каримов', 'Раҷабова', 'Сафаров', 'Юсупова', 'Назаров', 'Холова', 'Расулов', 'Ахмедова', 'Турсунов', 'Саидова', 'Иванов', 'Смирнова'];

function pick(arr, i) {
  return arr[i % arr.length];
}

function clearAll() {
  db.exec('DELETE FROM lessons');
  db.exec('DELETE FROM schedule_versions');
  db.exec('DELETE FROM class_subject_config');
  db.exec('DELETE FROM curriculum');
  db.exec('DELETE FROM teacher_busy_days');
  db.exec('DELETE FROM teacher_subjects');
  db.exec('DELETE FROM class_day_grid');
  db.exec('DELETE FROM teachers');
  db.exec('DELETE FROM classes');
  db.exec('DELETE FROM subjects');
  db.exec('DELETE FROM rooms');
}

function generateFakeData() {
  clearAll();

  const insSubject = db.prepare('INSERT INTO subjects (name) VALUES (?)');
  const subjectIds = {};
  SUBJECTS.forEach((name) => {
    subjectIds[name] = Number(insSubject.run(name).lastInsertRowid);
  });

  const insRoom = db.prepare('INSERT INTO rooms (name) VALUES (?)');
  ROOMS.forEach((name) => insRoom.run(name));

  const insClass = db.prepare('INSERT INTO classes (name, parallel, shift) VALUES (?, ?, ?)');
  const insGrid = db.prepare('INSERT INTO class_day_grid (class_id, day_of_week, lessons_count) VALUES (?, ?, ?)');

  const parallels = ['5', '6', '7', '8', '9', '10', '11'];
  const letters = ['А', 'Б', 'В'];
  const classesByParallel = {};

  parallels.forEach((parallel, pIdx) => {
    const classCount = 2 + (pIdx % 2); // 2 or 3 classes per parallel
    classesByParallel[parallel] = [];
    for (let c = 0; c < classCount; c++) {
      const name = `${parallel}${letters[c]}`;
      const shift = pIdx % 2 === 0 ? 1 : 2;
      const classId = Number(insClass.run(name, parallel, shift).lastInsertRowid);
      classesByParallel[parallel].push({ id: classId, name, parallel, shift });

      const lessonsPerDay = 5 + (Number(parallel) >= 9 ? 1 : 0);
      for (let day = 1; day <= 5; day++) {
        insGrid.run(classId, day, lessonsPerDay);
      }
    }
  });

  const insTeacher = db.prepare('INSERT INTO teachers (full_name, methodical_day) VALUES (?, ?)');
  const insTeacherSubject = db.prepare('INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)');
  const insBusyDay = db.prepare('INSERT INTO teacher_busy_days (teacher_id, day_of_week) VALUES (?, ?)');

  // Core subjects carry the heaviest weekly load across every class, so they need a
  // deeper teacher pool to avoid pileups when many classes need the same slot.
  const CORE_SUBJECTS = new Set(['Математика', 'Русский язык', 'Таджикский язык', 'Английский язык']);

  const teachersBySubject = {};
  let nameCursor = 0;
  SUBJECTS.forEach((subjectName, sIdx) => {
    const teacherCount = CORE_SUBJECTS.has(subjectName) ? 6 : 4;
    teachersBySubject[subjectName] = [];
    for (let t = 0; t < teacherCount; t++) {
      const fullName = `${pick(LAST_NAMES, nameCursor)} ${pick(FIRST_NAMES, nameCursor)[0]}.${pick(FIRST_NAMES, nameCursor + 3)[0]}.`;
      nameCursor++;
      const methodicalDay = ((sIdx + t) % 6) + 1;
      const teacherId = Number(insTeacher.run(fullName, methodicalDay).lastInsertRowid);
      insTeacherSubject.run(teacherId, subjectIds[subjectName]);
      if (t === 0) insBusyDay.run(teacherId, ((sIdx + 3) % 6) + 1);
      teachersBySubject[subjectName].push(teacherId);
    }
  });

  const insCurriculum = db.prepare('INSERT INTO curriculum (parallel, subject_id, lessons_per_week) VALUES (?, ?, ?)');
  const basePlan = {
    'Математика': 5, 'Русский язык': 3, 'Таджикский язык': 3, 'Английский язык': 3,
    'Физика': 2, 'Химия': 2, 'Биология': 2, 'История': 2, 'География': 2,
    'Физкультура': 2, 'Информатика': 1,
  };
  parallels.forEach((parallel) => {
    SUBJECTS.forEach((subjectName) => {
      const count = basePlan[subjectName];
      if (Number(parallel) < 7 && ['Химия', 'Физика', 'Информатика'].includes(subjectName)) return;
      insCurriculum.run(parallel, subjectIds[subjectName], count);
    });
  });

  const insSubgroup = db.prepare(
    'INSERT INTO class_subject_config (class_id, subject_id, is_subgroup) VALUES (?, ?, 1)'
  );
  Object.values(classesByParallel).forEach((classes) => {
    if (classes[0]) insSubgroup.run(classes[0].id, subjectIds['Английский язык']);
  });

  const classCount = Object.values(classesByParallel).flat().length;
  const teacherCount = Object.values(teachersBySubject).flat().length;
  return { classCount, teacherCount, subjectCount: SUBJECTS.length, roomCount: ROOMS.length };
}

module.exports = { generateFakeData };
