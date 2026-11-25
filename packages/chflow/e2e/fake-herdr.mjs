import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

const herdrExecutable = `#!/usr/bin/env node
const net = require('node:net');
const socket = net.createConnection(process.env.CHFLOW_FAKE_HERDR_SOCKET, () => {
  socket.write(JSON.stringify(process.argv.slice(2)) + '\\n');
});
let data = '';
socket.setEncoding('utf8');
socket.on('data', chunk => {
  data += chunk;
  const newline = data.indexOf('\\n');
  if (newline < 0) return;
  const { code, stdout, stderr } = JSON.parse(data.slice(0, newline));
  process.exitCode = code;
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  socket.end();
});
socket.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
`;

export async function eventually(check, {
  timeoutMs = 8_000, intervalMs = 30, message = 'condition did not become true',
} = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await check();
    if (result) return result;
    await sleep(intervalMs);
  } while (Date.now() < deadline);
  throw new Error(message);
}

function run(executable, args, { cwd, env, stdin }) {
  return new Promise((resolve) => {
    const child = execFile(executable, args, { cwd, env, timeout: 15_000 }, (err, stdout, stderr) => {
      let json;
      try { json = JSON.parse(stdout); } catch { /* Raw or empty stdout. */ }
      resolve({ code: err?.code ?? 0, signal: err?.signal ?? null, stdout, stderr, json });
    });
    child.stdin.end(stdin);
  });
}

