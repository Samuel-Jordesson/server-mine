#!/bin/bash
# Abre o Painel Minecraft como app desktop (Electron).
# Remove variáveis de ambiente do snap (VSCode, etc) que quebram bibliotecas gráficas.
set -e
cd "$(dirname "$0")"

env -u ELECTRON_RUN_AS_NODE -u ELECTRON_NO_ATTACH_CONSOLE \
    -u GTK_PATH -u GTK_EXE_PREFIX -u SNAP_LIBRARY_PATH \
    -u GDK_PIXBUF_MODULE_FILE -u GDK_PIXBUF_MODULEDIR -u LOCPATH \
    -u GIO_MODULE_DIR -u GSETTINGS_SCHEMA_DIR -u XDG_DATA_DIRS -u WAYLAND_DISPLAY \
    ./node_modules/.bin/electron --no-sandbox --disable-gpu --ozone-platform=x11 electron-app/main.js
