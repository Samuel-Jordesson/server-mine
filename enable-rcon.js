const fs = require('fs');
const path = require('path');

const serverPropertiesPath = path.join(__dirname, 'server', 'server.properties');

if (!fs.existsSync(serverPropertiesPath)) {
    console.error('❌ server.properties não encontrado! Execute o servidor primeiro.');
    process.exit(1);
}

let content = fs.readFileSync(serverPropertiesPath, 'utf-8');
const lines = content.split('\n');
let modified = false;

// Verificar e habilitar RCON
let rconEnabled = false;
let rconPort = '25575';
let rconPassword = '';

const newLines = lines.map(line => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('enable-rcon=')) {
        if (trimmed !== 'enable-rcon=true') {
            modified = true;
            return 'enable-rcon=true';
        }
        rconEnabled = true;
        return line;
    }
    
    if (trimmed.startsWith('rcon.port=')) {
        const port = trimmed.split('=')[1];
        if (port) {
            rconPort = port;
        } else {
            modified = true;
            return 'rcon.port=25575';
        }
        return line;
    }
    
    if (trimmed.startsWith('rcon.password=')) {
        const pass = trimmed.split('=')[1];
        if (pass && pass.trim()) {
            rconPassword = pass;
        } else {
            // Gerar senha aleatória
            const randomPassword = Math.random().toString(36).slice(-12);
            modified = true;
            rconPassword = randomPassword;
            return `rcon.password=${randomPassword}`;
        }
        return line;
    }
    
    return line;
});

// Se RCON não estava habilitado, adicionar as linhas
if (!rconEnabled) {
    newLines.push('');
    newLines.push('# RCON Configuration (para interface web)');
    newLines.push('enable-rcon=true');
    if (!rconPort || rconPort === '25575') {
        newLines.push('rcon.port=25575');
    }
    if (!rconPassword) {
        const randomPassword = Math.random().toString(36).slice(-12);
        newLines.push(`rcon.password=${randomPassword}`);
        rconPassword = randomPassword;
    }
    modified = true;
}

if (modified) {
    fs.writeFileSync(serverPropertiesPath, newLines.join('\n'), 'utf-8');
    console.log('✅ RCON habilitado com sucesso!');
    console.log(`📝 Porta: ${rconPort}`);
    console.log(`🔑 Senha: ${rconPassword}`);
    console.log('\n💡 Reinicie o servidor para aplicar as mudanças!');
    console.log('💡 Agora você pode usar comandos pela interface web!');
} else {
    console.log('✅ RCON já está configurado!');
    if (rconPassword) {
        console.log(`🔑 Senha atual: ${rconPassword}`);
    }
}
