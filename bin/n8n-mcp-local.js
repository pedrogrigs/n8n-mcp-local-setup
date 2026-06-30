#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const INSTALL_DIR = path.join(os.homedir(), '.n8n-mcp-local');
const CONFIG_PATH = path.join(INSTALL_DIR, 'config.json');
const STATUS_PATH = path.join(INSTALL_DIR, 'install-status.json');
const TASK_NAME = 'n8n-mcp-local';
const HOSTED_MCP_HOST = 'api.n8n-mcp.com';

let secretValues = [];
let installStatus = {
  phase: 'idle',
  ok: false,
  done: false,
  steps: [],
  installDir: INSTALL_DIR,
};

function log(message = '') {
  console.log(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function ensureInstallDir() {
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function sanitize(value) {
  let out = String(value ?? '');
  for (const secret of secretValues) {
    if (secret) out = out.split(secret).join('[redacted]');
  }
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]');
  out = out.replace(/("Authorization"\s*:\s*"Bearer\s+)[^"]+(")/g, '$1[redacted]$2');
  return out;
}

function writeStatus(patch = {}) {
  ensureInstallDir();
  installStatus = {
    ...installStatus,
    ...patch,
    updatedAt: nowIso(),
  };
  fs.writeFileSync(STATUS_PATH, JSON.stringify(installStatus, null, 2));
}

function addStep(status, message, extra = {}) {
  const step = { at: nowIso(), status, message: sanitize(message), ...extra };
  installStatus.steps.push(step);
  writeStatus({ message: step.message });
  const label = status === 'ok' ? 'OK' : status === 'warning' ? 'WARN' : status === 'error' ? 'ERR' : '..';
  log(`[${label}] ${step.message}`);
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      flags._.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const name = arg.slice(2);
    if (name.startsWith('no-')) {
      flags[name.slice(3)] = false;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[name] = next;
      i += 1;
    } else {
      flags[name] = true;
    }
  }
  return flags;
}

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function quoteCmdArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      let actualCommand = command;
      let actualArgs = args;
      if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
        actualCommand = process.env.ComSpec || 'cmd.exe';
        actualArgs = ['/d', '/s', '/c', [command, ...args].map(quoteCmdArg).join(' ')];
      }
      child = execFile(actualCommand, actualArgs, {
        cwd: options.cwd,
        env: options.env || process.env,
        windowsHide: true,
        timeout: options.timeoutMs || 120000,
        maxBuffer: 20 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error?.code ?? 0,
          stdout: sanitize(stdout),
          stderr: sanitize(stderr),
          error: error ? sanitize(error.message) : '',
        });
      });
      if (options.stdin) child.stdin?.end(options.stdin);
    } catch (error) {
      resolve({ ok: false, code: error?.code ?? 1, stdout: '', stderr: '', error: sanitize(error.message || error) });
    }
  });
}

function checkNodeRequirement() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < 18) {
    throw new Error(`Node.js 18+ is required. Current Node is ${process.version}. Install Node LTS and rerun this installer.`);
  }
}

async function checkNpxRequirement() {
  const result = await runCommand(commandName('npx'), ['--version'], { timeoutMs: 30000 });
  if (!result.ok) throw new Error('npx was not found. Install Node LTS, which includes npm/npx.');
  return result.stdout.trim();
}

async function commandExists(command) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = await runCommand(finder, [command], { timeoutMs: 30000 });
  return result.ok;
}

function normalizeN8nUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('n8n URL is required.');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('n8n URL must start with http:// or https://.');
  return url.toString().replace(/\/$/, '');
}

function parsePort(value) {
  const port = Number.parseInt(String(value || '3007'), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be a number between 1 and 65535.');
  return port;
}

function isLocalN8nUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'
      || hostname === '::1'
      || hostname === 'host.docker.internal';
  } catch {
    return false;
  }
}

function strongToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function readExistingConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function askLine(rl, prompt, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = await rl.question(`${prompt}${suffix}: `);
  return answer.trim() || defaultValue;
}

async function askConfirm(rl, prompt, defaultValue = true) {
  const suffix = defaultValue ? ' [Y/n]' : ' [y/N]';
  const answer = (await rl.question(`${prompt}${suffix}: `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return ['y', 'yes', 's', 'sim'].includes(answer);
}

async function askSecret(prompt) {
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input, output });
    const value = await rl.question(`${prompt}: `);
    rl.close();
    return value.trim();
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const stdin = process.stdin;
    const onData = (buffer) => {
      const text = buffer.toString('utf8');
      for (const char of text) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (char === '\b' || char === '\u007f') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        value += char;
        process.stdout.write('*');
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      try { stdin.setRawMode(false); } catch {}
      stdin.pause();
    };
    process.stdout.write(`${prompt}: `);
    stdin.resume();
    try { stdin.setRawMode(true); } catch {}
    stdin.on('data', onData);
  });
}

