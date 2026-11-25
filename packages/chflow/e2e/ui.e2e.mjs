import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { createFixture, eventually } from './fake-herdr.mjs';

async function command(fx, args, options, accepted = [0]) {
  const result = await fx.cli(args, options);
  assert.ok(accepted.includes(result.code), args.join(' ') + ': ' + result.stdout + result.stderr);
  return result.json;
}

async function startUi(t, fx, args = []) {
  const child = spawn(process.execPath, [fx.cliPath, 'ui', '--port', '0', '--json', ...args], {
    cwd: fx.workspace, env: fx.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise(resolve => lines.once('line', line => resolve(JSON.parse(line))));
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
  });
  const info = await Promise.race([
    ready,
    exited.then(exit => { throw new Error('UI exited before readiness: ' + JSON.stringify(exit) + ' ' + stderr); }),
  ]);
  assert.equal(info.pid, child.pid);
  return { ...info, child, exited };
}

async function events(t, url, headers = {}) {
  const req = request(url + '/api/events', { headers, agent: false });
  let closing = false;
  const close = () => { closing = true; req.destroy(); };
  t.after(close);
  const response = await new Promise((resolve, reject) => {
    req.once('response', resolve);
    req.once('error', reject);
    req.end();
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'text/event-stream; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-cache, no-transform');
  assert.equal(response.headers.connection, 'keep-alive');
  response.setEncoding('utf8');
  const frames = [];
  const shutdowns = [];
  const read = (async () => {
    let buffer = '';
    for await (const chunk of response) {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (frame.startsWith(':')) continue;
        if (frame.startsWith('event: shutdown\n')) {
          const dataLine = frame.split('\n')[1] || 'data: {}';
          shutdowns.push(JSON.parse(dataLine.slice('data: '.length)));
          continue;
        }
        const [id, event, data] = frame.split('\n');
        assert.equal(event, 'event: snapshot');
        const state = JSON.parse(data.slice('data: '.length));
        assert.equal(id, 'id: ' + state.seq);
        assert.ok(!frames.length || state.seq > frames.at(-1).seq, 'SSE sequence must strictly increase');
        frames.push(state);
      }
    }
  })();
  let error;
  void read.catch(e => { if (!closing) error = e; });
  return {
    close, ended: read, shutdowns,
    next: (predicate, message) => eventually(() => {
      if (error) throw error;
      return frames.find(predicate);
    }, { message }),
    nextShutdown: (message = 'SSE did not emit shutdown event') => eventually(() => {
      if (error) throw error;
      return shutdowns[0];
    }, { message }),
  };
}

async function jsonRequest(url, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url + path, { method, headers }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.once('error', reject);
      res.once('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }); }
        catch (e) { reject(e); }
      });
    });
    req.once('error', reject);
    req.setTimeout(8_000, () => req.destroy(new Error('HTTP request timed out: ' + path)));
    req.end(body);
  });
}

async function snapshot(url) {
  const { status, body } = await jsonRequest(url, '/api/snapshot');
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  return body.data;
}

async function taskFile(ui, task, query, code = 200) {
  const { status, body } = await jsonRequest(ui.url, '/api/tasks/' + task + '/file?' + query);
  assert.equal(status, code, JSON.stringify(body));
  assert.equal(body.ok, code === 200);
  return body.data ?? body.error;
}

test('E2E-15 Web UI leases, live SSE updates without read-screen, and bounded mailbox reads', { timeout: 35_000 }, async t => {
  const fx = await createFixture(t, { env: { CHFLOW_IDLE_TIMEOUT_SEC: '2' } });
  const rejected = await command(fx, ['ui', '--host', '0.0.0.0'], undefined, [1, 64]);
  assert.equal(rejected.error.code, 'invalid_args');
  assert.equal((await command(fx, ['daemon', 'status'])).data.running, false);
  const socket = join(fx.stateDir, 'daemon.sock');
  const ui = await startUi(t, fx);
  assert.equal(ui.host, '127.0.0.1');
  assert.equal(ui.url, 'http://127.0.0.1:' + ui.port);
  assert.ok(Number.isInteger(ui.port) && ui.port > 0 && ui.port <= 65535);

  const page = await fetch(ui.url + '/');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.match(await page.text(), /"mode"\s*:\s*"live"/);
  const stream = await events(t, ui.url);
  const first = await stream.next(() => true, 'SSE did not send its initial snapshot');
  assert.deepEqual(first.tasks, []);
  assert.deepEqual(first.queue, []);
  assert.deepEqual(first.scheduled_retries, []);
  assert.deepEqual(first.audit, []);
  await stream.next(s => s.herdr === 'reachable', 'SSE did not include the initial Herdr discovery');
  assert.equal(first.route.socket, fx.socketPath);
  assert.equal(first.daemon.pid, ui.daemon_pid);
  assert.equal(first.daemon.version, '3.5.0');
  assert.ok(Number.isFinite(Date.parse(first.daemon.started_at)));
  assert.ok(Number.isSafeInteger(first.now));

  // Leave the UI connected beyond the idle timeout before submitting a task.
  await sleep(2_350);
  await access(socket);
  process.kill(ui.daemon_pid, 0);
  const known = 'w1:p81';
  fx.herdr.addAgent(known, { workspace_id: 'fixture-workspace', tab_id: 'fixture-tab' });
  const discovered = await stream.next(s => s.seq > first.seq &&
    s.unmanaged_live_agents.some(a => a.pane_id === known && a.agent_status === 'idle'), 'Agent list changes did not push an event');
  const task = 'live-task';
  const noCaller = { pane: '' };
  const brief = 'Report on the live event.';
  const sent = await command(fx, ['send', known, '--task', task, '--brief', brief], noCaller);
  const submitting = await stream.next(s => s.seq > discovered.seq &&
    s.tasks.some(row => row.task === task && row.state === 'submitted') &&
    s.managed_panes.some(p => p.pane_id === known && p.agent_status === 'working'), 'CLI send did not push an event');
  const pane = submitting.managed_panes.find(p => p.pane_id === known);
  assert.equal(pane.live, true);
  assert.equal(pane.workspace_id, 'fixture-workspace');
  assert.equal(pane.tab_id, 'fixture-tab');
  assert.ok(pane.state_change_seq > 1);
  assert.ok(submitting.audit.some(a => Number.isSafeInteger(a.id) && a.task === task && a.event === 'submitted'));
  assert.equal((await taskFile(ui, task, 'kind=brief')).content, brief);
  assert.deepEqual(await taskFile(ui, task, 'kind=out'), {
    task, kind: 'out', turn: 1, path: sent.out, exists: false, content: '',
  });
  const body = 'Result from the live worker.';
  await command(fx, ['reply', task, '--attempt', sent.attempt, '--ok', '--body', body], { pane: known });
  await stream.next(s => s.seq > submitting.seq &&
    s.tasks.some(row => row.task === task && row.state === 'succeeded'), 'CLI reply did not push an event');
  assert.equal((await taskFile(ui, task, 'kind=out')).content, body);
  assert.equal(fx.herdr.reads.length, 0, 'Snapshot and SSE must not read any screen');

  assert.equal((await taskFile(ui, 'unknown-task', 'kind=brief', 404)).code, 'task_not_found');
  for (const query of ['kind=unknown', 'kind=brief&turn=0', 'kind=brief&turn=2', 'kind=brief&turn=1.1',
    'kind=brief&path=' + encodeURIComponent(join(fx.root, 'outside.txt'))]) {
    assert.equal((await taskFile(ui, task, query, 400)).code, 'invalid_args');
  }
  const outside = join(fx.root, 'outside.txt');
  await writeFile(outside, 'OUTSIDE_WORKSPACE_SENTINEL');
  await rename(sent.out, sent.out + '.saved');
  await symlink(outside, sent.out);
  assert.equal((await taskFile(ui, task, 'kind=out', 400)).code, 'invalid_args');
  await rm(sent.out);
  await writeFile(sent.out, Buffer.alloc(1024 * 1024 + 1));
  assert.equal((await taskFile(ui, task, 'kind=out', 413)).code, 'file_too_large');
  await rename(sent.out + '.saved', sent.out);

  // A real blocked transition produces one diagnostic read independent of the UI subscription.
  fx.herdr.setAgent(known, { agent_status: 'idle' });
  await command(fx, ['send', known, '--task', task, '--brief', 'A second turn.'], noCaller);
  const privateText = ['fixture', 'example.test'].join('@');
  fx.herdr.setAgent(known, { agent_status: 'blocked', screen: 'User question: Continue? ' + privateText });
  const blocked = await stream.next(s => s.tasks.some(row => row.task === task && row.turn === 2 && row.block?.diag),
    'Blocked task did not publish its diagnostic path');
  const diag = await taskFile(ui, task, 'kind=diag');
  assert.equal(diag.exists, true);
  assert.equal(diag.turn, 2);
  assert.equal(diag.path, blocked.tasks.find(row => row.task === task).block.diag);
  assert.equal(diag.content, 'User question: Continue? [redacted]');
  assert.ok(Number.isSafeInteger(diag.updated_at));
  assert.equal((await taskFile(ui, task, 'kind=out&turn=1')).content, body);
  assert.equal((await taskFile(ui, task, 'kind=brief&turn=1')).content, brief);
  await writeFile(diag.path, 'Redact on read: ' + privateText);
  assert.equal((await taskFile(ui, task, 'kind=diag')).content, 'Redact on read: [redacted]');
  await rm(diag.path);
  await symlink(outside, diag.path);
  assert.equal((await taskFile(ui, task, 'kind=diag', 400)).code, 'invalid_args');
  assert.equal(fx.herdr.reads.length, 1);

  await command(fx, ['cancel', task], noCaller);
  fx.herdr.removeAgent(known);
  const offline = await stream.next(s => s.seq > blocked.seq &&
    !s.managed_panes.some(p => p.pane_id === known), 'Agent removal did not push an event');
  assert.equal(offline.tasks.find(row => row.task === task).state, 'cancelled');
  stream.close();
  await sleep(2_350);
  await access(socket);
  ui.child.kill('SIGTERM');
  assert.deepEqual(await ui.exited, { code: 143, signal: null });
  await sleep(250);
  await access(socket);
  await eventually(() => access(socket).then(() => false, e => {
    if (e.code !== 'ENOENT') throw e;
    return true;
  }), { message: 'Daemon did not remove its socket after the UI lease closed' });
  assert.equal((await command(fx, ['daemon', 'status'])).data.running, false);
});

