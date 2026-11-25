import assert from 'node:assert/strict';
import { execFile as execFileCb, spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { createFixture, eventually } from './fake-herdr.mjs';
const execFile = promisify(execFileCb);

const env = { CHFLOW_EXIT_GRACE_MS: '70', CHFLOW_EXIT_STEP_MS: '45', CHFLOW_SHELL_SETTLE_MS: '15' };

async function command(fx, args, options, accepted = [0]) {
  const result = await fx.cli(args, options);
  assert.ok(accepted.includes(result.code), args.join(' ') + ': ' + result.stdout + result.stderr);
  return result.json;
}

async function startUi(t, fx, args = []) {
  const child = spawn(process.execPath, [fx.cliPath, 'ui', '--port', '0', '--json', ...args], {
    cwd: fx.workspace, env: fx.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => { if (child.exitCode === null) child.kill('SIGTERM'); await exited; });
  const lines = createInterface({ input: child.stdout });
  const info = await new Promise(resolve => lines.once('line', line => resolve(JSON.parse(line))));
  const html = await (await fetch(info.url + '/')).text();
  const token = html.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)[1];
  return {
    ...info,
    snapshot: async () => (await (await fetch(info.url + '/api/snapshot')).json()).data,
    action: async (action, target, opts = {}, status = 200) => {
      const r = await fetch(info.url + '/api/action', {
        method: 'POST',
        headers: { Origin: info.url, 'X-Chflow-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target, opts }),
      });
      const body = await r.json();
      assert.equal(r.status, status, action + ': ' + JSON.stringify(body));
      return body;
    },
  };
}

test('E2E-37 session boundaries, override lifecycle, legacy migration, and controller cleanup', { timeout: 90_000 }, async t => {
  await t.test('delayed agent_session latch + same-terminal replacement while daemon stopped prevents misattribution and auto_guard leak', async t => {
    const fx = await createFixture(t, { env });
    const projA = join(fx.root, 'proj-a');
    const projB = join(fx.root, 'proj-b');
    await Promise.all([mkdir(projA), mkdir(projB)]);

    const paneId = 'w1:p51';
    fx.herdr.addAgent(paneId, {
      agent: 'agy', name: 'agy-112233', cwd: projA, foreground_cwd: projA, agent_session: null,
    });
    const api = await startUi(t, fx);
    await api.action('adopt', paneId, { perm: 'yolo', attended: true });
    await api.action('set_perm', paneId, { perm: 'yolo' });

    // Herdr later reports the real session ID; sync() must latch it into SQLite.
    const sessA = { kind: 'id', value: 'sess-alpha-001' };
    fx.herdr.setAgent(paneId, { agent_session: sessA });
    await eventually(async () => {
      const s = await api.snapshot();
      return s.managed_panes.find(p => p.pane_id === paneId)?.agent_session?.value === sessA.value;
    }, { message: 'Delayed agent_session did not latch onto managed pane' });

    // Stop daemon; user exits old agy in w1:p51, cd's to projB, and starts a brand-new unrelated agy in the SAME terminal.
    await command(fx, ['daemon', 'stop']);
    const sessB = { kind: 'id', value: 'sess-yazi-999' };
    fx.herdr.setAgent(paneId, {
      name: undefined, cwd: projB, foreground_cwd: projB, agent_session: sessB,
      agent_status: 'blocked', screen: 'Requesting permission for: ls\nRun this command?\n❯ 1. Yes, allow',
    });

    const keysBefore = fx.herdr.keys.filter(k => k.pane === paneId).length;
    const h = await command(fx, ['health']);
    await sleep(300);
    assert.equal(fx.herdr.keys.filter(k => k.pane === paneId).length, keysBefore,
      'Stale yolo auto_guard must never fire on a replacement session');
    assert.equal(h.managed_panes.some(p => p.pane_id === paneId), false, 'Old managed pane must be pruned');
    const unm = h.unmanaged_live_agents.find(a => a.pane_id === paneId);
    assert.ok(unm, 'Replacement session must appear cleanly as unmanaged live agent');
    assert.equal(h.projects.find(p => p.project_id === unm.project_id)?.root, projB);
    assert.ok(h.audit.some(e => e.event === 'pane_session_changed' && e.detail === paneId));
    assert.equal(h.projects.some(p => p.root === projA && p.controllers.includes(paneId)), false);
  });

  await t.test('legacy DB row with missing agent_session and NULL-meta project_overrides self-heals on boot', async t => {
    const fx = await createFixture(t, { env });
    const projA = join(fx.root, 'legacy-proj-a');
    const projB = join(fx.root, 'legacy-proj-b');
    await Promise.all([mkdir(projA), mkdir(projB)]);

    const paneId = 'w1:p52';
    fx.herdr.addAgent(paneId, { agent: 'agy', cwd: projA, foreground_cwd: projA, agent_session: null });
    await command(fx, ['health']); // initialize sqlite schema
    await command(fx, ['daemon', 'stop']);

    // Seed exact pre-v3.6.2 stale DB state: no agent_session, self-controller, yolo auto_guard, legacy meta=NULL overrides.
    const db = new DatabaseSync(join(fx.stateDir, 'state.sqlite3'));
    const route = JSON.stringify({ socket: fx.socketPath });
    const projAId = 'legacy-proj-a-111111111111';
    db.prepare('INSERT OR REPLACE INTO projects VALUES(?,?)').run(projAId, JSON.stringify({
      project_id: projAId, name: 'legacy-proj-a', root: projA, source: 'folder',
    }));
    db.prepare('INSERT OR REPLACE INTO panes VALUES(?,?,?)').run(route, paneId, JSON.stringify({
      route: { socket: fx.socketPath },
      agent: {
        pane_id: paneId, terminal_id: `t-${paneId}`, name: 'agy-6228ce', agent: 'agy',
        cwd: projA, foreground_cwd: projA, revision: 500, state_change_seq: 800, agent_status: 'idle',
      },
      launch: { kind: 'agy', perm: 'yolo', attended: true },
      alias: 'agy-f54387',
      controller: { route: { socket: fx.socketPath }, pane: paneId, label: paneId, terminal: `t-${paneId}`, kind: 'agy' },
      adopted: true, native_perm: 'yolo', auto_guard: true,
    }));
    db.prepare('INSERT OR REPLACE INTO project_overrides (route,pane,terminal,project,meta) VALUES(?,?,?,?,NULL)')
      .run(route, paneId, `t-${paneId}`, projAId);
    db.prepare('INSERT OR REPLACE INTO project_overrides (route,pane,terminal,project,meta) VALUES(?,?,?,?,NULL)')
      .run(route, 'w1:p999', 't-dead-999', projAId);
    db.close();

    // Live Herdr now has a brand-new unrelated session on w1:p52 in projB.
    fx.herdr.setAgent(paneId, {
      name: undefined, cwd: projB, foreground_cwd: projB,
      agent_session: { kind: 'id', value: 'fresh-yazi-session' },
      agent_status: 'blocked', screen: 'Requesting permission for: ls\nRun this command?\n❯ 1. Yes, allow',
    });

    const keysBefore = fx.herdr.keys.filter(k => k.pane === paneId).length;
    const h = await command(fx, ['health']);
    await sleep(300);
    assert.equal(fx.herdr.keys.filter(k => k.pane === paneId).length, keysBefore);
    assert.equal(h.managed_panes.some(p => p.pane_id === paneId), false);
    const unm = h.unmanaged_live_agents.find(a => a.pane_id === paneId);
    assert.ok(unm);
    assert.equal(h.projects.find(p => p.project_id === unm.project_id)?.root, projB);
    assert.equal(h.projects.some(p => p.project_id === projAId), false);

    // Confirm both stale and orphan project_overrides were purged from SQLite.
    const checkDb = new DatabaseSync(join(fx.stateDir, 'state.sqlite3'), { readOnly: true });
    assert.deepEqual(checkDb.prepare('SELECT pane FROM project_overrides').all(), []);
    checkDb.close();
  });

  await t.test('project_overrides clears on exit, release_pane, and role unbind so reused terminals belong to their real cwd', async t => {
    const fx = await createFixture(t, { env });
    const projA = join(fx.root, 'ov-a');
    const projB = join(fx.root, 'ov-b');
    const projC = join(fx.root, 'ov-c');
    await Promise.all([mkdir(projA), mkdir(projB), mkdir(projC)]);

    const paneId = 'w1:p53';
    fx.herdr.addAgent(paneId, { agent: 'pi', cwd: projB, foreground_cwd: projB });
    const api = await startUi(t, fx);

    // Bind w1:p53 (in projB) to a role in projA -> pins override to projA.
    await command(fx, ['role', 'set', 'worker', '--kind', 'pi'], { cwd: projA });
    await command(fx, ['role', 'bind', 'worker', '--pane', paneId], { cwd: projA });
    const projAId = (await command(fx, ['health'], { cwd: projA })).current_project;
    assert.equal((await api.snapshot()).managed_panes.find(p => p.pane_id === paneId).project_id, projAId);

    // Agent exits -> role unbinds, pane prunes, override clears.
    fx.herdr.setAgent(paneId, { agent_status: 'exited' });
    await eventually(async () => !(await api.snapshot()).managed_panes.some(p => p.pane_id === paneId));

    // User reuses the SAME terminal for a new session in projC -> MUST belong to projC, NOT projA.
    fx.herdr.setAgent(paneId, {
      agent_status: 'idle', cwd: projC, foreground_cwd: projC,
      agent_session: { kind: 'path', value: join(projC, 'sess-c.jsonl') },
    });
    const afterReopen = await api.snapshot();
    const unm = afterReopen.unmanaged_live_agents.find(a => a.pane_id === paneId);
    assert.ok(unm);
    assert.equal(afterReopen.projects.find(p => p.project_id === unm.project_id)?.root, projC);

    // Explicit assign_project followed by release_pane clears override and reverts to projC.
    await api.action('adopt', paneId, {});
    await api.action('assign_project', paneId, { project: projAId });
    assert.equal((await api.snapshot()).managed_panes.find(p => p.pane_id === paneId).project_id, projAId);
    await api.action('release_pane', paneId, {});
    const afterRelease = await api.snapshot();
    const released = afterRelease.unmanaged_live_agents.find(a => a.pane_id === paneId);
    assert.equal(afterRelease.projects.find(p => p.project_id === released.project_id)?.root, projC);
  });

  await t.test('exited and replaced controllers leave projects immediately and never impersonate new sessions', async t => {
    const fx = await createFixture(t, { env });
    const projA = join(fx.root, 'ctrl-a');
    const projB = join(fx.root, 'ctrl-b');
    await Promise.all([mkdir(projA), mkdir(projB)]);

    const ctrlPane = 'w1:p61';
    const workerPane = 'w1:p62';
    fx.herdr.addAgent(ctrlPane, { agent: 'agy', cwd: projA, foreground_cwd: projA, agent_session: { kind: 'id', value: 'ctrl-old' } });
    fx.herdr.addAgent(workerPane, { agent: 'pi', cwd: projA, foreground_cwd: projA });

    const api = await startUi(t, fx);
    await command(fx, ['adopt', workerPane], { cwd: projA, pane: ctrlPane });
    assert.ok((await api.snapshot()).controller_views.some(c => c.pane_id === ctrlPane && c.live));

    // Controller exits while idle worker stays online -> stale controller reference MUST be cleared from worker and UI.
    fx.herdr.setAgent(ctrlPane, { agent_status: 'exited' });
    await eventually(async () => {
      const s = await api.snapshot();
      const w = s.managed_panes.find(p => p.pane_id === workerPane);
      return !w?.controller && !s.controller_views.some(c => c.pane_id === ctrlPane);
    }, { message: 'Exited controller reference was not cleared from idle worker' });

    // Now test pending receipt on an exited controller when a brand-new unrelated session starts in the SAME pane.
    fx.herdr.setAgent(ctrlPane, { agent_status: 'working', agent_session: { kind: 'id', value: 'ctrl-task-owner' } });
    const task = await command(fx, ['send', workerPane, '--task', 'pending-receipt-ctrl', '--brief', 'Finish while owner exits'], {
      cwd: projA, pane: ctrlPane,
    });
    fx.herdr.setAgent(ctrlPane, { agent_status: 'exited' });
    await command(fx, ['reply', task.task, '--attempt', task.attempt, '--ok', '--body', 'Done'], { pane: workerPane });
    // Replacement session starts in ctrlPane under projB.
    fx.herdr.setAgent(ctrlPane, {
      agent_status: 'idle', cwd: projB, foreground_cwd: projB,
      agent_session: { kind: 'id', value: 'ctrl-unrelated-b' },
    });
    const snap = await api.snapshot();
    const oldCtrlView = snap.controller_views.find(c => c.pane_id === ctrlPane && c.project_id === task.project_id);
    assert.ok(oldCtrlView, 'Offline controller with pending receipt stays visible for receipt handling');
    assert.equal(oldCtrlView.live, false, 'Replacement session in same pane must NOT make old controller appear live');
    assert.equal(oldCtrlView.agent_status, 'offline');
    const freshUnm = snap.unmanaged_live_agents.find(a => a.pane_id === ctrlPane);
    assert.ok(freshUnm, 'Replacement session still appears cleanly in unmanaged_live_agents');
    assert.equal(snap.projects.find(p => p.project_id === freshUnm.project_id)?.root, projB);
  });

  await t.test('restart_rolled_back prunes on exit while restart_failed yields when a new session appears', async t => {
    const fx = await createFixture(t, { env });
    const p1 = await command(fx, ['start', 'rb-worker', '--kind', 'pi', '--perm', 'ask']);
    fx.herdr.failNext('agent.start', { code: 'spawn_failed' });
    fx.herdr.failNext('agent.start', { code: 'spawn_failed' });
    const rolled = await command(fx, ['switch', p1.pane_id, '--perm', 'readonly', '--restart', '--timeout', '4'], undefined, [1]);
    assert.equal(rolled.error.code, 'restart_rolled_back');
    assert.equal((await command(fx, ['health'])).managed_panes.find(x => x.pane_id === p1.pane_id).last_restart_error, 'spawn_failed');
    // When user later exits the rolled-back pane, last_restart_error must NOT block sync() from pruning it.
    fx.herdr.setAgent(p1.pane_id, { agent_status: 'exited' });
    assert.equal((await command(fx, ['health'])).managed_panes.some(x => x.pane_id === p1.pane_id), false);

    // When rollback itself fails (restart_failed=true), it stays while offline, but yields immediately if a different session starts.
    const p2 = await command(fx, ['start', 'rf-worker', '--kind', 'pi', '--perm', 'ask']);
    for (let i = 0; i < 3; i++) fx.herdr.failNext('agent.start', { code: 'spawn_failed' });
    const failed = await command(fx, ['switch', p2.pane_id, '--perm', 'readonly', '--restart', '--timeout', '4'], undefined, [1]);
    assert.equal(failed.error.code, 'restart_failed');
    assert.equal((await command(fx, ['health'])).managed_panes.some(x => x.pane_id === p2.pane_id), true);
    fx.herdr.setAgent(p2.pane_id, {
      agent_status: 'idle', agent: 'agy', name: undefined,
      agent_session: { kind: 'id', value: 'manual-replacement-agy' },
    });
    const afterReplace = await command(fx, ['health']);
    assert.equal(afterReplace.managed_panes.some(x => x.pane_id === p2.pane_id), false);
    assert.ok(afterReplace.unmanaged_live_agents.some(a => a.pane_id === p2.pane_id && a.kind === 'agy'));
  });

  await t.test('embedded WebUI omits empty daemon-boot folder and does not freeze stale caller across projects', async t => {
    const fx = await createFixture(t, { env: { ...env, CHFLOW_UI_PORT: '0' } });
    const bootDir = join(fx.root, 'empty-boot');
    const otherProj = join(fx.root, 'real-proj');
    await Promise.all([mkdir(bootDir), mkdir(otherProj)]);

    // Remove default fixture agents so only otherProj has a live session.
    fx.herdr.removeAgent(fx.caller);
    fx.herdr.removeAgent(fx.otherCaller);
    const livePane = 'w1:p68';
    fx.herdr.addAgent(livePane, { agent: 'codex', cwd: otherProj, foreground_cwd: otherProj });

    const started = await command(fx, ['daemon', 'start'], { cwd: bootDir, pane: fx.caller });
    const uiUrl = started.data.ui_url;
    const html = await (await fetch(uiUrl + '/')).text();
    const token = html.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)[1];
    const snap = (await (await fetch(uiUrl + '/api/snapshot')).json()).data;
    assert.equal(snap.projects.some(p => p.root === bootDir), false, 'Empty daemon-boot directory must not pollute WebUI projects');
    assert.equal(snap.projects.some(p => p.root === otherProj), true);

    // Adopting livePane from embedded WebUI must not attach stale fx.caller or create a project_override.
    const adopted = await (await fetch(uiUrl + '/api/action', {
      method: 'POST',
      headers: { Origin: uiUrl, 'X-Chflow-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'adopt', target: livePane, opts: {} }),
    })).json();
    assert.equal(adopted.ok, true);
    assert.equal(adopted.data.controller, null);
    const db = new DatabaseSync(join(fx.stateDir, 'state.sqlite3'), { readOnly: true });
    assert.deepEqual(db.prepare('SELECT * FROM project_overrides').all(), []);
    db.close();
  });
});

test('E2E-38 agy file edit confirmation prompts approve under both auto-workspace and yolo', { timeout: 60_000 }, async t => {
  const fx = await createFixture(t, { env });
  const agyPane = 'w1:p88';
  fx.herdr.addAgent(agyPane, { agent: 'agy', name: 'agy-edit-test' });
  const api = await startUi(t, fx);
  await api.action('adopt', agyPane, { perm: 'auto-workspace', attended: true });
  await api.action('set_perm', agyPane, { perm: 'auto-workspace' });

  const keyCount = () => fx.herdr.keys.filter(k => k.pane === agyPane).length;
  const trigger = async (screen, expectApproved, expectedDetail) => {
    const before = keyCount();
    const prevAudit = (await api.snapshot()).audit[0]?.id ?? 0;
    const seq = fx.herdr.agents.get(agyPane).state_change_seq + 1;
    fx.herdr.setAgent(agyPane, { agent_status: 'blocked', screen, state_change_seq: seq });
    if (expectApproved) {
      await eventually(async () => (await api.snapshot()).audit.some(
        a => a.id > prevAudit && a.event === 'pane_auto_approved' && a.detail === agyPane + ' seq=' + seq,
      ), { message: 'Expected auto-approval for: ' + screen });
      assert.equal(keyCount(), before + 1);
      assert.deepEqual(fx.herdr.keys.filter(k => k.pane === agyPane).at(-1).keys, ['enter']);
    } else {
      await eventually(async () => (await api.snapshot()).audit.some(
        a => a.id > prevAudit && a.event === 'pane_auto_approve_skipped' && a.detail === agyPane + ' ' + expectedDetail,
      ), { message: 'Expected skip (' + expectedDetail + ') for: ' + screen });
      assert.equal(keyCount(), before);
    }
  };

  const fileEditPrompt = [
    'ask_user_question: stale question from earlier turn',
    'Select an option · Enter to select',
    '',
    'Accept this file edit?',
    '❯ 1. Yes',
    '  2. Yes, allow all edits during this session',
    '  3. No',
    'Use arrow keys · Enter to select · Esc to cancel',
  ].join('\n');

  await trigger(fileEditPrompt, true);
  await trigger('Do you want to make this edit to src/app.ts?\n❯ 1. Yes\n  2. No\nEnter to select · Esc to cancel', true);
  await trigger('Accept this file edit?\n❯ 2. Yes, allow all edits for this session\nEnter to select', false, 'unsafe_selection');
  await trigger('Accept this file edit?\n❯ 3. Reject\nEnter to select', false, 'unsafe_selection');
  await trigger('ask_user_question: Which file format do you prefer?\n❯ 1. JSON\n  2. YAML\nEnter to select', false, 'kind=question');

  // Switch to yolo: Accept this file edit? must approve even with interactive footer; genuine ask_question must still hold.
  fx.herdr.setAgent(agyPane, { agent_status: 'idle' });
  await api.action('set_perm', agyPane, { perm: 'yolo' });
  await trigger(fileEditPrompt, true);
  await trigger('Accept this file edit?\n❯ 2. Yes, allow all edits during this session\nUse arrow keys · Enter to select · Esc to cancel', true);
  await trigger('ask_user_question: Which file format do you prefer?\n❯ 1. JSON\n  2. YAML\nEnter to select', false, 'kind=question');
});

test('E2E-39 embedded agy adoption, manual folder controllers, project switching, and persistent project.yaml', { timeout: 90_000 }, async t => {
  await t.test('embedded WebUI adopts agy cleanly as controller or worker, and projects manual sessions as observed controllers', async t => {
    const fx = await createFixture(t, { env: { ...env, CHFLOW_UI_PORT: '0' } });
    const projDir = join(fx.root, 'manual-app');
    const otherDir = join(fx.root, 'other-app');
    await Promise.all([mkdir(projDir), mkdir(otherDir)]);
    fx.herdr.removeAgent(fx.caller);
    fx.herdr.removeAgent(fx.otherCaller);

    const agyPane = 'w1:p71';
    fx.herdr.addAgent(agyPane, { agent: 'agy', cwd: projDir, foreground_cwd: projDir });

    const started = await command(fx, ['daemon', 'start'], { cwd: otherDir, pane: '' });
    const uiUrl = started.data.ui_url;
    const html = await (await fetch(uiUrl + '/')).text();
    const token = html.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)[1];
    const snap = async () => (await (await fetch(uiUrl + '/api/snapshot')).json()).data;
    const post = async (action, target, opts = {}, status = 200) => {
      const r = await fetch(uiUrl + '/api/action', {
        method: 'POST',
        headers: { Origin: uiUrl, 'X-Chflow-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target, opts }),
      });
      const body = await r.json();
      assert.equal(r.status, status, action + ': ' + JSON.stringify(body));
      return body;
    };

    // 1. Manual agy session auto-projects as an observed folder-level controller (zero-intrusion).
    const initial = await snap();
    const obs = initial.controller_views.find(c => c.pane_id === agyPane);
    assert.ok(obs, 'Manual session must auto-project into controller_views');
    assert.equal(obs.observed, true);
    assert.equal(obs.managed, false);
    assert.equal(obs.live, true);
    assert.equal(initial.projects.find(p => p.project_id === obs.project_id)?.root, projDir);

    // 2. Embedded WebUI default adopt on agy (perm=ask) succeeds without Pass --attended error; elevated perm without attended still blocked.
    await post('adopt', agyPane, { perm: 'yolo' }, 403);
    const adoptedCtrl = await post('adopt', agyPane, { as_controller: true });
    assert.equal(adoptedCtrl.ok, true);
    assert.equal(adoptedCtrl.data.controller.pane, agyPane);
    const afterCtrl = await snap();
    const managedCtrl = afterCtrl.controller_views.find(c => c.pane_id === agyPane);
    assert.equal(managedCtrl.managed, true);
    assert.equal(managedCtrl.observed, false);
    assert.equal(afterCtrl.managed_panes.find(p => p.pane_id === agyPane).is_controller, true);

    // 3. Switching to elevated perm with attended=true succeeds and stays in controller column.
    await post('adopt', agyPane, { as_controller: true, perm: 'auto-workspace', attended: true });
    assert.equal((await snap()).controller_views.find(c => c.pane_id === agyPane).perm, 'auto-workspace');

    // 4. Converting to temporary worker moves pane out of controller_views into worker managed_panes.
    await post('adopt', agyPane, { as_controller: false, attended: true });
    const afterWorker = await snap();
    assert.equal(afterWorker.managed_panes.find(p => p.pane_id === agyPane).is_controller, false);
    assert.equal(afterWorker.controller_views.some(c => c.pane_id === agyPane), false);

    // 5. Explicit assign_project to custom ID + reset back to directory default.
    await post('assign_project', agyPane, { project: 'custom-target' });
    let reassigned = await snap();
    assert.equal(reassigned.managed_panes.find(p => p.pane_id === agyPane).project_id, 'custom-target');
    assert.equal(reassigned.managed_panes.find(p => p.pane_id === agyPane).overridden_project, true);
    await post('assign_project', agyPane, { reset: true });
    reassigned = await snap();
    assert.equal(reassigned.managed_panes.find(p => p.pane_id === agyPane).project_id, obs.project_id);
    assert.equal(reassigned.managed_panes.find(p => p.pane_id === agyPane).overridden_project, false);

    // 6. Release returns pane to observed manual controller cleanly.
    await post('release_pane', agyPane, {});
    const afterRelease = await snap();
    assert.equal(afterRelease.managed_panes.some(p => p.pane_id === agyPane), false);
    const obsAgain = afterRelease.controller_views.find(c => c.pane_id === agyPane);
    assert.equal(obsAgain.observed, true);
    assert.equal(obsAgain.managed, false);
  });

  await t.test('persistent .chflow/project.yaml via WebUI and CLI auto-syncs roles and auto-discovers on fresh boot', async t => {
    const fx = await createFixture(t, { env: { ...env, CHFLOW_UI_PORT: '0' } });
    const repoDir = join(fx.root, 'persisted-repo');
    const subDir = join(repoDir, 'packages', 'sub');
    await mkdir(subDir, { recursive: true });
    await execFile('git', ['init', '-q'], { cwd: repoDir, env: fx.env });

    const paneId = 'w1:p72';
    fx.herdr.addAgent(paneId, { agent: 'codex', cwd: repoDir, foreground_cwd: repoDir });
    const started = await command(fx, ['daemon', 'start'], { cwd: repoDir, pane: '' });
    const uiUrl = started.data.ui_url;
    const html = await (await fetch(uiUrl + '/')).text();
    const token = html.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)[1];
    const snap = async () => (await (await fetch(uiUrl + '/api/snapshot')).json()).data;
    const post = async (action, target, opts = {}, status = 200) => {
      const r = await fetch(uiUrl + '/api/action', {
        method: 'POST',
        headers: { Origin: uiUrl, 'X-Chflow-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target, opts }),
      });
      const body = await r.json();
      assert.equal(r.status, status, action + ': ' + JSON.stringify(body));
      return body;
    };

    // Create a role before persisting, then persist via WebUI project_persist.
    const initialProj = (await snap()).projects.find(p => p.root === repoDir).project_id;
    await post('role_set', 'backend', { project: initialProj, kind: 'pi', perm: 'auto-workspace', desc: 'API service' });
    const persisted = await post('project_persist', undefined, { cwd: repoDir, project: 'my-repo', name: 'My Repo' });
    assert.equal(persisted.data.project.project_id, 'my-repo');
    assert.equal(persisted.data.project.source, 'config');

    const yamlPath = join(repoDir, '.chflow', 'project.yaml');
    let yaml = await readFile(yamlPath, 'utf8');
    assert.match(yaml, /^# chflow-project: managed/m);
    assert.match(yaml, /project: my-repo/);
    assert.match(yaml, /name: "My Repo"/);
    assert.match(yaml, /backend:/);
    const exclude = await readFile(join(repoDir, '.git', 'info', 'exclude'), 'utf8');
    assert.match(exclude, /^\.chflow\/$/m);

    // Adding & removing roles in a managed config project auto-syncs .chflow/project.yaml.
    await post('role_set', 'reviewer', { project: 'my-repo', kind: 'claude', perm: 'readonly', desc: 'Code review' });
    yaml = await readFile(yamlPath, 'utf8');
    assert.match(yaml, /reviewer:/);
    await post('role_remove', 'backend', { project: 'my-repo' });
    yaml = await readFile(yamlPath, 'utf8');
    assert.doesNotMatch(yaml, /backend:/);
    assert.match(yaml, /reviewer:/);

    // CLI chflow project init also works on a second directory.
    const cliDir = join(fx.root, 'cli-persisted');
    await mkdir(cliDir);
    const cliInit = await command(fx, ['project', 'init', 'cli-app', '--name', 'CLI App'], { cwd: cliDir });
    assert.equal(cliInit.project.project_id, 'cli-app');
    assert.match(await readFile(join(cliDir, '.chflow', 'project.yaml'), 'utf8'), /project: cli-app/);

    // Fresh daemon startup + launching a manual session in a subdirectory auto-confirms my-repo & draws its persisted roles.
    await command(fx, ['daemon', 'stop']);
    const subPane = 'w1:p73';
    fx.herdr.removeAgent(paneId);
    fx.herdr.addAgent(subPane, { agent: 'agy', cwd: subDir, foreground_cwd: subDir });
    const freshHealth = await command(fx, ['health']);
    const proj = freshHealth.projects.find(p => p.project_id === 'my-repo');
    assert.ok(proj, 'Subdirectory session must auto-discover persisted my-repo');
    assert.equal(proj.source, 'config');
    assert.equal(proj.config_managed, true);
    assert.ok(freshHealth.roles.some(r => r.project_id === 'my-repo' && r.role === 'reviewer'));
    assert.ok(freshHealth.controller_views.some(c => c.project_id === 'my-repo' && c.pane_id === subPane && c.observed === true));
  });
});
