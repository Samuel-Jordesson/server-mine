const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const launcher = require('./server-launcher');

const serverDir = launcher.serverDir;

launcher.ensureServerReady();

// Verificar se o GeyserMC está instalado
const pluginsDir = path.join(serverDir, 'plugins');
const geyserFile = path.join(pluginsDir, 'Geyser-Spigot.jar');
if (!fs.existsSync(geyserFile)) {
    console.log('⚠️  GeyserMC não encontrado. Execute "npm run setup" primeiro para instalar.');
} else {
    console.log('✅ GeyserMC encontrado!');
}

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

function readServerPort() {
    const propsPath = path.join(serverDir, 'server.properties');
    if (fs.existsSync(propsPath)) {
        const content = fs.readFileSync(propsPath, 'utf-8');
        const match = content.match(/^server-port=(\d+)/m);
        if (match) return match[1];
    }
    return '25565';
}

function readGeyserPort() {
    const configPath = path.join(pluginsDir, 'Geyser-Spigot', 'config.yml');
    if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const match = content.match(/^\s*port:\s*(\d+)/m);
        if (match) return match[1];
    }
    return '19132';
}

const localIP = getLocalIP();
const javaPort = readServerPort();
const bedrockPort = readGeyserPort();

let serverJarPath;
try {
    serverJarPath = launcher.getServerJarPath();
} catch (err) {
    console.error(`❌ Erro: ${err.message}`);
    process.exit(1);
}

console.log('🚀 Iniciando servidor Minecraft...');
console.log(`📦 JAR: ${serverJarPath}`);
console.log(`💾 Memória: ${launcher.MIN_MEMORY} - ${launcher.MAX_MEMORY}`);
console.log('');
console.log('🌐 Endereços de conexão:');
console.log(`   Java Edition (TCP):    ${localIP}:${javaPort}   (local: localhost:${javaPort})`);
console.log(`   Bedrock Edition (UDP): ${localIP}:${bedrockPort}   (local: localhost:${bedrockPort})`);
console.log(`   Painel Web:            http://${localIP}:3000  (inicie com "npm run web")`);
console.log('');

// Iniciar servidor - sem shell para evitar problemas com espaços
const server = spawn('java', launcher.getJavaArgs(), {
    stdio: 'inherit',
    shell: false,
    cwd: serverDir
});

// Tratamento de erros
server.on('error', (err) => {
    console.error('❌ Erro ao iniciar servidor:', err.message);
    if (err.code === 'ENOENT') {
        console.error('💡 Certifique-se de que o Java está instalado e no PATH!');
    }
    process.exit(1);
});

// Tratamento de saída
server.on('exit', (code) => {
    if (code !== 0) {
        console.error(`❌ Servidor encerrado com código ${code}`);
    } else {
        console.log('✅ Servidor encerrado normalmente');
    }
    process.exit(code);
});

// Capturar Ctrl+C
process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando servidor...');
    server.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Encerrando servidor...');
    server.kill('SIGTERM');
});