test('E2E-16 Web UI security, controlled actions and matrix v2 fallback', { timeout: 40_000 }, async t => {
  const fx = await createFixture(t, { env: { CHFLOW_TYPING_QUIET_MS: '100' } });
  const worker = 'w1:p82';
  fx.herdr.addAgent(worker);
  const ui = await startUi(t, fx);
  const html = await (await fetch(ui.url + '/index.html')).text();
  const token = html.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)?.[1];
  assert.ok(token, 'HTML needs the per-process CSRF token');
  const auth = { Origin: ui.url, 'X-Chflow-Token': token, 'Content-Type': 'application/json' };
  const body = (action, target, opts) => JSON.stringify({ action, target, opts });
  const post = (payload, headers = auth) => jsonRequest(ui.url, '/api/action', { method: 'POST', headers, body: payload });
  const action = async (name, target, opts, expected = 200) => {
    const result = await post(body(name, target, opts));
    assert.equal(result.status, expected, JSON.stringify(result.body));
    return result.body;
  };
  const beginning = await snapshot(ui.url);
  const adopt = body('adopt', worker, { name: 'web-worker' });
  for (const [headers, code] of [
    [{ ...auth, Host: 'untrusted.invalid' }, 'forbidden_host'],
    [{ ...auth, Host: '127.0.0.1:0' }, 'forbidden_host'],
    [{ ...auth, 'Sec-Fetch-Site': 'same-site' }, 'forbidden_origin'],
    [{ ...auth, Origin: undefined }, 'forbidden_origin'],
    [{ ...auth, Origin: 'https://untrusted.invalid' }, 'forbidden_origin'],
    [{ ...auth, Origin: 'http://127.0.0.1' }, 'forbidden_origin'],
    [{ ...auth, 'X-Chflow-Token': undefined }, 'invalid_csrf_token'],
    [{ ...auth, 'X-Chflow-Token': '0'.repeat(64) }, 'invalid_csrf_token'],
  ]) {
    const defined = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
    const result = await post(adopt, defined);
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, code);
  }
  for (const path of ['/api/snapshot', '/api/events', '/api/tasks/missing/file?kind=out']) {
    const forbidden = await jsonRequest(ui.url, path, { headers: { Host: 'untrusted.invalid' } });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, 'forbidden_host');
  }
  const oversize = adopt + ' '.repeat(128 * 1024);
  assert.equal((await post(body('inspect', worker) + ' '.repeat(80 * 1024))).status, 400);
  const bounded = await post(oversize);
  assert.equal(bounded.status, 413);
  assert.equal(bounded.body.error.code, 'body_too_large');
  const chunked = await post(oversize, { ...auth, 'Transfer-Encoding': 'chunked' });
  assert.equal(chunked.status, 413);
  assert.equal((await action('inspect', worker, { screen: true }, 400)).error.code, 'invalid_args');
  assert.equal((await action('resume', 'anything', { brief_file: join(fx.root, 'outside.txt') }, 400)).error.code, 'invalid_args');
  const guarded = await snapshot(ui.url);
  assert.equal(guarded.seq, beginning.seq);
  assert.deepEqual(guarded.managed_panes, []);
  assert.deepEqual(guarded.audit, []);
  assert.equal(fx.herdr.prompts.length + fx.herdr.keys.length + fx.herdr.reads.length, 0);

  const adopted = await post(adopt, { ...auth, Host: 'localhost', Origin: 'http://localhost:' + ui.port, 'Sec-Fetch-Site': 'none' });
  assert.equal(adopted.status, 200);
  assert.equal(adopted.body.exit_code, 0);
  assert.equal(adopted.body.data.pane_id, worker);
  assert.equal(adopted.body.data.controller.pane, fx.caller);
  assert.equal((await snapshot(ui.url)).managed_panes.find(p => p.pane_id === worker).adopted, true);
  const agy = 'w1:p83';
  fx.herdr.addAgent(agy, { agent: 'agy' });
  assert.equal((await action('adopt', agy, { perm: 'yolo' }, 403)).error.code, 'compliance_blocked');
  assert.equal((await action('finish', 'nonexistent', { ok: true }, 404)).error.code, 'task_not_found');

  fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
  const task = 'response-task';
  const sent = await command(fx, ['send', 'web-worker', '--task', task, '--brief', 'Handle the question.']);
  const step = { expect_visible: 'User question: Continue?', key: ['down', 'enter'] };
  const skipped = await action('respond', task, step);
  assert.equal(skipped.data.already_unblocked, true);
  assert.equal(fx.herdr.keys.length, 0);
  fx.herdr.setAgent(worker, { agent_status: 'blocked', screen: step.expect_visible });
  await eventually(async () => (await snapshot(ui.url)).tasks.find(row => row.task === task)?.block);
  const mismatched = await action('respond', task, { ...step, expect_visible: 'Different question' });
  assert.equal(mismatched.error.code, 'expectation_mismatch');
  assert.equal(mismatched.exit_code, 2);
  assert.equal(fx.herdr.keys.length, 0);
  const screen = await action('inspect_screen', task);
  assert.equal(screen.data.screen, step.expect_visible);
  assert.deepEqual(fx.herdr.reads.at(-1).params, [worker, '--source', 'visible', '--lines', '40']);
  assert.equal((await action('respond', task, step)).data.responded, true);
  assert.deepEqual(fx.herdr.keys.map(entry => entry.keys), [step.key]);
  await eventually(async () => (await snapshot(ui.url)).tasks.find(row => row.task === task)?.state === 'submitted');

  const draft = 'UNSUBMITTED_HTTP_DRAFT';
  fx.herdr.setAgent(fx.caller, { agent_status: 'idle', focused: true, screen: '❯ ' + draft });
  await command(fx, ['reply', task, '--attempt', sent.attempt, '--ok', '--body', 'Result for the caller.'], { pane: worker }, [0, 2]);
  const deferred = await eventually(async () => (await snapshot(ui.url)).queue.find(row =>
    row.task === task && row.type === 'result' && row.state === 'deferred_user_typing'));
  const flushed = await action('flush');
  assert.equal(flushed.data.consumed, 1);
  assert.match(flushed.data.summary, /status=succeeded/);
  assert.ok(!flushed.data.summary.includes(draft));
  assert.equal((await snapshot(ui.url)).queue.find(e => e.event_id === deferred.event_id).state, 'delivered');
  assert.equal(fx.herdr.prompts.filter(p => p.pane === fx.caller).length, 0);
  const finished = await action('finish', task, { ok: true, attempt: sent.attempt });
  assert.equal(finished.data.finished, true);
  assert.equal(finished.data.reason, 'controller_finished');

  const other = 'w1:p84';
  fx.herdr.addAgent(other);
  const cancel = await command(fx, ['send', other, '--brief', 'This task will be cancelled.']);
  assert.equal((await action('cancel', cancel.task, { close_pane: true })).data.state, 'cancelled');
  assert.ok(!fx.herdr.agents.has(other));
  assert.equal((await action('finish', cancel.task, { ok: true }, 409)).error.code, 'task_inactive');

  const matrix = join(fx.workspace, 'matrix.yaml');
  await writeFile(matrix, [
    'version: 2',
    'channels:',
    '  - id: pi-base',
    '    harness: pi',
    '    models:',
    '      - pi-default',
    '  - id: codex-backup',
    '    harness: codex',
    '    status: backup',
    '    models:',
    "      - 'default-backup' # first model",
    '      - unused-second-model',
    '  - id: claude-backup',
    '    harness: claude',
    '    model: explicit-model',
    '    models:',
    '      - ignored-list-model',
    'routing_rules:',
    '  implement_workers:',
    '    - pi-base',
    '  fallback_chain:',
    '    - codex-backup',
    '    - claude-backup',
  ].join('\n'));
  const primary = 'w1:p85';
  fx.herdr.addAgent(primary);
  const quota = await command(fx, ['send', primary, '--brief', 'Trigger matrix fallback.', '--matrix', matrix, '--channel', 'pi-base']);
  assert.deepEqual(quota.fallback.map(item => [item.channel, item.model]), [
    ['codex-backup', 'default-backup'], ['claude-backup', 'explicit-model'],
  ]);
  fx.herdr.setAgent(primary, { agent_status: 'done', failure: 'quota_exhausted' });
  const fallback = await eventually(async () => (await snapshot(ui.url)).tasks.find(row =>
    row.task === quota.task && row.launch.channel === 'codex-backup' && row.state === 'submitted'));
  assert.notEqual(fallback.attempt, quota.attempt);
  assert.equal(fallback.brief, quota.brief);
  const launch = fx.herdr.starts.find(start => start.pane === fallback.pane);
  assert.equal(launch.kind, 'codex');
  assert.deepEqual(launch.extra.slice(0, 2), ['-m', 'default-backup']);

  const jsonMatrix = join(fx.workspace, 'matrix.json');
  const channels = [{ id: 'primary', harness: 'pi' }, { id: 'supervised', harness: 'agy' },
    { id: 'fallback', harness: 'codex', models: ['json-backup'] }];
  await writeFile(jsonMatrix, JSON.stringify({ channels, routing_rules: { fallback_chain: ['supervised', 'fallback'] } }));
  const fresh = 'w1:p86';
  fx.herdr.addAgent(fresh);
  const args = ['send', fresh, '--brief', 'Check fallback precedence.'];
  const agyFallback = await command(fx, [...args, '--matrix', jsonMatrix], undefined, [1, 64]);
  assert.equal(agyFallback.error.code, 'invalid_args');
  assert.equal(fx.herdr.prompts.filter(p => p.pane === fresh).length, 0);
  const configured = join(fx.stateDir, 'config.json');
  await writeFile(configured, JSON.stringify({ matrix: jsonMatrix, fallback_chain: ['fallback'] }));
  const configTask = await command(fx, args);
  assert.equal(configTask.fallback[0].model, 'json-backup');
  await action('cancel', configTask.task);
  fx.herdr.setAgent(fresh, { agent_status: 'idle' });
  const override = await command(fx, [...args, '--fallback', 'claude:cli-model']);
  assert.equal(override.fallback[0].model, 'cli-model');

  const scoped = await startUi(t, fx, ['--host', 'localhost', '--session', 'web-console']);
  assert.equal(scoped.daemon_pid, ui.daemon_pid);
  assert.equal(scoped.url, 'http://localhost:' + scoped.port);
  assert.deepEqual((await snapshot(scoped.url)).route, { session: 'web-console' });
  const scopedHtml = await (await fetch(scoped.url + '/')).text();
  const scopedToken = scopedHtml.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)?.[1];
  assert.ok(scopedToken && scopedToken !== token);
  const scopedWorker = 'w1:p87';
  fx.herdr.addAgent(scopedWorker);
  const scopedAdoption = await jsonRequest(scoped.url, '/api/action', {
    method: 'POST', headers: { ...auth, Origin: scoped.url, 'X-Chflow-Token': scopedToken },
    body: body('adopt', scopedWorker),
  });
  assert.equal(scopedAdoption.status, 200);
  assert.deepEqual(scopedAdoption.body.data.route, { session: 'web-console' });
  assert.ok(fx.herdr.requests.some(r => r.method === 'agent.get' && r.pane === scopedWorker && r.route.session === 'web-console'));
  assert.ok(!(await snapshot(ui.url)).managed_panes.some(p => p.pane_id === scopedWorker));
  scoped.child.kill('SIGTERM');
  assert.deepEqual(await scoped.exited, { code: 143, signal: null });
  ui.child.kill('SIGINT');
  assert.deepEqual(await ui.exited, { code: 130, signal: null });
});

