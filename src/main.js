const { app, BrowserWindow, ipcMain, dialog, shell  } = require('electron');
const path = require('path');
const fs = require('fs');
const VDF = require('vdf-parser');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const { PS_TEMPLATE } = require('./serverScript');

let settings = {
    gamePath: "",
    serverPath: "",
    startWithWindows: false,
    serverPriority: "High",
    serverRestartHour: 4,
    serverAffinity: 14
};

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            settings = { ...settings, ...saved };
        } catch (e) { console.error("Settings load error", e); }
    }
}

function saveSettings() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 4));
    app.setLoginItemSettings({ openAtLogin: settings.startWithWindows });
}

function findSteamPath(appId, folderName) {
    const steamPaths = ["C:\\Program Files (x86)\\Steam", "D:\\SteamLibrary", "E:\\SteamLibrary", "F:\\SteamLibrary"];
    for (const sPath of steamPaths) {
        const vdfPath = path.join(sPath, 'steamapps', 'libraryfolders.vdf');
        if (fs.existsSync(vdfPath)) {
            try {
                const vdfData = VDF.parse(fs.readFileSync(vdfPath, 'utf-8'));
                for (const key in vdfData.libraryfolders) {
                    const library = vdfData.libraryfolders[key];
                    if (library.apps && library.apps[appId] !== undefined) {
                        return path.join(library.path, 'steamapps', 'common', folderName);
                    }
                }
            } catch (e) { }
        }
    }
    return "";
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280, 
        height: 850,
        frame: false,
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#020617',
        webPreferences: {
            // Using path.join(__dirname, ...) ensures it finds the file inside the ASAR
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    win.loadFile(path.join(__dirname, 'index.html'));
    if (!app.isPackaged) win.webContents.openDevTools();
}

ipcMain.handle('get-settings', () => {
    if (!settings.gamePath) settings.gamePath = findSteamPath("1203620", "Enshrouded");
    if (!settings.serverPath) settings.serverPath = findSteamPath("2278520", "EnshroudedServer");
    return settings;
});

ipcMain.handle('save-settings', (event, newSettings) => {
    settings = newSettings;
    saveSettings();
    return settings;
});

ipcMain.handle('check-installations', (event, basePaths) => {
    const results = {};
    for (const key in basePaths) {
        const p = basePaths[key];
        if (!p || !fs.existsSync(p)) {
            results[key] = { installed: false, shroud: false, eml: false };
            continue;
        }
        results[key] = {
            installed: true,
            shroud: fs.existsSync(path.join(p, 'shroudtopia.dll')) || fs.existsSync(path.join(p, 'winmm.dll')),
            eml: fs.existsSync(path.join(p, 'dbghelp.dll'))
        };
    }
    return results;
});

ipcMain.handle('launch-target', async (event, { type, path: targetPath }) => {
    if (type === 'game') {
        shell.openExternal("steam://run/1203620");
        return { success: true };
    }

    if (type === 'server') {
        const scriptContent = PS_TEMPLATE
            .replace('{{RESTART_HOUR}}', settings.serverRestartHour)
            .replace('{{PRIORITY}}', settings.serverPriority)
            .replace('{{AFFINITY}}', settings.serverAffinity);

        const scriptPath = path.join(targetPath, 'enshrouded_manager_proc.ps1');
        
        try {
            fs.writeFileSync(scriptPath, scriptContent);
            
            // Spawn PowerShell detached
            const child = spawn('powershell.exe', [
                '-ExecutionPolicy', 'Bypass',
                '-File', scriptPath
            ], {
                cwd: targetPath,
                detached: true,
                stdio: 'ignore'
            });

            child.unref(); // Allows the manager to exit without killing the script
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
});

ipcMain.handle('get-mods', (event, basePath) => {
    const scanPath = (dirName, isActive) => {
        const dir = path.join(basePath, dirName);
        if (!fs.existsSync(dir)) return [];
        const mods = [];
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                let modObj = { id: entry.name, active: isActive, isDirectory: entry.isDirectory() };
                
                if (entry.isDirectory()) {
                    const manifestPath = path.join(fullPath, 'mod.json');
                    const hasDll = fs.readdirSync(fullPath).some(f => f.endsWith('.dll'));
                    modObj.type = hasDll ? 'shroudtopia' : 'eml';
                    
                    if (fs.existsSync(manifestPath)) {
                        const meta = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                        modObj.name = meta.name || entry.name;
                        modObj.version = meta.version || '1.0.0';
                    } else {
                        modObj.name = entry.name;
                        modObj.version = hasDll ? 'Legacy' : 'Unknown';
                    }
                } else if (entry.name.endsWith('.dll')) {
                    modObj.type = 'shroudtopia';
                    modObj.name = entry.name.replace('.dll', '');
                    modObj.version = 'Standalone';
                } else continue; // Skip non-mod files
                
                mods.push(modObj);
            }
        } catch (e) { console.error(e); }
        return mods;
    };

    return [
        ...scanPath('mods', true),
        ...scanPath('inactive_mods', false)
    ];
});

// Toggle Mod (Move between mods and inactive_mods)
ipcMain.handle('toggle-mod', async (event, { basePath, modId, isDirectory, currentlyActive }) => {
    const sourceDir = currentlyActive ? 'mods' : 'inactive_mods';
    const targetDir = currentlyActive ? 'inactive_mods' : 'mods';
    
    const sourcePath = path.join(basePath, sourceDir, modId);
    const targetParent = path.join(basePath, targetDir);
    const targetPath = path.join(targetParent, modId);

    if (!fs.existsSync(targetParent)) fs.mkdirSync(targetParent);

    try {
        fs.renameSync(sourcePath, targetPath);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Import Mod from ZIP
ipcMain.handle('import-mod', async (event, basePath) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Zip Files', extensions: ['zip'] }]
    });

    if (canceled) return null;

    const modsDir = path.join(basePath, 'mods');
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir);

    try {
        const zipPath = filePaths[0];
        const zip = new AdmZip(zipPath);
        const zipName = path.basename(zipPath, '.zip');
        
        // 1. Check if mod.json exists specifically at the root of the zip
        const hasManifestAtRoot = zip.getEntry("mod.json") !== null;
        
        let extractTarget;

        if (hasManifestAtRoot) {
            // Condition A: It's a structured mod. Extract into a named subfolder.
            extractTarget = path.join(modsDir, zipName);
            if (!fs.existsSync(extractTarget)) fs.mkdirSync(extractTarget);
            console.log(`Manifest found. Extracting to subfolder: ${zipName}`);
        } else {
            // Condition B: No manifest at root. Extract contents directly into /mods/
            extractTarget = modsDir;
            console.log(`No manifest found. Extracting directly to mods folder.`);
        }

        zip.extractAllTo(extractTarget, true);
        return { success: true };
    } catch (e) {
        console.error("Import Error:", e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('open-path', async (event, folderPath) => {
    if (folderPath && fs.existsSync(folderPath)) {
        shell.openPath(folderPath);
        return true;
    }
    return false;
});

ipcMain.handle('read-json', (event, filePath) => {
    if (!fs.existsSync(filePath)) return null;
    try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } 
    catch(e) { return null; }
});

ipcMain.handle('save-json', (event, { filePath, data }) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
        return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('install-loader', async (event, { type, targetPath }) => {
    const repos = {
        shroud: "https://api.github.com/repos/s0t7x/shroudtopia/releases/latest",
        eml: "https://api.github.com/repos/Brabb3l/kfc-parser/releases/latest" 
    };

    try {
        const res = await axios.get(repos[type]);
        const assets = res.data.assets;
        
        let asset = null;
        if (type === 'eml') {
            asset = assets.find(a => a.name === 'dbghelp.dll');
        } else {
            asset = assets.find(a => a.name.endsWith('.zip'));
        }

        if (!asset) return false;

        const downloadUrl = asset.browser_download_url;
        const tempPath = path.join(targetPath, asset.name);
        
        const response = await axios({ url: downloadUrl, responseType: 'stream' });
        const writer = fs.createWriteStream(tempPath);
        response.data.pipe(writer);

        return new Promise((resolve) => {
            writer.on('finish', () => {
                if (asset.name.endsWith('.zip')) {
                    try {
                        const zip = new AdmZip(tempPath);
                        zip.extractAllTo(targetPath, true);
                        fs.unlinkSync(tempPath);
                        resolve(true);
                    } catch (e) { resolve(false); }
                } else {
                    resolve(true); // DLL is already in targetPath
                }
            });
            writer.on('error', () => resolve(false));
        });
    } catch (e) { return false; }
});

ipcMain.handle('window-ctrl', (event, action) => {
    const win = BrowserWindow.getFocusedWindow();
    if (action === 'close') win.close();
    if (action === 'min') win.minimize();
});

app.whenReady().then(() => {
    loadSettings();
    createWindow();
});