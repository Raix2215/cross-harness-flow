import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createFixture, eventually } from './fake-herdr.mjs';

const timeout = 45_000;
const defaultDelays = [350, 750, 1350, 2200];
const defaultBackoff = defaultDelays.map((ms) => ms / 1000).join(',');

async function command(fx, args, options, accepted = [0]) {
  const result = await fx.cli(args, options);
  assert.ok(accepted.includes(result.code), `${args.join(' ')}: exit=${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.ok(result.json && typeof result.json === 'object', `Expected JSON, got: ${result.stdout}`);
  return result.json;
}

const inspect = (fx, task) => command(fx, ['inspect', task]);
const listAll = (fx) => command(fx, ['list', '--all']);

function taskPrompts(fx, task, mode, pane) {
  return fx.herdr.prompts.filter((prompt) => prompt.completedAt &&
    (pane === undefined || prompt.pane === pane) && prompt.text.includes(`task=${task}#`) &&
    prompt.text.split('\n')[1]?.split(' | ').includes(`status=${mode}`));
}

function waitPrompt(fx, task, mode, pane, count = 1) {
  return eventually(() => taskPrompts(fx, task, mode, pane)[count - 1], {
    message: `Missing ${mode} prompt ${count} for ${task} to ${pane ?? 'a worker'}`,
  });
}

async function send(fx, pane, brief, flags = []) {
  const { task } = await command(fx, ['send', pane, '--brief', brief, '--watch', ...flags]);
  assert.equal(typeof task, 'string');
  await waitPrompt(fx, task, 'assigned', pane);
  return inspect(fx, task);
}

function failWorker(fx, pane, reason) {
  fx.herdr.setAgent(pane, { agent_status: 'done', failure_reason: reason });
}

function assertRecoveryFields(prompt, { brief, out }) {
  const fields = prompt.text.split('\n')[1].split(' | ');
  assert.ok(fields.includes(`brief=${brief}`), prompt.text);
  assert.ok(fields.includes(`out=${out}`), prompt.text);
  assert.ok(prompt.text.split('\n').length <= 5, prompt.text);
}

async function succeed(fx, pane, task, body) {
  fx.herdr.setAgent(pane, { failure_reason: undefined });
  const { attempt, out } = await inspect(fx, task);
  await command(fx, ['reply', task, '--attempt', attempt, '--ok', '--body', body], { pane }, [0]);
  await waitPrompt(fx, task, 'succeeded', fx.caller);
  assert.equal((await inspect(fx, task)).state, 'succeeded');
  assert.equal((await readFile(out, 'utf8')).trimEnd(), body);
}

async function exhaust(fx, pane, first, delays, reason) {
  const { task } = first;
  const prompts = [];
  const plans = [];
  const attempts = [first.attempt];
  for (const [index] of delays.entries()) {
    failWorker(fx, pane, reason);
    const retry = await waitPrompt(fx, task, 'resume', pane, index + 1);
    fx.herdr.setAgent(pane, { failure_reason: undefined });
    assertRecoveryFields(retry, first);
    prompts.push(retry);
    plans.push((await listAll(fx)).scheduled_retries.find((row) => row.task === task));
    attempts.push((await inspect(fx, task)).attempt);
  }
  failWorker(fx, pane, reason);
  await waitPrompt(fx, task, 'failed', fx.caller);
  const final = await inspect(fx, task);
  assert.equal(final.state, 'failed');
  assert.equal(final.brief, first.brief);
  assert.equal(new Set(attempts).size, delays.length + 1);
  assert.equal(taskPrompts(fx, task, 'resume', pane).length, delays.length);

  const failures = final.audit.filter(({ event }) => event === 'business_failure').sort((a, b) => a.at - b.at);
  assert.equal(failures.length, delays.length + 1);
  const retries = final.audit.filter(({ event }) => event === 'retry').sort((a, b) => a.at - b.at);
  assert.equal(retries.length, delays.length);
  const classified = reason ?? 'settled_no_reply';
  assert.deepEqual(failures.map(({ detail }) => detail), Array(failures.length).fill(classified));
  return delays.map((delay, index) => {
    const plan = plans[index];
    assert.ok(plan, `Missing stored plan for retry ${index + 1}`);
    assert.equal(plan.attempt, attempts[index]);
    const backoff = plan.at - failures[index].at;
    assert.ok(Math.abs(backoff - delay) <= 50, `Retry ${index + 1} planned ${backoff}ms rather than ${delay}ms`);
    assert.ok(retries[index].at >= plan.at && prompts[index].at >= plan.at, `Retry ${index + 1} ran before ${plan.at}`);
    return backoff;
  });
}

