# Prompt para agente: instalar n8n-mcp local sem Docker

Use este prompt em Codex, Claude Code ou outro agente com acesso ao terminal local.

```text
Você é meu engenheiro de setup local. Quero instalar o n8n-mcp open source rodando localmente em HTTP mode, sem Docker, para conectar meu próprio n8n ao meu agente de IA.

Objetivo:
1. Instalar e rodar o pacote npm n8n-mcp localmente.
2. Configurar o MCP em HTTP mode em 127.0.0.1, porta padrão 3007.
3. Pedir de forma segura:
   - URL da minha instância n8n
   - API key do n8n
   - porta local do MCP, default 3007
4. Gerar um token local forte para proteger o endpoint MCP.
5. Configurar autostart no login:
   - Windows: Scheduled Task do usuário
   - macOS: LaunchAgent do usuário
   - Linux: systemd user service, ou fallback XDG autostart se systemd não existir
6. Remover/substituir qualquer MCP que aponte para https://api.n8n-mcp.com.
7. Configurar Codex e Claude Code, se existirem, para usar o MCP local.
8. Validar /health com bearer token e tentar tools/list antes de finalizar.

Primeiro tente o caminho pronto:

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup install
```

Se o pacote já estiver publicado no npm, use:

```bash
npx -y n8n-mcp-local-setup install
```

Se esse caminho não funcionar, implemente manualmente com estes requisitos:

Requisitos obrigatórios:
- Não use Docker.
- Verifique Node.js e npx antes de qualquer coisa.
- Se Node não existir ou for menor que 18, pare e diga para instalar Node LTS.
- Use o pacote npm n8n-mcp.
- Não rode o binário npm n8n-mcp para HTTP mode, porque ele força MCP_MODE=stdio.
- Para HTTP mode, execute o entrypoint instalado:
  node_modules/n8n-mcp/dist/mcp/index.js
- Rode com estas env vars:
  - MCP_MODE=http
  - N8N_MODE=true
  - HOST=127.0.0.1
  - PORT=<porta escolhida>
  - N8N_API_URL=<url informada>
  - N8N_API_KEY=<api key informada>
  - AUTH_TOKEN=<token local gerado>
  - MCP_AUTH_TOKEN=<mesmo token local gerado>
  - LOG_LEVEL=error
  - DISABLE_CONSOLE_OUTPUT=true
  - WEBHOOK_SECURITY_MODE=moderate se a URL do n8n for localhost/127.0.0.1/host.docker.internal; caso contrário, strict.

Pasta local:
- Windows: %USERPROFILE%\.n8n-mcp-local
- macOS/Linux: ~/.n8n-mcp-local
- Salve config.json nessa pasta.
- Não exiba API key nem token em logs.
- Gere scripts start/stop/restart/status nessa pasta.

Configuração do Codex:
- Procure ~/.codex/config.toml.
- Faça backup antes de editar.
- Remova qualquer seção [mcp_servers.*] que tenha url = "https://api.n8n-mcp.com" ou contenha api.n8n-mcp.com.
- Remova/substitua [mcp_servers.n8n-mcp].
- Preserve todos os outros MCPs e configs.
- Adicione:

[mcp_servers.n8n-mcp]
enabled = true
url = "http://127.0.0.1:<porta>/mcp"
http_headers = { "Authorization" = "Bearer <token local>" }
startup_timeout_sec = 30
tool_timeout_sec = 120

Configuração do Claude Code:
- Se o comando claude existir, rode claude mcp --help.
- Remova n8n-mcp antigo e qualquer servidor que aponte para api.n8n-mcp.com.
- Prefira:
  claude mcp add --transport http --scope user n8n-mcp http://127.0.0.1:<porta>/mcp --header "Authorization: Bearer <token local>"
- Se falhar, use claude mcp add-json com configuração HTTP equivalente.
- Se Claude Code não existir, apenas mostre snippet genérico.

Validação:
- Inicie/reinicie o serviço local.
- Teste http://127.0.0.1:<porta>/health com Authorization: Bearer <token local>.
- Faça uma chamada MCP tools/list se possível.
- Confirme que Codex não contém api.n8n-mcp.com.
- Confirme que autostart foi criado.

No final, entregue:
- Pasta local criada.
- Porta usada.
- Status do health check.
- Status do tools/list.
- Status do Codex.
- Status do Claude Code.
- Comandos start/stop/restart/status.
- Aviso para reiniciar Codex e Claude Code.

Nunca mostre a API key do n8n nem o token local no chat.
```
