const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'ZAPFIT.db');
console.log('Database path:', dbPath);

let db = null;
let SQL = null;
let initialized = false;

// Инициализация базы данных
async function initializeDatabase() {
    if (initialized) return db;
    
    SQL = await initSqlJs();
    
    // Загружаем базу из файла если она существует
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }
    
    // Инициализация таблиц
    executeSync(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT DEFAULT 'Атлет',
            avatar_path TEXT,
            ftp INTEGER DEFAULT 200,
            weight INTEGER DEFAULT 75,
            birth_date TEXT,
            height REAL DEFAULT 180,
            resting_hr INTEGER DEFAULT 60,
            max_hr INTEGER DEFAULT 200
        );
        
        CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            date TEXT,
            distance REAL,
            duration INTEGER,
            elevation_gain REAL,
            avg_power REAL,
            avg_hr INTEGER,
            max_hr INTEGER,
            avg_speed REAL,
            tss REAL,
            gpx_path TEXT,
            type TEXT DEFAULT 'Ride',
            points TEXT,
            ctl REAL DEFAULT 0,
            atl REAL DEFAULT 0,
            tsb REAL DEFAULT 0,
            gear_id INTEGER,
            rpe INTEGER,
            moving_time INTEGER,
            stopped_time INTEGER,
            max_speed REAL,
            ascent REAL,
            descent REAL,
            min_elevation REAL,
            max_elevation REAL,
            avg_gradient REAL,
            max_gradient REAL,
            gps_accuracy REAL,
            track_segments INTEGER,
            num_points INTEGER,
            median_speed REAL,
            speed_stddev REAL
        );

        CREATE TABLE IF NOT EXISTS training_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            start_date TEXT,
            end_date TEXT,
            periodization_type TEXT DEFAULT 'linear',
            goal TEXT,
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
            note TEXT,
            start TEXT,
            end TEXT,
            hrv REAL,
            resting_hr REAL,
            source TEXT,
            user_id INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS gears (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            type TEXT,
            brand TEXT,
            model TEXT,
            purchase_date TEXT,
            initial_distance REAL DEFAULT 0,
            current_distance REAL DEFAULT 0,
            last_service_date TEXT,
            notes TEXT,
            last_reset_distance REAL DEFAULT 0,
            life_km REAL,
            parts TEXT,
            is_primary INTEGER DEFAULT 0,
            icon TEXT,
            wheel_size TEXT,
            brake_type TEXT,
            distance REAL,
            status TEXT
        );

        CREATE TABLE IF NOT EXISTS water (
            date TEXT PRIMARY KEY,
            ml INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS water_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount INTEGER,
            time TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS competitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            date TEXT,
            location TEXT,
            prize_place TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS water_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            glasses INTEGER,
            liters REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS training_plan (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            title TEXT,
            type TEXT,
            notes TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS training_weeks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER,
            week_number INTEGER,
            focus_type TEXT,
            intensity_level REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS training_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_id INTEGER,
            day_of_week INTEGER,
            session_type TEXT,
            duration_minutes REAL,
            intensity_level REAL,
            notes TEXT,
            tss REAL DEFAULT 0,
            completed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS standard_dishes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            category TEXT,
            calories REAL,
            protein REAL,
            fat REAL,
            carbs REAL,
            portion_size TEXT DEFAULT '100g',
            portion_grams REAL DEFAULT 100
        );

        CREATE TABLE IF NOT EXISTS dish_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT UNIQUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sleep_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            duration INTEGER,
            quality TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS fitness_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE,
            ctl REAL DEFAULT 0,
            atl REAL DEFAULT 0,
            tsb REAL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            goal_type TEXT DEFAULT 'distance',
            target_value REAL,
            current_value REAL,
            unit TEXT DEFAULT 'км',
            start_date TEXT,
            target_date TEXT,
            status TEXT DEFAULT 'active',
            progress_percent REAL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS nutrition_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            dish_name TEXT,
            calories REAL,
            protein REAL,
            carbs REAL,
            fat REAL,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Проверяем и устанавливаем дефолтные значения
    const waterCupCheck = query('SELECT * FROM settings WHERE key = "waterCupMl"');
    if (waterCupCheck.length === 0) {
        run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['waterCupMl', '200']);
    }

    // Создаем дефолтного пользователя
    const userCount = query('SELECT COUNT(*) as count FROM users');
    if (userCount.length === 0 || userCount[0].count === 0) {
        run('INSERT INTO users (name) VALUES (?)', ['Новый Атлет']);
    }

    // Миграция для таблицы goals - добавляем отсутствующие колонки
    try {
        const goalsTableInfo = query('PRAGMA table_info(goals)');
        const columnNames = goalsTableInfo.map(col => col.name);
        
        if (!columnNames.includes('goal_type')) {
            executeSync('ALTER TABLE goals ADD COLUMN goal_type TEXT DEFAULT "distance"');
        }
        if (!columnNames.includes('unit')) {
            executeSync('ALTER TABLE goals ADD COLUMN unit TEXT DEFAULT "км"');
        }
        if (!columnNames.includes('start_date')) {
            executeSync('ALTER TABLE goals ADD COLUMN start_date TEXT');
        }
        if (!columnNames.includes('target_date')) {
            executeSync('ALTER TABLE goals ADD COLUMN target_date TEXT');
        }
        if (!columnNames.includes('progress_percent')) {
            executeSync('ALTER TABLE goals ADD COLUMN progress_percent REAL DEFAULT 0');
        }
    } catch (e) {
        console.warn('Goals migration error (may be normal for new DB):', e.message);
    }

    // Миграция для таблицы activities - добавляем колонку photos
    try {
        const activitiesTableInfo = query('PRAGMA table_info(activities)');
        const activityColumnNames = activitiesTableInfo.map(col => col.name);
        
        if (!activityColumnNames.includes('photos')) {
            console.log('[DB] Adding photos column to activities table');
            executeSync('ALTER TABLE activities ADD COLUMN photos TEXT');
        }
    } catch (e) {
        console.warn('Activities migration error (may be normal for new DB):', e.message);
    }

    // Миграция для таблицы fitness_data - добавляем колонки ctl, atl, tsb
    try {
        const fitnessTableInfo = query('PRAGMA table_info(fitness_data)');
        const fitnessColumnNames = fitnessTableInfo.map(col => col.name);
        
        if (!fitnessColumnNames.includes('ctl')) {
            console.log('[DB] Adding fitness columns to fitness_data table');
            executeSync('ALTER TABLE fitness_data ADD COLUMN ctl REAL DEFAULT 0');
            executeSync('ALTER TABLE fitness_data ADD COLUMN atl REAL DEFAULT 0');
            executeSync('ALTER TABLE fitness_data ADD COLUMN tsb REAL DEFAULT 0');
        }
    } catch (e) {
        console.warn('Fitness data migration error (may be normal for new DB):', e.message);
    }

    // Миграция для таблицы activities - серверные поля (паритет с мобилой)
    try {
        const actInfo = query('PRAGMA table_info(activities)');
        const cols = actInfo.map(c => c.name);
        const add = (col, def) => {
            if (!cols.includes(col)) {
                console.log(`[DB] Adding ${col} to activities`);
                // UNIQUE нельзя добавлять на непустую таблицу - добавляем без UNIQUE, потом индекс
                const safeDef = def.replace(' UNIQUE','').replace('UNIQUE','').trim();
                try { executeSync(`ALTER TABLE activities ADD COLUMN ${col} ${safeDef}`); } catch (e2) { console.warn(`[DB] add ${col} failed:`, e2.message); }
            }
        };
        add('server_id', 'INTEGER');
        add('map_thumbnail_path', 'TEXT');
        add('comments', 'TEXT');
        add('visibility', 'INTEGER DEFAULT 0');
        add('calories', 'REAL');
        add('average_cad', 'REAL');
        add('max_cad', 'REAL');
        add('average_power', 'REAL');
        add('max_power', 'REAL');
        add('normalized_power', 'REAL');
        add('workout_rpe', 'REAL');
        add('workout_feeling', 'INTEGER');
        add('start_time', 'TEXT');
        add('end_time', 'TEXT');
        add('activity_type', 'INTEGER');
        // Индекс для дедупа по server_id (не UNIQUE, чтобы не ломать NULL дубли)
        try { executeSync('CREATE INDEX IF NOT EXISTS idx_activities_server_id ON activities(server_id)'); } catch(_){}
    } catch (e) {
        console.warn('Activities server migration error:', e.message);
    }

    // Миграция sleep_data - parity с мобилой и ZAPFIT server
    try {
        const sInfo = query('PRAGMA table_info(sleep_data)');
        const sCols = sInfo.map(c => c.name);
        const sAdd = (col, def) => {
            if (!sCols.includes(col)) {
                console.log(`[DB] Adding ${col} to sleep_data`);
                try { executeSync(`ALTER TABLE sleep_data ADD COLUMN ${col} ${def}`); } catch(e2){ console.warn(`[DB] add sleep ${col} failed:`, e2.message); }
            }
        };
        sAdd('start_time', 'TEXT');
        sAdd('end_time', 'TEXT');
        sAdd('sleep_duration_hours', 'REAL');
        sAdd('sleep_quality', 'INTEGER');
        sAdd('sleep_start_time_gmt', 'TEXT');
        sAdd('sleep_end_time_gmt', 'TEXT');
        sAdd('total_sleep_seconds', 'INTEGER');
        // Детали для карточки сна (parity с мобилой): стадии, пульс, скор
        sAdd('deep_sleep_seconds', 'INTEGER');
        sAdd('light_sleep_seconds', 'INTEGER');
        sAdd('rem_sleep_seconds', 'INTEGER');
        sAdd('awake_sleep_seconds', 'INTEGER');
        sAdd('avg_heart_rate', 'INTEGER');
        sAdd('resting_heart_rate', 'INTEGER');
        sAdd('score_overall', 'INTEGER');
    } catch (e) { console.warn('Sleep migration error:', e.message); }

    // Миграция water — флаги серверного синка (push дельтами, merge по max)
    try {
        const wInfo = query('PRAGMA table_info(water)');
        const wCols = wInfo.map(c => c.name);
        const wAdd = (col, def) => {
            if (!wCols.includes(col)) {
                console.log(`[DB] Adding ${col} to water`);
                try { executeSync(`ALTER TABLE water ADD COLUMN ${col} ${def}`); } catch(e2){ console.warn(`[DB] add water ${col} failed:`, e2.message); }
            }
        };
        wAdd('is_synced', 'INTEGER DEFAULT 1');
        wAdd('pushed_ml', 'REAL DEFAULT 0');
    } catch (e) { console.warn('Water sync migration error:', e.message); }

    // Миграция nutrition_data — server_id для дедупа с сервером
    try {
        const nInfo = query('PRAGMA table_info(nutrition_data)');
        const nCols = nInfo.map(c => c.name);
        if (!nCols.includes('server_id')) {
            console.log('[DB] Adding server_id to nutrition_data');
            try { executeSync('ALTER TABLE nutrition_data ADD COLUMN server_id INTEGER'); } catch(e2){ console.warn('[DB] add nutrition server_id failed:', e2.message); }
        }
        try { executeSync('CREATE INDEX IF NOT EXISTS idx_nutrition_server_id ON nutrition_data(server_id)'); } catch(_){}
    } catch (e) { console.warn('Nutrition migration error:', e.message); }

    // Миграция gears - server_id и доп поля (parity с мобилой)
    try {
        const gInfo = query('PRAGMA table_info(gears)');
        const gCols = gInfo.map(c => c.name);
        const gAdd = (col, def) => {
            if (!gCols.includes(col)) {
                console.log(`[DB] Adding ${col} to gears`);
                const safeDef = def.replace(' UNIQUE','').trim();
                try { executeSync(`ALTER TABLE gears ADD COLUMN ${col} ${safeDef}`); } catch(e2){ console.warn(`[DB] add gear ${col} failed:`, e2.message); }
            }
        };
        gAdd('server_id', 'INTEGER');
        gAdd('server_image', 'TEXT');
        gAdd('total_distance', 'REAL');
        gAdd('image_path', 'TEXT');
        gAdd('totalDistance', 'REAL');
        gAdd('initial_kms', 'REAL');
        gAdd('total_time', 'REAL');
        gAdd('gear_type', 'INTEGER DEFAULT 1');
        gAdd('active', 'INTEGER DEFAULT 1');
        try { executeSync('CREATE INDEX IF NOT EXISTS idx_gears_server_id ON gears(server_id)'); } catch(_){}
    } catch (e) { console.warn('Gears migration error:', e.message); }

    // Инициализируем стандартные блюда
    try {
        const dishesCount = query('SELECT COUNT(*) as count FROM standard_dishes');
        const totalCount = dishesCount.length > 0 ? dishesCount[0].count : 0;
        console.log('[DB] Standard dishes count:', totalCount);
        
        // Проверим, есть ли блюда с пустыми или NULL именами
        const dishWithoutName = query('SELECT COUNT(*) as count FROM standard_dishes WHERE name IS NULL OR name = ""');
        const emptyCount = dishWithoutName.length > 0 ? dishWithoutName[0].count : 0;
        
        // Если нет блюд или много пустых имен, переинициализируем
        if (totalCount === 0 || emptyCount > totalCount * 0.1) {
            console.log('[DB] Re-initializing standard dishes (total:', totalCount, ', empty:', emptyCount, ')');
            initializeStandardDishes();
        } else {
            console.log('[DB] Standard dishes OK (total:', totalCount, ', empty:', emptyCount, ')');
        }
    } catch (e) {
        console.warn('[DB] Error checking standard dishes:', e.message);
        try {
            initializeStandardDishes();
        } catch (e2) {
            console.error('[DB] Failed to initialize standard dishes:', e2.message);
        }
    }

    saveDatabase();
    initialized = true;
    return db;
}

