import type { Peer } from './ipc.js';
import type { Opts, Reply, Route } from './types.js';

export interface UiSnapshotData {
  seq: number;
  now: number;
  route: Route;
  herdr?: string;
  project_filter?: string;
  daemon?: { pid: number; version: string; started_at?: string; ui_url?: string; ui_auth_required?: boolean };
  projects?: Array<Record<string, unknown>>;
  roles?: Array<Record<string, unknown>>;
  managed_panes?: Array<Record<string, unknown>>;
  unmanaged_live_agents?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  queue?: Array<Record<string, unknown>>;
  scheduled_retries?: Array<Record<string, unknown>>;
  paused_recipients?: string[];
  audit?: Array<Record<string, unknown>>;
}

export interface RenderOptions {
  json: boolean;
  tty: boolean;
  uiUrl?: string;
}

export interface TopDashboardDeps {
  peer: Peer;
  fetchSnapshot: () => Promise<UiSnapshotData>;
  uiUrl?: string;
  openBrowser: (url: string) => void;
  runAction: (method: string, target?: string, opts?: Opts) => Promise<Reply>;
}

const ANSI_RX = /\x1b\[[0-9;]*m/g;
const PENDING_QUEUE_STATES = new Set(['queued', 'deferred_user_typing', 'paused_by_operator', 'delivering', 'pending_unreachable']);
const TERMINAL_TASK_STATES = new Set(['succeeded', 'failed', 'cancelled']);

function useColor(tty: boolean): boolean {
  return tty && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
}

function paint(tty: boolean) {
  const on = useColor(tty);
  const w = (code: string) => (s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    bold: w('1'),
    dim: w('2'),
    cyan: w('36'),
    blue: w('34'),
    green: w('32'),
    yellow: w('33'),
    magenta: w('35'),
    red: w('31'),
    gray: w('90'),
    bgBlue: w('44;97;1'),
    bgYellow: w('43;30;1'),
    bgRed: w('41;97;1'),
    bgGreen: w('42;30;1'),
    bgMagenta: w('45;97;1'),
  };
}

function charWidth(cp: number): number {
  if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) return 0;
  if (
    cp >= 0x1100 && (
      cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd)
    )
  ) return 2;
  return 1;
}

function visWidth(s: string): number {
  const plain = s.replace(ANSI_RX, '');
  let w = 0;
  for (const ch of plain) w += charWidth(ch.codePointAt(0) ?? 0);
  return w;
}

function clip(s: string, maxWidth: number): string {
  if (maxWidth <= 1) return s.slice(0, Math.max(0, maxWidth));
  if (visWidth(s) <= maxWidth) return s;
  let out = '', w = 0;
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0) ?? 0);
    if (w + cw > maxWidth - 1) break;
    out += ch;
    w += cw;
  }
  return out + '…';
}

function padEndVis(s: string, width: number): string {
  const w = visWidth(s);
  return w >= width ? s : s + ' '.repeat(width - w);
}

function shortPath(p: unknown): string {
  if (!p) return '—';
  const s = String(p);
  const idx = s.indexOf('.chflow/');
  if (idx >= 0) return s.slice(idx);
  const wt = /\.worktrees\/([^/]+)/.exec(s);
  if (wt) return 'wt:' + wt[1];
  const parts = s.split('/').filter(Boolean);
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : s;
}

