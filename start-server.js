const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configurações
const SERVER_JAR = 'paper-1.21.11-106.jar';
const MIN_MEMORY = '2G';
const MAX_MEMORY = '4G';
const JAVA_OPTS = '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1';

// Obter caminhos absolutos
const projectRoot = __dirname;
const serverJarPath = path.resolve(projectRoot, SERVER_JAR);

// Verificar se o JAR existe
if (!fs.existsSync(serverJarPath)) {
    console.error(`❌ Erro: Arquivo ${serverJarPath} não encontrado!`);
    process.exit(1);
}

// Criar pasta do servidor se não existir
const serverDir = path.resolve(projectRoot, 'server');
if (!fs.existsSync(serverDir)) {
    fs.mkdirSync(serverDir, { recursive: true });
}

// Verificar se é primeira execução
const eulaFile = path.join(serverDir, 'eula.txt');
if (!fs.existsSync(eulaFile)) {
    console.log('📝 Criando arquivo eula.txt...');
    fs.writeFileSync(eulaFile, 'eula=true\n');
    console.log('✅ EULA aceita automaticamente!');
}

// Verificar se o GeyserMC está instalado
const pluginsDir = path.join(serverDir, 'plugins');
const geyserFile = path.join(pluginsDir, 'Geyser-Spigot.jar');
if (!fs.existsSync(geyserFile)) {
    console.log('⚠️  GeyserMC não encontrado. Execute "npm run setup" primeiro para instalar.');
} else {
    console.log('✅ GeyserMC encontrado!');
}

console.log('🚀 Iniciando servidor Minecraft...');
console.log(`📦 JAR: ${serverJarPath}`);
console.log(`💾 Memória: ${MIN_MEMORY} - ${MAX_MEMORY}`);
console.log('');

// Comando Java - usar caminho absoluto do JAR
const javaArgs = [
    `-Xms${MIN_MEMORY}`,
    `-Xmx${MAX_MEMORY}`,
    ...JAVA_OPTS.split(' ').filter(opt => opt.length > 0),
    '-jar',
    serverJarPath,
    'nogui'
];

// Iniciar servidor - sem shell para evitar problemas com espaços
const server = spawn('java', javaArgs, {
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
