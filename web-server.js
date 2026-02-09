const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const serverDir = path.join(__dirname, 'server');
const logsDir = path.join(serverDir, 'logs');
const serverPropertiesPath = path.join(serverDir, 'server.properties');
const worldDir = path.join(serverDir, 'world');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Variável para armazenar o processo do servidor
let serverProcess = null;
let logWatcher = null;

// Função para encontrar processo do servidor (opcional, para comandos)
function findServerProcess() {
    // Por enquanto, retornamos null pois o servidor é iniciado separadamente
    // Em uma versão futura, podemos melhorar isso
    return null;
}

// Função para ler server.properties
function readServerProperties() {
    const content = fs.readFileSync(serverPropertiesPath, 'utf-8');
    const props = {};
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                props[key] = valueParts.join('=');
            }
        }
    });
    return props;
}

// Função para escrever server.properties
function writeServerProperties(props) {
    const content = fs.readFileSync(serverPropertiesPath, 'utf-8');
    const lines = content.split('\n');
    const newLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key] = trimmed.split('=');
            if (key && props.hasOwnProperty(key)) {
                return `${key}=${props[key]}`;
            }
        }
        return line;
    });
    fs.writeFileSync(serverPropertiesPath, newLines.join('\n'), 'utf-8');
}

// Função para obter o arquivo de log mais recente
function getLatestLogFile() {
    if (!fs.existsSync(logsDir)) {
        return null;
    }
    const files = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.log.gz') || f.endsWith('.log'))
        .map(f => ({
            name: f,
            path: path.join(logsDir, f),
            time: fs.statSync(path.join(logsDir, f)).mtime
        }))
        .sort((a, b) => b.time - a.time);
    return files.length > 0 ? files[0].path : null;
}

// Função para ler logs
function readLogs(limit = 100) {
    const logFile = getLatestLogFile();
    if (!logFile) {
        return [];
    }
    
    try {
        const content = fs.readFileSync(logFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        return lines.slice(-limit).map(line => parseLogLine(line));
    } catch (error) {
        return [];
    }
}

// Função para parsear linha de log
function parseLogLine(line) {
    const timestampMatch = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
    const levelMatch = line.match(/\[(INFO|WARN|ERROR|DEBUG)\]/);
    
    let timestamp = timestampMatch ? timestampMatch[1] : new Date().toLocaleTimeString();
    let level = levelMatch ? levelMatch[1] : 'INFO';
    let message = line;
    
    if (timestampMatch) {
        message = line.substring(line.indexOf(']') + 1).trim();
    }
    if (levelMatch) {
        message = message.substring(message.indexOf(']') + 1).trim();
    }
    
    return { timestamp, level, message, raw: line };
}

// Função para monitorar logs em tempo real
function watchLogs() {
    if (logWatcher) {
        clearInterval(logWatcher);
    }
    
    const checkLogs = () => {
        const logFile = getLatestLogFile();
        if (!logFile || !fs.existsSync(logFile)) {
            return;
        }
        
        try {
            const stats = fs.statSync(logFile);
            if (!watchLogs.lastSize) {
                watchLogs.lastSize = stats.size;
                watchLogs.currentFile = logFile;
            }
            
            // Se o arquivo mudou, resetar
            if (watchLogs.currentFile !== logFile) {
                watchLogs.lastSize = stats.size;
                watchLogs.currentFile = logFile;
            }
            
            const currentSize = stats.size;
            if (currentSize > watchLogs.lastSize) {
                const stream = fs.createReadStream(logFile, {
                    start: watchLogs.lastSize,
                    end: currentSize
                });
                
                let buffer = '';
                stream.on('data', (chunk) => {
                    buffer += chunk.toString();
                });
                
                stream.on('end', () => {
                    buffer.split('\n').forEach(line => {
                        if (line.trim()) {
                            const logEntry = parseLogLine(line);
                            io.emit('log', logEntry);
                        }
                    });
                });
                
                stream.on('error', (err) => {
                    // Ignorar erros de leitura
                });
                
                watchLogs.lastSize = currentSize;
            }
        } catch (error) {
            // Arquivo pode não existir ainda
            watchLogs.lastSize = 0;
        }
    };
    
    watchLogs.lastSize = 0;
    watchLogs.currentFile = null;
    
    logWatcher = setInterval(checkLogs, 1000);
    checkLogs(); // Verificar imediatamente
}

// API Routes
app.get('/api/status', (req, res) => {
    const props = readServerProperties();
    const isRunning = serverProcess !== null && serverProcess.exitCode === null;
    
    res.json({
        running: isRunning,
        gamemode: props['gamemode'] || 'survival',
        difficulty: props['difficulty'] || 'easy',
        maxPlayers: props['max-players'] || '20',
        onlineMode: props['online-mode'] === 'true',
        worldExists: fs.existsSync(worldDir)
    });
});

app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const logs = readLogs(limit);
    res.json(logs);
});

