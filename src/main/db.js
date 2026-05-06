const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Путь к базе данных в папке пользователя (AppData), чтобы не терять данные при обновлении кода
const dbPath = path.join(app.getPath('userData'), 'straveflow.db');

console.log('Database path:', dbPath);

const db = new Database(dbPath);

// Инициализация таблиц
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT DEFAULT 'Атлет',
        avatar_path TEXT,
        ftp INTEGER DEFAULT 200,
        weight INTEGER DEFAULT 75,
        birth_date TEXT,
        height REAL DEFAULT 180
    );
    
    CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        date TEXT,
        distance REAL, -- в километрах
        duration INTEGER, -- в секундах
        elevation_gain REAL, -- в метрах
        avg_power REAL,
        avg_hr INTEGER,
        max_hr INTEGER,
        avg_speed REAL,
        tss REAL,
        gpx_path TEXT,
        type TEXT DEFAULT 'Ride',
        points TEXT
    );

    CREATE TABLE IF NOT EXISTS training_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        strategy TEXT,
        goals TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    
    CREATE TABLE IF NOT EXISTS health_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        value REAL,
        date TEXT,
        note TEXT
    );
`);

// Миграция: проверка и добавление отсутствующих колонок в activities
const columns = db.prepare("PRAGMA table_info(activities)").all();
const columnNames = columns.map(c => c.name);

if (!columnNames.includes('avg_hr')) {
    db.exec("ALTER TABLE activities ADD COLUMN avg_hr INTEGER DEFAULT 0");
}
if (!columnNames.includes('max_hr')) {
    db.exec("ALTER TABLE activities ADD COLUMN max_hr INTEGER DEFAULT 0");
}
if (!columnNames.includes('avg_speed')) {
    db.exec("ALTER TABLE activities ADD COLUMN avg_speed REAL DEFAULT 0");
}
if (!columnNames.includes('avg_power')) {
    // На случай если каким-то чудом её нет
    db.exec("ALTER TABLE activities ADD COLUMN avg_power REAL DEFAULT 0");
}

// Добавляем новые колонки для метрик
if (!columnNames.includes('ctl')) {
    db.exec("ALTER TABLE activities ADD COLUMN ctl REAL DEFAULT 0");
}
if (!columnNames.includes('atl')) {
    db.exec("ALTER TABLE activities ADD COLUMN atl REAL DEFAULT 0");
}
if (!columnNames.includes('tsb')) {
    db.exec("ALTER TABLE activities ADD COLUMN tsb REAL DEFAULT 0");
}
// Ensure points column exists
if (!columnNames.includes('points')) {
    try { db.exec("ALTER TABLE activities ADD COLUMN points TEXT"); } catch (e) { }
}

// Ensure users table has height
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('height')) {
    try { db.exec("ALTER TABLE users ADD COLUMN height REAL DEFAULT 180"); } catch (e) { }
}
if (!userCols.includes('resting_hr')) {
    try { db.exec("ALTER TABLE users ADD COLUMN resting_hr INTEGER DEFAULT 60"); } catch (e) { }
}
if (!userCols.includes('max_hr')) {
    try { db.exec("ALTER TABLE users ADD COLUMN max_hr INTEGER DEFAULT 200"); } catch (e) { }
}

// Создаем дефолтного пользователя, если таблица пуста
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
    db.prepare('INSERT INTO users (name) VALUES (?)').run('Новый Атлет');
}

module.exports = db;