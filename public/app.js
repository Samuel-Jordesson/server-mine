const socket = io();
const consoleDiv = document.getElementById('console');
const commandInput = document.getElementById('command-input');
let logs = [];
let playersOnline = new Set(); // Rastrear jogadores online
let maxPlayers = 20;

// Conectar ao servidor
socket.on('connect', () => {
    console.log('Conectado ao servidor');
    updateStatus();
});

// Receber logs
socket.on('logs', (newLogs) => {
    logs = newLogs;
    renderLogs();
    
    // Processar logs existentes para detectar jogadores já conectados
    logs.forEach(log => detectPlayerActivity(log));
    updatePlayerCountDisplay();
});

socket.on('log', (logEntry) => {
    logs.push(logEntry);
    if (logs.length > 500) {
        logs.shift();
    }
    addLogEntry(logEntry);
    scrollToBottom();
    
    // Detectar jogadores entrando/saindo
    detectPlayerActivity(logEntry);
});

// Funções
function addLogEntry(entry) {
    const levelColors = {
        'INFO': 'text-primary',
        'WARN': 'text-yellow-400',
        'ERROR': 'text-red-400',
        'DEBUG': 'text-slate-500'
    };
    
    const color = levelColors[entry.level] || 'text-slate-300';
    const div = document.createElement('div');
    div.className = 'flex gap-4 mb-2';
    div.innerHTML = `
        <span class="text-slate-500">[${entry.timestamp}]</span>
        <span class="${color} font-bold">[${entry.level}]</span>
        <span class="text-slate-300">${escapeHtml(entry.message)}</span>
    `;
    consoleDiv.appendChild(div);
}

function renderLogs() {
    consoleDiv.innerHTML = '';
    logs.forEach(addLogEntry);
    scrollToBottom();
}

function scrollToBottom() {
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function handleCommandKey(event) {
    if (event.key === 'Enter') {
        sendCommand();
    }
}

async function sendCommand() {
    const command = commandInput.value.trim();
    if (!command) return;
    
    try {
        const response = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        
        if (response.ok) {
            commandInput.value = '';
            addLogEntry({
                timestamp: new Date().toLocaleTimeString(),
                level: 'COMMAND',
                message: `Comando enviado: ${command}`
            });
        }
    } catch (error) {
        console.error('Erro ao enviar comando:', error);
    }
}

function setStatusDot(elementId, isOnline) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.remove('bg-surface-variant', 'bg-primary', 'bg-error');
    el.classList.add(isOnline ? 'bg-primary' : 'bg-error');
    el.title = isOnline ? 'Online' : 'Offline';
}

async function updateStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();

        updateGamemodeUI(status.gamemode);
        document.getElementById('gamemode-select').dataset.current = status.gamemode;
        setStatusDot('uptime', status.running);
        setStatusDot('uptime-2', status.running);

        document.getElementById('java-connect-ip').textContent = status.localIp;
        document.getElementById('java-connect-port').textContent = status.javaPort;
        document.getElementById('bedrock-connect-ip').textContent = status.localIp;
        document.getElementById('bedrock-connect-port').textContent = status.bedrockPort;

        // Atualizar contagem de jogadores
        updatePlayerCountDisplay();
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
    }
}

async function updateSystemInfo() {
    try {
        const response = await fetch('/api/system');
        const info = await response.json();

        document.getElementById('cpu-usage').textContent = info.cpuUsagePercent;
        document.getElementById('cpu-bar').style.width = `${info.cpuUsagePercent}%`;
        document.getElementById('cpu-model').textContent = `${info.cpuModel} (${info.cpuCores} núcleos)`;

        document.getElementById('ram-usage').textContent = info.memUsagePercent;
        document.getElementById('ram-bar').style.width = `${info.memUsagePercent}%`;
        document.getElementById('ram-detail').textContent = `${(info.usedMemMB / 1024).toFixed(1)} GB / ${(info.totalMemMB / 1024).toFixed(1)} GB`;

        const tempEl = document.getElementById('cpu-temp');
        const tempUnitEl = document.getElementById('cpu-temp-unit');
        if (info.temperature !== null) {
            tempEl.textContent = info.temperature;
            tempUnitEl.textContent = '°C';
        } else {
            tempEl.textContent = 'N/D';
            tempUnitEl.textContent = '';
        }

        if (info.disk && info.disk.usagePercent !== null) {
            document.getElementById('disk-usage').textContent = info.disk.usagePercent;
            document.getElementById('disk-bar').style.width = `${info.disk.usagePercent}%`;
            document.getElementById('disk-detail').textContent = `${info.disk.usedGB} GB / ${info.disk.totalGB} GB`;
        } else {
            document.getElementById('disk-usage').textContent = 'N/D';
            document.getElementById('disk-detail').textContent = 'Indisponível';
        }

        recordUsageHistory(parseFloat(info.cpuUsagePercent), parseFloat(info.memUsagePercent));
    } catch (error) {
        console.error('Erro ao atualizar informações do sistema:', error);
    }
}

