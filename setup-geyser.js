const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

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

function makeRequest(urlString) {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(urlString);
            const protocol = url.protocol === 'https:' ? https : http;
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };
            
            const req = protocol.request(options, (response) => {
                let data = '';
                
                // Seguir redirects
                if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                    const location = response.headers.location;
                    if (location) {
                        // Resolver URL relativa
                        const redirectUrl = new URL(location, urlString).href;
                        return makeRequest(redirectUrl).then(resolve).catch(reject);
                    }
                    return reject(new Error('Redirect sem localização'));
                }
                
                if (response.statusCode !== 200) {
                    return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                }
                
                response.on('data', (chunk) => {
                    data += chunk;
                });
                
                response.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(data);
                    }
                });
            });
            
            req.on('error', reject);
            req.setTimeout(15000, () => {
                req.destroy();
                reject(new Error('Timeout na requisição'));
            });
            
            req.end();
        } catch (err) {
            reject(new Error(`URL inválida: ${err.message}`));
        }
    });
}

function downloadFile(urlString, dest) {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(urlString);
            const protocol = url.protocol === 'https:' ? https : http;
            const file = fs.createWriteStream(dest);
            
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };
            
            const req = protocol.request(options, (response) => {
                // Seguir redirects
                if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                    file.close();
                    if (fs.existsSync(dest)) {
                        fs.unlinkSync(dest);
                    }
                    const location = response.headers.location;
                    if (location) {
                        const redirectUrl = new URL(location, urlString).href;
                        return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
                    }
                    return reject(new Error('Redirect sem localização'));
                }
                
                if (response.statusCode !== 200) {
                    file.close();
                    if (fs.existsSync(dest)) {
                        fs.unlinkSync(dest);
                    }
                    return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
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
                    console.log('');
                    resolve();
                });
            });
            
            req.on('error', (err) => {
                file.close();
                if (fs.existsSync(dest)) {
                    fs.unlinkSync(dest);
                }
                reject(err);
            });
            
            req.setTimeout(120000, () => {
                req.destroy();
                file.close();
                if (fs.existsSync(dest)) {
                    fs.unlinkSync(dest);
                }
                reject(new Error('Timeout no download'));
            });
            
            req.end();
        } catch (err) {
            reject(new Error(`URL inválida: ${err.message}`));
        }
    });
}

async function getLatestGeyserUrl() {
    const apiBase = 'https://download.geysermc.org/v2/projects/geyser';
    
    try {
        console.log('🔍 Buscando versão mais recente do GeyserMC...');
        
        // Buscar versões disponíveis
        const versionsUrl = `${apiBase}/versions`;
        const versions = await makeRequest(versionsUrl);
        
        if (!versions || !Array.isArray(versions) || versions.length === 0) {
            throw new Error('Não foi possível obter versões do GeyserMC');
        }
        
        // Pegar a versão mais recente (primeira da lista)
        const latestVersion = versions[0];
        console.log(`✅ Versão encontrada: ${latestVersion}`);
        
        // Buscar builds da versão
        const buildsUrl = `${apiBase}/versions/${latestVersion}/builds`;
        const builds = await makeRequest(buildsUrl);
        
        if (!builds || !Array.isArray(builds) || builds.length === 0) {
            throw new Error('Não foi possível obter builds do GeyserMC');
        }
        
        // Pegar o build mais recente (último da lista)
        const latestBuild = builds[builds.length - 1];
        const buildNumber = latestBuild.build;
        
        console.log(`✅ Build encontrado: ${buildNumber}`);
        
        // URL final para download do Spigot
        return `${apiBase}/versions/${latestVersion}/builds/${buildNumber}/downloads/spigot`;
    } catch (error) {
        console.error('⚠️  Erro ao buscar versão via API:', error.message);
        console.error('💡 Usando URL alternativa direta...');
        
        // Fallback: usar URL direta do GitHub releases (mais confiável)
        // Versão estável conhecida: 2.3.1
        return 'https://github.com/GeyserMC/Geyser/releases/download/master/Geyser-Spigot.jar';
    }
}

(async () => {
    try {
        console.log('📥 Preparando download do GeyserMC...\n');
        
        let downloadUrl = await getLatestGeyserUrl();
        
        // Se a URL da API falhou, tentar URL direta da API v2
        if (downloadUrl.includes('github.com')) {
            console.log('💡 Tentando URL alternativa da API oficial...');
            // URL direta da API v2 com versão específica
            downloadUrl = 'https://download.geysermc.org/v2/projects/geyser/versions/2.3.1/builds/243/downloads/spigot';
        }
        
        console.log(`\n📥 Baixando GeyserMC...`);
        console.log(`🔗 URL: ${downloadUrl}\n`);
        
        await downloadFile(downloadUrl, geyserFile);
        
        console.log('✅ GeyserMC instalado com sucesso!');
        console.log(`📁 Localização: ${geyserFile}`);
        console.log('\n💡 Agora você pode executar "npm run dev" para iniciar o servidor!');
        console.log('💡 Jogadores Bedrock podem se conectar na porta 19132');
    } catch (err) {
        console.error('\n❌ Erro ao baixar GeyserMC:', err.message);
        console.error('\n💡 Alternativas:');
        console.error('   1. Tente novamente: npm run setup');
        console.error('   2. Baixe manualmente de: https://geysermc.org/download');
        console.error('   3. Baixe direto do GitHub: https://github.com/GeyserMC/Geyser/releases');
        console.error('   4. Coloque o arquivo Geyser-Spigot.jar em: server/plugins/');
        process.exit(1);
    }
})();
