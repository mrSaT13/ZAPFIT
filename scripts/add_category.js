const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const name = process.argv[2] || 'ТестКатегория';
    const SQL = await initSqlJs();
    const dbPath = 'C:\\Users\\iRuStrato27_1235U_W\\AppData\\Roaming\\zapfit\\straveflow.db';
    if (!fs.existsSync(dbPath)) {
      console.error('DB not found at', dbPath);
      process.exit(1);
    }
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);
    try {
      db.run('INSERT OR IGNORE INTO dish_categories (category) VALUES (?);', [name]);
    } catch (err) {
      console.error('Insert error:', err.message || err);
    }
    const out = db.export();
    fs.writeFileSync(dbPath, Buffer.from(out));
    console.log('Inserted category:', name);
  } catch (err) {
    console.error('Error:', err);
  }
})();
