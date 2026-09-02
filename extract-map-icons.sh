#!/bin/bash
# Extrai texturas do Minecraft para usar como ícones das estruturas no mapa.
#
# As texturas são do jogo (propriedade da Mojang), então NÃO vão para o git:
# public/map-icons/ está no .gitignore. Rode este script em uma máquina que
# tenha o Minecraft instalado e envie a pasta para o servidor com:
#
#   scp -i <chave> -r public/map-icons ubuntu@<servidor>:~/server-mine/public/
#
# Sem os PNGs o mapa continua funcionando: o painel cai para ícones desenhados
# em SVG automaticamente.
set -euo pipefail
cd "$(dirname "$0")"

VERSION="${1:-26.2}"
JAR="$HOME/.minecraft/versions/$VERSION/$VERSION.jar"
OUT="public/map-icons"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if [ ! -f "$JAR" ]; then
    echo "❌ Jar do Minecraft não encontrado: $JAR"
    echo "   Uso: $0 [versao]   (ex: $0 26.2)"
    exit 1
fi

if ! command -v convert >/dev/null; then
    echo "❌ ImageMagick não encontrado. Instale com: sudo apt install imagemagick"
    exit 1
fi

mkdir -p "$OUT"

# estrutura:textura_no_jar
MAPA="
village_plains:item/emerald
village_desert:item/emerald
village_savanna:item/emerald
village_snowy:item/emerald
village_taiga:item/emerald
desert_pyramid:block/chiseled_sandstone
jungle_pyramid:block/mossy_cobblestone
swamp_hut:block/cauldron_side
igloo:block/packed_ice
trail_ruins:item/brush
mansion:item/totem_of_undying
monument:item/prismarine_shard
ancient_city:item/echo_shard
stronghold:item/ender_eye
trial_chambers:item/trial_key
ruined_portal:block/obsidian
buried_treasure:item/heart_of_the_sea
shipwreck:item/oak_boat
shipwreck_beached:item/oak_boat
ocean_ruin_cold:block/stone_bricks
ocean_ruin_warm:block/sandstone
pillager_outpost:item/crossbow_standby
mineshaft:item/minecart
"

total=0
for linha in $MAPA; do
    nome="${linha%%:*}"
    textura="${linha##*:}"
    caminho="assets/minecraft/textures/$textura.png"

    if ! unzip -o -q -j "$JAR" "$caminho" -d "$TMP" 2>/dev/null; then
        echo "  ⚠ textura ausente: $textura (pulando $nome)"
        continue
    fi

    # Ampliamos 4x com vizinho mais próximo para manter os pixels quadrados
    # (o -filter point é o que evita o borrão da interpolação padrão).
    convert "$TMP/$(basename "$textura").png" -filter point -resize 400% -strip "$OUT/$nome.png"
    total=$((total + 1))
done

echo "✅ $total ícones gerados em $OUT/"
