import assert from 'node:assert/strict';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { createFixture, eventually } from './fake-herdr.mjs';

const quietMs = 200;
const draft = 'UNSUBMITTED_INPUT_SENTINEL';
const draftScreen = `Previous turn finished.\n\n❯ ${draft}\n`;
const cleanScreen = 'Previous turn finished.\n\n❯   \n';

async function command(fx, args, options, accepted = [0]) {
  const result = await fx.cli(args, options);
  assert.ok(accepted.includes(result.code), `${args.join(' ')}: exit=${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.ok(result.json && typeof result.json === 'object', `Expected JSON, got: ${result.stdout}`);
  return result.json;
}

const listAll = (fx) => command(fx, ['list', '--all']);
const inspect = (fx, task) => command(fx, ['inspect', task]);
const promptsTo = (fx, pane) => fx.herdr.prompts.filter((prompt) => prompt.pane === pane);
const deferral = (queue, task) => queue.find((item) => item.task === task && item.state === 'deferred_user_typing');

async function send(fx, pane, brief, extra = []) {
  fx.herdr.addAgent(pane);
  const { task } = await command(fx, ['send', pane, '--brief', brief, '--watch', ...extra]);
  assert.equal(typeof task, 'string');
  await eventually(() => promptsTo(fx, pane).some((prompt) => prompt.completedAt && prompt.text.includes(`task=${task}#`)), {
    message: `Assignment was not delivered to ${pane}`,
  });
  return inspect(fx, task);
}

function reply(fx, pane, { task, attempt }, body) {
  return command(fx, ['reply', task, '--attempt', attempt, '--ok', '--note', 'Work submitted', '--body', body], { pane }, [0]);
}

async function manuallyResume(fx, pane) {
  fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
  const first = await send(fx, pane, 'Continue this task after a manual interruption.', [
    '--max-retries', '1', '--retry-backoff', '4',
  ]);
  const { task, attempt } = first;
  const interruptedSeq = fx.herdr.setAgent(pane, { agent_status: 'done', failure: 'interrupted' }).state_change_seq;
  const { plan, alarm } = await eventually(async () => {
    const { queue, scheduled_retries } = await listAll(fx);
    const plan = scheduled_retries.find((row) => row.task === task && row.attempt === attempt && row.state === 'pending');
    const alarm = queue.find((item) => item.task === task && item.type === 'interrupted' && item.state === 'queued');
    return plan && alarm && { plan, alarm };
  }, { message: 'Interruption did not create a pending retry and queue alert' });
  assert.ok(Date.now() < plan.at, 'The human must resume before the retry is due');
  assert.equal(promptsTo(fx, pane).length, 1);
  assert.equal(promptsTo(fx, fx.caller).length, 0);

  const runningSeq = fx.herdr.setAgent(pane, { agent_status: 'working', failure: undefined }).state_change_seq;
  assert.ok(runningSeq > interruptedSeq);
  fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
  const wasWithdrawn = ({ queue, scheduled_retries }) => (
    queue.some((item) => item.event_id === alarm.event_id && item.state === 'superseded_by_human_resume') &&
    scheduled_retries.some((row) => row.task === task && row.attempt === attempt && row.at === plan.at && row.state === 'cancelled')
  );
  await eventually(async () => wasWithdrawn(await listAll(fx)), {
    message: 'Daemon did not independently cancel the retry and retire the interrupted alert',
  });
  for (const action of ['resume', 'retry']) {
    const { already_running, reason } = await command(fx, [action, task]);
    assert.deepEqual({ already_running, reason }, { already_running: true, reason: 'already_running_resumed_by_human' });
  }
  await sleep(Math.max(0, plan.at - Date.now()) + 250);
  assert.ok(wasWithdrawn(await listAll(fx)));
  assert.equal((await inspect(fx, task)).attempt, attempt);
  assert.equal(promptsTo(fx, pane).length, 1, 'The original assignment must be the only Worker prompt');
  assert.equal(fx.herdr.starts.length, 0, 'The Daemon must not restart the resumed Worker');
  assert.equal(promptsTo(fx, fx.caller).length, 0, 'The retired interruption must stay silent');
  return first;
}

