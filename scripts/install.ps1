$ErrorActionPreference = "Stop"

$PackageSpec = $env:N8N_MCP_LOCAL_PACKAGE_SPEC
if (-not $PackageSpec) {
  $PackageSpec = "github:pedrogrigs/n8n-mcp-local-setup"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js nao encontrado. Instale Node LTS 18+ e rode novamente."
}

$major = [int]((& node -p "process.versions.node.split('.')[0]"))
if ($major -lt 18) {
  throw "Node.js 18+ e obrigatorio. Instale Node LTS e rode novamente."
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "npx nao encontrado. Instale Node LTS, que inclui npm/npx."
}

npx -y $PackageSpec install
