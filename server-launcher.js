const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const serverDir = path.join(projectRoot, 'server');

const MIN_MEMORY = '2G';
const MAX_MEMORY = '4G';
const JAVA_OPTS = '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1';

// Encontra o jar do Paper na raiz do projeto (evita ter que atualizar o nome em vários lugares a cada update)
function findServerJar() {
    const jar = fs.readdirSync(projectRoot).find(f => f.startsWith('paper-') && f.endsWith('.jar'));
    if (!jar) {
        throw new Error('Nenhum arquivo paper-*.jar encontrado na raiz do projeto');
    }
    return jar;
}

function getServerJarPath() {
    return path.join(projectRoot, findServerJar());
}

function ensureServerReady() {
    if (!fs.existsSync(serverDir)) {
        fs.mkdirSync(serverDir, { recursive: true });
    }

    const eulaFile = path.join(serverDir, 'eula.txt');
    if (!fs.existsSync(eulaFile)) {
        fs.writeFileSync(eulaFile, 'eula=true\n');
    }
}

function getJavaArgs() {
    return [
        `-Xms${MIN_MEMORY}`,
        `-Xmx${MAX_MEMORY}`,
        ...JAVA_OPTS.split(' ').filter(opt => opt.length > 0),
        '-jar',
        getServerJarPath(),
        'nogui'
    ];
}

module.exports = {
    projectRoot,
    serverDir,
    MIN_MEMORY,
    MAX_MEMORY,
    findServerJar,
    getServerJarPath,
    ensureServerReady,
    getJavaArgs
};