function fmtElapsed(startAt: unknown, endAt?: unknown): string {
  if (!startAt) return '—';
  const sec = Math.max(0, Math.round(((Number(endAt || Date.now())) - Number(startAt)) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), r = sec % 60;
  return m < 60 ? `${m}m${r < 10 ? '0' : ''}${r}s` : `${Math.floor(m / 60)}h${m % 60}m`;
}

function fmtRel(ts: unknown): string {
  if (!ts) return '—';
  const diff = Math.round((Number(ts) - Date.now()) / 1000);
  if (Math.abs(diff) < 3) return 'now';
  if (diff > 0) return diff < 60 ? `in ${diff}s` : `in ${Math.round(diff / 60)}m`;
  const ago = -diff;
  return ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.round(ago / 60)}m ago` : `${Math.round(ago / 3600)}h ago`;
}

function statusChip(state: string, c: ReturnType<typeof paint>): string {
  if (state === 'blocked') return c.yellow('▲ blocked');
  if (state === 'working' || state === 'submitted' || state === 'dispatching') return c.blue('● ' + state);
  if (state === 'retrying' || state === 'scheduled_retry') return c.magenta('↻ ' + state);
  if (state === 'idle' || state === 'done' || state === 'succeeded') return c.green('✓ ' + state);
  if (state === 'headless') return c.cyan('⚡ headless');
  if (state === 'unbound') return c.gray('◌ unbound');
  if (state === 'failed' || state === 'cancelled') return c.red('✕ ' + state);
  if (state === 'offline') return c.gray('○ offline');
  return c.dim('· ' + state);
}

function permChip(perm: string, c: ReturnType<typeof paint>): string {
  if (perm === 'yolo') return c.red('yolo');
  if (perm === 'auto-workspace') return c.green('auto-ws');
  if (perm === 'readonly') return c.cyan('readonly');
  return c.dim(perm || 'ask');
}

function formatTable(rows: string[][], widths: number[], indent = '  '): string[] {
  return rows.map(row => indent + row.map((cell, i) => i === row.length - 1 ? cell : padEndVis(cell, widths[i])).join('  '));
}

export function renderHelp(
  method: string | undefined,
  version: string,
  optionsMap: Record<string, string>,
  extraOptions?: (m: string) => string | undefined,
): string {
  const tty = !!process.stdout.isTTY;
  const c = paint(tty);
  const opts = method ? (extraOptions?.(method) ?? optionsMap[method]) : undefined;
  if (!method || opts === undefined) {
    return [
      `${c.bold('chflow')} ${c.cyan('v' + version)} — 多 Harness 项目角色编排与实时观测控制台`,
      '',
      `${c.bold('用法')}: chflow <command> [target] [options] [--json]`,
      '',
      `${c.bold('实时观测与 Web 控制台')}`,
      `  ${c.cyan('chflow')}                     TTY 下直接展示紧凑全局状态、项目汇总与 WebUI 链接`,
      `  ${c.cyan('chflow top')} / ${c.cyan('status -w')}     进入零读屏实时看板（支持 --project，热键 q/o/a/p/f/r）`,
      `  ${c.cyan('chflow status')} / ${c.cyan('health')}     输出多项目、角色、在线工位与 Daemon 状态`,
      `  ${c.cyan('chflow ui')} [${c.dim('--open')}]        打印或打开 Daemon 内置常驻控制台（传 --port/--host 起独立实例）`,
      `  ${c.cyan('chflow open')}                在浏览器直接打开常驻 Web 控制台`,
      `  ${c.cyan('chflow stop')} [${c.dim('--force')}]     显式停止常驻 Daemon（别名 quit）`,
      '',
      `${c.bold('项目角色与维护')}`,
      `  ${c.cyan('chflow role')} <action>       管理项目角色槽位与热换绑（list|set|bind|unbind|remove）`,
      `  ${c.cyan('chflow prune')} [${c.dim('--tasks')}]    清理离线残留与已结单归档任务`,
      '',
      `${c.bold('人类快捷接管（仅交互终端，不暴露给 MCP）')}`,
      `  ${c.cyan('chflow approve')} [task]      一键放行阻塞工位（单阻塞可省 ID，免填 expect-visible）`,
      `  ${c.cyan('chflow perm')} <target> <tier> 零重启热切权限（readonly|ask|auto-workspace|yolo）`,
      `  ${c.cyan('chflow queue')} <action>      操控投递队列（pause|resume|push|drop|consume|reroute）`,
      `  ${c.cyan('chflow view')} <task> [kind]  查看信箱文件（brief|reply|out|diag，支持 --turn N）`,
      '',
      `${c.bold('编排与工位命令（供 Agent 与脚本）')}`,
      `  ${c.dim('工位')}  start, adopt, handoff, switch, list`,
      `  ${c.dim('任务')}  send, run, reply, wait, watch, inspect, respond, resume, retry, finish, cancel`,
      `  ${c.dim('队列')}  inbox, flush`,
      `  ${c.dim('服务')}  daemon start|stop|status|logs, mcp`,
      '',
      `${c.dim('提示：运行 chflow <command> --help 查看具体参数；所有查询与编排命令均支持 --json。')}`,
      '',
    ].join('\n');
  }

  const noTarget = ['ui', 'open', 'top', 'status', 'daemon', 'mcp', 'prune', 'stop', 'quit'].includes(method);
  const targetHint = method === 'perm'
    ? ' <target> <readonly|ask|auto-workspace|yolo>'
    : method === 'queue'
      ? ' <pause|resume|push|drop|consume|reroute> [pane]'
      : method === 'role'
        ? ' <list|set|bind|unbind|remove> [role]'
        : method === 'view'
          ? ' <task> [brief|reply|out|diag]'
          : method === 'approve'
            ? ' [task]'
            : noTarget
              ? ''
              : ' [target]';
  const flags = opts.split(' ').filter(Boolean).map(k => '--' + k.replaceAll('_', '-')).join(' ');
  const lines = [
    `${c.bold('Usage')}: chflow ${method}${targetHint} [options]`,
    `${c.bold('Options')}: ${flags ? flags + ' ' : ''}--json`,
  ];
  if (['send', 'run', 'retry'].includes(method)) {
    lines.push('Business recovery defaults to four retries (5s, 15s, 45s, 120s). Use --max-retries and --retry-backoff to customize; schedule quota recovery with --retry-at/--retry-after (retry: --at/--after). Set --fallback at dispatch or --switch on retry. For role targets, pass --spawn to launch an unbound role. agy permits attended interactive work only, with no automatic retries.');
  } else if (method === 'role') {
    lines.push('Manage stable project role slots and hot-swap underlying sessions. Examples: chflow role list | chflow role set backend --kind codex --perm auto-workspace | chflow role bind backend --pane w2:p1 | chflow role bind backend --spawn --kind claude');
  } else if (method === 'prune') {
    lines.push('Remove stale offline pane records. Pass --tasks to also archive-clean terminal tasks with no pending deliveries.');
  } else if (method === 'ui') {
    lines.push('Default prints the Daemon built-in WebUI URL (--open launches browser). Pass --port/--host/--session/--machine/--standalone to start a dedicated gateway; non-loopback hosts require --allow-remote (access token + HttpOnly cookie enabled automatically).');
  } else if (method === 'stop' || method === 'quit') {
    lines.push('Gracefully stop the background chflow Daemon. Refuses when active tasks exist unless --force is passed.');
  } else if (method === 'top') {
    lines.push('Subscribes to live Daemon updates without reading screens. Hotkeys: q quit, o open WebUI, a approve first blocked task, p pause/resume delivery, f flush inbox, r refresh, x stop Daemon (press twice).');
  } else if (method === 'approve') {
    lines.push('Interactive TTY only. Defaults to sending Enter; auto-targets when exactly one task is blocked.');
  } else if (method === 'perm') {
    lines.push('Interactive TTY only. Hot-updates permission tier without restarting the worker; auto-unblocks permission prompts when upgraded to auto-workspace or yolo.');
  } else if (method === 'queue') {
    lines.push('Interactive TTY only. Examples: chflow queue pause w1:p1 | chflow queue push --event <id> | chflow queue resume');
  } else if (method === 'view') {
    lines.push('Reads redacted task mailbox files (brief, reply/out, diag) bounded to .chflow/ tasks directory.');
  }
  return lines.join('\n') + '\n';
}

export function renderStatusSnapshot(
  snap: UiSnapshotData,
  opts: { tty: boolean; uiUrl?: string; flash?: string; compact?: boolean },
): string {
  const tty = opts.tty;
  const c = paint(tty);
  const cols = Math.max(72, Math.min(132, process.stdout.columns || 100));
  const projects = Array.isArray(snap.projects) ? snap.projects : [];
  const roles = Array.isArray(snap.roles) ? snap.roles : [];
  const tasks = Array.isArray(snap.tasks) ? snap.tasks : [];
  const managed = Array.isArray(snap.managed_panes) ? snap.managed_panes : [];
  const unmanaged = Array.isArray(snap.unmanaged_live_agents) ? snap.unmanaged_live_agents : [];
  const queue = Array.isArray(snap.queue) ? snap.queue : [];
  const retries = Array.isArray(snap.scheduled_retries) ? snap.scheduled_retries : [];
  const paused = Array.isArray(snap.paused_recipients) ? snap.paused_recipients : [];

  const activeTasks = tasks.filter(t => !TERMINAL_TASK_STATES.has(String(t.state ?? '')));
  const blockedTasks = tasks.filter(t => String(t.state ?? '') === 'blocked');
  const pendingQueue = queue.filter(q => PENDING_QUEUE_STATES.has(String(q.state ?? '')));
  const activeRetries = retries.filter(r => r.state === 'pending' || r.state === 'running');
  const uiUrl = opts.uiUrl ?? snap.daemon?.ui_url;
  const ver = snap.daemon?.version ?? '';
  const pid = snap.daemon?.pid ?? '—';
  const herdrOk = snap.herdr === 'reachable';
  const lines: string[] = [];

  // Header
  const scopeTag = snap.project_filter ? ` ${c.bgBlue(' ' + snap.project_filter + ' ')}` : '';
  const headLeft = `${c.bold('chflow')} ${c.cyan('v' + ver)}${scopeTag} ${c.dim('pid=' + pid)} · herdr ${herdrOk ? c.green('reachable') : c.yellow(String(snap.herdr ?? 'unknown'))}`;
  const headRight = uiUrl ? `${c.bold('WebUI:')} ${c.cyan(uiUrl)}${snap.daemon?.ui_auth_required ? ' ' + c.yellow('[token]') : ''}` : c.dim('WebUI: disabled');
  lines.push(`${headLeft}   ${headRight}`);
  lines.push(c.dim('─'.repeat(Math.min(cols, 96))));

  // KPI strip
  lines.push([
    `项目 ${c.bold(String(projects.length))}`,
    `角色 ${c.bold(String(roles.length))}`,
    `活跃任务 ${c.bold(String(activeTasks.length))}`,
    `阻塞 ${blockedTasks.length ? c.yellow(c.bold(String(blockedTasks.length))) : c.dim('0')}`,
    `候投 ${pendingQueue.length ? c.cyan(c.bold(String(pendingQueue.length))) : c.dim('0')}`,
    `重试 ${activeRetries.length ? c.magenta(c.bold(String(activeRetries.length))) : c.dim('0')}`,
    paused.length ? c.yellow(`! DND(${paused.join(',')})`) : c.green('● 投递就绪'),
  ].join('  │  '));

  // Multi-project overview bar
  if (projects.length > 0 && !snap.project_filter) {
    const chips = projects.slice(0, 6).map(pr => {
      const name = String(pr.name ?? pr.project_id ?? '');
      const act = Number(pr.active_tasks ?? 0);
      const blk = Number(pr.blocked_count ?? 0);
      const ctrls = Array.isArray(pr.controllers) ? pr.controllers.length : 0;
      const badge = blk > 0 ? c.yellow(`▲${blk}`) : act > 0 ? c.blue(`●${act}`) : c.dim('idle');
      return `${c.bold(clip(name, 20))}(${badge}${ctrls > 1 ? ` · ${ctrls}主控` : ''})`;
    });
    lines.push(`${c.dim('项目视图:')} ${chips.join('   ')}`);
  }

  // Priority alert banner
  if (blockedTasks.length || pendingQueue.some(q => q.state === 'deferred_user_typing' || q.state === 'paused_by_operator')) {
    lines.push('');
    for (const bt of blockedTasks.slice(0, 3)) {
      const blk = (bt.block as Record<string, unknown> | undefined) ?? {};
      const reason = String(blk.reason ?? blk.kind ?? bt.reason ?? 'approval_required');
      const roleTag = bt.role ? `[${String(bt.role)}] ` : '';
      lines.push(
        `  ${c.bgYellow(' BLOCKED ')} ${roleTag}${c.bold(String(bt.task))}#${String(bt.turn ?? 1)} (${String(bt.name ?? bt.kind)} · ${String(bt.pane_id ?? bt.pane ?? 'headless')}) ` +
        `${c.yellow(reason)}  ${c.dim('→')} ${c.cyan(`chflow approve ${String(bt.task)}`)} ${c.dim('|')} ${c.cyan(`chflow view ${String(bt.task)} diag`)}`,
      );
    }
    const deferred = pendingQueue.filter(q => q.state === 'deferred_user_typing' || q.state === 'paused_by_operator');
    if (deferred.length) {
      lines.push(
        `  ${c.bgBlue(' QUEUED ')} ${deferred.length} 条回执处于暂缓/免打扰状态  ${c.dim('→')} ${c.cyan('chflow queue push')} ${c.dim('(强推入终端) |')} ${c.cyan('chflow flush')} ${c.dim('(仅阅)')}`,
      );
    }
  }

  // Roles table (if any project roles defined)
  if (roles.length) {
    lines.push('');
    lines.push(c.bold(`项目角色 (${roles.length})`));
    const roleRows = roles.slice(0, opts.compact ? 6 : 12).map(rl => {
      const st = String(rl.agent_status ?? (rl.binding_mode === 'unbound' ? 'unbound' : rl.binding_mode ?? 'unbound'));
      const bindDesc = rl.binding_mode === 'pane'
        ? `${String(rl.kind ?? '')}(${String(rl.pane_id ?? '—')})`
        : rl.binding_mode === 'headless'
          ? `headless:${String(rl.kind ?? rl.default_kind ?? 'codex')}`
          : c.dim(`待命(${String(rl.default_kind ?? 'any')})`);
      const perm = String(rl.perm ?? rl.default_perm ?? 'ask');
      const proj = String(rl.project_id ?? '');
      const desc = String(rl.description ?? (rl.active_task ? 'task:' + String(rl.active_task) : ''));
      return [
        statusChip(st, c),
        c.bold(clip(String(rl.role ?? ''), 16)),
        clip(String(bindDesc), 20),
        permChip(perm, c),
        c.dim(clip(proj, 16)),
        c.dim(clip(desc, Math.max(16, cols - 82))),
      ];
    });
    lines.push(...formatTable(roleRows, [13, 16, 20, 8, 16, 20]));
  }

  // Tasks table
  const shownTasks = (activeTasks.length ? activeTasks : tasks.slice(0, 5)).slice(0, opts.compact ? 8 : 12);
  lines.push('');
  lines.push(c.bold(activeTasks.length ? `任务 (${activeTasks.length} 活跃 / ${tasks.length} 总计)` : `最近任务 (${tasks.length})`));
  if (!shownTasks.length) {
    lines.push(c.dim('  (暂无任务；由 Agent 或 Web 控制台派发后自动在此实时呈现)'));
  } else {
    const taskRows = shownTasks.map(t => {
      const st = String(t.state ?? 'unknown');
      const done = TERMINAL_TASK_STATES.has(st);
      const id = `${String(t.task)}#${String(t.turn ?? 1)}`;
      const worker = t.role
        ? `@${String(t.role)}(${String(t.pane_id ?? t.pane ?? 'headless')})`
        : `${String(t.name ?? t.kind ?? 'worker')}(${String(t.pane_id ?? t.pane ?? 'headless')})`;
      const noteText = String(t.note ?? (t.block as Record<string, unknown> | undefined)?.reason ?? t.reason ?? '');
      return [
        statusChip(st, c),
        c.bold(clip(id, 22)),
        clip(worker, 22),
        permChip(String(t.perm ?? 'ask'), c),
        c.dim(fmtElapsed(t.startedAt, done ? t.activityAt : undefined)),
        c.dim(clip(noteText, Math.max(18, cols - 78))),
      ];
    });
    lines.push(...formatTable(taskRows, [14, 22, 22, 8, 7, 20]));
  }

  // Live panes table
  if (managed.length || unmanaged.length) {
    lines.push('');
    lines.push(c.bold(`在线工位 (${managed.length} 受管 · ${unmanaged.length} 未纳管)`));
    const paneRows: string[][] = [];
    for (const p of managed.slice(0, opts.compact ? 6 : 10)) {
      const live = p.live !== false;
      const st = live ? String(p.agent_status ?? 'idle') : 'offline';
      const model = [p.kind, p.model, p.effort].filter(Boolean).join(':');
      const ctrl = (p.controller as Record<string, unknown> | null)?.pane;
      const rolePrefix = p.role ? `@${String(p.role)} ` : '';
      paneRows.push([
        statusChip(st, c),
        c.bold(clip(rolePrefix + String(p.alias ?? p.name ?? p.pane_id), 20)),
        c.cyan(String(p.pane_id ?? '—')),
        clip(model || String(p.kind ?? ''), 18),
        permChip(String(p.perm ?? 'ask'), c),
        c.dim(`${ctrl ? '←' + String(ctrl) + ' ' : ''}${shortPath(p.cwd)}`),
      ]);
    }
    for (const u of unmanaged.slice(0, opts.compact ? 4 : 8)) {
      paneRows.push([
        c.gray('◌ unmng'),
        c.dim(clip(String(u.name ?? u.pane_id), 20)),
        c.dim(String(u.pane_id ?? '—')),
        c.dim(String(u.kind ?? 'unknown')),
        c.dim('—'),
        c.dim(`${String(u.agent_status ?? 'live')} · ${shortPath(u.cwd)}`),
      ]);
    }
    lines.push(...formatTable(paneRows, [12, 20, 9, 18, 8, 20]));
  }

  // Queue & retries compact block
  if (pendingQueue.length || activeRetries.length) {
    lines.push('');
    lines.push(c.bold(`候投队列 (${pendingQueue.length}) & 定时重试 (${activeRetries.length})`));
    for (const q of pendingQueue.slice(0, opts.compact ? 4 : 6)) {
      const to = String((q.recipient as Record<string, unknown> | undefined)?.pane ?? '—');
      lines.push(
        `  ${c.cyan('⇄')} ${c.bold(String(q.task))}#${String(q.turn ?? 1)} ${c.dim('→')} ${to}  ${statusChip(String(q.state ?? ''), c)}  ${c.dim(clip(String(q.status ?? '') + (q.note ? ' · ' + String(q.note) : ''), 44))}`,
      );
    }
    for (const r of activeRetries.slice(0, 3)) {
      lines.push(
        `  ${c.magenta('⏰')} ${c.bold(String(r.task))}  ${c.magenta(fmtRel(r.at))}  ${c.dim(new Date(Number(r.at)).toLocaleTimeString())}`,
      );
    }
  }

  if (opts.flash) {
    lines.push('');
    lines.push(`  ${c.bgGreen(' INFO ')} ${opts.flash}`);
  } else if (!opts.compact) {
    lines.push('');
    lines.push(c.dim('快捷: chflow top 实时看板 · chflow open 打开控制台 · chflow role list 查看角色 · chflow --help'));
  }

  return lines.join('\n') + '\n';
}

