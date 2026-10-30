const Database = require('better-sqlite3');
const dbPath = 'C:\\Users\\iRuStrato27_1235U_W\\AppData\\Roaming\\straveflow\\straveflow.db';
console.log('DB Path:', dbPath);
try {
  const db = new Database(dbPath, { readonly: true });
  const cols = db.prepare("PRAGMA table_info(activities)").all();
  console.log('COLUMNS:');
  console.log(JSON.stringify(cols, null, 2));
  const sample = db.prepare("SELECT id, title, date, points FROM activities WHERE points IS NOT NULL LIMIT 1").get();
  console.log('SAMPLE_ROW:');
  console.log(JSON.stringify(sample, null, 2));
  db.close();
} catch (e) {
  console.error('ERROR:', e && e.message ? e.message : e);
  process.exit(1);
}