// Cliente RCON minimalista (protocolo Source RCON), sem dependências externas.
const net = require('net');

function sendRconCommand(host, port, password, command, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port }, () => {
            sendPacket(socket, 1, 3, password); // auth
        });

        let authenticated = false;
        let buffer = Buffer.alloc(0);

        const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error('RCON timeout'));
        }, timeoutMs);

        socket.on('data', (data) => {
            buffer = Buffer.concat([buffer, data]);
            while (buffer.length >= 4) {
                const size = buffer.readInt32LE(0);
                if (buffer.length < size + 4) break;
                const packet = buffer.subarray(0, size + 4);
                buffer = buffer.subarray(size + 4);

                const id = packet.readInt32LE(4);
                const type = packet.readInt32LE(8);
                const body = packet.toString('utf8', 12, packet.length - 2);

                if (type === 2) {
                    if (id === -1) {
                        clearTimeout(timer);
                        socket.destroy();
                        reject(new Error('RCON: senha incorreta'));
                        return;
                    }
                    authenticated = true;
                    sendPacket(socket, 2, 2, command);
                } else if (type === 0 && authenticated) {
                    clearTimeout(timer);
                    socket.end();
                    resolve(body);
                }
            }
        });

        socket.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

function sendPacket(socket, id, type, body) {
    const bodyBuf = Buffer.from(body + '\0\0', 'utf8');
    const size = 4 + 4 + bodyBuf.length;
    const buf = Buffer.alloc(4 + size);
    buf.writeInt32LE(size, 0);
    buf.writeInt32LE(id, 4);
    buf.writeInt32LE(type, 8);
    bodyBuf.copy(buf, 12);
    socket.write(buf);
}

module.exports = { sendRconCommand };