test('E2E-09 business retries use four default slots, honor overrides, and resume the stored session', { timeout }, async (t) => {
  const fx = await createFixture(t, { env: { CHFLOW_DEFAULT_RETRY_BACKOFF: defaultBackoff } });
  fx.herdr.setAgent(fx.caller, { promptStatus: null });
  const defaultPane = 'w1:p40';
  fx.herdr.addAgent(defaultPane);
  const defaultBrief = 'Keep the original network-recovery task.';
  const defaults = await send(fx, defaultPane, defaultBrief);
  const elapsed = await exhaust(fx, defaultPane, defaults, defaultDelays, 'network_error');
  assert.ok(elapsed.slice(1).every((ms, index) => ms > elapsed[index]), `Default retry intervals must increase: ${elapsed}`);
  assert.ok((await readFile(defaults.brief, 'utf8')).includes(defaultBrief));
  assert.equal(fx.herdr.starts.length, 0, 'Interactive retry should reuse a still-live worker');

  const customPane = 'w1:p41';
  const nativeSession = 'a4dd1bc4-3aad-470a-91e9-68ac7cd54f59';
  fx.herdr.addAgent(customPane, { agent: 'codex', agent_session: { kind: 'id', value: nativeSession } });
  const custom = await send(fx, customPane, 'Resume this original Codex session.', [
    '--max-retries', '2', '--retry-backoff', '0.1,0.2',
  ]);
  await exhaust(fx, customPane, custom, [100, 200]);
  fx.herdr.removeAgent(customPane);
  const startIndex = fx.herdr.starts.length;
  await command(fx, ['resume', custom.task]);
  const replacement = fx.herdr.starts[startIndex];
  assert.ok(replacement, 'Resume should recreate the lost worker');
  assert.equal(replacement.kind, 'codex');
  assert.notEqual(replacement.pane, customPane);
  const resumeArg = replacement.extra.indexOf('resume');
  assert.ok(resumeArg >= 0, JSON.stringify(replacement.extra));
  assert.equal(replacement.extra[resumeArg + 1], nativeSession);
  assert.equal(fx.herdr.agents.get(replacement.pane).cwd, fx.workspace);
  assertRecoveryFields(await waitPrompt(fx, custom.task, 'resume', replacement.pane), custom);
  await succeed(fx, replacement.pane, custom.task, 'Recovered the original Codex conversation.');
});

async function scheduledAcrossRestart(fx, pane, flags, absoluteAt) {
  fx.herdr.addAgent(pane);
  const first = await send(fx, pane, 'Continue after the quota refresh.', ['--max-retries', '0', ...flags]);
  const { task } = first;
  failWorker(fx, pane, 'quota_exhausted');
  const plan = await eventually(async () => (await listAll(fx)).scheduled_retries.find((row) => row.task === task), {
    message: `Missing persisted scheduled quota retry for ${task}`,
  });
  assert.equal(typeof plan.at, 'number');
  assert.equal(plan.state, 'pending');
  const before = await inspect(fx, task);
  assert.equal(before.state, 'scheduled_retry');
  assert.equal(plan.attempt, first.attempt);
  assert.equal(taskPrompts(fx, task, 'resume', pane).length, 0);
  if (absoluteAt === undefined) {
    const failure = before.audit.find(({ event }) => event === 'business_failure');
    assert.ok(failure, 'Missing quota failure audit');
    assert.ok(Math.abs(plan.at - failure.at - 1000) <= 50, JSON.stringify({ plan, failure }));
  } else {
    assert.equal(plan.at, absoluteAt);
  }

  const original = (await command(fx, ['daemon', 'status'])).data.pid;
  assert.ok(Number.isInteger(original) && original > 1);
  process.kill(original, 'SIGKILL');
  const restored = await listAll(fx);
  const restarted = (await command(fx, ['daemon', 'status'])).data.pid;
  assert.ok(Number.isInteger(restarted) && restarted > 1);
  assert.notEqual(restarted, original);
  assert.deepEqual(restored.scheduled_retries.find((row) => row.task === task), plan);

  const recovered = await waitPrompt(fx, task, 'resume', pane);
  assertRecoveryFields(recovered, first);
  assert.ok(recovered.at >= plan.at, `Retry ran early: ${recovered.at} < ${plan.at}`);
  assert.ok(recovered.at - plan.at < 2000, `Retry ran ${recovered.at - plan.at}ms late after the restart`);
  await succeed(fx, pane, task, 'Completed after the persisted retry fired.');
  const { audit } = await inspect(fx, task);
  const triggered = audit.filter(({ event }) => event === 'scheduled_retry_triggered');
  assert.equal(triggered.length, 1, JSON.stringify(audit));
  assert.ok(triggered[0].at >= plan.at);
  assert.equal(taskPrompts(fx, task, 'resume', pane).length, 1);
}