function psSingle(value) {
  return String(value).replace(/'/g, "''");
}

function shellSingle(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
  try { fs.chmodSync(filePath, 0o755); } catch {}
}

function writeRuntimeFiles(config) {
  ensureInstallDir();
  const servicePath = path.join(INSTALL_DIR, 'service.mjs');
  const configForDisk = {
    n8nApiUrl: config.n8nApiUrl,
    n8nApiKey: config.n8nApiKey,
    port: config.port,
    host: '127.0.0.1',
    token: config.token,
    webhookSecurityMode: config.webhookSecurityMode,
    createdAt: config.createdAt || nowIso(),
    updatedAt: nowIso(),
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configForDisk, null, 2), { mode: 0o600 });
  try { fs.chmodSync(CONFIG_PATH, 0o600); } catch {}
  fs.writeFileSync(servicePath, SERVICE_SCRIPT, { mode: 0o755 });
  try { fs.chmodSync(servicePath, 0o755); } catch {}
  fs.writeFileSync(path.join(INSTALL_DIR, 'package.json'), JSON.stringify({
    private: true,
    name: 'n8n-mcp-local-runtime',
    version: '1.0.0',
    dependencies: { 'n8n-mcp': 'latest' },
  }, null, 2));

  const nodeExe = process.execPath;
  const psHeader = `$ErrorActionPreference = 'Stop'\n$Node = '${psSingle(nodeExe)}'\n$Service = Join-Path $PSScriptRoot 'service.mjs'\n`;
  fs.writeFileSync(path.join(INSTALL_DIR, 'start.ps1'), `${psHeader}& $Node $Service start\n`);
  fs.writeFileSync(path.join(INSTALL_DIR, 'stop.ps1'), `${psHeader}& $Node $Service stop\n`);
  fs.writeFileSync(path.join(INSTALL_DIR, 'restart.ps1'), `${psHeader}& $Node $Service restart\n`);
  fs.writeFileSync(path.join(INSTALL_DIR, 'status.ps1'), `${psHeader}& $Node $Service status\n`);

  const shHeader = `#!/usr/bin/env sh\nset -eu\nNODE=${shellSingle(nodeExe)}\nSERVICE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/service.mjs"\n`;
  writeExecutable(path.join(INSTALL_DIR, 'start.sh'), `${shHeader}exec "$NODE" "$SERVICE" start\n`);
  writeExecutable(path.join(INSTALL_DIR, 'stop.sh'), `${shHeader}exec "$NODE" "$SERVICE" stop\n`);
  writeExecutable(path.join(INSTALL_DIR, 'restart.sh'), `${shHeader}exec "$NODE" "$SERVICE" restart\n`);
  writeExecutable(path.join(INSTALL_DIR, 'status.sh'), `${shHeader}exec "$NODE" "$SERVICE" status\n`);

  fs.writeFileSync(path.join(INSTALL_DIR, 'README.md'), [
    '# n8n-mcp local runtime',
    '',
    'Managed by n8n-mcp-local-setup.',
    '',
    'Do not share config.json. It contains your n8n API key and local bearer token.',
    '',
  ].join('\n'));

  return { servicePath, nodeExe };
}

async function installNpmPackage() {
  const result = await runCommand(commandName('npm'), ['install', '--omit=dev', 'n8n-mcp@latest'], {
    cwd: INSTALL_DIR,
    timeoutMs: 10 * 60 * 1000,
  });
  if (!result.ok) throw new Error(`npm install failed: ${result.stderr || result.stdout || result.error}`);
}

function splitTomlSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = { header: null, lines: [] };
  for (const line of lines) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      sections.push(current);
      current = { header: line.trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

function mcpServerNameFromHeader(header) {
  if (!header) return null;
  const match = header.match(/^\[mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\]$/);
  return match ? (match[1] || match[2] || match[3]) : null;
}

function isMcpDescendantHeader(header, name) {
  if (!header || !name) return false;
  return header.startsWith(`[mcp_servers.${name}.`)
    || header.startsWith(`[mcp_servers."${name}".`)
    || header.startsWith(`[mcp_servers.'${name}'.`);
}

function configureCodex(config) {
  const codexDir = path.join(os.homedir(), '.codex');
  const configPath = path.join(codexDir, 'config.toml');
  if (!fs.existsSync(configPath)) return { skipped: true, reason: '~/.codex/config.toml not found' };

  const original = fs.readFileSync(configPath, 'utf8');
  const backupPath = `${configPath}.bak-${timestamp()}`;
  fs.copyFileSync(configPath, backupPath);

  const sections = splitTomlSections(original);
  const removeNames = new Set(['n8n-mcp']);
  for (const section of sections) {
    const name = mcpServerNameFromHeader(section.header);
    if (!name) continue;
    const body = section.lines.join('\n');
    if (body.includes(HOSTED_MCP_HOST)) removeNames.add(name);
  }

  const kept = [];
  const removedHeaders = [];
  for (const section of sections) {
    const name = mcpServerNameFromHeader(section.header);
    const removeDirect = name && removeNames.has(name);
    const removeChild = Array.from(removeNames).some((serverName) => isMcpDescendantHeader(section.header, serverName));
    if (removeDirect || removeChild) {
      if (section.header) removedHeaders.push(section.header);
      continue;
    }
    kept.push(section.lines.join('\n').replace(/\s+$/u, ''));
  }

  const localBlock = [
    '[mcp_servers.n8n-mcp]',
    'enabled = true',
    `url = "http://127.0.0.1:${config.port}/mcp"`,
    `http_headers = { "Authorization" = "Bearer ${config.token}" }`,
    'startup_timeout_sec = 30',
    'tool_timeout_sec = 120',
  ].join('\n');

  const next = `${kept.join('\n\n').trimEnd()}\n\n${localBlock}\n`;
  fs.writeFileSync(configPath, next);
  return { skipped: false, backupPath, removedHeaders };
}

async function configureClaude(config) {
  if (!(await commandExists('claude'))) return { skipped: true, reason: 'claude command not found' };

  const help = await runCommand('claude', ['mcp', '--help'], { timeoutMs: 30000 });
  const list = await runCommand('claude', ['mcp', 'list'], { timeoutMs: 60000 });
  const candidateNames = new Set(['n8n-mcp']);
  if (list.ok) {
    for (const line of list.stdout.split(/\r?\n/)) {
      const match = line.match(/^(.+):\s+/);
      if (match && !match[1].startsWith('Checking MCP')) candidateNames.add(match[1].trim());
    }
  }

  const removed = [];
  for (const name of candidateNames) {
    let shouldRemove = name === 'n8n-mcp';
    if (!shouldRemove) {
      const details = await runCommand('claude', ['mcp', 'get', name], { timeoutMs: 60000 });
      shouldRemove = details.ok && details.stdout.includes(HOSTED_MCP_HOST);
    }
    if (shouldRemove) {
      const byScope = await runCommand('claude', ['mcp', 'remove', '--scope', 'user', name], { timeoutMs: 60000 });
      if (!byScope.ok) await runCommand('claude', ['mcp', 'remove', name], { timeoutMs: 60000 });
      removed.push(name);
    }
  }

  const endpoint = `http://127.0.0.1:${config.port}/mcp`;
  const add = await runCommand('claude', [
    'mcp', 'add',
    '--transport', 'http',
    '--scope', 'user',
    'n8n-mcp',
    endpoint,
    '--header', `Authorization: Bearer ${config.token}`,
  ], { timeoutMs: 60000 });

  if (add.ok) return { skipped: false, method: 'add-http', removed, helpChecked: help.ok };

  const json = JSON.stringify({
    type: 'http',
    url: endpoint,
    headers: { Authorization: `Bearer ${config.token}` },
  });
  const addJson = await runCommand('claude', ['mcp', 'add-json', '--scope', 'user', 'n8n-mcp', json], { timeoutMs: 60000 });
  if (!addJson.ok) {
    return {
      skipped: true,
      reason: `claude mcp add failed: ${add.stderr || add.stdout || add.error}; add-json failed: ${addJson.stderr || addJson.stdout || addJson.error}`,
      removed,
      helpChecked: help.ok,
    };
  }
  return { skipped: false, method: 'add-json', removed, helpChecked: help.ok };
}

async function installAutostart(runtime) {
  const servicePath = runtime.servicePath;
  const nodeExe = runtime.nodeExe;
  if (process.platform === 'win32') {
    const ps = [
      "$ErrorActionPreference = 'Stop'",
      `$TaskName = '${psSingle(TASK_NAME)}'`,
      `$Node = '${psSingle(nodeExe)}'`,
      `$Service = '${psSingle(servicePath)}'`,
      `$WorkDir = '${psSingle(INSTALL_DIR)}'`,
      "Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null",
      "$Action = New-ScheduledTaskAction -Execute $Node -Argument ('\"' + $Service + '\" run') -WorkingDirectory $WorkDir",
      "$Trigger = New-ScheduledTaskTrigger -AtLogOn -User \"$env:USERDOMAIN\\$env:USERNAME\"",
      "$Principal = New-ScheduledTaskPrincipal -UserId \"$env:USERDOMAIN\\$env:USERNAME\" -LogonType Interactive -RunLevel Limited",
      "$Settings = New-ScheduledTaskSettingsSet -Compatibility Win8 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries",
      "Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null",
      "Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName,State | ConvertTo-Json -Compress",
    ].join('; ');
    const create = await runCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeoutMs: 60000 });
    if (!create.ok) throw new Error(`Failed to create Scheduled Task: ${create.stderr || create.stdout || create.error}`);
    return { type: 'windows-scheduled-task', ok: true };
  }

  if (process.platform === 'darwin') {
    const launchDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    fs.mkdirSync(launchDir, { recursive: true });
    const plistPath = path.join(launchDir, 'com.local.n8n-mcp.plist');
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.local.n8n-mcp</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodeExe)}</string>
    <string>${xmlEscape(servicePath)}</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>WorkingDirectory</key><string>${xmlEscape(INSTALL_DIR)}</string>
  <key>StandardOutPath</key><string>${xmlEscape(path.join(INSTALL_DIR, 'launchd.out.log'))}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(path.join(INSTALL_DIR, 'launchd.err.log'))}</string>
