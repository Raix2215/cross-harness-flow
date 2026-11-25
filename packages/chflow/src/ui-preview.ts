export const PREVIEW_JS = String.raw`
function makePreviewSnapshot(){
  const now = Date.now(), min = 60000;
  return {
    seq: 42, now, herdr: 'reachable',
    daemon: { pid: 48213, version: BOOT.version || '3.6.1', started_at: new Date(now - (3*60+12)*min).toISOString(), ui_url: 'http://127.0.0.1:4317', running: true },
    global_roles: [
      { role: 'implementer', description: '通用功能实现与单元测试', default_kind: 'codex', default_perm: 'auto-workspace', worktree: true },
      { role: 'reviewer', description: '异构代码与安全审阅', default_kind: 'claude', default_perm: 'readonly', worktree: false },
      { role: 'researcher', description: '架构调研与方案对比', default_kind: 'pi', default_perm: 'readonly', worktree: false }
    ],
    projects: [
      { project_id: 'acme-api', name: 'acme-api', root: '~/workspace/acme-api', source: 'config', controllers: ['w1:p2','w1:p5'], roles_count: 4, live_panes: 4, active_tasks: 3, blocked_count: 1 },
      { project_id: 'web-portal', name: 'web-portal', root: '~/workspace/web-portal', source: 'git', controllers: ['w3:p1'], roles_count: 2, live_panes: 2, active_tasks: 2, blocked_count: 0 }
    ],
    roles: [
      { project_id: 'acme-api', role: 'backend', description: '服务端实现与单元测试', source: 'config', binding_mode: 'pane', pane_id: 'w2:p1', kind: 'codex', default_kind: 'codex', perm: 'auto-workspace', model: 'codex-model', live: true, agent_status: 'working', active_task: 'feat-rate-limit', controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' } },
      { project_id: 'acme-api', role: 'docs', description: 'API 文档与变更日志', source: 'config', binding_mode: 'headless', kind: 'pi', default_kind: 'pi', perm: 'auto-workspace', model: 'pi-model', live: true, agent_status: 'scheduled_retry', active_task: 'sync-api-docs', controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' } },
      { project_id: 'acme-api', role: 'reviewer', description: '异构代码审阅与测试复核', source: 'config', binding_mode: 'pane', pane_id: 'w2:p3', kind: 'claude', default_kind: 'claude', perm: 'ask', model: 'sonnet', live: true, agent_status: 'blocked', active_task: 'review-pr-87', controller: { pane: 'w1:p5', label: '主控 B', kind: 'codex' } },
      { project_id: 'acme-api', role: 'auditor', description: '依赖与安全合规审计', source: 'config', binding_mode: 'unbound', kind: 'pi', default_kind: 'pi', perm: 'readonly', model: 'pi-fast', live: false, agent_status: 'unbound' },
      { project_id: 'web-portal', role: 'frontend', description: '页面交互与样式实现', source: 'manual', binding_mode: 'pane', pane_id: 'w3:p2', kind: 'agy', default_kind: 'agy', perm: 'auto-workspace', model: 'primary-interactive', live: true, agent_status: 'working', active_task: 'checkout-ux', controller: { pane: 'w3:p1', label: '主控 A', kind: 'agy' } },
      { project_id: 'web-portal', role: 'tester', description: '黑盒 E2E 与回归测试', source: 'manual', binding_mode: 'headless', kind: 'codex', default_kind: 'codex', perm: 'auto-workspace', model: 'codex-mini', live: true, agent_status: 'retrying', active_task: 'checkout-e2e', controller: { pane: 'w3:p1', label: '主控 A', kind: 'agy' } }
    ],
    managed_panes: [
      { pane_id: 'w2:p1', alias: 'backend', role: 'backend', display_name: 'backend', harness_label: 'Codex', location_label: 'WORK / API 研发', kind: 'codex', model: 'codex-model', perm: 'auto-workspace', native_perm: 'auto-workspace', perm_mode: 'native', project_id: 'acme-api', live: true, agent_status: 'working', cwd: '~/workspace/acme-api', controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' } },
      { pane_id: 'w2:p3', alias: 'reviewer', role: 'reviewer', display_name: 'reviewer', harness_label: 'Claude Code', location_label: 'WORK / 审查台', kind: 'claude', model: 'sonnet', perm: 'ask', native_perm: 'ask', perm_mode: 'native', project_id: 'acme-api', live: true, agent_status: 'blocked', cwd: '~/workspace/acme-api', controller: { pane: 'w1:p5', label: '主控 B', kind: 'codex' } },
      { pane_id: 'w3:p2', alias: 'frontend', role: 'frontend', display_name: 'frontend', harness_label: 'Antigravity', location_label: 'Web / 结算页', kind: 'agy', model: 'primary-interactive', perm: 'auto-workspace', native_perm: 'ask', perm_mode: 'proxy', project_id: 'web-portal', live: true, agent_status: 'working', cwd: '~/workspace/web-portal', controller: { pane: 'w3:p1', label: '主控 A', kind: 'agy' } }
    ],
    controller_views: [
      { project_id: 'acme-api', pane_id: 'w1:p2', live: true, display_name: '主控 A', kind: 'claude', harness_label: 'Claude Code', model: 'sonnet', location_label: 'WORK / API 主控', cwd: '~/workspace/acme-api', agent_status: 'idle', managed: true, perm: 'auto-workspace', native_perm: 'ask', perm_mode: 'proxy', paused: false, typing: true, queued_count: 1, managed_roles_count: 2, managed_workers_count: 0, active_tasks_count: 2, blocked_tasks_count: 0 },
      { project_id: 'acme-api', pane_id: 'w1:p5', live: true, display_name: '主控 B', kind: 'codex', harness_label: 'Codex', model: 'codex-model', location_label: 'WORK / 审查主控', cwd: '~/workspace/acme-api', agent_status: 'idle', managed: false, paused: false, typing: false, queued_count: 0, managed_roles_count: 1, managed_workers_count: 0, active_tasks_count: 1, blocked_tasks_count: 1 },
      { project_id: 'web-portal', pane_id: 'w3:p1', live: true, display_name: '主控 A', kind: 'agy', harness_label: 'Antigravity', location_label: 'Web / 交互主控', cwd: '~/workspace/web-portal', agent_status: 'working', managed: true, perm: 'yolo', native_perm: 'ask', perm_mode: 'proxy', paused: false, typing: false, queued_count: 0, managed_roles_count: 2, managed_workers_count: 0, active_tasks_count: 2, blocked_tasks_count: 0 }
    ],
    unmanaged_live_agents: [
      { pane_id: 'w1:p2', name: '主控 A', display_name: '主控 A', harness_label: 'Claude Code', location_label: 'WORK / API 主控', kind: 'claude', agent_status: 'idle', cwd: '~/workspace/acme-api', project_id: 'acme-api' },
      { pane_id: 'w1:p5', name: '主控 B', display_name: '主控 B', harness_label: 'Codex', location_label: 'WORK / 审查主控', kind: 'codex', agent_status: 'idle', cwd: '~/workspace/acme-api', project_id: 'acme-api' },
      { pane_id: 'w3:p1', name: '主控 A', display_name: '主控 A', harness_label: 'Antigravity', location_label: 'Web / 交互主控', kind: 'agy', agent_status: 'idle', cwd: '~/workspace/web-portal', project_id: 'web-portal' },
      { pane_id: 'w4:p1', display_name: 'web-portal · Claude Code', harness_label: 'Claude Code', location_label: 'DevOps / 调试标签', kind: 'claude', agent_status: 'idle', cwd: '~/workspace/web-portal', project_id: 'web-portal' },
      { pane_id: 'w4:p2', display_name: 'acme-api · Codex', harness_label: 'Codex', location_label: 'WORK / 临时终端', kind: 'codex', agent_status: 'idle', cwd: '~/workspace/acme-api', project_id: 'acme-api' }
    ],
    tasks: [
      { task: 'feat-rate-limit', turn: 2, state: 'submitted', mode: 'interactive', kind: 'codex', perm: 'auto-workspace', name: 'backend', role: 'backend', pane_id: 'w2:p1', project_id: 'acme-api', controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' }, startedAt: now - 9*min, note: '正在编写 src/store/redis-store.ts' },
      { task: 'init-rate-limit', turn: 1, state: 'succeeded', mode: 'interactive', kind: 'codex', perm: 'auto-workspace', name: 'backend', role: 'backend', pane_id: 'w2:p1', project_id: 'acme-api', controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' }, startedAt: now - 35*min, note: '限流配置接口初始化已完成' },
      { task: 'review-pr-87', turn: 1, state: 'blocked', mode: 'interactive', kind: 'claude', perm: 'ask', name: 'reviewer', role: 'reviewer', pane_id: 'w2:p3', project_id: 'acme-api', controller: { pane: 'w1:p5', label: '主控 B', kind: 'codex' }, startedAt: now - 4*min, block: { kind: 'permission', reason: 'pnpm test --filter @acme/api -- --runInBand', seq: 42, since: now - 4*min } },
      { task: 'sync-api-docs', turn: 1, state: 'scheduled_retry', mode: 'headless', kind: 'pi', perm: 'auto-workspace', name: 'docs', role: 'docs', project_id: 'acme-api', controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' }, startedAt: now - 14*min, retries: 2, nextAt: now + 125000, reason: '额度窗口受限 (HTTP 429)', fallback: [{ kind: 'codex', channel: 'codex-sub' }, { kind: 'claude', channel: 'claude-sub' }] },
      { task: 'checkout-ux', turn: 1, state: 'submitted', mode: 'interactive', kind: 'agy', perm: 'auto-workspace', name: 'frontend', role: 'frontend', pane_id: 'w3:p2', project_id: 'web-portal', controller: { pane: 'w3:p1', label: '主控 A', kind: 'agy' }, startedAt: now - 6*min, note: '正在更新 CheckoutForm.tsx' },
      { task: 'checkout-e2e', turn: 1, state: 'retrying', mode: 'headless', kind: 'codex', perm: 'auto-workspace', name: 'tester', role: 'tester', project_id: 'web-portal', controller: { pane: 'w3:p1', label: '主控 A', kind: 'agy' }, startedAt: now - 3*min, retries: 1, nextAt: now + 15000, reason: '执行器瞬时超时', fallback: [{ kind: 'claude', channel: 'claude-sub' }] }
    ],
    queue: [
      { event_id: 'ev-1', task: 'feat-rate-limit', turn: 1, state: 'deferred_user_typing', type: 'reply', status: 'succeeded', worker: 'backend', perm: 'auto-workspace', note: '第 1 轮限流实现回执已生成，因你在 WORK / API 主控 正在输入而暂缓投递', created: now - 65000, recipient: { pane: 'w1:p2', label: '主控 A' } }
    ],
    scheduled_retries: [
      { task: 'sync-api-docs', state: 'pending', nextAt: now + 125000, reason: 'quota_window_429' },
      { task: 'checkout-e2e', state: 'pending', nextAt: now + 15000, reason: 'transient_timeout' }
    ],
    paused_recipients: [],
    audit: [
      { id: 105, at: now - 4*min, task: 'review-pr-87', event: 'blocked', detail: 'permission (reviewer)' },
      { id: 104, at: now - 65000, task: 'feat-rate-limit', event: 'deferred_user_typing', detail: '主控 A' },
      { id: 103, at: now - 8*min, task: 'sync-api-docs', event: 'scheduled_retry', detail: 'attempt=2 fallback=codex-sub' },
      { id: 102, at: now - 12*min, task: 'review-pr-87', event: 'submitted', detail: 'reviewer (ask)' },
      { id: 101, at: now - 18*min, task: null, event: 'pane_pruned', detail: '已退出会话自动清理' }
    ]
  };
}

const PREVIEW_FILES = {
  'review-pr-87:diag': '[blocked_kind=permission | state_change_seq=42]\nRequesting permission for:\n  pnpm test --filter @acme/api -- --runInBand\n  env API_TOKEN=[redacted]\n\nRun this command?\n> 1. Yes, run command\n  2. Yes, and always allow in this session\n  3. No, cancel',
  'review-pr-87:brief:1': '# review-pr-87 · 审阅 PR #87\n1. 检查并发令牌扣减原子性\n2. 核对 429 Retry-After 响应头\n3. 确认单测边界覆盖',
  'review-pr-87:out:1': '（等待测试授权放行后生成完整审查结论）',
  'feat-rate-limit:brief:1': '# feat-rate-limit 第 1 轮 · 令牌桶限流中间件\n- 新增 src/middleware/rate-limit.ts\n- 覆盖放行、突发截断与窗口恢复单测',
  'feat-rate-limit:out:1': '已完成内存版限流实现与 9 项单测（全部通过）。建议第 2 轮接入 RedisStore。',
  'feat-rate-limit:brief:2': '# feat-rate-limit 第 2 轮 · 接入 RedisStore\n- 抽象 TokenStore 接口并补充集成测试',
  'feat-rate-limit:out:2': '已完成 RedisStore 抽象与原子脚本，正在补充高并发集成测试。',
  'init-rate-limit:brief:1': '# init-rate-limit 第 1 轮 · 初始化限流配置项\n- 定义默认 QPS 与突发上限配置 Schema',
  'init-rate-limit:out:1': '已完成配置 Schema 定义并通过校验测试。'
};

function handlePreviewAction(action, target, opts){
  const snap = state.snap;
  if (!snap) return {};
  if (action === 'daemon_stop'){
    state.daemonStopped = true; state.stopReason = 'manual'; state.drawer = null;
    render(); return { running: false };
  }
  if (action === 'focus_pane'){
    return { pane_id: target, focused: true };
  }
  if (action === 'terminal_control' || action === 'respond'){
    const t = snap.tasks.find(x => x.task === target || x.pane_id === target);
    if (t && t.state === 'blocked'){
      const deny = (opts.keys || []).includes('esc') || opts.key === 'esc';
      t.state = deny ? 'idle' : 'submitted'; delete t.block;
      const r = snap.roles.find(x => x.active_task === t.task);
      if (r) r.agent_status = deny ? 'idle' : 'working';
      const p = snap.managed_panes.find(x => x.pane_id === t.pane_id);
      if (p) p.agent_status = deny ? 'idle' : 'working';
      snap.projects.forEach(pr => pr.blocked_count = snap.tasks.filter(x => x.project_id === pr.project_id && x.state === 'blocked').length);
    }
  } else if (action === 'set_perm'){
    const t = snap.tasks.find(x => x.task === target || x.pane_id === target || x.role === target);
    const p = snap.managed_panes.find(x => x.pane_id === target || x.alias === target || x.role === target);
    const r = snap.roles.find(x => x.role === target || x.pane_id === target || x.active_task === target);
    const cv = (snap.controller_views || []).find(x => x.pane_id === target);
    const ws = opts.workspace_mode;
    if (t){ t.perm = opts.perm; if (t.state === 'blocked' && (opts.perm === 'auto-workspace' || opts.perm === 'yolo')){ t.state = 'submitted'; delete t.block; } }
    if (p){ p.perm = opts.perm; if (ws) p.workspace_mode = ws; p.perm_mode = effectivePermMode(p.kind, opts.perm, p.native_perm, p.workspace_mode, p.native_workspace_mode); if (p.agent_status === 'blocked' && (opts.perm === 'auto-workspace' || opts.perm === 'yolo')) p.agent_status = 'working'; }
    if (r){ r.perm = opts.perm; if (ws) r.workspace_mode = ws; r.perm_mode = effectivePermMode(r.kind || r.default_kind, opts.perm, r.native_perm || p?.native_perm, r.workspace_mode || p?.workspace_mode, r.native_workspace_mode || p?.native_workspace_mode); if (r.agent_status === 'blocked' && (opts.perm === 'auto-workspace' || opts.perm === 'yolo')) r.agent_status = 'working'; }
    if (cv){ cv.managed = true; cv.perm = opts.perm; if (ws) cv.workspace_mode = ws; cv.perm_mode = effectivePermMode(cv.kind, opts.perm, cv.native_perm, cv.workspace_mode, cv.native_workspace_mode); }
    const holder = p || cv;
    if (opts.auto_restart && holder && holder.perm_mode !== 'native'){
      const isIdle = holder.agent_status === 'idle' || holder.agent_status === 'done';
      if (isIdle){
        const nws = opts.perm === 'auto-workspace' ? (ws || defaultWorkspaceMode(holder.kind)) : undefined;
        for (const x of [p, r, cv].filter(Boolean)){ x.native_perm = opts.perm; x.workspace_mode = nws; x.native_workspace_mode = nws; x.perm_mode = 'native'; x.pending_restart = null; }
      } else {
        const pr = { perm: opts.perm, workspace_mode: ws, allow_last: true, requested_at: Date.now() };
        for (const x of [p, r, cv].filter(Boolean)) x.pending_restart = pr;
        render(); return { ok: true, scheduled_restart: true, pending_restart: pr };
      }
    } else if (holder && holder.perm_mode === 'native'){
      for (const x of [p, r, cv].filter(Boolean)) x.pending_restart = null;
    }
  } else if (action === 'switch'){
    const p = snap.managed_panes.find(x => x.pane_id === target || x.alias === target);
    const r = snap.roles.find(x => x.pane_id === target || x.role === target);
    const cv = (snap.controller_views || []).find(x => x.pane_id === target);
    if (opts.perm && opts.restart){
      const holder = p || cv || r;
      const isIdle = !holder || holder.agent_status === 'idle' || holder.agent_status === 'done';
      const ws = opts.perm === 'auto-workspace' ? (opts.workspace_mode || defaultWorkspaceMode(holder?.kind)) : undefined;
      if (opts.auto_restart && !opts.force && !isIdle){
        const pr = { perm: opts.perm, workspace_mode: ws, allow_last: true, requested_at: Date.now() };
        for (const x of [p, r, cv].filter(Boolean)){ x.perm = opts.perm; if (ws) x.workspace_mode = ws; x.pending_restart = pr; }
        render(); return { ok: true, scheduled_restart: true, pending_restart: pr };
      }
      for (const x of [p, r, cv].filter(Boolean)){ x.perm = opts.perm; x.native_perm = opts.perm; x.workspace_mode = ws; x.native_workspace_mode = ws; x.perm_mode = 'native'; x.pending_restart = null; x.last_restart_error = null; if (opts.force && x.agent_status === 'blocked') x.agent_status = 'idle'; }
    }
  } else if (action === 'cancel_restart'){
    const p = snap.managed_panes.find(x => x.pane_id === target || x.alias === target);
    const r = snap.roles.find(x => x.pane_id === target || x.role === target);
    const cv = (snap.controller_views || []).find(x => x.pane_id === target);
    for (const x of [p, r, cv].filter(Boolean)) x.pending_restart = null;
  } else if (action === 'queue_deliver_now' || action === 'queue_consume' || action === 'queue_drop'){
    snap.queue = snap.queue.filter(q => q.event_id !== opts.event_id);
  } else if (action === 'queue_pause'){
    if (!snap.paused_recipients.includes(target)) snap.paused_recipients.push(target);
    const cv = (snap.controller_views || []).find(x => x.pane_id === target);
    if (cv) cv.paused = true;
  } else if (action === 'queue_resume'){
    snap.paused_recipients = (snap.paused_recipients || []).filter(p => p !== target);
    const cv = (snap.controller_views || []).find(x => x.pane_id === target);
    if (cv) cv.paused = false;
  } else if (action === 'cancel_retry'){
    snap.scheduled_retries = snap.scheduled_retries.filter(x => x.task !== target);
    const t = snap.tasks.find(x => x.task === target);
    if (t) t.state = 'cancelled';
  } else if (action === 'finish' || action === 'cancel'){
    const t = snap.tasks.find(x => x.task === target);
    if (t) t.state = action === 'finish' ? 'succeeded' : 'cancelled';
    const r = snap.roles.find(x => x.active_task === target);
    if (r){ r.agent_status = 'idle'; r.active_task = undefined; }
  } else if (action === 'role_unbind'){
    const r = snap.roles.find(x => x.role === target && (!opts.project || x.project_id === opts.project));
    if (r){ r.binding_mode = 'unbound'; r.pane_id = undefined; r.live = false; r.agent_status = 'unbound'; r.active_task = undefined; }
  } else if (action === 'role_remove'){
    if (opts.global) snap.global_roles = (snap.global_roles || []).filter(g => g.role !== target);
    else snap.roles = snap.roles.filter(r => !(r.role === target && (!opts.project || r.project_id === opts.project)));
  } else if (action === 'role_set'){
    if (opts.global){
      snap.global_roles = (snap.global_roles || []).filter(g => g.role !== target);
      snap.global_roles.push({ role: target, description: opts.desc || '全局角色模板', default_kind: opts.kind || 'codex', default_perm: opts.perm || 'auto-workspace', default_model: opts.model, worktree: !!opts.worktree });
    } else {
      const pid = opts.project || snap.projects[0]?.project_id || 'default';
      snap.roles = snap.roles.filter(r => !(r.role === target && r.project_id === pid));
      snap.roles.push({ project_id: pid, role: target, description: opts.desc || '项目角色', source: 'manual', binding_mode: 'unbound', kind: opts.kind || 'codex', default_kind: opts.kind || 'codex', perm: opts.perm || 'ask', model: opts.model, live: false, agent_status: 'unbound' });
    }
  } else if (action === 'role_bind'){
    const pid = opts.project || snap.projects[0]?.project_id;
    let r = snap.roles.find(x => x.role === target && (!pid || x.project_id === pid));
    if (!r){
      const tmpl = (snap.global_roles || []).find(g => g.role === target);
      if (tmpl){
        r = { project_id: pid, role: target, description: tmpl.description, source: 'manual', binding_mode: 'unbound', kind: tmpl.default_kind || 'codex', default_kind: tmpl.default_kind || 'codex', perm: tmpl.default_perm || 'ask', model: tmpl.default_model, live: false, agent_status: 'unbound' };
        snap.roles.push(r);
      }
    }
    if (r){
      r.binding_mode = opts.headless ? 'headless' : 'pane';
      r.kind = opts.kind || r.kind || 'codex';
      if (opts.model) r.model = opts.model;
      r.pane_id = opts.headless ? undefined : (opts.pane || ('w2:p' + Math.floor(6 + Math.random()*4)));
      r.live = true; r.agent_status = 'idle';
      if (opts.pane) snap.unmanaged_live_agents = snap.unmanaged_live_agents.filter(a => a.pane_id !== opts.pane);
    }
  } else if (action === 'adopt'){
    const a = snap.unmanaged_live_agents.find(x => x.pane_id === target);
    const cv = (snap.controller_views || []).find(x => x.pane_id === target);
    if (a){
      snap.unmanaged_live_agents = snap.unmanaged_live_agents.filter(x => x.pane_id !== target);
      snap.managed_panes.push({ ...a, alias: opts.name || a.display_name || a.pane_id, perm: opts.perm || 'ask', native_perm: 'unknown', perm_mode: effectivePermMode(a.kind, opts.perm || 'ask', 'unknown'), adopted: true, live: true, is_controller: Boolean(cv) });
    }
    if (cv){
      cv.managed = true;
      cv.perm = opts.perm || cv.perm || 'ask';
      cv.perm_mode = effectivePermMode(cv.kind, cv.perm, cv.native_perm);
    }
  } else if (action === 'release_pane'){
    const p = snap.managed_panes.find(x => x.pane_id === target);
    if (p && !p.role){
      snap.managed_panes = snap.managed_panes.filter(x => x.pane_id !== target);
      snap.unmanaged_live_agents.push({ pane_id: p.pane_id, display_name: p.display_name, harness_label: p.harness_label, location_label: p.location_label, kind: p.kind, agent_status: p.agent_status || 'idle', cwd: p.cwd, project_id: p.project_id });
    }
  } else if (action === 'send'){
    const pid = opts.project || snap.projects[0]?.project_id;
    let r = snap.roles.find(x => x.role === target && (!pid || x.project_id === pid));
    if (!r){
      const tmpl = (snap.global_roles || []).find(g => g.role === target);
      if (tmpl && opts.spawn){
        r = { project_id: pid, role: target, description: tmpl.description, source: 'manual', binding_mode: 'pane', pane_id: 'w2:p8', kind: tmpl.default_kind || 'codex', default_kind: tmpl.default_kind || 'codex', perm: tmpl.default_perm || 'auto-workspace', live: true, agent_status: 'working' };
        snap.roles.push(r);
      }
    }
    const id = opts.task || ('task-' + Math.floor(100 + Math.random()*800));
    const existing = snap.tasks.find(x => x.task === id);
    const nextTurn = existing ? (Number(existing.turn || 1) + 1) : 1;
    PREVIEW_FILES[id + ':brief:' + nextTurn] = opts.brief || ('# ' + id + ' 第 ' + nextTurn + ' 轮');
    PREVIEW_FILES[id + ':out:' + nextTurn] = '（执行中，尚未生成第 ' + nextTurn + ' 轮回执）';
    if (r){
      if (r.binding_mode === 'unbound'){ r.binding_mode = 'pane'; r.pane_id = 'w2:p8'; r.live = true; }
      r.agent_status = 'working'; r.active_task = id;
      if (existing){
        existing.turn = nextTurn; existing.state = 'submitted'; existing.startedAt = Date.now(); existing.note = (opts.brief || '').slice(0, 48);
      } else {
        snap.tasks.push({ task: id, turn: 1, state: 'submitted', mode: r.binding_mode === 'headless' ? 'headless' : 'interactive', kind: r.kind, perm: opts.perm || r.perm || 'ask', name: r.role, role: r.role, pane_id: r.pane_id, project_id: r.project_id, controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' }, startedAt: Date.now(), note: (opts.brief || '').slice(0, 48) });
      }
    } else {
      const a = snap.unmanaged_live_agents.find(x => x.pane_id === target);
      if (a){
        snap.unmanaged_live_agents = snap.unmanaged_live_agents.filter(x => x.pane_id !== target);
        snap.managed_panes.push({ ...a, alias: a.display_name || target, perm: opts.perm || 'ask', adopted: true, live: true, agent_status: 'working' });
      }
      if (existing){
        existing.turn = nextTurn; existing.state = 'submitted'; existing.startedAt = Date.now(); existing.note = (opts.brief || '').slice(0, 48);
      } else {
        snap.tasks.push({ task: id, turn: 1, state: 'submitted', mode: 'interactive', kind: a?.kind || 'codex', perm: opts.perm || 'ask', name: a?.display_name || target, pane_id: target, project_id: a?.project_id || pid, startedAt: Date.now(), note: (opts.brief || '').slice(0, 48) });
      }
    }
  }
  render();
  return { ok: true };
}
`;
