const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const os = require('os');
const multer = require('multer');
const launcher = require('./server-launcher');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const serverDir = path.join(__dirname, 'server');
const logsDir = path.join(serverDir, 'logs');
const serverPropertiesPath = path.join(serverDir, 'server.properties');
const uploadsDir = path.join(serverDir, '.tmp-uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({ dest: uploadsDir });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Variável para armazenar o processo do servidor (só existe se FOMOS nós que iniciamos;
// se o servidor foi iniciado externamente via "npm run dev", isso fica null mesmo rodando)
let serverProcess = null;
let logWatcher = null;

function spawnMinecraftServer() {
    launcher.ensureServerReady();
    const child = spawn('java', launcher.getJavaArgs(), {
        cwd: launcher.serverDir,
        detached: true,
        stdio: 'ignore'
    });
    child.unref();
    serverProcess = child;
    child.on('exit', () => {
        serverProcess = null;
    });
    return child;
}

function waitForPortState(port, wantOpen, timeoutMs) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = async () => {
            const open = await isPortOpen(port);
            if (open === wantOpen) return resolve();
            if (Date.now() - start > timeoutMs) {
                return reject(new Error(wantOpen ? 'Tempo esgotado esperando o servidor iniciar' : 'Tempo esgotado esperando o servidor parar'));
            }
            setTimeout(check, 1000);
        };
        check();
    });
}

async function stopMinecraftServer() {
    const props = readServerProperties();
    const javaPort = parseInt(props['server-port'] || '25565', 10);

    if (!(await isPortOpen(javaPort))) {
        return;
    }

    const rconEnabled = props['enable-rcon'] === 'true';
    const rconPassword = props['rcon.password'] || '';
    const rconPort = props['rcon.port'] || '25575';

    if (rconEnabled && rconPassword) {
        await sendRconCommand(rconPort, rconPassword, 'stop').catch(() => {});
    } else if (serverProcess) {
        serverProcess.kill('SIGTERM');
    } else {
        throw new Error('Não foi possível parar o servidor automaticamente: habilite o RCON (rode "npm run enable-rcon" e reinicie) ou pare manualmente.');
    }

    await waitForPortState(javaPort, false, 60000);
}

async function startMinecraftServer() {
    const props = readServerProperties();
    const javaPort = parseInt(props['server-port'] || '25565', 10);

    if (await isPortOpen(javaPort)) {
        throw new Error('Servidor já está rodando');
    }

    spawnMinecraftServer();
    await waitForPortState(javaPort, true, 120000);
}

async function restartMinecraftServer() {
    await stopMinecraftServer();
    await startMinecraftServer();
}

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

// Verifica se o servidor Minecraft está de pé checando se a porta Java está aberta
// (o servidor é iniciado por "npm run dev" em outro processo, então não temos o PID aqui)
function isPortOpen(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(800);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

// API Routes
// Lê a porta Bedrock configurada no Geyser (padrão 19132 se não encontrar)
function readBedrockPort() {
    try {
        const configPath = path.join(serverDir, 'plugins', 'Geyser-Spigot', 'config.yml');
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            const match = content.match(/^\s*port:\s*(\d+)/m);
            if (match) return parseInt(match[1], 10);
        }
    } catch (error) {
        // usa o padrão
    }
    return 19132;
}

function getRconCredentials() {
    const props = readServerProperties();
    return {
        enabled: props['enable-rcon'] === 'true',
        port: props['rcon.port'] || '25575',
        password: props['rcon.password'] || ''
    };
}

// Remove quebras de linha e espaços nas pontas de argumentos que vão para o RCON,
// evitando que um valor digitado no painel injete mais de um comando no servidor.
function sanitizeRconArg(value) {
    return String(value ?? '').replace(/[\r\n]/g, '').trim();
}

async function runRcon(command) {
    const { enabled, port, password } = getRconCredentials();
    if (!enabled || !password) {
        throw new Error('RCON não está habilitado. Rode "npm run enable-rcon" e reinicie o servidor.');
    }
    return sendRconCommand(port, password, command);
}