// Histórico de uso (CPU/RAM) para o gráfico
const usageHistory = { cpu: [], ram: [] };
const USAGE_HISTORY_MAX = 40;

function recordUsageHistory(cpuPercent, ramPercent) {
    usageHistory.cpu.push(cpuPercent);
    usageHistory.ram.push(ramPercent);
    if (usageHistory.cpu.length > USAGE_HISTORY_MAX) {
        usageHistory.cpu.shift();
        usageHistory.ram.shift();
    }
    drawUsageChart();
}

function drawUsageChart() {
    const canvas = document.getElementById('usage-chart');
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight || 160;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Linhas de grade horizontais
    ctx.strokeStyle = '#dce2f3';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    const drawLine = (data, color) => {
        if (data.length < 2) return;
        const stepX = width / (USAGE_HISTORY_MAX - 1);
        const offset = USAGE_HISTORY_MAX - data.length;

        ctx.beginPath();
        data.forEach((value, i) => {
            const x = (offset + i) * stepX;
            const y = height - (Math.min(100, value) / 100) * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();
    };

    drawLine(usageHistory.cpu, '#486800');
    drawLine(usageHistory.ram, '#4e635e');
}

window.addEventListener('resize', drawUsageChart);

const gamemodeNames = {
    'survival': 'Sobrevivência',
    'creative': 'Criativo',
    'adventure': 'Aventura',
    'spectator': 'Espectador'
};

function updateGamemodeUI(value) {
    document.getElementById('gamemode-select').value = value;
    document.getElementById('gamemode-label').textContent = gamemodeNames[value] || value;
    document.querySelectorAll('.gamemode-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === value);
    });
}

function toggleGamemodeMenu() {
    const menu = document.getElementById('gamemode-menu');
    const chevron = document.getElementById('gamemode-chevron');
    const isOpen = !menu.classList.contains('hidden');
    menu.classList.toggle('hidden', isOpen);
    chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function closeGamemodeMenu() {
    document.getElementById('gamemode-menu').classList.add('hidden');
    document.getElementById('gamemode-chevron').style.transform = '';
}

document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('gamemode-dropdown');
    if (dropdown && !dropdown.contains(event.target)) {
        closeGamemodeMenu();
    }
});

function selectGamemode(value) {
    closeGamemodeMenu();
    const current = document.getElementById('gamemode-select').dataset.current || 'survival';
    if (value === current) return;

    showConfirmModal(
        `Deseja alterar o modo de jogo para ${gamemodeNames[value]}?`,
        () => changeGamemode(value)
    );
}

async function changeGamemode(gamemode) {
    try {
        const response = await fetch('/api/gamemode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gamemode })
        });

        if (response.ok) {
            updateGamemodeUI(gamemode);
            document.getElementById('gamemode-select').dataset.current = gamemode;

            // Enviar comando para o servidor
            await sendCommandToServer(`gamemode ${gamemode} @a`);

            addLogEntry({
                timestamp: new Date().toLocaleTimeString(),
                level: 'INFO',
                message: `Modo de jogo alterado para: ${gamemodeNames[gamemode]}`
            });
        } else {
            const error = await response.json();
            showAlertModal(error.error || 'Não foi possível alterar o modo de jogo', { danger: true });
        }
    } catch (error) {
        console.error('Erro ao alterar modo de jogo:', error);
        showAlertModal('Erro ao alterar modo de jogo', { danger: true });
    }
}

async function sendCommandToServer(command) {
    try {
        const response = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        return response.ok;
    } catch (error) {
        console.error('Erro ao enviar comando:', error);
        return false;
    }
}