test('E2E-17 Web UI operator authority, terminal overrides, and per-event delivery controls', { timeout: 45_000 }, async t => {
  const fx = await createFixture(t, { env: { HERDR_PANE_ID: '', CHFLOW_TYPING_QUIET_MS: '100' } });
  const ui = await startUi(t, fx);
  const html = await (await fetch(ui.url + '/')).text();
  const token = html.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)?.[1];
  assert.ok(token);
  const headers = { Origin: ui.url, 'X-Chflow-Token': token, 'Content-Type': 'application/json' };
  async function action(method, target, opts = {}, status = 200) {
    const reply = await jsonRequest(ui.url, '/api/action', {
      method: 'POST', headers, body: JSON.stringify({ action: method, target, opts }),
    });
    assert.equal(reply.status, status, method + ': ' + JSON.stringify(reply.body));
    return reply.body.data ?? reply.body.error;
  }
  const state = () => snapshot(ui.url);
  const tasks = async id => (await state()).tasks.find(row => row.task === id);
  const event = async id => (await state()).queue.find(row => row.event_id === id);
  const promptsTo = pane => fx.herdr.prompts.filter(p => p.pane === pane);
  const resultFor = id => eventually(async () => (await state()).queue.find(e => e.task === id && e.type === 'result'));
  const reply = row => command(fx, ['reply', row.task, '--attempt', row.attempt, '--ok', '--body', 'Operator fixture result.'],
    { pane: row.pane_id }, [0, 2]);

  const launched = await action('start', undefined, {
    kind: 'codex', name: 'operator-worker', place: 'workspace', controller: fx.otherCaller,
  });
  const worker = launched.pane_id;
  assert.equal(launched.controller.pane, fx.otherCaller);
  const forbidden = await command(fx, ['send', worker, '--brief', 'Ordinary caller has no ownership.', '--controller', fx.otherCaller],
    { pane: fx.caller }, [1]);
  assert.equal(forbidden.error.code, 'pane_owned_by_other');

  const initial = await action('send', 'operator-worker', {
    task: 'operator-owned', brief: 'Own the interactive task.', controller: fx.otherCaller,
  });
  const task = initial.task;
  assert.equal(initial.controller.pane, fx.otherCaller);
  assert.equal(initial.return_route.pane, fx.otherCaller);
  assert.ok(promptsTo(worker).some(p => p.text.includes('task=operator-owned#1')));

  for (const recipient of [fx.caller, fx.otherCaller])
    assert.deepEqual(await action('queue_pause', recipient), { pane: recipient, paused: true });
  assert.deepEqual((await state()).paused_recipients, [fx.caller, fx.otherCaller]);

  fx.herdr.setAgent(worker, { agent_status: 'blocked', screen: 'Would you like to run this command?\n❯ 1. Yes, proceed' });
  const permissionBlock = await eventually(async () => {
    const current = await tasks(task);
    return current?.block?.kind === 'permission' && current.block;
  });
  assert.equal(fx.herdr.keys.length, 0);
  const startCount = fx.herdr.starts.length;
  assert.deepEqual(await action('set_perm', 'operator-worker', { perm: 'yolo' }), { target: 'operator-worker', perm: 'yolo' });
  await eventually(() => fx.herdr.keys.find(k => k.pane === worker));
  assert.deepEqual(fx.herdr.keys.filter(k => k.pane === worker).map(k => k.keys), [['enter']]);
  const unblocked = await eventually(async () => {
    const current = await tasks(task);
    return current.state === 'submitted' && current;
  });
  assert.equal(unblocked.perm, 'yolo');
  assert.equal(fx.herdr.starts.length, startCount);
  assert.ok((await state()).audit.some(a => a.task === task && a.event === 'auto_approved' && a.detail === String(permissionBlock.seq)));
  const registered = (await state()).managed_panes.find(p => p.pane_id === worker);
  assert.equal(registered.perm, 'yolo');
  assert.equal(registered.native_perm, 'ask');
  assert.ok((await state()).audit.some(a => a.task === task && a.event === 'perm_updated'));

  const handed = await action('handoff', worker, { to: fx.caller });
  assert.equal(handed.controller.pane, fx.caller);
  assert.equal((await tasks(task)).return_route.pane, fx.caller);
  fx.herdr.setAgent(worker, { agent_status: 'blocked', screen: 'User question: select an option' });
  const alert = await eventually(async () => (await state()).queue.find(e =>
    e.task === task && e.type === 'blocked' && e.state === 'paused_by_operator'));
  assert.deepEqual(await action('terminal_control', task, { keys: ['down', 'enter'] }), { pane: worker, ok: true });
  assert.deepEqual(fx.herdr.keys.at(-1).keys, ['down', 'enter']);
  assert.equal((await event(alert.event_id)).state, 'superseded_by_human_unblock');
  assert.equal((await tasks(task)).state, 'submitted');
  assert.equal((await tasks(task)).block, undefined);

  fx.herdr.setAgent(worker, { agent_status: 'blocked', screen: 'User question: one more choice' });
  await eventually(async () => (await tasks(task)).block?.kind === 'question');
  assert.equal((await action('respond', task, { force: true, key: 'enter' })).responded, true);
  assert.equal((await action('respond', task, { force: true, key: 'enter' })).already_unblocked, true);

  const unmanaged = 'w1:p91';
  fx.herdr.addAgent(unmanaged, { screen: 'Unmanaged worker screen.' });
  assert.deepEqual(await action('inspect_screen', unmanaged, { lines: 17 }), {
    pane_id: unmanaged, screen: 'Unmanaged worker screen.',
  });
  assert.deepEqual(fx.herdr.reads.at(-1).params, [unmanaged, '--source', 'visible', '--lines', '17']);
  assert.equal((await action('terminal_control', unmanaged, { keys: 'esc', prompt: 'Manual orchestration prompt.' })).pane, unmanaged);
  assert.deepEqual(fx.herdr.keys.at(-1).keys, ['esc']);
  assert.equal(promptsTo(unmanaged).at(-1).text, 'Manual orchestration prompt.');

  assert.equal((await action('adopt', unmanaged, { controller: fx.otherCaller })).controller.pane, fx.otherCaller);
  assert.equal((await action('switch', unmanaged, { model: 'operator-model' }, 409)).code, 'pane_not_ready');
  fx.herdr.setAgent(unmanaged, { agent_status: 'idle' });
  assert.equal((await action('switch', unmanaged, { model: 'operator-model' })).suggested_restart, true);
  assert.equal((await action('adopt', unmanaged, { takeover: true })).controller, null);

  const draftScreen = 'Previous turn finished.\n❯ UNSUBMITTED_OPERATOR_DRAFT\n';
  fx.herdr.setAgent(fx.caller, { agent_status: 'idle', focused: true, paneFocusOnly: true, screen: draftScreen });
  await reply(initial);
  const paused = await resultFor(task);
  assert.equal(paused.state, 'paused_by_operator');
  await sleep(350);
  assert.equal(promptsTo(fx.caller).length, 0);
  assert.equal(fx.herdr.notifications.length, 0);
  assert.equal(fx.herdr.reads.filter(r => r.pane === fx.caller).length, 0);
  fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
  const forced = await Promise.all([
    action('queue_deliver_now', undefined, { event_id: paused.event_id }),
    action('queue_deliver_now', undefined, { event_id: paused.event_id }),
  ]);
  assert.deepEqual(forced.map(r => r.delivered).sort(), [0, 1]);
  assert.equal(promptsTo(fx.caller).length, 1);
  assert.match(promptsTo(fx.caller)[0].text, /status=succeeded/);
  assert.equal((await event(paused.event_id)).state, 'delivered');
  assert.ok((await state()).paused_recipients.includes(fx.caller));

  async function makeResult(id, pane, controller = fx.caller) {
    fx.herdr.addAgent(pane);
    const sent = await action('send', pane, { task: id, brief: 'A delivery to manipulate.', controller });
    await reply(sent);
    return resultFor(id);
  }
  const routed = await makeResult('operator-reroute', 'w1:p92');
  const dropped = await makeResult('operator-drop', 'w1:p93');
  const consumed = await makeResult('operator-consume', 'w1:p94');
  const batched = await makeResult('operator-batch', 'w1:p95', fx.otherCaller);
  assert.deepEqual(await action('queue_reroute', undefined, { event_id: routed.event_id, to: fx.otherCaller }), {
    to: fx.otherCaller, ok: true,
  });
  assert.equal((await event(routed.event_id)).recipient.pane, fx.otherCaller);
  assert.equal((await event(routed.event_id)).failures, 0);
  assert.equal((await action('queue_drop', undefined, { event_id: dropped.event_id })).ok, true);
  assert.equal((await event(dropped.event_id)).state, 'superseded_by_operator');
  assert.equal((await action('queue_consume', undefined, { event_id: consumed.event_id })).ok, true);
  assert.equal((await event(consumed.event_id)).state, 'delivered');
  assert.equal(promptsTo(fx.caller).length, 1);
  assert.equal(promptsTo(fx.otherCaller).length, 0);
  assert.deepEqual(await action('queue_deliver_now', fx.otherCaller), { delivered: 2 });
  assert.equal(promptsTo(fx.otherCaller).length, 1);
  assert.match(promptsTo(fx.otherCaller)[0].text, /^\[chflow:batch\] count=2/);
  assert.ok(promptsTo(fx.otherCaller)[0].text.includes(routed.task));
  assert.ok(promptsTo(fx.otherCaller)[0].text.includes(batched.task));

  const resumed = await makeResult('operator-resume-queue', 'w1:p96', fx.otherCaller);
  assert.equal(resumed.state, 'paused_by_operator');
  fx.herdr.setAgent(fx.otherCaller, { agent_status: 'idle' });
  assert.equal((await action('queue_resume')).resumed, 2);
  assert.deepEqual((await state()).paused_recipients, []);
  await eventually(async () => (await event(resumed.event_id)).state === 'delivered');

  const retryWorker = 'w1:p97';
  fx.herdr.addAgent(retryWorker);
  async function planRetry(id) {
    const sent = await action('send', retryWorker, { task: id, brief: 'Wait for quota.', retry_after: '30m', controller: fx.caller });
    fx.herdr.setAgent(retryWorker, { agent_status: 'done', failure: 'quota_exhausted' });
    await eventually(async () => (await state()).scheduled_retries.find(p => p.task === sent.task && p.state === 'pending'));
    return sent;
  }
  const scheduled = await planRetry('operator-cancel-retry');
  const cancelled = await action('cancel_retry', scheduled.task);
  assert.equal(cancelled.state, 'failed');
  assert.equal(cancelled.reason, 'operator_cancelled_retry');
  assert.equal(cancelled.nextAt, undefined);
  assert.equal((await state()).scheduled_retries.find(p => p.task === scheduled.task).state, 'cancelled');
  fx.herdr.setAgent(retryWorker, { agent_status: 'idle', failure: undefined });
  const early = await planRetry('operator-retry-now');
  const immediate = await action('retry', early.task);
  assert.equal(immediate.state, 'submitted');
  assert.notEqual(immediate.attempt, early.attempt);
  assert.equal((await state()).scheduled_retries.find(p => p.task === early.task).state, 'triggered');

  const release = join(fx.root, 'allow-headless-result');
  const headless = '#!/usr/bin/env node\n' + [
    "process.stdin.resume();",
    "const fs = require('node:fs');",
    "const poll = setInterval(() => {",
    '  if (!fs.existsSync(' + JSON.stringify(release) + ')) return;',
    "  clearInterval(poll);",
    "  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Headless operator result' } }));",
    "  console.log(JSON.stringify({ type: 'turn.completed' }));",
    "}, 25);",
  ].join('\n');
  await fx.writeExecutable('codex', headless);
  const run = await action('run', undefined, {
    kind: 'codex', task: 'operator-headless', brief: 'Background run.', controller: fx.otherCaller, timeout: 5,
  });
  assert.equal(run.state, 'submitted');
  assert.equal(run.return_route.pane, fx.otherCaller);
  await writeFile(release, '');
  await eventually(async () => (await tasks(run.task)).state === 'succeeded');

  const agy = await action('start', undefined, { kind: 'agy', name: 'operator-agy', perm: 'yolo', place: 'workspace' });
  assert.equal(agy.perm, 'yolo');
  const agyPane = 'w1:p98';
  fx.herdr.addAgent(agyPane, { agent: 'agy' });
  const attended = await action('send', agyPane, { perm: 'yolo', brief: 'Supervised assignment.' });
  assert.equal(attended.launch.attended, true);
  assert.equal((await action('run', undefined, { kind: 'agy', brief: 'Headless is prohibited.' }, 403)).code, 'compliance_blocked');
});

