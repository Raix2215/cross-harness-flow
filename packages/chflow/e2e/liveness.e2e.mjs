import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { createFixture, eventually } from './fake-herdr.mjs';

const stall = 900, confirm = 350;
async function command(fx, args) {
  const reply = await fx.cli(args);
  assert.equal(reply.code, 0, reply.stderr || reply.stdout);
  return reply.json;
}
const inspect = (fx, task) => command(fx, ['inspect', task]);
const reads = (fx, pane) => fx.herdr.reads.filter(read => read.pane === pane);

async function firstProbe(fx, task, pane) {
  return eventually(async () => {
    const current = await inspect(fx, task);
    assert.equal(!!current.stalled, false, 'Working worker must wait for a second liveness sample before stalled');
    return reads(fx, pane).length === 1 && current;
  });
}
async function assertNoStall(fx, task) {
  const current = await inspect(fx, task);
  assert.equal(!!current.stalled, false, 'Active screen or file progress must keep the worker un-stalled');
  const all = await command(fx, ['list', '--all']);
  assert.equal(all.queue.some(event => event.task === task && event.type === 'stalled'), false);
  return current;
}

test('E2E-30 two-sample liveness distinguishes active screens/files from frozen working workers', { timeout: 30_000 }, async t => {
  const fx = await createFixture(t, { env: {
    CHFLOW_STALL_MS: String(stall), CHFLOW_STALL_CONFIRM_MS: String(confirm),
  } });
  fx.herdr.setAgent(fx.caller, { agent_status: 'working' });
  for (const [index, activity] of ['screen', 'session', 'output', 'frozen'].entries()) {
    await t.test(activity, async () => {
      const pane = 'w1:p' + (301 + index);
      fx.herdr.addAgent(pane, { screen: 'Long-running worker: initial progress' });
      const sent = await command(fx, ['send', pane, '--brief', 'Keep working while liveness is sampled', '--watch']);
      const task = sent.task, initial = await inspect(fx, task);
      const agent = fx.herdr.agents.get(pane);
      const seq = agent.state_change_seq, revision = agent.revision;
      await sleep(120);
      assert.ok(Date.now() - initial.activityAt < stall, 'Initial zero-read assertion must precede the stall threshold');
      assert.equal(reads(fx, pane).length, 0, 'Normal working polls must perform zero screen reads');
      const first = await firstProbe(fx, task, pane);
      const sampled = reads(fx, pane)[0];
      assert.deepEqual(sampled.params, [pane, '--source', 'visible', '--lines', '20']);
      assert.ok(sampled.at - first.activityAt >= stall, 'First screen sample belongs after the stall threshold');
      if (activity === 'screen') fx.herdr.setAgent(pane, {
        screen: 'Long-running worker: completed another batch', state_change_seq: seq, revision,
      });
      if (activity === 'session') await writeFile(agent.agent_session.value, '{"progress":"another batch"}\n');
      if (activity === 'output') await writeFile(initial.out, 'Incremental reply progress\n');
      await sleep(100);
      assert.equal(reads(fx, pane).length, 1, 'Confirmation window must skip repeated screen reads');
      if (activity === 'frozen') {
        const frozen = await eventually(async () => {
          const current = await inspect(fx, task);
          return current.stalled && current;
        });
        assert.equal(frozen.state, 'submitted');
        const all = await command(fx, ['list', '--all']);
        assert.ok(all.queue.some(event => event.task === task && event.type === 'stalled'));
      } else {
        await eventually(async () => {
          const current = await assertNoStall(fx, task);
          return current.activityAt > first.activityAt && current;
        });
        assert.equal(fx.herdr.agents.get(pane).state_change_seq, seq);
        assert.equal(fx.herdr.agents.get(pane).revision, revision);
      }
      assert.equal(reads(fx, pane).length, 2, 'One stall decision must use exactly two screen samples');
      assert.ok(reads(fx, pane)[1].at - sampled.at >= confirm - 60, 'Second sample must respect the confirmation window');
      await command(fx, ['cancel', task]);
      await sleep(100);
      assert.equal(reads(fx, pane).length, 2, 'Cancelled tasks must stop liveness sampling');
    });
  }
  await t.test('revision resets a pending probe and starts a fresh stall interval', async () => {
    const pane = 'w1:p305';
    fx.herdr.addAgent(pane, { screen: 'Static screen before metadata activity' });
    const { task } = await command(fx, ['send', pane, '--brief', 'Reset liveness after metadata activity', '--watch']);
    const first = await firstProbe(fx, task, pane);
    const agent = fx.herdr.setAgent(pane, { screen: 'Static screen after metadata activity' });
    const changed = await eventually(async () => {
      const current = await inspect(fx, task);
      return current.revision === agent.revision && current.activityAt > first.activityAt && current;
    });
    await sleep(confirm + 80);
    await assertNoStall(fx, task);
    assert.equal(reads(fx, pane).length, 1, 'Old confirmation probes must be discarded after a revision change');
    await eventually(async () => {
      const current = await assertNoStall(fx, task);
      return reads(fx, pane).length === 2 && current;
    });
    assert.ok(reads(fx, pane)[1].at - changed.activityAt >= stall);
    await eventually(async () => (await inspect(fx, task)).stalled);
    assert.equal(reads(fx, pane).length, 3, 'A new activity interval needs its own baseline and confirmation');
    await command(fx, ['cancel', task]);
  });
  await t.test('remote session paths never stat a same-named local file', async () => {
    const pane = 'w1:p306';
    fx.herdr.addAgent(pane, { screen: 'Static remote worker' });
    const { task } = await command(fx, ['send', pane, '--brief', 'Probe remote liveness', '--watch', '--machine', 'fixture-remote']);
    const current = await firstProbe(fx, task, pane);
    assert.equal(current.route.machine, 'fixture-remote');
    await writeFile(fx.herdr.agents.get(pane).agent_session.value, 'Local file progress belongs to another machine\n');
    await eventually(async () => (await inspect(fx, task)).stalled);
    assert.equal(reads(fx, pane).length, 2);
    assert.ok(reads(fx, pane).every(read => read.route.machine === 'fixture-remote'));
    await command(fx, ['cancel', task]);
  });
});
