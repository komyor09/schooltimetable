-- Электронное расписание уроков — схема БД (SQLite)
-- Дни недели: 1=понедельник .. 7=воскресенье (ISO-8601)

CREATE TABLE IF NOT EXISTS subjects (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS rooms (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS classes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  parallel  TEXT NOT NULL,
  shift     INTEGER NOT NULL CHECK (shift IN (1, 2))
);

CREATE TABLE IF NOT EXISTS class_day_grid (
  class_id       INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  day_of_week    INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  lessons_count  INTEGER NOT NULL CHECK (lessons_count > 0),
  PRIMARY KEY (class_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS teachers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name       TEXT NOT NULL,
  methodical_day  INTEGER CHECK (methodical_day BETWEEN 1 AND 7)
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  teacher_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, subject_id)
);

CREATE TABLE IF NOT EXISTS teacher_busy_days (
  teacher_id   INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  PRIMARY KEY (teacher_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS curriculum (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  parallel          TEXT NOT NULL,
  subject_id        INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  lessons_per_week  INTEGER NOT NULL CHECK (lessons_per_week > 0),
  UNIQUE (parallel, subject_id)
);

CREATE TABLE IF NOT EXISTS class_subject_config (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  is_subgroup INTEGER NOT NULL DEFAULT 0,
  UNIQUE (class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS lesson_time_slots (
  shift          INTEGER NOT NULL CHECK (shift IN (1, 2)),
  lesson_number  INTEGER NOT NULL CHECK (lesson_number > 0),
  start_time     TEXT NOT NULL,
  end_time       TEXT NOT NULL,
  PRIMARY KEY (shift, lesson_number)
);

CREATE TABLE IF NOT EXISTS schedule_versions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  status        TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  published_at  TEXT
);

CREATE TABLE IF NOT EXISTS lessons (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id     INTEGER NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
  class_id       INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  day_of_week    INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  lesson_number  INTEGER NOT NULL CHECK (lesson_number > 0),
  subject_id     INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id     INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  room_id        INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  subgroup_slot  INTEGER CHECK (subgroup_slot IN (1, 2)),
  UNIQUE (version_id, class_id, day_of_week, lesson_number, subgroup_slot)
);

CREATE INDEX IF NOT EXISTS idx_lessons_version ON lessons(version_id);
CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons(version_id, teacher_id, day_of_week, lesson_number);
CREATE INDEX IF NOT EXISTS idx_lessons_class ON lessons(version_id, class_id);