test('E2E-18 embedded Web UI leases, port fallback and authenticated remote access', { timeout: 45_000 }, async t => {
  const options = { env: { CHFLOW_IDLE_TIMEOUT_SEC: '2' } };
  const [active, idle] = await Promise.all([createFixture(t, options), createFixture(t, options)]);
  const [activeStart, idleStart] = await Promise.all([
    command(active, ['daemon', 'start']), command(idle, ['daemon', 'start']),
  ]);
  const activeMeta = activeStart.data, idleMeta = idleStart.data;
  assert.notEqual(activeMeta.pid, idleMeta.pid);
  assert.notEqual(activeMeta.ui_port, idleMeta.ui_port);
  assert.ok([activeMeta.ui_port, idleMeta.ui_port].some(port => port !== 4317));
  assert.equal(activeMeta.ui_host, '127.0.0.1');
  assert.equal(activeMeta.ui_url, 'http://127.0.0.1:' + activeMeta.ui_port);
  assert.equal(activeMeta.ui_auth_required, false);

  const ui = await command(active, ['ui']);
  assert.deepEqual(ui, {
    url: activeMeta.ui_url, host: activeMeta.ui_host, port: activeMeta.ui_port,
    auth_required: false, daemon_pid: activeMeta.pid, embedded: true,
  });
  const stream = await events(t, ui.url);
  const first = await stream.next(s => s.herdr === 'reachable', 'Embedded UI did not discover Herdr');
  assert.equal(first.daemon.ui_url, ui.url);
  assert.equal((await command(active, ['health'])).daemon.ui_url, ui.url);
  assert.equal((await command(active, ['daemon', 'status'])).data.ui_url, ui.url);
  const metaPath = join(active.stateDir, 'daemon.json');
  const persisted = JSON.parse(await readFile(metaPath, 'utf8'));
  for (const field of ['ui_url', 'ui_host', 'ui_port', 'ui_auth_required'])
    assert.equal(persisted[field], activeMeta[field]);
  if (process.platform !== 'win32') assert.equal((await stat(metaPath)).mode & 0o777, 0o600);

  const secondStream = await events(t, ui.url);
  await secondStream.next(s => s.seq >= first.seq, 'Second browser did not receive state');
  stream.close();
  const idleMetaPath = join(idle.stateDir, 'daemon.json');
  await eventually(() => access(idleMetaPath).then(() => false, e => {
    assert.equal(e.code, 'ENOENT');
    return true;
  }), { message: 'Embedded HTTP without SSE kept an idle daemon alive' });
  await sleep(2_150);
  await access(metaPath);
  active.herdr.addAgent('w1:p101');
  await secondStream.next(s => s.unmanaged_live_agents.some(p => p.pane_id === 'w1:p101'),
    'Remaining SSE client stopped receiving Herdr changes after the first disconnected');
  assert.equal(active.herdr.reads.length, 0);
  secondStream.close();
  await sleep(100);
  await access(metaPath);
  await eventually(() => access(metaPath).then(() => false, e => {
    assert.equal(e.code, 'ENOENT');
    return true;
  }), { message: 'Daemon did not idle out after the final SSE browser disconnected' });

  const trustedHost = 'console.example.invalid';
  const accessToken = randomBytes(24).toString('hex');
  const remote = await createFixture(t, { env: {
    CHFLOW_UI_TOKEN: accessToken, CHFLOW_UI_TRUSTED_HOSTS: trustedHost,
  } });
  const gateway = await startUi(t, remote, ['--host', '0.0.0.0', '--allow-remote']);
  assert.equal(gateway.host, '0.0.0.0');
  assert.equal(gateway.auth_required, true);
  assert.equal(new URL(gateway.access_url).searchParams.get('token') === accessToken, true);
  const login = await fetch(gateway.url + '/index.html');
  assert.equal(login.status, 401);
  const boot = html => JSON.parse(html.match(/window\.__CHFLOW_BOOT__\s*=\s*({[^\n]+});/)?.[1] ?? '{}');
  const loginHtml = await login.text();
  assert.match(loginHtml, /type="password"/);
  assert.doesNotMatch(loginHtml, /"csrfToken"\s*:\s*"/);
  const invalidLink = await fetch(gateway.url + '/?token=invalid', { redirect: 'manual' });
  assert.equal(invalidLink.status, 401);
  assert.match(await invalidLink.text(), /Invalid access token\./);
  assert.equal(invalidLink.headers.has('set-cookie'), false);

  for (const path of ['/api/snapshot', '/api/events', '/api/tasks/example/file?kind=out', '/api/action']) {
    const unsigned = await jsonRequest(gateway.url, path, { method: path.endsWith('/action') ? 'POST' : 'GET' });
    assert.equal(unsigned.status, 401);
    assert.equal(unsigned.body.error.code, 'auth_required');
  }
  const accepted = await fetch(gateway.access_url, { redirect: 'manual' });
  assert.equal(accepted.status, 302);
  assert.equal(accepted.headers.get('location'), '/');
  const cookieHeader = accepted.headers.get('set-cookie');
  assert.match(cookieHeader, /^chflow_auth=[^;]+; HttpOnly; SameSite=Strict; Path=\/$/);
  const cookie = cookieHeader.split(';')[0];
  const bearer = 'Bearer ' + accessToken;
  for (const headers of [{ Cookie: cookie }, { Authorization: bearer }])
    assert.equal((await jsonRequest(gateway.url, '/api/snapshot', { headers })).status, 200);

  const auth = (token, headers = {}, suffix = '') => jsonRequest(gateway.url, '/api/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: gateway.url, ...headers },
    body: JSON.stringify({ token }) + suffix,
  });
  assert.equal((await auth('invalid')).body.error.code, 'invalid_access_token');
  assert.equal((await auth(accessToken, { Host: 'untrusted.invalid' })).body.error.code, 'forbidden_host');
  assert.equal((await auth(accessToken, { Origin: 'https://untrusted.invalid' })).body.error.code, 'forbidden_origin');
  assert.equal((await auth(accessToken, {}, ' '.repeat(128 * 1024))).status, 413);
  const proxy = { Host: trustedHost, Origin: 'https://' + trustedHost };
  const authorized = await auth(accessToken, proxy);
  assert.equal(authorized.status, 200);
  assert.deepEqual(authorized.body, { ok: true, data: { authenticated: true } });
  assert.equal(authorized.headers['set-cookie']?.[0] === cookieHeader, true);

  const html = await fetch(gateway.url + '/', { headers: { Cookie: cookie } });
  assert.equal(html.status, 200);
  const csrf = boot(await html.text()).csrfToken;
  assert.match(csrf, /^[0-9a-f]{64}$/);
  const worker = 'w1:p102';
  remote.herdr.addAgent(worker);
  const post = headers => jsonRequest(gateway.url, '/api/action', {
    method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'adopt', target: worker }),
  });
  assert.equal((await post(proxy)).body.error.code, 'invalid_csrf_token');
  assert.equal((await post({ ...proxy, Origin: 'https://untrusted.invalid', 'X-Chflow-Token': csrf })).body.error.code, 'forbidden_origin');
  assert.equal((await post({ ...proxy, 'X-Chflow-Token': csrf })).body.data.pane_id, worker);
  const daemon = (await command(remote, ['daemon', 'status'])).data;
  assert.equal((await jsonRequest(daemon.ui_url, '/api/snapshot', { headers: proxy })).status, 200);
  assert.equal(JSON.stringify(daemon).includes(accessToken), false);
  assert.equal(JSON.stringify(await command(remote, ['daemon', 'logs'])).includes(accessToken), false);

  const configured = await createFixture(t);
  await mkdir(configured.stateDir, { recursive: true });
  const configPath = join(configured.stateDir, 'config.json');
  await writeFile(configPath, JSON.stringify({ ui_disable: true }));
  assert.equal((await command(configured, ['ui'], undefined, [1])).error.code, 'ui_disabled');
  assert.equal((await command(configured, ['daemon', 'status'])).data.running, true);
  await command(configured, ['daemon', 'stop']);
  await eventually(() => access(join(configured.stateDir, 'daemon.json')).then(() => false, () => true));
  await writeFile(configPath, JSON.stringify({
    ui_host: '0.0.0.0', ui_port: 0, ui_allow_remote: true, ui_trusted_hosts: [trustedHost],
  }));
  const configuredUi = await command(configured, ['ui']);
  assert.equal(configuredUi.embedded, true);
  assert.equal(configuredUi.auth_required, true);
  assert.equal(configuredUi.host, '0.0.0.0');
  assert.equal((await jsonRequest(configuredUi.url, '/api/snapshot', { headers: proxy })).status, 401);
  const configuredMeta = await readFile(join(configured.stateDir, 'daemon.json'), 'utf8');
  const configuredToken = new URL(configuredUi.access_url).searchParams.get('token');
  assert.equal(configuredMeta.includes(configuredToken), false);
  const authenticatedStream = await events(t, configuredUi.url, { Authorization: 'Bearer ' + configuredToken });
  assert.equal((await authenticatedStream.next(() => true)).daemon.ui_auth_required, true);
  await command(configured, ['daemon', 'stop']);
  await authenticatedStream.ended;
  await eventually(() => access(join(configured.stateDir, 'daemon.json')).then(() => false, () => true));
});

