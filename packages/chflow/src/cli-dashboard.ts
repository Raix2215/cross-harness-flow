import type { Peer } from './ipc.js';
import type { Opts, Reply } from './types.js';
import { paint, PENDING_QUEUE_STATES, TERMINAL_TASK_STATES } from './cli-format.js';
import { renderStatusSnapshot, type UiSnapshotData } from './cli-status.js';

export interface TopDashboardDeps {
  peer: Peer;
  fetchSnapshot: () => Promise<UiSnapshotData>;
  uiUrl?: string;
  openBrowser: (url: string) => void;
  runAction: (method: string, target?: string, opts?: Opts) => Promise<Reply>;
}

export async function runTopDashboard(deps: TopDashboardDeps): Promise<number> {
  const outTty = !!process.stdout.isTTY;
  const inTty = !!process.stdin.isTTY && outTty;
  const c = paint(outTty);
  let latest: UiSnapshotData | undefined;
  let flash = '';
  let flashTimer: NodeJS.Timeout | undefined;
  let stopArmedUntil = 0;
  let fetching = false;
  let dirty = false;
  let closed = false;
  let exitCode = 0;

  const setFlash = (msg: string) => {
    flash = msg;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash = '';
      paintFrame();
    }, 3500);
    paintFrame();
  };

  const paintFrame = () => {
    if (closed || !latest) return;
    const body = renderStatusSnapshot(latest, {
      tty: outTty,
      uiUrl: deps.uiUrl ?? latest.daemon?.ui_url,
      flash: flash || undefined,
      compact: true,
    });
    const footer = `${c.dim('─'.repeat(72))}\n` +
      `${c.bold('热键:')} ${c.cyan('[q]')} 退出  ${c.cyan('[o]')} WebUI  ${c.cyan('[a]')} 放行阻塞  ${c.cyan('[p]')} 暂停/恢复  ${c.cyan('[f]')} Flush  ${c.cyan('[r]')} 刷新  ${c.red('[x]')} 停止 Daemon  ${c.dim('seq=' + latest.seq)}\n`;
    if (outTty) {
      process.stdout.write('\x1b[H\x1b[2J' + body + '\n' + footer);
    } else {
      process.stdout.write(body + '\n');
    }
  };

  const refresh = async () => {
    if (closed) return;
    dirty = true;
    if (fetching) return;
    fetching = true;
    try {
      while (dirty && !closed) {
        dirty = false;
        latest = await deps.fetchSnapshot();
        paintFrame();
      }
    } catch (e) {
      if (!closed) setFlash('同步失败: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      fetching = false;
    }
  };

  const runAction = (...args: Parameters<TopDashboardDeps['runAction']>): Promise<Reply> =>
    deps.runAction(...args).catch(e => ({ok: false, exit_code: 1, error: {code: 'ipc_error', message: e instanceof Error ? e.message : String(e)}}));

  const firstControllerPane = (): string | undefined => {
    if (!latest) return undefined;
    for (const q of latest.queue ?? []) {
      if (!PENDING_QUEUE_STATES.has(String(q.state))) continue;
      const p = (q.recipient as Record<string, unknown> | undefined)?.pane;
      if (typeof p === 'string' && p) return p;
    }
    for (const t of latest.tasks ?? []) {
      if (TERMINAL_TASK_STATES.has(String(t.state))) continue;
      const p = (t.controller as Record<string, unknown> | undefined)?.pane;
      if (typeof p === 'string' && p) return p;
    }
    for (const project of latest.projects ?? []) {
      if (Array.isArray(project.controllers) && typeof project.controllers[0] === 'string') return project.controllers[0];
    }
    for (const m of latest.managed_panes ?? []) {
      if (m.is_controller === true && typeof m.pane_id === 'string') return m.pane_id;
    }
    return undefined;
  };

  if (outTty) process.stdout.write('\x1b[?1049h\x1b[?25l');

  return new Promise<number>(resolve => {
    let clock: NodeJS.Timeout | undefined;
    const finish = (code: number) => {
      if (closed) return;
      closed = true;
      exitCode = code;
      if (clock) clearInterval(clock);
      if (flashTimer) clearTimeout(flashTimer);
      process.off('SIGINT', onSigInt);
      process.off('SIGTERM', onSigTerm);
      process.stdout.off('resize', paintFrame);
      if (inTty) {
        process.stdin.off('data', onKey);
        try { process.stdin.setRawMode(false); } catch { /* ignore */ }
        process.stdin.pause();
      }
      if (outTty) process.stdout.write('\x1b[?25h\x1b[?1049l');
      resolve(exitCode);
    };

    const onSigInt = () => finish(130);
    const onSigTerm = () => finish(143);

    const onKey = (buf: Buffer) => {
      const ch = buf.toString('utf8');
      if (ch === 'q' || ch === 'Q' || ch === '\x03') { finish(ch === '\x03' ? 130 : 0); return; }
      if (ch === 'r' || ch === 'R') { void refresh(); return; }
      if (ch === 'o' || ch === 'O') {
        const url = deps.uiUrl ?? latest?.daemon?.ui_url;
        if (url) { deps.openBrowser(url); setFlash('已请求打开 WebUI: ' + url); }
        else setFlash('当前 Daemon 未启用内置 WebUI');
        return;
      }
      if (ch === 'a' || ch === 'A') {
        const blocked = (latest?.tasks ?? []).find(t => String(t.state ?? '') === 'blocked');
        if (!blocked) { setFlash('当前无阻塞任务'); return; }
        void runAction('ui.terminal', String(blocked.task), { keys: ['enter'] }).then(r => {
          setFlash(r.ok ? `已发送 Enter 放行 ${String(blocked.task)}` : `放行失败: ${r.error?.message ?? ''}`);
          void refresh();
        });
        return;
      }
      if (ch === 'p' || ch === 'P') {
        const pane = firstControllerPane();
        if (!pane) { setFlash('当前无可暂停的主控收件窗格'); return; }
        const isPaused = (latest?.paused_recipients ?? []).includes(pane);
        const method = isPaused ? 'ui.queue_resume' : 'ui.queue_pause';
        void runAction(method, pane, {}).then(r => {
          setFlash(r.ok ? `${pane} ${isPaused ? '已恢复自动投递' : '已开启免打扰暂停'}` : `切换失败: ${r.error?.message ?? ''}`);
          void refresh();
        });
        return;
      }
      if (ch === 'f' || ch === 'F') {
        const pane = firstControllerPane();
        if (!pane) { setFlash('当前无待消费队列窗格'); return; }
        void runAction('flush', pane, {}).then(r => {
          const data = r.data as Record<string, unknown> | undefined;
          setFlash(r.ok ? `Flush ${pane}: 已消费 ${String(data?.consumed ?? 0)} 条` : `Flush 失败: ${r.error?.message ?? ''}`);
          void refresh();
        });
        return;
      }
      if (ch === 'x' || ch === 'X') {
        const now = Date.now();
        if (now > stopArmedUntil) {
          stopArmedUntil = now + 3500;
          setFlash('再次按 x 确认停止后台 Daemon 服务');
          return;
        }
        stopArmedUntil = 0;
        void runAction('daemon.stop', undefined, { force: true }).then(r => {
          if (r.ok) finish(0);
          else setFlash(`停止失败: ${r.error?.message ?? ''}`);
        });
      }
    };

    process.once('SIGINT', onSigInt);
    process.once('SIGTERM', onSigTerm);
    if (outTty) {
      process.stdout.on('resize', paintFrame);
      clock = setInterval(paintFrame, 1000);
    }
    if (inTty) {
      try { process.stdin.setRawMode(true); } catch { /* ignore */ }
      process.stdin.resume();
      process.stdin.on('data', onKey);
    }
    deps.peer.onUiChange(() => void refresh());
    deps.peer.disconnected.addEventListener('abort', () => finish(0), { once: true });
    void refresh();
  });
}
