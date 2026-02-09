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

async function updateStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();
        
        document.getElementById('server-status').textContent = status.running ? 'Online' : 'Offline';
        document.getElementById('server-status').className = status.running 
            ? 'text-green-400 text-xs font-medium' 
            : 'text-red-400 text-xs font-medium';
        
        document.getElementById('gamemode-select').value = status.gamemode;
        document.getElementById('gamemode-select').dataset.current = status.gamemode;
        document.getElementById('uptime').textContent = status.running ? 'Online' : 'Offline';
        maxPlayers = parseInt(status.maxPlayers) || 20;
        
        // Atualizar contagem de jogadores
        updatePlayerCountDisplay();
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
    }
}

async function changeGamemode() {
    const gamemode = document.getElementById('gamemode-select').value;
    const gamemodeNames = {
        'survival': 'Sobrevivência',
        'creative': 'Criativo',
        'adventure': 'Aventura',
        'spectator': 'Espectador'
    };
    
    if (!confirm(`Deseja alterar o modo de jogo para ${gamemodeNames[gamemode]}?`)) {
        document.getElementById('gamemode-select').value = document.getElementById('gamemode-select').dataset.current || 'survival';
        return;
    }
    
    try {
        const response = await fetch('/api/gamemode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gamemode })
        });
        
        if (response.ok) {
            const result = await response.json();
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
            alert('Erro: ' + (error.error || 'Não foi possível alterar o modo de jogo'));
            document.getElementById('gamemode-select').value = document.getElementById('gamemode-select').dataset.current || 'survival';
        }
    } catch (error) {
        console.error('Erro ao alterar modo de jogo:', error);
        alert('Erro ao alterar modo de jogo');
        document.getElementById('gamemode-select').value = document.getElementById('gamemode-select').dataset.current || 'survival';
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

async function resetWorld() {
    if (!confirm('⚠️ ATENÇÃO: Isso irá APAGAR o mundo completamente! Deseja continuar?')) {
        return;
    }
    
    if (!confirm('⚠️ Esta ação é IRREVERSÍVEL! Tem certeza?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/world/reset', {
            method: 'POST'
        });
        
        if (response.ok) {
            const result = await response.json();
            addLogEntry({
                timestamp: new Date().toLocaleTimeString(),
                level: 'INFO',
                message: 'Mundo resetado com sucesso! Reinicie o servidor para gerar um novo mundo.'
            });
            alert('Mundo resetado! Reinicie o servidor para gerar um novo mundo.');
        } else {
            const error = await response.json();
            alert('Erro: ' + error.error);
        }
    } catch (error) {
        console.error('Erro ao resetar mundo:', error);
        alert('Erro ao resetar mundo');
    }
}

async function stopServer() {
    if (!confirm('Deseja parar o servidor?')) {
        return;
    }
    
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
}

async function restartServer() {
    if (!confirm('Deseja reiniciar o servidor?')) {
        return;
    }
    
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
}

function clearLogs() {
    if (confirm('Deseja limpar os logs da tela?')) {
        logs = [];
        consoleDiv.innerHTML = '<div class="text-slate-500">Logs limpos</div>';
    }
}

function copyIP() {
    const ip = document.getElementById('server-ip').textContent;
    navigator.clipboard.writeText(ip).then(() => {
        const icon = event.target;
        icon.textContent = 'check';
        setTimeout(() => {
            icon.textContent = 'content_copy';
        }, 2000);
    });
}

// Atualizar status a cada 5 segundos
setInterval(updateStatus, 5000);
updateStatus();

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
    document.getElementById('player-count').innerHTML = `${count} <span class="text-lg text-slate-500 font-medium">/ ${maxPlayers}</span>`;
}

async function requestPlayerList() {
    // Tentar obter lista de jogadores via comando
    await sendCommandToServer('list');
}
