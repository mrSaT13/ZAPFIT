// Скрипт миграции: вынести points из activities.points (JSON) в отдельную таблицу activity_points
// Запуск: установить переменную окружения STRAVEFLOW_DB с полным путём к БД, или скрипт попытается найти БД в %APPDATA%/straveflow/straveflow.db

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function findDefaultDb() {
  const appData = process.env.APPDATA || (process.env.HOME ? path.join(process.env.HOME, 'AppData', 'Roaming') : null);
  if (!appData) return null;
  const candidate = path.join(appData, 'straveflow', 'straveflow.db');
  return candidate;
}

const dbPath = process.env.STRAVEFLOW_DB || findDefaultDb();
if (!dbPath || !fs.existsSync(dbPath)) {
  console.error('Database not found. Set STRAVEFLOW_DB or ensure default path exists:', dbPath);
  process.exit(1);
}

console.log('Opening DB:', dbPath);
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS activity_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER,
  idx INTEGER,
  lat REAL,
  lon REAL,
  ele REAL,
  time TEXT,
  hr INTEGER,
  cadence INTEGER,
  speed REAL,
  meta TEXT
);
`);

const activities = db.prepare('SELECT id, points FROM activities WHERE points IS NOT NULL').all();
console.log('Found activities with points:', activities.length);

let total = 0;
const insert = db.prepare('INSERT INTO activity_points (activity_id, idx, lat, lon, ele, time, hr, cadence, speed, meta) VALUES (?,?,?,?,?,?,?,?,?,?)');
for (const a of activities) {
  try {
    const arr = JSON.parse(a.points);
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      insert.run(a.id, i, p.lat || null, p.lon || null, p.ele || null, p.time || null, p.hr || null, p.cadence || null, p.speed || null, JSON.stringify(p.extensions || null));
      total++;
    }
  } catch (e) {
    console.warn('Failed to parse points for activity', a.id, e.message);
  }
}

console.log('Inserted points rows:', total);
console.log('Migration complete.');
