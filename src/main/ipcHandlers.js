const { ipcMain, dialog, app } = require("electron");
const db = require("./db");
const { parseGPXFile } = require("./gpxParser");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const zapfitApi = require("./zapfit");
const updater = require("./updater");
// Alias for backward compat with old endurain-* channels (renderer may still call old names)
const endurainApi = zapfitApi;

// Дневной итог воды: UPDATE-or-INSERT с сохранением pushed_ml и пометкой is_synced=0.
// INSERT OR REPLACE здесь нельзя — он сносит pushed_ml/is_synced.
function setWaterTotal(date, ml) {
    try {
        const cols = db.query('PRAGMA table_info(water)').map(c => c.name);
        const hasSync = cols.includes('is_synced');
        const upd = hasSync
            ? db.prepare('UPDATE water SET ml=?, updated_at=datetime("now"), is_synced=0 WHERE date=?').run(ml, date)
            : db.prepare('UPDATE water SET ml=?, updated_at=datetime("now") WHERE date=?').run(ml, date);
        if (!upd || upd.changes === 0) {
            if (hasSync) db.prepare('INSERT INTO water (date, ml, updated_at, is_synced, pushed_ml) VALUES (?,?,datetime("now"),0,0)').run(date, ml);
            else db.prepare('INSERT INTO water (date, ml, updated_at) VALUES (?,?,datetime("now"))').run(date, ml);
        }
    } catch (e) { console.error('setWaterTotal', e.message); }
}

function ensureActivitiesCols() {
    try {
        const cols = db.query("PRAGMA table_info(activities)").map(c=>c.name);
        const add = (col, def) => { if(!cols.includes(col)) try{ db.prepare(`ALTER TABLE activities ADD COLUMN ${col} ${def}`).run(); console.log(`[ensure] activities added ${col}`); }catch(e){ console.warn('[ensure] activities '+col, e.message); } };
        add('server_id','INTEGER');
        add('map_thumbnail_path','TEXT');
        add('start_time','TEXT');
        add('end_time','TEXT');
        add('average_power','REAL');
        add('max_power','REAL');
        add('calories','REAL');
        add('activity_type','INTEGER');
        add('visibility','INTEGER DEFAULT 0');
        add('comments','TEXT');
        add('average_cad','REAL');
        add('max_cad','REAL');
        add('normalized_power','REAL');
        add('workout_rpe','REAL');
        add('workout_feeling','INTEGER');
        try{ db.prepare("CREATE INDEX IF NOT EXISTS idx_activities_server_id ON activities(server_id)").run(); }catch(_){}
        // gears too
        try {
            const gcols = db.query("PRAGMA table_info(gears)").map(c=>c.name);
            const gadd = (col, def) => { if(!gcols.includes(col)) try{ db.prepare(`ALTER TABLE gears ADD COLUMN ${col} ${def}`).run(); console.log(`[ensure] gears added ${col}`); }catch(e){ console.warn('[ensure] gears '+col, e.message); } };
            gadd('server_id','INTEGER');
            gadd('server_image','TEXT');
            gadd('image_path','TEXT');
            gadd('total_distance','REAL');
            gadd('initial_kms','REAL');
            try{ db.prepare("CREATE INDEX IF NOT EXISTS idx_gears_server_id ON gears(server_id)").run(); }catch(_){}
        } catch(_){}
        try{ db.saveDatabase(); }catch(_){}
    } catch(e){ console.warn('[ensure] ',e.message); }
}

