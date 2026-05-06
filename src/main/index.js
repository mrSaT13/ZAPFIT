const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { registerHandlers, dailyResetNow } = require('./ipcHandlers');

// Ensure handlers are registered as early as possible so preload/renderer
// can invoke IPC methods even if the renderer starts before app.whenReady
try {
    registerHandlers();
} catch (e) {
    console.error('[main] registerHandlers early call failed', e);
}

// Set app name and AppUserModelId for Windows (Start Menu / Control Panel)
try {
    app.setAppUserModelId && app.setAppUserModelId('com.zapfit.app');
    if (!app.name || app.name !== 'ZAPFIT') {
        try { app.name = 'ZAPFIT'; } catch(_) {}
    }
} catch (e) { /* ignore */ }

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        // Frameless window so we can draw custom titlebar
        frame: false,
        backgroundColor: '#0f172a',
    });

    const isDev = !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:5174');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    }
}

app.whenReady().then(() => {
    // Handlers already registered above; create the window now
    createWindow();

    // ipcMain handlers for window controls (used by TitleBar)
    try {
        ipcMain.on('minimize-window', () => { if (mainWindow) mainWindow.minimize(); });
        ipcMain.on('maximize-window', () => { if (mainWindow) { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); } });
        ipcMain.on('close-window', () => { if (mainWindow) { app.isQuiting = true; mainWindow.close(); } });
    } catch (e) { console.error('[main] ipcMain window handlers failed', e); }


    // Create tray icon and menu; allow minimize to tray
    try {
        const resolveIconCandidates = () => {
            const candidates = [];
            if (app.isPackaged) {
                // when packaged, resources are under process.resourcesPath
                candidates.push(path.join(process.resourcesPath, 'public', 'icon.ico'));
                candidates.push(path.join(process.resourcesPath, 'public', 'icon.png'));
            }
            // development / fallback
            candidates.push(path.join(__dirname, '../../public/icon.ico'));
            candidates.push(path.join(__dirname, '../../public/icon(3).ico'));
            candidates.push(path.join(__dirname, '../../public/icon.png'));
            candidates.push(path.join(__dirname, '../../public/icon-256x256.png'));
            return candidates;
        };

        let trayImage = null;
        const candidates = resolveIconCandidates();
        for (const p of candidates) {
            try {
                const img = nativeImage.createFromPath(p);
                if (img && typeof img.isEmpty === 'function' && !img.isEmpty()) { trayImage = img; break; }
            } catch (e) {
                // ignore
            }
        }

        if (trayImage) {
            const appTray = new Tray(trayImage);
            const trayMenu = Menu.buildFromTemplate([
                { label: 'Показать ZAPFIT', click: () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { w.show(); w.focus(); } } },
                { label: 'Выход', click: () => { app.quit(); } }
            ]);
            appTray.setToolTip('ZAPFIT');
            appTray.setContextMenu(trayMenu);
        } else {
            console.error('[main] tray icon not found, skipping tray creation (looked at candidates):', candidates);
        }
        const trayMenu = Menu.buildFromTemplate([
            { label: 'Показать ZAPFIT', click: () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { w.show(); w.focus(); } } },
            { label: 'Выход', click: () => { app.quit(); } }
        ]);
        appTray.setToolTip('ZAPFIT');
        appTray.setContextMenu(trayMenu);

        // When window is minimized, hide to tray
        app.on('browser-window-created', (e, win) => {
            win.on('minimize', (ev) => {
                ev.preventDefault();
                win.hide();
            });
            win.on('close', (ev) => {
                // If user chooses Quit from tray menu or app.quit called, allow close
                if (!app.isQuiting) {
                    ev.preventDefault();
                    win.hide();
                }
            });
        });
    } catch (e) { console.error('[main] tray creation failed', e); }

    // Schedule daily reset at next midnight and then every 24 hours
    try {
        const scheduleNextMidnight = () => {
            const now = new Date();
            const next = new Date(now);
            next.setDate(now.getDate() + 1);
            next.setHours(0,0,5,0); // 00:00:05 to avoid DST edge cases
            const ms = next.getTime() - now.getTime();
            setTimeout(async () => {
                try { await dailyResetNow(); console.log('[main] dailyResetNow executed'); } catch(e){ console.error('[main] dailyResetNow failed', e); }
                // schedule subsequent runs every 24h
                setInterval(async () => { try { await dailyResetNow(); } catch(e){ console.error('[main] dailyResetNow failed', e); } }, 24 * 60 * 60 * 1000);
            }, ms);
        };
        scheduleNextMidnight();
    } catch (e) { console.error('[main] scheduling daily reset failed', e); }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});