function resetWorld() {
    showConfirmModal(
        'Isso irá apagar o mundo completamente. Deseja continuar?',
        () => {
            showConfirmModal(
                'Essa ação é IRREVERSÍVEL! Tem certeza?',
                doResetWorld,
                { title: 'Confirmação final', danger: true, confirmLabel: 'Apagar Mundo' }
            );
        },
        { title: 'Resetar Mundo', danger: true, confirmLabel: 'Continuar' }
    );
}

async function doResetWorld() {
    try {
        const response = await fetch('/api/world/reset', {
            method: 'POST'
        });

        if (response.ok) {
            addLogEntry({
                timestamp: new Date().toLocaleTimeString(),
                level: 'INFO',
                message: 'Mundo resetado com sucesso! Reinicie o servidor para gerar um novo mundo.'
            });
            showAlertModal('Mundo resetado! Reinicie o servidor para gerar um novo mundo.');
            loadWorldInfo();
        } else {
            const error = await response.json();
            showAlertModal(error.error, { danger: true });
        }
    } catch (error) {
        console.error('Erro ao resetar mundo:', error);
        showAlertModal('Erro ao resetar mundo', { danger: true });
    }
}

function stopServer() {
    showConfirmModal('Deseja parar o servidor?', async () => {
        try {
            const response = await fetch('/api/server/stop', {
                method: 'POST'
            });

            if (response.ok) {
                addLogEntry({
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'INFO',
                    message: 'Comando de parada enviado ao servidor'
                });
            }
        } catch (error) {
            console.error('Erro ao parar servidor:', error);
        }
    }, { title: 'Parar servidor', danger: true, confirmLabel: 'Parar' });
}

function restartServer() {
    showConfirmModal('Deseja reiniciar o servidor?', async () => {
        try {
            const response = await fetch('/api/server/restart', {
                method: 'POST'
            });

            if (response.ok) {
                addLogEntry({
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'INFO',
                    message: 'Servidor reiniciando...'
                });
            }
        } catch (error) {
            console.error('Erro ao reiniciar servidor:', error);
        }
    }, { title: 'Reiniciar servidor', confirmLabel: 'Reiniciar' });
}

function clearLogs() {
    showConfirmModal('Deseja limpar os logs da tela?', () => {
        logs = [];
        consoleDiv.innerHTML = '<div class="text-slate-500">Logs limpos</div>';
    }, { title: 'Limpar logs', confirmLabel: 'Limpar' });
}

function copyConnectInfo(type) {
    const ip = document.getElementById(`${type}-connect-ip`).textContent;
    const port = document.getElementById(`${type}-connect-port`).textContent;
    navigator.clipboard.writeText(`${ip}:${port}`);
}

// Atualizar status a cada 5 segundos
setInterval(updateStatus, 5000);
updateStatus();

// Atualizar informações do PC a cada 3 segundos
setInterval(updateSystemInfo, 3000);
updateSystemInfo();

// Navegação entre views
const viewTitles = {
    dashboard: 'Painel de Controle',
    mundo: 'Mundo',
    mapa: 'Mapa',
    mods: 'Mods',
    jogadores: 'Jogadores',
    servidor: 'Servidor',
    configuracoes: 'Configurações'
};

// A aba Configurações só existe quando o painel roda dentro do app desktop Electron
// (window.desktopAPI é injetado pelo preload.js do Electron; não existe num navegador comum)
if (window.desktopAPI) {
    const navConfig = document.getElementById('nav-configuracoes');
    if (navConfig) navConfig.style.display = '';
}

function switchView(view) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${view}"]`).classList.add('active');

    document.getElementById('view-title').textContent = viewTitles[view] || 'Painel de Controle';

    if (view === 'mods') loadPlugins();
    if (view === 'mundo') loadWorldInfo();
    if (view === 'jogadores') renderPlayersList();
    if (view === 'mapa') loadMap();
}

// Aba Mapa (squaremap)
function loadMap() {
    const frame = document.getElementById('map-frame');
    // só carrega na primeira vez que a aba é aberta, pra não recarregar o mapa a cada troca de aba
    if (frame.dataset.loaded) return;
    frame.src = '/mapa/';
    frame.dataset.loaded = '1';
}