app.post('/api/command', (req, res) => {
    const { command } = req.body;
    
    if (!command || !command.trim()) {
        return res.status(400).json({ error: 'Comando vazio' });
    }
    
    // Verificar se o servidor está rodando
    const props = readServerProperties();
    const rconEnabled = props['enable-rcon'] === 'true';
    const rconPort = props['rcon.port'] || '25575';
    const rconPassword = props['rcon.password'] || '';
    
    if (rconEnabled && rconPassword) {
        // Usar RCON para enviar comando
        sendRconCommand(rconPort, rconPassword, command)
            .then(result => {
                res.json({ success: true, message: 'Comando enviado', result });
            })
            .catch(error => {
                res.status(500).json({ error: 'Erro ao enviar comando via RCON: ' + error.message });
            });
    } else {
        // Tentar escrever em arquivo de comandos (fallback)
        const commandsFile = path.join(serverDir, 'commands.txt');
        try {
            fs.appendFileSync(commandsFile, command + '\n', 'utf-8');
            res.json({ 
                success: true, 
                message: 'Comando salvo. Para executar comandos em tempo real, habilite RCON no server.properties',
                note: 'Adicione no server.properties: enable-rcon=true, rcon.port=25575, rcon.password=sua_senha'
            });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao salvar comando: ' + error.message });
        }
    }
});

// Função para enviar comando via RCON
function sendRconCommand(port, password, command) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let requestId = 1;
        let authenticated = false;
        
        client.connect(parseInt(port), 'localhost', () => {
            // Enviar autenticação
            const authPacket = createRconPacket(3, password); // Type 3 = AUTH
            client.write(authPacket);
        });
        
        client.on('data', (data) => {
            const response = parseRconPacket(data);
            
            if (!authenticated) {
                if (response.type === 2 && response.id === requestId) { // Type 2 = AUTH_RESPONSE
                    authenticated = true;
                    requestId++;
                    // Enviar comando
                    const commandPacket = createRconPacket(2, command); // Type 2 = EXECCOMMAND
                    client.write(commandPacket);
                } else {
                    client.destroy();
                    reject(new Error('Falha na autenticação RCON'));
                }
            } else {
                if (response.type === 0) { // Type 0 = RESPONSE_VALUE
                    client.destroy();
                    resolve(response.body);
                }
            }
        });
        
        client.on('error', (error) => {
            reject(error);
        });
        
        client.setTimeout(5000, () => {
            client.destroy();
            reject(new Error('Timeout na conexão RCON'));
        });
    });
}