const ptyDriver = String.raw`
import errno, fcntl, os, pty, select, signal, struct, sys, termios

pid, terminal = pty.fork()
if pid == 0:
    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
    os.execv(sys.argv[1], sys.argv[1:])

def forward(sig, frame):
    try:
        os.kill(pid, sig)
    except ProcessLookupError:
        pass

signal.signal(signal.SIGTERM, forward)
signal.signal(signal.SIGINT, forward)
readers = [terminal, 0]
while True:
    ready, _, _ = select.select(readers, [], [])
    if terminal in ready:
        try:
            data = os.read(terminal, 65536)
        except OSError as error:
            if error.errno != errno.EIO:
                raise
            break
        if not data:
            break
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
    if 0 in ready:
        data = os.read(0, 4096)
        if data:
            os.write(terminal, data)
        else:
            readers.remove(0)

_, status = os.waitpid(pid, 0)
code = os.waitstatus_to_exitcode(status)
sys.exit(code if code >= 0 else 128 - code)
`;

function cliPty(t, fx, args) {
  const child = spawn('python3', ['-c', ptyDriver, process.execPath, fx.cliPath, ...args], {
    cwd: fx.workspace, env: { ...fx.env, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '', stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, output, stderr }));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await done;
  });
  return { child, done, output: () => output, key: key => child.stdin.write(key) };
}

test('E2E-19 human CLI, TTY-only controls, redacted mailbox and live top', { timeout: 50_000 }, async t => {
  const fx = await createFixture(t, { env: { CHFLOW_UI_PORT: '0', CHFLOW_MCP_DISABLE_RESPOND: '1' } });
  const runPty = async (args, expected = 0) => {
    const result = await cliPty(t, fx, args).done;
    assert.equal(result.code, expected, args.join(' ') + ': ' + result.output + result.stderr);
    return args.includes('--json') ? JSON.parse(result.output) : result.output;
  };
  for (const args of [['approve'], ['perm', 'w1:p82', 'yolo'], ['queue', 'pause', fx.caller]]) {
    assert.equal((await command(fx, args, undefined, [1])).error.code, 'operator_required');
  }
  assert.equal((await command(fx, ['daemon', 'status'])).data.running, false);
  const noTty = spawn(process.execPath, [fx.cliPath], {
    cwd: fx.workspace, env: fx.env, stdio: ['ignore', 'pipe', 'inherit'],
  });
  let help = '';
  noTty.stdout.setEncoding('utf8').on('data', chunk => { help += chunk; });
  assert.equal(await new Promise(resolve => noTty.once('close', resolve)), 0);
  assert.match(help, /--help/i);
  assert.equal((await command(fx, ['daemon', 'status'])).data.running, false);

  const mcp = spawn(process.execPath, [fx.cliPath, 'mcp'], { cwd: fx.workspace, env: fx.env, stdio: 'pipe' });
  t.after(() => { if (mcp.exitCode === null && mcp.signalCode === null) mcp.kill(); });
  const mcpClosed = new Promise(resolve => mcp.once('close', resolve));
  const mcpLines = createInterface({ input: mcp.stdout });
  const toolsLine = new Promise(resolve => mcpLines.once('line', resolve));
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');
  const toolsPayload = await toolsLine;
  const tools = JSON.parse(toolsPayload).result.tools;
  assert.equal(tools.length, 19);
  assert.ok(Buffer.byteLength(toolsPayload) < 10_000);
  assert.ok(!tools.some(tool => /^flow_(?:approve|perm|queue|view|[a-z]*ui|open|status|top|prune)$/.test(tool.name)));
  mcp.stdin.end();
  assert.equal(await mcpClosed, 0);

  const { url } = await command(fx, ['ui']);
  assert.ok((await runPty([])).includes(url));
  assert.ok((await runPty(['status'])).includes(url));
  const scoped = await command(fx, ['status', '--session', 'local-console']);
  assert.deepEqual(scoped.route, { session: 'local-console' });
  assert.equal(scoped.daemon.ui_url, url);
  assert.equal((await runPty(['approve', '--json'], 1)).error.code, 'task_not_found');
  assert.deepEqual(await runPty(['queue', 'pause', '--json']), { pane: fx.caller, paused: true });

  const worker = 'w1:p103', second = 'w1:p104', id = 'tty-task';
  fx.herdr.addAgent(worker);
  fx.herdr.addAgent(second);
  const state = () => snapshot(url);
  const task = async taskId => (await state()).tasks.find(t => t.task === taskId);
  const queued = async (taskId, type) => (await state()).queue.find(event => event.task === taskId && event.type === type);
  const sent = await command(fx, ['send', worker, '--task', id, '--brief', 'View and approve.']);
  const other = await command(fx, ['send', second, '--task', 'tty-second', '--brief', 'Check ambiguous approval.']);
  const privateValue = 'fixture-reader' + '@' + 'example.invalid';
  await writeFile(sent.brief, 'Private brief: ' + privateValue);
  await writeFile(sent.out, 'Private result: ' + privateValue);
  fx.herdr.setAgent(worker, { agent_status: 'blocked', screen: 'User question: ' + privateValue });
  fx.herdr.setAgent(second, { agent_status: 'blocked', screen: 'User question: continue?' });
  const alert = await eventually(async () => (await queued(id, 'blocked'))?.state === 'paused_by_operator' && queued(id, 'blocked'));
  await eventually(async () => (await task(other.task))?.block?.kind === 'question');
  assert.equal((await command(fx, ['view', id, 'brief', '--turn', '1'])).content, 'Private brief: [redacted]');
  assert.equal((await command(fx, ['view', id])).content, 'Private result: [redacted]');
  assert.equal((await command(fx, ['view', id, 'reply'])).kind, 'out');
  const diag = await command(fx, ['view', id, 'diag']);
  await writeFile(diag.path, 'Private diagnostic: ' + privateValue);
  assert.ok((await runPty(['view', id, 'diag'])).includes('Private diagnostic: [redacted]'));

  const ambiguous = await runPty(['approve', '--json'], 1);
  assert.equal(ambiguous.error.code, 'invalid_args');
  assert.ok(ambiguous.error.message.includes(id) && ambiguous.error.message.includes(other.task));
  assert.equal(fx.herdr.keys.length, 0);
  await command(fx, ['cancel', other.task]);
  assert.equal((await runPty(['approve', '--json'])).pane, worker);
  assert.deepEqual(fx.herdr.keys.at(-1).keys, ['enter']);
  assert.equal((await task(id)).state, 'submitted');
  assert.equal((await state()).queue.find(e => e.event_id === alert.event_id).state, 'superseded_by_human_unblock');

  fx.herdr.setAgent(worker, { agent_status: 'blocked', screen: 'Would you like to run this command?\n❯ 1. Yes, proceed' });
  await eventually(async () => (await task(id))?.block?.kind === 'permission');
  const launches = fx.herdr.starts.length;
  assert.deepEqual(await runPty(['perm', id, 'yolo', '--json']), { target: id, perm: 'yolo' });
  await eventually(async () => (await task(id))?.state === 'submitted' && fx.herdr.keys.length === 2);
  assert.equal((await task(id)).perm, 'yolo');
  assert.equal(fx.herdr.starts.length, launches);
  await command(fx, ['reply', id, '--attempt', sent.attempt, '--ok'], { pane: worker }, [0, 2]);
  const result = await eventually(() => queued(id, 'result'));
  assert.equal(result.state, 'paused_by_operator');
  assert.deepEqual(await runPty(['queue', 'push', '--event', result.event_id, '--json']), { delivered: 1 });
  assert.equal((await queued(id, 'result')).state, 'delivered');
  assert.ok((await state()).paused_recipients.includes(fx.caller));

  fx.herdr.setAgent(worker, { agent_status: 'idle' });
  const remaining = await command(fx, ['send', worker, '--task', 'tty-resumed', '--brief', 'Normal delivery.']);
  await command(fx, ['reply', remaining.task, '--attempt', remaining.attempt, '--ok'], { pane: worker }, [0, 2]);
  assert.equal((await queued(remaining.task, 'result')).state, 'paused_by_operator');
  fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
  assert.equal((await runPty(['queue', 'resume', fx.caller, '--json'])).resumed, 1);
  await eventually(async () => (await queued(remaining.task, 'result'))?.state === 'delivered');

  const screenReads = fx.herdr.reads.length;
  const dashboard = cliPty(t, fx, ['top']);
  await eventually(() => dashboard.output().includes(url) && /seq=\d+/.test(dashboard.output()),
    { message: 'top did not render its first subscribed snapshot' });
  fx.herdr.addAgent('w1:p105');
  await command(fx, ['send', 'w1:p105', '--task', 'tty-live-push', '--brief', 'Render without manual refresh.']);
  await eventually(() => dashboard.output().includes('tty-live-push'), { message: 'top did not render a pushed task update' });
  dashboard.key('q');
  assert.equal((await dashboard.done).code, 0);
  const watch = cliPty(t, fx, ['status', '-w', '--session', 'watch-console']);
  await eventually(() => watch.output().includes(url) && /seq=\d+/.test(watch.output()));
  assert.ok(fx.herdr.requests.some(r => r.method === 'agent.list' && r.route.session === 'watch-console'));
  watch.child.kill('SIGTERM');
  assert.equal((await watch.done).code, 143);
  assert.equal(fx.herdr.reads.length, screenReads);
});