async function renderMap(type) {
    const statusEl = document.getElementById('map-status');
    const command = type === 'full' ? 'squaremap fullrender world' : 'squaremap radiusrender world 1000';

    statusEl.textContent = 'Enviando comando de renderização...';
    try {
        const response = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        const result = await response.json();

        if (response.ok) {
            statusEl.textContent = type === 'full'
                ? 'Renderizando o mundo todo em segundo plano. Pode levar vários minutos - recarregue o mapa depois.'
                : 'Renderizando 1000 blocos ao redor do spawn. Aguarde alguns instantes e recarregue o mapa.';
        } else {
            statusEl.textContent = 'Erro: ' + (result.error || 'falha ao enviar comando');
        }
    } catch (error) {
        console.error('Erro ao renderizar mapa:', error);
        statusEl.textContent = 'Erro ao enviar comando de renderização';
    }
}

// Aba Mods
async function loadPlugins() {
    const container = document.getElementById('plugins-list');
    container.innerHTML = '<div class="p-padding-card text-on-surface-variant text-sm">Carregando...</div>';

    try {
        const response = await fetch('/api/plugins');
        const plugins = await response.json();

        if (plugins.length === 0) {
            container.innerHTML = '<div class="p-padding-card text-on-surface-variant text-sm">Nenhum plugin instalado</div>';
            return;
        }

        container.innerHTML = plugins.map(plugin => `
            <div class="flex items-center justify-between p-4 px-6">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary-fixed-dim">extension</span>
                    <span class="text-on-surface text-sm font-semibold">${escapeHtml(plugin.name)}</span>
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-on-surface-variant text-xs">${plugin.sizeMB} MB</span>
                    <span class="material-symbols-outlined cursor-pointer text-on-surface-variant hover:text-error transition-colors" onclick="deletePlugin('${escapeHtml(plugin.name)}')">delete</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<div class="p-padding-card text-error text-sm">Erro ao carregar plugins</div>';
    }
}

async function handlePluginFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    const formData = new FormData();
    formData.append('pluginJar', file);

    try {
        const response = await fetch('/api/plugins/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (response.ok) {
            showAlertModal(result.message);
            addLogEntry({
                timestamp: new Date().toLocaleTimeString(),
                level: 'INFO',
                message: result.message
            });
            loadPlugins();
        } else {
            showAlertModal(result.error, { danger: true });
        }
    } catch (error) {
        console.error('Erro ao enviar mod:', error);
        showAlertModal('Erro ao enviar mod', { danger: true });
    }
}

function deletePlugin(name) {
    showConfirmModal(
        `Deseja remover o mod "${name}"? Reinicie o servidor para aplicar.`,
        async () => {
            try {
                const response = await fetch(`/api/plugins/${encodeURIComponent(name)}`, {
                    method: 'DELETE'
                });
                const result = await response.json();

                if (response.ok) {
                    addLogEntry({
                        timestamp: new Date().toLocaleTimeString(),
                        level: 'INFO',
                        message: result.message
                    });
                    loadPlugins();
                } else {
                    showAlertModal(result.error, { danger: true });
                }
            } catch (error) {
                console.error('Erro ao remover mod:', error);
                showAlertModal('Erro ao remover mod', { danger: true });
            }
        },
        { title: 'Remover Mod', danger: true, confirmLabel: 'Remover' }
    );
}

// Aba Mundo
const difficultyNames = {
    'peaceful': 'Pacífico',
    'easy': 'Fácil',
    'normal': 'Normal',
    'hard': 'Difícil'
};

async function loadWorldInfo() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();
        document.getElementById('world-name').textContent = status.worldExists ? status.levelName : 'Ainda não gerado';
        document.getElementById('world-seed').textContent = status.levelSeed ? status.levelSeed : 'aleatória';
        updateDifficultyUI(status.difficulty || 'easy');
    } catch (error) {
        console.error('Erro ao carregar informações do mundo:', error);
    }
}

function updateDifficultyUI(value) {
    document.getElementById('difficulty-label').textContent = difficultyNames[value] || value;
    document.getElementById('difficulty-label').dataset.current = value;
    document.querySelectorAll('#difficulty-menu .gamemode-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === value);
    });
}

function toggleDifficultyMenu() {
    const menu = document.getElementById('difficulty-menu');
    menu.classList.toggle('hidden');
}

function closeDifficultyMenu() {
    document.getElementById('difficulty-menu').classList.add('hidden');
}

document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('difficulty-dropdown');
    if (dropdown && !dropdown.contains(event.target)) {
        closeDifficultyMenu();
    }
});

function selectDifficulty(value) {
    closeDifficultyMenu();
    const current = document.getElementById('difficulty-label').dataset.current;
    if (value === current) return;

    showConfirmModal(
        `Deseja alterar a dificuldade para ${difficultyNames[value]}?`,
        () => applyDifficulty(value)
    );
}

async function applyDifficulty(value) {
    try {
        const response = await fetch('/api/world/difficulty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ difficulty: value })
        });

        if (response.ok) {
            const result = await response.json();
            updateDifficultyUI(value);
            addLogEntry({
                timestamp: new Date().toLocaleTimeString(),
                level: 'INFO',
                message: result.message || result.warning || `Dificuldade alterada para: ${difficultyNames[value]}`
            });
        } else {
            const error = await response.json();
            showAlertModal(error.error || 'Não foi possível alterar a dificuldade', { danger: true });
        }
    } catch (error) {
        console.error('Erro ao alterar dificuldade:', error);
        showAlertModal('Erro ao alterar dificuldade', { danger: true });
    }
}

// Modal genérico
function openModal(html) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-content').innerHTML = '';
}

document.getElementById('modal-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'modal-overlay') closeModal();
});

function showAlertModal(message, { title, danger = false } = {}) {
    openModal(`
        <div class="flex items-start gap-3 mb-5">
            <span class="material-symbols-outlined ${danger ? 'text-error' : 'text-primary-fixed-dim'} text-2xl">${danger ? 'error' : 'check_circle'}</span>
            <div>
                <h3 class="text-base font-bold text-on-surface">${escapeHtml(title || (danger ? 'Erro' : 'Aviso'))}</h3>
                <p class="text-sm text-on-surface-variant mt-1">${escapeHtml(message)}</p>
            </div>
        </div>
        <div class="flex justify-end">
            <button id="modal-alert-ok" class="px-4 py-2 bg-primary-container text-on-primary-fixed rounded-lg font-bold text-xs uppercase">OK</button>
        </div>
    `);
    document.getElementById('modal-alert-ok').onclick = closeModal;
}

function showConfirmModal(message, onConfirm, { title = 'Confirmar ação', danger = false, confirmLabel = 'Confirmar' } = {}) {
    openModal(`
        <div class="flex items-start gap-3 mb-5">
            <span class="material-symbols-outlined ${danger ? 'text-error' : 'text-primary-fixed-dim'} text-2xl">${danger ? 'warning' : 'help'}</span>
            <div>
                <h3 class="text-base font-bold text-on-surface">${escapeHtml(title)}</h3>
                <p class="text-sm text-on-surface-variant mt-1">${escapeHtml(message)}</p>
            </div>
        </div>
        <div class="flex justify-end gap-3">
            <button id="modal-cancel-btn" class="px-4 py-2 bg-surface-container-highest border border-outline-variant text-on-surface rounded-lg font-bold text-xs uppercase">Cancelar</button>
            <button id="modal-confirm-btn" class="px-4 py-2 ${danger ? 'bg-error text-white' : 'bg-primary-container text-on-primary-fixed'} rounded-lg font-bold text-xs uppercase">${escapeHtml(confirmLabel)}</button>
        </div>
    `);
    document.getElementById('modal-cancel-btn').onclick = closeModal;
    document.getElementById('modal-confirm-btn').onclick = () => {
        closeModal();
        onConfirm();
    };
}

// Criar novo mundo
async function openCreateWorldModal() {
    try {
        const status = await (await fetch('/api/status')).json();
        if (status.worldExists) {
            showOverwriteWarning(() => showCreateWorldForm());
        } else {
            showCreateWorldForm();
        }
    } catch (error) {
        console.error('Erro ao verificar mundo existente:', error);
        showCreateWorldForm();
    }
}

function showOverwriteWarning(onConfirm) {
    showConfirmModal(
        'Essa ação vai apagar o mundo atual e substituí-lo. Essa operação é irreversível. Deseja continuar?',
        onConfirm,
        { title: 'Já existe um mundo', danger: true, confirmLabel: 'Substituir Mundo' }
    );
}

function showCreateWorldForm() {
    openModal(`
        <h3 class="text-base font-bold text-on-surface mb-4">Criar Novo Mundo</h3>
        <div class="space-y-4">
            <div>
                <label class="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Nome do Mundo</label>
                <input id="new-world-name" type="text" placeholder="world" class="w-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary-fixed-dim/40"/>
            </div>
            <div>
                <label class="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Dificuldade</label>
                <select id="new-world-difficulty" class="w-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary-fixed-dim/40">
                    <option value="peaceful">Pacífico</option>
                    <option value="easy" selected>Fácil</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Difícil</option>
                </select>
            </div>
            <div>
                <label class="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Seed (opcional)</label>
                <input id="new-world-seed" type="text" placeholder="Deixe em branco para aleatória" class="w-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary-fixed-dim/40"/>
            </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
            <button onclick="closeModal()" class="px-4 py-2 bg-surface-container-highest border border-outline-variant text-on-surface rounded-lg font-bold text-xs uppercase">Cancelar</button>
            <button onclick="submitCreateWorld()" class="px-4 py-2 bg-primary-container text-on-primary-fixed rounded-lg font-bold text-xs uppercase">Criar Mundo</button>
        </div>
    `);
}

async function submitCreateWorld() {
    const name = document.getElementById('new-world-name').value;
    const difficulty = document.getElementById('new-world-difficulty').value;
    const seed = document.getElementById('new-world-seed').value;

    try {
        const response = await fetch('/api/world/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, difficulty, seed })
        });
        const result = await response.json();

        if (response.ok) {
            closeModal();
            addLogEntry({
                timestamp: new Date().toLocaleTimeString(),
                level: 'INFO',
                message: result.message
            });
            showAlertModal(result.message);
            loadWorldInfo();
        } else {
            showAlertModal(result.error, { danger: true });
        }
    } catch (error) {
        console.error('Erro ao criar mundo:', error);
        showAlertModal('Erro ao criar mundo', { danger: true });
    }
}

// Enviar mundo (.zip)
async function handleWorldFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const status = await (await fetch('/api/status')).json();
        if (status.worldExists) {
            showOverwriteWarning(() => uploadWorldZip(file));
        } else {
            uploadWorldZip(file);
        }
    } catch (error) {
        console.error('Erro ao verificar mundo existente:', error);
        uploadWorldZip(file);
    } finally {
        event.target.value = '';
    }
}

async function uploadWorldZip(file) {
    const formData = new FormData();
    formData.append('worldZip', file);

    addLogEntry({
        timestamp: new Date().toLocaleTimeString(),
        level: 'INFO',
        message: `Enviando mundo (${(file.size / 1024 / 1024).toFixed(1)} MB)...`
    });

    try {
        const response = await fetch('/api/world/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (response.ok) {
            addLogEntry({
                timestamp: new Date().toLocaleTimeString(),
                level: 'INFO',
                message: result.message
            });
            showAlertModal(result.message);
            loadWorldInfo();
        } else {
            showAlertModal(result.error, { danger: true });
        }
    } catch (error) {
        console.error('Erro ao enviar mundo:', error);
        showAlertModal('Erro ao enviar mundo', { danger: true });
    }
}

// Aba Jogadores
function renderPlayersList() {
    const container = document.getElementById('players-list');
    if (playersOnline.size === 0) {
        container.innerHTML = '<div class="p-padding-card text-on-surface-variant text-sm">Nenhum jogador online</div>';
        return;
    }

    container.innerHTML = [...playersOnline].map(name => `
        <div class="flex items-center justify-between gap-3 p-4 px-6">
            <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-primary-fixed-dim">person</span>
                <span class="text-on-surface text-sm font-semibold">${escapeHtml(name)}</span>
            </div>
            <button onclick="openPlayerManageModal('${escapeHtml(name)}')" class="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-highest border border-outline-variant text-on-surface rounded-lg font-bold text-xs uppercase transition-all hover:bg-surface-variant">
                <span class="material-symbols-outlined text-sm">tune</span>
                Gerenciar
            </button>
        </div>
    `).join('');
}

async function playerAction(name, type, params, successMessage) {
    try {
        const response = await fetch(`/api/players/${encodeURIComponent(name)}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, ...params })
        });
        const result = await response.json();

        if (response.ok) {
            addLogEntry({
                timestamp: new Date().toLocaleTimeString(),
                level: 'INFO',
                message: successMessage || `Ação "${type}" aplicada em ${name}`
            });
        } else {
            showAlertModal(result.error, { danger: true });
        }
        return response.ok;
    } catch (error) {
        console.error(`Erro na ação ${type} para ${name}:`, error);
        showAlertModal('Erro ao executar ação', { danger: true });
        return false;
    }
}

