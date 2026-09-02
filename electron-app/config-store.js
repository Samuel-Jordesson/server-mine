const fs = require('fs');
const path = require('path');

function getConfigPath(app) {
    return path.join(app.getPath('userData'), 'config.json');
}

const DEFAULTS = {
    mode: 'local',        // 'local' (roda web-server.js aqui do PC) | 'remote' (aponta pra URL/AWS)
    remoteUrl: '',         // ex: http://SEU-IP:3000 ou https://painel.n91.com.br
    awsEnabled: false,
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsRegion: 'us-east-1',
    awsInstanceId: '',
    awsPanelPort: 3000
};

function loadConfig(app) {
    const file = getConfigPath(app);
    try {
        if (fs.existsSync(file)) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            return { ...DEFAULTS, ...raw };
        }
    } catch (err) {
        console.error('Erro ao ler config.json:', err);
    }
    return { ...DEFAULTS };
}

function saveConfig(app, cfg) {
    const file = getConfigPath(app);
    const merged = { ...DEFAULTS, ...cfg };
    fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
}

module.exports = { loadConfig, saveConfig, DEFAULTS };