</dict>
</plist>
`;
    fs.writeFileSync(plistPath, plist);
    const domain = `gui/${process.getuid()}`;
    await runCommand('launchctl', ['bootout', domain, plistPath], { timeoutMs: 30000 });
    const bootstrap = await runCommand('launchctl', ['bootstrap', domain, plistPath], { timeoutMs: 60000 });
    await runCommand('launchctl', ['enable', `${domain}/com.local.n8n-mcp`], { timeoutMs: 30000 });
    await runCommand('launchctl', ['kickstart', '-k', `${domain}/com.local.n8n-mcp`], { timeoutMs: 30000 });
    return { type: 'macos-launchagent', ok: bootstrap.ok, plistPath };
  }

  const systemctl = await runCommand('systemctl', ['--user', '--version'], { timeoutMs: 30000 });
  if (systemctl.ok) {
    const systemdDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'systemd', 'user');
    fs.mkdirSync(systemdDir, { recursive: true });
    const serviceFile = path.join(systemdDir, 'n8n-mcp-local.service');
    fs.writeFileSync(serviceFile, `[Unit]
Description=Local n8n-mcp HTTP server

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart="${nodeExe}" "${servicePath}" run
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`);
    await runCommand('systemctl', ['--user', 'daemon-reload'], { timeoutMs: 30000 });
    const enable = await runCommand('systemctl', ['--user', 'enable', '--now', 'n8n-mcp-local.service'], { timeoutMs: 60000 });
    return { type: 'linux-systemd-user', ok: enable.ok, serviceFile };
  }

  const autostartDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart');
  fs.mkdirSync(autostartDir, { recursive: true });
  const desktopFile = path.join(autostartDir, 'n8n-mcp-local.desktop');
  fs.writeFileSync(desktopFile, `[Desktop Entry]