test('E2E-20 project precedence, two controllers, offline reconciliation and matrix fallback', { timeout: 45_000 }, async t => {
  const fx = await createFixture(t);
  const git = (cwd, ...args) => promisify(execFile)('git', args, { cwd, env: fx.env });
  await git(fx.workspace, 'init', '-q');
  await git(fx.workspace, '-c', 'user.name=fixture', '-c', 'user.email=fixture-bot',
    '-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-qm', 'fixture root');
  const linked = join(fx.root, 'linked');
  const nested = join(fx.workspace, 'nested');
  const plain = join(fx.workspace, 'plain');
  const declared = join(fx.workspace, 'declared');
  await git(fx.workspace, 'worktree', 'add', '--detach', linked);
  await Promise.all([mkdir(nested), mkdir(plain), mkdir(join(declared, '.chflow'), { recursive: true })]);
  await git(nested, 'init', '-q');
  await writeFile(join(declared, '.chflow', 'project.yaml'), 'project: app\nname: Fixture App\n');

  const launch = (cwd, args = [], caller = fx.caller) =>
    command(fx, ['start', '--kind', 'pi', '--cwd', cwd, ...args], { cwd, pane: caller });
  const home = await launch(fx.workspace);
  const checkout = await launch(linked);
  const independent = await launch(nested);
  const folder = await launch(plain);
  const appA = await launch(declared);
  const appB = await launch(declared, [], fx.otherCaller);
  const explicit = await launch(declared, ['--project', 'another']);
  assert.equal(checkout.project_id, home.project_id);
  assert.equal(new Set([home, independent, folder, appA, explicit].map(row => row.project_id)).size, 5);
  assert.equal(appA.project_id, 'app');
  assert.equal(appB.project_id, 'app');
  assert.equal(explicit.project_id, 'another');
  const overview = await command(fx, ['health']);
  const project = id => overview.projects.find(row => row.project_id === id);
  assert.equal(project(home.project_id).source, 'worktree');
  assert.equal(project(home.project_id).root, fx.workspace);
  assert.equal(project(independent.project_id).root, nested);
  assert.equal(project(folder.project_id).source, 'folder');
  assert.equal(project('app').name, 'Fixture App');
  assert.equal(project('app').source, 'config');
  assert.equal(project('another').source, 'override');
  assert.deepEqual(new Set(project('app').controllers), new Set([fx.caller, fx.otherCaller]));
  const filtered = await command(fx, ['list', '--panes', '--project', 'app']);
  assert.equal(filtered.project_filter, 'app');
  assert.deepEqual(filtered.projects.map(row => row.project_id), ['app']);
  assert.deepEqual(filtered.managed_panes.map(row => row.pane_id), [appA.pane_id, appB.pane_id]);

  const matrix = join(fx.root, 'matrix.yaml');
  await writeFile(matrix, [
    'channels:', '  - id: pi-primary', '    harness: pi', '  - id: claude-backup', '    harness: claude',
    'routing_rules:', '  fallback_chain:', '    - pi-primary', '    - claude-backup', '',
  ].join('\n'));
  fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
  fx.herdr.setAgent(fx.otherCaller, { agent_status: 'working' });
  const one = await command(fx, ['send', appA.pane_id, '--task', 'project-one', '--brief', 'First controller',
    '--matrix', matrix, '--channel', 'pi-primary'], { pane: fx.caller, cwd: declared });
  const two = await command(fx, ['send', appB.pane_id, '--task', 'project-two', '--brief', 'Second controller'],
    { pane: fx.otherCaller, cwd: declared });
  assert.equal(one.project_id, 'app');
  assert.equal(two.project_id, 'app');
  assert.equal(one.return_route.pane, fx.caller);
  assert.equal(two.return_route.pane, fx.otherCaller);
  assert.deepEqual(one.fallback.map(row => row.channel), ['claude-backup']);
  assert.equal((await command(fx, ['status', '--project', 'app'])).projects[0].active_tasks, 2);
  for (const row of [one, two]) {
    await command(fx, ['reply', row.task, '--ok', '--attempt', row.attempt, '--body', 'Fixture done'], { pane: row.pane_id }, [0, 2]);
  }
  assert.equal((await command(fx, ['prune', '--tasks', '--project', 'app'])).pruned_tasks, 0);
  fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
  fx.herdr.setAgent(fx.otherCaller, { agent_status: 'idle' });
  for (const [row, caller] of [[one, fx.caller], [two, fx.otherCaller]]) {
    await eventually(() => fx.herdr.prompts.some(p => p.pane === caller && p.text.includes('task=' + row.task + '#1')));
    assert.ok(!fx.herdr.prompts.some(p => p.pane !== caller && p.pane !== row.pane_id && p.text.includes('task=' + row.task + '#1')));
  }

  const worker = await launch(declared);
  const live = await command(fx, ['send', worker.pane_id, '--task', 'project-live', '--brief', 'Retry after loss',
    '--max-retries', '1', '--retry-backoff', '30'], { cwd: declared });
  fx.herdr.removeAgent(worker.pane_id);
  const transit = (await command(fx, ['health', '--project', 'app'])).managed_panes.find(row => row.pane_id === worker.pane_id);
  assert.equal(transit.live, false);
  assert.equal(transit.agent_status, 'offline');
  await command(fx, ['cancel', live.task]);
  fx.herdr.removeAgent(appA.pane_id);
  const state = (await command(fx, ['health', '--project', 'app', '--all']));
  assert.deepEqual(state.managed_panes.map(row => row.pane_id), [appB.pane_id]);
  assert.ok(state.tasks.some(row => row.task === one.task));
  const ui = await startUi(t, fx);
  assert.ok(!(await snapshot(ui.url)).managed_panes.some(row => row.pane_id === appA.pane_id));
  assert.equal((await command(fx, ['prune', '--tasks', '--project', 'app'])).pruned_tasks, 3);
  const after = await command(fx, ['list', '--all', '--project', 'app']);
  assert.deepEqual(after.tasks, []);
  assert.equal(await readFile(one.out, 'utf8'), 'Fixture done');
});