function errorHint(code: string): string | undefined {
  if (code === 'operator_required') return '提示：该快捷指令仅允许人类在交互终端运行，或在本地 Web 控制台（chflow open）执行。';
  if (code === 'pane_owned_by_other') return '提示：该窗格归属另一会话，可通过 chflow handoff 移交或在 WebUI 接管。';
  if (code === 'role_unbound') return '提示：该角色当前为待命槽位，请先运行 chflow role bind <role> ... 或派发时显式加 --spawn。';
  if (code === 'role_busy') return '提示：该角色存在进行中的任务，请等待结束、结单或取消后再热换绑。';
  if (code === 'daemon_unavailable') return '提示：请检查 chflow daemon status / chflow daemon logs。';
  if (code === 'task_not_found') return '提示：运行 chflow status 查看当前活跃任务列表。';
  return undefined;
}

export function renderReply(r: Reply, method: string, opts: RenderOptions): { stdout: string; stderr: string; exitCode: number } {
  const v = r.data as Record<string, unknown> | undefined;
  if (opts.json) {
    const out = r.error ? { error: r.error, exit_code: r.exit_code } : method === 'daemon' ? { data: v, exit_code: r.exit_code } : v;
    return { stdout: JSON.stringify(out ?? {}) + '\n', stderr: '', exitCode: r.exit_code };
  }
  const c = paint(opts.tty);
  if (r.error) {
    const hint = opts.tty ? errorHint(r.error.code) : undefined;
    const msg = opts.tty
      ? `${c.red(c.bold(r.error.code))}: ${r.error.message}${hint ? '\n' + c.dim(hint) : ''}\n`
      : `${r.error.code}: ${r.error.message}\n`;
    return { stdout: '', stderr: msg, exitCode: r.exit_code };
  }

  if (method === 'status' && v && 'tasks' in v) {
    return {
      stdout: renderStatusSnapshot(v as unknown as UiSnapshotData, { tty: opts.tty, uiUrl: opts.uiUrl }),
      stderr: '',
      exitCode: r.exit_code,
    };
  }
  if ((method === 'health' || method === 'list') && opts.tty && v && ('tasks' in v || 'managed_panes' in v)) {
    return {
      stdout: renderStatusSnapshot(v as unknown as UiSnapshotData, { tty: true, uiUrl: opts.uiUrl }),
      stderr: '',
      exitCode: r.exit_code,
    };
  }
  if (method === 'role' && v) {
    if (Array.isArray(v.roles)) {
      const roles = v.roles as Array<Record<string, unknown>>;
      if (!roles.length) return { stdout: (opts.tty ? c.dim('(暂无角色；可用 chflow role set <name> --kind codex 创建)\n') : 'roles=0\n'), stderr: '', exitCode: r.exit_code };
      if (!opts.tty) {
        return {
          stdout: roles.map(rl => [rl.project_id, rl.role, rl.binding_mode, rl.pane_id ?? rl.kind ?? rl.default_kind ?? '', rl.agent_status].filter(Boolean).join(' ')).join('\n') + '\n',
          stderr: '',
          exitCode: r.exit_code,
        };
      }
      const rows = roles.map(rl => [
        statusChip(String(rl.agent_status ?? rl.binding_mode ?? 'unbound'), c),
        c.bold(String(rl.role ?? '')),
        c.cyan(String(rl.project_id ?? '')),
        rl.binding_mode === 'pane' ? `${String(rl.kind ?? '')}(${String(rl.pane_id ?? '')})` : String(rl.binding_mode ?? 'unbound'),
        permChip(String(rl.perm ?? rl.default_perm ?? 'ask'), c),
        c.dim(String(rl.description ?? '')),
      ]);
      return { stdout: formatTable(rows, [13, 16, 18, 18, 8, 24]).join('\n') + '\n', stderr: '', exitCode: r.exit_code };
    }
    const label = `${String(v.project_id ? String(v.project_id) + '/' : '')}${String(v.role ?? 'role')}`;
    const state = String(v.removed ? 'removed' : (v.binding_mode ?? 'updated'));
    const detail = v.pane_id ? ` -> ${String(v.kind ?? '')}(${String(v.pane_id)})` : '';
    return {
      stdout: opts.tty ? `${c.green('✓')} 角色 ${c.bold(label)} [${state}]${detail}\n` : `${label} ${state}${detail}\n`,
      stderr: '',
      exitCode: r.exit_code,
    };
  }
  if (method === 'prune' && v) {
    const p = Number(v.pruned_panes ?? 0), t = Number(v.pruned_tasks ?? 0);
    return {
      stdout: opts.tty ? `${c.green('✓')} 已清理离线工位 ${p} 个、已结单任务 ${t} 个\n` : `pruned_panes=${p} pruned_tasks=${t}\n`,
      stderr: '',
      exitCode: r.exit_code,
    };
  }
  if (method === 'view' && v && 'content' in v) {
    const body = v.exists ? String(v.content) : `(文件尚未生成: ${String(v.path ?? '')})`;
    if (!opts.tty) return { stdout: body + '\n', stderr: '', exitCode: r.exit_code };
    const header = `${c.bold(String(v.task ?? ''))}#${String(v.turn ?? 1)} ${c.cyan(String(v.kind ?? ''))} ${c.dim(shortPath(v.path))}`;
    return {
      stdout: `${header}\n${c.dim('─'.repeat(72))}\n${body.replace(/\n$/, '')}\n`,
      stderr: '',
      exitCode: r.exit_code,
    };
  }
  if (method === 'approve' && v) {
    const msg = opts.tty
      ? `${c.green('✓')} 已放行 ${c.bold(String(v.task ?? v.pane ?? 'target'))}${v.pane ? c.dim(' (' + String(v.pane) + ')') : ''}\n`
      : `approved ${String(v.task ?? v.pane ?? 'ok')}\n`;
    return { stdout: msg, stderr: '', exitCode: r.exit_code };
  }
  if (method === 'perm' && v) {
    const msg = opts.tty
      ? `${c.green('✓')} 权限已热更新: ${c.bold(String(v.target ?? ''))} → ${permChip(String(v.perm ?? ''), c)}\n`
      : `${String(v.target ?? '')} perm=${String(v.perm ?? '')}\n`;
    return { stdout: msg, stderr: '', exitCode: r.exit_code };
  }
  if (method === 'queue' && v) {
    const summary = 'delivered' in v
      ? `强制推入终端 ${String(v.delivered)} 条回执`
      : 'paused' in v
        ? `${String(v.pane ?? '全部')} ${v.paused ? '已暂停投递 (DND)' : '已恢复自动投递'}`
        : v.to
          ? `已改投至 ${String(v.to)}`
          : '队列操作已生效';
    return { stdout: (opts.tty ? `${c.green('✓')} ${summary}\n` : JSON.stringify(v) + '\n'), stderr: '', exitCode: r.exit_code };
  }
  if (method === 'inspect' && v?.screen) return { stdout: String(v.screen) + '\n', stderr: '', exitCode: r.exit_code };
  if (method === 'inspect' && v?.diag_text) return { stdout: String(v.diag_text) + '\n', stderr: '', exitCode: r.exit_code };
  if (method === 'flush' && v) return { stdout: String(v.summary) + '\n', stderr: '', exitCode: r.exit_code };
  if (v && 'task' in v) {
    return {
      stdout: [v.task, v.state ?? (v.already_running ? 'already_running' : v.already_unblocked ? 'already_unblocked' : 'ok'), v.attempt && 'attempt=' + v.attempt, v.reason && 'reason=' + v.reason, v.out && 'out=' + v.out].filter(Boolean).join(' ') + '\n',
      stderr: '',
      exitCode: r.exit_code,
    };
  }
  if (v && ('tasks' in v || 'audit' in v)) {
    const parts: string[] = [];
    if (Array.isArray(v.tasks)) {
      const uiUrl = (v.daemon as Record<string, unknown> | undefined)?.ui_url ?? opts.uiUrl;
      parts.push(`tasks=${v.tasks.length} queue=${Array.isArray(v.queue) ? v.queue.length : 0} retries=${Array.isArray(v.scheduled_retries) ? v.scheduled_retries.length : 0}${v.herdr ? ' herdr=' + v.herdr : ''}${uiUrl ? ' ui=' + uiUrl : ''}`);
    }
    for (const key of ['roles', 'tasks', 'managed_panes', 'unmanaged_live_agents', 'queue', 'scheduled_retries', 'audit']) {
      const rows = v[key];
      if (!Array.isArray(rows) || !rows.length) continue;
      parts.push(key + ':\n' + rows.map((x: any) => '  ' + [x.role ?? x.task ?? x.pane_id ?? (x.at ? new Date(x.at).toISOString() : ''), x.alias ?? x.kind ?? '', x.state ?? x.agent_status ?? x.event ?? '', x.type ?? x.detail ?? '', x.controller?.pane && 'controller=' + x.controller.pane].filter(Boolean).join(' ')).join('\n'));
    }
    return { stdout: parts.join('\n') + '\n', stderr: '', exitCode: r.exit_code };
  }
  if (v && 'running' in v) {
    const uiUrl = v.ui_url ? ` ui=${String(v.ui_url)}` : '';
    return { stdout: v.running ? `running pid=${v.pid}${uiUrl}\n` : 'stopped\n', stderr: '', exitCode: r.exit_code };
  }
  if (v?.pane_id) {
    return {
      stdout: [v.alias, v.pane_id, v.hint ?? (v.suggested_restart ? 'Use --restart to apply changes.' : 'ok')].filter(Boolean).join(' ') + '\n',
      stderr: '',
      exitCode: r.exit_code,
    };
  }
  return { stdout: v ? JSON.stringify(v) + '\n' : '', stderr: '', exitCode: r.exit_code };
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

  const firstControllerPane = (): string | undefined => {
    if (!latest) return undefined;
    for (const q of latest.queue ?? []) {
      const p = (q.recipient as Record<string, unknown> | undefined)?.pane;
      if (typeof p === 'string' && p) return p;
    }
    for (const t of latest.tasks ?? []) {
      const p = (t.controller as Record<string, unknown> | undefined)?.pane;
      if (typeof p === 'string' && p) return p;
    }
    for (const m of latest.managed_panes ?? []) {
      const p = (m.controller as Record<string, unknown> | undefined)?.pane;
      if (typeof p === 'string' && p) return p;
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
        void deps.runAction('ui.terminal', String(blocked.task), { keys: ['enter'] }).then(r => {
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
        void deps.runAction(method, pane, {}).then(r => {
          setFlash(r.ok ? `${pane} ${isPaused ? '已恢复自动投递' : '已开启免打扰暂停'}` : `切换失败: ${r.error?.message ?? ''}`);
          void refresh();
        });
        return;
      }
      if (ch === 'f' || ch === 'F') {
        const pane = firstControllerPane();
        if (!pane) { setFlash('当前无待消费队列窗格'); return; }
        void deps.runAction('flush', pane, {}).then(r => {
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
        void deps.runAction('daemon.stop', undefined, { force: true }).then(r => {
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