function openPlayerManageModal(name) {
    openModal(`
        <h3 class="text-base font-bold text-on-surface mb-4">Gerenciar ${escapeHtml(name)}</h3>

        <div class="space-y-5">
            <div>
                <p class="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Modo de Jogo</p>
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="playerAction('${name}','gamemode',{mode:'survival'},'${name} agora está em Sobrevivência')" class="px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-bold uppercase hover:bg-surface-container">Sobrevivência</button>
                    <button onclick="playerAction('${name}','gamemode',{mode:'creative'},'${name} agora está em Criativo')" class="px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-bold uppercase hover:bg-surface-container">Criativo</button>
                    <button onclick="playerAction('${name}','gamemode',{mode:'adventure'},'${name} agora está em Aventura')" class="px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-bold uppercase hover:bg-surface-container">Aventura</button>
                    <button onclick="playerAction('${name}','gamemode',{mode:'spectator'},'${name} agora está em Espectador')" class="px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-bold uppercase hover:bg-surface-container">Espectador</button>
                </div>
            </div>

            <div>
                <p class="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Restrições</p>
                <p class="text-[11px] text-on-surface-variant mb-3">"Impedir quebrar/construir" usa o modo Aventura (limitação do próprio Minecraft, não existe trava separada).</p>
                <div class="flex items-center justify-between py-1.5">
                    <span class="text-sm text-on-surface font-medium">Impedir quebrar/construir</span>
                    <label class="switch">
                        <input type="checkbox" onchange="playerAction('${name}','restrict',{building:this.checked}, this.checked ? '${name} não pode mais quebrar/construir' : '${name} pode quebrar/construir novamente')">
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="flex items-center justify-between py-1.5">
                    <span class="text-sm text-on-surface font-medium">Impedir PvP</span>
                    <label class="switch">
                        <input type="checkbox" onchange="playerAction('${name}','pvp',{enabled:!this.checked}, this.checked ? '${name} não pode mais atacar outros jogadores' : '${name} pode atacar outros jogadores novamente')">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <div>
                <p class="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Dar Item</p>
                <div class="flex gap-2">
                    <input id="give-item-id" type="text" placeholder="ex: diamond_sword" class="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary-fixed-dim/40"/>
                    <input id="give-item-amount" type="number" value="1" min="1" max="6400" class="w-20 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary-fixed-dim/40"/>
                    <button onclick="submitGiveItem('${name}')" class="px-4 py-2 bg-primary-container text-on-primary-fixed rounded-lg font-bold text-xs uppercase">Dar</button>
                </div>
            </div>

            <div>
                <p class="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Ações</p>
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="confirmKickPlayer('${name}')" class="px-3 py-2 bg-error/10 text-error border border-error/20 rounded-lg text-xs font-bold uppercase hover:bg-error/20">Kickar</button>
                    <button onclick="confirmBanPlayer('${name}')" class="px-3 py-2 bg-error text-white rounded-lg text-xs font-bold uppercase hover:brightness-90">Banir</button>
                </div>
            </div>
        </div>

        <div class="flex justify-end mt-6">
            <button onclick="closeModal()" class="px-4 py-2 bg-surface-container-highest border border-outline-variant text-on-surface rounded-lg font-bold text-xs uppercase">Fechar</button>
        </div>
    `);
}