test('E2E-21 role lifecycle, guarded spawn, hot rebinding and UI/MCP actions', { timeout: 45_000 }, async t => {
  const fx = await createFixture(t);
  const declaration = join(fx.workspace, '.chflow');
  await mkdir(declaration);
  await writeFile(join(declaration, 'project.yaml'), [
    'project: role-app', 'name: Role App', 'roles:', '  backend:', '    description: Backend work',
    '    kind: codex', '    model: fixture-model', '    perm: readonly', '',
  ].join('\n'));
  const roleList = async () => (await command(fx, ['role', 'list'])).roles;
  const role = async name => (await roleList()).find(row => row.role === name);
  assert.equal((await role('backend')).source, 'config');
  assert.equal((await role('backend')).default_kind, 'codex');
  assert.equal((await role('backend')).binding_mode, 'unbound');
  await command(fx, ['role', 'set', 'backend', '--desc', 'Updated defaults']);
  assert.equal((await role('backend')).description, 'Updated defaults');
  const starts = fx.herdr.starts.length;
  const refused = await command(fx, ['send', 'backend', '--brief', 'Unbound'], undefined, [1]);
  assert.equal(refused.error.code, 'role_unbound');
  assert.equal(fx.herdr.starts.length, starts);
  const first = await command(fx, ['send', 'role-app/backend', '--spawn', '--brief', 'First role turn', '--task', 'role-thread']);
  assert.equal(first.turn, 1);
  assert.equal(first.project_id, 'role-app');
  assert.equal(first.role, 'backend');
  assert.equal(first.kind, 'codex');
  assert.equal(first.perm, 'readonly');
  assert.equal(fx.herdr.starts.length, starts + 1);
  assert.ok(fx.herdr.starts.at(-1).extra.includes('fixture-model'));
  assert.equal((await role('backend')).pane_id, first.pane_id);
  assert.equal((await role('backend')).active_task, first.task);
  assert.equal((await command(fx, ['role', 'unbind', 'backend'], undefined, [1])).error.code, 'role_busy');
  await command(fx, ['reply', first.task, '--ok', '--attempt', first.attempt, '--body', 'Turn one result'], { pane: first.pane_id }, [0, 2]);
  fx.herdr.removeAgent(first.pane_id);
  const offline = await role('backend');
  assert.equal(offline.binding_mode, 'unbound');
  assert.equal(offline.live, false);
  assert.equal(offline.agent_status, 'unbound');

  const newCwd = join(fx.root, 'alternate');
  await mkdir(newCwd);
  const secondWorker = 'w1:p55';
  fx.herdr.addAgent(secondWorker, { agent: 'claude', cwd: newCwd });
  const rebound = await command(fx, ['role', 'bind', 'backend', '--pane', secondWorker]);
  assert.equal(rebound.kind, 'claude');
  assert.equal(rebound.default_kind, 'codex');
  assert.equal(rebound.live, true);
  assert.equal((await role('backend')).pane_id, secondWorker);
  const second = await command(fx, ['send', 'backend', '--task', first.task, '--brief', 'Second role turn']);
  assert.equal(second.turn, 2);
  assert.equal(second.kind, 'claude');
  assert.equal(second.pane_id, secondWorker);
  assert.equal(second.mail, first.mail);
  assert.equal(await readFile(join(first.mail, 't2-brief.md'), 'utf8'), 'Second role turn');
  assert.equal(await readFile(first.brief, 'utf8'), 'First role turn');
  const stale = await command(fx, ['reply', second.task, '--ok', '--attempt', first.attempt], { pane: secondWorker }, [1]);
  assert.equal(stale.error.code, 'attempt_mismatch');
  await command(fx, ['reply', second.task, '--ok', '--attempt', second.attempt, '--body', 'Turn two result'], { pane: secondWorker }, [0, 2]);

  fx.herdr.setAgent(secondWorker, { agent_status: 'idle' });
  const third = await command(fx, ['role', 'bind', 'backend', '--spawn', '--close-old']);
  assert.notEqual(third.pane_id, secondWorker);
  assert.equal(fx.herdr.agents.has(secondWorker), false);
  fx.herdr.setAgent(third.pane_id, { terminal_id: 'replacement-terminal' });
  assert.equal((await role('backend')).binding_mode, 'unbound');
  assert.ok((await command(fx, ['health'])).unmanaged_live_agents.some(a => a.terminal_id === 'replacement-terminal'));
  await command(fx, ['role', 'remove', 'backend']);
  assert.equal((await role('backend')).source, 'config');

  await command(fx, ['role', 'set', 'tester', '--kind', 'claude']);
  assert.equal((await role('tester')).source, 'manual');
  const headless = await command(fx, ['role', 'bind', 'tester', '--headless']);
  assert.equal(headless.binding_mode, 'headless');
  await fx.writeExecutable('claude', '#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on("end",()=>console.log(JSON.stringify({type:"result",result:"Headless role output"})));\n');
  const head = await command(fx, ['send', 'tester', '--brief', 'Run headless role', '--wait']);
  assert.equal(head.project_id, 'role-app');
  assert.equal(head.role, 'tester');
  assert.equal(head.mode, 'headless');
  assert.equal(await readFile(head.out, 'utf8'), 'Headless role output');
  assert.equal((await command(fx, ['role', 'bind', 'tester', '--headless', '--kind', 'agy'], undefined, [1])).error.code,
    'compliance_blocked');
  await command(fx, ['role', 'remove', 'tester']);
  assert.equal(await role('tester'), undefined);

  const direct = await command(fx, ['start', '--kind', 'pi', '--project', 'role-app', '--role', 'direct']);
  assert.equal((await role('direct')).pane_id, direct.pane_id);
  const takeover = 'w1:p57';
  fx.herdr.addAgent(takeover, { agent: 'claude' });
  assert.equal((await command(fx, ['adopt', takeover, '--project', 'role-app', '--role', 'direct'])).role, 'direct');
  assert.equal((await role('direct')).pane_id, takeover);
  await command(fx, ['role', 'remove', 'direct']);
  assert.ok((await command(fx, ['health'])).managed_panes.some(p => p.pane_id === direct.pane_id && !p.role));

  await command(fx, ['role', 'set', 'attended-only', '--kind', 'agy']);
  const beforeRefusal = fx.herdr.starts.length;
  const blockedSpawn = await command(fx, ['send', 'attended-only', '--spawn', '--unattended', '--brief', 'Refuse this dispatch'], undefined, [1]);
  assert.equal(blockedSpawn.error.code, 'compliance_blocked');
  assert.equal(fx.herdr.starts.length, beforeRefusal);
  await command(fx, ['role', 'remove', 'attended-only']);

  const ui = await startUi(t, fx);
  const html = await (await fetch(ui.url + '/')).text();
  const token = html.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)?.[1];
  assert.ok(token);
  const headers = { Origin: ui.url, 'X-Chflow-Token': token, 'Content-Type': 'application/json' };
  const action = async (action, target, opts, code = 200) => {
    const reply = await jsonRequest(ui.url, '/api/action', { method: 'POST', headers, body: JSON.stringify({ action, target, opts }) });
    assert.equal(reply.status, code, action + ': ' + JSON.stringify(reply.body));
    return reply.body.data ?? reply.body.error;
  };
  const uiPane = 'w1:p56';
  fx.herdr.addAgent(uiPane, { cwd: newCwd });
  assert.equal((await action('role_set', 'operator', { project: 'role-app', kind: 'pi' })).binding_mode, 'unbound');
  assert.equal((await action('role_bind', 'operator', { project: 'role-app', pane: uiPane })).pane_id, uiPane);
  const uiTask = await action('send', 'operator', { project: 'role-app', brief: 'Run with UI role', task: 'operator-role' });
  assert.equal(uiTask.role, 'operator');
  assert.equal((await action('role_unbind', 'operator', { project: 'role-app' }, 409)).code, 'role_busy');
  await action('cancel', uiTask.task, {});
  assert.equal((await action('role_unbind', 'operator', { project: 'role-app' })).binding_mode, 'unbound');
  assert.equal((await action('assign_project', uiPane, { project: 'operator-project' })).project_id, 'operator-project');
  const scoped = await jsonRequest(ui.url, '/api/snapshot?project=operator-project');
  assert.equal(scoped.body.data.project_filter, 'operator-project');
  assert.deepEqual(scoped.body.data.managed_panes.map(pane => pane.pane_id), [uiPane]);
  assert.equal((await action('role_remove', 'operator', { project: 'role-app' })).removed, true);
  assert.ok((await action('prune', undefined, { tasks: true, project: 'role-app' })).pruned_tasks >= 1);

  const mcp = spawn(process.execPath, [fx.cliPath, 'mcp'], { cwd: fx.workspace, env: fx.env, stdio: 'pipe' });
  t.after(() => { if (mcp.exitCode === null && mcp.signalCode === null) mcp.kill(); });
  const ended = new Promise(resolve => mcp.once('close', resolve));
  const lines = createInterface({ input: mcp.stdout });
  const rpc = async (id, method, params) => {
    const next = new Promise(resolve => lines.once('line', resolve));
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    const line = await next;
    return { bytes: Buffer.byteLength(line), result: JSON.parse(line).result };
  };
  const list = await rpc(1, 'tools/list');
  assert.equal(list.result.tools.length, 19);
  assert.ok(list.bytes < 10_000, 'MCP tools/list bytes: ' + list.bytes);
  const call = await rpc(2, 'tools/call', { name: 'flow_role', arguments: { action: 'list', project: 'role-app' } });
  assert.deepEqual(call.result.structuredContent.data.roles.map(row => row.role), ['backend']);
  const set = await rpc(3, 'tools/call', { name: 'flow_role', arguments: { action: 'set', role: 'mcp-slot', kind: 'pi' } });
  assert.equal(set.result.structuredContent.data.role, 'mcp-slot');
  mcp.stdin.end();
  assert.equal(await ended, 0);
});

test('E2E-22 exited-agent live UI sync, passive WebUI idle exit, and explicit stop controls', { timeout: 45_000 }, async t => {
  // 1. Exited agent still present in Herdr pane list must sync out immediately via SSE.
  const fx = await createFixture(t, { env: { CHFLOW_IDLE_TIMEOUT_SEC: '0', CHFLOW_UI_IDLE_TIMEOUT_SEC: '0' } });
  const started = await command(fx, ['daemon', 'start']);
  const uiUrl = started.data.ui_url;
  const pageHtml = await (await fetch(uiUrl + '/')).text();
  assert.doesNotMatch(pageHtml, /[\u{1F300}-\u{1FAFF}]/u, 'Web UI HTML must use SVG icons instead of emojis');
  const csrf = pageHtml.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)?.[1];
  assert.ok(csrf);
  const stream = await events(t, uiUrl);
  const initial = await stream.next(s => s.herdr === 'reachable', 'Initial SSE snapshot missing');

  const strayPane = 'w1:p91';
  const rolePane = 'w1:p92';
  const busyPane = 'w1:p93';
  fx.herdr.addAgent(strayPane, { agent: 'codex', agent_status: 'idle' });
  fx.herdr.addAgent(rolePane, { agent: 'claude', agent_status: 'idle' });
  fx.herdr.addAgent(busyPane, { agent: 'pi', agent_status: 'idle' });
  const seenOnline = await stream.next(s => s.seq > initial.seq &&
    s.unmanaged_live_agents.some(a => a.pane_id === strayPane) &&
    s.unmanaged_live_agents.some(a => a.pane_id === rolePane), 'Live agents were not pushed');

  await command(fx, ['role', 'set', 'reviewer', '--kind', 'claude']);
  await command(fx, ['role', 'bind', 'reviewer', '--pane', rolePane]);
  const busyTask = await command(fx, ['send', busyPane, '--task', 'active-exit', '--brief', 'Keep running'], { pane: '' });
  assert.equal(busyTask.state, 'submitted');

  // Agent processes exit while Herdr panes remain open (agent_status === 'exited').
  fx.herdr.setAgent(strayPane, { agent_status: 'exited' });
  fx.herdr.setAgent(rolePane, { agent_status: 'exited' });
  fx.herdr.setAgent(busyPane, { agent_status: 'exited' });

  const synced = await stream.next(s => s.seq > seenOnline.seq &&
    !s.unmanaged_live_agents.some(a => a.pane_id === strayPane) &&
    !s.managed_panes.some(p => p.pane_id === rolePane) &&
    s.roles.some(r => r.role === 'reviewer' && r.binding_mode === 'unbound') &&
    s.managed_panes.some(p => p.pane_id === busyPane && p.live === false && p.agent_status === 'offline'),
    'Exited agent sessions did not sync immediately to UI');
  assert.equal(synced.roles.find(r => r.role === 'reviewer').live, false);

  // 2. Explicit stop guards active tasks unless forced (both CLI chflow stop and WebUI daemon_stop).
  const cliRefused = await command(fx, ['stop'], undefined, [1]);
  assert.equal(cliRefused.error.code, 'active_tasks');
  const headers = { Origin: uiUrl, 'X-Chflow-Token': csrf, 'Content-Type': 'application/json' };
  const uiRefused = await jsonRequest(uiUrl, '/api/action', {
    method: 'POST', headers, body: JSON.stringify({ action: 'daemon_stop', opts: {} }),
  });
  assert.equal(uiRefused.status, 409);
  assert.equal(uiRefused.body.error.code, 'active_tasks');

  const uiForced = await jsonRequest(uiUrl, '/api/action', {
    method: 'POST', headers, body: JSON.stringify({ action: 'daemon_stop', opts: { force: true } }),
  });
  assert.equal(uiForced.status, 200);
  const manualShutdown = await stream.nextShutdown('Manual daemon_stop did not emit SSE shutdown');
  assert.equal(manualShutdown.reason, 'manual');
  await eventually(() => access(join(fx.stateDir, 'daemon.json')).then(() => false, e => e.code === 'ENOENT'),
    { message: 'Daemon did not stop cleanly after WebUI daemon_stop' });

  // 3. Passive WebUI SSE tab with zero live sessions (all exited or closed) must auto-exit after CHFLOW_UI_IDLE_TIMEOUT_SEC.
  const idleFx = await createFixture(t, { env: { CHFLOW_IDLE_TIMEOUT_SEC: '2', CHFLOW_UI_IDLE_TIMEOUT_SEC: '2' } });
  for (const paneId of [...idleFx.herdr.agents.keys()]) idleFx.herdr.setAgent(paneId, { agent_status: 'exited' });
  const idleStart = await command(idleFx, ['daemon', 'start']);
  const idleStream = await events(t, idleStart.data.ui_url);
  await idleStream.next(s => s.herdr === 'reachable' && s.unmanaged_live_agents.length === 0, 'Idle fixture SSE did not connect');
  const idleShutdown = await idleStream.nextShutdown('Passive WebUI SSE did not receive idle shutdown event');
  assert.equal(idleShutdown.reason, 'idle');
  await eventually(() => access(join(idleFx.stateDir, 'daemon.json')).then(() => false, e => e.code === 'ENOENT'),
    { message: 'Daemon did not exit after passive WebUI idle timeout' });

  // 4. CLI chflow quit stops an idle daemon cleanly without --force.
  const quitFx = await createFixture(t, { env: { CHFLOW_IDLE_TIMEOUT_SEC: '0' } });
  await command(quitFx, ['daemon', 'start']);
  const stopped = await command(quitFx, ['quit']);
  assert.equal(stopped.running, false);
  await eventually(() => access(join(quitFx.stateDir, 'daemon.json')).then(() => false, e => e.code === 'ENOENT'),
    { message: 'Daemon did not stop cleanly after chflow quit' });
});

