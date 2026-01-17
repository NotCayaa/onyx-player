const { app, BrowserWindow, nativeTheme, ipcMain, nativeImage } = require('electron');
const path = require('path');

// Default to dark, but allow changing
nativeTheme.themeSource = 'dark';

// IPC Listener for Theme Change
ipcMain.handle('set-theme', (event, theme) => {
    console.log(`[Main] Setting theme to: ${theme}`);
    nativeTheme.themeSource = theme;

    // Update Window Icon dynamically based on theme
    if (mainWindow) {
        const iconFileName = theme === 'light' ? 'logo-light.png' : 'logo.png';
        const iconPath = path.join(__dirname, 'public', iconFileName);
        const newIcon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
        mainWindow.setIcon(newIcon);
    }

    return nativeTheme.shouldUseDarkColors;
});

let mainWindow;

function createWindow() {
    // Create optimized icon
    const iconPath = path.join(__dirname, 'public/logo.png');
    const appIcon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#1a1a1a', // Prevent white flash
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true,
        title: "Onyx",
        icon: appIcon
    });

    // Load content based on environment
    if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
    } else {
        console.log('Loading http://localhost:5173...');
        mainWindow.loadURL('http://localhost:5173').catch((err) => {
            console.error('Failed to load dev server:', err);
        });
    }

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// Backend Process Management
const { fork } = require('child_process');
let backendProcess = null;

const fs = require('fs'); // Ensure fs is required

function startBackend() {
    const logPath = path.join(app.getPath('userData'), 'main-process.log');
    const log = (msg) => {
        try {
            fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
        } catch (e) { console.error(e); }
    };

    if (app.isPackaged) {
        // In unified build, backend is inside app.asar (or unpacked)
        // Path is relative to the main executable (electron.cjs) inside the bundle
        let backendPath = path.join(__dirname, 'backend', 'index.js');
        const userDataPath = app.getPath('userData');

        log(`Initial Backend Path: ${backendPath}`);

        // If path contains app.asar, we need to point to the unpacked version
        // because 'fork' runs a pure Node process that can't read inside ASAR
        if (backendPath.includes('app.asar')) {
            backendPath = backendPath.replace('app.asar', 'app.asar.unpacked');
        }

        log(`Resolved Backend Path: ${backendPath}`);
        log(`UserData Path: ${userDataPath}`);

        if (!fs.existsSync(backendPath)) {
            log('CRITICAL: Backend file NOT FOUND at ' + backendPath);
            return;
        }

        log('Attempting to spawn backend...');
        backendProcess = fork(backendPath, [], {
            silent: false,
            detached: false, // Child dies when parent dies
            env: {
                ...process.env,
                APP_DATA_DIR: userDataPath,
                ELECTRON_RUN_AS_NODE: '1' // CRITICAL: Ensure it runs as Node, not Electron
            }
        });

        backendProcess.on('error', (err) => {
            log(`Backend failed to start: ${err.message}`);
        });

        backendProcess.on('exit', (code) => {
            log(`Backend process exited with code: ${code}`);
        });

        // Capture stdout/stderr if possible (silent: true would be needed for this, but let's try basic event first)
        // If we switch to silent: true, we can pipe stdio.

    } else {
        console.log('Development mode: Backend should be started manually via npm run dev in /backend');
    }
}

function stopBackend() {
    if (backendProcess) {
        console.log('Stopping backend...');
        backendProcess.kill();
        backendProcess = null;
    }
}

app.on('ready', () => {
    startBackend();
    createWindow();
});

app.on('window-all-closed', function () {
    stopBackend();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('before-quit', () => {
    stopBackend();
});