async function submitGiveItem(name) {
    const item = document.getElementById('give-item-id').value.trim();
    const amount = document.getElementById('give-item-amount').value;
    if (!item) return;
    await playerAction(name, 'give', { item, amount }, `Item "${item}" x${amount} dado para ${name}`);
}

function confirmKickPlayer(name) {
    showConfirmModal(`Deseja kickar ${name} do servidor?`, async () => {
        closeModal();
        await playerAction(name, 'kick', {}, `${name} foi kickado`);
    }, { title: 'Kickar jogador', danger: true, confirmLabel: 'Kickar' });
}

function confirmBanPlayer(name) {
    showConfirmModal(`Deseja banir ${name} do servidor?`, async () => {
        closeModal();
        await playerAction(name, 'ban', {}, `${name} foi banido`);
    }, { title: 'Banir jogador', danger: true, confirmLabel: 'Banir' });
}

// Detectar atividade de jogadores nos logs
function detectPlayerActivity(logEntry) {
    const message = logEntry.message.toLowerCase();
    
    // Jogador entrou
    if (message.includes('joined the game') || message.includes('conectou-se ao servidor')) {
        // Padrões: "Player joined the game" ou "Player (logged in as: Player) connected"
        const patterns = [
            /(\w+)\s+(?:\(.*?\)\s+)?(?:joined|conectou)/i,
            /(\w+)\s+joined/i,
            /(\w+)\s+conectou/i
        ];
        
        for (const pattern of patterns) {
            const match = logEntry.message.match(pattern);
            if (match && match[1]) {
                const playerName = match[1];
                playersOnline.add(playerName);
                updatePlayerCountDisplay();
                break;
            }
        }
    }
    
    // Jogador saiu
    if (message.includes('left the game') || message.includes('disconnected') || message.includes('desconectou')) {
        const patterns = [
            /(\w+)\s+(?:left|disconnected|desconectou)/i,
            /(\w+)\s+lost connection/i
        ];
        
        for (const pattern of patterns) {
            const match = logEntry.message.match(pattern);
            if (match && match[1]) {
                const playerName = match[1];
                playersOnline.delete(playerName);
                updatePlayerCountDisplay();
                break;
            }
        }
    }
    
    // Detectar contagem de jogadores em mensagens do servidor
    const playerCountMatch = logEntry.message.match(/(\d+)\s+(?:of|de)\s+(\d+)\s+players/i);
    if (playerCountMatch) {
        const current = parseInt(playerCountMatch[1]);
        maxPlayers = parseInt(playerCountMatch[2]);
        // Ajustar lista de jogadores se necessário
        if (playersOnline.size !== current) {
            // Recarregar lista se houver discrepância
            requestPlayerList();
        }
    }
}

