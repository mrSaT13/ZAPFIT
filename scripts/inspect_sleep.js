const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

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
    if (!info || info.length === 0 || !info[0].values || info[0].values.length === 0) {
      console.log('sleep_data table not found or empty');
      return;
    }
    const colsInfo = info[0].values.map(r => ({ cid: r[0], name: r[1] }));
    const cols = colsInfo.map(c => c.name);
    const selectCols = cols.join(', ');
    console.log('sleep_data columns:', selectCols);
    const q = `SELECT ${selectCols} FROM sleep_data ORDER BY created_at DESC LIMIT 50;`;
    const rowsRes = db.exec(q);
    if (!rowsRes || rowsRes.length === 0) {
      console.log('No rows');
      return;
    }
    const values = rowsRes[0].values;
    for (const row of values) {
      const obj = {};
      for (let i=0;i<cols.length;i++) obj[cols[i]] = row[i];
      console.log(obj);
    }
      // Also list dish_categories
      try {
        const cats = db.exec("SELECT category FROM dish_categories ORDER BY category;");
        if (cats && cats.length && cats[0].values.length) {
          console.log('\nDish categories:');
          for (const r of cats[0].values) console.log(r[0]);
        } else {
          console.log('\nNo dish_categories found');
        }
      } catch (err) {
        console.error('\nError querying dish_categories:', err.message || err);
      }
  } catch (err) {
    console.error('Error reading DB:', err);
  }
})();
