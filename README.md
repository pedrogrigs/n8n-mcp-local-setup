# n8n MCP Local Setup

One command to run the open source `n8n-mcp` on your own computer and connect it to Codex, Claude Code, or any MCP-compatible AI agent.

[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-339933)](https://nodejs.org)
[![No Docker](https://img.shields.io/badge/Docker-not_required-2496ED)](#)
[![MCP HTTP](https://img.shields.io/badge/MCP-HTTP-111827)](#)
[![Windows macOS Linux](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-supported-0f766e)](#)

No Docker. No hosted `api.n8n-mcp.com`. Your n8n API key stays on your machine.

## Quick Install

You need Node.js 18+ installed first.

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup install
```

The installer asks for:

- Your n8n instance URL
- Your n8n API key
- The local MCP port, default `3007`

When it finishes, your local MCP server runs at:

```text
http://127.0.0.1:3007/mcp
```

## What This Does

This installer turns your computer into a local MCP bridge for n8n.

It automatically:

- Installs the open source npm package `n8n-mcp`
- Runs it in HTTP mode on `127.0.0.1`
- Generates a strong local bearer token
- Saves config in your user folder
- Starts the MCP server now
- Enables autostart when you log in
- Configures Codex if installed
- Configures Claude Code if installed
- Removes old MCP config pointing to `https://api.n8n-mcp.com`
- Tests `/health`
- Tests MCP `tools/list` when possible

## Supported Systems

| System | Autostart method |
| --- | --- |
| Windows | User Scheduled Task |
| macOS | User LaunchAgent |
| Linux | systemd user service |
| Linux fallback | XDG autostart entry |

## Install Commands

### Windows PowerShell

```powershell
npx -y github:pedrogrigs/n8n-mcp-local-setup install
```

### macOS or Linux

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup install
```

### Non-interactive install

Use this only on your own machine or in a secure shell session.

```bash
N8N_API_KEY="your-api-key" npx -y github:pedrogrigs/n8n-mcp-local-setup install --yes --url https://your-n8n.example.com --port 3007
```

Windows PowerShell:

```powershell
$env:N8N_API_KEY="your-api-key"
npx -y github:pedrogrigs/n8n-mcp-local-setup install --yes --url https://your-n8n.example.com --port 3007
```

## After Install

Restart Codex or Claude Code so they reload MCP configuration.

In Codex, run:

```text
/mcp
```

You should see `n8n-mcp` pointing to:

```text
http://127.0.0.1:3007/mcp
```

## Daily Commands

### Check status

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup status
```

### Run diagnostics

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup doctor
```

### Restart the local server

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup restart
```

### Print generic MCP snippets

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup snippets
```

## Local Files

The installer creates a local runtime folder:

| System | Folder |
| --- | --- |
| Windows | `%USERPROFILE%\.n8n-mcp-local` |
| macOS/Linux | `~/.n8n-mcp-local` |

That folder contains `config.json` with your n8n API key and local MCP token.

Do not publish or share that file.

## Manual Service Commands

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

## Agent Install Prompt

Prefer having Codex, Claude Code, or another local agent install it for you?

Send this prompt to your agent:

[prompts/AGENT_INSTALL_PROMPT.md](prompts/AGENT_INSTALL_PROMPT.md)

The prompt tells the agent how to install, configure, validate, and troubleshoot the local MCP setup safely.

## Generic MCP Config

For MCP clients that support HTTP:

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:3007/mcp",
      "headers": {
        "Authorization": "Bearer <your-local-token>"
      }
    }
  }
}
```

For MCP clients that only support stdio:

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://127.0.0.1:3007/mcp",
        "--header",
        "Authorization: Bearer <your-local-token>"
      ]
    }
  }
}
```

Your local token is saved in `~/.n8n-mcp-local/config.json`.

## Security Notes

- The n8n API key stays on your computer.
- The local MCP endpoint is bound to `127.0.0.1`.
- The MCP endpoint requires a bearer token.
- The installer does not use Docker.
- Existing unrelated MCP configs are preserved.
- Old configs pointing to `https://api.n8n-mcp.com` are replaced with the local server.

## Troubleshooting

### Node.js is missing or too old

Install Node.js LTS from:

```text
https://nodejs.org
```

Then run the installer again.

### Codex or Claude Code does not show the MCP

Restart the app after install.

Then run:

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup doctor
```

### Port already in use

Run the installer again and choose another port:

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup install --port 3010
```

### You want to rotate the local token

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup install --rotate-token
```

Restart Codex and Claude Code afterward.

## Why This Exists

The hosted n8n MCP endpoint is convenient, but many people prefer a local setup:

- Your API key stays local
- Your MCP server keeps running while your computer is on
- You can connect multiple local AI tools to the same n8n instance
- You avoid depending on a third-party hosted MCP bridge

This repo packages that setup into one command.