test('E2E-14 human-resumed workers keep their attempt and focused drafts protect queued delivery', { timeout: 45_000 }, async (t) => {
  const fx = await createFixture(t, { env: { CHFLOW_TYPING_QUIET_MS: String(quietMs) } });
  const pane = 'w1:p60';
  const resumed = await manuallyResume(fx, pane);

  fx.herdr.setAgent(fx.caller, { agent_status: 'idle', focused: true, paneFocusOnly: true, screen: draftScreen });
  const body = 'Completed on the same attempt after resuming manually.';
  await reply(fx, pane, resumed, body);
  const pending = await eventually(async () => deferral((await command(fx, ['inbox'])).queue, resumed.task), {
    message: 'The focused draft did not defer the result into the caller inbox',
  });
  assert.equal(pending.type, 'result');
  const notification = await eventually(() => fx.herdr.notifications[0], { message: 'No Herdr draft notification' });
  const notificationText = notification.params.join(' ');
  assert.match(notificationText, /chflow/i);
  assert.ok(!notificationText.includes(draft));
  assert.ok(fx.herdr.reads.some((request) => request.pane === fx.caller), 'Daemon did not check the focused draft');
  assert.equal(promptsTo(fx, fx.caller).length, 0, 'Inbox must not inject over the draft');
  assert.equal(deferral((await command(fx, ['inbox', fx.caller])).queue, resumed.task)?.event_id, pending.event_id);
  assert.equal((await command(fx, ['inbox', fx.otherCaller])).queue.length, 0);

  fx.herdr.setAgent(fx.caller, { screen: cleanScreen });
  const delivered = await eventually(() => promptsTo(fx, fx.caller).find((prompt) => prompt.completedAt), {
    message: 'Queued result was not delivered automatically after clearing the draft',
  });
  assert.ok(delivered.text.includes(`task=${resumed.task}#`), delivered.text);
  assert.ok(delivered.text.includes(`status=succeeded | out=${resumed.out}`), delivered.text);
  assert.ok(!delivered.text.includes(draft));
  assert.equal((await readFile(resumed.out, 'utf8')).trimEnd(), body);
  await eventually(async () => (await listAll(fx)).queue.some((item) => item.event_id === pending.event_id && item.state === 'delivered'), {
    message: 'Automatically sent result was not marked delivered',
  });
  assert.equal(fx.herdr.notifications.length, 1, 'An unchanged draft should produce one notification');
  assert.equal((await command(fx, ['inbox'])).queue.length, 0);

  fx.herdr.setAgent(fx.caller, { agent_status: 'idle', screen: draftScreen });
  const pulls = await Promise.all(['w1:p61', 'w1:p62'].map(async (worker) => {
    const info = await send(fx, worker, `Return a result for the next manual pull from ${worker}.`);
    await reply(fx, worker, info, `Result from ${worker}.`);
    return info;
  }));
  const pendingPull = await eventually(async () => {
    const { queue } = await command(fx, ['inbox', fx.caller]);
    const entries = pulls.map(({ task }) => deferral(queue, task));
    return entries.every(Boolean) && entries;
  }, { message: 'Both results must be deferred before flushing while the draft remains' });

  const { consumed, summary } = await command(fx, ['flush', fx.caller]);
  assert.equal(consumed, pulls.length);
  assert.match(summary, /^\[chflow:batch\] count=2\b/);
  for (const { task, out } of pulls) {
    assert.ok(summary.split('\n').some((line) => line.includes(`${task}#`) && line.includes(`status=succeeded | out=${out}`)), summary);
  }
  assert.ok(!summary.includes(draft));
  assert.equal((await command(fx, ['inbox'])).queue.length, 0);
  const history = (await listAll(fx)).queue;
  for (const { event_id } of pendingPull) {
    assert.equal(history.find((item) => item.event_id === event_id)?.state, 'delivered');
  }
  assert.deepEqual(promptsTo(fx, fx.caller), [delivered], 'Flush must return a summary without injecting a prompt');

  fx.herdr.setAgent(fx.caller, { screen: cleanScreen });
  await sleep(quietMs + Number(fx.env.CHFLOW_DEBOUNCE_MS) + 250);
  assert.deepEqual(promptsTo(fx, fx.caller), [delivered], 'Pulled results must not be redelivered when the draft clears');

  // A caller-less scheduled retry must check the mailbox even with no alert to revalidate.
  const timedPane = 'w1:p63';
  fx.herdr.addAgent(timedPane);
  const timed = await command(fx, ['send', timedPane, '--watch', '--brief', 'Report on completion.', '--retry-after', '1s'], { pane: '' });
  fx.herdr.setAgent(timedPane, { agent_status: 'done', failure: 'quota_exhausted' });
  const plan = await eventually(async () => (await listAll(fx)).scheduled_retries.find(row => row.task === timed.task && row.state === 'pending'));
  assert.ok(Date.now() < plan.at);
  const completed = 'The resumable session produced a result before the timer fired.';
  await writeFile(`${timed.out}.tmp`, completed);
  await rename(`${timed.out}.tmp`, timed.out);
  const recovered = await eventually(async () => {
    const state = await inspect(fx, timed.task);
    return state.state === 'succeeded' && state;
  }, { message: 'Scheduled retry failed to recognize the freshly written mailbox result' });
  assert.equal(recovered.attempt, timed.attempt);
  assert.equal(recovered.reason, 'artifact_written');
  assert.equal((await listAll(fx)).scheduled_retries.find(row => row.task === timed.task)?.state, 'cancelled');
  assert.equal(await readFile(timed.out, 'utf8'), completed);
  assert.equal(promptsTo(fx, timedPane).length, 1);
});