app.get('/api/players/online', async (req, res) => {
    const { enabled, password } = getRconCredentials();
    if (!enabled || !password) {
        return res.json({ players: [], rconEnabled: false });
    }

    try {
        const result = await runRcon('list');
        const match = result.match(/:\s*(.*)$/);
        const players = match && match[1].trim()
            ? match[1].split(',').map(n => n.trim()).filter(Boolean)
            : [];
        res.json({ players, rconEnabled: true });
    } catch (error) {
        res.status(500).json({ error: error.message, rconEnabled: true });
    }
});

const VALID_GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'];

app.post('/api/players/:name/action', express.json(), async (req, res) => {
    const name = sanitizeRconArg(req.params.name);
    const { type } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Jogador inválido' });
    }

    try {
        let result;
        switch (type) {
            case 'gamemode': {
                const mode = sanitizeRconArg(req.body.mode);
                if (!VALID_GAMEMODES.includes(mode)) {
                    return res.status(400).json({ error: 'Modo de jogo inválido' });
                }
                result = await runRcon(`gamemode ${mode} ${name}`);
                break;
            }
            case 'restrict': {
                // Vanilla não tem um "não pode quebrar/construir" isolado;
                // o mais próximo é o modo Aventura, que bloqueia quebra/colocação de blocos.
                const mode = req.body.building ? 'adventure' : 'survival';
                result = await runRcon(`gamemode ${mode} ${name}`);
                break;
            }
            case 'pvp': {
                if (req.body.enabled) {
                    result = await runRcon(`team leave ${name}`);
                } else {
                    await runRcon('team add pmine_nopvp').catch(() => {});
                    await runRcon('team modify pmine_nopvp friendlyFire false').catch(() => {});
                    result = await runRcon(`team join pmine_nopvp ${name}`);
                }
                break;
            }
            case 'give': {
                const item = sanitizeRconArg(req.body.item);
                const amount = Math.max(1, Math.min(6400, parseInt(req.body.amount, 10) || 1));
                if (!item) {
                    return res.status(400).json({ error: 'Informe o item' });
                }
                result = await runRcon(`give ${name} ${item} ${amount}`);
                break;
            }
            case 'kick': {
                const reason = sanitizeRconArg(req.body.reason);
                result = await runRcon(`kick ${name} ${reason}`.trim());
                break;
            }
            case 'ban': {
                const reason = sanitizeRconArg(req.body.reason);
                result = await runRcon(`ban ${name} ${reason}`.trim());
                break;
            }
            default:
                return res.status(400).json({ error: 'Ação inválida' });
        }
        res.json({ success: true, result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/status', async (req, res) => {
    const props = readServerProperties();
    const javaPort = parseInt(props['server-port'] || '25565', 10);
    const isRunning = await isPortOpen(javaPort);

    const levelName = props['level-name'] || 'world';
    const publicIp = await getPublicIp();

    res.json({
        running: isRunning,
        gamemode: props['gamemode'] || 'survival',
        difficulty: props['difficulty'] || 'easy',
        maxPlayers: props['max-players'] || '20',
        onlineMode: props['online-mode'] === 'true',
        levelName,
        levelSeed: props['level-seed'] || '',
        worldExists: fs.existsSync(path.join(serverDir, levelName)),
        javaPort,
        bedrockPort: readBedrockPort(),
        localIp: publicIp || getLocalIP()
    });
});

// Lê a temperatura da CPU tentando as fontes mais comuns do Linux:
// hwmon (k10temp/coretemp, usado em desktops) e thermal_zone (mais comum em notebooks/ARM)
function readCpuTemperature() {
    try {
        const hwmonDir = '/sys/class/hwmon';
        if (fs.existsSync(hwmonDir)) {
            const preferredNames = ['k10temp', 'coretemp', 'cpu_thermal'];
            const hwmons = fs.readdirSync(hwmonDir);

            for (const preferred of preferredNames) {
                for (const hwmon of hwmons) {
                    const namePath = path.join(hwmonDir, hwmon, 'name');
                    if (!fs.existsSync(namePath)) continue;
                    if (fs.readFileSync(namePath, 'utf-8').trim() !== preferred) continue;

                    const tempInput = path.join(hwmonDir, hwmon, 'temp1_input');
                    if (fs.existsSync(tempInput)) {
                        return Math.round(parseInt(fs.readFileSync(tempInput, 'utf-8'), 10) / 1000);
                    }
                }
            }
        }

        const thermalPath = '/sys/class/thermal/thermal_zone0/temp';
        if (fs.existsSync(thermalPath)) {
            return Math.round(parseInt(fs.readFileSync(thermalPath, 'utf-8'), 10) / 1000);
        }
    } catch (error) {
        // Sensor indisponível
    }
    return null;
}

app.get('/api/system', async (req, res) => {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const loadAvg = os.loadavg()[0];
    const cpuUsagePercent = Math.min(100, (loadAvg / cpus.length) * 100);

    const temperature = readCpuTemperature();

    let disk = { totalGB: null, usedGB: null, usagePercent: null };
    try {
        const stats = await fs.promises.statfs(__dirname);
        const totalBytes = stats.blocks * stats.bsize;
        const freeBytes = stats.bfree * stats.bsize;
        const usedBytes = totalBytes - freeBytes;
        disk = {
            totalGB: (totalBytes / 1024 / 1024 / 1024).toFixed(1),
            usedGB: (usedBytes / 1024 / 1024 / 1024).toFixed(1),
            usagePercent: ((usedBytes / totalBytes) * 100).toFixed(1)
        };
    } catch (error) {
        // Não foi possível ler informações de disco
    }

    res.json({
        cpuModel: cpus[0] ? cpus[0].model : 'Desconhecido',
        cpuCores: cpus.length,
        cpuUsagePercent: cpuUsagePercent.toFixed(1),
        totalMemMB: Math.round(totalMem / 1024 / 1024),
        usedMemMB: Math.round(usedMem / 1024 / 1024),
        memUsagePercent: ((usedMem / totalMem) * 100).toFixed(1),
        temperature,
        disk
    });
});

app.get('/api/plugins', (req, res) => {
    const pluginsDir = path.join(serverDir, 'plugins');

    if (!fs.existsSync(pluginsDir)) {
        return res.json([]);
    }

    const plugins = fs.readdirSync(pluginsDir)
        .filter(name => name.endsWith('.jar'))
        .map(name => {
            const stats = fs.statSync(path.join(pluginsDir, name));
            return {
                name: name.replace(/\.jar$/, ''),
                sizeMB: (stats.size / 1024 / 1024).toFixed(2)
            };
        });

    res.json(plugins);
});

app.post('/api/plugins/upload', upload.single('pluginJar'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const cleanupUpload = () => {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    };

    const originalName = req.file.originalname;
    if (!originalName.toLowerCase().endsWith('.jar')) {
        cleanupUpload();
        return res.status(400).json({ error: 'O arquivo precisa ser um .jar' });
    }

    try {
        const pluginsDir = path.join(serverDir, 'plugins');
        if (!fs.existsSync(pluginsDir)) {
            fs.mkdirSync(pluginsDir, { recursive: true });
        }

        const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9_.\-]/g, '_');
        const targetPath = path.join(pluginsDir, safeName);
        fs.renameSync(req.file.path, targetPath);

        res.json({ success: true, message: `Mod "${safeName}" enviado com sucesso! Reinicie o servidor para carregá-lo.` });
    } catch (error) {
        cleanupUpload();
        res.status(500).json({ error: 'Erro ao salvar o mod: ' + error.message });
    }
});