Type=Application
Name=n8n-mcp local
Exec=${nodeExe} ${servicePath} start
X-GNOME-Autostart-enabled=true
`);
  return { type: 'linux-autostart-fallback', ok: true, desktopFile };
}

async function serviceCommand(command, timeoutMs = 120000) {
  if (!fs.existsSync(path.join(INSTALL_DIR, 'service.mjs'))) {
    return { ok: false, stdout: '', stderr: '', error: 'service.mjs not found. Run install first.' };
  }
  return runCommand(process.execPath, [path.join(INSTALL_DIR, 'service.mjs'), command], {
    cwd: INSTALL_DIR,
    timeoutMs,
  });
}

async function verifyCodexNoHosted() {
  const configPath = path.join(os.homedir(), '.codex', 'config.toml');
  if (!fs.existsSync(configPath)) return { skipped: true };
  const text = fs.readFileSync(configPath, 'utf8');
  return { skipped: false, ok: !text.includes(HOSTED_MCP_HOST) };
}

async function collectConfig(flags) {
  const existing = readExistingConfig();
  const rl = readline.createInterface({ input, output });
  let n8nApiUrl = flags.url || process.env.N8N_API_URL || existing?.n8nApiUrl || '';
  let n8nApiKey = flags['api-key'] || process.env.N8N_API_KEY || '';
  let port = flags.port || process.env.N8N_MCP_LOCAL_PORT || existing?.port || '3007';

  if (!flags.yes) {
    log('');
    log('Local n8n-mcp setup');
    log('This stores secrets only in your local ~/.n8n-mcp-local/config.json.');
    log('');
    n8nApiUrl = await askLine(rl, 'n8n URL', n8nApiUrl || 'https://your-n8n.example.com');
    port = await askLine(rl, 'Local MCP port', String(port || '3007'));
  }

  if (!n8nApiKey && existing?.n8nApiKey && !flags['rotate-api-key']) {
    let reuse = true;
    if (!flags.yes) reuse = await askConfirm(rl, 'Reuse existing saved n8n API key', true);
    if (reuse) n8nApiKey = existing.n8nApiKey;
  }
  rl.close();

  if (!n8nApiKey) {
    if (flags.yes) throw new Error('Missing API key. Pass --api-key or set N8N_API_KEY.');
    n8nApiKey = await askSecret('n8n API key');
  }

  const normalizedUrl = normalizeN8nUrl(n8nApiUrl);
  const parsedPort = parsePort(port);
  const token = flags['rotate-token'] ? strongToken() : (existing?.token || strongToken());
  secretValues = [n8nApiKey, token];

  return {
    n8nApiUrl: normalizedUrl,
    n8nApiKey,
    port: parsedPort,
    token,
    webhookSecurityMode: isLocalN8nUrl(normalizedUrl) ? 'moderate' : 'strict',
    createdAt: existing?.createdAt || nowIso(),
  };
}

async function installCommand(flags) {
  writeStatus({ phase: 'installing', ok: false, done: false, steps: [] });
  checkNodeRequirement();
  addStep('ok', `Node.js requirement passed (${process.version}).`);
  const npxVersion = await checkNpxRequirement();
  addStep('ok', `npx requirement passed (${npxVersion}).`);

  const config = await collectConfig(flags);
  writeStatus({ port: config.port });

  const runtime = writeRuntimeFiles(config);
  addStep('ok', `Runtime files written to ${INSTALL_DIR}.`);

  addStep('running', 'Installing n8n-mcp npm package locally.');
  await installNpmPackage();
  addStep('ok', 'n8n-mcp npm package installed locally.');

  addStep('running', 'Configuring login autostart.');
  const autostart = await installAutostart(runtime);
  addStep(autostart.ok ? 'ok' : 'warning', `Autostart configured with ${autostart.type}.`, autostart);

  const shouldCodex = flags.codex !== false;
  const shouldClaude = flags.claude !== false;
  let codex = { skipped: true, reason: 'disabled' };
  let claude = { skipped: true, reason: 'disabled' };

  if (shouldCodex) {
    addStep('running', 'Configuring Codex MCP server.');
    codex = configureCodex(config);
    addStep(codex.skipped ? 'warning' : 'ok', codex.skipped ? `Codex skipped: ${codex.reason}` : 'Codex config updated.', codex);
  }

  if (shouldClaude) {
    addStep('running', 'Configuring Claude Code MCP server if installed.');
    claude = await configureClaude(config);
    addStep(claude.skipped ? 'warning' : 'ok', claude.skipped ? `Claude Code skipped: ${claude.reason}` : `Claude Code configured with ${claude.method}.`, claude);
  }

  addStep('running', 'Restarting local n8n-mcp service.');
  const restart = await serviceCommand('restart', 120000);
  if (!restart.ok) throw new Error(`Failed to restart local service: ${restart.stderr || restart.stdout || restart.error}`);
  addStep('ok', 'Local service restart command completed.');

  addStep('running', 'Checking /health with bearer token.');
  const health = await serviceCommand('health', 60000);
  if (!health.ok) throw new Error(`Health check failed: ${health.stderr || health.stdout || health.error}`);
  addStep('ok', '/health responded with bearer token.');

  addStep('running', 'Trying MCP tools/list.');
  const tools = await serviceCommand('mcp-list-tools', 60000);
  addStep(tools.ok ? 'ok' : 'warning', tools.ok ? 'MCP tools/list succeeded.' : `MCP tools/list was not confirmed: ${tools.stderr || tools.stdout || tools.error}`);

  const codexNoHosted = await verifyCodexNoHosted();
  if (!codexNoHosted.skipped) {
    addStep(codexNoHosted.ok ? 'ok' : 'warning', codexNoHosted.ok ? 'Codex no longer points to api.n8n-mcp.com.' : 'Codex still contains api.n8n-mcp.com.');
  }

  writeStatus({
    phase: 'complete',
    ok: true,
    done: true,
    message: 'Installation complete.',
    autostart,
    codex,
    claude,
    toolsListConfirmed: tools.ok,
    codexNoHosted,
  });

  printFinalSummary(config);
}

function printFinalSummary(config) {
  log('');
  log('Installation complete.');
  log(`Install dir: ${INSTALL_DIR}`);
  log(`MCP endpoint: http://127.0.0.1:${config.port}/mcp`);
  log(`Health: http://127.0.0.1:${config.port}/health`);
  log('');
  if (process.platform === 'win32') {
    log('Commands:');
    log(`  powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\\.n8n-mcp-local\\start.ps1"`);
    log(`  powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\\.n8n-mcp-local\\stop.ps1"`);
    log(`  powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\\.n8n-mcp-local\\restart.ps1"`);
    log(`  powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\\.n8n-mcp-local\\status.ps1"`);
  } else {
    log('Commands:');
    log('  ~/.n8n-mcp-local/start.sh');
    log('  ~/.n8n-mcp-local/stop.sh');
    log('  ~/.n8n-mcp-local/restart.sh');
    log('  ~/.n8n-mcp-local/status.sh');
  }
  log('');
  log('Restart Codex and Claude Code, then check Codex with /mcp.');
  log('API key and local token were not printed.');
}

