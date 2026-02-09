const https = require('https');
const fs = require('fs');
const path = require('path');

// URL direta do GeyserMC Spigot (versão estável)
// Esta URL é atualizada manualmente quando necessário
const GEYSER_URL = 'https://download.geysermc.org/v2/projects/geyser/versions/2.3.1/builds/243/downloads/spigot';

const serverDir = path.join(__dirname, 'server');
const pluginsDir = path.join(serverDir, 'plugins');
const geyserFile = path.join(pluginsDir, 'Geyser-Spigot.jar');

// Criar estrutura de pastas
if (!fs.existsSync(serverDir)) {
    fs.mkdirSync(serverDir, { recursive: true });
}
if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
}

console.log('📥 Baixando GeyserMC...');
console.log(`🔗 URL: ${GEYSER_URL}\n`);

const file = fs.createWriteStream(geyserFile);

https.get(GEYSER_URL, (response) => {
    // Seguir redirects
    if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        file.close();
        fs.unlinkSync(geyserFile);
        console.log('🔄 Seguindo redirect...');
        return https.get(response.headers.location, (redirectResponse) => {
            handleResponse(redirectResponse);
        }).on('error', handleError);
    }
    
    handleResponse(response);
}).on('error', handleError);

function handleResponse(response) {
    if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(geyserFile);
        console.error(`\n❌ Erro HTTP ${response.statusCode}: ${response.statusMessage}`);
        console.error('\n💡 Tente baixar manualmente de: https://geysermc.org/download');
        process.exit(1);
    }
    
    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloadedSize = 0;
    
    response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize) {
            const percent = ((downloadedSize / totalSize) * 100).toFixed(2);
            process.stdout.write(`\r📥 Progresso: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB)`);
        } else {
            process.stdout.write(`\r📥 Baixando... (${(downloadedSize / 1024 / 1024).toFixed(2)} MB)`);
        }
    });
    
    response.pipe(file);
    
    file.on('finish', () => {
        file.close();
        console.log('\n✅ GeyserMC instalado com sucesso!');
        console.log(`📁 Localização: ${geyserFile}`);
        console.log('\n💡 Agora você pode executar "npm run dev" para iniciar o servidor!');
        console.log('💡 Jogadores Bedrock podem se conectar na porta 19132');
    });
}

function handleError(err) {
    file.close();
    if (fs.existsSync(geyserFile)) {
        fs.unlinkSync(geyserFile);
    }
    console.error('\n❌ Erro ao baixar GeyserMC:', err.message);
    console.error('\n💡 Alternativas:');
    console.error('   1. Tente novamente: npm run setup');
    console.error('   2. Baixe manualmente de: https://geysermc.org/download');
    console.error('   3. Baixe direto do GitHub: https://github.com/GeyserMC/Geyser/releases');
    console.error('   4. Coloque o arquivo Geyser-Spigot.jar em: server/plugins/');
    process.exit(1);
}
