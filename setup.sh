#!/bin/bash
set -e

echo "===================================================="
echo " Setup do Minecraft Server (Java + Bedrock)"
echo "===================================================="
echo ""

echo "[1/4] Verificando/instalando Java 21..."
if ! command -v java >/dev/null 2>&1; then
    sudo apt update
    sudo apt install -y openjdk-21-jre-headless
else
    echo "Java já está instalado: $(java -version 2>&1 | head -n 1)"
fi
echo ""

echo "[2/4] Instalando dependências do Node.js..."
npm install
echo ""

echo "[3/4] Baixando o plugin GeyserMC..."
node setup-geyser.js
echo ""

echo "[4/4] Habilitando RCON..."
if [ -f "server/server.properties" ]; then
    node enable-rcon.js
else
    echo "⚠️  server.properties ainda não existe (primeira execução do servidor)."
    echo "   Depois de rodar 'npm run dev' pela primeira vez, rode 'npm run enable-rcon'."
fi
echo ""

echo "===================================================="
echo "✅ Setup concluído!"
echo ""
echo "Para iniciar o servidor, rode:"
echo "   npm run dev"
echo ""
echo "Portas:"
echo "   Java Edition:    25565 (TCP)"
echo "   Bedrock Edition: 19132 (UDP)"
echo "   Painel Web:      3000  (TCP) - inicie com 'npm run web'"
echo "===================================================="
