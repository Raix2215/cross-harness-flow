import type { Route } from './types.js';
import { paint, clip, statusChip, permChip, shortPath, formatTable, fmtElapsed, fmtRel, PENDING_QUEUE_STATES, TERMINAL_TASK_STATES } from './cli-format.js';

export interface UiSnapshotData {
  seq: number;
  now: number;
  route: Route;
  herdr?: string;
  project_filter?: string;
  daemon?: { pid: number; version: string; started_at?: string; ui_url?: string; ui_auth_required?: boolean };
  projects?: Array<Record<string, unknown>>;
  controller_views?: Array<Record<string, unknown>>;
  roles?: Array<Record<string, unknown>>;
  global_roles?: Array<Record<string, unknown>>;
  managed_panes?: Array<Record<string, unknown>>;
  unmanaged_live_agents?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  queue?: Array<Record<string, unknown>>;
  scheduled_retries?: Array<Record<string, unknown>>;
  paused_recipients?: string[];
  audit?: Array<Record<string, unknown>>;
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
    const onlineManaged=managed.filter(p=>p.live!==false).length;
    const offlineManaged=managed.length-onlineManaged;
    lines.push(c.bold(`在线工位 (${onlineManaged} 受管 · ${unmanaged.length} 未纳管${offlineManaged?` · ${offlineManaged} 离线受管`:''})`));
    const paneRows: string[][] = [];
    for (const p of managed.slice(0, opts.compact ? 6 : 10)) {
      const live = p.live !== false;
      const st = live ? String(p.agent_status ?? 'idle') : 'offline';
      const hName = String(p.harness_label ?? p.kind ?? '');
      const model = [hName, p.model, p.effort].filter(Boolean).join(':');
      const loc = p.location_label ? String(p.location_label) : shortPath(p.cwd);
      const label = String(p.display_name ?? (p.role ? `@${String(p.role)}` : p.alias ?? p.name ?? p.pane_id));
      paneRows.push([
        p.is_controller===true ? c.cyan('ctrl') : statusChip(st, c),
        c.bold(clip(label, 24)),
        clip(model, 20),
        permChip(String(p.perm ?? 'ask'), c),
        c.dim(`${loc} (${String(p.pane_id ?? '—')})`),
      ]);
    }
    for (const u of unmanaged.slice(0, opts.compact ? 4 : 8)) {
      const label = String(u.display_name ?? u.name ?? u.pane_id);
      const loc = u.location_label ? String(u.location_label) : shortPath(u.cwd);
      paneRows.push([
        c.gray('◌ unmng'),
        c.cyan(clip(label, 24)),
        c.dim(String(u.agent_status ?? 'live')),
        c.dim('—'),
        c.dim(`${loc} (${String(u.pane_id ?? '—')})`),
      ]);
    }
    lines.push(...formatTable(paneRows, [12, 24, 20, 8, 28]));
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
        `  ${c.magenta('↻')} ${c.bold(String(r.task))}  ${c.magenta(fmtRel(r.at))}  ${c.dim(new Date(Number(r.at)).toLocaleTimeString())}`,
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

