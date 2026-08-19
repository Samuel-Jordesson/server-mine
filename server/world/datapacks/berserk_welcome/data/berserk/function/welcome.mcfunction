tag @s add berserk_welcomed

title @s title ["",{"text":"BERSERK","bold":true,"color":"dark_red"}]
title @s subtitle ["",{"text":"Bem-vindo(a) ao servidor!","italic":true,"color":"gold"}]
title @s times 10 70 20

playsound minecraft:entity.player.levelup master @s ~ ~ ~ 1 1

tellraw @s ["",{"text":"\n"},{"text":"=======================================","color":"dark_gray","strikethrough":true},{"text":"\n"},{"text":"  Bem-vindo(a) ao ","color":"gray"},{"text":"BERSERK","bold":true,"color":"dark_red"},{"text":"!","color":"gray"},{"text":"\n"},{"text":"  Prepare-se para viver aventuras epicas.","italic":true,"color":"gold"},{"text":"\n"},{"text":"=======================================","color":"dark_gray","strikethrough":true},{"text":"\n"}]

tellraw @a ["",{"text":"» ","color":"dark_gray"},{"selector":"@s"},{"text":" entrou no mundo de ","color":"gray"},{"text":"Berserk","color":"dark_red","bold":true},{"text":"!","color":"gray"}]