// Инициализация стандартных блюд
function initializeStandardDishes() {
    console.log('[DB] Starting standard dishes initialization...');
    const dishes = [
        // Каши
        { name: 'Гречневая каша', category: 'Каши', calories: 123, protein: 4.3, fat: 1.1, carbs: 25, portion_size: '100g', portion_grams: 100 },
        { name: 'Рисовая каша', category: 'Каши', calories: 97, protein: 2.0, fat: 0.3, carbs: 22.3, portion_size: '100g', portion_grams: 100 },
        { name: 'Овсяная каша', category: 'Каши', calories: 68, protein: 2.4, fat: 1.4, carbs: 12, portion_size: '100g', portion_grams: 100 },
        { name: 'Манная каша', category: 'Каши', calories: 98, protein: 2.3, fat: 0.2, carbs: 21.7, portion_size: '100g', portion_grams: 100 },
        { name: 'Пшеничная каша', category: 'Каши', calories: 102, protein: 3.7, fat: 1.3, carbs: 19.6, portion_size: '100g', portion_grams: 100 },
        { name: 'Перловая каша', category: 'Каши', calories: 109, protein: 3.0, fat: 0.4, carbs: 22, portion_size: '100g', portion_grams: 100 },
        { name: 'Кукурузная каша', category: 'Каши', calories: 86, protein: 1.3, fat: 1.2, carbs: 19, portion_size: '100g', portion_grams: 100 },
        // Макароны
        { name: 'Макаронные изделия', category: 'Макароны', calories: 131, protein: 4.6, fat: 1.1, carbs: 25, portion_size: '100g', portion_grams: 100 },
        { name: 'Спагетти', category: 'Макароны', calories: 131, protein: 4.6, fat: 1.1, carbs: 25, portion_size: '100g', portion_grams: 100 },
        // Салаты
        { name: 'Салат Оливье', category: 'Салаты', calories: 150, protein: 6, fat: 7, carbs: 12, portion_size: '100g', portion_grams: 100 },
        { name: 'Салат Цезарь', category: 'Салаты', calories: 180, protein: 12, fat: 10, carbs: 8, portion_size: '100g', portion_grams: 100 },
        { name: 'Греческий салат', category: 'Салаты', calories: 130, protein: 7, fat: 9, carbs: 6, portion_size: '100g', portion_grams: 100 },
        // Яйца
        { name: 'Яйцо вареное', category: 'Яйца', calories: 155, protein: 13, fat: 11, carbs: 1.1, portion_size: '100g', portion_grams: 100 },
        { name: 'Яйцо сырое', category: 'Яйца', calories: 157, protein: 13.1, fat: 11.5, carbs: 0.7, portion_size: '100g', portion_grams: 100 },
        { name: 'Яичница', category: 'Яйца', calories: 180, protein: 12, fat: 14, carbs: 1, portion_size: '100g', portion_grams: 100 },
        // Молочное
        { name: 'Молоко', category: 'Молочное', calories: 61, protein: 3.2, fat: 3.3, carbs: 4.8, portion_size: '100ml', portion_grams: 100 },
        { name: 'Йогурт', category: 'Молочное', calories: 59, protein: 3.5, fat: 0.4, carbs: 3.3, portion_size: '100g', portion_grams: 100 },
        { name: 'Кефир', category: 'Молочное', calories: 59, protein: 3.4, fat: 2.5, carbs: 3.8, portion_size: '100ml', portion_grams: 100 },
        { name: 'Творог', category: 'Молочное', calories: 98, protein: 14, fat: 5, carbs: 1.3, portion_size: '100g', portion_grams: 100 },
        { name: 'Сыр', category: 'Молочное', calories: 402, protein: 25, fat: 34, carbs: 1.3, portion_size: '30g', portion_grams: 30 },
        // Мясо
        { name: 'Курица вареная', category: 'Мясо', calories: 137, protein: 29, fat: 3, carbs: 0, portion_size: '100g', portion_grams: 100 },
        { name: 'Курица сырая', category: 'Мясо', calories: 165, protein: 23.6, fat: 7.4, carbs: 0, portion_size: '100g', portion_grams: 100 },
        { name: 'Говядина вареная', category: 'Мясо', calories: 215, protein: 31, fat: 9.5, carbs: 0, portion_size: '100g', portion_grams: 100 },
        { name: 'Свинина', category: 'Мясо', calories: 242, protein: 27.7, fat: 13.7, carbs: 0, portion_size: '100g', portion_grams: 100 },
        { name: 'Фарш куриный', category: 'Мясо', calories: 143, protein: 18, fat: 7.5, carbs: 0, portion_size: '100g', portion_grams: 100 },
        { name: 'Ветчина', category: 'Мясо', calories: 198, protein: 12, fat: 15, carbs: 2, portion_size: '100g', portion_grams: 100 },
        { name: 'Колбаса копченая', category: 'Мясо', calories: 376, protein: 14, fat: 35, carbs: 0, portion_size: '100g', portion_grams: 100 },
        // Рыба
        { name: 'Селедка', category: 'Рыба', calories: 242, protein: 25, fat: 13.5, carbs: 0, portion_size: '100g', portion_grams: 100 },
        { name: 'Лосось', category: 'Рыба', calories: 206, protein: 22, fat: 12, carbs: 0, portion_size: '100g', portion_grams: 100 },
        { name: 'Тунец', category: 'Рыба', calories: 144, protein: 30, fat: 1.3, carbs: 0, portion_size: '100g', portion_grams: 100 },
        { name: 'Минтай', category: 'Рыба', calories: 72, protein: 16, fat: 0.7, carbs: 0, portion_size: '100g', portion_grams: 100 },
        // Фрукты
        { name: 'Банан', category: 'Фрукты', calories: 89, protein: 1.1, fat: 0.3, carbs: 22, portion_size: '100g', portion_grams: 100 },
        { name: 'Яблоко', category: 'Фрукты', calories: 52, protein: 0.3, fat: 0.2, carbs: 13.8, portion_size: '100g', portion_grams: 100 },
        { name: 'Апельсин', category: 'Фрукты', calories: 47, protein: 0.9, fat: 0.1, carbs: 11.8, portion_size: '100g', portion_grams: 100 },
        { name: 'Груша', category: 'Фрукты', calories: 57, protein: 0.4, fat: 0.1, carbs: 15, portion_size: '100g', portion_grams: 100 },
        { name: 'Клубника', category: 'Фрукты', calories: 32, protein: 0.7, fat: 0.3, carbs: 7.7, portion_size: '100g', portion_grams: 100 },
        { name: 'Черника', category: 'Фрукты', calories: 44, protein: 0.7, fat: 0.5, carbs: 10, portion_size: '100g', portion_grams: 100 },
        { name: 'Виноград', category: 'Фрукты', calories: 69, protein: 0.7, fat: 0.2, carbs: 18.1, portion_size: '100g', portion_grams: 100 },
        // Овощи
        { name: 'Морковь', category: 'Овощи', calories: 41, protein: 0.9, fat: 0.2, carbs: 10, portion_size: '100g', portion_grams: 100 },
        { name: 'Помидор', category: 'Овощи', calories: 18, protein: 0.9, fat: 0.2, carbs: 3.9, portion_size: '100g', portion_grams: 100 },
        { name: 'Огурец', category: 'Овощи', calories: 16, protein: 0.7, fat: 0.1, carbs: 3.6, portion_size: '100g', portion_grams: 100 },
        { name: 'Капуста', category: 'Овощи', calories: 25, protein: 1.8, fat: 0.1, carbs: 4.7, portion_size: '100g', portion_grams: 100 },
        { name: 'Брокколи', category: 'Овощи', calories: 31, protein: 2.8, fat: 0.4, carbs: 6.6, portion_size: '100g', portion_grams: 100 },
        { name: 'Картофель вареной', category: 'Овощи', calories: 77, protein: 2, fat: 0.1, carbs: 17, portion_size: '100g', portion_grams: 100 },
        { name: 'Белокочанная капуста', category: 'Овощи', calories: 25, protein: 1.8, fat: 0.1, carbs: 4.7, portion_size: '100g', portion_grams: 100 },
        // Хлеб
        { name: 'Хлеб пшеничный', category: 'Хлеб', calories: 265, protein: 8.4, fat: 3.3, carbs: 49.4, portion_size: '100g', portion_grams: 100 },
        { name: 'Хлеб ржаной', category: 'Хлеб', calories: 259, protein: 8.5, fat: 3.3, carbs: 49.8, portion_size: '100g', portion_grams: 100 },
        { name: 'Хлеб черный', category: 'Хлеб', calories: 202, protein: 6.6, fat: 2.4, carbs: 40.5, portion_size: '100g', portion_grams: 100 },
        { name: 'Хлеб целезерновой', category: 'Хлеб', calories: 227, protein: 9.8, fat: 3.3, carbs: 43.7, portion_size: '100g', portion_grams: 100 },
        // Орехи
        { name: 'Грецкие орехи', category: 'Орехи', calories: 654, protein: 15.2, fat: 65.2, carbs: 7, portion_size: '30g', portion_grams: 30 },
        { name: 'Миндаль', category: 'Орехи', calories: 609, protein: 21.2, fat: 53.7, carbs: 13, portion_size: '30g', portion_grams: 30 },
        { name: 'Кешью', category: 'Орехи', calories: 571, protein: 18.5, fat: 48.4, carbs: 30.2, portion_size: '30g', portion_grams: 30 },
        // Сухофрукты
        { name: 'Изюм', category: 'Сухофрукты', calories: 299, protein: 3.1, fat: 0.5, carbs: 79.5, portion_size: '30g', portion_grams: 30 },
        { name: 'Курага', category: 'Сухофрукты', calories: 215, protein: 3.4, fat: 0.4, carbs: 55.2, portion_size: '30g', portion_grams: 30 },
        { name: 'Финики', category: 'Сухофрукты', calories: 282, protein: 2.5, fat: 0.4, carbs: 75, portion_size: '30g', portion_grams: 30 },
        // Масла
        { name: 'Оливковое масло', category: 'Масла', calories: 884, protein: 0, fat: 100, carbs: 0, portion_size: '10ml', portion_grams: 9.1 },
        { name: 'Сливочное масло', category: 'Масла', calories: 717, protein: 0.9, fat: 82.5, carbs: 0.1, portion_size: '10g', portion_grams: 10 },
        // Соусы
        { name: 'Кетчуп', category: 'Соусы', calories: 99, protein: 1.7, fat: 0.1, carbs: 25.5, portion_size: '20g', portion_grams: 20 },
        { name: 'Майонез', category: 'Соусы', calories: 703, protein: 0.3, fat: 78, carbs: 0.6, portion_size: '15g', portion_grams: 15 },
        { name: 'Сметана', category: 'Соусы', calories: 159, protein: 2.8, fat: 15, carbs: 3.3, portion_size: '50g', portion_grams: 50 },
        // Сладости
        { name: 'Печенье', category: 'Сладости', calories: 407, protein: 7.5, fat: 16, carbs: 62.5, portion_size: '100g', portion_grams: 100 },
        { name: 'Шоколад молочный', category: 'Сладости', calories: 550, protein: 7.7, fat: 36, carbs: 50.6, portion_size: '30g', portion_grams: 30 },
        // Напитки
        { name: 'Вода', category: 'Напитки', calories: 0, protein: 0, fat: 0, carbs: 0, portion_size: '200ml', portion_grams: 200 },
        { name: 'Сок апельсиновый', category: 'Напитки', calories: 42, protein: 0.7, fat: 0.2, carbs: 10, portion_size: '200ml', portion_grams: 200 },
        { name: 'Чай', category: 'Напитки', calories: 1, protein: 0, fat: 0, carbs: 0, portion_size: '200ml', portion_grams: 200 },
        { name: 'Кофе', category: 'Напитки', calories: 1, protein: 0.1, fat: 0, carbs: 0, portion_size: '200ml', portion_grams: 200 },
        // Первые блюда
        { name: 'Борщ', category: 'Первые блюда', calories: 49, protein: 2.6, fat: 1.9, carbs: 6, portion_size: '200ml', portion_grams: 200 },
        { name: 'Щи', category: 'Первые блюда', calories: 14, protein: 1.6, fat: 0.1, carbs: 2.8, portion_size: '200ml', portion_grams: 200 },
        // Вторые блюда
        { name: 'Котлеты куриные', category: 'Вторые блюда', calories: 150, protein: 20, fat: 7, carbs: 5, portion_size: '100g', portion_grams: 100 },
        { name: 'Тефтели', category: 'Вторые блюда', calories: 180, protein: 18, fat: 10, carbs: 6, portion_size: '100g', portion_grams: 100 },
    ];

    const stmt = prepare('INSERT OR IGNORE INTO standard_dishes (name, category, calories, protein, fat, carbs, portion_size, portion_grams) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    let insertedCount = 0;
    for (const dish of dishes) {
        try {
            stmt.run(dish.name, dish.category, dish.calories, dish.protein, dish.fat, dish.carbs, dish.portion_size, dish.portion_grams);
            insertedCount++;
        } catch (e) {
            console.error('[DB] Error inserting dish:', dish.name, e.message);
        }
    }
    console.log('[DB] Initialized', insertedCount, 'standard dishes');
    saveDatabase();
}

// Сохранение базы на диск
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

// Выполнить SQL без параметров
function executeSync(sql) {
    if (!db) throw new Error('Database not initialized');
    try {
        db.run(sql);
    } catch (error) {
        console.error('Execute error:', error, sql);
    }
}

// Выполнить SELECT запрос
function query(sql, params = []) {
    if (!db) throw new Error('Database not initialized');
    
    try {
        const stmt = db.prepare(sql);
        if (params.length > 0) {
            stmt.bind(params);
        }
        
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        
        return results;
    } catch (error) {
        console.error('Query error:', error, sql);
        return [];
    }
}

// Выполнить INSERT/UPDATE/DELETE запрос
function run(sql, params = []) {
    if (!db) throw new Error('Database not initialized');
    
    try {
        const stmt = db.prepare(sql);
        if (params.length > 0) {
            stmt.bind(params);
        }
        stmt.step();
        stmt.free();
        saveDatabase();
        return { changes: db.getRowsModified() };
    } catch (error) {
        console.error('Run error:', error, sql);
        throw error;
    }
}

// Совместимость с better-sqlite3 API - создание statement объекта
function prepare(sql) {
    if (!db) throw new Error('Database not initialized');
    
    let boundParams = [];
    
    return {
        bind: function(params) {
            boundParams = params;
            return this;
        },
        run: function(...args) {
            try {
                const stmt = db.prepare(sql);
                const params = args.length > 0 ? args : boundParams;
                if (params.length > 0) {
                    stmt.bind(params);
                }
                stmt.step();
                const result = { changes: db.getRowsModified() };
                stmt.free();
                saveDatabase();
                return result;
            } catch (error) {
                console.error('Statement run error:', error);
                throw error;
            }
        },
        get: function(...args) {
            try {
                const stmt = db.prepare(sql);
                const params = args.length > 0 ? args : boundParams;
                if (params.length > 0) {
                    stmt.bind(params);
                }
                let result = null;
                if (stmt.step()) {
                    result = stmt.getAsObject();
                }
                stmt.free();
                return result;
            } catch (error) {
                console.error('Statement get error:', error);
                return null;
            }
        },
        all: function(...args) {
            try {
                const stmt = db.prepare(sql);
                const params = args.length > 0 ? args : boundParams;
                if (params.length > 0) {
                    stmt.bind(params);
                }
                const results = [];
                while (stmt.step()) {
                    results.push(stmt.getAsObject());
                }
                stmt.free();
                return results;
            } catch (error) {
                console.error('Statement all error:', error);
                return [];
            }
        }
    };
}

// Совместимость с better-sqlite3 - exec для многомерных команд
function exec(sql) {
    if (!db) throw new Error('Database not initialized');
    try {
        db.run(sql);
    } catch (error) {
        console.error('Exec error:', error, sql);
    }
}

module.exports = {
    initializeDatabase,
    getDatabase: () => db,
    query,
    run,
    saveDatabase,
    prepare,  // Совместимость с better-sqlite3
    exec,     // Совместимость с better-sqlite3
    isInitialized: () => initialized
};