#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "❌ Arquivo .env não encontrado. Crie um com PLAYIT_SECRET=..."
    exit 1
fi

set -a
source .env
set +a

if [ -z "$PLAYIT_SECRET" ]; then
    echo "❌ PLAYIT_SECRET não definido no .env"
    exit 1
fi

mkdir -p /tmp/playit-runtime

echo "🎮 Iniciando playit.gg (Java + Bedrock sem abrir porta no roteador)..."
exec ./.playit/playit --secret "$PLAYIT_SECRET" --socket-path /tmp/playit-runtime/playit.sock
