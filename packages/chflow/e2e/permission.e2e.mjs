import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { activePromptText, approveKey, classifyBlock } from '../dist/approval.js';
import { allowedWorkspaceModes, defaultWorkspaceMode, effectivePermMode, launch, workspaceMode } from '../dist/harnesses.js';
import { createFixture, eventually } from './fake-herdr.mjs';

test('E2E-29 permission classification scopes the current frame and yolo bypasses wording and cursor filters', () => {
  for (const stale of ['ask_user_question: old question', 'select an option', 'pi-ask-user: previous turn']) {
    for (const header of ['Requesting permission', 'Permission required', 'Allow execution']) {
      const raw = `${stale}\n\n\x1b[36m${header}\x1b[0m\nprintf ok > /dev/null\n❯ 1. Yes, allow\n` +
        '────────────────────────\n~/…/project · accept-edits';
      assert.equal(classifyBlock(raw), 'permission');
      assert.ok(!activePromptText(raw).includes(stale));
      assert.ok(!activePromptText(raw).includes('~/…/project'));
    }
  }
  for (const question of ['ask_user_question: Allow execution?', 'pi-ask-user: Run shell command?',
    'User question: should we request permission?', 'request_user_input: Confirm execution?',
    'Choose a direction; select an option', 'Type something', 'Space to toggle'])
    assert.equal(classifyBlock(question), 'question', question);
  assert.equal(classifyBlock('Vendor-specific opaque tool gate'), 'unknown');

  for (const kind of ['codex', 'claude', 'agy', 'pi']) {
    for (const cursor of ['❯', '›', '>', '▸', '▶']) {
      for (const choice of ['No', 'Deny', 'Cancel', 'Always', 'Allow always', 'Allow for this session',
        'Allow in this session', 'Yes, and allow all', 'Yes, allow for this session']) {
        const screen = `Permission required\n${cursor} 1. ${choice}`;
        assert.equal(approveKey(kind, screen, false), undefined, `${kind}: ${screen}`);
        assert.equal(approveKey(kind, screen, true), 'enter', `${kind} passthrough: ${screen}`);
      }
    }
    assert.equal(approveKey(kind, 'Vendor-specific opaque tool gate', true), 'enter');
    for (const hint of ['[y/n]', '(y/n)', 'press y', 'type y']) {
      assert.equal(approveKey(kind, hint, false), 'y');
      assert.equal(approveKey(kind, hint, true), 'y');
    }
    assert.equal(approveKey(kind, 'type yes to approve', false), undefined);
    assert.equal(approveKey(kind, 'type yes to approve', true), 'enter');
  }
});

test('E2E-32 workspace mode compatibility and configured/headless role projections', async t => {
  for (const kind of ['agy', 'claude', 'codex']) {
    const base = defaultWorkspaceMode(kind), alternate = kind === 'codex' ? 'approve-for-me' : 'auto';
    assert.deepEqual(allowedWorkspaceModes(kind), [base, alternate]);
    assert.equal(effectivePermMode(kind, 'auto-workspace', 'auto-workspace'), 'native', 'Legacy native workspace panes resolve their default base');
    assert.equal(effectivePermMode(kind, 'auto-workspace', 'auto-workspace', alternate, base), 'proxy');
    assert.equal(effectivePermMode(kind, 'auto-workspace', 'auto', alternate), 'native');
    assert.equal(effectivePermMode(kind, 'auto-workspace', 'auto', base), 'proxy');
    assert.equal(effectivePermMode(kind, 'auto', 'auto-workspace', undefined, alternate), 'native');
    assert.equal(effectivePermMode(kind, 'auto', 'auto-workspace', undefined, base), 'restart_required');
    assert.equal(effectivePermMode(kind, 'auto', 'unknown'), 'restart_required');
    for (const perm of ['ask', 'auto', 'auto-workspace', 'yolo'])
      assert.equal(effectivePermMode(kind, perm, 'readonly'), 'restart_required');
    assert.equal(effectivePermMode(kind, 'ask', 'auto'), 'restart_required');
    assert.equal(effectivePermMode(kind, 'yolo', 'auto'), 'proxy');
  }
  assert.equal(workspaceMode('claude', 'acceptEdits'), 'accept-edits');
  assert.equal(launch('codex', {}, { kind: 'agy', perm: 'auto-workspace', workspace_mode: 'auto' }).workspace_mode, undefined);
  for (const perm of ['ask', 'auto', 'auto-workspace', 'yolo']) assert.equal(effectivePermMode('pi', perm, 'ask'), 'native');
  assert.throws(() => workspaceMode('pi', 'auto'), { code: 'invalid_args' });
  const fx = await createFixture(t);
  await mkdir(join(fx.workspace, '.chflow'), { recursive: true });
  await writeFile(join(fx.workspace, '.chflow', 'project.yaml'),
    'project: tiered-permissions\nroles:\n  native-workspace:\n    kind: claude\n    perm: auto-workspace\n    workspace_mode: auto\n');
  const roles = await fx.cli(['role', 'list']);
  assert.equal(roles.code, 0, roles.stderr);
  assert.equal(roles.json.roles[0].default_workspace_mode, 'auto');
  const bound = await fx.cli(['role', 'bind', 'native-workspace', '--headless']);
  assert.equal(bound.code, 0, bound.stderr);
  assert.equal(bound.json.workspace_mode, 'auto');
  assert.equal(bound.json.native_workspace_mode, 'auto');
  assert.equal(bound.json.perm_mode, 'native');
});

