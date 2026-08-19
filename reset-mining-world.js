// Reseta o mundo "mineracao" a cada execução (chamado via cron a cada 7 dias).
// Requer RCON habilitado (server.properties) e o servidor rodando.
const fs = require('fs');
const path = require('path');
const { sendRconCommand } = require('./rcon-client');

const WORLD_NAME = 'mineracao';
const SERVER_DIR = path.join(__dirname, 'server');
const RCON_HOST = '127.0.0.1';

function readServerProperties() {
    const content = fs.readFileSync(path.join(SERVER_DIR, 'server.properties'), 'utf-8');
    const props = {};
    for (const line of content.split('\n')) {
        const [key, ...rest] = line.split('=');
        if (key && rest.length) props[key.trim()] = rest.join('=').trim();
    }
    return props;
}

async function rcon(command) {
    const props = readServerProperties();
    const port = parseInt(props['rcon.port'] || '25575', 10);
    const password = props['rcon.password'];
    if (!password) throw new Error('rcon.password não configurado em server.properties');
    return sendRconCommand(RCON_HOST, port, password, command);
}

async function main() {
    console.log(`[reset-mining-world] Iniciando reset de "${WORLD_NAME}"...`);

    try {
        await rcon(`say [Sistema] O mundo de mineração será resetado em 30 segundos!`);
        await new Promise((r) => setTimeout(r, 30000));

        console.log('Removendo jogadores do mundo antes do reset...');
        await rcon(`mvtp @a[world=${WORLD_NAME}] world`); // manda todos de volta ao mundo principal

        console.log('Descarregando mundo via Multiverse...');
        await rcon(`mv unload ${WORLD_NAME}`);

        const worldPath = path.join(SERVER_DIR, WORLD_NAME);
        if (fs.existsSync(worldPath)) {
            console.log(`Apagando pasta ${worldPath}...`);
            fs.rmSync(worldPath, { recursive: true, force: true });
        }
        const worldPathNether = path.join(SERVER_DIR, `${WORLD_NAME}_nether`);
        if (fs.existsSync(worldPathNether)) fs.rmSync(worldPathNether, { recursive: true, force: true });

        console.log('Recriando mundo com novo seed via Multiverse...');
        const newSeed = Math.floor(Math.random() * 1e9);
        await rcon(`mv create ${WORLD_NAME} normal -s ${newSeed}`);

        await rcon(`say [Sistema] O mundo de mineração foi resetado! Boa sorte, mineradores.`);
        console.log('[reset-mining-world] Concluído.');
    } catch (err) {
        console.error('[reset-mining-world] Erro:', err.message);
        process.exit(1);
    }
}

main();