async function menu() {
  const rl = readline.createInterface({ input, output });
  log('n8n-mcp local setup');
  log('');
  log('1. Install or reconfigure local n8n-mcp');
  log('2. Start local service');
  log('3. Stop local service');
  log('4. Restart local service');
  log('5. Status');
  log('6. Doctor');
  log('7. Print generic client snippets');
  log('');
  const choice = await askLine(rl, 'Choose', '1');
  rl.close();
  if (choice === '1') return installCommand({});
  if (choice === '2') return passthroughService('start');
  if (choice === '3') return passthroughService('stop');
  if (choice === '4') return passthroughService('restart');
  if (choice === '5') return passthroughService('status');
  if (choice === '6') return doctorCommand();
  if (choice === '7') return snippetsCommand({});
  throw new Error(`Unknown choice: ${choice}`);
}

async function passthroughService(command) {
  const result = await serviceCommand(command, command === 'mcp-list-tools' ? 60000 : 120000);
  if (!result.ok) throw new Error(result.stderr || result.stdout || result.error);
  process.stdout.write(result.stdout);
}

async function doctorCommand() {
  log('Doctor');
  checkNodeRequirement();
  log(`[OK] Node.js ${process.version}`);
  const npxVersion = await checkNpxRequirement();
  log(`[OK] npx ${npxVersion}`);
  if (!fs.existsSync(CONFIG_PATH)) {
    log('[WARN] No local config found. Run install first.');
    return;
  }
  const config = readExistingConfig();
  if (config?.n8nApiKey && config?.token) secretValues = [config.n8nApiKey, config.token];
  log(`[OK] Config exists at ${CONFIG_PATH}`);
  const status = await serviceCommand('status', 30000);
  process.stdout.write(status.stdout || status.stderr || status.error);
  const health = await serviceCommand('health', 30000);
  log(health.ok ? '[OK] /health passed' : `[WARN] /health failed: ${health.stderr || health.stdout || health.error}`);
  const tools = await serviceCommand('mcp-list-tools', 60000);
  log(tools.ok ? `[OK] tools/list passed: ${tools.stdout.trim()}` : `[WARN] tools/list failed: ${tools.stderr || tools.stdout || tools.error}`);
  const codex = await verifyCodexNoHosted();
  if (!codex.skipped) log(codex.ok ? '[OK] Codex does not point to api.n8n-mcp.com' : '[WARN] Codex still contains api.n8n-mcp.com');
  if (await commandExists('claude')) {
    const list = await runCommand('claude', ['mcp', 'list'], { timeoutMs: 60000 });
    log(list.ok && list.stdout.includes(`http://127.0.0.1:${config.port}/mcp`) ? '[OK] Claude Code lists local n8n-mcp' : '[WARN] Claude Code local n8n-mcp was not confirmed');
  }
}

