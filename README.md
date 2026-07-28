# Minecraft Server (Java + Bedrock)

## Sobre o Projeto

Este é um sistema de gerenciamento de servidor Minecraft que roda tanto Java Edition quanto Bedrock Edition simultaneamente.

O projeto integra:

- Node.js → Responsável pelo gerenciamento e execução do servidor
- Java → Execução do servidor Minecraft
- Paper → Core otimizada do servidor Java
- Geyser → Permite que jogadores Bedrock entrem no servidor Java

O sistema mantém todos os componentes rodando juntos automaticamente.

---

## Portas utilizadas

| Serviço                       | Porta       | Protocolo |
|-------------------------------|-------------|-----------|
| Minecraft Java Edition        | 25565       | TCP       |
| Minecraft Bedrock Edition     | 19132       | UDP       |
| Painel Web (logs/controle)    | 3000        | TCP (HTTP)|
| RCON (controle remoto)        | 25575       | TCP       |

Se for hospedar fora da rede local, essas portas precisam estar liberadas no firewall/roteador (encaminhamento de porta), especialmente 25565 (TCP) e 19132 (UDP).

---

## Instalação (um único comando)

```bash
npm run setup
```

Esse comando faz tudo:

1. Instala o **Java 21** (via `apt`, vai pedir sua senha de `sudo`) — exigido pelo Paper 1.21.x
2. Instala as dependências do Node.js (`npm install`)
3. Baixa o plugin **GeyserMC** (ponte Java ↔ Bedrock) para `server/plugins`
4. Habilita o **RCON** (usado pelo painel web para enviar comandos) — se o servidor ainda nunca rodou, esse passo é pulado automaticamente e basta rodar `npm run enable-rcon` depois da primeira execução

No final, ele mostra na tela o comando para iniciar o servidor e as portas usadas.

---

## Executando o servidor

### Rodar em primeiro plano (simples, mas fecha se você fechar o terminal)

```bash
npm run dev
```

### Deixar rodando em segundo plano (recomendado)

Use `tmux` para manter o servidor rodando mesmo depois de fechar o terminal/SSH:

```bash
sudo apt install -y tmux   # se ainda não tiver
tmux new -s minecraft
npm run dev
```

Depois de iniciado, pressione `Ctrl+B` e depois `D` para "desanexar" a sessão — o servidor continua rodando em segundo plano.

Para voltar a ver o console mais tarde:

```bash
tmux attach -t minecraft
```

Para encerrar o servidor: volte com `tmux attach`, use `Ctrl+C` dentro do console do Minecraft, ou digite `stop`.

---

## Painel Web

O `npm run dev` já sobe o servidor Minecraft **e** o painel web juntos (lado a lado no mesmo terminal, com prefixo `SERVER`/`WEB` colorido em cada linha de log).

Se quiser rodar só o painel separadamente por algum motivo, ainda dá:

```bash
npm run web
```

Depois acesse pelo navegador:

- Local: `http://localhost:3000`
- Na rede: `http://<IP-da-maquina>:3000`

O painel permite ver logs em tempo real e alterar o modo de jogo (Survival/Creative).

---

## Como conectar

- **Java Edition**: `<IP-do-servidor>:25565`
- **Bedrock Edition** (Windows, celular, console): `<IP-do-servidor>` na porta `19132`

---

## Como Funciona

O servidor utiliza Paper como base.

O Geyser faz a ponte entre Java e Bedrock.

O Node.js é responsável por:

- Iniciar o servidor
- Definir IP e porta
- Gerenciar logs
- Controlar modo de jogo (Sobrevivência / Criativo)
- Executar o servidor no IP da máquina hospedada

---

## Funcionalidades Atuais

- Servidor Java + Bedrock unificados
- Execução via Node.js
- Exibição de logs
- Alteração dinâmica do modo de jogo
- Configuração de IP e porta personalizada

---

## Status do Projeto

O projeto ainda está em desenvolvimento.

Existem diversas melhorias e otimizações planejadas, incluindo:

- Melhorias na interface web
- Sistema mais robusto de controle de logs
- Melhor gerenciamento de processos
- Segurança e validações
- Automação adicional

Caso o desenvolvimento continue, novas funcionalidades serão implementadas.

---

## Tecnologias Utilizadas

- Node.js
- Java
- PaperMC
- Geyser
- HTML

---

## Observação Final

Este sistema foi desenvolvido para facilitar a hospedagem local de servidores Minecraft que suportam jogadores Java e Bedrock simultaneamente, mantendo controle total via backend Node.js.
