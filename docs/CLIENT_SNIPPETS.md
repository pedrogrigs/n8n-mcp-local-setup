# Client snippets

Use estes snippets quando um cliente MCP não for Codex nem Claude Code.

## HTTP

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

## stdio com mcp-remote

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
