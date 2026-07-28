#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "❌ Arquivo .env não encontrado. Crie um com CLOUDFLARE_TUNNEL_TOKEN=..."
    exit 1
fi

set -a
source .env
set +a

if [ -z "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
    echo "❌ CLOUDFLARE_TUNNEL_TOKEN não definido no .env"
    exit 1
fi

echo "🌐 Iniciando túnel Cloudflare (painel.n91.com.br -> localhost:3000)..."
exec cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN"