// Funções auxiliares para RCON
function createRconPacket(type, body) {
    const id = 1;
    const bodyBuffer = Buffer.from(body, 'ascii');
    const packet = Buffer.alloc(14 + bodyBuffer.length);
    packet.writeInt32LE(bodyBuffer.length + 10, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    bodyBuffer.copy(packet, 12);
    packet.writeInt16LE(0, 12 + bodyBuffer.length); // Null terminators
    return packet;
}

function parseRconPacket(buffer) {
    const length = buffer.readInt32LE(0);
    const id = buffer.readInt32LE(4);
    const type = buffer.readInt32LE(8);
    const body = buffer.toString('ascii', 12, length + 2);
    return { id, type, body: body.replace(/\0/g, '') };
}

app.post('/api/gamemode', (req, res) => {
    const { gamemode } = req.body;
    const validModes = ['survival', 'creative', 'adventure', 'spectator'];
    
    if (!validModes.includes(gamemode)) {
        return res.status(400).json({ error: 'Modo de jogo inválido' });
    }
    
    const props = readServerProperties();
    props['gamemode'] = gamemode;
    writeServerProperties(props);
    
    // Tentar aplicar para todos os jogadores online via RCON
    const rconEnabled = props['enable-rcon'] === 'true';
    const rconPort = props['rcon.port'] || '25575';
    const rconPassword = props['rcon.password'] || '';
    
    if (rconEnabled && rconPassword) {
        sendRconCommand(rconPort, rconPassword, `gamemode ${gamemode} @a`)
            .then(() => {
                res.json({ success: true, gamemode, message: 'Modo de jogo alterado para todos os jogadores' });
            })
            .catch(error => {
                // Mesmo se RCON falhar, salvamos a configuração
                res.json({ 
                    success: true, 
                    gamemode, 
                    warning: 'Configuração salva, mas não foi possível aplicar aos jogadores online: ' + error.message 
                });
            });
    } else {
        res.json({ 
            success: true, 
            gamemode,
            message: 'Configuração salva. Para aplicar aos jogadores online, habilite RCON no server.properties',
            note: 'Adicione: enable-rcon=true, rcon.port=25575, rcon.password=sua_senha'
        });
    }
});

app.post('/api/world/reset', (req, res) => {
    if (serverProcess && serverProcess.exitCode === null) {
        return res.status(400).json({ error: 'Pare o servidor antes de resetar o mundo' });
    }
    
    try {
        if (fs.existsSync(worldDir)) {
            fs.rmSync(worldDir, { recursive: true, force: true });
        }
        res.json({ success: true, message: 'Mundo resetado com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/server/start', (req, res) => {
    if (serverProcess && serverProcess.exitCode === null) {
        return res.status(400).json({ error: 'Servidor já está rodando' });
    }
    
    // O servidor será iniciado pelo npm run dev
    res.json({ success: true, message: 'Use "npm run dev" para iniciar o servidor' });
});

app.post('/api/server/stop', (req, res) => {
    const props = readServerProperties();
    const rconEnabled = props['enable-rcon'] === 'true';
    
    if (rconEnabled) {
        res.json({ 
            success: true, 
            message: 'Use RCON para parar o servidor, ou pare manualmente com Ctrl+C no terminal onde o servidor está rodando' 
        });
    } else {
        res.json({ 
            success: true, 
            message: 'Para parar o servidor, use Ctrl+C no terminal onde ele está rodando, ou habilite RCON no server.properties' 
        });
    }
});

app.post('/api/server/restart', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Para reiniciar, pare o servidor (Ctrl+C) e execute "npm run dev" novamente' 
    });
});

// WebSocket connection
io.on('connection', (socket) => {
    console.log('Cliente conectado');
    
    // Enviar logs existentes
    const logs = readLogs(100);
    socket.emit('logs', logs);
    
    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
    });
});

// Iniciar monitoramento de logs
watchLogs();

// Função para obter o IP local
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`🌐 Interface web rodando em:`);
    console.log(`   Local: http://localhost:${PORT}`);
    console.log(`   Rede:  http://${localIP}:${PORT}`);
    console.log(`📊 Acesse no navegador para gerenciar o servidor`);
});
