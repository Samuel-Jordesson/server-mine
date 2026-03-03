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

## Como Funciona

O servidor utiliza Paper como base.

O Geyser faz a ponte entre Java e Bedrock.

O Node.js é responsável por:

- Iniciar o servidor
- Definir IP e porta
- Gerenciar logs
- Controlar modo de jogo (Sobrevivência / Criiativo)
- Executar o servidor no IP da máquina hospedada

Basta definir:

IP  
PORTA  

E executar o sistema.

---

## Interface Web

Foi desenvolvido um HTML simples acessível via navegador para:

- Visualizar logs do servidor em tempo real
- Alterar modo de jogo (Survival / Creative) pelo frontend
- Controlar o servidor de forma visual

Observação:  
A interface ainda precisa de melhorias para funcionar de forma mais eficiente e estável.

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

## Execução

1. Configure o IP
2. Configure a porta
3. Execute o sistema via Node.js
4. Acesse o painel pelo navegador

---

## Observação Final

Este sistema foi desenvolvido para facilitar a hospedagem local de servidores Minecraft que suportam jogadores Java e Bedrock simultaneamente, mantendo controle total via backend Node.js.
