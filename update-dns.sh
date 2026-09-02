#!/bin/bash
# Aponta o domínio do servidor para o IP público atual da instância.
#
# A AWS devolve o IP público para o pool toda vez que a instância é desligada e
# sorteia outro no próximo boot. Como isso roda no boot (via systemd), o
# endereço de conexão continua o mesmo para quem joga, mesmo com o IP mudando.
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN não definido (crie o .env)}"

ZONE_ID="${CLOUDFLARE_ZONE_ID:-852831f0979becd84080b11e33697bb6}"
RECORD_NAME="${SERVER_DOMAIN:-play.n91.com.br}"
API="https://api.cloudflare.com/client/v4"

# IP público atual, pelo metadata service da própria AWS (IMDSv2)
IMDS_TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
IP=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
    "http://169.254.169.254/latest/meta-data/public-ipv4")

if ! [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Não consegui descobrir o IP público (resposta: '$IP')"
    exit 1
fi

RECORD_ID=$(curl -sf "$API/zones/$ZONE_ID/dns_records?type=A&name=$RECORD_NAME" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')")

# proxied=false é obrigatório: o proxy da Cloudflare só entende HTTP(S), não o
# protocolo do Minecraft. Com o proxy ligado ninguém consegue conectar no jogo.
PAYLOAD=$(python3 -c "
import json,sys
print(json.dumps({'type':'A','name':'$RECORD_NAME','content':'$IP','ttl':60,'proxied':False}))
")

if [ -n "$RECORD_ID" ]; then
    RESULT=$(curl -sf -X PUT "$API/zones/$ZONE_ID/dns_records/$RECORD_ID" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" --data "$PAYLOAD")
else
    RESULT=$(curl -sf -X POST "$API/zones/$ZONE_ID/dns_records" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" --data "$PAYLOAD")
fi

if echo "$RESULT" | python3 -c "import json,sys; sys.exit(0 if json.load(sys.stdin)['success'] else 1)"; then
    echo "✅ $RECORD_NAME -> $IP"
else
    echo "❌ Falha ao atualizar o DNS:"
    echo "$RESULT"
    exit 1
fi
