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
  return command(fx, ['reply', task, '--attempt', attempt, '--ok', '--note', 'Work submitted', '--body', body], { pane }, [0, 2]);
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
