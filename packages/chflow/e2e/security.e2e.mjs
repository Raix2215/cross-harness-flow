import assert from 'node:assert/strict';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFixture, eventually } from './fake-herdr.mjs';

async function command(fx, args, accepted = [0], options) {
  const res = await fx.cli(args, options);
  assert.ok(accepted.includes(res.code), args.join(' ') + ': ' + res.stdout + res.stderr);
  return res.json;
}

test('E2E-26 Harness-owned command policy, JSON secrets, mailbox links and native retry policy', { timeout: 45_000 }, async t => {
  const fx = await createFixture(t);
  fx.herdr.setAgent(fx.caller, { agent_status: 'working' });

  for (const secret of ['{"password":"example-password-value"}', '{"access_token":"opaque-example-token"}']) {
    const rejected = await command(fx, ['send', fx.otherCaller, '--brief', secret], [1]);
    assert.equal(rejected.error.code, 'sensitive_input');
  }

  const pane = 'w1:p90';
  fx.herdr.addAgent(pane);
  const task = await command(fx, ['send', pane, '--task', 'boundary-review', '--brief', 'Review this workspace',
    '--perm', 'auto-workspace', '--watch']);
  await eventually(() => fx.herdr.prompts.find(p => p.pane === pane && p.completedAt));
  const raw = 'Permission required\nAllow this command? [y/N]\nrm -rf build/../../victim\n' +
    '{"password":"example-password-value","access_token":"opaque-example-token"}';
  fx.herdr.setAgent(pane, { agent_status: 'blocked', screen: raw, unblockOnKey: true });
  const blocked = await eventually(async () => {
    const value = await command(fx, ['inspect', task.task, '--diag']);
    return value.audit.some(a => a.event === 'auto_approved') && value;
  });
  assert.deepEqual(fx.herdr.keys.filter(k => k.pane === pane).map(k => k.keys), [['y']],
    'Command paths remain subject to Harness policy; chflow still redacts stored diagnostics');
  assert.ok(!blocked.diag_text.includes('example-password-value'));
  assert.ok(!blocked.diag_text.includes('opaque-example-token'));
  const diagnostic = await readFile(blocked.diag, 'utf8');
  assert.ok(!diagnostic.includes('example-password-value'));
  assert.ok(!diagnostic.includes('opaque-example-token'));
  await writeFile(blocked.diag, '{"password":"example-password-value"}');
  assert.ok(!(await command(fx, ['inspect', task.task, '--diag'])).diag_text.includes('example-password-value'));
  const outsideFile = join(fx.root, 'external-diagnostic.txt');
  await writeFile(outsideFile, 'external marker');
  await rm(blocked.diag);
  await symlink(outsideFile, blocked.diag);
  const rejectedRead = await command(fx, ['inspect', task.task, '--diag'], [1]);
  assert.equal(rejectedRead.error.code, 'invalid_args');
  await command(fx, ['cancel', task.task]);

  // Refuse each writable directory boundary before creating any brief outside the workspace.
  const outside = join(fx.root, 'external-mail');
  await mkdir(outside);
  await writeFile(join(outside, 'marker'), 'keep');
  for (const boundary of ['.chflow', '.chflow/tasks', '.chflow/tasks/link-guard']) {
    const cwd = join(fx.root, 'links-' + boundary.split('/').length);
    await mkdir(cwd);
    const parts = boundary.split('/');
    if (parts.length > 1) await mkdir(join(cwd, ...parts.slice(0, -1)), { recursive: true });
    await symlink(outside, join(cwd, boundary));
    const result = await command(fx, ['run', '--kind', 'claude', '--task', 'link-guard', '--brief', 'Guard task mailbox'], [1], { cwd });
    assert.equal(result.error.code, 'invalid_mailbox');
    await assert.rejects(readFile(join(outside, 't1-brief.md')), { code: 'ENOENT' });
    assert.equal(await readFile(join(outside, 'marker'), 'utf8'), 'keep');
  }

  // Replacing an existing mailbox directory must also block subsequent reply writes.
  fx.herdr.setAgent(pane, { agent_status: 'idle' });
  fx.herdr.setAgent(pane, { agent_status: 'idle' });
  const linked = await command(fx, ['send', pane, '--task', 'reply-link', '--brief', 'Protect this result mailbox', '--watch']);
  const savedMail = linked.mail + '.saved';
  const { rename } = await import('node:fs/promises');
  await rename(linked.mail, savedMail);
  await symlink(outside, linked.mail);
  const rejectedWrite = await command(fx, ['reply', linked.task, '--attempt', linked.attempt, '--ok', '--body', 'Result'],
    [1], { pane });
  assert.equal(rejectedWrite.error.code, 'invalid_mailbox');
  await assert.rejects(readFile(join(outside, 't1-reply.md')), { code: 'ENOENT' });
  await rm(linked.mail);
  await rename(savedMail, linked.mail);
  await command(fx, ['cancel', linked.task]);

  const argsPath = join(fx.root, 'claude-args.jsonl');
  await fx.writeExecutable('claude', '#!/usr/bin/env node\n' + `
const fs = require('node:fs'), args = process.argv.slice(2);
const path = ${JSON.stringify(argsPath)};
const previous = fs.existsSync(path) ? fs.readFileSync(path, 'utf8').trim().split('\\n').length : 0;
fs.appendFileSync(path, JSON.stringify(args) + '\\n');
process.stdin.resume();
process.stdin.on('end', () => {
  if (!previous) { process.stderr.write('rate limit exceeded'); process.exitCode = 1; }
  else console.log(JSON.stringify({ type: 'result', result: 'Retry policy retained', session_id: 'fixture-policy' }));
});
`);
  const retried = await command(fx, ['run', '--kind', 'claude', '--task', 'policy-retry', '--brief', 'Retry with the same native policy',
    '--max-retries', '1', '--retry-backoff', '0.1', '--', '--append-system-prompt', 'Keep policy']);
  assert.equal(retried.state, 'succeeded');
  const attempts = (await readFile(argsPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(attempts.length, 2);
  for (const args of attempts) {
    const i = args.indexOf('--append-system-prompt');
    assert.ok(i >= 0);
    assert.equal(args[i + 1], 'Keep policy');
  }
});
