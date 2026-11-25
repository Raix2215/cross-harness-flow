import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const packageDir = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
const runNpm = (args, options) => npm ? execFile(process.execPath, [npm, ...args], options) : execFile('npm', args, options);

export async function installPack(root, env) {
  const prefix = join(root, 'prefix'), cache = join(root, 'npm-cache');
  const npmEnv = { ...env, npm_config_offline: 'true', npm_config_cache: cache,
    npm_config_userconfig: join(root, 'blank-npmrc'), npm_config_registry: 'http://127.0.0.1:1/' };
  const run = (args, cwd) => runNpm(args, { cwd, env: npmEnv, timeout: 15_000 });
  const { stdout } = await run(['pack', '--json', '--ignore-scripts', '--pack-destination', root], packageDir);
  const result = JSON.parse(stdout);
  const packed = Array.isArray(result) ? result[0] : result.chflow;
  assert.equal(packed.filename, 'chflow-3.6.1.tgz');
  assert.ok(packed.files.some(({ path }) => path === 'dist/cli.js'));
  assert.ok(packed.files.some(({ path }) => path === 'LICENSE'));
  assert.ok(packed.files.every(({ path }) => /^(?:dist\/.+\.js|README\.md|LICENSE|package\.json)$/.test(path)));
  assert.deepEqual(packed.bundled ?? [], []);
  await run(['install', '-g', '--prefix', prefix, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', join(root, packed.filename)], root);
  const modules = join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules');
  assert.deepEqual((await readdir(modules)).filter((name) => !name.startsWith('.')), ['chflow']);
  const manifest = JSON.parse(await readFile(join(modules, 'chflow/package.json'), 'utf8'));
  assert.equal(manifest.license, 'MIT');
  assert.equal(await readFile(join(modules, 'chflow/LICENSE'), 'utf8'), await readFile(join(packageDir, 'LICENSE'), 'utf8'));
  assert.deepEqual(manifest.dependencies, {});
  return process.platform === 'win32' ? join(prefix, 'chflow.cmd') : join(prefix, 'bin/chflow');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = await mkdtemp(join(tmpdir(), 'chflow-pack-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(?:HERDR_|CHFLOW_)/.test(k)));
  Object.assign(env, { HOME: root, CHFLOW_STATE_DIR: join(root, 'state'), XDG_CONFIG_HOME: root });
  try {
    const executable = await installPack(root, env);
    const { stdout } = await execFile(executable, ['--version'], { env, shell: process.platform === 'win32' });
    assert.equal(stdout.trim(), '3.6.1');
    process.stdout.write('npm pack and isolated offline global install passed\n');
  } finally { await rm(root, { recursive: true, force: true }); }
}
