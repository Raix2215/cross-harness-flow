import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { createFixture, eventually } from './fake-herdr.mjs';

const execFile = promisify(execFileCallback);
const question = 'User question: Which implementation should we use?\nChoose one option: A or B.\nSCREEN_QUESTION_SENTINEL\n';
const permission = 'Permission required\nAllow this command? [y/N]\n';
const worker = (index) => `w1:p${10 + index}`;
const timeout = 45_000;

function checked(result, codes = [0]) {
  assert.ok(codes.includes(result.code), `exit=${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.ok(result.json && typeof result.json === 'object', `Expected JSON, got: ${result.stdout}`);
  return result.json;
}

async function command(fx, args, options) {
  return checked(await fx.cli(args, options));
}

async function send(fx, pane, brief, extra = []) {
  const result = await command(fx, ['send', pane, '--brief', brief, '--watch', ...extra]);
  assert.equal(typeof result.task, 'string');
  return result.task;
}

const inspect = (fx, task) => command(fx, ['inspect', task]);
const listAll = (fx) => command(fx, ['list', '--all']);
const pending = (item) => item.state === 'queued' || item.state === 'pending_unreachable';
const queued = (items, task, type) => items.find((item) => item.task === task && item.type === type && pending(item));
const promptsTo = (fx, pane) => fx.herdr.prompts.filter((prompt) => prompt.pane === pane);

async function reply(fx, pane, task, args = ['--ok']) {
  const { attempt } = await inspect(fx, task);
  return checked(await fx.cli(['reply', task, '--attempt', attempt, ...args], { pane }), [0]);
}

function waitPrompt(fx, pane, predicate, message) {
  return eventually(() => promptsTo(fx, pane).find((prompt) => prompt.completedAt && predicate(prompt.text)), { message });
}

async function waitQueue(fx, task, kind) {
  return eventually(async () => queued((await listAll(fx)).queue, task, kind), { message: `No queued ${kind} for ${task}` });
}

async function getDiag(fx, task, expected) {
  const { brief } = await inspect(fx, task);
  const dir = dirname(brief);
  const files = (await readdir(dir)).filter((path) => /^diag-.*-blocked\.txt$/.test(path));
  assert.equal(files.length, 1);
  const path = join(dir, files[0]);
  assert.equal((await readFile(path, 'utf8')).trimEnd(), expected.trimEnd());
  return path;
}

function assertEnvelope(text, { task, from, to, scope, status, path }) {
  assert.ok(text.split('\n').length >= 3 && text.split('\n').length <= 5, text);
  assert.match(text, /^\[chflow\] task=/);
  assert.ok(text.includes(`task=${task}#1`), text);
  assert.match(text, new RegExp(`\\bfrom=[^\\s]+\\(${from}\\)`));
  assert.match(text, new RegExp(`\\bto=[^\\s]+\\(${to}\\)`));
  assert.ok(text.includes(`scope=${scope}`), text);
  assert.ok(text.includes(`status=${status}`), text);
  assert.ok(text.includes(path), text);
  assert.match(text, /^action: .+/m);
  assert.doesNotMatch(text, /CROSS_HARNESS_MSG|\{\s*"(?:schema|role|content)"|SCREEN_[A-Z_]+/);
}

test('E2E-01 daemon lazy start, singleton, idle exit and crash recovery', { timeout }, async (t) => {
  const fx = await createFixture(t, { env: { CHFLOW_IDLE_TIMEOUT_SEC: '2' } });
  const socket = join(fx.stateDir, 'daemon.sock');
  const daemonStatus = async () => (await fx.cli(['daemon', 'status'])).json;
  assert.equal((await daemonStatus())?.data?.pid ?? null, null);
  await assert.rejects(access(socket), { code: 'ENOENT' });

  const pids = await Promise.all(Array.from({ length: 5 }, async (_, index) => {
    await command(fx, ['start', `parallel-${index}`, '--kind', 'pi']);
    const pid = (await daemonStatus())?.data?.pid;
    assert.ok(Number.isInteger(pid) && pid > 0);
    return pid;
  }));
  assert.equal(new Set(pids).size, 1);
  await access(socket);
  await eventually(async () => {
    try { await access(socket); return false; }
    catch (error) { assert.equal(error.code, 'ENOENT'); return true; }
  }, { message: 'Daemon did not remove the idle socket' });
  assert.equal((await daemonStatus())?.data?.pid ?? null, null);

  fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
  fx.herdr.addAgent(worker(1));
  fx.herdr.addAgent(worker(2));
  const active = await send(fx, worker(1), 'Retain this active watch after a crash.');
  const done = await send(fx, worker(2), 'Retain this queued result after a crash.');
  await reply(fx, worker(2), done, ['--ok', '--note', 'Queued before crash']);
  const before = await waitQueue(fx, done, 'result');
  assert.equal(typeof before.event_id, 'string');
  const activeBefore = await inspect(fx, active);
  const oldPid = (await daemonStatus())?.data?.pid;
  assert.ok(Number.isInteger(oldPid) && oldPid > 0);
  assert.equal(promptsTo(fx, fx.caller).length, 0);
  process.kill(oldPid, 'SIGKILL');

  const activeAfter = await inspect(fx, active);
  const newPid = (await daemonStatus())?.data?.pid;
  assert.ok(Number.isInteger(newPid) && newPid > 0);
  assert.notEqual(newPid, oldPid);
  assert.equal(activeAfter.attempt, activeBefore.attempt);
  assert.equal(activeAfter.state, activeBefore.state);
  const after = await waitQueue(fx, done, 'result');
  assert.equal(after.event_id, before.event_id);
  assert.equal(after.state, before.state);

  fx.herdr.setAgent(worker(1), { agent_status: 'blocked', screen: question });
  await waitQueue(fx, active, 'blocked');
  assert.ok(fx.herdr.reads.some(({ pane }) => pane === worker(1)));
  fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
  await waitPrompt(fx, fx.caller, (text) => text.includes(done) && text.includes('status=succeeded'),
    'Restored queued result was not delivered');
});

test('E2E-02 workspace and worktree mailbox, Git exclude, fallback and readonly reply', { timeout }, async (t) => {
  const fx = await createFixture(t);
  const worktree = join(fx.root, 'linked-worktree');
  const git = async (cwd, ...args) => (await execFile('git', ['-C', cwd, ...args], { env: fx.env })).stdout.trim();
  await git(fx.workspace, 'init', '-q');
  await writeFile(join(fx.workspace, '.gitignore'), '*.local\n');
  await git(fx.workspace, 'add', '.gitignore');
  await git(fx.workspace, '-c', 'user.name=Chflow E2E', '-c', 'user.email=chflow@invalid', 'commit', '-qm', 'fixture');
  await git(fx.workspace, 'worktree', 'add', '-q', '--detach', worktree, 'HEAD');
  fx.herdr.addAgent(worker(1));
  fx.herdr.addAgent(worker(2), { cwd: worktree });
  fx.herdr.addAgent(worker(3), { cwd: join(fx.root, 'missing-workspace') });

  for (const [index, cwd] of [fx.workspace, worktree].entries()) {
    const pane = worker(index + 1);
    const content = `Readonly audit ${index}\n\nKeep this detail in the mailbox.`;
    const task = await send(fx, pane, content, ['--perm', 'readonly']);
    const info = await inspect(fx, task);
    const mail = join(cwd, '.chflow', 'tasks', task);
    assert.equal(info.brief, join(mail, 't1-brief.md'));
    assert.equal(info.out, join(mail, 't1-reply.md'));
    assert.ok((await readFile(info.brief, 'utf8')).includes(content));
    const output = `Audit ${index}: detail submitted through the readonly reply CLI.`;
    await reply(fx, pane, task, ['--ok', '--body', output]);
    assert.equal((await readFile(info.out, 'utf8')).trimEnd(), output);
    assert.equal(await git(cwd, 'status', '--porcelain'), '');
  }

  const exclude = await git(fx.workspace, 'rev-parse', '--path-format=absolute', '--git-path', 'info/exclude');
  assert.equal(await git(worktree, 'rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'), exclude);
  assert.equal((await readFile(exclude, 'utf8')).split(/\r?\n/).filter((line) => line === '.chflow/').length, 1);
  const fallback = await send(fx, worker(3), 'Use the state-directory fallback.');
  const info = await inspect(fx, fallback);
  assert.equal(info.brief, join(fx.stateDir, 'mail', 'tasks', fallback, 't1-brief.md'));
  assert.ok((await readFile(info.brief, 'utf8')).includes('Use the state-directory fallback.'));
});

test('E2E-03 minimal dispatch and result prompts expose file references only', { timeout }, async (t) => {
  const fx = await createFixture(t);
  const pane = worker(1);
  fx.herdr.addAgent(pane, { name: 'reviewer', screen: 'SCREEN_NORMAL_SENTINEL\n' });
  const brief = '{"schema":"CROSS_HARNESS_MSG","content":"FULL_BRIEF_SENTINEL"}\n'.repeat(15);
  const body = 'FULL_RESULT_SENTINEL\n'.repeat(20);
  const task = await send(fx, pane, brief, ['--perm', 'readonly']);
  const info = await inspect(fx, task);
  const dispatch = await waitPrompt(fx, pane, (text) => text.includes(task), 'Missing dispatch prompt');
  assertEnvelope(dispatch.text, { task, from: fx.caller, to: pane, scope: 'readonly', status: 'assigned', path: `brief=${info.brief}` });
  assert.ok(dispatch.text.includes(`out=${info.out}`));
  assert.ok(dispatch.text.includes(`chflow reply ${task} --attempt`));
  assert.doesNotMatch(dispatch.text, /FULL_BRIEF_SENTINEL/);
  assert.ok((await readFile(info.brief, 'utf8')).includes(brief.trimEnd()));

  await reply(fx, pane, task, ['--ok', '--note', 'Review complete', '--body', body]);
  const wake = await waitPrompt(fx, fx.caller, (text) => text.includes(task), 'Missing result prompt');
  assertEnvelope(wake.text, { task, from: pane, to: fx.caller, scope: 'readonly', status: 'succeeded', path: `out=${info.out}` });
  assert.ok(wake.text.includes('note=Review complete'));
  assert.ok(wake.text.includes(`chflow finish ${task} --ok`));
  assert.doesNotMatch(wake.text, /FULL_RESULT_SENTINEL/);
  assert.equal((await readFile(info.out, 'utf8')).trimEnd(), body.trimEnd());
});

test('E2E-04 bounded stall probes, one screen read per block and explicit inspect', { timeout }, async (t) => {
  const fx = await createFixture(t, { env: { CHFLOW_STALL_MS: '160', CHFLOW_STALL_CONFIRM_MS: '100' } });
  const normal = worker(1);
  const blocked = worker(2);
  fx.herdr.addAgent(normal, { screen: 'SCREEN_NORMAL_SENTINEL\n' });
  fx.herdr.addAgent(blocked);
  const task = await send(fx, normal, 'Work until a stalled event, then reply.');
  await waitPrompt(fx, fx.caller, (text) => text.includes(task) && text.includes('status=stalled'), 'Missing stalled event');
  assert.equal(fx.herdr.reads.length, 2);
  for (const read of fx.herdr.reads) assert.deepEqual(read.params, [normal, '--source', 'visible', '--lines', '20']);
  fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
  await reply(fx, normal, task, ['--ok', '--body', 'Normal result']);
  await waitPrompt(fx, fx.caller, (text) => text.includes(task) && text.includes('status=succeeded'), 'Missing normal result');
  assert.equal(fx.herdr.reads.length, 2);

  fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
  const blockedTask = await send(fx, blocked, 'Wait for a simulated blocked state.');
  fx.herdr.setAgent(blocked, { agent_status: 'blocked', screen: question });
  const wake = await waitPrompt(fx, fx.caller, (text) => text.includes(blockedTask) && text.includes('status=blocked'), 'Missing blocked event');
  const diag = await getDiag(fx, blockedTask, question);
  assertEnvelope(wake.text, { task: blockedTask, from: blocked, to: fx.caller, scope: 'ask', status: 'blocked', path: `diag=${diag}` });
  assert.equal(fx.herdr.reads.length, 3);
  assert.deepEqual(fx.herdr.reads[2].params, [blocked, '--source', 'visible', '--lines', '40']);
  const state = await command(fx, ['inspect', blockedTask, '--screen', '--lines', '7']);
  assert.ok(JSON.stringify(state).includes('SCREEN_QUESTION_SENTINEL'));
  assert.equal(fx.herdr.reads.length, 4);
  assert.deepEqual(fx.herdr.reads[3].params, [blocked, '--source', 'visible', '--lines', '7']);
});

const nativeFlags = {
  codex: {
    readonly: ['-s', 'read-only'], ask: [], auto: ['--approve-for-me'], 'auto-workspace': ['-a', 'never', '-s', 'workspace-write'], yolo: ['--dangerously-bypass-approvals-and-sandbox'],
  },
  claude: {
    readonly: ['--permission-mode', 'plan'], ask: [], auto: ['--permission-mode', 'auto'], 'auto-workspace': ['--permission-mode', 'acceptEdits'], yolo: ['--dangerously-skip-permissions'],
  },
  pi: {
    readonly: ['--no-mcp', '--tools', 'read,grep,find,ls'], ask: [], auto: [], 'auto-workspace': [], yolo: [],
  },
  agy: {
    readonly: ['--mode', 'plan'], ask: [], auto: ['--mode', 'auto'], 'auto-workspace': ['--mode', 'accept-edits'], yolo: ['--dangerously-skip-permissions'],
  },
};

function assertNativeFlags(argv, modes, expected) {
  const options = new Set(Object.values(modes).flat().filter((part) => part.startsWith('-')));
  assert.deepEqual(argv.filter((part) => options.has(part)).sort(), expected.filter((part) => options.has(part)).sort());
  for (const [index, part] of expected.entries()) {
    if (options.has(part) && expected[index + 1] && !options.has(expected[index + 1])) {
      assert.equal(argv[argv.indexOf(part) + 1], expected[index + 1], `native argv: ${JSON.stringify(argv)}`);
    }
  }
}

test('E2E-05 native permission translation, readonly conflicts, and agy restrictions', { timeout }, async (t) => {
  const fx = await createFixture(t, { env: {
    CHFLOW_DEFAULT_RETRY_BACKOFF: '0.1,0.2,0.4,0.8', CHFLOW_SETTLE_MS: '180',
  } });
  for (const [kind, modes] of Object.entries(nativeFlags)) {
    for (const [mode, flags] of Object.entries(modes)) {
      const alias = `${kind}-${mode}`;
      const attended = kind === 'agy' ? ['--attended'] : [];
      await command(fx, ['start', alias, '--kind', kind, '--perm', mode, ...attended]);
      const started = fx.herdr.starts.find(({ name }) => name === alias);
      assert.equal(started?.kind, kind, alias);
      assertNativeFlags(started.extra, modes, flags);
    }
  }

  async function rejected(args) {
    const starts = fx.herdr.starts.length;
    const prompts = fx.herdr.prompts.length;
    const result = await fx.cli(args);
    const json = checked(result, [1, 64]);
    assert.ok(json.error, result.stdout);
    assert.equal(fx.herdr.starts.length, starts);
    assert.equal(fx.herdr.prompts.length, prompts);
    return result;
  }
  await rejected(['start', 'agy-auto-unattended', '--kind', 'agy', '--perm', 'auto']);
  const marker = 'CHFLOW_TEST_PRIVATE_ARG_VALUE';
  const conflict = await rejected(['start', 'forbidden', '--kind', 'codex', '--perm', 'readonly', '--', `--dangerously-bypass-approvals-and-sandbox=${marker}`]);
  assert.ok(!`${conflict.stdout}${conflict.stderr}`.includes(marker));
  await rejected(['start', 'conflicting', '--kind', 'pi', '--readonly', '--perm', 'yolo']);

  fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
  const agy = fx.herdr.starts.find(({ name }) => name === 'agy-ask').pane;
  const task = await send(fx, agy, 'Attended only.', ['--attended']);
  for (const denied of ['--unattended', '--bg']) {
    await rejected(['start', `agy-denied-${denied.slice(2)}`, '--kind', 'agy', '--attended', denied]);
    await rejected(['switch', agy, '--restart', '--attended', denied]);
    await rejected(['send', agy, '--brief', 'Denied', '--attended', denied]);
    await rejected(['run', '--kind', 'agy', '--brief', 'Denied', denied]);
    await rejected(['retry', task, '--attended', denied]);
  }
  await rejected(['run', '--kind', 'agy', '--brief', 'Denied', '--attended']);
  await rejected(['retry', task, '--after', '1s']);
  await rejected(['retry', task, '--attended']);
  const pi = fx.herdr.starts.find(({ name }) => name === 'pi-ask').pane;
  await rejected(['send', pi, '--brief', 'Denied fallback', '--fallback', 'agy:fake-model']);
  await rejected(['retry', task, '--switch', 'agy:fake-model']);

  const attempts = fx.herdr.prompts.length;
  const initial = await inspect(fx, task);
  fx.herdr.setAgent(agy, { agent_status: 'done' });
  await eventually(async () => {
    const info = await inspect(fx, task);
    return info.reason === 'settled_no_reply' || info.reason === 'interrupted' || info.state === 'interrupted';
  }, { message: 'Missing the interruption after the attended agy session stopped' });
  await sleep(700);
  const current = await inspect(fx, task);
  assert.equal(current.attempt, initial.attempt);
  assert.notEqual(current.state, 'retrying');
  assert.equal(fx.herdr.prompts.length, attempts);
  assert.equal((await listAll(fx)).scheduled_retries.length, 0);
});

test('E2E-06 auto-approves reused panes while preserving control-plane prompt safety', { timeout }, async (t) => {
  const fx = await createFixture(t);
  for (const [index, mode] of ['auto-workspace', 'yolo'].entries()) {
    const pane = worker(index + 1);
    fx.herdr.addAgent(pane, { agent: index === 0 ? 'codex' : 'claude' });
    const task = await send(fx, pane, `Exercise ${mode} on an existing pane.`, ['--perm', mode]);
    fx.herdr.setAgent(pane, { agent_status: 'blocked', screen: `${permission}git status --short\n` });
    const press = await eventually(() => fx.herdr.keys.find((key) => key.pane === pane), { message: `${mode} did not send a confirmation key` });
    assert.ok(press.keys.some((key) => /^(enter|y)$/i.test(key)), JSON.stringify(press));
    const readIndex = fx.herdr.requests.findIndex((request) => request.pane === pane && request.method === 'agent.read');
    const pressIndex = fx.herdr.requests.findIndex((request) => request.pane === pane && request.method === 'agent.send-keys');
    assert.ok(readIndex >= 0 && pressIndex > readIndex);
    assert.ok(fx.herdr.requests.slice(readIndex + 1, pressIndex).some((request) => request.pane === pane && request.method === 'agent.get'));
    await eventually(async () => {
      const { audit } = await inspect(fx, task);
      return audit.find((event) => event.event === 'auto_approved');
    }, { message: `Missing auto_approved audit when scope=${mode}` });
    assert.equal(fx.herdr.agents.get(pane).agent_status, 'working');
    assert.equal(fx.herdr.keys.filter((key) => key.pane === pane).length, 1);
  }

  const denied = [
    { mode: 'auto-workspace', screen: question, status: 'blocked(question)', reason: 'user_question' },
    { mode: 'yolo', screen: question, status: 'blocked(question)', reason: 'user_question' },
    { mode: 'auto-workspace', screen: 'Custom unrecognized tool banner\nSCREEN_UNKNOWN_SENTINEL\n', status: 'blocked(unknown)', reason: 'unknown_prompt' },
    { mode: 'auto-workspace', screen: 'Permission required\n❯ 1. Deny', status: 'blocked(permission)', reason: 'approval_required' },
  ];
  for (const [index, { mode, screen, status, reason }] of denied.entries()) {
    const pane = worker(index + 3);
    fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
    fx.herdr.addAgent(pane, { agent: 'codex' });
    const task = await send(fx, pane, reason, ['--perm', mode]);
    fx.herdr.setAgent(pane, { agent_status: 'blocked', screen });
    const wake = await waitPrompt(fx, fx.caller, (text) => text.includes(task) && text.includes(`status=${status}`), `Missing ${reason} wake for ${mode}`);
    const diag = await getDiag(fx, task, screen);
    assertEnvelope(wake.text, { task, from: pane, to: fx.caller, scope: mode, status, path: `diag=${diag}` });
    assert.ok(wake.text.includes(`reason=${reason}`), wake.text);
    assert.equal(fx.herdr.keys.filter((key) => key.pane === pane).length, 0);
    assert.equal(fx.herdr.reads.filter((read) => read.pane === pane).length, 1);
  }
});

test('E2E-07 manually cleared block is silently superseded and respond sends no key', { timeout }, async (t) => {
  const fx = await createFixture(t);
  const pane = worker(1);
  fx.herdr.addAgent(pane);
  fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
  const task = await send(fx, pane, 'Simulate a user clearing this blocked worker.');
  fx.herdr.setAgent(pane, { agent_status: 'blocked', screen: question });
  await waitQueue(fx, task, 'blocked');
  assert.equal(promptsTo(fx, fx.caller).length, 0);

  fx.herdr.setAgent(pane, { agent_status: 'working' });
  const responded = await command(fx, ['respond', task, '--expect-visible', 'Which implementation', '--key', 'enter']);
  assert.equal(responded.already_unblocked, true);
  assert.equal(responded.reason, 'already_unblocked_by_human');
  fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
  await eventually(async () => (await listAll(fx)).queue.find((item) =>
    item.task === task && item.type === 'blocked' && item.state === 'superseded_by_human_unblock'), {
    message: 'The stale blocked wake was not marked superseded_by_human_unblock',
  });

  await reply(fx, pane, task, ['--ok', '--body', 'Done after the manual unblock.']);
  await waitPrompt(fx, fx.caller, (text) => text.includes(task) && text.includes('status=succeeded'), 'Missing result after unblock');
  assert.equal(promptsTo(fx, fx.caller).length, 1);
  assert.doesNotMatch(promptsTo(fx, fx.caller)[0].text, /status=blocked/);
  assert.equal(fx.herdr.keys.length, 0);
});

test('E2E-08 superseding and debounce send one serialized batch per reply burst', { timeout }, async (t) => {
  const debounce = 300;
  const fx = await createFixture(t, { env: { CHFLOW_DEBOUNCE_MS: String(debounce) }, promptDelayMs: 160 });
  const seed = async (start) => Promise.all(Array.from({ length: 3 }, (_, offset) => {
    const pane = worker(start + offset);
    fx.herdr.addAgent(pane);
    return send(fx, pane, `Parallel task ${pane}`).then((task) => ({ pane, task }));
  }));
  const resultArgs = ['--ok', '--body', 'Final result'];
  function assertBatch(batch, tasks) {
    assert.match(batch.text, /^\[chflow:batch\] count=3 /);
    const rows = batch.text.split('\n').filter((line) => line.startsWith('- '));
    assert.equal(rows.length, 3);
    for (const task of tasks) {
      assert.equal(rows.filter((line) => line.startsWith(`- ${task}#1 `) && line.includes('status=succeeded')).length, 1, batch.text);
    }
    assert.doesNotMatch(batch.text, /status=(progress|blocked)|SCREEN_/);
  }

  fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
  const jobs = await seed(1);
  const [first] = jobs;
  await reply(fx, first.pane, first.task, ['--progress', '--note', 'old progress']);
  await waitQueue(fx, first.task, 'progress');
  fx.herdr.setAgent(first.pane, { agent_status: 'blocked', screen: question });
  await waitQueue(fx, first.task, 'blocked');
  assert.deepEqual((await listAll(fx)).queue.filter((item) => item.task === first.task && pending(item)).map((item) => item.type), ['blocked']);
  await Promise.all(jobs.map(({ pane, task }) => reply(fx, pane, task, resultArgs)));
  const after = (await listAll(fx)).queue;
  assert.deepEqual(after.filter((item) => item.task === first.task && pending(item)).map((item) => item.type), ['result']);
  for (const type of ['progress', 'blocked']) {
    assert.ok(after.some((item) => item.task === first.task && item.type === type && item.state.startsWith('superseded_')));
  }
  assert.equal(promptsTo(fx, fx.caller).length, 0);
  fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
  const firstBatch = await waitPrompt(fx, fx.caller, () => true, 'Missing batch accumulated while the caller was working');
  assertBatch(firstBatch, jobs.map(({ task }) => task));

  const idleJobs = await seed(4);
  fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
  const early = idleJobs[0];
  const before = Date.now();
  const earlyReply = reply(fx, early.pane, early.task, resultArgs);
  await sleep(50);
  const laterReplies = idleJobs.slice(1).map(({ pane, task }) => reply(fx, pane, task, resultArgs));
  await Promise.all([earlyReply, ...laterReplies]);
  const secondBatch = await waitPrompt(fx, fx.caller, (text) => text.includes(early.task), 'Missing batch within the idle debounce window');
  assertBatch(secondBatch, idleJobs.map(({ task }) => task));
  assert.ok(secondBatch.at - before >= debounce, 'Idle recipient was prompted before the debounce window elapsed');
  assert.ok(firstBatch.completedAt <= secondBatch.at);
  await sleep(debounce + 180);
  assert.equal(promptsTo(fx, fx.caller).length, 2);
  const history = (await listAll(fx)).queue;
  for (const { task } of [...jobs, ...idleJobs]) {
    assert.equal(history.filter((item) => item.task === task && item.type === 'result' && item.state === 'delivered').length, 1);
  }
});