test('E2E-25 real agy/Pi footers protect single and multiline drafts and strict focus defers delivery', { timeout: 45_000 }, async t => {
  const layouts = [
    { name: 'agy', prompt: '>', footer: '\n────────────\n  ● [13:26:23] bg task running\n────────────\nstatus bar' },
    { name: 'pi', prompt: '❯', footer: '\n────────────\nmodel tokens\ngit branch' },
  ];
  for (const layout of layouts) await t.test(layout.name, async t => {
    const fx = await createFixture(t, { env: { CHFLOW_TYPING_QUIET_MS: String(quietMs) } });
    let count = 0;
    for (const input of [` ${draft}`, `   \n  ${draft}\n  continuation`]) {
      const pane = 'w1:p' + (80 + count++);
      const task = await send(fx, pane, 'Return a result while the human has a draft.');
      fx.herdr.setAgent(fx.caller, {
        agent_status: 'idle', focused: true, paneFocusOnly: true,
        screen: `Previous turn finished.\n${layout.prompt}${input}${layout.footer}`,
      });
      const sentBefore = promptsTo(fx, fx.caller).length;
      await reply(fx, pane, task, 'Complete footer-layout regression.');
      await eventually(async () => deferral((await command(fx, ['inbox'])).queue, task.task), {
        message: layout.name + ' draft was not deferred',
      });
      assert.equal(promptsTo(fx, fx.caller).length, sentBefore);
      const request = fx.herdr.reads.find(r => r.pane === fx.caller);
      assert.ok(request, 'Focused input must be checked');
      fx.herdr.setAgent(fx.caller, { screen: `Previous turn finished.\n${layout.prompt}   ${layout.footer}` });
      const delivered = await eventually(() => promptsTo(fx, fx.caller).find(p =>
        p.completedAt && p.text.includes(`task=${task.task}#`)), {
        message: layout.name + ' footer caused a false positive after clearing the input box',
      });
      assert.ok(!delivered.text.includes(draft));
      const inspected = await inspect(fx, task.task);
      assert.ok(!JSON.stringify(inspected).includes(draft), 'Draft text must remain in memory');
      fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
    }
  });
  await t.test('strict focus', async t => {
    const fx = await createFixture(t, { env: {
      CHFLOW_TYPING_QUIET_MS: String(quietMs), CHFLOW_FOCUS_DEFER: '1',
    } });
    const pane = 'w1:p84', task = await send(fx, pane, 'Finish while the empty prompt remains focused.');
    fx.herdr.setAgent(fx.caller, { agent_status: 'idle', focused: true, paneFocusOnly: true,
      screen: 'Previous turn finished.\n❯   \n────────────\nmodel tokens\ngit branch' });
    await reply(fx, pane, task, 'Strict-mode result.');
    await eventually(async () => deferral((await command(fx, ['inbox'])).queue, task.task));
    assert.equal(promptsTo(fx, fx.caller).length, 0);
    await eventually(() => fx.herdr.notifications[0], { message: 'Strict focus did not notify the pending inbox' });
    assert.equal(fx.herdr.notifications.length, 1);
    assert.equal(fx.herdr.reads.filter(r => r.pane === fx.caller).length, 0, 'Strict mode needs no draft text');
    fx.herdr.setAgent(fx.caller, { focused: false });
    await eventually(() => promptsTo(fx, fx.caller).find(p => p.completedAt && p.text.includes(`task=${task.task}#`)));
  });
});