const ok = (id, result) => ({ code: 0, stdout: `${JSON.stringify({ id, result })}\n` });
const errorResult = (code, message) => ({
  code: 1,
  stderr: `${JSON.stringify({ error: { code, message } })}\n`,
});
function option(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function agentResult({ screen, unblockOnKey, promptStatus, paneFocusOnly, ...agent }) {
  if (paneFocusOnly) delete agent.focused;
  return agent;
}

function fakeHerdr(workspace, socketPath, promptDelayMs) {
  const agents = new Map();
  const panes = new Map();
  const workspaces = new Map([['w1', { workspace_id: 'w1', label: 'WORK' }]]);
  const tabs = new Map([['w1:t1', { tab_id: 'w1:t1', workspace_id: 'w1', label: 'main' }]]);
  const failures = new Map();
  const clients = new Set();
  const requests = [];
  const prompts = [];
  const keys = [];
  const reads = [];
  const starts = [];
  const focuses = [];
  const notifications = [];
  let nextPane = 100;

  function setWorkspace(id, label) {
    workspaces.set(id, { workspace_id: id, label });
  }
  function setTab(id, workspace_id, label) {
    tabs.set(id, { tab_id: id, workspace_id, label });
  }

  function addAgent(pane, overrides = {}) {
    const agent = {
      name: pane,
      agent: 'pi',
      pane_id: pane,
      terminal_id: `t-${pane}`,
      cwd: panes.get(pane)?.cwd ?? workspace,
      agent_status: 'idle',
      state_change_seq: 1,
      revision: 1,
      focused: false,
      agent_session: { kind: 'path', value: join(workspace, `session-${pane.replaceAll(':', '-')}.jsonl`) },
      screen: '',
      unblockOnKey: true,
      promptStatus: 'working',
      ...overrides,
    };
    agents.set(pane, agent);
    panes.set(pane, paneResult(agent));
    return agent;
  }

  function paneResult({ pane_id, terminal_id, cwd, focused, revision, agent_status }) {
    return { pane_id, terminal_id, cwd, focused, revision, agent_status };
  }

  function setAgent(pane, patch) {
    const current = agents.get(pane);
    const changed = patch.agent_status !== undefined && patch.agent_status !== current.agent_status;
    Object.assign(current, {
      state_change_seq: current.state_change_seq + Number(changed),
      revision: current.revision + 1,
      ...patch,
    });
    panes.set(pane, paneResult(current));
    return current;
  }

  function removeAgent(pane) {
    agents.delete(pane);
    panes.delete(pane);
  }

  function failNext(method, error) {
    const failuresForMethod = failures.get(method) ?? [];
    failuresForMethod.push(typeof error === 'string' ? { code: error } : error);
    failures.set(method, failuresForMethod);
  }

  function newPane(args) {
    const parent = option(args, '--pane');
    const pane_id = `w1:p${++nextPane}`;
    const pane = { pane_id, terminal_id: `t-${pane_id}`, cwd: option(args, '--cwd') ?? panes.get(parent)?.cwd ?? workspace, focused: false };
    panes.set(pane_id, pane);
    return pane;
  }

  async function dispatch(argv) {
    const args = [...argv];
    const route = {};
    while (args[0] === '--machine' || args[0] === '--session') {
      route[args.shift().slice(2)] = args.shift();
    }
    const [group, command, ...params] = args;
    const method = command ? `${group}.${command}` : group;
    const target = params[0];
    const found = agents.get(target) ?? [...agents.values()].find((agent) => agent.name === target);
    const pane = method === 'agent.start' ? option(params, '--pane') : found?.pane_id ?? target;
    const at = Date.now();
    const record = { method, pane, route, argv, params, at };
    const id = requests.push(record);
    const failure = failures.get(method)?.shift();
    if (failure) return errorResult(failure.code, failure.message ?? failure.code);

    switch (method) {
      case '--version':
        return { code: 0, stdout: 'herdr 0.9.5\n' };
      case 'agent.list':
        return ok(id, { agents: [...agents.values()].map(agentResult) });
      case 'agent.get':
      case 'agent.wait':
        return found ? ok(id, { agent: agentResult(found) }) : errorResult('pane_not_found', `No agent at ${target}`);
      case 'agent.start': {
        const split = params.indexOf('--');
        const extra = split === -1 ? [] : params.slice(split + 1);
        const kind = option(split === -1 ? params : params.slice(0, split), '--kind');
        starts.push({ ...record, name: target, kind, extra });
        const worker = addAgent(pane, { name: target, agent: kind });
        return ok(id, { agent: agentResult(worker) });
      }
      case 'agent.prompt': {
        if (!found) return errorResult('pane_not_found', `No agent at ${target}`);
        const prompt = { ...record, text: params[1] };
        prompts.push(prompt);
        if (promptDelayMs) await sleep(promptDelayMs);
        if (found.promptStatus) setAgent(pane, { agent_status: found.promptStatus });
        prompt.completedAt = Date.now();
        return ok(id, {});
      }
      case 'agent.read':
        reads.push(record);
        return found ? { code: 0, stdout: found.screen } : errorResult('pane_not_found', `No agent at ${target}`);
      case 'agent.send-keys':
        if (!found) return errorResult('pane_not_found', `No agent at ${target}`);
        keys.push({ ...record, keys: params.slice(1) });
        if (found.unblockOnKey && found.agent_status === 'blocked') setAgent(pane, { agent_status: 'working' });
        return ok(id, {});
      case 'agent.focus':
        if (!found) return errorResult('pane_not_found', `No agent at ${target}`);
        focuses.push({ ...record, pane: found.pane_id });
        for (const a of agents.values()) a.focused = a.pane_id === found.pane_id;
        return ok(id, {});
      case 'workspace.list':
        return ok(id, { workspaces: [...workspaces.values()] });
      case 'tab.list':
        return ok(id, { tabs: [...tabs.values()] });
      case 'pane.get':
        return panes.has(pane) ? ok(id, { pane: panes.get(pane) }) : errorResult('pane_not_found', `No pane at ${target}`);
      case 'pane.split':
        return ok(id, { pane: newPane(params) });
      case 'workspace.create':
      case 'tab.create':
      case 'worktree.create':
        return ok(id, { root_pane: newPane(params) });
      case 'pane.close':
        removeAgent(pane);
        return ok(id, {});
      case 'notification.show':
        notifications.push(record);
        return ok(id, {});
      default:
        return errorResult('invalid_args', `Unsupported Herdr command: ${method}`);
    }
  }

  const server = createServer((socket) => {
    clients.add(socket);
    socket.once('close', () => clients.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setEncoding('utf8');
    let input = '';
    socket.on('data', (chunk) => {
      input += chunk;
      const newline = input.indexOf('\n');
      if (newline < 0) return;
      const argv = JSON.parse(input.slice(0, newline));
      input = input.slice(newline + 1);
      dispatch(argv).then(
        (result) => socket.end(`${JSON.stringify(result)}\n`),
        (error) => socket.end(`${JSON.stringify(errorResult('fixture_error', error.message))}\n`),
      );
    });
  });

  return {
    addAgent, setAgent, removeAgent, setWorkspace, setTab, failNext, agents, workspaces, tabs, requests, prompts, keys, reads, starts, focuses, notifications,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, resolve);
      });
    },
    async close() {
      for (const socket of clients) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function createFixture(t, { env: overrides = {}, promptDelayMs = 0 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'chflow-e2e-'));
  const workspace = join(root, 'workspace');
  const stateDir = join(root, 'state');
  const binDir = join(root, 'bin');
  const home = join(root, 'home');
  const socketPath = join(root, 'herdr.sock');
  const caller = 'w1:p1';
  const otherCaller = 'w1:p2';
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:CHFLOW_|HERDR_|GIT_)/.test(key))),
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    GIT_CONFIG_NOSYSTEM: '1',
    PATH: `${binDir}${delimiter}${process.env.PATH}`,
    CHFLOW_STATE_DIR: stateDir,
    CHFLOW_POLL_MS: '45',
    CHFLOW_DEBOUNCE_MS: '140',
    CHFLOW_STALL_MS: '60000',
    CHFLOW_SETTLE_MS: '500',
    CHFLOW_IDLE_TIMEOUT_SEC: '0',
    CHFLOW_IPC_BACKOFF_MS: '25',
    HERDR_ENV: '1',
    HERDR_PANE_ID: caller,
    HERDR_SOCKET_PATH: socketPath,
    CHFLOW_FAKE_HERDR_SOCKET: socketPath,
    ...overrides,
  };
  const herdr = fakeHerdr(workspace, socketPath, promptDelayMs);

  function cli(args, { env: commandEnv, cwd = workspace, pane = env.HERDR_PANE_ID, stdin } = {}) {
    const separator = args.includes('--') ? args.indexOf('--') : args.length;
    const options = args.slice(0, separator);
    const withJson = options.includes('--json') ? args : [...options, '--json', ...args.slice(separator)];
    return run(process.execPath, [cliPath, ...withJson], {
      cwd, env: { ...env, HERDR_PANE_ID: pane, ...commandEnv }, stdin,
    });
  }

  async function writeExecutable(name, source) {
    const path = join(binDir, name);
    await writeFile(path, source, { mode: 0o755 });
    return path;
  }

  t.after(async () => {
    try { await cli(['daemon', 'stop']); }
    finally {
      await herdr.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  await Promise.all([workspace, binDir, home].map((path) => mkdir(path)));
  await writeExecutable('herdr', herdrExecutable);
  await herdr.listen();
  herdr.addAgent(caller, { name: 'caller' });
  herdr.addAgent(otherCaller, { name: 'other-caller' });

  return { root, workspace, stateDir, binDir, socketPath, env, caller, otherCaller, cliPath, cli, herdr, writeExecutable };
}
