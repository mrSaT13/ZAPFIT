#!/usr/bin/env node

/**
 * Скрипт для добавления тестовых данных для демонстрации функций:
 * - CTL/ATL/TSB метрики
 * - SMART Цели
 * - Данные о сне
 * - Данные о питании
 * - Activity Feed
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Инициализируем SQL.js
const initSqlJs = require('sql.js');

async function initDb() {
    const SQL = await initSqlJs();
    const dbPath = path.join(require('electron').app.getPath('userData'), 'straveflow.db');
    
    let db;
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    return { db, dbPath, SQL };
}

async function run() {
    try {
        const { db, dbPath } = await initDb();
        
        const today = new Date();
        
        // 1. Add fitness data for the last 60 days
        console.log('📊 Adding fitness metrics data...');
        for (let i = 59; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            // Simulate exponential increase in CTL
            const ctl = 50 + (i * 0.5) + Math.random() * 10;
            const atl = 30 + Math.random() * 20;
            const tsb = ctl - atl;
            
            try {
                db.run(`
                    INSERT OR REPLACE INTO fitness_data (date, ctl, atl, tsb)
                    VALUES (?, ?, ?, ?)
                `, [dateStr, ctl, atl, tsb]);
            } catch (e) {
                // ignore duplicates
            }
        }
        
        // 2. Add SMART Goals
        console.log('🎯 Adding SMART goals...');
        const goals = [
            {
                title: 'Проехать 1000 км за месяц',
                description: 'Увеличить аэробную базу',
                goal_type: 'distance',
                target_value: 1000,
                unit: 'км',
                target_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0]
            },
            {
                title: 'Улучшить CTL до 150',
                description: 'Последовательные тренировки для повышения формы',
                goal_type: 'fitness',
                target_value: 150,
                unit: 'TSS',
                target_date: new Date(new Date().setMonth(new Date().getMonth() + 2)).toISOString().split('T')[0]
            },
            {
                title: 'Тренироваться 5 дней в неделю',
                description: 'Стабильный тренировочный режим',
                goal_type: 'frequency',
                target_value: 5,
                unit: 'дней',
                target_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0]
            }
        ];
        
        for (const goal of goals) {
            db.run(`
                INSERT INTO goals (title, description, goal_type, target_value, unit, start_date, target_date, status, progress_percent)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
            `, [
                goal.title,
                goal.description,
                goal.goal_type,
                goal.target_value,
                goal.unit,
                today.toISOString().split('T')[0],
                goal.target_date,
                Math.random() * 60 // random progress 0-60%
            ]);
        }
        
        // 3. Add sleep data
        console.log('😴 Adding sleep data...');
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const sleepHours = 6.5 + Math.random() * 2.5; // 6.5-9 hours
            const quality = Math.floor(2 + Math.random() * 3); // 2-5
            
            try {
                db.run(`
                    INSERT OR REPLACE INTO sleep_data (date, sleep_duration_hours, sleep_quality, notes)
                    VALUES (?, ?, ?, ?)
                `, [dateStr, sleepHours, quality, 'Хороший ночной сон']);
            } catch (e) {
                // ignore
            }
        }
        
        // 4. Add nutrition data
        console.log('🍽️ Adding nutrition data...');
        const nutritionDates = [today, new Date(today.setDate(today.getDate() - 1))];
        for (const date of nutritionDates) {
            const dateStr = date.toISOString().split('T')[0];
            
            db.run(`
                INSERT INTO nutrition_data (date, calories, protein, carbs, fat, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                dateStr,
                2200 + Math.random() * 400, // calories
                120 + Math.random() * 30,   // protein
                280 + Math.random() * 60,   // carbs
                75 + Math.random() * 15,    // fat
                'Сбалансированное питание для восстановления'
            ]);
        }
        
        // 5. Add activity feed events
        console.log('📢 Adding activity feed...');
        const activities = [
            {
                event_type: 'activity',
                title: 'Длинная тренировка',
                description: '120 км, 4 часа 30 минут',
                value: 285,
                icon: '🚴',
                color: '#3b82f6'
            },
            {
                event_type: 'achievement',
                title: 'Новый рекорд формы!',
                description: 'CTL достиг 120',
                value: 120,
                icon: '🏆',
                color: '#fbbf24'
            },
            {
                event_type: 'goal',
                title: 'Прогресс по цели',
                description: '40% выполнения "1000 км за месяц"',
                value: 40,
                icon: '🎯',
                color: '#10b981'
            }
        ];
        
        for (const activity of activities) {
            db.run(`
                INSERT INTO activity_feed (event_type, title, description, value, icon, color)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                activity.event_type,
                activity.title,
                activity.description,
                activity.value,
                activity.icon,
                activity.color
            ]);
        }
        
        // Save database
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(require('path').join(require('electron').app.getPath('userData'), 'straveflow.db'), buffer);
        
        console.log('✅ Все тестовые данные успешно добавлены!');
        console.log('\n📈 Добавлено:');
        console.log('  • 60 дней CTL/ATL/TSB метрик');
        console.log('  • 3 SMART цели');
        console.log('  • 7 дней данных о сне');
        console.log('  • 2 дня данных о питании');
        console.log('  • 3 события в Activity Feed');
        
    } catch (err) {
        console.error('❌ Ошибка:', err);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    run().then(() => process.exit(0));
}

module.exports = { initDb, run };
