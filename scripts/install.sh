#!/usr/bin/env sh
set -eu

PACKAGE_SPEC="${N8N_MCP_LOCAL_PACKAGE_SPEC:-github:pedrogrigs/n8n-mcp-local-setup}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nao encontrado. Instale Node LTS 18+ e rode novamente." >&2
  exit 1
fi

major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$major" -lt 18 ]; then
  echo "Node.js 18+ e obrigatorio. Instale Node LTS e rode novamente." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx nao encontrado. Instale Node LTS, que inclui npm/npx." >&2
  exit 1
fi

exec npx -y "$PACKAGE_SPEC" install