test('E2E-34 ask_question menus stay human-controlled under yolo and permission footers remain approvable', async t => {
  const menu = 'ask_question\nQuestion 1 of 2\nWhich approach?\n❯ 1. Fast (Recommended)\n  2. Other (type your own)\nUse arrow keys · Enter to select · Esc to cancel';
  const permission = 'Requesting permission\nRun this command?\n❯ 1. Yes, allow\nEsc to cancel';
  assert.equal(classifyBlock(menu), 'question');
  assert.equal(classifyBlock('ask_question: Do you want to allow this tool?\nEnter to select'), 'question');
  assert.equal(classifyBlock('ask_question: old turn\n' + permission), 'permission');
  assert.equal(classifyBlock(permission), 'permission');
  for (const hint of ['Enter to select', 'Esc to cancel', 'Use arrow keys', 'Choose an option', 'Select one', 'Type your own', 'Question 2 of 3', '(Recommended)', 'Other (type something)'])
    assert.equal(classifyBlock('Choose a direction\n' + hint), 'question', hint);
  const fx = await createFixture(t);
  const pane = 'w1:p98';
  fx.herdr.addAgent(pane, { agent: 'agy' });
  const adopted = await fx.cli(['adopt', pane, '--perm', 'yolo', '--attended']);
  assert.equal(adopted.code, 0, adopted.stderr);
  fx.herdr.setAgent(pane, { agent_status: 'blocked', screen: menu });
  await eventually(async () => {
    const result = await fx.cli(['health']);
    return result.json.audit.some(e => e.event === 'pane_auto_approve_skipped' && e.detail === pane + ' kind=question');
  });
  assert.equal(fx.herdr.keys.filter(k => k.pane === pane).length, 0);
  const permissionSeq = fx.herdr.setAgent(pane, { agent_status: 'blocked', screen: permission, state_change_seq: fx.herdr.agents.get(pane).state_change_seq + 1 }).state_change_seq;
  await eventually(() => fx.herdr.keys.find(k => k.pane === pane));
  assert.deepEqual(fx.herdr.keys.find(k => k.pane === pane).keys, ['enter']);
  await eventually(async () => (await fx.cli(['health'])).json.audit.some(e => e.event === 'pane_auto_approved' && e.detail === pane + ' seq=' + permissionSeq));
  fx.herdr.setAgent(pane, { agent_status: 'idle' });
  const sent = await fx.cli(['send', pane, '--task', 'human-menu', '--brief', 'Wait for a human choice.', '--perm', 'yolo', '--attended']);
  assert.equal(sent.code, 0, sent.stderr);
  fx.herdr.setAgent(pane, { agent_status: 'blocked', screen: menu });
  await eventually(async () => (await fx.cli(['inspect', sent.json.task])).json.block?.kind === 'question');
  assert.equal(fx.herdr.keys.filter(k => k.pane === pane).length, 1, 'Task-bearing yolo must preserve user questions');
  fx.herdr.setAgent(pane, { agent_status: 'blocked', screen: permission, state_change_seq: fx.herdr.agents.get(pane).state_change_seq + 1 });
  await eventually(() => fx.herdr.keys.filter(k => k.pane === pane).length === 2);
});
