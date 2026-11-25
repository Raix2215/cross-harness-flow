import type { Reply } from './types.js';
import { paint, statusChip, permChip, shortPath, formatTable } from './cli-format.js';
import { renderStatusSnapshot, type UiSnapshotData } from './cli-status.js';
export { renderStatusSnapshot, type UiSnapshotData } from './cli-status.js';
export { runTopDashboard, type TopDashboardDeps } from './cli-dashboard.js';

export interface RenderOptions {
  json: boolean;
  tty: boolean;
  uiUrl?: string;
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
      `  ${c.cyan('chflow perm')} <target> <tier> 热切目标权限（readonly|ask|auto|auto-workspace|yolo）`,
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
    ? ' <target> <readonly|ask|auto|auto-workspace|yolo>'
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
    lines.push('Manage global role templates (--global) and project role slots with session hot-swapping. Examples: chflow role list --global | chflow role set implementer --global --kind codex --perm auto-workspace --worktree | chflow role bind implementer --spawn');
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
    lines.push('Interactive TTY only. Updates target permission tier; native changes may require switch --restart. auto delegates approvals to the Harness; auto-workspace adds the permission guard. --workspace-mode selects its native base.');
  } else if (method === 'queue') {
    lines.push('Interactive TTY only. Examples: chflow queue pause w1:p1 | chflow queue push --event <id> | chflow queue resume');
  } else if (method === 'view') {
    lines.push('Reads redacted task mailbox files (brief, reply/out, diag) bounded to .chflow/ tasks directory.');
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
    if (v.scope === 'global' && Array.isArray(v.global_roles)) {
      const globals = v.global_roles as Array<Record<string, unknown>>;
      if (!globals.length) return { stdout: (opts.tty ? c.dim('(暂无全局角色模板；可用 chflow role set <name> --global --kind codex 创建)\n') : 'global_roles=0\n'), stderr: '', exitCode: r.exit_code };
      if (!opts.tty) {
        return {
          stdout: globals.map(rl => ['global', rl.role, rl.default_kind ?? '', rl.default_perm ?? 'ask', rl.worktree ? 'worktree' : ''].filter(Boolean).join(' ')).join('\n') + '\n',
          stderr: '',
          exitCode: r.exit_code,
        };
      }
      const rows = globals.map(rl => [
        c.cyan('global'),
        c.bold(String(rl.role ?? '')),
        String(rl.default_kind ?? '—'),
        permChip(String(rl.default_perm ?? 'ask'), c),
        rl.worktree ? c.green('worktree') : c.dim('—'),
        c.dim(String(rl.description ?? '')),
      ]);
      return { stdout: formatTable(rows, [8, 16, 12, 10, 10, 28]).join('\n') + '\n', stderr: '', exitCode: r.exit_code };
    }
    if (Array.isArray(v.roles)) {
      const roles = v.roles as Array<Record<string, unknown>>;
      if (!roles.length) return { stdout: (opts.tty ? c.dim('(暂无项目角色；可用 chflow role set <name> 或从全局模板 chflow role bind <name> --spawn 启用)\n') : 'roles=0\n'), stderr: '', exitCode: r.exit_code };
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
    const label = `${v.scope === 'global' ? 'global/' : v.project_id ? String(v.project_id) + '/' : ''}${String(v.role ?? 'role')}`;
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
      parts.push(key + ':\n' + rows.map((x: any) => '  ' + [x.role ?? x.task ?? x.pane_id ?? (x.at ? new Date(x.at).toISOString() : ''), x.alias ?? x.kind ?? '', x.state ?? x.agent_status ?? x.event ?? '', x.type ?? x.detail ?? '', x.is_controller === true ? 'ctrl' : '', x.controller?.pane && 'controller=' + x.controller.pane].filter(Boolean).join(' ')).join('\n'));
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