test('E2E-33 queued replies succeed and deferred deliveries retry without splitting batches', { timeout: 45_000 }, async t => {
  await t.test('queued reply returns zero while the recipient is busy', async t => {
    const fx = await createFixture(t);
    const task = await send(fx, 'w1:p90', 'Return a busy-recipient receipt.');
    fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
    const result = await fx.cli(['reply', task.task, '--attempt', task.attempt, '--ok', '--body', 'Queued successfully'], { pane: task.pane });
    assert.equal(result.code, 0, result.stdout);
    assert.equal(result.json.queued, true);
    assert.equal(promptsTo(fx, fx.caller).length, 0);
  });
  await t.test('draft retry deadline holds new events and restarts a single ordered debounce batch', async t => {
    const debounce = 700, period = 800;
    const fx = await createFixture(t, { env: { CHFLOW_TYPING_QUIET_MS: '80', CHFLOW_DEBOUNCE_MS: String(debounce), CHFLOW_DEFER_RETRY_MS: String(period) } });
    fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
    const tasks = [];
    for (let i = 0; i < 4; i++) tasks.push(await send(fx, 'w1:p' + (91 + i), 'Return ordered receipt ' + i));
    await reply(fx, tasks[0].pane, tasks[0], 'First');
    fx.herdr.setAgent(fx.caller, { agent_status: 'idle', focused: true, screen: draftScreen });
    const first = await eventually(async () => deferral((await command(fx, ['inbox'])).queue, tasks[0].task));
    assert.ok(Number.isFinite(first.nextAt) && first.nextAt < Number.MAX_SAFE_INTEGER, 'Draft deferrals require a finite retry deadline');
    assert.ok(first.nextAt > Date.now());
    await reply(fx, tasks[1].pane, tasks[1], 'Second while typing');
    const renewed = await eventually(async () => {
      const entry = deferral((await command(fx, ['inbox'])).queue, tasks[0].task);
      return entry?.nextAt > first.nextAt && entry;
    }, { message: 'An unchanged draft must be checked again on the defer timer' });
    assert.equal(promptsTo(fx, fx.caller).length, 0);
    await eventually(() => fx.herdr.notifications[0]);
    assert.equal(fx.herdr.notifications.length, 1, 'Repeated draft checks notify once');
    fx.herdr.setAgent(fx.caller, { focused: false, screen: cleanScreen });
    await reply(fx, tasks[2].pane, tasks[2], 'Third after clearing input');
    assert.equal(promptsTo(fx, fx.caller).length, 0, 'New queued events must respect the existing retry deadline');
    await sleep(Math.max(0, renewed.nextAt - Date.now()) + debounce / 3);
    assert.equal(promptsTo(fx, fx.caller).length, 0, 'Clearing input must start a fresh debounce window');
    await reply(fx, tasks[3].pane, tasks[3], 'Fourth inside debounce');
    const delivered = await eventually(() => promptsTo(fx, fx.caller).find(p => p.completedAt));
    assert.match(delivered.text, /^\[chflow:batch\] count=4\b/);
    const index = delivered.text.match(/index=(\S+)/)?.[1];
    const entries = index ? await readFile(index, 'utf8') : delivered.text;
    const positions = tasks.map(task => entries.indexOf(task.task + '#'));
    assert.ok(positions.every(p => p >= 0));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'Receipt order must match enqueue order');
    await sleep(debounce + period);
    assert.equal(promptsTo(fx, fx.caller).length, 1);
  });
  await t.test('superseded progress keeps one notification for the same pending input', async t => {
    const fx = await createFixture(t, { env: { CHFLOW_TYPING_QUIET_MS: '80', CHFLOW_DEFER_RETRY_MS: '250' } });
    const task = await send(fx, 'w1:p99', 'Publish progress while the human keeps a draft.');
    fx.herdr.setAgent(fx.caller, { agent_status: 'idle', focused: true, screen: draftScreen });
    await command(fx, ['reply', task.task, '--attempt', task.attempt, '--progress', '--note', 'First progress'], { pane: task.pane });
    const first = await eventually(async () => deferral((await command(fx, ['inbox'])).queue, task.task));
    await eventually(() => fx.herdr.notifications[0]);
    await command(fx, ['reply', task.task, '--attempt', task.attempt, '--progress', '--note', 'Second progress'], { pane: task.pane });
    await eventually(async () => {
      const next = deferral((await command(fx, ['inbox'])).queue, task.task);
      return next && next.event_id !== first.event_id;
    });
    assert.equal(fx.herdr.notifications.length, 1);
    await reply(fx, task.pane, task, 'Final result for the same draft');
    await eventually(async () => deferral((await command(fx, ['inbox'])).queue, task.task)?.type === 'result');
    assert.equal(fx.herdr.notifications.length, 1);
    assert.equal(promptsTo(fx, fx.caller).length, 0);
    fx.herdr.setAgent(fx.caller, { focused: false, screen: cleanScreen });
    await eventually(() => promptsTo(fx, fx.caller).find(p => p.completedAt));
  });
  for (const code of ['agent_busy', 'agent_not_ready']) await t.test(code + ' retries after the recipient becomes idle', async t => {
    const fx = await createFixture(t, { env: { CHFLOW_IPC_BACKOFF_MS: '500' } });
    const task = await send(fx, 'w1:p95', 'Return a temporarily rejected receipt.');
    fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
    await reply(fx, task.pane, task, 'Wait for a ready recipient');
    fx.herdr.failNext('agent.prompt', code);
    fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
    const failed = await eventually(async () => (await command(fx, ['inbox'])).queue.find(e => e.task === task.task && e.failures > 0));
    assert.ok(Number.isFinite(failed.nextAt) && failed.nextAt < Number.MAX_SAFE_INTEGER, code + ' must remain retryable');
    fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
    await sleep(650);
    assert.equal(promptsTo(fx, fx.caller).length, 0);
    fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
    await eventually(() => promptsTo(fx, fx.caller).find(p => p.completedAt && p.text.includes('task=' + task.task + '#')));
    assert.equal(promptsTo(fx, fx.caller).length, 1);
  });
  await t.test('an unsafe unknown send stays frozen without blocking a newer receipt', async t => {
    const fx = await createFixture(t);
    const first = await send(fx, 'w1:p96', 'Keep an ambiguous send for operator review.');
    fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
    await reply(fx, first.pane, first, 'Ambiguous receipt');
    fx.herdr.failNext('agent.prompt', 'ambiguous_send_failure');
    fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
    await eventually(async () => (await command(fx, ['inbox'])).queue.find(e => e.task === first.task && e.nextAt === Number.MAX_SAFE_INTEGER));
    fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
    const second = await send(fx, 'w1:p97', 'Deliver a newer verified receipt.');
    await reply(fx, second.pane, second, 'Safe newer receipt');
    fx.herdr.setAgent(fx.caller, { agent_status: 'idle' });
    const delivered = await eventually(() => promptsTo(fx, fx.caller).find(p => p.completedAt));
    assert.ok(delivered.text.includes('task=' + second.task + '#'));
    assert.ok(!delivered.text.includes('task=' + first.task + '#'));
  });
});