async function expectFallback(fx, first, occurrence, startIndex, kind, model) {
  const delivery = await waitPrompt(fx, first.task, 'fallback', undefined, occurrence);
  const launch = fx.herdr.starts[startIndex];
  assert.equal(launch?.kind, kind, JSON.stringify(launch));
  assert.ok(launch.extra.includes(model), JSON.stringify(launch.extra));
  assert.equal(delivery.pane, launch.pane);
  assertRecoveryFields(delivery, first);
  return launch.pane;
}

test('E2E-10 scheduled quota retries survive restart and fallback follows channel priority', { timeout }, async (t) => {
  const fx = await createFixture(t, { env: { CHFLOW_DEFAULT_RETRY_BACKOFF: defaultBackoff } });
  fx.herdr.setAgent(fx.caller, { promptStatus: null });
  await scheduledAcrossRestart(fx, 'w1:p42', ['--retry-after', '1s']);
  const absoluteAt = Date.now() + 2500;
  await scheduledAcrossRestart(fx, 'w1:p43', ['--retry-at', new Date(absoluteAt).toISOString()], absoluteAt);

  const primary = 'w1:p44';
  fx.herdr.addAgent(primary);
  const quotaBrief = 'Retain this original brief through the ordered quota fallback chain.';
  const quota = await send(fx, primary, quotaBrief, ['--fallback', 'codex:quota-primary,claude:quota-secondary']);
  failWorker(fx, primary, 'quota_exhausted');
  const codex = await expectFallback(fx, quota, 1, 0, 'codex', 'quota-primary');
  failWorker(fx, codex, 'quota_exhausted');
  const claude = await expectFallback(fx, quota, 2, 1, 'claude', 'quota-secondary');
  const switched = await inspect(fx, quota.task);
  assert.equal(switched.audit.filter(({ event }) => event === 'fallback_switched').length, 2);
  assert.equal(switched.audit.filter(({ event }) => event === 'retry').length, 0, 'Quota should skip exponential retries when a fallback is available');
  assert.equal(taskPrompts(fx, quota.task, 'resume', primary).length, 0);
  assert.ok((await readFile(quota.brief, 'utf8')).includes(quotaBrief));
  await succeed(fx, claude, quota.task, 'The second fallback completed the original task.');

  const interrupted = 'w1:p45';
  fx.herdr.addAgent(interrupted);
  const exhausted = await send(fx, interrupted, 'Fallback only after using the configured retry.', [
    '--max-retries', '1', '--retry-backoff', '0.1', '--fallback', 'codex:exhaustion-fallback',
  ]);
  failWorker(fx, interrupted);
  await waitPrompt(fx, exhausted.task, 'resume', interrupted);
  assert.equal(fx.herdr.starts.length, 2, 'Interruption should first retry the primary channel');
  failWorker(fx, interrupted);
  const fallback = await expectFallback(fx, exhausted, 1, 2, 'codex', 'exhaustion-fallback');
  const info = await inspect(fx, exhausted.task);
  assert.equal(info.audit.filter(({ event }) => event === 'retry').length, 1);
  assert.equal(info.audit.filter(({ event }) => event === 'fallback_switched').length, 1);
  await succeed(fx, fallback, exhausted.task, 'The replacement completed after retry exhaustion.');
});
