const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload] 1. Preload script loading...');
console.log('[preload] 2. contextBridge available:', !!contextBridge);
console.log('[preload] 3. ipcRenderer available:', !!ipcRenderer);

try {
    console.log('[preload] 4. About to call exposeInMainWorld...');
    contextBridge.exposeInMainWorld('electronAPI', {
  // Debug info
  _preloadInfo: {
    loaded: true,
    timestamp: new Date().toISOString(),
    message: 'Preload script loaded successfully!',
    contextBridgeAvailable: !!contextBridge,
    ipcRendererAvailable: !!ipcRenderer
  },
  getRides: () => ipcRenderer.invoke('get-rides'),
  getActivities: () => ipcRenderer.invoke('get-activities'),
  deleteRide: (id) => ipcRenderer.invoke('delete-ride', id),
  updateRide: (id, data) => ipcRenderer.invoke('update-ride', id, data),
  findSimilarActivities: (rideId) => ipcRenderer.invoke('find-similar-activities', rideId),
  importGPX: () => ipcRenderer.invoke('import-gpx'),
  importGpx: () => ipcRenderer.invoke('import-gpx'),
  addManualActivity: (data) => ipcRenderer.invoke('add-manual-activity', data),
  getUser: () => ipcRenderer.invoke('get-user'),
  saveUser: (userData) => ipcRenderer.invoke('save-user', userData),
  trainML: (payload) => ipcRenderer.invoke('train-ml', payload),
  getHealthMetrics: () => ipcRenderer.invoke('get-health-metrics'),
  addHealthMetric: (m) => ipcRenderer.invoke('add-health-metric', m),
  updateHealthMetric: (id, updates) => ipcRenderer.invoke('update-health-metric', id, updates),
  deleteHealthMetric: (id) => ipcRenderer.invoke('delete-health-metric', id),
  getGears: () => ipcRenderer.invoke('get-gears'),
  addGear: (gearData) => ipcRenderer.invoke('add-gear', gearData),
  updateGear: (id, updates) => ipcRenderer.invoke('update-gear', id, updates),
  assignGearToActivities: (gearId) => ipcRenderer.invoke('assign-gear-to-activities', gearId),
  predictGearService: (gearId) => ipcRenderer.invoke('predict-gear-service', gearId),
  getGearParts: (gearId) => ipcRenderer.invoke('get-gear-parts', gearId),
  addGearPart: (gearId, part) => ipcRenderer.invoke('add-gear-part', gearId, part),
  replaceGearPart: (partId, removedAt, removedKm, newPart) => ipcRenderer.invoke('replace-gear-part', partId, removedAt, removedKm, newPart),
  trainGearML: (sample) => ipcRenderer.invoke('train-gear-ml', sample),
  predictGearML: (gearId) => ipcRenderer.invoke('predict-gear-ml', gearId),
  exportGearPartsCSV: (gearId) => ipcRenderer.invoke('export-gear-parts-csv', gearId),
  trainGearMLModel: (opts) => ipcRenderer.invoke('train-gear-ml-model', opts),
  getGearMLModel: (gearId) => ipcRenderer.invoke('get-gear-ml-model', gearId),
  deleteGear: (id) => ipcRenderer.invoke('delete-gear', id),
  resetGear: (id) => ipcRenderer.invoke('reset-gear', id),
  getGearAnalytics: () => ipcRenderer.invoke('get-gear-analytics'),
  getFitnessForm: () => ipcRenderer.invoke('get-fitness-form'),
  getFitnessHistory: () => ipcRenderer.invoke('get-fitness-history'),
  getAdvancedMetrics: () => ipcRenderer.invoke('get-advanced-metrics'),
  exportReport: (options) => ipcRenderer.invoke('export-report', options),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  saveTrainingPlan: (plan) => ipcRenderer.invoke('save-training-plan', plan),
  getTrainingPlan: () => ipcRenderer.invoke('get-training-plan'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSetting: (key, value) => ipcRenderer.invoke('update-setting', key, value),
  importStrava: (opts) => ipcRenderer.invoke('import-strava', opts),
  refreshStravaToken: (opts) => ipcRenderer.invoke('refresh-strava-token', opts)
  ,
  testGoogleFit: () => ipcRenderer.invoke('test-google-fit'),
  importGoogleFit: () => ipcRenderer.invoke('import-google-fit'),
  generateGoogleAuthUrl: () => ipcRenderer.invoke('generate-google-auth-url'),
  exchangeGoogleCode: (code) => ipcRenderer.invoke('exchange-google-code', code),
  refreshGoogleToken: () => ipcRenderer.invoke('refresh-google-token'),
  startGoogleOAuth: () => ipcRenderer.invoke('start-google-oauth'),
  startGoogleOAuthLocal: () => ipcRenderer.invoke('start-google-oauth-local'),
  // Water + training helpers
  dailyResetWater: () => ipcRenderer.invoke('daily-reset-water'),
  getWaterHistory: () => ipcRenderer.invoke('get-water-history'),
  addWaterDay: (date, glasses, liters) => ipcRenderer.invoke('add-water-day', date, glasses, liters),
  getWaterToday: () => ipcRenderer.invoke('get-water-today'),
  setWaterToday: (ml) => ipcRenderer.invoke('set-water-today', ml),
  adjustWaterToday: (deltaMl) => ipcRenderer.invoke('adjust-water-today', deltaMl),
  deleteWaterHistory: (id) => ipcRenderer.invoke('delete-water-history', id),
  getRecommendedWater: () => ipcRenderer.invoke('get-recommended-water'),
  // New water entries API
  getWater: () => ipcRenderer.invoke('get-water'),
  getWaterTotals: () => ipcRenderer.invoke('get-water-totals'),
  addWater: (data) => ipcRenderer.invoke('add-water', data),
  updateWater: (id, data) => ipcRenderer.invoke('update-water', id, data),
  deleteWater: (id) => ipcRenderer.invoke('delete-water', id),
  saveTrainingPlan: (plan) => ipcRenderer.invoke('save-training-plan', plan),
  getTrainingPlan: (opts) => ipcRenderer.invoke('get-training-plan', opts)
  ,
  // Competitions
  getCompetitions: () => ipcRenderer.invoke('get-competitions'),
  addCompetition: (comp) => ipcRenderer.invoke('add-competition', comp),
  updateCompetition: (id, comp) => ipcRenderer.invoke('update-competition', id, comp),
  deleteCompetition: (id) => ipcRenderer.invoke('delete-competition', id),
  exportCompetitionIcs: (id) => ipcRenderer.invoke('export-competition-ics', id),
  // Activity photos and comments
  updateActivityPhotos: (rideId, photos) => ipcRenderer.invoke('update-activity-photos', rideId, photos),
  updateActivityComments: (rideId, comments) => ipcRenderer.invoke('update-activity-comments', rideId, comments),
  // Training Plans
  getTrainingPlans: () => ipcRenderer.invoke('get-training-plans'),
  createTrainingPlan: (planData) => ipcRenderer.invoke('create-training-plan', planData),
  getTrainingPlanDetail: (planId) => ipcRenderer.invoke('get-training-plan-detail', planId),
  updateTrainingPlan: (planId, planData) => ipcRenderer.invoke('update-training-plan', planId, planData),
  deleteTrainingPlan: (planId) => ipcRenderer.invoke('delete-training-plan', planId),
  generateAIPlan: (params) => ipcRenderer.invoke('generate-ai-plan', params),
  getTrainingRecommendations: () => ipcRenderer.invoke('get-training-recommendations'),
  updateTrainingSession: (sessionId, updates) => ipcRenderer.invoke('update-training-session', sessionId, updates),
  calculateFitnessMetrics: () => ipcRenderer.invoke('calculate-fitness-metrics'),
  getFitnessMetrics: () => ipcRenderer.invoke('get-fitness-metrics'),
  // Database direct access for goals, sleep, nutrition
  query: (sql, params) => ipcRenderer.invoke('db-query', sql, params),
  run: (sql, params) => ipcRenderer.invoke('db-run', sql, params),
  // Standard dishes
  getStandardDishes: (category) => ipcRenderer.invoke('get-standard-dishes', category),
  getDishCategories: () => ipcRenderer.invoke('get-dish-categories'),
  addDishCategory: (category) => ipcRenderer.invoke('add-dish-category', category),
  // Zapfit Server Integration
  zapfitConfigure: (serverUrl) => ipcRenderer.invoke('zapfit-configure', serverUrl),
  zapfitLogin: (params) => ipcRenderer.invoke('zapfit-login', params),
  zapfitLoginMfa: (params) => ipcRenderer.invoke('zapfit-login-mfa', params),
  zapfitLogout: () => ipcRenderer.invoke('zapfit-logout'),
  zapfitStatus: () => ipcRenderer.invoke('zapfit-status'),
  zapfitGetProfile: () => ipcRenderer.invoke('zapfit-get-profile'),
  zapfitGetActivities: (params) => ipcRenderer.invoke('zapfit-get-activities', params),
  zapfitSyncActivities: () => ipcRenderer.invoke('zapfit-sync-activities'),
  zapfitSyncHealth: () => ipcRenderer.invoke('zapfit-sync-health'),
   zapfitGetGears: () => ipcRenderer.invoke('zapfit-get-gears'),
   zapfitSyncGears: () => ipcRenderer.invoke('zapfit-sync-gears'),
   zapfitSyncProfile: () => ipcRenderer.invoke('zapfit-sync-profile'),
   zapfitGetNotifications: (params) => ipcRenderer.invoke('zapfit-get-notifications', params),
   zapfitGetNotificationsCount: () => ipcRenderer.invoke('zapfit-get-notifications-count'),
   zapfitMarkNotificationRead: (id) => ipcRenderer.invoke('zapfit-mark-notification-read', id),
   zapfitMarkAllNotificationsRead: () => ipcRenderer.invoke('zapfit-mark-all-notifications-read'),
      zapfitGetFollowers: () => ipcRenderer.invoke('zapfit-get-followers'),
      zapfitGetFollowing: () => ipcRenderer.invoke('zapfit-get-following'),
      zapfitGetFriendsFeed: (p) => ipcRenderer.invoke('zapfit-get-friends-feed', p),
      zapfitGetImage: (path) => ipcRenderer.invoke('zapfit-get-image', path),
     zapfitGetActivityMedia: (activityId) => ipcRenderer.invoke('zapfit-get-activity-media', activityId),
     zapfitDisconnect: () => ipcRenderer.invoke('zapfit-disconnect'),
      zapfitSetApiKey: (apiKey, apiPassword) => ipcRenderer.invoke('zapfit-set-api-key', { apiKey, apiPassword }),
       zapfitGetApiKey: () => ipcRenderer.invoke('zapfit-get-api-key'),
       zapfitSetMfaSecret: (secret) => ipcRenderer.invoke('zapfit-set-mfa-secret', { secret }),
       zapfitGetMfaSecret: () => ipcRenderer.invoke('zapfit-get-mfa-secret'),
        zapfitSyncAll: () => ipcRenderer.invoke('zapfit-sync-all'),
        // PUSH extras
        zapfitPushHealth: (opts) => ipcRenderer.invoke('zapfit-push-health', opts),
        zapfitUploadActivity: (opts) => ipcRenderer.invoke('zapfit-upload-activity', opts),
        zapfitBulkUploadActivities: (opts) => ipcRenderer.invoke('zapfit-bulk-upload-activities', opts),
        zapfitPushGears: () => ipcRenderer.invoke('zapfit-push-gears'),
        zapfitCreateGear: (data) => ipcRenderer.invoke('zapfit-create-gear', data),
        zapfitPushProfile: () => ipcRenderer.invoke('zapfit-push-profile'),
        zapfitGetHealthStats: (date) => ipcRenderer.invoke('zapfit-get-health-stats', date),
        zapfitGetHealthTargets: () => ipcRenderer.invoke('zapfit-get-health-targets'),
        zapfitGetNutrition: (params) => ipcRenderer.invoke('zapfit-get-nutrition', params),
        zapfitCreateNutrition: (data) => ipcRenderer.invoke('zapfit-create-nutrition', data),
        zapfitSyncNutrition: (params) => ipcRenderer.invoke('zapfit-sync-nutrition', params),
        zapfitGetGoals: () => ipcRenderer.invoke('zapfit-get-goals'),
        zapfitGetGoalsProgress: () => ipcRenderer.invoke('zapfit-get-goals-progress'),
        zapfitCreateGoal: (data) => ipcRenderer.invoke('zapfit-create-goal', data),
        zapfitDeleteGoal: (goalId) => ipcRenderer.invoke('zapfit-delete-goal', goalId),
        zapfitSearchUsers: (q) => ipcRenderer.invoke('zapfit-search-users', q),
        // Strength workouts (server /api/v1/workouts)
        zapfitGetWorkoutPlans: () => ipcRenderer.invoke('zapfit-get-workout-plans'),
        zapfitCreateWorkoutPlan: (body) => ipcRenderer.invoke('zapfit-create-workout-plan', body),
        zapfitUpdateWorkoutPlan: (planId, body) => ipcRenderer.invoke('zapfit-update-workout-plan', { planId, body }),
        zapfitDeleteWorkoutPlan: (planId) => ipcRenderer.invoke('zapfit-delete-workout-plan', planId),
        zapfitGetWorkoutSessions: (range) => ipcRenderer.invoke('zapfit-get-workout-sessions', range),
        zapfitCreateWorkoutSession: (body) => ipcRenderer.invoke('zapfit-create-workout-session', body),
        zapfitDeleteWorkoutSession: (sessionId) => ipcRenderer.invoke('zapfit-delete-workout-session', sessionId),
        zapfitSearchWorkoutCatalog: (q, opts) => ipcRenderer.invoke('zapfit-search-workout-catalog', { q, opts }),
        zapfitGetCatalogExercise: (wgerId) => ipcRenderer.invoke('zapfit-get-catalog-exercise', wgerId),
        zapfitTranslateCatalogExercise: (wgerId, language) => ipcRenderer.invoke('zapfit-translate-catalog-exercise', { wgerId, language }),
        zapfitGetWorkoutAiStatus: () => ipcRenderer.invoke('zapfit-get-workout-ai-status'),
        zapfitGenerateWorkoutAiPlan: (prompt, language) => ipcRenderer.invoke('zapfit-generate-workout-ai-plan', { prompt, language }),
        // Author profiles + comments (feed parity with mobile)
        zapfitGetUserById: (userId) => ipcRenderer.invoke('zapfit-get-user-by-id', userId),
        zapfitGetActivityComments: (activityId) => ipcRenderer.invoke('zapfit-get-activity-comments', activityId),
        zapfitCreateActivityComment: (activityId, content) => ipcRenderer.invoke('zapfit-create-activity-comment', { activityId, content }),
        zapfitGetActivityCommentCounts: (activityIds) => ipcRenderer.invoke('zapfit-get-activity-comment-counts', activityIds),
        repairDb: () => ipcRenderer.invoke('repair-db'),
        debugDbSchema: () => ipcRenderer.invoke('debug-db-schema'),
        recalcMissingTss: () => ipcRenderer.invoke('recalc-missing-tss'),
    // Legacy aliases (endurain -> zapfit) for old bundles
    endurainConfigure: (serverUrl) => ipcRenderer.invoke('zapfit-configure', serverUrl),
    endurainLogin: (params) => ipcRenderer.invoke('zapfit-login', params),
    endurainLoginMfa: (params) => ipcRenderer.invoke('zapfit-login-mfa', params),
    endurainLogout: () => ipcRenderer.invoke('zapfit-logout'),
    endurainStatus: () => ipcRenderer.invoke('zapfit-status'),
    endurainGetProfile: () => ipcRenderer.invoke('zapfit-get-profile'),
    endurainGetActivities: (params) => ipcRenderer.invoke('zapfit-get-activities', params),
    endurainSyncActivities: () => ipcRenderer.invoke('zapfit-sync-activities'),
    endurainSyncHealth: () => ipcRenderer.invoke('zapfit-sync-health'),
    endurainGetGears: () => ipcRenderer.invoke('zapfit-get-gears'),
    endurainGetNotifications: (params) => ipcRenderer.invoke('zapfit-get-notifications', params),
    endurainMarkNotificationRead: (id) => ipcRenderer.invoke('zapfit-mark-notification-read', id),
    endurainGetFollowers: () => ipcRenderer.invoke('zapfit-get-followers'),
    endurainGetImage: (path) => ipcRenderer.invoke('zapfit-get-image', path),
    endurainGetActivityMedia: (activityId) => ipcRenderer.invoke('zapfit-get-activity-media', activityId),
    endurainDisconnect: () => ipcRenderer.invoke('zapfit-disconnect'),
   // Auto-updater GitHub
   checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
   downloadUpdate: () => ipcRenderer.invoke('download-update'),
   quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
   getGithubRepo: () => ipcRenderer.invoke('get-github-repo'),
   onUpdaterStatus: (cb) => { try { ipcRenderer.on('updater-status', (e, data)=>cb(data)); } catch(_){} },
   offUpdaterStatus: () => { try { ipcRenderer.removeAllListeners('updater-status'); } catch(_){} },
  // Window controls for frameless window
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window')
    }
  );

    console.log('[preload] 5. electronAPI exposed to window successfully');
    console.log('[preload] 6. API has', Object.keys(this).length, 'methods');
    try {
      ipcRenderer.send('preload-ready', {
        timestamp: new Date().toISOString(),
        message: 'preload executed and electronAPI exposed'
      });
    } catch (e) {
      console.error('[preload] failed to send preload-ready:', e && e.message);
    }
} catch (err) {
    console.error('[preload] ERROR exposing electronAPI:', err.message);
    console.error('[preload] Stack:', err.stack);
}
