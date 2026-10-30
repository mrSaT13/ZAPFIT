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
    
    // Check tables
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
    console.log('Tables:', tables[0].values.map(v => v[0]).join(', '));
    
    // Check settings
    console.log('\n--- Settings ---');
    const settings = db.exec("SELECT key, value FROM settings;");
    if (settings && settings.length) {
      settings[0].values.forEach(v => console.log(`${v[0]}: ${v[1]}`));
    }
    
    // Check water
    console.log('\n--- Water Table ---');
    const water = db.exec("SELECT * FROM water;");
    if (water && water.length) {
        console.log('Columns:', water[0].columns.join(', '));
        water[0].values.forEach(v => console.log(v.join(' | ')));
    } else {
        console.log('No rows in water table');
    }

    // Check water_entries
    console.log('\n--- Water Entries Table ---');
    const waterEntries = db.exec("SELECT * FROM water_entries ORDER BY created_at DESC LIMIT 10;");
    if (waterEntries && waterEntries.length) {
        console.log('Columns:', waterEntries[0].columns.join(', '));
        waterEntries[0].values.forEach(v => console.log(v.join(' | ')));
    } else {
        console.log('No rows in water_entries table');
    }
    
    // Check water_history
    console.log('\n--- Water History Table ---');
    const waterHistory = db.exec("SELECT * FROM water_history;");
    if (waterHistory && waterHistory.length) {
        console.log('Columns:', waterHistory[0].columns.join(', '));
        waterHistory[0].values.forEach(v => console.log(v.join(' | ')));
    } else {
        console.log('No rows in water_history table');
    }

  } catch (err) {
    console.error('Error:', err);
  }
})();