test('E2E-23 global role templates, lazy instantiation, readable Herdr labels and focus_pane', { timeout: 45_000 }, async t => {
  const fx = await createFixture(t);
  const projA = join(fx.root, 'proj-alpha');
  const projB = join(fx.root, 'proj-beta');
  await Promise.all([mkdir(projA, { recursive: true }), mkdir(projB, { recursive: true })]);

  // 1. Global role template CRUD in isolated XDG_CONFIG_HOME/chflow/roles.yaml (zero credentials).
  const created = await command(fx, ['role', 'set', 'reviewer', '--global', '--kind', 'claude', '--model', 'sonnet-tpl', '--perm', 'readonly', '--desc', 'Global diff reviewer'], { cwd: projA });
  assert.equal(created.scope, 'global');
  assert.equal(created.role, 'reviewer');
  assert.equal(created.default_kind, 'claude');
  assert.equal(created.default_perm, 'readonly');
  const globalYamlPath = join(fx.env.XDG_CONFIG_HOME, 'chflow', 'roles.yaml');
  const yamlText = await readFile(globalYamlPath, 'utf8');
  assert.match(yamlText, /reviewer:/);
  assert.match(yamlText, /kind: claude/);

  // Sensitive values must be blocked from global templates.
  const badSecret = await command(fx, ['role', 'set', 'leak', '--global', '--desc', 'contact me@example.org'], { cwd: projA }, [1]);
  assert.equal(badSecret.error.code, 'sensitive_input');

  // Global templates list via --global, but MUST NOT auto-pollute project roles (lazy instantiation).
  const listedGlobal = await command(fx, ['role', 'list', '--global'], { cwd: projA });
  assert.deepEqual(listedGlobal.global_roles.map(r => r.role), ['reviewer']);
  assert.deepEqual((await command(fx, ['role', 'list'], { cwd: projA })).roles, []);
  assert.deepEqual((await command(fx, ['role', 'list'], { cwd: projB })).roles, []);

  // 2. Lazy instantiation on send --spawn in projA inherits template defaults; projB stays untouched.
  const sent = await command(fx, ['send', 'reviewer', '--spawn', '--brief', 'Review alpha diff', '--task', 'alpha-review'], { cwd: projA });
  assert.equal(sent.role, 'reviewer');
  assert.equal(sent.kind, 'claude');
  assert.equal(sent.perm, 'readonly');
  assert.equal((await command(fx, ['role', 'list'], { cwd: projA })).roles.length, 1);
  assert.equal((await command(fx, ['role', 'list'], { cwd: projB })).roles.length, 0);

  // Project-level edit only overrides projA and does not mutate global template.
  await command(fx, ['role', 'set', 'reviewer', '--perm', 'auto-workspace', '--desc', 'Alpha-only reviewer'], { cwd: projA });
  assert.equal((await command(fx, ['role', 'list'], { cwd: projA })).roles[0].default_perm, 'auto-workspace');
  assert.equal((await command(fx, ['role', 'list', '--global'], { cwd: projA })).global_roles[0].default_perm, 'readonly');

  // Lazy instantiation on role bind --pane in projB inherits unmodified global template defaults.
  const betaPane = 'w2:p41';
  const dupPane = 'w2:p42';
  fx.herdr.setWorkspace('w2', 'LAB');
  fx.herdr.setTab('w2:tA', 'w2', 'Backend');
  fx.herdr.setTab('w2:tB', 'w2', 'Review');
  fx.herdr.addAgent(betaPane, { agent: 'agy', cwd: projB, workspace_id: 'w2', tab_id: 'w2:tA', name: betaPane });
  fx.herdr.addAgent(dupPane, { agent: 'agy', cwd: projB, workspace_id: 'w2', tab_id: 'w2:tB', name: dupPane });

  const health = await command(fx, ['health'], { cwd: projB });
  const unmA = health.unmanaged_live_agents.find(a => a.pane_id === betaPane);
  const unmB = health.unmanaged_live_agents.find(a => a.pane_id === dupPane);
  assert.equal(unmA.workspace_label, 'LAB');
  assert.equal(unmA.tab_label, 'Backend');
  assert.equal(unmA.location_label, 'LAB / Backend');
  assert.equal(unmA.harness_label, 'Antigravity');
  assert.notEqual(unmA.display_name, unmB.display_name, 'Duplicate folder+harness panes must be disambiguated');
  assert.ok(unmA.display_name.includes('proj-beta') && unmA.display_name.includes('Antigravity'));
  assert.ok(!unmA.display_name.includes('w2:p41'));

  const bound = await command(fx, ['role', 'bind', 'reviewer', '--pane', betaPane], { cwd: projB });
  assert.equal(bound.role, 'reviewer');
  assert.equal(bound.default_perm, 'readonly');
  assert.equal(bound.pane_id, betaPane);

  // 3. WebUI snapshot includes global_roles + readable labels, and focus_pane invokes herdr agent focus.
  const ui = await startUi(t, fx);
  const html = await (await fetch(ui.url + '/')).text();
  const token = html.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)?.[1];
  assert.ok(token);
  const headers = { Origin: ui.url, 'X-Chflow-Token': token, 'Content-Type': 'application/json' };
  const snap = await snapshot(ui.url);
  assert.ok(snap.global_roles.some(r => r.role === 'reviewer'));
  const managedBeta = snap.managed_panes.find(p => p.pane_id === betaPane);
  assert.equal(managedBeta.location_label, 'LAB / Backend');
  assert.equal(managedBeta.display_name, '@reviewer');

  const focusRes = await jsonRequest(ui.url, '/api/action', {
    method: 'POST', headers, body: JSON.stringify({ action: 'focus_pane', target: dupPane, opts: {} }),
  });
  assert.equal(focusRes.status, 200);
  assert.deepEqual(focusRes.body.data, { focused: true, pane_id: dupPane });
  assert.ok(fx.herdr.focuses.some(f => f.pane === dupPane));

  // WebUI global role template save + remove via API & CLI.
  const uiGlobal = await jsonRequest(ui.url, '/api/action', {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'role_set', target: 'docs-writer', opts: { global: true, kind: 'pi', perm: 'auto-workspace' } }),
  });
  assert.equal(uiGlobal.status, 200);
  assert.equal(uiGlobal.body.data.scope, 'global');
  assert.ok((await snapshot(ui.url)).global_roles.some(r => r.role === 'docs-writer'));
  const removed = await command(fx, ['role', 'remove', 'docs-writer', '--global'], { cwd: projA });
  assert.equal(removed.removed, true);
  assert.equal((await command(fx, ['role', 'list', '--global'], { cwd: projA })).global_roles.some(r => r.role === 'docs-writer'), false);

  // 4. MCP flow_role supports global templates while staying at 19 tools & < 10KB.
  const mcp = spawn(process.execPath, [fx.cliPath, 'mcp'], { cwd: projA, env: fx.env, stdio: 'pipe' });
  t.after(() => { if (mcp.exitCode === null && mcp.signalCode === null) mcp.kill(); });
  const ended = new Promise(resolve => mcp.once('close', resolve));
  const lines = createInterface({ input: mcp.stdout });
  const rpc = async (id, method, params) => {
    const next = new Promise(resolve => lines.once('line', resolve));
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    const line = await next;
    return { bytes: Buffer.byteLength(line), result: JSON.parse(line).result };
  };
  const list = await rpc(1, 'tools/list');
  assert.equal(list.result.tools.length, 19);
  assert.ok(list.bytes < 10_000, 'MCP tools/list bytes: ' + list.bytes);
  const gList = await rpc(2, 'tools/call', { name: 'flow_role', arguments: { action: 'list', global: true } });
  assert.ok(gList.result.structuredContent.data.global_roles.some(r => r.role === 'reviewer'));
  mcp.stdin.end();
  assert.equal(await ended, 0);
});
