#!/bin/bash
set -e

echo "===================================================="
echo " Setup do Minecraft Server (Java + Bedrock)"
echo "===================================================="
echo ""

echo "[1/4] Verificando/instalando Java 25 (exigido pelo Paper 26.x)..."
JAVA_MAJOR=0
if command -v java >/dev/null 2>&1; then
    JAVA_MAJOR=$(java -version 2>&1 | head -n 1 | grep -oP '"\K[0-9]+' || echo 0)
fi

if [ "$JAVA_MAJOR" -lt 25 ]; then
    echo "Java atual (versão $JAVA_MAJOR) é antigo demais para o Paper 26.x. Instalando Java 25..."
    sudo apt update

    if sudo apt install -y openjdk-25-jre-headless 2>/dev/null; then
        JAVA_BIN=$(update-alternatives --list java | grep 'java-25' | head -n 1)
    else
        echo "openjdk-25 não disponível nos repositórios padrão (comum em Ubuntu mais antigo)."
        echo "Instalando via repositório da Adoptium/Eclipse Temurin..."
        sudo apt install -y wget gnupg
        wget -qO- https://packages.adoptium.net/artifactory/api/gpg/key/public | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/adoptium.gpg
        echo "deb https://packages.adoptium.net/artifactory/deb $(awk -F= '/^VERSION_CODENAME/{print $2}' /etc/os-release) main" | sudo tee /etc/apt/sources.list.d/adoptium.list
        sudo apt update
        sudo apt install -y temurin-25-jre
        JAVA_BIN=$(update-alternatives --list java | grep -i 'temurin-25\|java-25' | head -n 1)
    fi

    if [ -n "$JAVA_BIN" ]; then
        sudo update-alternatives --set java "$JAVA_BIN"
    fi
else
    echo "Java já está na versão correta: $(java -version 2>&1 | head -n 1)"
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
