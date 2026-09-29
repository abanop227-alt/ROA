#!/usr/bin/env bash
# Dopo la modifica di un file .ts/.tsx esegue il typecheck (tsconfig strict) e riporta gli errori.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -d node_modules ] || exit 0
out=$(npx --no-install tsc --noEmit 2>&1) && exit 0
echo "$out" | head -30 >&2
exit 2
