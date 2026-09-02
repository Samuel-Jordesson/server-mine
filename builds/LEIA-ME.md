# Painel Minecraft — aplicativo desktop

Builds prontos do painel. Os arquivos aqui **não vão para o Git** (são grandes
demais para o GitHub, que recusa arquivos acima de 100 MB) — ficam só na máquina.

Para gerar de novo:

```bash
cd electron-app
npm run build:linux     # AppImage + .deb
npm run build:win       # ZIP portátil do Windows
```

---

## Linux

### `PainelMinecraft-1.0.0-linux-amd64.deb`  — recomendado no Ubuntu

```bash
sudo dpkg -i builds/linux/PainelMinecraft-1.0.0-linux-amd64.deb
```

Instala em `/opt/Painel Minecraft` e cria o atalho no menu de aplicativos.
Depois é só procurar por "Painel Minecraft".

### `PainelMinecraft-1.0.0-linux-x86_64.AppImage` — portátil, não instala nada

```bash
chmod +x builds/linux/PainelMinecraft-1.0.0-linux-x86_64.AppImage
./builds/linux/PainelMinecraft-1.0.0-linux-x86_64.AppImage
```

**Atenção:** o Ubuntu 24.04 e mais novos não vêm com a `libfuse2`, que o AppImage
usa para se montar. Sem ela o app não abre e mostra um aviso sobre FUSE. Duas saídas:

```bash
sudo apt install libfuse2t64          # resolve de vez
# ou, sem instalar nada:
./PainelMinecraft-1.0.0-linux-x86_64.AppImage --appimage-extract-and-run
```

O `.deb` não tem esse problema — por isso é a opção recomendada.

---

## Windows

### `PainelMinecraft-1.0.0-windows-x64.zip` — portátil

1. Copie o ZIP para o PC com Windows
2. Extraia a pasta em qualquer lugar (ex: `C:\Painel Minecraft`)
3. Abra o `Painel Minecraft.exe`

Não precisa instalar. O Windows pode mostrar um aviso do SmartScreen na primeira
execução porque o app não tem assinatura digital paga — clique em
"Mais informações" → "Executar assim mesmo".

**Por que não tem instalador (.exe do tipo setup):** o instalador NSIS só pode ser
gerado a partir do Linux com o Wine instalado, e esta máquina não tem Wine (nem
permissão de sudo para instalar). O ZIP portátil funciona igual, só não cria
atalho no menu Iniciar automaticamente. Para gerar o instalador de verdade,
rode `npm run build:win` em uma máquina Windows, ou instale o Wine aqui:

```bash
sudo apt install wine64
cd electron-app && npx electron-builder --win nsis
```

---

## Primeira vez que abrir

O app não inclui o servidor Minecraft — ele é só o painel de controle. Na primeira
abertura ele vai direto para **Configurações**, onde você escolhe onde o servidor roda:

- **AWS EC2** — cola as credenciais e o Instance ID; ganha os botões de ligar/desligar
- **Remoto (URL fixa)** — aponta para o endereço de um painel já no ar

A configuração fica salva no perfil do usuário (`~/.config/Painel Minecraft/` no
Linux, `%APPDATA%\Painel Minecraft\` no Windows) e não é compartilhada com a
versão de desenvolvimento (`npm run desktop`).
