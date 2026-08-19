# Setup dos mundos e portais (Multiverse)

Jars já colocados em `server/plugins/`: `multiverse-core-5.7.3.jar` e `multiverse-portals-5.2.3.jar`.

Inicie o servidor uma vez para os plugins gerarem as pastas de config, depois rode estes comandos no console (ou in-game como OP):

## 1. Criar os mundos

```
mv create mundo_aberto normal
mv create mineracao normal
```

- `mundo_aberto`: mundo principal de exploração (pode ser o próprio `world` já existente, se preferir — nesse caso pule a criação e use `world` como destino do portal).
- `mineracao`: mundo que será apagado e recriado a cada 7 dias pelo `reset-mining-world.js` (cron já configurado).

## 2. Vila medieval (spawn)

Quando você tiver o arquivo `.schem` da vila:
1. Coloque-o em `server/plugins/WorldEdit/schematics/vila_medieval.schem`.
2. No local onde os jogadores nascem (spawn do mundo principal), rode:
   ```
   //schem load vila_medieval
   //paste
   ```
3. Ajuste `spawn-x`, `spawn-y`, `spawn-z` em `server.properties` (ou `mv setspawn`) para o ponto de nascimento dentro da vila.

## 3. Criar os dois portais

Dentro da vila, construa dois portais de obsidiana (ou o frame que preferir) em dois pontos diferentes. Para cada um:

```
mvp create PortalMundoAberto
```
Depois, selecione a região do portal com WorldEdit (`//pos1` e `//pos2` nos dois cantos do frame) e rode:
```
mvp create PortalMundoAberto
```
(o comando usa a seleção do WorldEdit ativa)

Defina o destino:
```
mvp modify -d mundo_aberto PortalMundoAberto
mvp modify -d mineracao PortalMineracao
```

Coloque uma placa/sign na frente de cada portal escrita "MUNDO ABERTO" e "MINERAÇÃO" (apenas texto, cosmético).

## 4. Reset automático do mundo de mineração

Já configurado via cron (todo domingo 04:00):
```
0 4 * * 0 node /home/samuel/Documentos/server-mine/reset-mining-world.js
```
Ele avisa os jogadores, teleporta quem estiver lá para fora, descarrega o mundo, apaga a pasta e recria com novo seed.

Para rodar manualmente a qualquer momento:
```
npm run reset-mining-world
```

Requisitos: servidor rodando com RCON habilitado (já está, em `server.properties`).
