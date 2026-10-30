const initSqlJs = require('sql.js');
const fs = require('fs');

(async () => {
  try {
    const SQL = await initSqlJs();
    const dbPath = 'C:\\Users\\iRuStrato27_1235U_W\\AppData\\Roaming\\zapfit\\straveflow.db';
    if (!fs.existsSync(dbPath)) {
      console.error('DB not found at', dbPath);
      process.exit(1);
    }
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);
    const info = db.exec("PRAGMA table_info('sleep_data');");
    if (!info || info.length === 0 || !info[0].values) {
      console.log('sleep_data table missing; nothing to migrate');
    } else {
      const cols = info[0].values.map(r => r[1]);
      const need = [];
      if (!cols.includes('start_time')) need.push("ALTER TABLE sleep_data ADD COLUMN start_time TEXT;");
      if (!cols.includes('end_time')) need.push("ALTER TABLE sleep_data ADD COLUMN end_time TEXT;");
      if (!cols.includes('created_at')) need.push("ALTER TABLE sleep_data ADD COLUMN created_at TEXT DEFAULT (datetime('now'));");
      if (need.length === 0) {
        console.log('No migration needed; columns already present.');
      } else {
        console.log('Applying migrations:', need.length);
        for (const sql of need) {
          try {
            db.run(sql);
            console.log('Ran:', sql);
          } catch (err) {
            console.error('Failed to run:', sql, err.message || err);
          }
        }
        const out = db.export();
        fs.writeFileSync(dbPath, Buffer.from(out));
        console.log('Migration applied and DB saved.');
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
})();
