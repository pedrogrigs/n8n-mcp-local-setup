# Contributing

Thanks for helping improve `n8n-mcp-local-setup`.

This repo is intentionally small. The goal is to make local `n8n-mcp` setup safer, clearer, and easier across Windows, macOS, and Linux.

## Good Contributions

- Better diagnostics for failed installs
- More MCP client integrations
- Safer config migration logic
- Better autostart behavior on Linux distributions
- Documentation improvements
- Reproducible bug reports from real machines

## Local Development

```bash
git clone https://github.com/pedrogrigs/n8n-mcp-local-setup.git
cd n8n-mcp-local-setup
npm run check
npm pack --dry-run
```

Run the CLI locally:

```bash
node ./bin/n8n-mcp-local.js help
node ./bin/n8n-mcp-local.js doctor
```

## Pull Request Checklist

- Keep the installer dependency-light.
- Do not add Docker as a requirement.
- Do not print API keys or bearer tokens.
- Preserve unrelated MCP configuration.
- Keep Windows, macOS, and Linux behavior in mind.
- Run `npm run check`.
- Run `npm pack --dry-run`.

## Security-sensitive Changes

If your change touches token handling, config files, autostart, or shell execution, explain the security impact in the PR.

