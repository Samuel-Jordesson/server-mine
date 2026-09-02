const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const { loadConfig, saveConfig } = require('./config-store');
const awsEc2 = require('./aws-ec2');

// Evita crash (SIGSEGV) em ambientes sem GPU/sandbox completo (ex: VMs, containers, alguns Linux com Wayland)
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('ozone-platform', 'x11');

let mainWindow = null;
let settingsWindow = null;
let webServerProcess = null;

function currentConfig() {
    return loadConfig(app);
}

// Sobe o web-server.js (painel) dentro do próprio processo do Electron, só no modo "local"
function startLocalWebServer(port) {
    if (webServerProcess) return;
    const { fork } = require('child_process');
    const webServerPath = path.join(__dirname, '..', 'web-server.js');

    webServerProcess = fork(webServerPath, [], {
        cwd: path.join(__dirname, '..'),
        silent: false,
        env: { ...process.env, PORT: port }
    });

    webServerProcess.on('exit', (code) => {
        console.log(`web-server.js encerrou (código ${code})`);
        webServerProcess = null;
    });
    webServerProcess.on('error', (err) => {
        console.error('Erro ao iniciar web-server.js:', err);
    });
}

function stopLocalWebServer() {
    if (webServerProcess) {
        webServerProcess.kill();
        webServerProcess = null;
    }
}

function waitForServer(url, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tryOnce = () => {
            http.get(url, () => resolve()).on('error', () => {
                if (Date.now() - start > timeoutMs) {
                    reject(new Error('Timeout aguardando o painel responder em ' + url));
                    return;
                }
                setTimeout(tryOnce, 500);
            });
        };
        tryOnce();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        icon: path.join(__dirname, 'icon.png'),
        title: 'Painel Minecraft',
        backgroundColor: '#0f172a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

function openSettingsWindow() {
    if (settingsWindow) { settingsWindow.focus(); return; }
    settingsWindow = new BrowserWindow({
        width: 620,
        height: 720,
        parent: mainWindow || undefined,
        title: 'Configurações',
        backgroundColor: '#0f172a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
    settingsWindow.on('closed', () => { settingsWindow = null; });
}

// Conecta a janela principal ao painel, de acordo com o modo configurado
async function connectToPanel() {
    const cfg = currentConfig();
    let targetUrl;

    if (cfg.mode === 'local') {
        startLocalWebServer(3000);
        targetUrl = 'http://localhost:3000';
    } else if (cfg.mode === 'remote') {
        if (!cfg.remoteUrl) throw new Error('Configure a URL do painel remoto em Configurações.');
        stopLocalWebServer();
        targetUrl = cfg.remoteUrl.replace(/\/$/, '');
    } else if (cfg.mode === 'aws') {
        if (!cfg.awsInstanceId) throw new Error('Configure o Instance ID da AWS em Configurações.');
        stopLocalWebServer();
        const info = await awsEc2.describeInstance(cfg);
        if (info.state !== 'running' || !info.publicIp) {
            throw new Error(`Instância AWS está "${info.state}". Clique em "Ligar instância" primeiro.`);
        }
        targetUrl = `http://${info.publicIp}:${cfg.awsPanelPort || 3000}`;
    } else {
        throw new Error('Modo de conexão desconhecido: ' + cfg.mode);
    }

    await waitForServer(targetUrl);

    if (!mainWindow) createWindow();
    mainWindow.loadURL(targetUrl);
    mainWindow.show();
    mainWindow.focus();

    return { success: true, message: `Conectado a ${targetUrl}` };
}

// --- IPC (chamado pela tela de Configurações) ---
ipcMain.handle('config:get', () => currentConfig());

ipcMain.handle('config:save', (_e, cfg) => saveConfig(app, cfg));

ipcMain.handle('aws:status', async () => {
    const cfg = currentConfig();
    return awsEc2.describeInstance(cfg);
});

ipcMain.handle('aws:start', async () => {
    const cfg = currentConfig();
    return awsEc2.startInstance(cfg);
});

ipcMain.handle('aws:stop', async () => {
    const cfg = currentConfig();
    return awsEc2.stopInstance(cfg);
});

ipcMain.handle('panel:connect', async () => {
    try {
        return await connectToPanel();
    } catch (err) {
        return { success: false, message: err.message };
    }
});

app.whenReady().then(async () => {
    createWindow();

    const template = [
        {
            label: 'Painel',
            submenu: [
                { label: 'Configurações...', accelerator: 'CmdOrCtrl+,', click: () => openSettingsWindow() },
                { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
                { label: 'DevTools', accelerator: 'F12', click: () => mainWindow && mainWindow.webContents.toggleDevTools() },
                { type: 'separator' },
                { label: 'Sair', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));

    try {
        const result = await connectToPanel();
        if (!result.success) throw new Error(result.message);
    } catch (err) {
        dialog.showErrorBox('Não foi possível conectar ao painel', err.message + '\n\nAbra Configurações (Ctrl+,) para ajustar.');
        openSettingsWindow();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    stopLocalWebServer();
});
