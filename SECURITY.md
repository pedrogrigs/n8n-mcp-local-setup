# Security Policy

## Supported Versions

This project is currently pre-1.0. Security fixes are applied to the latest commit on `main`.

## Reporting a Vulnerability

Please do not open a public issue for secrets exposure, command injection, token leakage, or unsafe config migration.

Instead, report privately through GitHub Security Advisories:

```text
https://github.com/pedrogrigs/n8n-mcp-local-setup/security/advisories/new
```

If that is not available, open a minimal issue asking for a private contact without including exploit details.

## Security Model

The installer is designed to:

- Store the n8n API key only in the user's local runtime folder.
- Bind the MCP server to `127.0.0.1`.
- Require a local bearer token for MCP HTTP requests.
- Avoid printing API keys or bearer tokens in logs.
- Preserve unrelated MCP configuration.
- Avoid Docker and remote hosted MCP bridges.

Users should still review shell commands before running them and keep `~/.n8n-mcp-local/config.json` private.

