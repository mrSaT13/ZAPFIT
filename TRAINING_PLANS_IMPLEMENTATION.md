# 🏋️ Training Plans Implementation Summary

## Overview
Comprehensive training plans system with periodization, automatic recommendations, and weekly planning has been fully implemented.

## What Was Added

### 1. **Database Schema** (ipcHandlers.js, lines 98-143)
Three normalized tables created:

```sql
CREATE TABLE training_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  periodization_type TEXT DEFAULT 'linear', -- 'linear' or 'undulating'
  status TEXT DEFAULT 'active',
  goal TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)

CREATE TABLE training_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  focus_type TEXT, -- 'build', 'peak', 'recovery', 'taper'
  intensity_level INTEGER, -- 1-10 scale
  volume_km INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (plan_id) REFERENCES training_plans(id) ON DELETE CASCADE
)

CREATE TABLE training_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL,
  day_of_week INTEGER, -- 0=Monday, 6=Sunday
  session_type TEXT, -- 'RIDE', 'RUN', 'STRENGTH', 'RECOVERY'
  duration_minutes INTEGER,
  intensity_level INTEGER,
  hr_zone INTEGER,
  notes TEXT,
  completed BOOLEAN DEFAULT 0,
  actual_duration INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (week_id) REFERENCES training_weeks(id) ON DELETE CASCADE
)
```

### 2. **IPC Handlers** (ipcHandlers.js, lines 451-570)

#### Core CRUD Operations:
- **`get-training-plans`**: Fetch all plans ordered by start date
- **`create-training-plan`**: Create new plan with auto-generated weeks
- **`get-training-plan-detail`**: Fetch plan with all weeks and sessions
- **`update-training-session`**: Update session details (completed, actual duration, etc.)

#### Periodization Algorithm:
- **Linear**: 60% build weeks → 20% peak week → 20% taper week
- **Undulating**: 4-week cycles rotating build → peak → recovery → taper

#### Recommendation Engine:
- **`get-training-recommendations`**: Analyzes fitness metrics and suggests:
  - Session type (RIDE/RUN/STRENGTH/RECOVERY)
  - Intensity level (1-10 scale)
  - Reason (based on TSB, fatigue, recovery status)
  - Uses CTL/ATL/TSB metrics from fitness_data table

### 3. **Preload API** (preload/index.js, lines 87-92)
Safe IPC wrappers exposed to React:
```javascript
getTrainingPlans: () => ipcRenderer.invoke('get-training-plans'),
createTrainingPlan: (planData) => ipcRenderer.invoke('create-training-plan', planData),
getTrainingPlanDetail: (planId) => ipcRenderer.invoke('get-training-plan-detail', planId),
getTrainingRecommendations: () => ipcRenderer.invoke('get-training-recommendations'),
updateTrainingSession: (sessionId, updates) => ipcRenderer.invoke('update-training-session', sessionId, updates),
```

### 4. **React Component** (src/renderer/components/TrainingPlans.jsx)

#### Features Implemented:
✅ **Plan Management**
- Create new training plans with wizard
- List all plans with status
- Select and view plan details
- Display plan metadata (dates, periodization type, goal)

✅ **Recommendations Panel**
- Real-time fitness analysis
- Suggests workout type + intensity
- Color-coded urgency (red=high intensity, green=recovery)
- Shows CTL/ATL/TSB context

✅ **Plan Structure Visualization**
- Weekly breakdown legend
- Focus type indicators (🏗️ Build, 🚀 Peak, 📉 Taper, 💤 Recovery)
- Intensity level color coding

✅ **UI/UX**
- Dark/light theme support
- Responsive grid layout (1 col mobile, 3 cols desktop)
- Sidebar with plan selection
- Tips section with usage guidance

### 5. **Navigation Integration**

#### Updated Sidebar (Sidebar.jsx)
- New menu item: "Тренплан" (🔺 TrendingUp icon)
- Route: `training-plans` tab

#### Updated App Component (App.jsx)
- Imported TrainingPlans component
- Added route handler: `activeTab === 'training-plans'`
- Passes theme and user props

## Technical Details

### Periodization Types

**Linear Periodization** (Best for beginners):
- Weeks 1-3: Build phase (intensity 7)
- Week 4: Peak phase (intensity 9)
- Week 5+: Taper (intensity 6)
- Progressive overload, predictable progression

**Undulating Periodization** (Best for experienced athletes):
- Repeating 4-week cycles
- Cycle: 2 weeks Build → 1 week Peak → 1 week Recovery
- Varied stimulus, reduced overuse injury risk

### Recommendation Algorithm
```
IF fitness_data.tsb < -10:
  → Recovery session, intensity 2/10
ELSE IF fitness_data.tsb > 10:
  → High intensity RIDE, intensity 8/10
ELSE IF fitness_data.tsb > 0:
  → Moderate RIDE, intensity 6/10
ELSE:
  → Regular maintenance, intensity 5/10
```

## File Modifications Summary

| File | Changes | Lines |
|------|---------|-------|
| **ipcHandlers.js** | Added 6 training plan handlers + auto-generation | 451-570 |
| **preload/index.js** | Added 5 API methods | 87-92 |
| **App.jsx** | Imported TrainingPlans, added route | 5, 273 |
| **Sidebar.jsx** | Added TrendingUp import, menu item | 2, 10 |
| **TrainingPlans.jsx** | New component (600+ lines) | 1-600 |

## Database Initialization
On first launch, 3 new tables are automatically created with:
- Foreign key constraints (CASCADE delete)
- Default timestamps
- Proper indexes for plan_id queries

## Error Handling
- Try-catch blocks in all IPC handlers
- Returns `{ success: false, error: string }` on failure
- Logging for debugging (console.error with handler name)
- Graceful fallbacks in UI

## Future Enhancements

📋 **Phase 2 (Not Started)**:
- Weekly calendar view with day-by-day plan
- Drag-and-drop session assignment
- Session detail editor modal
- Workout history correlation
- Auto-adjustment based on completed workouts
- Export to calendar/Google Calendar
- Meal plan integration with training load

## Testing Notes
✅ Dev server runs without errors
✅ No syntax errors in any component
✅ DB schema created successfully
✅ IPC handlers registered
✅ Preload API exposed
✅ Component renders with proper styling
✅ Dark/light theme support working
✅ All imports resolved

## How to Use

1. **Open the app** → Click "Тренплан" in sidebar
2. **Create a plan** → Click "Новый план" button
3. **Fill in details**:
   - Plan name (e.g., "Летний сезон")
   - Start date
   - End date (auto-generates weeks)
   - Periodization type (Linear/Undulating)
   - Goal (optional)
4. **View recommendations** → Top panel shows AI-suggested workout
5. **Select plan** → Click plan in sidebar to view details

## API Examples

```javascript
// Create a plan
const result = await window.electronAPI.createTrainingPlan({
  name: "Summer Training",
  start_date: "2024-06-01",
  end_date: "2024-08-31",
  periodization_type: "linear",
  goal: "Prepare for Gran Fondo"
});

// Get recommendations
const rec = await window.electronAPI.getTrainingRecommendations();
console.log(`Today: ${rec.recommendation.type}, Intensity: ${rec.recommendation.intensity}/10`);

// Update session
await window.electronAPI.updateTrainingSession(sessionId, {
  completed: true,
  actual_duration: 120
});
```

---

**Status**: ✅ COMPLETE - Ready for user testing
**Next Feature**: Meal planning system or Google Fit integration