function snippetsCommand(flags) {
  const config = readExistingConfig();
  const port = flags.port || config?.port || '<porta>';
  const token = flags['show-token'] ? (config?.token || '<token local>') : '<token local>';
  log(JSON.stringify({
    mcpServers: {
      'n8n-mcp': {
        type: 'http',
        url: `http://127.0.0.1:${port}/mcp`,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }, null, 2));
  log('');
  log(JSON.stringify({
    mcpServers: {
      'n8n-mcp': {
        command: 'npx',
        args: [
          '-y',
          'mcp-remote',
          `http://127.0.0.1:${port}/mcp`,
          '--header',
          `Authorization: Bearer ${token}`,
        ],
      },
    },
  }, null, 2));
  if (!flags['show-token']) log('\nUse --show-token only on your own machine if you really need to print the local bearer token.');
}

function help() {
  log(`n8n-mcp-local-setup

Usage:
  n8n-mcp-local-setup                  Open interactive menu
  n8n-mcp-local-setup install          Install/reconfigure local n8n-mcp
  n8n-mcp-local-setup start            Start local service
  n8n-mcp-local-setup stop             Stop local service
  n8n-mcp-local-setup restart          Restart local service
  n8n-mcp-local-setup status           Show local service status
  n8n-mcp-local-setup doctor           Run diagnostics
  n8n-mcp-local-setup snippets         Print generic MCP snippets

Install flags:
  --url <url>              n8n instance URL
  --api-key <key>          n8n API key; prefer N8N_API_KEY env var in shared terminals
  --port <port>            Local MCP port, default 3007
  --yes                   Non-interactive mode
  --no-codex              Do not edit ~/.codex/config.toml
  --no-claude             Do not configure Claude Code
  --rotate-token          Generate a new local MCP bearer token

Examples:
  npx -y github:pedrogrigs/n8n-mcp-local-setup
  npx -y github:pedrogrigs/n8n-mcp-local-setup install
  N8N_API_KEY=... npx -y github:pedrogrigs/n8n-mcp-local-setup install --yes --url https://n8n.example.com --port 3007
`);
}

const SERVICE_SCRIPT = String.raw`#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const DIR = path.dirname(__filename);
const CONFIG_PATH = path.join(DIR, 'config.json');
const MANAGER_PID = path.join(DIR, 'manager.pid');
const CHILD_PID = path.join(DIR, 'child.pid');
const OUT_LOG = path.join(DIR, 'n8n-mcp.out.log');
const ERR_LOG = path.join(DIR, 'n8n-mcp.err.log');
let child = null;
let stopping = false;

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) throw new Error('Missing config.json. Run install first.');
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function isPidAlive(pid) {
  if (!pid || !Number.isInteger(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(file) {
  try {
    const pid = Number(fs.readFileSync(file, 'utf8').trim());
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

function unlink(file) {
  try { fs.unlinkSync(file); } catch {}
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, {
      cwd: options.cwd || DIR,
      timeout: options.timeoutMs || 30000,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error?.code ?? 0, stdout, stderr, error: error?.message || '' });
    });
  });
}

function binPath() {
  const script = path.join(DIR, 'node_modules', 'n8n-mcp', 'dist', 'mcp', 'index.js');
  if (!fs.existsSync(script)) throw new Error('n8n-mcp package is not installed. Run install first.');
  return script;
}

function envFor(config) {
  return {
    ...process.env,
    MCP_MODE: 'http',
    N8N_MODE: 'true',
    HOST: '127.0.0.1',
    PORT: String(config.port),
    N8N_API_URL: config.n8nApiUrl,
    N8N_API_KEY: config.n8nApiKey,
    AUTH_TOKEN: config.token,
    MCP_AUTH_TOKEN: config.token,
    LOG_LEVEL: 'error',
    DISABLE_CONSOLE_OUTPUT: 'true',
    WEBHOOK_SECURITY_MODE: config.webhookSecurityMode || 'strict',
  };
}

async function healthRequest(config) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: config.port,
      path: '/health',
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + config.token,
        Accept: 'application/json',
      },
      timeout: 5000,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode, body });
        } else {
          reject(new Error('Health returned HTTP ' + res.statusCode + ': ' + body.slice(0, 500)));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Health request timed out')));
    req.end();
  });
}

async function waitForHealth(config, timeoutMs = 90000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      return await healthRequest(config);
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw lastError || new Error('Timed out waiting for health.');
}

function startRunner() {
  const config = loadConfig();
  fs.writeFileSync(MANAGER_PID, String(process.pid));
  const out = fs.openSync(OUT_LOG, 'a');
  const err = fs.openSync(ERR_LOG, 'a');
  const launch = () => {
    if (stopping) return;
    child = spawn(process.execPath, [binPath()], {
      cwd: DIR,
      env: envFor(config),
      stdio: ['pipe', out, err],
      windowsHide: true,
    });
    fs.writeFileSync(CHILD_PID, String(child.pid));
    child.on('exit', () => {
      unlink(CHILD_PID);
      if (!stopping) setTimeout(launch, 3000);
    });
  };
  const shutdown = () => {
    stopping = true;
    if (child && child.pid) {
      try { child.kill('SIGTERM'); } catch {}
    }
    unlink(MANAGER_PID);
    unlink(CHILD_PID);
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  launch();
}

async function startDetached() {
  const config = loadConfig();
  try {
    await healthRequest(config);
    console.log('n8n-mcp local is already healthy on port ' + config.port + '.');
    return;
  } catch {}

  const managerPid = readPid(MANAGER_PID);
  if (isPidAlive(managerPid)) {
    try {
      await waitForHealth(config, 20000);
      console.log('n8n-mcp local is healthy on port ' + config.port + '.');
      return;
    } catch {
      await stopService();
    }
  }

  const childProc = spawn(process.execPath, [__filename, 'run'], {
    cwd: DIR,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  childProc.unref();
  await waitForHealth(config, 90000);
  console.log('n8n-mcp local started on http://127.0.0.1:' + config.port + '/mcp');
}

async function killPid(pid) {
  if (!pid || !isPidAlive(pid)) return;
  if (process.platform === 'win32') {
    await runCommand('taskkill', ['/PID', String(pid), '/T', '/F'], { timeoutMs: 30000 });
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (isPidAlive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  }
}

async function stopService() {
  const managerPid = readPid(MANAGER_PID);
  const childPid = readPid(CHILD_PID);
  await killPid(managerPid);
  await killPid(childPid);
  unlink(MANAGER_PID);
  unlink(CHILD_PID);
  console.log('n8n-mcp local stopped.');
}

async function status() {
  const config = loadConfig();
  const managerPid = readPid(MANAGER_PID);
  const childPid = readPid(CHILD_PID);
  let healthy = false;
  let healthError = null;
  try {
    await healthRequest(config);
    healthy = true;
  } catch (error) {
    healthError = error.message;
  }
  console.log(JSON.stringify({
    installDir: DIR,
    port: config.port,
    endpoint: 'http://127.0.0.1:' + config.port + '/mcp',
    health: 'http://127.0.0.1:' + config.port + '/health',
    managerPid,
    managerAlive: isPidAlive(managerPid),
    childPid,
    childAlive: isPidAlive(childPid),
    healthy,
    healthError,
  }, null, 2));
}

function parseRpcPayload(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const dataLines = trimmed.split(/\r?\n/).filter(line => line.startsWith('data:'));
  for (const line of dataLines) {
    const value = line.slice(5).trim();
    if (value && value !== '[DONE]') return JSON.parse(value);
  }
  throw new Error('Could not parse MCP response: ' + trimmed.slice(0, 300));
}

async function rpc(config, body, sessionId) {
  const headers = {
    Authorization: 'Bearer ' + config.token,
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const res = await fetch('http://127.0.0.1:' + config.port + '/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok && res.status !== 202) throw new Error('MCP HTTP ' + res.status + ': ' + text.slice(0, 500));
  return {
    status: res.status,
    sessionId: res.headers.get('mcp-session-id') || sessionId,
    payload: text ? parseRpcPayload(text) : null,
  };
}

async function listTools() {
  const config = loadConfig();
  const init = await rpc(config, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'n8n-mcp-local-setup', version: '1.0.0' },
    },
  });
  const sessionId = init.sessionId;
  await rpc(config, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, sessionId).catch(() => null);
  const tools = await rpc(config, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionId);
  const names = tools.payload?.result?.tools?.map(tool => tool.name) || [];
  console.log(JSON.stringify({ ok: true, count: names.length, sample: names.slice(0, 10) }, null, 2));
}

const command = process.argv[2] || 'status';
try {
  if (command === 'run') {
    startRunner();
  } else if (command === 'start') {
    await startDetached();
  } else if (command === 'stop') {
    await stopService();
  } else if (command === 'restart') {
    await stopService();
    await startDetached();
  } else if (command === 'status') {
    await status();
  } else if (command === 'health') {
    const config = loadConfig();
    const result = await healthRequest(config);
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'mcp-list-tools') {
    await listTools();
  } else {
    throw new Error('Unknown command: ' + command);
  }
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
`;

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const flags = parseFlags(argv.slice(1));
  try {
    if (!command) return await menu();
    if (command === 'install' || command === 'setup') return await installCommand(flags);
    if (['start', 'stop', 'restart', 'status'].includes(command)) return await passthroughService(command);
    if (command === 'doctor') return await doctorCommand();
    if (command === 'snippets') return snippetsCommand(flags);
    if (command === 'help' || command === '--help' || command === '-h') return help();
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    addStep('error', error.stack || error.message || error);
    writeStatus({ phase: 'error', ok: false, done: true, message: sanitize(error.message || error) });
    fail(sanitize(error.message || error));
  }
}

await main();
