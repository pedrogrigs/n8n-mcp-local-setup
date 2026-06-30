# Publishing

## GitHub-only usage

Depois de subir este repositório para o GitHub, qualquer pessoa poderá rodar:

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup
```

Ou direto no fluxo de instalação:

```bash
npx -y github:pedrogrigs/n8n-mcp-local-setup install
```

## Preparar o repositório

```bash
cd n8n-mcp-local-setup
git init
git add .
git update-index --chmod=+x bin/n8n-mcp-local.js scripts/install.sh
git commit -m "Add local n8n-mcp setup CLI"
git branch -M main
git remote add origin https://github.com/pedrogrigs/n8n-mcp-local-setup.git
git push -u origin main
```

No Windows, o comando `git update-index --chmod=+x ...` é importante para preservar o bit executável quando o projeto for usado em macOS/Linux.

## Publicar no npm

Opcionalmente:

```bash
npm login
npm publish --access public
```

Depois disso:

```bash
npx -y n8n-mcp-local-setup
```

Se o nome `n8n-mcp-local-setup` já estiver ocupado no npm, altere `name` no `package.json` para um escopo seu, por exemplo:

```json
{
  "name": "@seu-usuario/n8n-mcp-local-setup"
}
```

E use:

```bash
npx -y @seu-usuario/n8n-mcp-local-setup
```
