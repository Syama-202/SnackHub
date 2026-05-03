// npm run dev: the whole local stack in one terminal, in the right order. Redis first when
// Docker is running (the API works without it), then the API, and the two frontends only once
// the API answers /health, so their proxies never start against a missing backend. Each
// line is labelled with the server it came from; Ctrl+C stops all of them.
import { spawn, spawnSync } from 'node:child_process';

const API = 'http://127.0.0.1:4000/health';
const COLORS = { redis: 31, api: 36, web: 33, admin: 35 };
const children = [];
let stopping = false;

const say = (name, line) => process.stdout.write(`\x1b[${COLORS[name]}m[${name}]\x1b[0m ${line}\n`);

function run(name, command) {
  const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1' } });
  children.push(child);
  let partial = '';
  const onData = (chunk) => {
    const lines = (partial + chunk).split(/\r?\n/);
    partial = lines.pop();
    for (const line of lines) {
      say(name, line);
      // node --watch keeps the process alive after a crash and waits for a file change
      if (name === 'api' && line.includes('Failed running')) say(name, '\x1b[41m API crashed: the reason is above. It restarts when you save a backend file; until then the sites show proxy errors (ECONNREFUSED). \x1b[0m');
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => {
    if (!stopping) say(name, `stopped (exit ${code}); the other servers keep running. Ctrl+C to stop everything.`);
  });
  return child;
}

async function apiUp(timeoutMs) {
  for (const until = Date.now() + timeoutMs; Date.now() < until; ) {
    try {
      if ((await fetch(API)).ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    // the servers run under a shell: stop the whole process tree
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(0);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

// Redis is optional: rate limits and live updates fall back to this process without it
const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', shell: true });
if (docker.status === 0) {
  const up = spawnSync('docker', ['compose', '-f', 'infra/docker-compose.yml', 'up', '-d', 'redis'], { encoding: 'utf8', shell: true });
  say('redis', up.status === 0 ? 'running on 127.0.0.1:6380' : `could not start: ${(up.stderr || '').trim().split('\n').pop()}`);
} else {
  say('redis', 'Docker is not running, so the API runs without Redis (limits and live updates per process). Start Docker Desktop and run npm run redis:up to add it.');
}

run('api', 'npm --prefix backend run dev');
if (!(await apiUp(60_000))) {
  say('api', 'did not answer /health within a minute; the reason is in the lines above. Not starting the sites.');
} else {
  say('api', 'ready on http://127.0.0.1:4000');
  run('web', 'npm --prefix frontend run dev');
  run('admin', 'npm --prefix frontend run dev:admin');
}