function updatePlayerCountDisplay() {
    const count = playersOnline.size;
    const html = `<span class="text-4xl font-black text-on-surface leading-none">${count}</span>`;
    document.getElementById('player-count').innerHTML = html;
    document.getElementById('player-count-2').innerHTML = html;

    if (document.getElementById('view-jogadores').classList.contains('active')) {
        renderPlayersList();
    }
}

async function requestPlayerList() {
    // Tentar obter lista de jogadores via comando
    await sendCommandToServer('list');
}

// Aba Configurações (AWS ligar/desligar)
function setAwsBadge(state) {
    const badge = document.getElementById('aws-state-badge');
    if (!badge) return;
    badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest';
    if (state === 'running') {
        badge.classList.add('bg-green-100', 'text-green-700');
        badge.textContent = 'ligada';
    } else if (state === 'stopped' || state === 'terminated') {
        badge.classList.add('bg-red-100', 'text-red-700');
        badge.textContent = 'desligada';
    } else {
        badge.classList.add('bg-yellow-100', 'text-yellow-700');
        badge.textContent = state || 'desconhecido';
    }
}

function setAwsStatusMsg(msg) {
    const el = document.getElementById('aws-status-msg');
    if (el) el.textContent = msg;
}

async function awsStartInstance() {
    if (!window.desktopAPI) return;
    setAwsStatusMsg('Ligando instância... isso pode levar 1-2 minutos.');
    setAwsBadge('pending');
    try {
        const info = await window.desktopAPI.awsStart();
        setAwsBadge(info.state);
        setAwsStatusMsg(`Instância ligada! IP público: ${info.publicIp}. Reconectando o painel...`);
        await window.desktopAPI.connect();
    } catch (err) {
        setAwsStatusMsg('Erro: ' + err.message);
    }
}

async function awsStopInstance() {
    if (!window.desktopAPI) return;
    setAwsStatusMsg('Desligando instância...');
    try {
        const info = await window.desktopAPI.awsStop();
        setAwsBadge(info.state);
        setAwsStatusMsg('Instância desligando/desligada.');
    } catch (err) {
        setAwsStatusMsg('Erro: ' + err.message);
    }
}

async function awsCheckStatus() {
    if (!window.desktopAPI) return;
    setAwsStatusMsg('Verificando status...');
    try {
        const info = await window.desktopAPI.awsStatus();
        setAwsBadge(info.state);
        setAwsStatusMsg(`Status: ${info.state}${info.publicIp ? ' | IP: ' + info.publicIp : ''}`);
    } catch (err) {
        setAwsStatusMsg('Erro: ' + err.message);
    }
}
