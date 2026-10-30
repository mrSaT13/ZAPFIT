// Demo-mode mock of window.electronAPI for GitHub Pages.
// Used when the app runs in a plain browser (no Electron preload).
// All data is fictional and generated deterministically.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261030);
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const range = (n) => [...Array(n).keys()];

function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoDaysAgo(days, h = 9, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// --- User ---
const mockUser = {
  id: 1, name: 'Demo Атлет', username: 'demo_athlete',
  weight: 76.5, height: 182, ftp: 250, max_hr: 186, resting_hr: 52,
  birth_date: '1992-06-15', gender: 'male', city: 'Москва',
};

// --- Activities (90 days, ~4/week) ---
const ACT_TYPES = [
  { type: 'RIDE', title: 'Утренний заезд', dist: [25, 90], dur: [3600, 10800], elev: [100, 900], hr: [125, 150], speed: [26, 33] },
  { type: 'Run', title: 'Вечерняя пробежка', dist: [5, 21], dur: [1500, 7200], elev: [10, 250], hr: [140, 165], speed: [9, 12.5] },
  { type: 'Swim', title: 'Бассейн', dist: [1, 3], dur: [1800, 3600], elev: [0, 0], hr: [115, 135], speed: [2.5, 3.5] },
  { type: 'Walk', title: 'Прогулка', dist: [3, 10], dur: [1800, 5400], elev: [10, 120], hr: [95, 115], speed: [4, 6] },
];
function makeTrack(seedLat, seedLon, km) {
  const pts = [];
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = km / 120;
    pts.push({ lat: seedLat + Math.cos(a) * r, lon: seedLon + Math.sin(a) * r * 1.6 });
  }
  return JSON.stringify(pts);
}
const mockActivities = [];
{
  let id = 1;
  for (let d = 89; d >= 0; d--) {
    if (rnd() < 0.45) continue;
    const t = pick(ACT_TYPES);
    const dist = +(t.dist[0] + rnd() * (t.dist[1] - t.dist[0])).toFixed(2);
    const dur = Math.round(t.dur[0] + rnd() * (t.dur[1] - t.dur[0]));
    const avgHr = Math.round(t.hr[0] + rnd() * (t.hr[1] - t.hr[0]));
    const tss = Math.round((dur / 3600) * (20 + rnd() * 70));
    mockActivities.push({
      id: id, server_id: 1000 + id,
      title: `${t.title} #${id}`, type: t.type,
      distance: dist, duration: dur,
      elevation_gain: Math.round(t.elev[0] + rnd() * (t.elev[1] - t.elev[0])),
      avg_hr: avgHr, max_hr: avgHr + Math.round(5 + rnd() * 20),
      avg_speed: +((t.speed[0] + rnd() * (t.speed[1] - t.speed[0]))).toFixed(1),
      average_power: t.type === 'RIDE' ? Math.round(140 + rnd() * 120) : null,
      tss, date: isoDaysAgo(d, 7 + Math.floor(rnd() * 11), Math.floor(rnd() * 60)),
      start_time: isoDaysAgo(d, 8, 0),
      map_thumbnail_path: null, gpx_path: 'server',
      points: makeTrack(55.75 + rnd() * 0.1, 37.61 + rnd() * 0.1, dist),
      user_id: 1,
    });
    id++;
  }
  mockActivities.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// --- Fitness history (Banister EWMA over TSS) ---
const mockFitnessHistory = (() => {
  const byDay = {};
  for (const a of mockActivities) {
    const d = a.date.slice(0, 10);
    byDay[d] = (byDay[d] || 0) + (a.tss || 0);
  }
  let ctl = 0, atl = 0;
  const out = [];
  for (let d = 89; d >= 0; d--) {
    const tss = byDay[localDate(d)] || 0;
    ctl = ctl + (tss - ctl) / 42;
    atl = atl + (tss - atl) / 7;
    out.push({ date: localDate(d), ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +(ctl - atl).toFixed(1) });
  }
  return out;
})();
const lastForm = mockFitnessHistory[mockFitnessHistory.length - 1] || { ctl: 0, atl: 0, tsb: 0 };
const mockFitnessForm = {
  ...lastForm,
  recommendation: lastForm.tsb > 5
    ? 'Пик формы! Идеальное время для рекорда.'
    : lastForm.tsb < -15
      ? 'Перетрен. Снизь объём и выспись.'
      : 'Рабочий режим: держи объём, добавь 1 интервал в неделю.',
};

// --- Health ---
const mockSleep = range(30).map((d) => ({
  date: localDate(d),
  duration: Math.round((6 + rnd() * 3) * 3600),
  quality: 3 + Math.floor(rnd() * 3),
  notes: '',
  sleep_duration_hours: +(6 + rnd() * 3).toFixed(1),
  sleep_quality: 3 + Math.floor(rnd() * 3),
}));
let mockWaterMl = 1500;
const mockWaterEntries = [
  { amount: 400, time: new Date(new Date().setHours(8, 10, 0, 0)).toISOString() },
  { amount: 350, time: new Date(new Date().setHours(11, 30, 0, 0)).toISOString() },
  { amount: 400, time: new Date(new Date().setHours(14, 5, 0, 0)).toISOString() },
  { amount: 350, time: new Date(new Date().setHours(17, 40, 0, 0)).toISOString() },
];
const mockWaterRows = range(14).map((d) => ({ date: localDate(d), ml: d === 0 ? mockWaterMl : Math.round(1200 + rnd() * 1400), pushed_ml: 0, is_synced: 1 }));
const mockMeals = [
  { dish_name: 'Овсянка с бананом', calories: 420, protein: 14, carbs: 72, fat: 9, date: localDate(0) },
  { dish_name: 'Курица с рисом', calories: 650, protein: 45, carbs: 60, fat: 12, date: localDate(0) },
  { dish_name: 'Творог с ягодами', calories: 280, protein: 28, carbs: 22, fat: 6, date: localDate(0) },
];
const mockWeights = range(30).map((d) => ({ type: 'weight', value: +(76.5 + (29 - d) * 0.03 + (rnd() - 0.5) * 0.4).toFixed(1), date: localDate(29 - d) }));
const mockSteps = range(14).map((d) => ({ type: 'steps', value: Math.round(4000 + rnd() * 9000), date: localDate(d) }));
const mockPulse = range(7).map((d) => ({ timestamp_ms: Date.now() - d * 86400000, bpm: Math.round(58 + rnd() * 30), source: 'demo', is_synced: 1, date: localDate(d) }));

// --- Gears ---
const mockGears = [
  { id: 1, server_id: 11, name: 'Шоссейник', nickname: 'Шоссейник', type: 'Велосипед', brand: 'Demo', model: 'Carbon', purchase_date: '2024-03-10', initial_distance: 1200, current_distance: 3420, life_km: 50000, server_image: null, image_path: null, total_distance: 3420 },
  { id: 2, server_id: 12, name: 'Кроссовки', nickname: 'Кроссовки', type: 'Кроссовки', brand: 'Demo', model: 'Run', purchase_date: '2025-08-01', initial_distance: 0, current_distance: 640, life_km: 800, server_image: null, image_path: null, total_distance: 640 },
  { id: 3, server_id: 13, name: 'Цепь', nickname: 'Цепь', type: 'Цепь', brand: 'Demo', model: '11s', purchase_date: '2026-06-01', initial_distance: 0, current_distance: 1850, life_km: 2000, server_image: null, image_path: null, total_distance: 1850 },
];
const mockGearAnalytics = mockGears.map((g) => ({
  ...g, total_life_distance: (g.initial_distance || 0) + (g.current_distance || 0),
  daily_avg: 12.4, daysToService: Math.max(1, Math.round(((g.life_km || 5000) - g.current_distance) / 12.4)),
  predictedServiceDate: localDate(-30),
}));

// --- Goals ---
let mockLocalGoals = [
  { id: 1, title: 'Полумарафон за 1:45', description: 'Осенний старт', goal_type: 'custom', target_value: 1, current_value: 0, unit: 'раз', start_date: localDate(20), target_date: localDate(-40), status: 'active', progress_percent: 35, created_at: new Date().toISOString() },
  { id: 2, title: 'Проехать 500 км за месяц', description: '', goal_type: 'distance', target_value: 500, current_value: 312, unit: 'км', start_date: localDate(10), target_date: localDate(-20), status: 'active', progress_percent: 62, created_at: new Date().toISOString() },
];
const mockServerGoals = [
  { id: 101, interval: 'weekly', activity_type: 'bike', goal_type: 'distance', goal_distance: 150000 },
  { id: 102, interval: 'weekly', activity_type: 'run', goal_type: 'activities', goal_activities_number: 3 },
  { id: 103, interval: 'monthly', activity_type: 'bike', goal_type: 'elevation', goal_elevation: 3000 },
];
const mockServerProgress = [
  { goal_id: 101, interval: 'weekly', activity_type: 'bike', goal_type: 'distance', start_date: localDate(3), end_date: localDate(-3), percentage_completed: 68, total_distance: 102000, goal_distance: 150000 },
  { goal_id: 102, interval: 'weekly', activity_type: 'run', goal_type: 'activities', start_date: localDate(3), end_date: localDate(-3), percentage_completed: 66, total_activities_number: 2, goal_activities_number: 3 },
  { goal_id: 103, interval: 'monthly', activity_type: 'bike', goal_type: 'elevation', start_date: localDate(10), end_date: localDate(-20), percentage_completed: 41 },
];

// --- Plans / competitions / social ---
const mockPlans = [
  { id: 1, name: 'База 8 недель (демо)', description: 'Объём + 1 интервал в неделю', weeks: 8, created_at: new Date().toISOString() },
];
const mockCompetitions = [
  { id: 1, title: 'Городской полумарафон', date: localDate(-21), distance: 21.1, location: 'Москва' },
  { id: 2, title: 'Гран-фондо 100', date: localDate(-55), distance: 100, location: 'Подмосковье' },
];
const mockPeople = [
  { id: 2, name: 'Анна', username: 'anna_rides' },
  { id: 3, name: 'Макс', username: 'max_tri' },
  { id: 4, name: 'Ольга', username: 'olga_swims' },
];

// --- Settings (in-memory) ---
const mockSettings = { theme: 'dark', accentColor: '#5EADEB', textColor: 'auto', units: 'metric', waterCupMl: '200', autoSyncEnabled: '0', autoSyncIntervalMinutes: '15' };

function tableOf(sql) {
  const m = /from\s+([a-z_]+)/i.exec(sql || '');
  return m ? m[1].toLowerCase() : '';
}

export function createMockApi() {
  const ok = (extra = {}) => Promise.resolve({ success: true, ...extra });
  const api = {
    __isMock: true,
    // user / settings
    getUser: () => Promise.resolve({ ...mockUser }),
    saveUser: (u) => { Object.assign(mockUser, u); return ok({ ...mockUser }); },
    getSettings: () => Promise.resolve({ ...mockSettings }),
    updateSetting: (k, v) => { mockSettings[k] = String(v); try { window.dispatchEvent(new Event('settings-updated')); } catch {} return Promise.resolve(v); },
    getAppInfo: () => Promise.resolve({ version: '1.3.0-demo' }),
    // activities
    getRides: () => Promise.resolve(mockActivities.map((a) => ({ ...a }))),
    getActivities: () => Promise.resolve(mockActivities.map((a) => ({ ...a }))),
    addManualActivity: (d) => { const a = { id: Date.now(), server_id: null, tss: 30, points: '[]', user_id: 1, ...d, date: d.date || new Date().toISOString() }; mockActivities.unshift(a); return ok({ id: a.id }); },
    updateRide: () => ok({}),
    deleteRide: () => ok({}),
    importGpx: () => Promise.resolve({ success: false, error: 'Демо-режим: импорт недоступен' }),
    importGpxAlias: undefined,
    findSimilarActivities: () => Promise.resolve({ success: true, similar: [] }),
    recalcMissingTss: () => ok({ fixed: 0 }),
    // fitness
    getFitnessForm: () => Promise.resolve({ ...mockFitnessForm }),
    getFitnessHistory: () => Promise.resolve(mockFitnessHistory.map((h) => ({ ...h }))),
    getFitnessMetrics: () => Promise.resolve(mockFitnessHistory.map((h) => ({ date: h.date, ctl: h.ctl, atl: h.atl, tsb: h.tsb }))),
    calculateFitnessMetrics: () => ok({}),
    getAdvancedMetrics: () => Promise.resolve([]),
    // water
    getWaterToday: () => Promise.resolve({ success: true, row: { date: localDate(0), ml: mockWaterMl } }),
    setWaterToday: (ml) => { mockWaterMl = ml; return ok({ ml }); },
    adjustWaterToday: (dml) => { mockWaterMl = Math.max(0, mockWaterMl + (dml || 0)); mockWaterEntries.push({ amount: dml, time: new Date().toISOString() }); try { window.dispatchEvent(new Event('water-updated')); } catch {} return ok({ ml: mockWaterMl }); },
    getWaterHistory: () => Promise.resolve(mockWaterRows.map((w) => ({ date: w.date, glasses: Math.round(w.ml / 200), liters: +(w.ml / 1000).toFixed(2) }))),
    getWaterTotals: () => Promise.resolve({ today: mockWaterMl, total: mockWaterRows.reduce((s, w) => s + w.ml, 0) }),
    getWater: () => Promise.resolve(mockWaterRows.map((w) => ({ ...w }))),
    addWater: () => ok({}),
    updateWater: () => ok({}),
    deleteWater: () => ok({}),
    addWaterDay: () => ok({}),
    getRecommendedWater: () => Promise.resolve({ success: true, liters: 2.6 }),
    dailyResetWater: () => Promise.resolve({ success: true, waterCount: 0 }),
    deleteWaterHistory: () => ok({}),
    // health metrics (generic)
    getHealthMetrics: () => Promise.resolve([...mockWeights, ...mockSteps]),
    addHealthMetric: (m) => { if (m?.type === 'weight') mockWeights.push({ type: 'weight', value: m.value, date: localDate(0) }); return ok({}); },
    updateHealthMetric: () => ok({}),
    deleteHealthMetric: () => ok({}),
    // gears
    getGears: () => Promise.resolve(mockGears.map((g) => ({ ...g }))),
    getGearAnalytics: () => Promise.resolve(mockGearAnalytics.map((g) => ({ ...g }))),
    addGear: (g) => { const ng = { id: Date.now(), life_km: 5000, current_distance: 0, initial_distance: 0, ...g }; mockGears.push(ng); return ok({ id: ng.id }); },
    updateGear: () => ok({}),
    deleteGear: (id) => { const i = mockGears.findIndex((g) => g.id === id); if (i >= 0) mockGears.splice(i, 1); return ok({}); },
    resetGear: () => ok({}),
    assignGearToActivities: () => Promise.resolve({ changes: 5 }),
    predictGearService: (id) => { const g = mockGears.find((x) => x.id === id); const pct = g ? Math.round((g.current_distance / (g.life_km || 5000)) * 100) : 0; return Promise.resolve({ success: true, pct, alert: pct > 80 ? 'Скоро замена' : 'В норме' }); },
    getGearParts: () => Promise.resolve([]),
    addGearPart: () => ok({}),
    replaceGearPart: () => ok({}),
    trainGearML: () => ok({}),
    predictGearML: () => Promise.resolve({ success: true, predicted_days: 42, model_used: false }),
    trainGearMLModel: () => Promise.resolve({ success: false, error: 'Нет данных (демо)' }),
    getGearMLModel: () => Promise.resolve(null),
    exportGearPartsCSV: () => ok({}),
    // training plans
    getTrainingPlans: () => Promise.resolve(mockPlans.map((p) => ({ ...p }))),
    getTrainingPlan: () => Promise.resolve(mockPlans[0]),
    createTrainingPlan: () => ok({ id: Date.now() }),
    updateTrainingPlan: () => ok({}),
    deleteTrainingPlan: () => ok({}),
    getTrainingPlanDetail: () => Promise.resolve({ ...mockPlans[0], sessions: range(8).map((w) => ({ week: w + 1, title: `Неделя ${w + 1}`, volume_km: 120 + w * 15 })) }),
    updateTrainingSession: () => ok({}),
    deleteTrainingSession: () => ok({}),
    generateAIPlan: () => Promise.resolve({ success: false, error: 'Демо: нужен LM Studio' }),
    getTrainingRecommendations: () => Promise.resolve([]),
    saveTrainingPlan: () => ok({}),
    // competitions
    getCompetitions: () => Promise.resolve(mockCompetitions.map((c) => ({ ...c }))),
    addCompetition: () => ok({ id: Date.now() }),
    updateCompetition: () => ok({}),
    deleteCompetition: () => ok({}),
    exportCompetitionIcs: () => ok({}),
    // comments / photos
    updateActivityPhotos: () => ok({}),
    updateActivityComments: () => ok({}),
    // train ML
    trainML: () => ok({}),
    // export
    exportReport: () => ok({}),
    // strava / google (dead in demo)
    importStrava: () => Promise.resolve({ success: false, error: 'Демо-режим' }),
    refreshStravaToken: () => Promise.resolve({ success: false }),
    testGoogleFit: () => Promise.resolve({ success: false }),
    importGoogleFit: () => Promise.resolve({ success: false }),
    generateGoogleAuthUrl: () => Promise.resolve({}),
    exchangeGoogleCode: () => Promise.resolve({}),
    refreshGoogleToken: () => Promise.resolve({}),
    startGoogleOAuth: () => Promise.resolve({}),
    startGoogleOAuthLocal: () => Promise.resolve({}),
    // zapfit server (demo is "connected")
    zapfitConfigure: (u) => ok({ serverUrl: u }),
    zapfitLogin: () => ok({}),
    zapfitLoginMfa: () => ok({}),
    zapfitLogout: () => ok({}),
    zapfitDisconnect: () => ok({}),
    zapfitStatus: () => Promise.resolve({ configured: true, authenticated: true, serverUrl: 'https://demo.zapfit.app' }),
    zapfitGetProfile: () => Promise.resolve({ success: true, profile: { ...mockUser } }),
    zapfitGetActivities: () => Promise.resolve({ success: true, activities: { records: mockActivities.slice(0, 30), total: mockActivities.length } }),
    zapfitSyncActivities: () => ok({ imported: 0, updated: mockActivities.length, total: mockActivities.length }),
    zapfitSyncHealth: () => ok({ synced: 120 }),
    zapfitGetGears: () => Promise.resolve(mockGears.map((g) => ({ ...g }))),
    zapfitSyncGears: () => ok({ imported: 0, updated: mockGears.length, total: mockGears.length }),
    zapfitSyncProfile: () => ok({}),
    zapfitSyncAll: () => ok({
      profile: { success: true },
      activities: { success: true, imported: 0, updated: mockActivities.length, skipped: 0, total: mockActivities.length },
      health: { success: true, synced: 120 },
      gears: { success: true, imported: 0, updated: mockGears.length, count: mockGears.length },
    }),
    zapfitPushHealth: () => ok({ pushed: 0, totalErrors: 0 }),
    zapfitPushProfile: () => ok({}),
    zapfitPushGears: () => ok({ pushed: 0, total: mockGears.length }),
    zapfitCreateGear: () => ok({}),
    zapfitUploadActivity: () => Promise.resolve({ success: false, error: 'Демо-режим' }),
    zapfitBulkUploadActivities: () => Promise.resolve({ success: false, error: 'Демо-режим' }),
    zapfitGetHealthStats: () => Promise.resolve({ success: true, data: { activities: mockActivities.length } }),
    zapfitGetHealthTargets: () => Promise.resolve({ success: true, data: {} }),
    zapfitGetNutrition: () => Promise.resolve({ success: true, data: mockMeals }),
    zapfitCreateNutrition: () => ok({}),
    zapfitSyncNutrition: () => ok({ synced: mockMeals.length }),
    zapfitGetGoals: () => Promise.resolve({ success: true, data: mockServerGoals.map((g) => ({ ...g })) }),
    zapfitGetGoalsProgress: () => Promise.resolve({ success: true, data: mockServerProgress.map((p) => ({ ...p })) }),
    zapfitCreateGoal: (d) => { const g = { id: Date.now(), ...d }; mockServerGoals.push(g); return ok({ data: g }); },
    zapfitDeleteGoal: (id) => { const i = mockServerGoals.findIndex((g) => g.id === id); if (i >= 0) mockServerGoals.splice(i, 1); return ok({}); },
    zapfitGetNotifications: () => Promise.resolve({ success: true, notifications: [{ id: 1, type: 1, title: 'Новая активность', message: 'Анна завершила заезд на 42 км', created_at: new Date().toISOString(), read: false }] }),
    zapfitGetNotificationsCount: () => Promise.resolve({ success: true, count: 1 }),
    zapfitMarkNotificationRead: () => ok({}),
    zapfitMarkAllNotificationsRead: () => ok({}),
    zapfitGetFollowers: () => Promise.resolve({ success: true, followers: mockPeople }),
    zapfitGetFollowing: () => Promise.resolve({ success: true, following: mockPeople.slice(0, 2) }),
    zapfitGetFriendsFeed: () => Promise.resolve({
      success: true,
      feed: mockActivities.slice(0, 8).map((a, i) => ({ ...a, id: a.id, server_id: a.server_id, user_id: mockPeople[i % mockPeople.length].id, user: mockPeople[i % mockPeople.length] })),
    }),
    zapfitGetImage: () => Promise.resolve(null),
    zapfitGetActivityMedia: () => Promise.resolve([]),
    zapfitGetUserById: (id) => Promise.resolve(mockPeople.find((p) => p.id === id) || { id, name: 'Demo Атлет', username: 'demo_athlete' }),
    zapfitGetActivityComments: () => Promise.resolve([{ id: 1, content: 'Мощно!', user: mockPeople[0] }]),
    zapfitCreateActivityComment: () => ok({}),
    zapfitGetActivityCommentCounts: () => Promise.resolve({}),
    zapfitSearchUsers: () => Promise.resolve({ success: true, users: mockPeople }),
    zapfitGetWorkoutPlans: () => Promise.resolve([]),
    zapfitCreateWorkoutPlan: () => ok({}),
    zapfitUpdateWorkoutPlan: () => ok({}),
    zapfitDeleteWorkoutPlan: () => ok({}),
    zapfitGetWorkoutSessions: () => Promise.resolve([]),
    zapfitCreateWorkoutSession: () => ok({}),
    zapfitDeleteWorkoutSession: () => ok({}),
    zapfitSearchWorkoutCatalog: () => Promise.resolve([]),
    zapfitGetCatalogExercise: () => Promise.resolve(null),
    zapfitTranslateCatalogExercise: () => Promise.resolve(null),
    zapfitGetWorkoutAiStatus: () => Promise.resolve({ available: false }),
    zapfitGenerateWorkoutAiPlan: () => Promise.resolve({ success: false, error: 'Демо' }),
    zapfitSetApiKey: () => ok({}),
    zapfitGetApiKey: () => Promise.resolve({ success: true, apiKey: '' }),
    zapfitSetMfaSecret: () => ok({}),
    zapfitGetMfaSecret: () => Promise.resolve({ success: true, secret: '' }),
    repairDb: () => ok({}),
    debugDbSchema: () => Promise.resolve([]),
    recalcMissingTss: () => ok({ fixed: 0 }),
    // updater / window
    checkForUpdates: () => Promise.resolve({ status: 'idle' }),
    downloadUpdate: () => ok({}),
    quitAndInstall: () => Promise.resolve(),
    getGithubRepo: () => Promise.resolve({}),
    onUpdaterStatus: () => {},
    offUpdaterStatus: () => {},
    minimizeWindow: () => {},
    maximizeWindow: () => {},
    closeWindow: () => {},
    // generic SQL
    query: (sql, params = []) => {
      const t = tableOf(sql);
      if (t === 'goals') return Promise.resolve(mockLocalGoals.filter((g) => g.status === 'active').map((g) => ({ ...g })));
      if (t === 'sleep_data') return Promise.resolve(mockSleep.map((s) => ({ ...s })));
      if (t === 'water') {
        const date = (params && params[0]) || (/date\s*=\s*'?([\d-]+)/i.exec(sql || '') || [])[1];
        const row = mockWaterRows.find((w) => w.date === date) || (date === localDate(0) ? { date, ml: mockWaterMl, pushed_ml: 0, is_synced: 1 } : null);
        return Promise.resolve(row ? [{ ...row }] : []);
      }
      if (t === 'water_entries') return Promise.resolve(mockWaterEntries.map((e) => ({ ...e })));
      if (t === 'health_metrics') {
        const type = (/type\s*=\s*'(\w+)'/i.exec(sql || '') || [])[1];
        let rows = mockWeights.concat(mockSteps);
        if (type) rows = rows.filter((r) => r.type === type);
        return Promise.resolve(rows.map((r) => ({ ...r })));
      }
      if (t === 'nutrition_data') return Promise.resolve(mockMeals.map((m) => ({ ...m })));
      if (t === 'heart_rate_records') return Promise.resolve(mockPulse.map((p) => ({ ...p })));
      return Promise.resolve([]);
    },
    run: (sql, params = []) => {
      const s = String(sql || '');
      if (/insert into goals/i.test(s)) {
        mockLocalGoals.push({ id: Date.now(), status: 'active', progress_percent: 0, created_at: new Date().toISOString(), title: params[0], description: params[1], goal_type: params[2], target_value: params[3], unit: params[4], start_date: params[5], target_date: params[6], current_value: 0 });
        return Promise.resolve({ success: true, changes: 1 });
      }
      if (/delete from goals/i.test(s)) {
        const id = params[0];
        mockLocalGoals = mockLocalGoals.filter((g) => g.id !== id);
        return Promise.resolve({ success: true, changes: 1 });
      }
      return Promise.resolve({ success: true, changes: 0 });
    },
  };
  // Safety net: any other method resolves to a neutral value, never throws.
  return new Proxy(api, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string') {
        if (/^(get|fetch|load|query)/i.test(prop)) return () => Promise.resolve([]);
        if (/^(check|test|generate)/i.test(prop)) return () => Promise.resolve({ success: false });
        return () => Promise.resolve({ success: true });
      }
      return undefined;
    },
  });
}

export function ensureMockApi() {
  try {
    if (typeof window !== 'undefined' && !window.electronAPI) {
      window.electronAPI = createMockApi();
    }
  } catch {}
}
