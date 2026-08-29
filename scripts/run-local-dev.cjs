'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const sourceRoot = path.resolve(__dirname, '..');
const runtimeRoot = 'C:\\Users\\PC\\Documents\\Codex\\2026-08-29\\ca\\work\\windows-runtime';
const postgresData = 'C:\\Users\\PC\\Documents\\Codex\\2026-08-29\\ca\\work\\codex-postgres-data';
const nodeExe = 'C:\\Program Files\\nodejs\\node.exe';
const postgresBin = 'C:\\Program Files\\PostgreSQL\\17\\bin';
const databaseUrl = 'postgresql://postgres@127.0.0.1:55432/slabline_local?schema=public';

const services = {
  web: {
    directories: ['src', 'public'],
    files: [
      'components.json',
      'eslint.config.mjs',
      'next-env.d.ts',
      'next.config.ts',
      'package.json',
      'package-lock.json',
      'postcss.config.mjs',
      'tsconfig.json',
    ],
  },
  api: {
    directories: ['src', 'prisma', 'test'],
    files: [
      'eslint.config.mjs',
      'nest-cli.json',
      'package.json',
      'package-lock.json',
      'railway.json',
      'tsconfig.build.json',
      'tsconfig.json',
    ],
  },
};

function copyInitialSource() {
  for (const [service, config] of Object.entries(services)) {
    const sourceService = path.join(sourceRoot, service);
    const runtimeService = path.join(runtimeRoot, service);

    for (const directory of config.directories) {
      const source = path.join(sourceService, directory);
      const target = path.join(runtimeService, directory);
      if (!fs.existsSync(source)) continue;
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(source, target, { recursive: true });
    }

    for (const file of config.files) {
      const source = path.join(sourceService, file);
      const target = path.join(runtimeService, file);
      if (fs.existsSync(source)) fs.copyFileSync(source, target);
    }
  }
}

function isExcluded(relativePath) {
  const segments = relativePath.split(/[\\/]/).filter(Boolean);
  return segments.some((segment) => [
    'node_modules',
    'node_modules-linux-backup',
    '.next',
    '.next-linux-backup',
    'dist',
    '.git',
  ].includes(segment));
}

function watchSource(service) {
  const sourceService = path.join(sourceRoot, service);
  const runtimeService = path.join(runtimeRoot, service);

  return fs.watch(sourceService, { recursive: true }, (_eventType, fileName) => {
    if (!fileName) return;
    const relative = String(fileName);
    if (isExcluded(relative)) return;

    const source = path.resolve(sourceService, relative);
    const target = path.resolve(runtimeService, relative);
    if (!target.startsWith(runtimeService + path.sep)) return;

    try {
      if (!fs.existsSync(source)) {
        fs.rmSync(target, { recursive: true, force: true });
      } else if (fs.statSync(source).isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      }
      console.log(`[sync] ${service}/${relative}`);
    } catch (error) {
      console.error(`[sync] Could not update ${service}/${relative}:`, error.message);
    }
  });
}

function databaseReady() {
  const result = spawnSync(path.join(postgresBin, 'pg_isready.exe'), [
    '-h', '127.0.0.1', '-p', '55432',
  ], { stdio: 'ignore', windowsHide: true });
  return result.status === 0;
}

async function startDatabase() {
  if (databaseReady()) return;

  const logDir = path.join(runtimeRoot, 'logs-vscode');
  fs.mkdirSync(logDir, { recursive: true });
  const stdout = fs.openSync(path.join(logDir, 'postgres.stdout.log'), 'a');
  const stderr = fs.openSync(path.join(logDir, 'postgres.stderr.log'), 'a');
  const database = spawn(path.join(postgresBin, 'postgres.exe'), [
    '-D', postgresData,
    '-h', '127.0.0.1',
    '-p', '55432',
  ], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', stdout, stderr],
  });
  database.unref();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (databaseReady()) return;
  }
  throw new Error('Local PostgreSQL did not become ready. Check logs-vscode/postgres.stderr.log.');
}

async function ensureLocalAdmin(apiEnvironment) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = apiEnvironment.DATABASE_URL;
  const { PrismaClient, UserStatus } = require(path.join(runtimeRoot, 'api', 'node_modules', '@prisma', 'client'));
  const argon2 = require(path.join(runtimeRoot, 'api', 'node_modules', 'argon2'));
  const prisma = new PrismaClient();

  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
    const passwordHash = await argon2.hash('Slab!1E7qPAFrEVh39a', { type: argon2.argon2id });
    await prisma.user.upsert({
      where: { email: 'local.admin@slabline.test' },
      update: { passwordHash, fullName: 'Local Administrator', status: UserStatus.ACTIVE, roleId: role.id },
      create: {
        email: 'local.admin@slabline.test',
        passwordHash,
        fullName: 'Local Administrator',
        status: UserStatus.ACTIVE,
        roleId: role.id,
      },
    });
  } finally {
    await prisma.$disconnect();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  try {
    child.kill();
  } catch {}
}

async function main() {
  if (!fs.existsSync(runtimeRoot)) {
    throw new Error(`Windows runtime is missing: ${runtimeRoot}`);
  }
  if (!fs.existsSync(postgresData)) {
    throw new Error(`Local PostgreSQL data is missing: ${postgresData}`);
  }

  copyInitialSource();
  const watchers = Object.keys(services).map(watchSource);
  await startDatabase();

  const apiEnvironment = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('hex'),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_SECRET: crypto.randomBytes(48).toString('hex'),
    JWT_REFRESH_TTL_DAYS: '30',
    COOKIE_SECRET: crypto.randomBytes(48).toString('hex'),
    CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    NODE_ENV: 'development',
    PORT: '4000',
  };
  const webEnvironment = {
    ...process.env,
    NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000/api',
    NODE_ENV: 'development',
    PORT: '3000',
  };

  await ensureLocalAdmin(apiEnvironment);

  const api = spawn(nodeExe, [
    path.join(runtimeRoot, 'api', 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js'),
    'start',
    '--watch',
  ], {
    cwd: path.join(runtimeRoot, 'api'),
    env: apiEnvironment,
    stdio: 'inherit',
    windowsHide: true,
  });
  const web = spawn(nodeExe, [
    path.join(runtimeRoot, 'web', 'node_modules', 'next', 'dist', 'bin', 'next'),
    'dev',
    '-p', '3000',
    '-H', '127.0.0.1',
  ], {
    cwd: path.join(runtimeRoot, 'web'),
    env: webEnvironment,
    stdio: 'inherit',
    windowsHide: true,
  });

  console.log('\nSlabline local development is starting...');
  console.log('App:      http://127.0.0.1:3000/login');
  console.log('Email:    local.admin@slabline.test');
  console.log('Password: Slab!1E7qPAFrEVh39a');
  console.log('Press Ctrl+C to stop the web and API development servers.\n');

  const shutdown = () => {
    for (const watcher of watchers) watcher.close();
    stopChild(api);
    stopChild(web);
    setTimeout(() => process.exit(0), 500);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  api.once('exit', (code) => {
    if (code && code !== 0) console.error(`API exited with code ${code}`);
  });
  web.once('exit', (code) => {
    if (code && code !== 0) console.error(`Web app exited with code ${code}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