function registerHandlers() {
    console.log('[ipcHandlers] registerHandlers called');
    // Авторемонт схемы при старте: раньше это делала только кнопка «Ремонт БД» в настройках.
    // Остальные таблицы мигрируют в db.initializeDatabase; activities/gears server-колонки — здесь.
    try { ensureActivitiesCols(); } catch (e) { console.warn('[startup ensure]', e.message); }
    
    // Expose version from package.json
    try {
        const pkg = require('../../package.json');
        console.log('[ipcHandlers] App version:', pkg.version);
    } catch (e) { console.error('[ipcHandlers] Failed to read version:', e); }
    
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
                INSERT INTO activities (title, date, distance, duration, elevation_gain, avg_power, avg_hr, max_hr, avg_speed, tss, gpx_path, points, type, moving_time, stopped_time, max_speed, ascent, descent, min_elevation, max_elevation, avg_gradient, max_gradient, gps_accuracy, track_segments, num_points, median_speed, speed_stddev) 
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'RIDE',?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
                data.points,
                data.moving_time || null,
                data.stopped_time || null,
                data.max_speed || null,
                data.ascent || null,
                data.descent || null,
                data.min_elevation || null,
                data.max_elevation || null,
                data.avg_gradient || null,
                data.max_gradient || null,
                data.gps_accuracy || null,
                data.track_segments || null,
                data.num_points || null,
                data.median_speed || null,
                data.speed_stddev || null
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

    // Find similar activities (for ML analysis and comparison)
    ipcMain.handle("find-similar-activities", (e, rideId) => {
        try {
            const ride = db.prepare("SELECT * FROM activities WHERE id = ?").get(rideId);
            if (!ride) return { success: false, similar: [] };

            // Find rides with similar distance (±10%) and same type
            const tolerance = ride.distance * 0.1; // ±10%
            const minDist = ride.distance - tolerance;
            const maxDist = ride.distance + tolerance;

            const similar = db.prepare(`
                SELECT * FROM activities 
                WHERE id != ? AND type = ? AND distance BETWEEN ? AND ?
                ORDER BY date DESC
                LIMIT 10
            `).all(rideId, ride.type || 'RIDE', minDist, maxDist);

            // Calculate comparison stats for trainer notes
            let comparison = {
                avgSpeed: 0,
                avgHR: 0,
                avgPower: 0,
                avgTSS: 0,
                bestSpeed: 0,
                bestTime: null,
                count: similar.length
            };

            if (similar.length > 0) {
                const speeds = similar.filter(s => s.avg_speed).map(s => s.avg_speed);
                const hrs = similar.filter(s => s.avg_hr).map(s => s.avg_hr);
                const powers = similar.filter(s => s.avg_power).map(s => s.avg_power);
                const tsss = similar.filter(s => s.tss).map(s => s.tss);

                comparison.avgSpeed = speeds.length > 0 ? speeds.reduce((a,b) => a+b, 0) / speeds.length : 0;
                comparison.avgHR = hrs.length > 0 ? hrs.reduce((a,b) => a+b, 0) / hrs.length : 0;
                comparison.avgPower = powers.length > 0 ? powers.reduce((a,b) => a+b, 0) / powers.length : 0;
                comparison.avgTSS = tsss.length > 0 ? tsss.reduce((a,b) => a+b, 0) / tsss.length : 0;
                comparison.bestSpeed = Math.max(...speeds, 0);
                comparison.fastestRide = similar.find(s => s.avg_speed === comparison.bestSpeed);
            }

            return { success: true, similar, comparison };
        } catch (err) {
            console.error('find-similar-activities', err);
            return { success: false, error: err.message, similar: [] };
        }
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

    // New water endpoints (ml stored per date)
    ipcMain.handle('get-water-today', () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const row = db.prepare('SELECT * FROM water WHERE date = ?').get(today);
            return { success: true, row };
        } catch (err) { console.error('get-water-today', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('set-water-today', (e, ml) => {
        try {
            const today = new Date().toISOString().split('T')[0];
            setWaterTotal(today, parseInt(ml || 0));
            return { success: true };
        } catch (err) { console.error('set-water-today', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('adjust-water-today', (e, deltaMl) => {
        try {
            const amount = parseInt(deltaMl || 0);
            const today = new Date().toISOString().split('T')[0];
            const row = db.prepare('SELECT ml FROM water WHERE date = ?').get(today);
            const current = (row && row.ml) ? parseInt(row.ml) : 0;
            const next = Math.max(0, current + amount);
            setWaterTotal(today, next);
            
            // Also add to water_entries for history consistency if adding
            if (amount > 0) {
                db.prepare('INSERT INTO water_entries (amount, time) VALUES (?, ?)').run(amount, new Date().toISOString());
            }
            
            return { success: true, ml: next };
        } catch (err) { console.error('adjust-water-today', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('delete-water-history', (e, id) => {
        try {
            db.prepare('DELETE FROM water_history WHERE id = ?').run(id);
            return { success: true };
        } catch (err) { console.error('delete-water-history', err); return { success: false, error: err.message }; }
    });

    // Competitions endpoints
    ipcMain.handle('get-competitions', () => {
        try { return db.prepare('SELECT * FROM competitions ORDER BY date ASC').all(); } catch (err) { console.error('get-competitions', err); return []; }
    });

    ipcMain.handle('add-competition', (e, comp) => {
        try {
            const res = db.prepare('INSERT INTO competitions (title, date, location, prize_place, notes) VALUES (?,?,?,?,?)').run(comp.title, comp.date, comp.location || '', comp.prize_place || '', comp.notes || '');
            return { success: true, id: res.lastInsertRowid };
        } catch (err) { console.error('add-competition', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('update-competition', (e, id, comp) => {
        try {
            db.prepare('UPDATE competitions SET title=?, date=?, location=?, prize_place=?, notes=? WHERE id=?').run(comp.title, comp.date, comp.location || '', comp.prize_place || '', comp.notes || '', id);
            return { success: true };
        } catch (err) { console.error('update-competition', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('delete-competition', (e, id) => {
        try {
            db.prepare('DELETE FROM competitions WHERE id=?').run(id);
            return { success: true };
        } catch (err) { console.error('delete-competition', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('export-competition-ics', (e, compId) => {
        try {
            const comp = db.prepare('SELECT * FROM competitions WHERE id = ?').get(compId);
            if (!comp) return { success: false, error: 'not_found' };
            const dt = new Date(comp.date);
            const dtStart = dt.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
            const uid = `zapfit-${comp.id}@local`;
            const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//zapfit//EN\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').split('.')[0]}Z\r\nDTSTART:${dtStart}\r\nSUMMARY:${comp.title}\r\nDESCRIPTION:${(comp.notes||'') + '\\n' + (comp.location||'')}\r\nLOCATION:${comp.location||''}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
            const fname = path.join(app.getPath('temp'), `zapfit_comp_${comp.id}.ics`);
            fs.writeFileSync(fname, ics, 'utf8');
            const { shell } = require('electron');
            shell.openPath(fname);
            return { success: true, path: fname };
        } catch (err) { console.error('export-competition-ics', err); return { success: false, error: err.message }; }
    });

    // ===== TRAINING PLANS HANDLERS =====
    
    ipcMain.handle('get-training-plans', () => {
        try {
            return db.prepare('SELECT * FROM training_plans ORDER BY start_date DESC').all() || [];
        } catch (err) {
            console.error('get-training-plans', err);
            return [];
        }
    });

    ipcMain.handle('create-training-plan', (e, planData) => {
        try {
            console.log('[IPC] create-training-plan:', planData.name, planData.start_date, planData.end_date);
            const result = db.prepare(`
                INSERT INTO training_plans (name, start_date, end_date, periodization_type, goal)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                planData.name || '', 
                planData.start_date || '', 
                planData.end_date || '', 
                planData.periodization_type || 'linear', 
                planData.goal || null
            );
            
            const plan = db.prepare('SELECT * FROM training_plans WHERE id = ?').get(result.lastInsertRowid);
            console.log('[IPC] Plan created with id:', result.lastInsertRowid);
            
            // Generate weeks based on periodization
            generateTrainingWeeks(result.lastInsertRowid, planData);
            
            console.log('[IPC] Training weeks generated');
            return { success: true, plan };
        } catch (err) {
            console.error('create-training-plan', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-training-plan-detail', (e, planId) => {
        try {
            const plan = db.prepare('SELECT * FROM training_plans WHERE id = ?').get(planId);
            if (!plan) return { success: false, error: 'Plan not found' };
            
            const weeks = db.prepare('SELECT * FROM training_weeks WHERE plan_id = ? ORDER BY week_number').all(planId);
            const sessions = {};
            
            weeks.forEach(w => {
                sessions[w.id] = db.prepare('SELECT * FROM training_sessions WHERE week_id = ? ORDER BY day_of_week').all(w.id);
            });
            
            return { success: true, plan, weeks, sessions };
        } catch (err) {
            console.error('get-training-plan-detail', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('delete-training-session', (e, sessionId) => {
        try {
            db.prepare('DELETE FROM training_sessions WHERE id = ?').run(sessionId);
            return { success: true };
        } catch (err) { console.error('delete-training-session', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('get-training-recommendations', (e) => {
        try {
            // Get current fitness metrics
            const today = new Date().toISOString().split('T')[0];
            const fitnessData = db.prepare(`
                SELECT ctl, atl, tsb FROM fitness_data 
                WHERE date = ? LIMIT 1
            `).get(today);
            
            // Get last 7 days activities
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const weekActivities = db.prepare(`
                SELECT type, COUNT(*) as count, SUM(tss) as total_tss 
                FROM activities 
                WHERE date >= ? 
                GROUP BY type
            `).all(sevenDaysAgo.toISOString().split('T')[0]);
            
            // Generate recommendations
            let recommendation = {
                type: 'RECOVERY',
                intensity: 3,
                reason: 'Regular maintenance'
            };
            
            if (fitnessData?.tsb < -10) {
                recommendation = { type: 'RECOVERY', intensity: 2, reason: 'High fatigue - rest day' };
            } else if (fitnessData?.tsb > 10) {
                recommendation = { type: 'RIDE', intensity: 8, reason: 'Well-rested - high intensity session' };
            } else if (fitnessData?.tsb > 0) {
                recommendation = { type: 'RIDE', intensity: 6, reason: 'Good form - moderate efforts' };
            }
            
            return { success: true, recommendation, fitness: fitnessData };
        } catch (err) {
            console.error('get-training-recommendations', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('update-training-session', (e, sessionId, updates) => {
        try {
            const sets = [];
            const values = [];
            Object.entries(updates).forEach(([key, value]) => {
                sets.push(`${key} = ?`);
                values.push(value);
            });
            values.push(sessionId);
            
            db.prepare(`UPDATE training_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
            
            // Recalculate fitness metrics when a session is marked as complete
            if (updates.completed) {
                calculateAndStoreFitnessMetrics();
            }
            
            return { success: true };
        } catch (err) {
            console.error('update-training-session', err);
            return { success: false, error: err.message };
        }
    });

    // Calculate and store CTL, ATL, TSB metrics
    ipcMain.handle('calculate-fitness-metrics', (e) => {
        try {
            calculateAndStoreFitnessMetrics();
            return { success: true };
        } catch (err) {
            console.error('calculate-fitness-metrics', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-fitness-metrics', (e) => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const metrics = db.prepare(`
                SELECT ctl, atl, tsb FROM fitness_data WHERE date = ? LIMIT 1
            `).get(today);
            return { success: true, metrics: metrics || { ctl: 0, atl: 0, tsb: 0 } };
        } catch (err) {
            console.error('get-fitness-metrics', err);
            return { success: false, error: err.message };
        }
    });

    function calculateAndStoreFitnessMetrics() {
        try {
            // Get all completed training sessions with TSS values
            const sessions = db.prepare(`
                SELECT ts.*, tw.plan_id 
                FROM training_sessions ts
                JOIN training_weeks tw ON ts.week_id = tw.id
                WHERE ts.completed = 1 AND ts.actual_duration IS NOT NULL
                ORDER BY ts.created_at ASC
            `).all();

            const today = new Date();
            const dates = [];
            
            // Generate array of dates going back 60 days
            for (let i = 60; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                dates.push(date.toISOString().split('T')[0]);
            }

            // Calculate CTL, ATL, TSB for each date
            let ctlValue = 0;
            let atlValue = 0;

            dates.forEach((dateStr, idx) => {
                const dayTSS = calculateDailyTSS(sessions, dateStr);
                
                // CTL: 42-day exponential moving average
                ctlValue = ctlValue + (dayTSS - ctlValue) / 42;
                
                // ATL: 7-day exponential moving average
                atlValue = atlValue + (dayTSS - atlValue) / 7;
                
                // TSB: CTL - ATL
                const tsb = ctlValue - atlValue;

                // Store in database
                db.prepare(`
                    INSERT OR REPLACE INTO fitness_data (date, ctl, atl, tsb, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    dateStr,
                    Math.round(ctlValue * 100) / 100,
                    Math.round(atlValue * 100) / 100,
                    Math.round(tsb * 100) / 100,
                    new Date().toISOString()
                );
            });

        } catch (err) {
            console.error('calculateAndStoreFitnessMetrics error:', err);
        }
    }

    function calculateDailyTSS(sessions, dateStr) {
        // Calculate TSS for a specific date
        const daySessions = sessions.filter(s => {
            const sessionDate = s.created_at ? s.created_at.split('T')[0] : null;
            return sessionDate === dateStr;
        });

        let totalTSS = 0;
        daySessions.forEach(session => {
            // Estimate TSS based on duration and intensity
            // TSS ≈ (Duration in hours) × (Intensity level / 10) × 100
            if (session.actual_duration) {
                const durationHours = session.actual_duration / 60;
                const intensityFactor = session.intensity_level / 10 || 0.5;
                const tss = durationHours * intensityFactor * 100;
                totalTSS += tss;
            }
        });

        return totalTSS;
    }

    ipcMain.handle('update-training-plan', (e, planId, planData) => {
        try {
            const sets = [];
            const values = [];
            
            if (planData.name !== undefined) { sets.push('name = ?'); values.push(planData.name); }
            if (planData.start_date !== undefined) { sets.push('start_date = ?'); values.push(planData.start_date); }
            if (planData.end_date !== undefined) { sets.push('end_date = ?'); values.push(planData.end_date); }
            if (planData.periodization_type !== undefined) { sets.push('periodization_type = ?'); values.push(planData.periodization_type); }
            if (planData.goal !== undefined) { sets.push('goal = ?'); values.push(planData.goal); }
            if (planData.status !== undefined) { sets.push('status = ?'); values.push(planData.status); }
            
            sets.push('updated_at = ?');
            values.push(new Date().toISOString());
            values.push(planId);
            
            db.prepare(`UPDATE training_plans SET ${sets.join(', ')} WHERE id = ?`).run(...values);
            const updated = db.prepare('SELECT * FROM training_plans WHERE id = ?').get(planId);
            return { success: true, plan: updated };
        } catch (err) {
            console.error('update-training-plan', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('delete-training-plan', (e, planId) => {
        try {
            // Delete all training sessions for weeks of this plan
            db.prepare(`
                DELETE FROM training_sessions 
                WHERE week_id IN (SELECT id FROM training_weeks WHERE plan_id = ?)
            `).run(planId);
            
            // Delete all training weeks for this plan
            db.prepare('DELETE FROM training_weeks WHERE plan_id = ?').run(planId);
            
            // Delete the plan itself
            db.prepare('DELETE FROM training_plans WHERE id = ?').run(planId);
            
            return { success: true };
        } catch (err) {
            console.error('delete-training-plan', err);
            return { success: false, error: err.message };
        }
    });

    // Generate AI-optimized plan (improvement of existing plan)
    ipcMain.handle('generate-ai-plan', (e, params) => {
        try {
            const { goal = 'endurance', name = 'AI Plan' } = params || {};
            
            // Create optimized weeks and sessions based on goal
            const goalConfig = {
                'endurance': { weeks: 12, periodization: 'undulating', focus: 'base-building' },
                'power': { weeks: 8, periodization: 'linear', focus: 'power-development' },
                'weight': { weeks: 10, periodization: 'undulating', focus: 'fat-loss' },
                'race': { weeks: 12, periodization: 'linear', focus: 'competition-prep' }
            };
            
            const config = goalConfig[goal] || goalConfig.endurance;
            
            // Generate optimized training plan structure
            const plan = {
                weeks: Array(config.weeks).fill(null).map((_, weekIdx) => ({
                    week: weekIdx + 1,
                    focus: config.periodization === 'linear'
                        ? weekIdx < config.weeks - 2 ? 'build' : weekIdx === config.weeks - 2 ? 'peak' : 'taper'
                        : ((weekIdx % 4) === 0 || (weekIdx % 4) === 1) ? 'build' : (weekIdx % 4) === 2 ? 'peak' : 'recovery',
                    sessions: [
                        { day: 1, type: 'RECOVERY', duration: 45, intensity: 3, notes: 'Лёгкая разминка' },
                        { day: 2, type: 'RIDE', duration: 75, intensity: goal === 'power' ? 9 : 6, notes: 'Основная сессия' },
                        { day: 3, type: 'STRENGTH', duration: 60, intensity: 7, notes: 'Силовая работа' },
                        { day: 4, type: 'RECOVERY', duration: 45, intensity: 2, notes: 'День восстановления' },
                        { day: 5, type: 'RIDE', duration: 90, intensity: goal === 'power' ? 8 : 5, notes: 'Длинная прогулка' },
                        { day: 6, type: goal === 'weight' ? 'RUN' : 'RIDE', duration: goal === 'power' ? 45 : 60, intensity: 5, notes: 'Кросс-тренировка' },
                        { day: 0, type: 'RECOVERY', duration: 30, intensity: 1, notes: 'День отдыха' }
                    ]
                }))
            };
            
            return { success: true, plan };
        } catch (err) {
            console.error('generate-ai-plan error:', err);
            return { success: false, error: err.message };
        }
    });

    // Helper function to generate training weeks and sessions
    function generateTrainingWeeks(planId, planData) {
        const startDate = new Date(planData.start_date);
        const endDate = new Date(planData.end_date);
        const diffTime = Math.abs(endDate - startDate);
        const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
        
        const focuses = planData.periodization_type === 'linear' 
            ? Array(diffWeeks).fill(null).map((_, i) => {
                if (i < diffWeeks - 2) return 'build';
                if (i === diffWeeks - 2) return 'peak';
                return 'taper';
            })
            : Array(diffWeeks).fill(null).map((_, i) => {
                const cycle = (i % 4);
                if (cycle === 0 || cycle === 1) return 'build';
                if (cycle === 2) return 'peak';
                return 'recovery';
            });
        
        for (let week = 1; week <= diffWeeks; week++) {
            const focus = focuses[week - 1];
            const intensity = focus === 'peak' ? 9 : focus === 'build' ? 7 : focus === 'recovery' ? 3 : 6;
            
            const weekResult = db.prepare(`
                INSERT INTO training_weeks (plan_id, week_number, focus_type, intensity_level)
                VALUES (?, ?, ?, ?)
            `).run(planId, week, focus, intensity);
            
            const weekId = weekResult.lastInsertRowid;
            
            // Generate training sessions for each day of the week
            generateTrainingSessions(weekId, focus, intensity);
        }
    }

    // Helper function to generate training sessions for a week
    function generateTrainingSessions(weekId, focusType, intensity) {
        // Вспомогательная функция для генерации тренировочных сессий на неделю
        const sessionTemplates = {
            // Фаза набора базовой выносливости
            build: [
                { day: 1, type: 'RECOVERY', duration: 45, intensity: 3, tss: 20, notes: 'Лёгкая прогулка' },
                { day: 2, type: 'RIDE', duration: 75, intensity: 6, tss: 65, notes: 'Темповая тренировка' },
                { day: 3, type: 'STRENGTH', duration: 60, intensity: 7, tss: 70, notes: 'Работа с сердечником' },
                { day: 4, type: 'RECOVERY', duration: 45, intensity: 2, tss: 15, notes: 'День восстановления' },
                { day: 5, type: 'RIDE', duration: 90, intensity: 5, tss: 75, notes: 'Пороговый тренинг' },
                { day: 6, type: 'RUN', duration: 60, intensity: 5, tss: 50, notes: 'Устойчивый бег' },
                { day: 0, type: 'RECOVERY', duration: 30, intensity: 1, tss: 10, notes: 'Активное восстановление или отдых' }
            ],
            // Пиковая фаза перед соревнованием
            peak: [
                { day: 1, type: 'RECOVERY', duration: 45, intensity: 3, tss: 20, notes: 'Лёгкая разминка' },
                { day: 2, type: 'RIDE', duration: 120, intensity: 9, tss: 150, notes: 'Интервалы на лактатном пороге' },
                { day: 3, type: 'STRENGTH', duration: 45, intensity: 6, tss: 50, notes: 'Работа на мощность' },
                { day: 4, type: 'RECOVERY', duration: 30, intensity: 2, tss: 10, notes: 'Лёгкая прогулка' },
                { day: 5, type: 'RIDE', duration: 90, intensity: 8, tss: 120, notes: 'Интервалы на VO2 max' },
                { day: 6, type: 'RUN', duration: 45, intensity: 7, tss: 70, notes: 'Темповый бег' },
                { day: 0, type: 'RECOVERY', duration: 20, intensity: 1, tss: 5, notes: 'Отдых или очень лёгкая нагрузка' }
            ],
            // Снижение нагрузки перед соревнованием
            taper: [
                { day: 1, type: 'RECOVERY', duration: 40, intensity: 2, tss: 10, notes: 'Лёгкое восстановление' },
                { day: 2, type: 'RIDE', duration: 60, intensity: 6, tss: 50, notes: 'Поддерживающая нагрузка' },
                { day: 3, type: 'STRENGTH', duration: 30, intensity: 3, tss: 20, notes: 'Лёгкая мобильность' },
                { day: 4, type: 'RECOVERY', duration: 30, intensity: 1, tss: 5, notes: 'День отдыха' },
                { day: 5, type: 'RIDE', duration: 45, intensity: 5, tss: 35, notes: 'Лёгкий темп с 2x5мин' },
                { day: 6, type: 'RUN', duration: 30, intensity: 4, tss: 25, notes: 'Короткий лёгкий бег' },
                { day: 0, type: 'RECOVERY', duration: 20, intensity: 1, tss: 5, notes: 'Полный отдых' }
            ],
            // Фаза восстановления после тяжёлых нагрузок
            recovery: [
                { day: 1, type: 'RECOVERY', duration: 45, intensity: 2, tss: 15, notes: 'Лёгкая активность' },
                { day: 2, type: 'RECOVERY', duration: 30, intensity: 1, tss: 10, notes: 'Полный отдых' },
                { day: 3, type: 'RIDE', duration: 60, intensity: 3, tss: 30, notes: 'Восстановительная прогулка' },
                { day: 4, type: 'RECOVERY', duration: 30, intensity: 1, tss: 5, notes: 'Мобильность' },
                { day: 5, type: 'RECOVERY', duration: 45, intensity: 2, tss: 15, notes: 'Лёгкая ходьба' },
                { day: 6, type: 'RIDE', duration: 60, intensity: 3, tss: 35, notes: 'Низкий пульс' },
                { day: 0, type: 'RECOVERY', duration: 60, intensity: 1, tss: 5, notes: 'Отдых с семьёй' }
            ]
        };

        const templates = sessionTemplates[focusType] || sessionTemplates.build;
        const stmt = db.prepare(`
            INSERT INTO training_sessions (week_id, day_of_week, session_type, duration_minutes, intensity_level, notes, tss)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const s of templates) {
            stmt.run(weekId, s.day, s.type, s.duration, s.intensity, s.notes, s.tss || 0);
        }
    }

    // Логика ежедневного сброса извлечена чтобы её можно было переиспользовать из других мест
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

    // Google Fit integration: token validation and sessions import
    ipcMain.handle('test-google-fit', async () => {
        try {
            const rows = db.prepare("SELECT * FROM settings").all();
            const s = {}; rows.forEach(r => s[r.key] = r.value);
            // Prefer stored access token, try refresh if not present
            let token = s.googleAccessToken || s.googleFitToken;
            const refresh = s.googleRefreshToken;
            if (!token && !refresh) return { success: false, error: 'No token configured (Client ID/Secret + OAuth required)' };
            if (!token && refresh) {
                // try refresh
                const refRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: s.googleClientId || '', client_secret: s.googleClientSecret || '' })
                });
                if (!refRes.ok) return { success: false, error: 'Refresh failed' };
                const tokens = await refRes.json();
                token = tokens.access_token;
                if (token) {
                    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleAccessToken', token);
                    if (tokens.expires_in) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleTokenExpiry', `${Date.now() + (tokens.expires_in * 1000)}`);
                }
            }
            if (!token) return { success: false, error: 'No access token available' };
            const infoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`);
            if (!infoRes.ok) {
                const text = await infoRes.text();
                return { success: false, error: `Token validation failed: ${text}` };
            }
            const info = await infoRes.json();
            return { success: true, info };
        } catch (err) { console.error('test-google-fit', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('import-google-fit', async (e, opts = {}) => {
        try {
            const rows = db.prepare("SELECT * FROM settings").all();
            const s = {}; rows.forEach(r => s[r.key] = r.value);
            let token = s.googleAccessToken || s.googleFitToken;
            const refresh = s.googleRefreshToken;
            if (!token && refresh) {
                const refRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: s.googleClientId || '', client_secret: s.googleClientSecret || '' })
                });
                if (refRes.ok) {
                    const tokens = await refRes.json();
                    token = tokens.access_token;
                    if (token) {
                        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleAccessToken', token);
                        if (tokens.expires_in) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleTokenExpiry', `${Date.now() + (tokens.expires_in * 1000)}`);
                    }
                }
            }
            if (!token) return { success: false, error: 'No token configured' };

            // Fetch sessions from Google Fit for last N days (default 30)
            const days = opts.days || 30;
            const now = Date.now();
            const startMillis = now - days * 24 * 60 * 60 * 1000;
            const sessionsUrl = `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${new Date(startMillis).toISOString()}&endTime=${new Date().toISOString()}`;
            const res = await fetch(sessionsUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) {
                const txt = await res.text();
                return { success: false, error: `Google Fit sessions fetch failed: ${txt}` };
            }
            const data = await res.json();
            const sessions = data.session || [];
            let imported = 0;
            for (const sss of sessions) {
                try {
                    const start = parseInt(sss.startTimeMillis || 0);
                    const end = parseInt(sss.endTimeMillis || 0);
                    const durationSec = Math.max(0, Math.floor((end - start) / 1000));
                    const dateIso = new Date(start).toISOString();
                    const title = sss.name || sss.activityType || 'Google Fit Session';
                    // Try to map activity type to our type
                    const type = (sss.activityType || '').toUpperCase() || 'RIDE';
                    // Insert activity if not exists (by date and title)
                    const exists = db.prepare('SELECT id FROM activities WHERE date = ? AND title = ?').get(dateIso, title);
                    if (exists) continue;
                    db.prepare(`INSERT INTO activities (title, date, distance, duration, elevation_gain, avg_power, avg_hr, max_hr, avg_speed, tss, gpx_path, type, points)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                        title,
                        dateIso,
                        0,
                        durationSec,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        'google-fit',
                        type,
                        null
                    );
                    imported++;
                } catch (e) { console.error('insert session failed', e); }
            }
            return { success: true, count: imported };
        } catch (err) { console.error('import-google-fit', err); return { success: false, error: err.message }; }
    });

    // OAuth helpers: generate auth URL and exchange code
    const { BrowserWindow } = require('electron');

    ipcMain.handle('generate-google-auth-url', (e) => {
        try {
            const rows = db.prepare("SELECT * FROM settings").all();
            const s = {}; rows.forEach(r => s[r.key] = r.value);
            const clientId = s.googleClientId || '';
            const redirect = s.googleRedirectUri || s.googleRedirect || 'urn:ietf:wg:oauth:2.0:oob';
            if (!clientId) return { success: false, error: 'Client ID not configured' };
            const scopes = [
                'https://www.googleapis.com/auth/fitness.activity.read',
                'https://www.googleapis.com/auth/fitness.body.read'
            ];
            const params = new URLSearchParams({
                client_id: clientId,
                redirect_uri: redirect,
                response_type: 'code',
                access_type: 'offline',
                prompt: 'consent',
                scope: scopes.join(' ')
            });
            const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
            return { success: true, url };
        } catch (err) { console.error('generate-google-auth-url', err); return { success: false, error: err.message }; }
    });

    // Start OAuth flow in an Electron BrowserWindow and auto-exchange code
    ipcMain.handle('start-google-oauth', async () => {
        try {
            const rows = db.prepare("SELECT * FROM settings").all();
            const s = {}; rows.forEach(r => s[r.key] = r.value);
            const clientId = s.googleClientId || '';
            const clientSecret = s.googleClientSecret || '';
            const redirect = s.googleRedirectUri || s.googleRedirect || 'urn:ietf:wg:oauth:2.0:oob';
            if (!clientId) return { success: false, error: 'Client ID not configured' };
            const scopes = [
                'https://www.googleapis.com/auth/fitness.activity.read',
                'https://www.googleapis.com/auth/fitness.body.read'
            ];
            const params = new URLSearchParams({
                client_id: clientId,
                redirect_uri: redirect,
                response_type: 'code',
                access_type: 'offline',
                prompt: 'consent',
                scope: scopes.join(' ')
            });
            const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

            const win = new BrowserWindow({
                width: 600,
                height: 800,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            let resolved = false;

            const cleanup = () => {
                try { if (!win.isDestroyed()) win.close(); } catch(e) {}
            };

            const tryHandleUrl = async (u) => {
                try {
                    if (!u) return null;
                    // If redirect is a custom scheme or HTTP, check code param
                    try { const parsed = new URL(u); const code = parsed.searchParams.get('code'); const error = parsed.searchParams.get('error'); if (code) return { code, error }; if (error) return { error }; } catch(e) { /* not an absolute URL */ }
                    // For oob flow (urn:ietf:...), try to extract code from page content
                    if (redirect && redirect.startsWith('urn:')) {
                        try {
                            const text = await win.webContents.executeJavaScript('document.body.innerText', true);
                            if (text) {
                                const m = text.match(/([A-Za-z0-9_\-]{20,})/);
                                if (m) return { code: m[1] };
                            }
                        } catch (e) { /* ignore */ }
                    }
                    return null;
                } catch (err) { return null; }
            };

            return await new Promise((resolve) => {
                win.loadURL(url).catch(err => { if (!resolved) { resolved = true; cleanup(); resolve({ success: false, error: err.message }); } });

                const handleNavigation = async (event, u) => {
                    const found = await tryHandleUrl(u);
                    if (found && !resolved) {
                        resolved = true;
                        if (found.error) { cleanup(); return resolve({ success: false, error: found.error }); }
                        const code = found.code;
                        // exchange code
                        (async () => {
                            try {
                                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                    body: new URLSearchParams({
                                        code: code,
                                        client_id: clientId,
                                        client_secret: clientSecret,
                                        redirect_uri: redirect,
                                        grant_type: 'authorization_code'
                                    })
                                });
                                if (!tokenRes.ok) {
                                    const txt = await tokenRes.text(); cleanup(); return resolve({ success: false, error: txt });
                                }
                                const tokens = await tokenRes.json();
                                if (tokens.access_token) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleAccessToken', tokens.access_token);
                                if (tokens.refresh_token) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleRefreshToken', tokens.refresh_token);
                                if (tokens.expires_in) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleTokenExpiry', `${Date.now() + (tokens.expires_in * 1000)}`);
                                cleanup(); return resolve({ success: true, tokens });
                            } catch (err) { cleanup(); return resolve({ success: false, error: err.message }); }
                        })();
                    }
                };

                win.webContents.on('will-redirect', handleNavigation);
                win.webContents.on('did-navigate', handleNavigation);
                win.webContents.on('did-navigate-in-page', handleNavigation);

                win.on('closed', () => { if (!resolved) { resolved = true; resolve({ success: false, error: 'window_closed' }); } });
            });
        } catch (err) { console.error('start-google-oauth', err); return { success: false, error: err.message }; }
    });

    // Start OAuth via system browser + local HTTP server (recommended — avoids webview blocking)
    ipcMain.handle('start-google-oauth-local', async () => {
        const http = require('http');
        const { shell } = require('electron');
        try {
            const rows = db.prepare("SELECT * FROM settings").all();
            const s = {}; rows.forEach(r => s[r.key] = r.value);
            const clientId = s.googleClientId || '';
            const clientSecret = s.googleClientSecret || '';
            const port = parseInt(s.googleOauthPort || '3000');
            if (!clientId || !clientSecret) return { success: false, error: 'Client credentials missing' };

            const redirect = `http://127.0.0.1:${port}/callback`;
            const scopes = [
                'https://www.googleapis.com/auth/fitness.activity.read',
                'https://www.googleapis.com/auth/fitness.body.read'
            ];
            const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: scopes.join(' ') });
            const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

            return await new Promise((resolve) => {
                const server = http.createServer(async (req, res) => {
                    try {
                        if (!req.url) return;
                        const u = new URL(req.url, `http://127.0.0.1:${port}`);
                        if (u.pathname === '/callback') {
                            const code = u.searchParams.get('code');
                            const error = u.searchParams.get('error');
                            if (error) {
                                res.writeHead(200, {'Content-Type':'text/html'});
                                res.end('<h3>Authorization failed: ' + error + '</h3>');
                                server.close();
                                return resolve({ success: false, error });
                            }
                            if (!code) {
                                res.writeHead(200, {'Content-Type':'text/html'});
                                res.end('<h3>No code received</h3>');
                                server.close();
                                return resolve({ success: false, error: 'no_code' });
                            }
                            // exchange code
                            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: new URLSearchParams({ code: code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' })
                            });
                            if (!tokenRes.ok) {
                                const txt = await tokenRes.text();
                                res.writeHead(500, {'Content-Type':'text/html'});
                                res.end('<h3>Token exchange failed</h3><pre>' + txt + '</pre>');
                                server.close();
                                return resolve({ success: false, error: txt });
                            }
                            const tokens = await tokenRes.json();
                            if (tokens.access_token) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleAccessToken', tokens.access_token);
                            if (tokens.refresh_token) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleRefreshToken', tokens.refresh_token);
                            if (tokens.expires_in) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleTokenExpiry', `${Date.now() + (tokens.expires_in * 1000)}`);
                            res.writeHead(200, {'Content-Type':'text/html'});
                            res.end('<h3>Authorization successful — you can close this window.</h3>');
                            server.close();
                            return resolve({ success: true, tokens });
                        }
                        res.writeHead(404); res.end();
                    } catch (err) { console.error('local oauth server error', err); try{ res.writeHead(500); res.end('error'); }catch(e){} server.close(); return resolve({ success: false, error: err.message }); }
                });

                server.listen(port, '127.0.0.1', (err) => {
                    if (err) { return resolve({ success: false, error: err.message }); }
                    // open system browser
                    shell.openExternal(url);
                });
            });
        } catch (err) { console.error('start-google-oauth-local', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('exchange-google-code', async (e, code) => {
        try {
            const rows = db.prepare("SELECT * FROM settings").all();
            const s = {}; rows.forEach(r => s[r.key] = r.value);
            const clientId = s.googleClientId || '';
            const clientSecret = s.googleClientSecret || '';
            const redirect = s.googleRedirectUri || s.googleRedirect || 'urn:ietf:wg:oauth:2.0:oob';
            if (!clientId || !clientSecret) return { success: false, error: 'Client ID/Secret not configured' };
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code: code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirect,
                    grant_type: 'authorization_code'
                })
            });
            if (!tokenRes.ok) {
                const txt = await tokenRes.text();
                return { success: false, error: txt };
            }
            const tokens = await tokenRes.json();
            if (tokens.access_token) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleAccessToken', tokens.access_token);
            if (tokens.refresh_token) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleRefreshToken', tokens.refresh_token);
            if (tokens.expires_in) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleTokenExpiry', `${Date.now() + (tokens.expires_in * 1000)}`);
            return { success: true, tokens };
        } catch (err) { console.error('exchange-google-code', err); return { success: false, error: err.message }; }
    });

    ipcMain.handle('refresh-google-token', async () => {
        try {
            const rows = db.prepare("SELECT * FROM settings").all();
            const s = {}; rows.forEach(r => s[r.key] = r.value);
            const refresh = s.googleRefreshToken;
            const clientId = s.googleClientId || '';
            const clientSecret = s.googleClientSecret || '';
            if (!refresh || !clientId || !clientSecret) return { success: false, error: 'Missing refresh token or client credentials' };
            const refRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId, client_secret: clientSecret })
            });
            if (!refRes.ok) { const txt = await refRes.text(); return { success: false, error: txt }; }
            const tokens = await refRes.json();
            if (tokens.access_token) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleAccessToken', tokens.access_token);
            if (tokens.expires_in) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('googleTokenExpiry', `${Date.now() + (tokens.expires_in * 1000)}`);
            return { success: true, tokens };
        } catch (err) { console.error('refresh-google-token', err); return { success: false, error: err.message }; }
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
        const res = db.prepare("INSERT INTO gears (name, type, brand, model, purchase_date, initial_distance, current_distance, last_reset_distance, last_service_date, life_km, parts, icon, wheel_size, brake_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                 .run(g.name, g.type, g.brand, g.model, g.purchase_date, g.initial_distance, g.initial_distance, g.initial_distance || 0, new Date().toISOString(), g.life_km || null, g.parts || null, g.icon || null, g.wheel_size || null, g.brake_type || null);
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

    // пересчёт TSS для активностей где он 0/null (после фикса)
    function _recalcMissingTss() {
        try {
            const u = db.prepare('SELECT ftp,max_hr,resting_hr FROM users LIMIT 1').get() || {ftp:200,max_hr:200,resting_hr:60};
            const ftp=u.ftp||200, maxHr=u.max_hr||200, restHr=u.resting_hr||60;
            const rows = db.prepare("SELECT id, tss, duration, average_power, avg_hr FROM activities WHERE tss IS NULL OR tss=0").all();
            let fixed=0;
            for (const r of rows) {
                const dur=r.duration||0, pwr=r.average_power||0, hr=r.avg_hr||0;
                let t=0;
                if(pwr>0&&dur>0) t=Math.round((dur*pwr)/(ftp*3600)*100);
                else if(hr>0&&dur>0){ const reserve=Math.max(1,maxHr-restHr); t=Math.round(((dur/3600)*((hr-restHr)/reserve)*100)); }
                else if(dur>0) t=Math.round((dur/3600)*30);
                if(t>0){ db.prepare("UPDATE activities SET tss=? WHERE id=?").run(t,r.id); fixed++; }
            }
            if(fixed) try{ db.saveDatabase(); console.log('[recalcMissingTss] fixed',fixed); }catch(_){}
            return fixed;
        } catch(e){ console.warn('_recalcMissingTss',e.message); return 0; }
    }
    ipcMain.handle('recalc-missing-tss', () => {
        const n=_recalcMissingTss();
        return { success:true, fixed:n };
    });
    ipcMain.handle('get-fitness-form', () => {
        try {
            // перед расчётом — починить TSS 0 у старых записей
            _recalcMissingTss();
            // Получаем все активности отсортированные по дате
            const acts = db.prepare("SELECT tss, date FROM activities WHERE tss > 0 ORDER BY date ASC").all();
            
            if (acts.length === 0) {
                return { ctl: 0, atl: 0, tsb: 0, ramp_rate: 0, response_index: 0, recommendation: "Нет данных для анализа." };
            }
            
            // Группируем активности по дням и суммируем TSS
            const dayMap = {};
            const firstDate = new Date(acts[0].date);
            const todayDate = new Date();
            const sevenDaysAgo = new Date(todayDate);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            acts.forEach(activity => {
                const dateStr = activity.date.split('T')[0]; // Берем только дату
                dayMap[dateStr] = (dayMap[dateStr] || 0) + (activity.tss || 0);
            });
            
            let ctl = 0, atl = 0;
            let ctl7daysAgo = 0, atl7daysAgo = 0;
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
                
                // Запоминаем значения 7 дней назад
                if (currentDate.getTime() === sevenDaysAgo.getTime()) {
                    ctl7daysAgo = ctl;
                    atl7daysAgo = atl;
                }
                
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            const tsb = ctl - atl;
            
            // RampRate: скорость изменения CTL за 7 дней (units per day)
            const rampRate = (ctl - ctl7daysAgo) / 7;
            
            // Response Index: чувствительность к нагрузкам
            const ctlChange = ctl - ctl7daysAgo;
            const atlChange = atl - atl7daysAgo;
            const responseIndex = ctlChange !== 0 ? (atlChange / ctlChange) : 0;
            
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
            
            return { 
                ctl: ctl.toFixed(1), 
                atl: atl.toFixed(1), 
                tsb: tsb.toFixed(1), 
                ramp_rate: parseFloat(rampRate.toFixed(2)),
                response_index: parseFloat(responseIndex.toFixed(2)),
                recommendation: rec 
            };
        } catch(e) {
            console.error('get-fitness-form error:', e);
            return { ctl: 0, atl: 0, tsb: 0, ramp_rate: 0, response_index: 0, recommendation: "Ошибка при расчёте." };
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

    // --- Auto-updater (GitHub) ---
    ipcMain.handle('check-for-updates', async () => {
        try { const r = await updater.checkForUpdates(); return { success: true, ...r }; }
        catch(e){ return { success:false, error:e.message }; }
    });
    ipcMain.handle('download-update', async () => {
        try { return await updater.downloadUpdate(); }
        catch(e){ return { success:false, error:e.message }; }
    });
    ipcMain.handle('quit-and-install', async () => {
        try { return updater.quitAndInstall(); }
        catch(e){ return { success:false, error:e.message }; }
    });
    ipcMain.handle('get-github-repo', async () => {
        try { return { success:true, ...updater.getRepo() }; }
        catch(e){ return { success:false, error:e.message }; }
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

    // Water entries handlers
    ipcMain.handle('get-water', () => {
        try {
            return db.prepare('SELECT * FROM water_entries ORDER BY time DESC').all() || [];
        } catch (err) {
            console.error('get-water', err);
            return [];
        }
    });

    // Дневные итоги (water-таблица: локальные записи + серверный merge) для графиков и виджетов
    ipcMain.handle('get-water-totals', () => {
        try {
            return db.prepare('SELECT date, ml FROM water ORDER BY date ASC').all() || [];
        } catch (err) {
            console.error('get-water-totals', err);
            return [];
        }
    });

    ipcMain.handle('add-water', (e, data) => {
        try {
            const amount = parseInt(data.amount || 0);
            const time = data.time || new Date().toISOString();
            const res = db.prepare('INSERT INTO water_entries (amount, time) VALUES (?, ?)').run(amount, time);
            
            // Sync with 'water' table (daily total)
            const entryDate = time.split('T')[0];
            const row = db.prepare('SELECT ml FROM water WHERE date = ?').get(entryDate);
            const current = (row && row.ml) ? parseInt(row.ml) : 0;
            setWaterTotal(entryDate, current + amount);
            
            return { success: true, id: res.lastInsertRowid };
        } catch (err) {
            console.error('add-water', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('update-water', (e, id, data) => {
        try {
            const entry = db.prepare('SELECT amount, time FROM water_entries WHERE id = ?').get(id);
            if (!entry) return { success: false, error: 'Entry not found' };

            const oldAmount = parseInt(entry.amount || 0);
            const newAmount = parseInt(data.amount || 0);
            const newTime = data.time || entry.time;
            
            db.prepare('UPDATE water_entries SET amount = ?, time = ? WHERE id = ?').run(newAmount, newTime, id);

            // Sync with 'water' table for the date of the entry
            const entryDate = entry.time ? entry.time.split('T')[0] : '';
            const newEntryDate = newTime.split('T')[0];

            if (entryDate === newEntryDate) {
                const row = db.prepare('SELECT ml FROM water WHERE date = ?').get(entryDate);
                const current = (row && row.ml) ? parseInt(row.ml) : 0;
                setWaterTotal(entryDate, Math.max(0, current - oldAmount + newAmount));
            } else {
                // Handle date change: subtract from old, add to new
                const oldRow = db.prepare('SELECT ml FROM water WHERE date = ?').get(entryDate);
                const oldVal = (oldRow && oldRow.ml) ? parseInt(oldRow.ml) : 0;
                setWaterTotal(entryDate, Math.max(0, oldVal - oldAmount));

                const newRow = db.prepare('SELECT ml FROM water WHERE date = ?').get(newEntryDate);
                const newVal = (newRow && newRow.ml) ? parseInt(newRow.ml) : 0;
                setWaterTotal(newEntryDate, newVal + newAmount);
            }
            
            return { success: true };
        } catch (err) {
            console.error('update-water', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('delete-water', (e, id) => {
        try {
            const entry = db.prepare('SELECT amount, time FROM water_entries WHERE id = ?').get(id);
            if (entry) {
                const amount = parseInt(entry.amount || 0);
                const entryDate = entry.time ? entry.time.split('T')[0] : '';
                
                db.prepare('DELETE FROM water_entries WHERE id = ?').run(id);

                const row = db.prepare('SELECT ml FROM water WHERE date = ?').get(entryDate);
                const current = (row && row.ml) ? parseInt(row.ml) : 0;
                setWaterTotal(entryDate, Math.max(0, current - amount));
            }
            return { success: true };
        } catch (err) {
            console.error('delete-water', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('update-activity-photos', (e, rideId, photos) => {
        try {
            console.log('[update-activity-photos] Saving photos for ride:', rideId, 'count:', photos?.length);
            const photosJson = JSON.stringify(photos);
            const result = db.prepare('UPDATE activities SET photos = ? WHERE id = ?').run(photosJson, rideId);
            console.log('[update-activity-photos] Updated rows:', result.changes);
            return { success: true };
        } catch (err) {
            console.error('update-activity-photos', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('update-activity-comments', (e, rideId, comments) => {
        try {
            console.log('[update-activity-comments] Saving comments for ride:', rideId, 'length:', comments?.length);
            const result = db.prepare('UPDATE activities SET comments = ? WHERE id = ?').run(comments, rideId);
            console.log('[update-activity-comments] Updated rows:', result.changes);
            return { success: true };
        } catch (err) {
            console.error('update-activity-comments', err);
            return { success: false, error: err.message };
        }
    });

    // Database direct access handlers for React components
    ipcMain.handle('db-query', (e, sql, params = []) => {
        try {
            const result = db.prepare(sql).all(...params);
            return result || [];
        } catch (err) {
            console.error('db-query error:', err);
            return [];
        }
    });

    ipcMain.handle('db-run', (e, sql, params = []) => {
        try {
            const result = db.prepare(sql).run(...params);
            return { success: true, changes: result?.changes };
        } catch (err) {
            console.error('db-run error:', err);
            return { success: false, error: err.message };
        }
    });

    // Get standard dishes
    ipcMain.handle('get-standard-dishes', async (event, category = null) => {
        try {
            if (category) {
                return db.prepare('SELECT * FROM standard_dishes WHERE category = ? ORDER BY category, name').all(category);
            }
            return db.prepare('SELECT * FROM standard_dishes ORDER BY category, name').all();
        } catch (err) {
            console.error('get-standard-dishes error:', err);
            return [];
        }
    });

    // Get all dish categories
    ipcMain.handle('get-dish-categories', async () => {
        try {
            return db.prepare('SELECT category FROM dish_categories ORDER BY category').all();
        } catch (err) {
            console.error('get-dish-categories error:', err);
            return [];
        }
    });

    ipcMain.handle('add-dish-category', async (e, category) => {
        try {
            if (!category || String(category).trim() === '') return { success: false, error: 'Empty category' };
            db.prepare('INSERT OR IGNORE INTO dish_categories (category) VALUES (?)').run(category);
            const cats = db.prepare('SELECT category FROM dish_categories ORDER BY category').all();
            return { success: true, categories: cats };
        } catch (err) {
            console.error('add-dish-category error:', err);
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

// --- ZAPFIT Server Integration (renamed from Endurain) ---

function registerZapfitHandlers() {
    ipcMain.handle('zapfit-configure', async (_event, serverUrl) => {
        try {
            const settings = await zapfitApi.configureServer(serverUrl);
            return { success: true, settings };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-login', async (_event, { username, password }) => {
        try {
            const result = await zapfitApi.login(username, password);
            if (result && result.mfa_required) {
                return { mfa_required: true, username: result.username };
            }
            // after successful login, _exchangeTokens already fetched profile — sync it now
            try { const p = await zapfitApi.fetchProfile(); syncProfileToLocal(p); } catch(_){}
            return { success: true, ...result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-login-mfa', async (_event, { mfaCode }) => {
        try {
            const result = await zapfitApi.loginWithMFA(mfaCode);
            try { const p = await zapfitApi.fetchProfile(); syncProfileToLocal(p); } catch(_){}
            return { success: true, ...result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // Image bytes with auth + fallback — parity with mobile getImageBytes
    ipcMain.handle('zapfit-get-image', async (_event, imagePath) => {
        try {
            const buf = await zapfitApi.getImageBytes(imagePath);
            return { success: true, data: buf.toString('base64'), mime: 'image/jpeg' };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-get-activity-media', async (_event, activityId) => {
        try {
            const media = await zapfitApi.getActivityMedia(activityId);
            return { success: true, media };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-logout', async () => {
        try {
            await zapfitApi.logout();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-disconnect', async () => {
        try {
            await zapfitApi.clearServer();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-status', async () => {
        return {
            configured: zapfitApi.isConfigured,
            authenticated: zapfitApi.isAuthenticated,
            serverUrl: zapfitApi.serverUrl,
            userId: zapfitApi.userId,
        };
    });

    // helper: sync profile -> local users table (parity with mobile UserService.fetchProfile)
    function syncProfileToLocal(profile) {
        try {
            if (!profile) return;
            const existing = db.prepare('SELECT * FROM users LIMIT 1').get();
            const name = profile.name || profile.username || existing?.name || 'Атлет';
            const avatar = profile.photo_path || profile.photo_url || profile.avatar_path || existing?.avatar_path || null;
            const ftp = profile.ftp != null ? profile.ftp : (existing?.ftp || 200);
            const weight = profile.weight != null ? profile.weight : (existing?.weight || 75);
            const height = profile.height != null ? profile.height : (existing?.height || 180);
            const resting_hr = profile.resting_heart_rate != null ? profile.resting_heart_rate : (profile.resting_hr != null ? profile.resting_hr : (existing?.resting_hr || 60));
            const max_hr = profile.max_heart_rate != null ? profile.max_heart_rate : (profile.max_hr != null ? profile.max_hr : (existing?.max_hr || 200));
            const birth_date = profile.birthdate || profile.birth_date || existing?.birth_date || null;
            if (existing) {
                db.prepare('UPDATE users SET name=?, avatar_path=?, ftp=?, weight=?, birth_date=?, height=?, resting_hr=?, max_hr=? WHERE id=?')
                    .run(name, avatar, ftp, weight, birth_date, height, resting_hr, max_hr, existing.id);
            } else {
                db.prepare('INSERT INTO users (name, avatar_path, ftp, weight, birth_date, height, resting_hr, max_hr) VALUES (?,?,?,?,?,?,?,?)')
                    .run(name, avatar, ftp, weight, birth_date, height, resting_hr, max_hr);
            }
            try { db.saveDatabase(); } catch(_){}
        } catch(e){ console.error('[zapfit] syncProfileToLocal error', e.message); }
    }

    ipcMain.handle('zapfit-get-profile', async () => {
        try {
            const profile = await zapfitApi.fetchProfile();
            syncProfileToLocal(profile);
            return { success: true, profile };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-sync-profile', async () => {
        try {
            const profile = await zapfitApi.fetchProfile();
            syncProfileToLocal(profile);
            return { success: true, profile };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-get-activities', async (_event, { page, perPage }) => {
        try {
            const activities = await zapfitApi.getActivities(page || 1, perPage || 30);
            return { success: true, activities };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-sync-activities', async () => {
        try {
            ensureActivitiesCols();
            // быстрый 401-диагностический чек — если нет ни Bearer ни API-ключа, сразу скажем войти
            const diag = zapfitApi.authDiagnostics;
            if (!diag.hasAccess && !zapfitApi.apiKey) {
                return { success: false, error: 'Не авторизован: войдите в Настройки → ZAPFIT (логин/пароль или API-ключ). Диагностика: ' + JSON.stringify(diag) };
            }
            let serverActivities = [];
            let refreshActivities = [];
            let lastErr = null;
            const norm = (v) => {
                if (!v) return [];
                if (Array.isArray(v)) return v;
                if (v.records && Array.isArray(v.records)) return v.records;
                if (v.activities && Array.isArray(v.activities)) return v.activities;
                if (v.data && Array.isArray(v.data)) return v.data;
                return [];
            };
            const toKm = (d) => {
                if (d == null) return 0;
                const n = Number(d);
                if (isNaN(n)) return 0;
                // server stores meters, desktop stores km
                return n > 500 ? n / 1000 : n;
            };
            const mapType = (act) => {
                const t = act.activity_type ?? act.type;
                if (t == null) return 'RIDE';
                const s = String(t).toUpperCase();
                if (['1','2','3'].includes(s)) {
                    // mobile mapping: 1 often ride, but server uses numeric
                    const m = { '1':'RIDE','2':'RUN','3':'SWIM' };
                    return m[s] || 'RIDE';
                }
                return s;
            };
            // 1) try refresh (like mobile ActivitySyncService.syncActivities)
            try {
                const rawRefresh = await zapfitApi.getActivitiesRefresh();
                refreshActivities = norm(rawRefresh);
                console.log('[zapfit] refresh fetched', refreshActivities.length);
            } catch (e) { console.error('[zapfit] refresh error', e.message); lastErr = e; }
            // 2) paginated full history
            try {
                const rawAll = await zapfitApi.getAllActivities(50);
                serverActivities = norm(rawAll);
                console.log('[zapfit] paginated fetched', serverActivities.length);
            } catch (e) {
                lastErr = e;
                try {
                    const rawSingle = await zapfitApi.getActivities(1, 100);
                    serverActivities = norm(rawSingle);
                    console.log('[zapfit] single page fetched', serverActivities.length);
                } catch (e2) { console.error('[zapfit] paginated single error', e2.message); lastErr = e2; }
            }
            // merge refresh + paginated dedup by id
            const merged = [];
            const seen = new Set();
            for (const arr of [refreshActivities, serverActivities]) {
                for (const a of arr) {
                    const id = a.id ?? a.activity_id ?? a.server_id;
                    if (id != null) {
                        if (seen.has(id)) continue;
                        seen.add(id);
                    }
                    merged.push(a);
                }
            }
            // fallback: if paginated empty but refresh has data, use refresh
            const allToImport = merged.length ? merged : (refreshActivities.length ? refreshActivities : serverActivities);

            let imported = 0, skipped = 0, updated = 0;
            // TSS helper + user ftp/hr for compute
            let _ftp=200,_maxHr=200,_restHr=60;
            try{ const u=db.prepare('SELECT ftp,max_hr,resting_hr FROM users LIMIT 1').get(); if(u){ _ftp=u.ftp||200; _maxHr=u.max_hr||200; _restHr=u.resting_hr||60; } }catch(_){}
            const _computeTss = (act, dur, avgPwr, avgHr)=>{
                let t = act.tss ?? act.training_stress_score ?? act.trimp ?? null;
                if(t!=null && Number(t)>0) return Math.round(Number(t));
                if(act.hr_tss != null && Number(act.hr_tss)>0) return Math.round(Number(act.hr_tss));
                if(avgPwr && avgPwr>0 && dur>0) return Math.round((dur*avgPwr)/(_ftp*3600)*100);
                if(avgHr && avgHr>0 && dur>0){ const hrs=dur/3600; const reserve=Math.max(1,_maxHr-_restHr); const v = hrs*((avgHr-_restHr)/reserve)*100; return Math.round(v>0?v:0); }
                // fallback: if duration >0 without hr/power — minimal TSS from duration (rpe)
                if(dur>0){ const hrs=dur/3600; return Math.round(hrs*30); }
                return 0;
            };

            for (const act of allToImport) {
                const serverId = act.id ?? act.activity_id ?? act.server_id ?? null;
                const title = act.name || act.title || act.activity_name || 'Activity';
                const startTime = act.start_time || act.started_at || act.date || act.created_at || new Date().toISOString();
                const endTime = act.end_time || act.ended_at || null;
                const dist = toKm(act.distance ?? act.total_distance ?? act.distance_meters);
                const duration = act.total_timer_time ?? act.total_elapsed_time ?? act.duration ?? act.elapsed_time ?? 0;
                const elev = act.elevation_gain ?? act.elevation ?? act.ascent ?? 0;
                const avgHr = act.average_hr ?? act.avg_hr ?? act.avg_heart_rate ?? null;
                const maxHr = act.max_hr ?? act.max_heart_rate ?? null;
                const avgSpd = act.average_speed ?? act.avg_speed ?? 0;
                const maxSpd = act.max_speed ?? null;
                const avgPwr = act.average_power ?? act.avg_power ?? null;
                const maxPwr = act.max_power ?? null;
                const cal = act.calories ?? null;
                const vis = act.visibility ?? 0;
                const thumb = act.map_thumbnail_path || act.thumbnail_path || act.map_thumbnail || act.thumbnail || null;
                const tssVal = _computeTss(act, duration, avgPwr, avgHr);

                if (serverId) {
                    const existingByServer = db.query('SELECT id FROM activities WHERE server_id = ?', [serverId]);
                    if (existingByServer.length > 0) {
                        try {
                            db.run(`UPDATE activities SET title=?, date=?, start_time=?, end_time=?, distance=?, duration=?, elevation_gain=?, avg_hr=?, max_hr=?, avg_speed=?, max_speed=?, average_power=?, max_power=?, calories=?, activity_type=?, type=?, gear_id=?, map_thumbnail_path=?, tss=?, visibility=?, server_id=? WHERE server_id=?`, [
                                title, startTime, startTime, endTime, dist, duration, elev, avgHr, maxHr, avgSpd, maxSpd, avgPwr, maxPwr, cal, act.activity_type ?? 1, mapType(act), act.gear_id || null, thumb, tssVal, vis, serverId, serverId
                            ]);
                            updated++;
                        } catch (e) { console.error('[zapfit] update error', e.message); }
                        continue;
                    }
                }
                // dedup by title+date if no server_id
                if (!serverId) {
                    const existingByTitle = db.query('SELECT id FROM activities WHERE title = ? AND date = ?', [title, startTime]);
                    if (existingByTitle.length > 0) { skipped++; continue; }
                }

                try {
                    db.run(`INSERT INTO activities (title, date, start_time, end_time, distance, duration, elevation_gain, avg_hr, max_hr, avg_speed, max_speed, average_power, max_power, calories, activity_type, type, gear_id, map_thumbnail_path, tss, visibility, server_id, gpx_path, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        title, startTime, startTime, endTime, dist, duration, elev, avgHr, maxHr, avgSpd, maxSpd, avgPwr, maxPwr, cal, act.activity_type ?? 1, mapType(act), act.gear_id || null, thumb, tssVal, vis, serverId || null, 'server', '[]'
                    ]);
                    imported++;
                } catch (e) {
                    console.error('[zapfit] import activity error:', e.message);
                }
            }

            // dedup cleanup: keep MIN(id) per server_id
            try{ db.prepare("DELETE FROM activities WHERE id NOT IN (SELECT MIN(id) FROM activities WHERE server_id IS NOT NULL GROUP BY server_id) AND server_id IS NOT NULL").run(); }catch(e){ console.warn('[dedup]',e.message); }
            db.saveDatabase();
            console.log('[zapfit] sync done imported', imported, 'updated', updated, 'total', allToImport.length, 'deduped');
            if (allToImport.length===0 && lastErr) {
                const msg = String(lastErr.message||lastErr);
                if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
                    return { success: false, error: `401 Unauthorized — токен истёк. Перелогиньтесь в Настройки → ZAPFIT или укажите API-ключ. Детали: ${msg} Диагностика: ${JSON.stringify(zapfitApi.authDiagnostics)}` };
                }
                return { success: false, error: `Сервер не вернул активности: ${msg}` };
            }
            return { success: true, imported, skipped, updated, total: allToImport.length };
        } catch (e) {
            console.error('[zapfit] sync activities fatal', e);
            return { success: false, error: e.message + ' ' + JSON.stringify(zapfitApi.authDiagnostics) };
        }
    });

    ipcMain.handle('zapfit-sync-health', async () => {
        try {
            let synced = 0; let lastErr = null;
            const details = {
                weight: { pulled: 0, saved: 0, skipped: 0 },
                sleep: { pulled: 0, saved: 0, skipped: 0 },
                steps: { pulled: 0, saved: 0, skipped: 0 },
                water: { pulled: 0, saved: 0, skipped: 0 },
            };
            const toArray = (v) => {
                if (!v) return [];
                if (Array.isArray(v)) return v;
                if (v.records && Array.isArray(v.records)) return v.records;
                if (v.data && Array.isArray(v.data)) return v.data;
                return [];
            };
            // ensure heart_rate table exists (parity with mobile LocalActivityRepository)
            try { db.prepare(`CREATE TABLE IF NOT EXISTS heart_rate_records (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp_ms INTEGER, bpm INTEGER, source TEXT, is_synced INTEGER DEFAULT 1, date TEXT)`).run(); } catch(_){}
            // ensure sleep_data supports new columns (already created but check)
            try {
                const cols = db.query("PRAGMA table_info(sleep_data)").map(c=>c.name);
                if (!cols.includes('start_time')) try{ db.prepare("ALTER TABLE sleep_data ADD COLUMN start_time TEXT").run(); }catch(_){}
                if (!cols.includes('end_time')) try{ db.prepare("ALTER TABLE sleep_data ADD COLUMN end_time TEXT").run(); }catch(_){}
                if (!cols.includes('sleep_duration_hours')) try{ db.prepare("ALTER TABLE sleep_data ADD COLUMN sleep_duration_hours REAL").run(); }catch(_){}
                if (!cols.includes('sleep_quality')) try{ db.prepare("ALTER TABLE sleep_data ADD COLUMN sleep_quality INTEGER").run(); }catch(_){}
                for (const [c, t] of [['deep_sleep_seconds','INTEGER'],['light_sleep_seconds','INTEGER'],['rem_sleep_seconds','INTEGER'],['awake_sleep_seconds','INTEGER'],['avg_heart_rate','INTEGER'],['resting_heart_rate','INTEGER'],['score_overall','INTEGER']]) {
                    if (!cols.includes(c)) try{ db.prepare(`ALTER TABLE sleep_data ADD COLUMN ${c} ${t}`).run(); }catch(_){}
                }
            } catch(_){}

            try {
                const raw = await zapfitApi.getWeight();
                const weightRecords = toArray(raw);
                details.weight.pulled = weightRecords.length;
                for (const rec of weightRecords) {
                    const val = rec.weight ?? rec.value ?? rec.bmi ?? 0;
                    const d = (rec.date || rec.created_at || new Date().toISOString()).split('T')[0];
                    // В health_metrics нет UNIQUE(type,date) — REPLACE не срабатывает, чистим день явно
                    db.run(`DELETE FROM health_metrics WHERE type='weight' AND date=?`, [d]);
                    db.run(`INSERT INTO health_metrics (type, value, date, note, user_id) VALUES (?, ?, ?, ?, ?)`,
                        ['weight', val, d, rec.notes || rec.note || '', rec.user_id || 0]);
                    synced++;
                    details.weight.saved++;
                }
                console.log('[zapfit] weight synced', weightRecords.length);
            } catch (e) { console.error('[zapfit] sync weight error:', e.message); lastErr=e; }

            try {
                const raw = await zapfitApi.getSleep();
                const sleepRecords = toArray(raw);
                details.sleep.pulled = sleepRecords.length;
                // Серверный sleep_score_overall — шкала 0-100, локальная sleep_quality — 1-5
                const normScore = (s) => {
                    const v = Number(s);
                    if (!isFinite(v)) return 3;
                    if (v >= 1 && v <= 5 && Number.isInteger(v)) return v;
                    if (v >= 85) return 5;
                    if (v >= 70) return 4;
                    if (v >= 55) return 3;
                    if (v >= 40) return 2;
                    return 1;
                };
                for (const rec of sleepRecords) {
                    try {
                        const d = (rec.date || rec.created_at || new Date().toISOString()).split('T')[0];
                        let durSec = Number(rec.total_sleep_seconds ?? rec.duration ?? rec.sleep_duration ?? rec.sleep_duration_seconds ?? 0) || 0;
                        // Сервер шлёт секунды; страховка: значение в часах (<24) трактуем как часы
                        let hrs = 0;
                        if (durSec > 24) hrs = durSec / 3600;
                        else if (durSec > 0) hrs = durSec;
                        if (!hrs) {
                            // Фолбэк: разница start/end
                            const s = new Date(rec.sleep_start_time_gmt || rec.sleep_start_time || rec.start_time || 0).getTime();
                            const e = new Date(rec.sleep_end_time_gmt || rec.sleep_end_time || rec.end_time || 0).getTime();
                            if (isFinite(s) && isFinite(e) && e > s) hrs = (e - s) / 3600000;
                        }
                        if (!hrs || hrs <= 0 || hrs > 24) { details.sleep.skipped++; console.log('[zapfit] sleep skip (no duration)', d); continue; }
                        durSec = Math.round(hrs * 3600);
                        // handle both schemas: keep legacy duration column and new columns
                        const quality = normScore(rec.sleep_score_overall ?? rec.sleep_score ?? rec.quality ?? 3);
                        const startIso = rec.sleep_start_time_gmt || rec.sleep_start_time || rec.start_time || null;
                        const endIso = rec.sleep_end_time_gmt || rec.sleep_end_time || rec.end_time || null;
                        const det = {
                            deep: Number(rec.deep_sleep_seconds) || 0,
                            light: Number(rec.light_sleep_seconds) || 0,
                            rem: Number(rec.rem_sleep_seconds) || 0,
                            awake: Number(rec.awake_sleep_seconds) || 0,
                            avgHr: Number(rec.avg_heart_rate) || null,
                            restHr: Number(rec.resting_heart_rate) || null,
                            score: Number(rec.sleep_score_overall ?? rec.sleep_score) || null,
                        };
                        // UPSERT by date to avoid duplicates
                        const existing = db.query('SELECT id FROM sleep_data WHERE date=?', [d]);
                        if (existing.length) {
                            db.run(`UPDATE sleep_data SET duration=?, quality=?, notes=?, start_time=?, end_time=?, sleep_duration_hours=?, sleep_quality=?, deep_sleep_seconds=?, light_sleep_seconds=?, rem_sleep_seconds=?, awake_sleep_seconds=?, avg_heart_rate=?, resting_heart_rate=?, score_overall=? WHERE date=?`,
                                [durSec, quality, rec.notes || '', startIso, endIso, +hrs.toFixed(2), quality, det.deep, det.light, det.rem, det.awake, det.avgHr, det.restHr, det.score, d]);
                        } else {
                            db.run(`INSERT INTO sleep_data (date, duration, quality, notes, start_time, end_time, sleep_duration_hours, sleep_quality, deep_sleep_seconds, light_sleep_seconds, rem_sleep_seconds, awake_sleep_seconds, avg_heart_rate, resting_heart_rate, score_overall) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [d, durSec, quality, rec.notes || '', startIso, endIso, +hrs.toFixed(2), quality, det.deep, det.light, det.rem, det.awake, det.avgHr, det.restHr, det.score]);
                        }
                        // also store HR fields from sleep if present into health_metrics for pulse
                        if (rec.resting_heart_rate || rec.avg_heart_rate || rec.rest_heart_rate) {
                            const hr = rec.resting_heart_rate || rec.avg_heart_rate || rec.rest_heart_rate;
                            db.run(`DELETE FROM health_metrics WHERE type IN ('heart_rate','pulse') AND date=?`, [d]);
                            try { db.run(`INSERT INTO health_metrics (type, value, date) VALUES ('heart_rate', ?, ?)`, [hr, d]); } catch(_){}
                            try { db.run(`INSERT INTO health_metrics (type, value, date) VALUES ('pulse', ?, ?)`, [hr, d]); } catch(_){}
                        }
                        synced++;
                        details.sleep.saved++;
                    } catch (eRec) { console.error('[zapfit] sleep record skip:', eRec.message); details.sleep.skipped++; lastErr = eRec; }
                }
                console.log('[zapfit] sleep synced', synced);
            } catch (e) { console.error('[zapfit] sync sleep error:', e.message); lastErr=e; }

            try {
                const raw = await zapfitApi.getSteps();
                const stepsRecords = toArray(raw);
                details.steps.pulled = stepsRecords.length;
                for (const rec of stepsRecords) {
                    const d = (rec.date || rec.created_at || new Date().toISOString()).split('T')[0];
                    db.run(`DELETE FROM health_metrics WHERE type='steps' AND date=?`, [d]);
                    db.run(`INSERT INTO health_metrics (type, value, date, user_id) VALUES (?, ?, ?, ?)`,
                        ['steps', rec.steps ?? rec.value ?? 0, d, rec.user_id || 0]);
                    synced++;
                    details.steps.saved++;
                }
                console.log('[zapfit] steps synced', stepsRecords.length);
            } catch (e) { console.error('[zapfit] sync steps error:', e.message); lastErr=e; }

            try {
                const raw = await zapfitApi.getWater();
                const waterRecords = toArray(raw);
                details.water.pulled = waterRecords.length;
                for (const rec of waterRecords) {
                    try {
                        const d = (rec.date || rec.created_at || new Date().toISOString()).split('T')[0];
                        const ml = Math.max(0, Math.round(Number(rec.amount_ml ?? rec.amount ?? rec.ml ?? rec.value ?? 0) || 0));
                        if (!ml) { details.water.skipped++; continue; }
                        // Merge: сервер — сводка с других устройств, локальные записи не затираем.
                        // Итог дня = max(локально, сервер); pushed_ml подтягиваем, чтобы не перепушить чужое.
                        const row = db.query('SELECT ml, pushed_ml, is_synced FROM water WHERE date=?', [d])[0];
                        const localMl = row ? (Number(row.ml) || 0) : 0;
                        const pushedMl = row ? (Number(row.pushed_ml) || 0) : 0;
                        const merged = Math.max(localMl, ml);
                        if (row) {
                            db.run('UPDATE water SET ml=?, pushed_ml=?, updated_at=datetime("now") WHERE date=?',
                                [merged, Math.max(pushedMl, ml), d]);
                        } else {
                            db.run('INSERT INTO water (date, ml, updated_at, is_synced, pushed_ml) VALUES (?,?,datetime("now"),1,?)',
                                [d, merged, ml]);
                        }
                        synced++;
                        details.water.saved++;
                    } catch (eRec) { console.error('[zapfit] water record skip:', eRec.message); details.water.skipped++; lastErr = eRec; }
                }
                console.log('[zapfit] water synced', synced);
            } catch (e) { console.error('[zapfit] sync water error:', e.message); lastErr=e; }

            // Heart rate via health/sleep resting_heart_rate already saved above; standalone endpoint not present on this server — skip to avoid 404 noise
            // (server has no /health/heart_rate, пульс берём из sleep/resting_heart_rate и health_metrics pulse)

            db.saveDatabase();
            if (synced===0 && lastErr) {
                const msg=String(lastErr.message||lastErr);
                if (msg.includes('401')||msg.toLowerCase().includes('unauthorized')) return { success:false, error: `401 — токен истёк, перелогиньтесь или API-ключ. ${msg} ${JSON.stringify(zapfitApi.authDiagnostics)}`, details };
                // если ни одной записи и была ошибка — вернём её, иначе 0 — это нормально (пустая история на сервере)
                if (msg) return { success:false, error: msg, details };
            }
            return { success: true, synced, details };
        } catch (e) {
            console.error('[zapfit] sync health fatal', e);
            return { success: false, error: e.message };
        }
    });

    // --- PUSH: health desktop -> server ---
    ipcMain.handle('zapfit-push-health', async (_event, opts = {}) => {
        try {
            const types = opts.types || ['weight','sleep','steps','water'];
            let pushed=0; let errors=[];
            // dedup helper: remember last push date in settings to avoid re-pushing same records repeatedly
            // but we push all local records that haven't been pushed (simple: push everything, server will dedup by date)
            for (const type of types) {
                try {
                    if (type === 'weight') {
                        const rows = db.query("SELECT * FROM health_metrics WHERE type='weight' ORDER BY date DESC LIMIT 100");
                        for (const r of rows) {
                            try {
                                const payload = { weight: r.value, date: r.date, notes: r.note||'', value: r.value };
                                await zapfitApi.addHealthRecord('weight', payload); pushed++;
                            } catch(e){ errors.push(`weight ${r.date}: ${e.message}`); }
                        }
                    } else if (type === 'sleep') {
                        const rows = db.query("SELECT * FROM sleep_data ORDER BY date DESC LIMIT 100");
                        for (const r of rows) {
                            try {
                                const durSec = r.duration || (r.sleep_duration_hours ? Math.round(r.sleep_duration_hours * 3600) : 0);
                                if (!durSec) continue;
                                // Серверный POST upsert'ит по дате; поля строго по HealthSleepCreate (extra=forbid)
                                const q = Number(r.quality ?? r.sleep_quality ?? 3);
                                const payload = {
                                    date: r.date,
                                    total_sleep_seconds: durSec,
                                    sleep_score_overall: Math.max(20, Math.min(100, Math.round(q * 20))),
                                    sleep_start_time_gmt: r.start_time || r.sleep_start_time_gmt || null,
                                    sleep_end_time_gmt: r.end_time || r.sleep_end_time_gmt || null,
                                };
                                await zapfitApi.addHealthRecord('sleep', payload); pushed++;
                            } catch(e){ errors.push(`sleep ${r.date}: ${e.message}`); }
                        }
                        // also health_metrics type sleep/hrv
                        const hm = db.query("SELECT * FROM health_metrics WHERE type IN ('sleep','hrv') ORDER BY date DESC LIMIT 50");
                        for (const r of hm) {
                            try { await zapfitApi.addHealthRecord('sleep', { total_sleep_seconds: Math.round((r.value||0)*3600), date: r.date }); pushed++; } catch(e){ errors.push(`hm sleep ${r.date}: ${e.message}`); }
                        }
                    } else if (type === 'steps') {
                        const rows = db.query("SELECT * FROM health_metrics WHERE type='steps' ORDER BY date DESC LIMIT 100");
                        for (const r of rows) {
                            try { await zapfitApi.addHealthRecord('steps', { steps: Math.round(r.value), date: r.date, value: r.value }); pushed++; } catch(e){ errors.push(`steps ${r.date}: ${e.message}`); }
                        }
                    } else if (type === 'water') {
                        // Серверный POST воды АККУМУЛИРУЕТ (existing + new), поэтому шлём только
                        // дельту (ml - pushed_ml) и только для грязных дат — иначе задвоение.
                        const rows = db.query("SELECT date, ml, pushed_ml, is_synced FROM water ORDER BY date DESC LIMIT 100");
                        for (const r of rows) {
                            try {
                                if (Number(r.is_synced) === 1) continue;
                                const ml = Math.max(0, Math.round(Number(r.ml) || 0));
                                const already = Math.max(0, Math.round(Number(r.pushed_ml) || 0));
                                const delta = ml - already;
                                if (delta > 0) {
                                    await zapfitApi.addHealthRecord('water', { amount_ml: delta, date: r.date });
                                }
                                db.run('UPDATE water SET pushed_ml=?, is_synced=1 WHERE date=?', [ml, r.date]);
                                pushed++;
                            } catch(e){ errors.push(`water ${r.date}: ${e.message}`); }
                        }
                    } else {
                        // generic health_metrics type
                        const rows = db.query("SELECT * FROM health_metrics WHERE type=? ORDER BY date DESC LIMIT 100", [type]);
                        for (const r of rows) { try{ await zapfitApi.addHealthRecord(type, { value: r.value, date: r.date }); pushed++; }catch(e){ errors.push(`${type} ${r.date}: ${e.message}`);} }
                    }
                } catch(e){ errors.push(`${type} fatal: ${e.message}`); }
            }
            return { success: true, pushed, errors: errors.slice(0,5), totalErrors: errors.length };
        } catch(e){ return { success:false, error:e.message };}
    });

    // --- PUSH: activity file upload ---
    ipcMain.handle('zapfit-upload-activity', async (_event, opts = {}) => {
        try {
            let filePath = opts.filePath || opts.path;
            if (!filePath) {
                const res = await dialog.showOpenDialog({ properties:['openFile'], filters:[{name:'Activity Files', extensions:['fit','gpx','tcx']}] });
                if (res.canceled || !res.filePaths.length) return { success:false, error:'cancelled' };
                filePath = res.filePaths[0];
            }
            const result = await zapfitApi.uploadActivityFile(filePath);
            return { success:true, result, file: filePath };
        } catch(e){ return { success:false, error:e.message }; }
    });
    ipcMain.handle('zapfit-bulk-upload-activities', async (_event, opts = {}) => {
        try {
            let filePaths = opts.filePaths;
            if (!filePaths || !filePaths.length) {
                const res = await dialog.showOpenDialog({ properties:['openFile','multiSelections'], filters:[{name:'Activity Files', extensions:['fit','gpx','tcx']}] });
                if (res.canceled) return { success:false, error:'cancelled' };
                filePaths = res.filePaths;
            }
            const result = await zapfitApi.bulkImportActivities(filePaths);
            return { success:true, result, count: filePaths.length };
        } catch(e){ return { success:false, error:e.message };}
    });

    // --- PUSH: gears ---
    ipcMain.handle('zapfit-push-gears', async () => {
        try {
            const localGears = db.query("SELECT * FROM gears WHERE server_id IS NULL OR server_id=0");
            let pushed=0; let errors=[];
            for (const g of localGears) {
                try {
                    const gearTypeMap = { 'Велосипед':1, 'Кроссовки':2, 'Гидрокостюм':3, 'Ракетка':4, 'Лыжи':5, 'Сноуборд':6 };
                    const payload = {
                        nickname: g.name, gear_type: gearTypeMap[g.type] || 1,
                        brand: g.brand||'', model: g.model||'', initial_kms: g.initial_distance||0,
                    };
                    const created = await zapfitApi.createGear(payload);
                    const serverId = created.id || created.gear_id || created.server_id;
                    if (serverId) { db.prepare('UPDATE gears SET server_id=? WHERE id=?').run(serverId, g.id); }
                    // push components if any
                    const parts = db.query('SELECT * FROM gear_parts WHERE gear_id=?', [g.id]);
                    for (const p of parts) {
                        try { await zapfitApi.createGearComponent({ gear_id: serverId||g.id, type: p.part_name, brand:'', model:'', purchase_date: p.installed_at }); } catch(e){ errors.push(`part ${p.part_name}: ${e.message}`); }
                    }
                    // push image if exists
                    if (g.image_path && fs.existsSync(g.image_path)) {
                        try { await zapfitApi.uploadGearImage(serverId||g.id, g.image_path); } catch(e){ errors.push(`image: ${e.message}`); }
                    }
                    pushed++;
                } catch(e){ errors.push(`gear ${g.name}: ${e.message}`); }
            }
            const unsynced = localGears.filter(g=> !g.server_id);
            // also consider pushing updates for already-synced gears? skip for now
            db.saveDatabase();
            return { success:true, pushed, total: localGears.length, errors: errors.slice(0,5) };
        } catch(e){ return { success:false, error:e.message }; }
    });
    ipcMain.handle('zapfit-create-gear', async (_event, data) => {
        try { const r=await zapfitApi.createGear(data); return { success:true, gear:r }; } catch(e){ return { success:false, error:e.message };}
    });

    // --- PULL extras ---
    ipcMain.handle('zapfit-get-health-stats', async (_event, date) => {
        try { const d=await zapfitApi.getHealthStatsDaily(date||null); return { success:true, data:d }; } catch(e){ return { success:false, error:e.message };}
    });
    ipcMain.handle('zapfit-get-health-targets', async () => {
        try { const d=await zapfitApi.getHealthTargets(); return { success:true, data:d }; } catch(e){ return { success:false, error:e.message };}
    });
    ipcMain.handle('zapfit-get-nutrition', async (_event, params) => {
        try { const d=await zapfitApi.getNutrition(params||{}); return { success:true, data:d }; } catch(e){ return { success:false, error:e.message };}
    });
    ipcMain.handle('zapfit-create-nutrition', async (_event, data) => {
        try { const d=await zapfitApi.createNutrition(data); return { success:true, data:d }; } catch(e){ return { success:false, error:e.message };}
    });
    // Пул питания с сервера: upsert по server_id (мобильный merge сервер-first)
    ipcMain.handle('zapfit-sync-nutrition', async (_event, params = {}) => {
        try {
            const raw = await zapfitApi.getNutrition(params || {});
            const logs = Array.isArray(raw) ? raw : (raw.records || raw.data || []);
            let synced = 0;
            try {
                const cols = db.query('PRAGMA table_info(nutrition_data)').map(c => c.name);
                if (!cols.includes('server_id')) {
                    try { db.prepare('ALTER TABLE nutrition_data ADD COLUMN server_id INTEGER').run(); } catch (_) {}
                }
            } catch (_) {}
            for (const lg of (logs || [])) {
                try {
                    const sid = lg.id ?? lg.log_id ?? null;
                    if (sid == null) continue;
                    const d = String(lg.date || lg.logged_at || lg.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0];
                    const dish = lg.product_name || lg.dish_name || lg.name || 'Приём пищи';
                    const cal = Number(lg.calories ?? 0) || 0;
                    const prot = Number(lg.protein ?? 0) || 0;
                    const carbs = Number(lg.carbs ?? 0) || 0;
                    const fat = Number(lg.fat ?? 0) || 0;
                    const notes = [lg.meal_type, lg.portion_g ? `${lg.portion_g}г` : null].filter(Boolean).join(' ');
                    const ex = db.query('SELECT id FROM nutrition_data WHERE server_id=?', [sid]);
                    if (ex.length) {
                        db.run('UPDATE nutrition_data SET date=?, dish_name=?, calories=?, protein=?, carbs=?, fat=?, notes=? WHERE server_id=?',
                            [d, dish, cal, prot, carbs, fat, notes || null, sid]);
                    } else {
                        db.run('INSERT INTO nutrition_data (date, dish_name, calories, protein, carbs, fat, notes, server_id) VALUES (?,?,?,?,?,?,?,?)',
                            [d, dish, cal, prot, carbs, fat, notes || null, sid]);
                    }
                    synced++;
                } catch (eRec) { console.error('[zapfit] nutrition record skip:', eRec.message); }
            }
            db.saveDatabase();
            return { success: true, synced };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-get-goals', async () => {
        try { const d=await zapfitApi.getProfileGoals(); return { success:true, data:d }; } catch(e){ return { success:false, error:e.message };}
    });
    ipcMain.handle('zapfit-get-goals-progress', async () => {
        try { const d=await zapfitApi.getProfileGoalsProgress(); return { success:true, data:d }; } catch(e){ return { success:false, error:e.message };}
    });
    ipcMain.handle('zapfit-create-goal', async (_e, data) => {
        try { const d=await zapfitApi.createProfileGoal(data); return { success:true, data:d }; } catch(e){ return { success:false, error:e.message };}
    });
    ipcMain.handle('zapfit-delete-goal', async (_e, goalId) => {
        try { await zapfitApi.deleteProfileGoal(goalId); return { success:true }; } catch(e){ return { success:false, error:e.message };}
    });
    ipcMain.handle('zapfit-search-users', async (_event, q) => {
        try { const d=await zapfitApi.searchUsers(q); return { success:true, users:d }; } catch(e){ return { success:false, error:e.message };}
    });
    ipcMain.handle('zapfit-push-profile', async () => {
        try {
            const u = db.prepare('SELECT * FROM users LIMIT 1').get();
            if(!u) return { success:false, error:'no local user' };
            const payload = { name: u.name, weight: u.weight, height: u.height, ftp: u.ftp, resting_heart_rate: u.resting_hr, max_heart_rate: u.max_hr, birthdate: u.birth_date };
            const res = await zapfitApi.updateProfile(payload);
            return { success:true, profile: res };
        } catch(e){ return { success:false, error:e.message };}
    });

    ipcMain.handle('zapfit-get-gears', async () => {
        try {
            const gears = await zapfitApi.getGears();
            return { success: true, gears };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-sync-gears', async () => {
        try {
            ensureActivitiesCols();
            const raw = await zapfitApi.getGears();
            const list = Array.isArray(raw) ? raw : (raw.records || raw.data || []);
            // ensure columns exist
            try {
                const cols = db.query("PRAGMA table_info(gears)").map(c=>c.name);
                if (!cols.includes('server_id')) try { db.prepare("ALTER TABLE gears ADD COLUMN server_id INTEGER").run(); } catch(e){ console.warn('[gears] add server_id', e.message); }
                if (!cols.includes('server_image')) db.prepare("ALTER TABLE gears ADD COLUMN server_image TEXT").run();
                if (!cols.includes('total_distance')) db.prepare("ALTER TABLE gears ADD COLUMN total_distance REAL").run();
                if (!cols.includes('image_path')) db.prepare("ALTER TABLE gears ADD COLUMN image_path TEXT").run();
                try { db.prepare("CREATE INDEX IF NOT EXISTS idx_gears_server_id ON gears(server_id)").run(); } catch(_){}
            } catch(_){}
            let imported=0, updated=0;
            for (const g of list) {
                const serverId = g.id;
                const nickname = g.nickname || g.name || 'Gear';
                const gearType = g.gear_type ?? g.type ?? 1;
                const typeLabel = (()=>{ const m={1:'Велосипед',2:'Кроссовки',3:'Гидрокостюм',4:'Ракетка',5:'Лыжи',6:'Сноуборд'}; return m[gearType] || String(gearType); })();
                const brand = g.brand || null;
                const model = g.model || null;
                let dist = g.total_distance || g.totalDistance || 0;
                let totTime = g.total_time || 0;
                const initKm = g.initial_kms ?? g.initial_distance ?? 0;
                // Try to fetch detailed stats + gear_images (server has total_distance/total_time per gear)
                try {
                    const detRes = await zapfitApi._request('GET', `/api/v1/gears/id/${g.id}`);
                    if (detRes.ok) { const det = await detRes.json(); if (det) { if (det.total_distance != null) dist = det.total_distance; if (det.total_time != null) totTime = det.total_time; } }
                } catch(_){}
                // try download image: first via gear_images carousel, then fallback to photo_path
                let imagePath = g.photo_path || g.image || g.avatar || null;
                let localImage = null;
                try {
                    const imgRes = await zapfitApi._request('GET', `/api/v1/gear_images/gear/${g.id}`);
                    if (imgRes.ok) {
                        const imgs = await imgRes.json();
                        const arrImg = Array.isArray(imgs) ? imgs : (imgs.records||[]);
                        if (arrImg.length && arrImg[0].image_url) imagePath = arrImg[0].image_url;
                        else if (arrImg.length && arrImg[0].image_path) imagePath = arrImg[0].image_path.startsWith('/') ? arrImg[0].image_path : `/gear_images/${arrImg[0].image_path.split('/').pop()}`;
                    }
                } catch(_){}
                if (imagePath) {
                    try {
                        const buf = await zapfitApi.getImageBytes(imagePath);
                        const dir = path.join(app.getPath('userData'), 'gear_images');
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
                        const ext = '.jpg';
                        const fileName = `gear_${serverId}${ext}`;
                        const fp = path.join(dir, fileName);
                        fs.writeFileSync(fp, buf);
                        localImage = fp;
                    } catch(e){ /* no image */ }
                } else if (g.id) {
                    // probe common path
                    try {
                        const probe = `/gear_images/${g.id}.jpg`;
                        const buf = await zapfitApi.getImageBytes(probe);
                        const dir = path.join(app.getPath('userData'), 'gear_images');
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
                        const fp = path.join(dir, `gear_${serverId}.jpg`);
                        fs.writeFileSync(fp, buf);
                        localImage = fp;
                        imagePath = probe;
                    } catch(_){}
                }
                const existing = serverId ? db.query('SELECT id FROM gears WHERE server_id=?', [serverId]) : [];
                if (existing.length) {
                    db.prepare('UPDATE gears SET name=?, type=?, brand=?, model=?, current_distance=?, initial_distance=?, image_path=?, server_image=?, total_distance=?, total_time=? WHERE server_id=?')
                        .run(nickname, typeLabel, brand, model, dist/1000, initKm, localImage || imagePath, imagePath, dist/1000, totTime, serverId);
                    updated++;
                } else {
                    // also dedup by name+brand
                    const byName = db.query('SELECT id FROM gears WHERE name=? AND brand=?', [nickname, brand || '']);
                    if (byName.length) {
                        db.prepare('UPDATE gears SET server_id=?, type=?, model=?, current_distance=?, image_path=?, server_image=?, total_distance=?, total_time=? WHERE id=?')
                            .run(serverId, typeLabel, model, dist/1000, localImage || imagePath, imagePath, dist/1000, totTime, byName[0].id);
                        updated++;
                    } else {
                        db.prepare('INSERT INTO gears (name, type, brand, model, purchase_date, initial_distance, current_distance, last_reset_distance, last_service_date, server_id, server_image, image_path, total_distance, total_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                            .run(nickname, typeLabel, brand, model, new Date().toISOString().split('T')[0], initKm, dist/1000, initKm, new Date().toISOString(), serverId, imagePath, localImage || imagePath, dist/1000, totTime);
                        imported++;
                    }
                }
            }
            // sync components for each gear -> populate gear_parts table (used by Gears.jsx) + keep pretty string in gears.parts
            for (const g of list) {
                try {
                    const compRes = await zapfitApi._request('GET', `/api/v1/gear_components/gear_id/${g.id}`);
                    if (compRes.ok) {
                        const comps = await compRes.json();
                        const arr = Array.isArray(comps) ? comps : (comps.records || []);
                        const row = db.query('SELECT id FROM gears WHERE server_id=?', [g.id])[0];
                        if (row && arr.length) {
                            const gearRowId = row.id;
                            // keep pretty summary in gears.parts for quick display
                            const pretty = arr.map(c=> `${c.type}: ${c.brand||''} ${c.model||''} (${Math.round((c.currentDistance||0)/10)/100}км, износ ${Math.round((c.wearPercentage!=null?c.wearPercentage:0)*100)||0}%)`).join('; ');
                            try { db.prepare('UPDATE gears SET parts=? WHERE id=?').run(pretty.slice(0,500), gearRowId); } catch(_){}
                            // populate gear_parts table — Gears.jsx reads from here via get-gear-parts
                            for (const c of arr) {
                                const partName = c.type || c.part_name || 'component';
                                const installedAt = c.purchase_date || c.created_at || new Date().toISOString();
                                const installedKm = c.currentDistance != null ? (c.currentDistance/1000) : (c.installed_km || 0);
                                const exists = db.query('SELECT id FROM gear_parts WHERE gear_id=? AND part_name=? AND installed_km=?', [gearRowId, partName, installedKm]);
                                if (!exists.length) {
                                    try { db.prepare('INSERT INTO gear_parts (gear_id, part_name, installed_at, installed_km, notes) VALUES (?,?,?,?,?)').run(gearRowId, partName, installedAt, installedKm, c.notes || `brand:${c.brand||''} model:${c.model||''} wear:${Math.round((c.wearPercentage||0)*100)}%`); } catch(e){ console.warn('[gear_parts insert]',e.message); }
                                }
                            }
                        } else if (row && !arr.length) {
                            // no components on server — leave gear_parts empty but keep pretty empty
                            try { db.prepare('UPDATE gears SET parts=? WHERE id=?').run('', row.id); } catch(_){}
                        }
                    }
                } catch(e){ console.warn('[gear sync components]',e.message); }
            }
            db.saveDatabase();
            return { success: true, imported, updated, total: list.length };
        } catch (e) {
            console.error('[zapfit] sync gears error', e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-get-notifications', async (_event, params) => {
        try {
            const page = params?.page || 1;
            const perPage = params?.perPage || params?.num_records || 50;
            const notifications = await zapfitApi.getNotifications(page, perPage);
            // normalize: ensure array
            const arr = Array.isArray(notifications) ? notifications : (notifications.records || notifications.notifications || []);
            return { success: true, notifications: arr };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-get-notifications-count', async () => {
        try {
            const count = await zapfitApi.getNotificationsCount();
            return { success: true, count };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-mark-notification-read', async (_event, notificationId) => {
        try {
            await zapfitApi.markNotificationRead(notificationId);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-mark-all-notifications-read', async () => {
        try {
            try { await zapfitApi.markAllNotificationsRead(); return { success: true }; } catch(e2){
                // fallback per-item
                const list = await zapfitApi.getNotifications(1, 50);
                const arr = Array.isArray(list) ? list : (list.records || []);
                for(const n of arr) if(!n.read){ try{ await zapfitApi.markNotificationRead(n.id); }catch(_){} }
                return { success: true };
            }
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('zapfit-get-followers', async () => {
        try {
            const followers = await zapfitApi.getFollowers();
            return { success: true, followers };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
    ipcMain.handle('zapfit-get-following', async () => {
        try {
            const following = await zapfitApi.getFollowing();
            return { success: true, following };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
    ipcMain.handle('zapfit-get-friends-feed', async (_e, {page, perPage}) => {
        try {
            const feed = await zapfitApi.getFriendsFeed(page||1, perPage||20);
            return { success: true, feed };
        } catch(e){ return { success:false, error:e.message };}
    });

    // --- Strength workouts (server /api/v1/workouts, parity mobile + web) ---
    ipcMain.handle('zapfit-get-workout-plans', async () => {
        try {
            const plans = await zapfitApi.getWorkoutPlans();
            return { success: true, plans };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-create-workout-plan', async (_e, body) => {
        try {
            const plan = await zapfitApi.createWorkoutPlan(body);
            return { success: true, plan };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-update-workout-plan', async (_e, { planId, body }) => {
        try {
            const plan = await zapfitApi.updateWorkoutPlan(planId, body);
            return { success: true, plan };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-delete-workout-plan', async (_e, planId) => {
        try {
            await zapfitApi.deleteWorkoutPlan(planId);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-get-workout-sessions', async (_e, { dateFrom, dateTo } = {}) => {
        try {
            const sessions = await zapfitApi.getWorkoutSessions(dateFrom, dateTo);
            return { success: true, sessions };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-create-workout-session', async (_e, body) => {
        try {
            const session = await zapfitApi.createWorkoutSession(body);
            return { success: true, session };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-delete-workout-session', async (_e, sessionId) => {
        try {
            await zapfitApi.deleteWorkoutSession(sessionId);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-search-workout-catalog', async (_e, { q, opts } = {}) => {
        try {
            const result = await zapfitApi.searchWorkoutCatalog(q, opts);
            return { success: true, ...result };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-get-catalog-exercise', async (_e, wgerId) => {
        try {
            const exercise = await zapfitApi.getCatalogExercise(wgerId);
            return { success: true, exercise };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-translate-catalog-exercise', async (_e, { wgerId, language } = {}) => {
        try {
            const translation = await zapfitApi.translateCatalogExercise(wgerId, language);
            return { success: true, translation };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-get-workout-ai-status', async () => {
        try {
            const status = await zapfitApi.getWorkoutAiStatus();
            return { success: true, status };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-generate-workout-ai-plan', async (_e, { prompt, language } = {}) => {
        try {
            const draft = await zapfitApi.generateWorkoutAiPlan(prompt, language);
            return { success: true, draft };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // --- Author profiles + comments (feed parity with mobile) ---
    ipcMain.handle('zapfit-get-user-by-id', async (_e, userId) => {
        try {
            const user = await zapfitApi.getUserById(userId);
            return { success: true, user };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-get-activity-comments', async (_e, activityId) => {
        try {
            const comments = await zapfitApi.getActivityComments(activityId);
            return { success: true, comments };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-create-activity-comment', async (_e, { activityId, content } = {}) => {
        try {
            const comment = await zapfitApi.createActivityComment(activityId, content);
            return { success: true, comment };
        } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('zapfit-get-activity-comment-counts', async (_e, activityIds) => {
        try {
            const counts = await zapfitApi.getActivityCommentCounts(activityIds);
            return { success: true, counts };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('zapfit-set-api-key', async (_e, { apiKey, apiPassword }) => {
        try { zapfitApi.setApiKey(apiKey, apiPassword || ''); return { success: true }; }
        catch(e){ return { success:false, error:e.message }; }
    });
    ipcMain.handle('zapfit-get-api-key', async () => {
        try { return { success:true, apiKey: zapfitApi.apiKey || '', hasKey: !!zapfitApi.apiKey }; }
        catch(e){ return { success:false, error:e.message }; }
    });
    ipcMain.handle('zapfit-set-mfa-secret', async (_e, { secret }) => {
        try { zapfitApi.setMfaSecret(secret); return { success: true }; }
        catch(e){ return { success:false, error:e.message }; }
    });
    ipcMain.handle('zapfit-get-mfa-secret', async () => {
        try { return { success:true, secret: zapfitApi.getMfaSecret() || '' }; }
        catch(e){ return { success:false, error:e.message }; }
    });
    ipcMain.handle('zapfit-sync-all', async () => {
        ensureActivitiesCols();
        // Full parity sync: activities + health + gears + profile — like mobile syncAll()
        const res = { profile: null, activities: null, health: null, gears: null };
        // profile first
        try { const p = await zapfitApi.fetchProfile(); syncProfileToLocal(p); res.profile={success:true}; } catch(e){ res.profile={success:false, error:e.message}; }
        try {
            // call the improved activities handler logic via direct invoke of the same code
            // we duplicate minimal but robust path: refresh + paginated
            const toKm = (d)=> { const n=Number(d); return isNaN(n)?0:(n>500?n/1000:n); };
            const norm = (v)=> !v?[]:(Array.isArray(v)?v:(v.records? v.records:(v.data? v.data:[])));
            let refresh=[], paged=[];
            try{ refresh = norm(await zapfitApi.getActivitiesRefresh()); }catch(_){}
            try{ paged = norm(await zapfitApi.getAllActivities(50)); }catch{ try{ paged = norm(await zapfitApi.getActivities(1,100)); }catch(_){} }
            const merged=[]; const seen=new Set();
            for(const arr of [refresh,paged]) for(const a of arr){ const id=a.id??a.activity_id; if(id!=null){ if(seen.has(id)) continue; seen.add(id);} merged.push(a); }
            let imported=0, updated=0, skipped=0;
            let _ftp2=200,_max2=200,_rest2=60; try{ const u=db.prepare('SELECT ftp,max_hr,resting_hr FROM users LIMIT 1').get(); if(u){_ftp2=u.ftp||200;_max2=u.max_hr||200;_rest2=u.resting_hr||60;}}catch(_){}
            const _tss2 = (act,dur,pwr,hr)=>{ let t=act.tss??act.training_stress_score??act.trimp??act.hr_tss??null; if(t!=null&&Number(t)>0) return Math.round(Number(t)); if(pwr&&pwr>0&&dur>0) return Math.round((dur*pwr)/(_ftp2*3600)*100); if(hr&&hr>0&&dur>0){ const h=dur/3600; const r=Math.max(1,_max2-_rest2); const v=h*((hr-_rest2)/r)*100; return Math.round(v>0?v:0); } if(dur>0) return Math.round((dur/3600)*30); return 0; };
            for(const act of merged){
                const sid=act.id??act.activity_id??null;
                const title=act.name||act.title||'Activity';
                const st=act.start_time||act.started_at||act.date||new Date().toISOString();
                const dist=toKm(act.distance);
                const dur=act.total_timer_time||act.duration||0;
                const pwr=act.average_power||act.avg_power||null;
                const hr=act.average_hr||act.avg_hr||null;
                const tss=_tss2(act,dur,pwr,hr);
                const thumb=act.map_thumbnail_path||act.thumbnail_path||act.map_thumbnail||null;
                const ex = sid ? db.query('SELECT id FROM activities WHERE server_id=?',[sid]) : [];
                if(ex.length){
                    try{ db.run(`UPDATE activities SET title=?, date=?, start_time=?, end_time=?, distance=?, duration=?, elevation_gain=?, avg_hr=?, max_hr=?, avg_speed=?, map_thumbnail_path=?, tss=?, server_id=? WHERE server_id=?`,[title,st,st,act.end_time||null,dist,dur,act.elevation_gain||0,hr,act.max_hr||null,act.average_speed||0,thumb,tss,sid,sid]); updated++; }catch(_){}
                    continue;
                }
                try{ db.run(`INSERT INTO activities (title,date,start_time,end_time,distance,duration,elevation_gain,avg_hr,max_hr,avg_speed,map_thumbnail_path,tss,server_id,gpx_path,points) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[title,st,st,act.end_time||null,dist,dur,act.elevation_gain||0,hr,act.max_hr||null,act.average_speed||0,thumb,tss,sid,'server','[]']); imported++; }catch(e){ skipped++; }
            }
            try{ db.prepare("DELETE FROM activities WHERE id NOT IN (SELECT MIN(id) FROM activities WHERE server_id IS NOT NULL GROUP BY server_id) AND server_id IS NOT NULL").run(); }catch(e){}
            db.saveDatabase();
            res.activities={success:true, imported, updated, skipped, total:merged.length};
        } catch(e){ res.activities={success:false,error:e.message}; }
        // health: reuse zapfit-sync-health logic inline (cover all types incl heart_rate)
        try {
            const toA = (v)=> !v?[]:(Array.isArray(v)?v:(v.records? v.records:[]));
            let s=0; 
            try{ const cols = db.query("PRAGMA table_info(gears)").map(c=>c.name); }catch(_){}
            try{ db.prepare(`CREATE TABLE IF NOT EXISTS heart_rate_records (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp_ms INTEGER, bpm INTEGER, source TEXT, is_synced INTEGER DEFAULT 1, date TEXT)`).run(); }catch(_){}
            for(const t of ['weight','sleep','steps','water']){
                try{
                    const raw=await zapfitApi.getHealthRecords(t); const arr=toA(raw); s+=arr.length;
                    for(const rec of arr){
                        const d=(rec.date||rec.created_at||new Date().toISOString()).split('T')[0];
                        // Без UNIQUE(type,date) REPLACE плодит дубли — чистим день явно (DELETE+INSERT)
                        if(t==='weight') { db.run(`DELETE FROM health_metrics WHERE type='weight' AND date=?`,[d]); db.run(`INSERT INTO health_metrics (type,value,date) VALUES ('weight',?,?)`,[rec.weight??rec.value,d]); }
                        if(t==='water') {
                            const ml=Math.max(0, Math.round(Number(rec.amount_ml||rec.ml||rec.value||0))||0);
                            if(ml>0){
                                const row=db.query('SELECT ml, pushed_ml, is_synced FROM water WHERE date=?',[d])[0];
                                const merged=Math.max(Number(row?.ml)||0, ml);
                                if(row) db.run('UPDATE water SET ml=?, pushed_ml=?, updated_at=datetime("now") WHERE date=?',[merged, Math.max(Number(row?.pushed_ml)||0, ml), d]);
                                else db.run('INSERT INTO water (date, ml, updated_at, is_synced, pushed_ml) VALUES (?,?,datetime("now"),1,?)',[d, merged, ml]);
                            }
                        }
                        if(t==='steps') { db.run(`DELETE FROM health_metrics WHERE type='steps' AND date=?`,[d]); db.run(`INSERT INTO health_metrics (type,value,date) VALUES ('steps',?,?)`,[rec.steps??rec.value,d]); }
                        if(t==='sleep'){
                            const durSec=rec.total_sleep_seconds??rec.duration??0; const hrs=durSec?durSec/3600:0;
                            const quality=rec.sleep_score_overall??rec.quality??3;
                            const ex=db.query('SELECT id FROM sleep_data WHERE date=?',[d]);
                            if(ex.length) db.run(`UPDATE sleep_data SET duration=?, quality=?, notes=?, sleep_duration_hours=?, sleep_quality=? WHERE date=?`,[durSec, quality, rec.notes||'', hrs, quality, d]);
                            else db.run(`INSERT INTO sleep_data (date, duration, quality, notes, sleep_duration_hours, sleep_quality) VALUES (?,?,?,?,?,?)`,[d, durSec, quality, rec.notes||'', hrs, quality]);
                        }

                    }
                }catch(_){}
            }
            db.saveDatabase(); res.health={success:true, synced:s};
        } catch(e){ res.health={success:false,error:e.message}; }
        // gears with images
        try {
            const raw = await zapfitApi.getGears(); const list = Array.isArray(raw) ? raw : (raw.records || []);
            let imported=0, updated=0;
            try{
                const cols = db.query("PRAGMA table_info(gears)").map(c=>c.name);
                if(!cols.includes('server_id')) try{ db.prepare("ALTER TABLE gears ADD COLUMN server_id INTEGER").run(); } catch(e){ console.warn('[gears] add server_id',e.message); }
                if(!cols.includes('server_image')) db.prepare("ALTER TABLE gears ADD COLUMN server_image TEXT").run();
                if(!cols.includes('image_path')) db.prepare("ALTER TABLE gears ADD COLUMN image_path TEXT").run();
                if(!cols.includes('total_distance')) db.prepare("ALTER TABLE gears ADD COLUMN total_distance REAL").run();
                try{ db.prepare("CREATE INDEX IF NOT EXISTS idx_gears_server_id ON gears(server_id)").run(); }catch(_){}
            }catch(_){}
            for(const g of list){
                const sid=g.id; const nickname=g.nickname||g.name||'Gear'; const gearType=g.gear_type??1;
                const typeLabel=({1:'Велосипед',2:'Кроссовки',3:'Гидрокостюм'}[gearType]||String(gearType));
                const brand=g.brand||null, model=g.model||null; let dist=g.total_distance||0; let totTime=g.total_time||0; const initKm=g.initial_kms??0;
                try{ const detRes = await zapfitApi._request('GET', `/api/v1/gears/id/${sid}`); if(detRes.ok){ const det=await detRes.json(); if(det.total_distance!=null) dist=det.total_distance; if(det.total_time!=null) totTime=det.total_time; } }catch(_){}
                let imagePath=g.photo_path||g.image||null; let local=null;
                try{ const imgRes = await zapfitApi._request('GET', `/api/v1/gear_images/gear/${sid}`); if(imgRes.ok){ const imgs=await imgRes.json(); const arrImg=Array.isArray(imgs)?imgs:(imgs.records||[]); if(arrImg.length&&arrImg[0].image_url) imagePath=arrImg[0].image_url; else if(arrImg.length&&arrImg[0].image_path) imagePath=arrImg[0].image_path.startsWith('/')?arrImg[0].image_path:`/gear_images/${arrImg[0].image_path.split('/').pop()}`; } }catch(_){}
                if(imagePath){ try{ const buf=await zapfitApi.getImageBytes(imagePath); const dir=path.join(app.getPath('userData'),'gear_images'); if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); const fp=path.join(dir,`gear_${sid}.jpg`); fs.writeFileSync(fp,buf); local=fp; }catch(_){} }
                const ex = sid ? db.query('SELECT id FROM gears WHERE server_id=?',[sid]) : [];
                if(ex.length){ db.prepare('UPDATE gears SET name=?, type=?, brand=?, model=?, current_distance=?, initial_distance=?, image_path=?, server_image=?, total_distance=?, total_time=? WHERE server_id=?').run(nickname,typeLabel,brand,model,dist/1000,initKm,local||imagePath,imagePath,dist/1000,totTime,sid); updated++; }
                else {
                    const byName=db.query('SELECT id FROM gears WHERE name=? AND brand=?',[nickname, brand||'']);
                    if(byName.length){ db.prepare('UPDATE gears SET server_id=?, type=?, model=?, current_distance=?, image_path=?, server_image=?, total_distance=?, total_time=? WHERE id=?').run(sid,typeLabel,model,dist/1000,local||imagePath,imagePath,dist/1000,totTime,byName[0].id); updated++; }
                    else{ db.prepare('INSERT INTO gears (name,type,brand,model,purchase_date,initial_distance,current_distance,last_reset_distance,last_service_date,server_id,server_image,image_path,total_distance,total_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(nickname,typeLabel,brand,model,new Date().toISOString().split('T')[0],initKm,dist/1000,initKm,new Date().toISOString(),sid,imagePath,local||imagePath,dist/1000,totTime); imported++; }
                }
            }
            db.saveDatabase(); res.gears={success:true, imported, updated, count:list.length};
        } catch(e){ res.gears={success:false,error:e.message}; }
        return { success:true, ...res };
    });
}

    // manual repair - call from DevTools: window.electronAPI.repairDb()
    ipcMain.handle('repair-db', async () => {
        try { ensureActivitiesCols(); return { success:true, msg:'DB columns ensured' }; } catch(e){ return {success:false, error:e.message}; }
    });

    ipcMain.handle('debug-db-schema', async () => {
        try {
            const act = db.query("PRAGMA table_info(activities)").map(c=>c.name);
            const gears = db.query("PRAGMA table_info(gears)").map(c=>c.name);
            const sleep = db.query("PRAGMA table_info(sleep_data)").map(c=>c.name);
            return { success:true, activities: act, gears, sleep };
        } catch(e){ return {success:false, error:e.message}; }
    });

// Register Zapfit handlers alongside existing ones
registerZapfitHandlers();

// Backward-compat aliases: old endurain-* channels still handled (for old renderers / caches)
(function registerLegacyEndurainAliases(){
  const map = [
    ['endurain-configure','zapfit-configure'],
    ['endurain-login','zapfit-login'],
    ['endurain-login-mfa','zapfit-login-mfa'],
    ['endurain-logout','zapfit-logout'],
    ['endurain-disconnect','zapfit-disconnect'],
    ['endurain-status','zapfit-status'],
    ['endurain-get-profile','zapfit-get-profile'],
    ['endurain-get-activities','zapfit-get-activities'],
    ['endurain-sync-activities','zapfit-sync-activities'],
    ['endurain-sync-health','zapfit-sync-health'],
    ['endurain-get-gears','zapfit-get-gears'],
    ['endurain-get-notifications','zapfit-get-notifications'],
    ['endurain-mark-notification-read','zapfit-mark-notification-read'],
    ['endurain-get-followers','zapfit-get-followers'],
    ['endurain-get-image','zapfit-get-image'],
    ['endurain-get-activity-media','zapfit-get-activity-media'],
  ];
  for (const [oldCh, newCh] of map) {
    if (ipcMain._handlers && ipcMain._handlers[oldCh]) continue;
    // Re-register by invoking same handler via ipcMain.handle wrapper that forwards
    ipcMain.handle(oldCh, async (e, ...args) => {
      // forward to zapfit handler by direct api call is simpler: just invoke zapfit logic via ipcMain.invoke fallback
      // Instead, directly call zapfitApi logic duplicated - easiest: call the zapfit handler via internal emit
      // For simplicity, handle known channels directly:
      try {
        if (oldCh === 'endurain-configure') return await zapfitApi.configureServer(args[0]).then(s=>({success:true, settings:s})).catch(err=>({success:false, error:err.message}));
        if (oldCh === 'endurain-status') return { configured: zapfitApi.isConfigured, authenticated: zapfitApi.isAuthenticated, serverUrl: zapfitApi.serverUrl, userId: zapfitApi.userId };
        if (oldCh === 'endurain-logout') { await zapfitApi.logout(); return {success:true}; }
        if (oldCh === 'endurain-disconnect') { await zapfitApi.clearServer(); return {success:true}; }
      } catch(err){ return {success:false, error:err.message}; }
      // For other channels, generic forward via ipcMain invoke is not available, so return fallback that encourages refresh
      return { success: false, error: 'Legacy channel deprecated, use zapfit-*' };
    });
  }
})();
