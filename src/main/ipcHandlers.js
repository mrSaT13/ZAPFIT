const { ipcMain, dialog, app } = require("electron");
const db = require("./db");
const { parseGPXFile } = require("./gpxParser");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");

function registerHandlers() {
    console.log('[ipcHandlers] registerHandlers called');
    
    // Migration: Update schema if needed
    try {
        db.prepare("ALTER TABLE users ADD COLUMN birth_date TEXT").run();
    } catch(e) { /* already exists */ }
    try {
        db.prepare("ALTER TABLE users ADD COLUMN height REAL DEFAULT 180").run();
    } catch(e) { /* already exists */ }
    try {
        db.prepare("ALTER TABLE users ADD COLUMN resting_hr INTEGER DEFAULT 60").run();
    } catch(e) { /* already exists */ }
    
    try {
        db.prepare("ALTER TABLE gears ADD COLUMN last_reset_distance REAL DEFAULT 0").run();
    } catch(e) { /* already exists */ }

    try {
        db.prepare("ALTER TABLE gears ADD COLUMN last_service_date TEXT").run();
    } catch(e) { /* already exists */ }

    try {
        db.prepare("ALTER TABLE activities ADD COLUMN gear_id INTEGER").run();
    } catch(e) { /* already exists */ }

    try {
        db.prepare("ALTER TABLE activities ADD COLUMN rpe INTEGER").run();
    } catch(e) { /* already exists */ }

    try {
        db.prepare("ALTER TABLE activities ADD COLUMN points TEXT").run();
    } catch(e) { /* already exists */ }

    db.prepare("CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, date TEXT, distance REAL, duration INTEGER, elevation_gain REAL, avg_power REAL, avg_hr INTEGER, max_hr INTEGER, avg_speed REAL, tss REAL, gpx_path TEXT, type TEXT DEFAULT 'RIDE', points TEXT, rpe INTEGER, gear_id INTEGER)").run();
    db.prepare("CREATE TABLE IF NOT EXISTS gears (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, brand TEXT, model TEXT, purchase_date TEXT, initial_distance REAL DEFAULT 0, current_distance REAL DEFAULT 0, last_service_date TEXT, notes TEXT, last_reset_distance REAL DEFAULT 0)").run();
        // Water history table
        db.prepare(`CREATE TABLE IF NOT EXISTS water_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            glasses INTEGER,
            liters REAL,
            created_at TEXT DEFAULT (datetime('now'))
        )`).run();
        // Training plan table (schedulers for future days)
        db.prepare(`CREATE TABLE IF NOT EXISTS training_plan (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            title TEXT,
            type TEXT,
            notes TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )`).run();
    // Новые колонки для расширённой модели снаряжения
    try { db.prepare("ALTER TABLE gears ADD COLUMN life_km REAL DEFAULT NULL").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE gears ADD COLUMN parts TEXT DEFAULT NULL").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE gears ADD COLUMN is_primary INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE gears ADD COLUMN icon TEXT DEFAULT NULL").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE gears ADD COLUMN wheel_size TEXT DEFAULT NULL").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE gears ADD COLUMN brake_type TEXT DEFAULT NULL").run(); } catch(e) {}
    
    // --- USER HANDLERS ---
    ipcMain.handle('get-user', async () => {
        return db.prepare('SELECT * FROM users LIMIT 1').get();
    });

    ipcMain.handle('save-user', async (event, userData) => {
        const existing = db.prepare('SELECT id FROM users LIMIT 1').get();
        if (existing) {
            db.prepare('UPDATE users SET name = ?, avatar_path = ?, ftp = ?, weight = ?, birth_date = ?, height = ?, resting_hr = ?, max_hr = ? WHERE id = ?')
                .run(userData.name, userData.avatar_path, userData.ftp, userData.weight, userData.birth_date, userData.height, userData.resting_hr || 60, userData.max_hr || 200, existing.id);
            return { ...userData, id: existing.id };
        } else {
            const info = db.prepare('INSERT INTO users (name, avatar_path, ftp, weight, birth_date, height, resting_hr, max_hr) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                .run(userData.name, userData.avatar_path, userData.ftp, userData.weight, userData.birth_date, userData.height || 180, userData.resting_hr || 60, userData.max_hr || 200);
            return { ...userData, id: info.lastInsertRowid };
        }
    });

    ipcMain.handle("import-gpx", async () => {
        const res = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Activity Files", extensions: ["gpx","tcx"] }] });
        if (res.canceled) return null;
        const dest = path.join(app.getPath("userData"), "gpx_files", Date.now() + "_" + path.basename(res.filePaths[0]));
        if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(res.filePaths[0], dest);
        try {
            const data = await parseGPXFile(dest);
            const userObj = db.prepare("SELECT ftp, max_hr, resting_hr FROM users LIMIT 1").get();
            const ftp = userObj?.ftp || 200;
            const maxHr = userObj?.max_hr || 200;
            const restingHr = userObj?.resting_hr || 60;
            
            // Расчёт TSS: используем мощность, если есть; иначе пульс
            let tss = 0;
            if (data.avg_power > 0) {
                // Велосипед: (Duration(сек) × Avg_Power) / (FTP × 3600) × 100
                tss = (data.duration * data.avg_power) / (ftp * 3600) * 100;
            } else if (data.avg_hr > 0) {
                // Бег/плавание: Duration(часы) × (avg_HR - resting_HR) / (max_HR - resting_HR) × 100
                const durationHours = data.duration / 3600;
                const hrReserve = Math.max(1, maxHr - restingHr);
                tss = durationHours * ((data.avg_hr - restingHr) / hrReserve) * 100;
            }
            
            db.prepare(`
                INSERT INTO activities (title, date, distance, duration, elevation_gain, avg_power, avg_hr, max_hr, avg_speed, tss, gpx_path, points, type) 
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'RIDE')
            `).run(
                data.title, 
                data.date, 
                data.distance, 
                data.duration, 
                data.elevation_gain, 
                data.avg_power || 0, 
                data.avg_hr,
                data.max_hr,
                data.avg_speed,
                tss,
                dest,
                data.points
            );
            return { success: true };
        } catch (e) { 
            console.error("Import error:", e);
            if (e && e.message && e.message.includes('no column named points')) {
                try {
                    db.prepare("ALTER TABLE activities ADD COLUMN points TEXT").run();
                    const data = await parseGPXFile(dest);
                    const userObj = db.prepare("SELECT ftp, max_hr, resting_hr FROM users LIMIT 1").get();
                    const ftp = userObj?.ftp || 200;
                    const maxHr = userObj?.max_hr || 200;
                    const restingHr = userObj?.resting_hr || 60;
                    
                    let tss = 0;
                    if (data.avg_power > 0) {
                        tss = (data.duration * data.avg_power) / (ftp * 3600) * 100;
                    } else if (data.avg_hr > 0) {
                        const durationHours = data.duration / 3600;
                        const hrReserve = Math.max(1, maxHr - restingHr);
                        tss = durationHours * ((data.avg_hr - restingHr) / hrReserve) * 100;
                    }
                    
                    db.prepare(`
                        INSERT INTO activities (title, date, distance, duration, elevation_gain, avg_power, avg_hr, max_hr, avg_speed, tss, gpx_path, points, type) 
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'RIDE')
                    `).run(
                        data.title, data.date, data.distance, data.duration, data.elevation_gain, data.avg_power || 0, data.avg_hr, data.max_hr, data.avg_speed, tss, dest, data.points
                    );
                    return { success: true };
                } catch (e2) {
                    console.error('Retry insert failed:', e2);
                    return { success: false, error: e2.message };
                }
            }
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle("add-manual-activity", async (e, d) => {
        const userObj = db.prepare("SELECT ftp, max_hr, resting_hr FROM users LIMIT 1").get();
        const ftp = userObj?.ftp || 200;
        const maxHr = userObj?.max_hr || 200;
        const restingHr = userObj?.resting_hr || 60;
        
        const durationSec = d.duration || 0;
        const distanceM = d.distance || 0;
        const avgPower = d.avg_power || 0;
        const avgHr = d.avg_hr || 0;
        
        // Расчёт TSS: используем мощность, если есть; иначе пульс
        let tss = 0;
        if (avgPower > 0) {
            // Велосипед: (Duration(сек) × Avg_Power) / (FTP × 3600) × 100
            tss = (durationSec * avgPower) / (ftp * 3600) * 100;
        } else if (avgHr > 0) {
            // Бег/плавание: Duration(часы) × (avg_HR - resting_HR) / (max_HR - resting_HR) × 100
            const durationHours = durationSec / 3600;
            const hrReserve = Math.max(1, maxHr - restingHr);
            tss = durationHours * ((avgHr - restingHr) / hrReserve) * 100;
        }
        
        const avgSpeedKmH = durationSec > 0 ? (distanceM / durationSec) * 3.6 : 0;

        db.prepare("INSERT INTO activities (title, date, distance, duration, elevation_gain, avg_power, avg_hr, avg_speed, tss, gpx_path, type) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
            d.title, 
            d.date, 
            distanceM / 1000, 
            durationSec, 
            d.elevation_gain || 0, 
            avgPower, 
            avgHr, 
            parseFloat(avgSpeedKmH.toFixed(1)), 
            tss, 
            "manual", 
            d.type
        );
        return { success: true };
    });

    ipcMain.handle("get-rides", () => db.prepare("SELECT * FROM activities ORDER BY date DESC").all());
    ipcMain.handle("get-activities", () => db.prepare("SELECT * FROM activities ORDER BY date DESC").all());
    ipcMain.handle("delete-ride", (e, id) => { db.prepare("DELETE FROM activities WHERE id = ?").run(id); return { success: true }; });
    ipcMain.handle("update-ride", (e, id, data) => {
        db.prepare("UPDATE activities SET title = ?, type = ? WHERE id = ?").run(data.title, data.type, id);
        return { success: true };
    });
    
    ipcMain.handle("get-settings", () => {
        const rows = db.prepare("SELECT * FROM settings").all();
        const s = {}; rows.forEach(r => s[r.key] = r.value); return s;
    });
    ipcMain.handle("update-setting", (e, k, v) => db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)").run(k, v));

    // Water endpoints
    ipcMain.handle('get-water-history', () => {
        try { return db.prepare('SELECT * FROM water_history ORDER BY date DESC').all(); } catch (e) { console.error('get-water-history', e); return []; }
    });
    ipcMain.handle('add-water-day', (e, date, glasses, liters) => {
        try {
            const res = db.prepare('INSERT INTO water_history (date, glasses, liters) VALUES (?,?,?)').run(date, glasses, liters);
            return { success: true, id: res.lastInsertRowid };
        } catch (err) { console.error('add-water-day', err); return { success: false, error: err.message }; }
    });

    // Daily reset logic extracted so it can be reused from other places
    async function dailyResetNow() {
        try {
            const rows = db.prepare("SELECT * FROM settings").all();
            const s = {}; rows.forEach(r => s[r.key] = r.value);
            const lastReset = s.lastWaterResetDate || null;
            const today = new Date().toISOString().split('T')[0];
            let current = parseInt(s.waterCount || '0') || 0;
            if (lastReset !== today) {
                // archive previous day's count
                if (current > 0) {
                    const liters = +(current * 0.25).toFixed(2); // assuming 250ml per glass
                    db.prepare('INSERT INTO water_history (date, glasses, liters) VALUES (?,?,?)').run(lastReset || today, current, liters);
                }
                // reset
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('waterCount', '0');
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('lastWaterResetDate', today);
                return { reset: true, waterCount: 0 };
            }
            return { reset: false, waterCount: current };
        } catch (err) { console.error('daily-reset-water', err); return { success: false, error: err.message }; }
    }

    // expose handler that uses the reusable function
    ipcMain.handle('daily-reset-water', async () => dailyResetNow());

    // Recommended water (simple rule: 35 ml per kg)
    ipcMain.handle('get-recommended-water', () => {
        try {
            const user = db.prepare('SELECT weight FROM users LIMIT 1').get() || {};
            const weight = parseFloat(user.weight) || 75;
            const liters = +(weight * 0.035).toFixed(2);
            return { success: true, liters };
        } catch (err) { console.error('get-recommended-water', err); return { success: false, error: err.message }; }
    });

    // Training plan handlers
    ipcMain.handle('save-training-plan', (e, plan) => {
        try {
            if (!plan.id) {
                const res = db.prepare('INSERT INTO training_plan (date, title, type, notes, created_by) VALUES (?,?,?,?,?)').run(plan.date, plan.title, plan.type || null, plan.notes || null, plan.created_by || 'local');
                return { success: true, id: res.lastInsertRowid };
            } else {
                const keys = ['date','title','type','notes'];
                const updates = keys.filter(k => plan[k] !== undefined).map(k => `${k} = ?`).join(', ');
                const vals = keys.filter(k => plan[k] !== undefined).map(k => plan[k]);
                vals.push(plan.id);
                db.prepare(`UPDATE training_plan SET ${updates} WHERE id = ?`).run(...vals);
                return { success: true };
            }
        } catch (err) { console.error('save-training-plan', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('get-training-plan', (e, opts = {}) => {
        try {
            if (opts.from) {
                return db.prepare('SELECT * FROM training_plan WHERE date >= ? ORDER BY date ASC').all(opts.from);
            }
            return db.prepare('SELECT * FROM training_plan ORDER BY date ASC').all();
        } catch (err) { console.error('get-training-plan', err); return []; }
    });

    // GEAR & ML ANALYTICS
    ipcMain.handle("get-gears", async () => {
        return db.prepare("SELECT * FROM gears").all();
    });

    ipcMain.handle("add-gear", (e, g) => {
        const res = db.prepare("INSERT INTO gears (name, type, brand, model, purchase_date, initial_distance, current_distance, life_km, parts, icon, wheel_size, brake_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
                 .run(g.name, g.type, g.brand, g.model, g.purchase_date, g.initial_distance, g.initial_distance, g.life_km || null, g.parts || null, g.icon || null, g.wheel_size || null, g.brake_type || null);
        return { success: true, id: res.lastInsertRowid };
    });

    ipcMain.handle("reset-gear", (e, id) => {
        const gear = db.prepare("SELECT * FROM gears WHERE id = ?").get(id);
        const stats = db.prepare("SELECT SUM(distance) as total FROM activities WHERE (type = ? OR gear_id = ?)").get(gear.type === 'Велосипед' ? 'RIDE' : gear.type, id);
        const currentTotal = (gear.initial_distance || 0) + (stats.total || 0);
        db.prepare("UPDATE gears SET last_reset_distance = ?, last_service_date = ? WHERE id = ?").run(currentTotal, new Date().toISOString(), id);
        return { success: true };
    });

    ipcMain.handle("get-gear-analytics", async () => {
        const gears = db.prepare("SELECT * FROM gears").all();
        const activities = db.prepare("SELECT distance, date, type, gear_id FROM activities WHERE date > date('now', '-30 days')").all();
        
        return gears.map(g => {
            const statsAll = db.prepare("SELECT SUM(distance) as total FROM activities WHERE (type = ? OR gear_id = ?)").get(g.type === 'Велосипед' ? 'RIDE' : g.type, g.id);
            const totalAbs = (g.initial_distance || 0) + (statsAll.total || 0);
            const currentWear = totalAbs - (g.last_reset_distance || 0);
            
            const recentStats = activities.filter(a => (g.type === 'Велосипед' ? a.type === 'RIDE' : a.type === g.type) || a.gear_id === g.id);
            const totalRecent = recentStats.reduce((s, a) => s + (a.distance || 0), 0);
            const dailyAvg = totalRecent / 30;

            const limit = g.life_km || (g.type === 'Цепь' ? 2000 : g.type === 'Кроссовки' ? 800 : 5000);
            const remaining = Math.max(0, limit - currentWear);
            const daysToService = dailyAvg > 0 ? Math.round(remaining / dailyAvg) : null;
            
            const serviceDate = new Date();
            if (daysToService !== null) serviceDate.setDate(serviceDate.getDate() + daysToService);

            return {
                ...g,
                current_distance: currentWear,
                total_life_distance: totalAbs,
                daysToService: daysToService,
                predictedServiceDate: daysToService !== null ? serviceDate.toISOString().split('T')[0] : null
            };
        });
    });

    // Обновление свойств gear (life_km, parts, is_primary)
    ipcMain.handle('update-gear', (e, id, updates) => {
        const allowed = ['name','type','brand','model','purchase_date','initial_distance','current_distance','last_service_date','notes','life_km','parts','is_primary'];
        const keys = Object.keys(updates).filter(k=>allowed.includes(k));
        if (!keys.length) return { success: false, error: 'No valid fields' };
        // If setting is_primary, unset others
        if (updates.is_primary && Number(updates.is_primary) === 1) {
            try { db.prepare('UPDATE gears SET is_primary = 0 WHERE id != ?').run(id); } catch(e) {}
        }
        const setExpr = keys.map(k=>`${k} = ?`).join(', ');
        const vals = keys.map(k=>updates[k]);
        vals.push(id);
        db.prepare(`UPDATE gears SET ${setExpr} WHERE id = ?`).run(...vals);
        return { success: true };
    });

    // Привязать активности данного типа к gear_id (например, пометить все RIDE как привязанные к велосипеду)
    ipcMain.handle('assign-gear-to-activities', (e, gearId) => {
        try {
            const gear = db.prepare('SELECT * FROM gears WHERE id = ?').get(gearId);
            if (!gear) return { success: false, error: 'Gear not found' };
            const type = gear.type === 'Велосипед' ? 'RIDE' : gear.type;
            const res = db.prepare('UPDATE activities SET gear_id = ? WHERE (type = ? OR gear_id IS NULL OR gear_id = 0)').run(gearId, type);
            return { success: true, changes: res.changes };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle("delete-gear", (e, id) => {
        db.prepare("DELETE FROM gears WHERE id = ?").run(id);
        return { success: true };
    });

    // Простая заглушка для тренировки ML: сохраняем профиль/фичи в settings
    ipcMain.handle('train-ml', (e, payload) => {
        try {
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)").run('ml_profile', JSON.stringify(payload));
            return { success: true };
        } catch (err) {
            console.error('ML train error', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-fitness-form', () => {
        try {
            // Получаем все активности отсортированные по дате
            const acts = db.prepare("SELECT tss, date FROM activities WHERE tss > 0 ORDER BY date ASC").all();
            
            if (acts.length === 0) {
                return { ctl: 0, atl: 0, tsb: 0, recommendation: "Нет данных для анализа." };
            }
            
            // Группируем активности по дням и суммируем TSS
            const dayMap = {};
            const firstDate = new Date(acts[0].date);
            const todayDate = new Date();
            
            acts.forEach(activity => {
                const dateStr = activity.date.split('T')[0]; // Берем только дату
                dayMap[dateStr] = (dayMap[dateStr] || 0) + (activity.tss || 0);
            });
            
            let ctl = 0, atl = 0;
            let currentDate = new Date(firstDate);
            
            // Итерируем день за днём с правильными коэффициентами
            // CTL: 42-дневный период (1/42 ≈ 0.0238)
            // ATL: 7-дневный период (1/7 ≈ 0.1429)
            while (currentDate <= todayDate) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dailyTss = dayMap[dateStr] || 0;
                
                // Формула экспоненциального затухания:
                // value_new = value_old + (tss - value_old) / period
                ctl = ctl + (dailyTss - ctl) / 42;
                atl = atl + (dailyTss - atl) / 7;
                
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            const tsb = ctl - atl;
            
            // Рекомендации на основе TSB
            let rec;
            if (tsb < -30) {
                rec = "⚠️ Перетренированность! Рекомендуется отдых.";
            } else if (tsb < -10) {
                rec = "💪 Нормальная тренировочная зона.";
            } else if (tsb <= 5) {
                rec = "⚡ Хорошее состояние.";
            } else if (tsb <= 15) {
                rec = "✨ Пик формы! Идеальное время для рекорда!";
            } else {
                rec = "😴 Потеря формы - нужно возвращаться к тренировкам.";
            }
            
            return { ctl: ctl.toFixed(1), atl: atl.toFixed(1), tsb: tsb.toFixed(1), recommendation: rec };
        } catch(e) {
            console.error('get-fitness-form error:', e);
            return { ctl: 0, atl: 0, tsb: 0, recommendation: "Ошибка при расчёте." };
        }
    });

    // Получение истории CTL/ATL/TSB по дням для графика
    ipcMain.handle('get-fitness-history', () => {
        try {
            const acts = db.prepare("SELECT tss, date FROM activities WHERE tss > 0 ORDER BY date ASC").all();
            
            if (acts.length === 0) {
                return [];
            }
            
            // Группируем активности по дням
            const dayMap = {};
            const firstDate = new Date(acts[0].date);
            const todayDate = new Date();
            
            acts.forEach(activity => {
                const dateStr = activity.date.split('T')[0];
                dayMap[dateStr] = (dayMap[dateStr] || 0) + (activity.tss || 0);
            });
            
            let ctl = 0, atl = 0;
            let currentDate = new Date(firstDate);
            const history = [];
            
            // Итерируем день за днём
            while (currentDate <= todayDate) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dailyTss = dayMap[dateStr] || 0;
                
                ctl = ctl + (dailyTss - ctl) / 42;
                atl = atl + (dailyTss - atl) / 7;
                const tsb = ctl - atl;
                
                // Добавляем данные в историю (но только если есть изменения или это важный день)
                // Для оптимизации, добавляем только дни с активностями + каждый 7-й день
                const dayOfWeek = currentDate.getDay();
                if (dailyTss > 0 || dayOfWeek === 0 || history.length === 0 || 
                    (history.length > 0 && new Date(history[history.length - 1].date).getTime() + 7 * 24 * 60 * 60 * 1000 <= currentDate.getTime())) {
                    history.push({
                        date: dateStr,
                        ctl: parseFloat(ctl.toFixed(1)),
                        atl: parseFloat(atl.toFixed(1)),
                        tsb: parseFloat(tsb.toFixed(1)),
                        tss: dailyTss
                    });
                }
                
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            return history;
        } catch(e) {
            console.error('get-fitness-history error:', e);
            return [];
        }
    });

    // Расширенные метрики: RampRate, Response Index, Прогноз на 7 дней
    ipcMain.handle('get-advanced-metrics', () => {
        try {
            const acts = db.prepare("SELECT tss, date FROM activities WHERE tss > 0 ORDER BY date ASC").all();
            
            if (acts.length < 7) {
                return { rampRate: 0, responseIndex: 0, forecast: [] };
            }
            
            // Группируем активности по дням
            const dayMap = {};
            const firstDate = new Date(acts[0].date);
            const todayDate = new Date();
            const sevenDaysAgo = new Date(todayDate);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            acts.forEach(activity => {
                const dateStr = activity.date.split('T')[0];
                dayMap[dateStr] = (dayMap[dateStr] || 0) + (activity.tss || 0);
            });
            
            let ctl = 0, atl = 0;
            let ctl7daysAgo = 0, atl7daysAgo = 0;
            let currentDate = new Date(firstDate);
            
            // Итерируем день за днём
            while (currentDate <= todayDate) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dailyTss = dayMap[dateStr] || 0;
                
                ctl = ctl + (dailyTss - ctl) / 42;
                atl = atl + (dailyTss - atl) / 7;
                
                // Запоминаем значения 7 дней назад
                if (currentDate.getTime() === sevenDaysAgo.getTime()) {
                    ctl7daysAgo = ctl;
                    atl7daysAgo = atl;
                }
                
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            // RampRate: скорость изменения CTL за 7 дней (units per day)
            const rampRate = (ctl - ctl7daysAgo) / 7;
            
            // Response Index: чувствительность к нагрузкам
            // Обычно это ATL/CTL ratio, но более полезно как (Change in ATL) / (Change in CTL)
            const ctlChange = ctl - ctl7daysAgo;
            const atlChange = atl - atl7daysAgo;
            const responseIndex = ctlChange !== 0 ? (atlChange / ctlChange) : 0;
            
            // Прогноз на 7 дней: продолжаем тренд RampRate
            const forecast = [];
            let forecastCtl = ctl;
            let forecastAtl = atl;
            const avgTss7days = (Object.values(dayMap).slice(-7).reduce((a,b) => a+b, 0) / 7) || 0;
            
            for (let i = 1; i <= 7; i++) {
                const futureDate = new Date(todayDate);
                futureDate.setDate(futureDate.getDate() + i);
                const dateStr = futureDate.toISOString().split('T')[0];
                
                // Предполагаем среднее TSS за последние 7 дней
                forecastCtl = forecastCtl + (avgTss7days - forecastCtl) / 42;
                forecastAtl = Math.max(0, forecastAtl - (forecastAtl * 0.15)); // ATL спадает быстрее при отсутствии нагрузок
                
                forecast.push({
                    date: dateStr,
                    ctl: parseFloat(forecastCtl.toFixed(1)),
                    atl: parseFloat(forecastAtl.toFixed(1)),
                    tsb: parseFloat((forecastCtl - forecastAtl).toFixed(1))
                });
            }
            
            return {
                rampRate: parseFloat(rampRate.toFixed(2)),
                responseIndex: parseFloat(responseIndex.toFixed(2)),
                forecast: forecast
            };
        } catch(e) {
            console.error('get-advanced-metrics error:', e);
            return { rampRate: 0, responseIndex: 0, forecast: [] };
        }
    });

    // Экспорт отчетов в CSV и текстовый формат
    ipcMain.handle('export-report', async (event, options) => {
        try {
            const { format, type } = options || { format: 'csv', type: 'comprehensive' };
            
            const user = db.prepare('SELECT * FROM users LIMIT 1').get();
            const activities = db.prepare('SELECT * FROM activities ORDER BY date DESC').all();
            const fitness = db.prepare("SELECT tss, date FROM activities WHERE tss > 0 ORDER BY date ASC").all();
            
            // Расчет фитнес-метрик
            let ctl = 0, atl = 0;
            const dayMap = {};
            fitness.forEach(a => {
                const dateStr = a.date.split('T')[0];
                dayMap[dateStr] = (dayMap[dateStr] || 0) + (a.tss || 0);
            });
            Object.values(dayMap).forEach(tss => {
                ctl = ctl + (tss - ctl) / 42;
                atl = atl + (tss - atl) / 7;
            });
            
            const timestamp = new Date().toISOString().split('T')[0];
            let filename, content;
            
            if (format === 'excel' || format === 'csv') {
                // CSV формат
                filename = `StraveFlow_${type}_${timestamp}.csv`;
                
                if (type === 'comprehensive') {
                    content = 'Атлет,FTP,Вес,Рост\n';
                    content += `${user?.name || 'N/A'},${user?.ftp || 200},${user?.weight || 0},${user?.height || 0}\n\n`;
                    content += 'Дата,Название,Тип,Расстояние,Длительность,Средняя мощность,Средний пульс,TSS,Набор высоты\n';
                    activities.forEach(a => {
                        content += `${a.date},${a.title || ''},${a.type || ''},${a.distance || 0},${a.duration || 0},${a.avg_power || 0},${a.avg_hr || 0},${a.tss || 0},${a.elevation_gain || 0}\n`;
                    });
                } else if (type === 'fitness') {
                    content = 'Фитнес метрики\n';
                    content += `CTL (Форма),${ctl.toFixed(1)}\n`;
                    content += `ATL (Усталость),${atl.toFixed(1)}\n`;
                    content += `TSB (Баланс),${(ctl - atl).toFixed(1)}\n\n`;
                    content += 'Последние активности (TSS)\n';
                    content += 'Дата,TSS\n';
                    activities.slice(0, 30).forEach(a => {
                        if (a.tss > 0) content += `${a.date},${a.tss.toFixed(1)}\n`;
                    });
                } else if (type === 'monthly') {
                    content = 'Месячная статистика\n';
                    const monthlyStats = {};
                    activities.forEach(a => {
                        const month = a.date.slice(0, 7);
                        if (!monthlyStats[month]) monthlyStats[month] = { count: 0, distance: 0, tss: 0, time: 0 };
                        monthlyStats[month].count++;
                        monthlyStats[month].distance += a.distance || 0;
                        monthlyStats[month].tss += a.tss || 0;
                        monthlyStats[month].time += a.duration || 0;
                    });
                    content += 'Месяц,Активности,Расстояние,TSS,Часов\n';
                    Object.entries(monthlyStats).reverse().forEach(([month, stats]) => {
                        content += `${month},${stats.count},${stats.distance.toFixed(1)},${stats.tss.toFixed(1)},${(stats.time / 3600).toFixed(1)}\n`;
                    });
                } else if (type === 'data') {
                    content = 'ID,Дата,Название,Тип,Расстояние,Длительность,Мощность,ЧСС,Макс ЧСС,Скорость,TSS,Набор высоты\n';
                    activities.forEach(a => {
                        content += `${a.id},${a.date},${a.title || ''},${a.type || ''},${a.distance || 0},${a.duration || 0},${a.avg_power || 0},${a.avg_hr || 0},${a.max_hr || 0},${a.avg_speed || 0},${a.tss || 0},${a.elevation_gain || 0}\n`;
                    });
                }
            } else {
                // Текстовый формат (для PDF)
                filename = `StraveFlow_${type}_${timestamp}.txt`;
                content = `StraveFlow - Отчет ${timestamp}\n${'='.repeat(60)}\n\n`;
                content += `Атлет: ${user?.name || 'N/A'}\n`;
                content += `FTP: ${user?.ftp || 200}W | Вес: ${user?.weight || 0}кг | Рост: ${user?.height || 0}см\n\n`;
                
                if (type === 'fitness') {
                    content += `ФИТНЕС МЕТРИКИ\n${'-'.repeat(60)}\n`;
                    content += `CTL (Хроническая нагрузка): ${ctl.toFixed(1)}\n`;
                    content += `ATL (Острая нагрузка): ${atl.toFixed(1)}\n`;
                    content += `TSB (Баланс): ${(ctl - atl).toFixed(1)}\n\n`;
                } else {
                    content += `СТАТИСТИКА АКТИВНОСТЕЙ\n${'-'.repeat(60)}\n`;
                    const totalDist = activities.reduce((s, a) => s + (a.distance || 0), 0);
                    const totalTime = activities.reduce((s, a) => s + (a.duration || 0), 0) / 3600;
                    const totalTss = activities.reduce((s, a) => s + (a.tss || 0), 0);
                    content += `Всего активностей: ${activities.length}\n`;
                    content += `Общее расстояние: ${totalDist.toFixed(1)} км\n`;
                    content += `Общее время: ${totalTime.toFixed(1)} часов\n`;
                    content += `Общий TSS: ${totalTss.toFixed(1)}\n\n`;
                }
            }
            
            // Сохранение файла в папку Загрузки
            const downloadsPath = path.join(app.getPath('downloads'), filename);
            fs.writeFileSync(downloadsPath, content);
            
            return { success: true, path: downloadsPath };
        } catch(e) {
            console.error('export-report error:', e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-app-info', () => {
        return {
            name: "ZAPFIT",
            version: app.getVersion() || "1.0.0",
            description: "Ваш персональный центр спортивной аналитики и контроля износа снаряжения.",
            developer: "mrSaT13",
            homepage: "https://github.com/mrSaT13/",
            year: new Date().getFullYear()
        };
    });

    // Health metrics handlers — расширённая схема для сна/HRV/веса
    try {
        db.prepare(`CREATE TABLE IF NOT EXISTS health_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT 0,
            type TEXT,
            value REAL,
            start TEXT,
            end TEXT,
            hrv REAL,
            resting_hr REAL,
            source TEXT,
            note TEXT,
            date TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )`).run();
    } catch (e) { console.error('[ipcHandlers] create health_metrics table failed', e); }

    // Для старых БД добавляем отсутствующие колонки безопасно
    try { db.prepare("ALTER TABLE health_metrics ADD COLUMN start TEXT").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE health_metrics ADD COLUMN end TEXT").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE health_metrics ADD COLUMN hrv REAL").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE health_metrics ADD COLUMN resting_hr REAL").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE health_metrics ADD COLUMN source TEXT").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE health_metrics ADD COLUMN user_id INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE health_metrics ADD COLUMN created_at TEXT DEFAULT (datetime('now'))").run(); } catch(e) {}

    console.log('[ipcHandlers] registering health handlers');
    ipcMain.handle('get-health-metrics', (e, opts = {}) => {
        try {
            const limit = opts.limit || 100;
            const q = db.prepare('SELECT * FROM health_metrics ORDER BY date DESC LIMIT ?');
            return q.all(limit) || [];
        } catch (err) {
            console.error('[ipcHandlers] get-health-metrics error:', err);
            return [];
        }
    });

    ipcMain.handle('add-health-metric', (e, metric) => {
        const res = db.prepare('INSERT INTO health_metrics (user_id, type, value, start, end, hrv, resting_hr, source, note, date) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(metric.user_id || 0, metric.type, metric.value || null, metric.start || null, metric.end || null, metric.hrv || null, metric.resting_hr || null, metric.source || null, metric.note || null, metric.date || new Date().toISOString());
        return { success: true, id: res.lastInsertRowid };
    });

    ipcMain.handle('delete-health-metric', (e, id) => {
        try {
            console.log('[ipcHandlers] delete-health-metric', id);
            db.prepare('DELETE FROM health_metrics WHERE id = ?').run(id);
            return { success: true };
        } catch (err) { console.error('[ipcHandlers] delete-health-metric error', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('update-health-metric', (e, id, updates) => {
        try {
            const keys = Object.keys(updates);
            if (!keys.length) return { success: false, error: 'no fields' };
            const expr = keys.map(k=>`${k} = ?`).join(', ');
            const vals = keys.map(k=>updates[k]); vals.push(id);
            db.prepare(`UPDATE health_metrics SET ${expr} WHERE id = ?`).run(...vals);
            console.log('[ipcHandlers] update-health-metric', id, updates);
            return { success: true };
        } catch (err) { return { success: false, error: err.message }; }
    });

    // Простая предсказательная функция для снаряжения (rule-based)
    ipcMain.handle('predict-gear-service', (e, gearId) => {
        try {
            const g = db.prepare('SELECT * FROM gears WHERE id = ?').get(gearId);
            if (!g) return { success: false, error: 'not found' };
            const statsAll = db.prepare('SELECT SUM(distance) as total FROM activities WHERE (type = ? OR gear_id = ?)').get(g.type === 'Велосипед' ? 'RIDE' : g.type, g.id);
            const totalAbs = (g.initial_distance || 0) + (statsAll.total || 0);
            const currentWear = totalAbs - (g.last_reset_distance || 0);
            const life = g.life_km || (g.type === 'Цепь' ? 2000 : g.type === 'Кроссовки' ? 800 : 5000);
            const pct = Math.min(100, Math.round((currentWear / life) * 100));
            const alert = pct >= 90 ? 'Срочно заменить' : pct >= 70 ? 'Готовьтесь к замене' : 'Норма';
            return { success: true, pct, alert, life, currentWear };
        } catch (err) { return { success: false, error: err.message }; }
    });

    // Таблица для частей с историей замен
    try {
        db.prepare(`CREATE TABLE IF NOT EXISTS gear_parts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gear_id INTEGER,
            part_name TEXT,
            installed_at TEXT,
            installed_km REAL,
            removed_at TEXT,
            removed_km REAL,
            notes TEXT
        )`).run();
    } catch(e) { console.error('gear_parts create failed', e); }

    // Таблица для ML выборок по снаряжению
    try {
        db.prepare(`CREATE TABLE IF NOT EXISTS gear_ml_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gear_id INTEGER,
            sample_date TEXT,
            life_km REAL,
            current_wear REAL,
            daily_avg REAL,
            days_to_fail INTEGER
        )`).run();
    } catch(e) { console.error('gear_ml_samples create failed', e); }

    // Parts handlers
    ipcMain.handle('get-gear-parts', (e, gearId) => {
        return db.prepare('SELECT * FROM gear_parts WHERE gear_id = ? ORDER BY installed_at DESC').all(gearId);
    });

    ipcMain.handle('add-gear-part', (e, gearId, part) => {
        const res = db.prepare('INSERT INTO gear_parts (gear_id, part_name, installed_at, installed_km, notes) VALUES (?,?,?,?,?)')
            .run(gearId, part.part_name, part.installed_at || new Date().toISOString(), part.installed_km || 0, part.notes || null);
        return { success: true, id: res.lastInsertRowid };
    });

    ipcMain.handle('replace-gear-part', (e, partId, removedAt, removedKm, newPart) => {
        try {
            db.prepare('UPDATE gear_parts SET removed_at = ?, removed_km = ? WHERE id = ?').run(removedAt || new Date().toISOString(), removedKm || 0, partId);
            if (newPart) {
                const res = db.prepare('INSERT INTO gear_parts (gear_id, part_name, installed_at, installed_km, notes) VALUES (?,?,?,?,?)')
                    .run(newPart.gear_id, newPart.part_name, newPart.installed_at || new Date().toISOString(), newPart.installed_km || 0, newPart.notes || null);
                return { success: true, newId: res.lastInsertRowid };
            }
            return { success: true };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('export-gear-parts-csv', async (e, gearId) => {
        try {
            const parts = db.prepare('SELECT * FROM gear_parts WHERE gear_id = ? ORDER BY installed_at DESC').all(gearId);
            if (!parts || parts.length === 0) return { success: false, error: 'No parts' };
            const headers = ['id','gear_id','part_name','installed_at','installed_km','removed_at','removed_km','notes'];
            const rows = parts.map(p => headers.map(h => (p[h] === null || p[h] === undefined) ? '' : String(p[h]).replace(/"/g,'""')));
            const csvRows = rows.map(r => '"' + r.join('","') + '"');
            const csv = [headers.join(',')].concat(csvRows).join('\n');
            // Fallback: write to userData and return path
            const dest = path.join(app.getPath('desktop'), `gear_${gearId}_parts_${Date.now()}.csv`);
            fs.writeFileSync(dest, csv, 'utf8');
            return { success: true, path: dest };
        } catch (err) { console.error('export csv failed', err); return { success: false, error: err.message }; }
    });

    // ML handlers: train (append sample) - compute daily_avg server-side if missing
    ipcMain.handle('train-gear-ml', (e, sample) => {
        try {
            // If daily_avg not provided, compute from activities for this gear over last 30 days
            let dailyAvg = sample.daily_avg;
            if (dailyAvg === undefined || dailyAvg === null) {
                try {
                    const g = db.prepare('SELECT * FROM gears WHERE id = ?').get(sample.gear_id);
                    const activities = db.prepare("SELECT distance, date, type, gear_id FROM activities WHERE date > date('now', '-30 days')").all();
                    const recent = activities.filter(a => (g && g.type === 'Велосипед' ? a.type === 'RIDE' : a.type === g.type) || a.gear_id === sample.gear_id);
                    const totalRecent = recent.reduce((s,a)=>s+(a.distance||0),0);
                    dailyAvg = totalRecent / 30;
                } catch (e) { dailyAvg = 0; }
            }
            const res = db.prepare('INSERT INTO gear_ml_samples (gear_id, sample_date, life_km, current_wear, daily_avg, days_to_fail) VALUES (?,?,?,?,?,?)')
                .run(sample.gear_id, sample.sample_date || new Date().toISOString(), sample.life_km, sample.current_wear, dailyAvg, sample.days_to_fail || null);
            return { success: true, id: res.lastInsertRowid, daily_avg: dailyAvg };
        } catch (err) { return { success: false, error: err.message }; }
    });

    // Table to persist trained models
    try {
        db.prepare(`CREATE TABLE IF NOT EXISTS gear_ml_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gear_id INTEGER,
            trained_at TEXT,
            model_json TEXT,
            lambda REAL DEFAULT 0.0,
            metrics_json TEXT
        )`).run();
    } catch (e) { console.error('gear_ml_models create failed', e); }

    // Train a Ridge regression model for a gear and store it
    ipcMain.handle('train-gear-ml-model', (e, opts) => {
        try {
            const gearId = opts.gear_id || opts.gearId;
            const lambda = typeof opts.lambda === 'number' ? opts.lambda : (opts.lambda ? Number(opts.lambda) : 1.0);
            const rows = db.prepare('SELECT * FROM gear_ml_samples WHERE gear_id = ? AND days_to_fail IS NOT NULL').all(gearId);
            if (!rows || rows.length < 2) return { success: false, error: 'Not enough samples' };
            const X = [], Y = [];
            rows.forEach(r => {
                const f1 = (r.current_wear || 0) / (r.life_km || 1);
                const f2 = (r.daily_avg || 0);
                X.push([1, f1, f2]);
                Y.push(r.days_to_fail);
            });
            const XT_X = [[0,0,0],[0,0,0],[0,0,0]];
            const XT_Y = [0,0,0];
            for (let i=0;i<X.length;i++){
                const xi = X[i]; const yi = Y[i];
                for (let a=0;a<3;a++){
                    XT_Y[a] += xi[a]*yi;
                    for (let b=0;b<3;b++){ XT_X[a][b] += xi[a]*xi[b]; }
                }
            }
            // Regularize (do not regularize intercept at index 0)
            for (let i=0;i<3;i++){ for (let j=0;j<3;j++){ if (i===j && i>0) XT_X[i][j] += lambda; } }
            function solve(A, b){
                const n = A.length;
                const M = A.map((row,i)=>row.concat([b[i]]));
                for (let k=0;k<n;k++){
                    let i_max = k; for (let i=k+1;i<n;i++) if (Math.abs(M[i][k])>Math.abs(M[i_max][k])) i_max=i;
                    if (Math.abs(M[i_max][k])<1e-12) return null;
                    [M[k], M[i_max]] = [M[i_max], M[k]];
                    const pivot = M[k][k];
                    for (let j=k;j<=n;j++) M[k][j] /= pivot;
                    for (let i=0;i<n;i++) if (i!==k){ const factor = M[i][k]; for (let j=k;j<=n;j++) M[i][j] -= factor*M[k][j]; }
                }
                return M.map(row=>row[n]);
            }
            const beta = solve(XT_X, XT_Y);
            if (!beta) return { success: false, error: 'Solve failed' };
            // compute simple MSE
            let mse = 0;
            for (let i=0;i<X.length;i++){ const pred = beta[0]+beta[1]*X[i][1]+beta[2]*X[i][2]; mse += Math.pow(pred - Y[i],2); }
            mse = mse / X.length;
            const model = { beta, lambda, trained_at: new Date().toISOString() };
            const res = db.prepare('INSERT INTO gear_ml_models (gear_id, trained_at, model_json, lambda, metrics_json) VALUES (?,?,?,?,?)')
                .run(gearId, model.trained_at, JSON.stringify(model), lambda, JSON.stringify({ mse }));
            return { success: true, model: model, metrics: { mse }, id: res.lastInsertRowid };
        } catch (err) { console.error('train model failed', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('get-gear-ml-model', (e, gearId) => {
        try {
            const row = db.prepare('SELECT * FROM gear_ml_models WHERE gear_id = ? ORDER BY trained_at DESC LIMIT 1').get(gearId);
            if (!row) return { success: false, error: 'No model' };
            return { success: true, model: JSON.parse(row.model_json), metrics: JSON.parse(row.metrics_json), trained_at: row.trained_at };
        } catch (err) { return { success: false, error: err.message }; }
    });

    // Predict using stored model if available, otherwise fallback to rule-based
    ipcMain.handle('predict-gear-ml', (e, gearId) => {
        try {
            // try model first
            const modelRow = db.prepare('SELECT * FROM gear_ml_models WHERE gear_id = ? ORDER BY trained_at DESC LIMIT 1').get(gearId);
            const g = db.prepare('SELECT * FROM gears WHERE id = ?').get(gearId);
            const statsAll = db.prepare('SELECT SUM(distance) as total FROM activities WHERE (type = ? OR gear_id = ?)').get(g.type === 'Велосипед' ? 'RIDE' : g.type, g.id);
            const totalAbs = (g.initial_distance || 0) + (statsAll.total || 0);
            const currentWear = totalAbs - (g.last_reset_distance || 0);
            const activities = db.prepare("SELECT distance, date, type, gear_id FROM activities WHERE date > date('now', '-30 days')").all();
            const recentStats = activities.filter(a => (g.type === 'Велосипед' ? a.type === 'RIDE' : a.type === g.type) || a.gear_id === g.id);
            const totalRecent = recentStats.reduce((s,a)=>s+(a.distance||0),0);
            const dailyAvg = totalRecent/30;
            const life = g.life_km || (g.type === 'Цепь' ? 2000 : g.type === 'Кроссовки' ? 800 : 5000);

            if (modelRow) {
                try {
                    const model = JSON.parse(modelRow.model_json);
                    const beta = model.beta;
                    const f1 = (currentWear)/(g.life_km || 1);
                    const f2 = dailyAvg;
                    const pred = beta[0] + beta[1]*f1 + beta[2]*f2;
                    return { success: true, predicted_days: Math.round(pred), model_used: true, model: model, daily_avg: dailyAvg, current_wear: currentWear };
                } catch (err) {
                    // fallthrough to rule-based
                    console.error('model predict failed', err);
                }
            }

            // rule-based fallback
            const remaining = Math.max(0, life - currentWear);
            const daysToService = dailyAvg > 0 ? Math.round(remaining / dailyAvg) : null;
            return { success: true, predicted_days: daysToService, model_used: false, life, current_wear: currentWear, daily_avg: dailyAvg };
        } catch (err) { return { success: false, error: err.message }; }
    });

    // Strava OAuth - получение access token через refresh token
    try {
        console.log('[ipcHandlers] Registering refresh-strava-token handler');
        ipcMain.handle('refresh-strava-token', async (e, opts) => {
            try {
                const { clientId, clientSecret, refreshToken } = opts;
                
                if (!clientId || !clientSecret || !refreshToken) {
                    return { success: false, error: 'Client ID, Secret, и Refresh Token обязательны' };
                }

                const url = 'https://www.strava.com/api/v3/oauth/token';
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: clientId,
                        client_secret: clientSecret,
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken
                    })
                });

                if (!response.ok) {
                    const text = await response.text();
                    return { success: false, error: `Token refresh failed: ${response.status} - ${text}` };
                }

                const data = await response.json();
                
                // Сохраняем новый токен
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run(
                    'stravaAccessToken', 
                    data.access_token
                );
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run(
                    'stravaRefreshToken', 
                    data.refresh_token
                );
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run(
                    'stravaTokenExpires', 
                    data.expires_at.toString()
                );

                console.log('[strava] Token refreshed, expires at:', new Date(data.expires_at * 1000).toISOString());
                return { 
                    success: true, 
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token,
                    expiresAt: data.expires_at,
                    scope: data.scope
                };
            } catch (err) {
                console.error('[strava] Refresh token error:', err.message);
                return { success: false, error: err.message };
            }
        });
        console.log('[ipcHandlers] refresh-strava-token handler registered');
    } catch (regErr) {
        console.error('[ipcHandlers] Failed to register refresh-strava-token:', regErr);
    }

    // Strava импорт активностей
    console.log('[ipcHandlers] Registering import-strava handler');
    ipcMain.handle('import-strava', async (e, opts) => {
        console.log('[import-strava] Handler called with opts keys:', Object.keys(opts || {}));
        try {
            const { token } = opts;
            if (!token) {
                const errMsg = 'Token required';
                console.error('[import-strava]', errMsg);
                return { success: false, error: errMsg };
            }

            console.log('[import-strava] Using token:', token.substring(0, 10) + '...');
            
            const user = db.prepare('SELECT ftp, max_hr, resting_hr FROM users LIMIT 1').get();
            const ftp = user?.ftp || 200;
            const maxHr = user?.max_hr || 200;
            const restingHr = user?.resting_hr || 60;

            // Получаем активности со Strava (максимум 200 за запрос)
            const url = 'https://www.strava.com/api/v3/athlete/activities';
            const headers = {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'straveFlow/1.0'
            };

            console.log('[import-strava] Fetching from:', url);
            const response = await fetch(url, { headers });

            console.log('[import-strava] Response status:', response.status);
            const responseText = await response.text();
            console.log('[import-strava] Response body (first 300 chars):', responseText.substring(0, 300));

            if (!response.ok) {
                let errorMessage = `Strava API error: ${response.status}`;
                
                // Обработка специфичных ошибок
                if (response.status === 401) {
                    try {
                        const errorBody = JSON.parse(responseText);
                        if (errorBody.errors && errorBody.errors[0]) {
                            const err = errorBody.errors[0];
                            if (err.field === 'activity:read_permission' || err.code === 'missing') {
                                errorMessage = 'ОШИБКА: Токен не имеет прав activity:read!\n\n' +
                                    'Решение:\n' +
                                    '1. Откройте https://developer.strava.com/dashboard\n' +
                                    '2. Выберите приложение DataImporter\n' +
                                    '3. Нажмите "View Authorization"\n' +
                                    '4. УБЕДИТЕСЬ, что выбран scope: activity:read или activity:read_all\n' +
                                    '5. Скопируйте новый Access Token\n' +
                                    '6. Вставьте его выше';
                            }
                        }
                    } catch (e) {
                        errorMessage += ` - ${responseText}`;
                    }
                }
                
                console.error('[import-strava] Error:', errorMessage);
                return { success: false, error: errorMessage };
            }

            let activities;
            try {
                activities = JSON.parse(responseText);
            } catch (parseErr) {
                console.error('[import-strava] JSON parse error:', parseErr);
                return { success: false, error: `Failed to parse response: ${parseErr.message}` };
            }

            if (!Array.isArray(activities)) {
                return { success: false, error: `Invalid response format: expected array, got ${typeof activities}` };
            }

            console.log('[import-strava] Got', activities.length, 'activities');

            let imported = 0;

            for (const activity of activities) {
                try {
                    // Проверяем, не импортирована ли уже
                    const existing = db.prepare('SELECT id FROM activities WHERE title = ? AND date = ?').get(activity.name, activity.start_date);
                    if (existing) {
                        console.log('[import-strava] Activity already exists:', activity.name);
                        continue;
                    }

                    let tss = 0;
                    
                    // Попытаемся вычислить TSS в зависимости от типа активности
                    if (activity.type === 'Ride' || activity.type === 'VirtualRide') {
                        // Велосипед: используем avg_watts если доступны
                        if (activity.average_watts > 0) {
                            const durationSec = activity.moving_time || activity.elapsed_time;
                            tss = (durationSec * activity.average_watts) / (ftp * 3600) * 100;
                        }
                    } else if (activity.type === 'Run' || activity.type === 'Trail') {
                        // Бег: используем пульс
                        if (activity.average_heartrate > 0) {
                            const durationHours = (activity.moving_time || activity.elapsed_time) / 3600;
                            const hrReserve = Math.max(1, maxHr - restingHr);
                            tss = durationHours * ((activity.average_heartrate - restingHr) / hrReserve) * 100;
                        }
                    } else if (activity.type === 'Swim') {
                        // Плавание: упрощённо по времени
                        const durationHours = (activity.moving_time || activity.elapsed_time) / 3600;
                        tss = durationHours * 50; // Примерный расчет
                    }

                    // Добавляем активность в БД
                    db.prepare(`
                        INSERT INTO activities (title, date, distance, duration, elevation_gain, avg_power, avg_hr, tss, type, gpx_path)
                        VALUES (?,?,?,?,?,?,?,?,?,?)
                    `).run(
                        activity.name,
                        activity.start_date,
                        activity.distance / 1000, // Strava передает в метрах
                        activity.moving_time || activity.elapsed_time,
                        activity.total_elevation_gain || 0,
                        activity.average_watts || 0,
                        activity.average_heartrate || 0,
                        Math.max(0, tss),
                        activity.type,
                        `strava_${activity.id}`
                    );

                    imported++;
                    console.log('[import-strava] Imported:', activity.name);
                } catch (actErr) {
                    console.error(`[import-strava] Error importing activity ${activity.id}:`, actErr.message);
                }
            }

            console.log('[import-strava] Import complete, total imported:', imported);
            return { success: true, count: imported };
        } catch (err) {
            console.error('[import-strava] Fatal error:', err.message);
            return { success: false, error: err.message };
        }
    });

    console.log('[ipcHandlers] All handlers registered successfully!');
}
module.exports = { registerHandlers, dailyResetNow: async (...args) => {
    // allow other modules to call daily reset if handlers already registered
    try {
        // If registerHandlers created dailyResetNow in closure, we can't access it here.
        // Fallback: invoke via ipcMain handler by sending to self is not possible.
        // Instead, expose a simple helper that calls the handler by executing registerHandlers then invoking it.
        // For safety, call registerHandlers to ensure handlers are present, then call the handler via direct DB logic.
        registerHandlers();
        // call the handler via ipcMain handle function isn't available here; instead replicate minimal logic:
        const rows = require('./db').prepare("SELECT * FROM settings").all();
        const s = {}; rows.forEach(r => s[r.key] = r.value);
        const lastReset = s.lastWaterResetDate || null;
        const today = new Date().toISOString().split('T')[0];
        let current = parseInt(s.waterCount || '0') || 0;
        if (lastReset !== today) {
            if (current > 0) {
                const liters = +(current * 0.25).toFixed(2);
                require('./db').prepare('INSERT INTO water_history (date, glasses, liters) VALUES (?,?,?)').run(lastReset || today, current, liters);
            }
            require('./db').prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('waterCount', '0');
            require('./db').prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('lastWaterResetDate', today);
            return { reset: true, waterCount: 0 };
        }
        return { reset: false, waterCount: current };
    } catch (e) {
        console.error('[ipcHandlers] dailyResetNow error', e);
        return { success: false, error: e.message };
    }
} };