app.delete('/api/plugins/:name', (req, res) => {
    const pluginsDir = path.join(serverDir, 'plugins');
    const safeName = path.basename(req.params.name);
    const jarPath = path.join(pluginsDir, safeName.endsWith('.jar') ? safeName : `${safeName}.jar`);

    if (!jarPath.startsWith(pluginsDir)) {
        return res.status(400).json({ error: 'Nome de arquivo inválido' });
    }

    if (!fs.existsSync(jarPath)) {
        return res.status(404).json({ error: 'Mod não encontrado' });
    }

    try {
        fs.unlinkSync(jarPath);
        res.json({ success: true, message: 'Mod removido com sucesso! Reinicie o servidor para aplicar.' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao remover o mod: ' + error.message });
    }
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

// Remove as pastas do mundo (overworld/nether/end) com base no level-name atual
function deleteWorldFolders() {
    const props = readServerProperties();
    const levelName = props['level-name'] || 'world';
    ['', '_nether', '_the_end'].forEach(suffix => {
        const dir = path.join(serverDir, levelName + suffix);
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
}

async function isServerRunning() {
    const props = readServerProperties();
    const javaPort = parseInt(props['server-port'] || '25565', 10);
    return isPortOpen(javaPort);
}

app.post('/api/world/reset', async (req, res) => {
    try {
        const wasRunning = await isServerRunning();
        if (wasRunning) {
            await stopMinecraftServer();
        }

        deleteWorldFolders();

        if (wasRunning) {
            startMinecraftServer().catch(err => console.error('Erro ao reiniciar servidor:', err.message));
        }

        res.json({
            success: true,
            message: wasRunning
                ? 'Mundo resetado! O servidor foi parado e está reiniciando automaticamente...'
                : 'Mundo resetado com sucesso'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/world/difficulty', (req, res) => {
    const { difficulty } = req.body;
    const validDifficulties = ['peaceful', 'easy', 'normal', 'hard'];

    if (!validDifficulties.includes(difficulty)) {
        return res.status(400).json({ error: 'Dificuldade inválida' });
    }

    const props = readServerProperties();
    props['difficulty'] = difficulty;
    writeServerProperties(props);

    const rconEnabled = props['enable-rcon'] === 'true';
    const rconPort = props['rcon.port'] || '25575';
    const rconPassword = props['rcon.password'] || '';

    if (rconEnabled && rconPassword) {
        sendRconCommand(rconPort, rconPassword, `difficulty ${difficulty}`)
            .then(() => res.json({ success: true, difficulty, message: 'Dificuldade alterada' }))
            .catch(error => res.json({
                success: true,
                difficulty,
                warning: 'Configuração salva, mas não foi possível aplicar ao servidor rodando: ' + error.message
            }));
    } else {
        res.json({
            success: true,
            difficulty,
            message: 'Dificuldade salva. Reinicie o servidor para aplicar.'
        });
    }
});

app.post('/api/world/create', express.json(), async (req, res) => {
    const { name, difficulty, seed } = req.body;
    const validDifficulties = ['peaceful', 'easy', 'normal', 'hard'];
    const chosenDifficulty = validDifficulties.includes(difficulty) ? difficulty : 'easy';
    const levelName = (name && name.trim()) ? name.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'world';

    try {
        const wasRunning = await isServerRunning();
        if (wasRunning) {
            await stopMinecraftServer();
        }

        deleteWorldFolders();

        const props = readServerProperties();
        props['level-name'] = levelName;
        props['difficulty'] = chosenDifficulty;
        props['level-seed'] = seed ? seed.trim() : '';
        writeServerProperties(props);

        if (wasRunning) {
            startMinecraftServer().catch(err => console.error('Erro ao reiniciar servidor:', err.message));
        }

        res.json({
            success: true,
            message: wasRunning
                ? 'Novo mundo configurado! O servidor foi parado e está reiniciando automaticamente para gerá-lo...'
                : 'Configuração salva! Inicie o servidor para gerar o novo mundo.'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function extractZip(zipPath, destDir) {
    return new Promise((resolve, reject) => {
        const proc = spawn('unzip', ['-o', zipPath, '-d', destDir]);
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`unzip saiu com código ${code}`));
        });
    });
}

app.post('/api/world/upload', upload.single('worldZip'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const cleanupUpload = () => {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    };

    const extractDir = path.join(serverDir, '.tmp-extract');
    let wasRunning = false;

    try {
        wasRunning = await isServerRunning();
        if (wasRunning) {
            await stopMinecraftServer();
        }

        if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
        }
        fs.mkdirSync(extractDir, { recursive: true });

        await extractZip(req.file.path, extractDir);
        cleanupUpload();

        // O .zip pode conter a pasta do mundo direto na raiz, ou dentro de uma única pasta
        let sourceDir = extractDir;
        if (!fs.existsSync(path.join(extractDir, 'level.dat'))) {
            const entries = fs.readdirSync(extractDir);
            if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
                sourceDir = path.join(extractDir, entries[0]);
            }
        }

        if (!fs.existsSync(path.join(sourceDir, 'level.dat'))) {
            fs.rmSync(extractDir, { recursive: true, force: true });
            if (wasRunning) {
                startMinecraftServer().catch(err => console.error('Erro ao reiniciar servidor:', err.message));
            }
            return res.status(400).json({ error: 'O arquivo .zip não parece ser um mundo válido (level.dat não encontrado)' });
        }

        const props = readServerProperties();
        const levelName = props['level-name'] || 'world';
        const targetDir = path.join(serverDir, levelName);

        deleteWorldFolders();
        fs.renameSync(sourceDir, targetDir);
        if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
        }

        if (wasRunning) {
            startMinecraftServer().catch(err => console.error('Erro ao reiniciar servidor:', err.message));
        }

        res.json({
            success: true,
            message: wasRunning
                ? 'Mundo enviado! O servidor foi parado e está reiniciando automaticamente para carregá-lo...'
                : 'Mundo enviado com sucesso! Reinicie o servidor para carregá-lo.'
        });
    } catch (error) {
        cleanupUpload();
        if (wasRunning) {
            startMinecraftServer().catch(err => console.error('Erro ao reiniciar servidor:', err.message));
        }
        res.status(500).json({ error: 'Erro ao processar o mundo: ' + error.message });
    }
});

app.post('/api/server/start', async (req, res) => {
    try {
        await startMinecraftServer();
        res.json({ success: true, message: 'Servidor iniciado com sucesso!' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/server/stop', async (req, res) => {
    try {
        await stopMinecraftServer();
        res.json({ success: true, message: 'Servidor parado com sucesso!' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/server/restart', async (req, res) => {
    try {
        await restartMinecraftServer();
        res.json({ success: true, message: 'Servidor reiniciado com sucesso!' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
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

// Função para obter o IP local (da placa de rede - só é o IP "real" quando NÃO está atrás de NAT)
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

// Em provedores de nuvem (AWS, etc) a placa de rede só enxerga o IP privado (172.31.x.x),
// então buscamos o IP público real via metadata service da AWS (IMDSv2). Fica em cache
// porque não muda durante a execução da instância, e falha silenciosamente fora da AWS.
let cachedPublicIp = null;
let publicIpFetchedAt = 0;

async function getPublicIp() {
    const now = Date.now();
    if (cachedPublicIp && (now - publicIpFetchedAt) < 5 * 60 * 1000) {
        return cachedPublicIp;
    }
    try {
        const http = require('http');
        const tokenReq = await new Promise((resolve, reject) => {
            const req = http.request({
                host: '169.254.169.254',
                path: '/latest/api/token',
                method: 'PUT',
                headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
                timeout: 1000
            }, (res) => {
                let data = '';
                res.on('data', (c) => data += c);
                res.on('end', () => resolve(data));
            });
            req.on('error', reject);
            req.on('timeout', () => req.destroy(new Error('timeout')));
            req.end();
        });

        const publicIp = await new Promise((resolve, reject) => {
            const req = http.request({
                host: '169.254.169.254',
                path: '/latest/meta-data/public-ipv4',
                method: 'GET',
                headers: { 'X-aws-ec2-metadata-token': tokenReq },
                timeout: 1000
            }, (res) => {
                let data = '';
                res.on('data', (c) => data += c);
                res.on('end', () => resolve(data.trim()));
            });
            req.on('error', reject);
            req.on('timeout', () => req.destroy(new Error('timeout')));
            req.end();
        });

        if (publicIp && /^\d+\.\d+\.\d+\.\d+$/.test(publicIp)) {
            cachedPublicIp = publicIp;
            publicIpFetchedAt = now;
            return publicIp;
        }
    } catch (err) {
        // Não é uma instância AWS (ou sem IP público) - segue com o IP local mesmo
    }
    return null;
}

server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`🌐 Interface web rodando em:`);
    console.log(`   Local: http://localhost:${PORT}`);
    console.log(`   Rede:  http://${localIP}:${PORT}`);
    console.log(`📊 Acesse no navegador para gerenciar o servidor`);
});
