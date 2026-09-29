#!/usr/bin/env bash
# Blocca le modifiche dirette a src/data/roa-dati.json (file generato da scripts/libreria.py).
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  */src/data/roa-dati.json)
    echo "roa-dati.json è generato: modifica scripts/libreria.py e rigenera con 'python3 scripts/libreria.py'." >&2
    exit 2 ;;
esac
exit 0
