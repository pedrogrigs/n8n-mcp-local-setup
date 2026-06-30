# n8n-mcp local setup

Instalador local para rodar o [`n8n-mcp`](https://www.npmjs.com/package/n8n-mcp) open source em HTTP mode, sem Docker, com configuração automática para Codex e Claude Code.

Ele foi feito para uma pessoa colar um comando no terminal, informar a URL/API key do próprio n8n e terminar com um MCP local em:

```text
http://127.0.0.1:3007/mcp
```

## Instalação rápida

Depois de publicar este repositório no GitHub:

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup
```

Depois de publicar no npm:

```bash
npx -y n8n-mcp-local-setup
```

Comando direto para instalar:

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup install
```

## O que o instalador faz

- Verifica Node.js e npx. Node precisa ser 18+.
- Pede URL da instância n8n, API key e porta local.
- Instala o pacote npm `n8n-mcp` localmente na pasta do usuário.
- Roda `n8n-mcp` em HTTP mode usando o entrypoint correto do pacote.
- Gera token local forte para proteger o endpoint MCP.
- Configura autostart no login:
  - Windows: Scheduled Task do usuário.
  - macOS: LaunchAgent do usuário.
  - Linux: systemd user service, com fallback XDG autostart.
- Remove/substitui MCPs que apontem para `https://api.n8n-mcp.com` no Codex e no Claude Code.
- Configura Codex e Claude Code para usar `http://127.0.0.1:<porta>/mcp`.
- Testa `/health` com bearer token e tenta `tools/list`.

## Arquivos instalados no computador do usuário

Windows:

```text
%USERPROFILE%\.n8n-mcp-local
```

macOS/Linux:

```text
~/.n8n-mcp-local
```

Essa pasta contém `config.json`, que guarda a API key do n8n e o token local. Não publique esse arquivo.

## Comandos depois de instalado

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.n8n-mcp-local\start.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.n8n-mcp-local\stop.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.n8n-mcp-local\restart.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.n8n-mcp-local\status.ps1"
```

macOS/Linux:

```bash
~/.n8n-mcp-local/start.sh
~/.n8n-mcp-local/stop.sh
~/.n8n-mcp-local/restart.sh
~/.n8n-mcp-local/status.sh
```

Via CLI:

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup status
npx -y github:pedrogrigs/n8n-mcp-local-setup doctor
npx -y github:pedrogrigs/n8n-mcp-local-setup restart
```

## Codex

O instalador edita `~/.codex/config.toml`, com backup automático, e adiciona:

```toml
[mcp_servers.n8n-mcp]
enabled = true
url = "http://127.0.0.1:<porta>/mcp"
http_headers = { "Authorization" = "Bearer <token local>" }
startup_timeout_sec = 30
tool_timeout_sec = 120
```

Depois da instalação, reinicie o Codex e use:

```text
/mcp
```

## Claude Code

Se o comando `claude` existir, o instalador usa o fluxo suportado pela versão instalada:

```bash
claude mcp add --transport http --scope user n8n-mcp http://127.0.0.1:<porta>/mcp --header "Authorization: Bearer <token local>"
```

Se essa sintaxe falhar, ele tenta `claude mcp add-json`.

Depois da instalação, reinicie o Claude Code.

## Instalação por agente

Se a pessoa preferir mandar um prompt para o Codex, Claude Code ou outro agente local, use:

[prompts/AGENT_INSTALL_PROMPT.md](prompts/AGENT_INSTALL_PROMPT.md)

Esse prompt inclui os aprendizados importantes: não usar Docker, não usar o binário npm `n8n-mcp` para HTTP mode, preservar configs existentes e validar `/health` + `tools/list`.

## Publicando seu fork

1. Crie um repositório no GitHub.
2. Copie esta pasta inteira para o repositório.
3. Confirme que os exemplos apontam para `pedrogrigs/n8n-mcp-local-setup`.
4. Rode:

```bash
npm run check
```

5. Faça commit e push.
6. Teste em outra máquina:

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup doctor
```

Guia detalhado:

[docs/PUBLISHING.md](docs/PUBLISHING.md)

## Segurança

- A API key do n8n não é exibida em logs.
- O token local não é exibido no resumo final.
- O endpoint MCP local exige `Authorization: Bearer <token local>`.
- Para URL de n8n local, `WEBHOOK_SECURITY_MODE=moderate`.
- Para URL remota, `WEBHOOK_SECURITY_MODE=strict`.
- Docker não é usado.

## Snippets genéricos

HTTP:

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:<porta>/mcp",
      "headers": {
        "Authorization": "Bearer <token local>"
      }
    }
  }
}
```

stdio via `mcp-remote`:

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://127.0.0.1:<porta>/mcp",
        "--header",
        "Authorization: Bearer <token local>"
      ]
    }
  }
}
```
