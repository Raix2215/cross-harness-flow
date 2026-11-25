export const VIEWS_JS = String.raw`
function renderTopbar(){
  const snap = getSnap();
  const projs = snap.projects || [];
  document.getElementById('proj-label').textContent = state.project === 'all' ? '全部项目' : projectName(state.project);

  const menu = document.getElementById('proj-menu');
  menu.style.display = state.projMenuOpen ? 'block' : 'none';
  if (state.projMenuOpen){
    menu.innerHTML = [
      '<button class="menu-item ' + (state.project==='all'?'active':'') + '" data-action="selectProject" data-id="all"><span>全部项目</span><span class="menu-meta">' + projs.length + ' 项目</span></button>',
      ...projs.map(p => '<button class="menu-item ' + (state.project===p.project_id?'active':'') + '" data-action="selectProject" data-id="' + esc(p.project_id) + '"><span>' + esc(p.name) + '</span><span class="menu-meta">' + (p.blocked_count ? p.blocked_count + ' 待授权' : p.active_tasks + ' 活跃') + '</span></button>')
    ].join('');
  }

  const isDark = document.documentElement.dataset.theme === 'dark';
  const themeBtn = document.getElementById('theme-btn');
  themeBtn.innerHTML = ic(isDark ? 'sun' : 'moon');
  themeBtn.title = isDark ? '当前深色模式（点击切为浅色并记住）' : '当前浅色模式（点击切为深色并记住）';

  const d = snap.daemon || {};
  document.body.classList.toggle('daemon-off', state.daemonStopped);
  const statusEl = document.getElementById('daemon');
  if (state.daemonStopped){
    statusEl.innerHTML = '<span class="dot-live off"></span><span class="d-txt">Daemon 已停止</span><button class="btn sm primary" data-action="reconnect">重新连接</button>';
  } else if (!state.connected && BOOT.mode === 'live'){
    statusEl.innerHTML = '<span class="dot-live warn"></span><span class="d-txt">连接中...</span><button class="btn sm ghost" data-action="reconnect">重试</button>';
  } else {
    const up = fmtUptime(d.started_at, snap.now);
    statusEl.innerHTML = '<span class="dot-live ok"></span><span class="d-txt">' + (BOOT.mode === 'preview' ? '离线预览' : 'Daemon 运行中') + '</span><span class="d-meta">pid ' + esc(d.pid || '—') + (up ? ' · ' + esc(up) : '') + '</span><button class="btn sm danger-ghost" data-action="openStopModal">' + ic('power','sm') + '停止服务</button>';
  }

  document.getElementById('offbanner').innerHTML = !state.daemonStopped ? '' :
    '<div class="off-banner">' + ic('power','lg') + '<div class="t"><b>后台 Daemon 已' + (state.stopReason === 'idle' ? '空闲自动退出' : '手动停止') + '</b><div style="font-size:13px;color:var(--text-2);margin-top:2px">已停止自动重连循环，避免在后台无故唤醒服务。需要继续使用时可点击右侧重新连接，或在终端运行任意 chflow 命令。</div></div><button class="btn primary" data-action="reconnect">重新连接</button></div>';
}

function renderFocus(){
  const snap = getSnap();
  const blocked = (snap.tasks || []).filter(t => t.state === 'blocked' && (state.project === 'all' || t.project_id === state.project));
  const deferred = (snap.queue || []).filter(q => (q.state === 'deferred_user_typing' || q.state === 'paused_by_operator') && (state.project === 'all' || (snap.tasks || []).some(t => t.task === q.task && t.project_id === state.project)));
  const total = blocked.length + deferred.length;
  const el = document.getElementById('focus');
  if (!total){ el.innerHTML = ''; return; }

  el.innerHTML = '<div class="focus"><div class="focus-head"><div class="fh-l">' + ic('alert') + '<b>需要你介入</b><span class="fh-count">' + total + ' 项</span></div><div class="fh-r"><span class="fh-hint">处理完成后自动收起</span><button class="btn sm ghost" data-action="toggleFocus">' + (state.focusCollapsed ? '展开待办' : '收起') + '</button></div></div>' +
    (state.focusCollapsed ? '' : '<div class="focus-grid">' +
      blocked.map(t => {
        const whoHtml = t.role ? (ic('role','sm role-ic') + '<b>' + esc(t.role) + '</b>') : ('<b>' + esc(paneTitle(findPaneMeta(t.pane_id || t.pane)) || t.name || t.task) + '</b>');
        return '<div class="fi"><div class="fi-icon">' + ic('shield') + '</div><div class="fi-body"><div class="fi-title">' + whoHtml + ' 等待授权 <span class="tag">' + esc(projectName(t.project_id)) + '</span></div><div class="fi-code">' + esc(t.block?.reason || t.block?.kind || 'permission_prompt') + '</div></div><div class="fi-actions"><button class="btn sm ghost" data-action="openTask" data-id="' + esc(t.task) + '">' + ic('terminal','sm') + '现场</button><button class="btn sm" data-action="denyTask" data-id="' + esc(t.task) + '">拒绝</button><button class="btn sm primary" data-action="approveTask" data-id="' + esc(t.task) + '">' + ic('check','sm') + '批准</button></div></div>';
      }).join('') +
      deferred.map(q => {
        const recPane = q.recipient?.pane ? findPaneMeta(q.recipient.pane) : null;
        const recName = recPane ? (paneLoc(recPane) || paneTitle(recPane)) : (q.recipient?.label || '');
        const qWorker = String(q.worker || q.task || '').replace(/^@/, '');
        return '<div class="fi"><div class="fi-icon">' + ic('keyboard') + '</div><div class="fi-body"><div class="fi-title"><b>' + esc(qWorker) + '</b> 回执暂缓 ' + (recName ? '<span class="loc-chip">' + esc(recName) + '</span>' : '') + '</div><div class="fi-sub">' + esc(q.note || q.status || q.state) + '</div></div><div class="fi-actions"><button class="btn sm" data-action="consumeQueue" data-id="' + esc(q.event_id) + '">' + ic('eye','sm') + '仅阅</button><button class="btn sm primary" data-action="pushQueue" data-id="' + esc(q.event_id) + '">' + ic('zap','sm') + '强推</button></div></div>';
      }).join('') +
    '</div>') + '</div>';
}

function renderToolbar(){
  const snap = getSnap();
  const qCount = (snap.queue || []).filter(q => PENDING_QUEUE.has(q.state)).length + (snap.scheduled_retries || []).filter(r => r.state === 'pending' || r.state === 'running').length;
  document.getElementById('tabs').innerHTML = [
    '<button class="tab ' + (state.tab==='work'?'active':'') + '" data-action="goTab" data-id="work">' + ic('layers') + '工作台</button>',
    '<button class="tab ' + (state.tab==='queue'?'active':'') + '" data-action="goTab" data-id="queue">' + ic('inbox') + '投递队列与重试' + (qCount ? '<span class="tab-badge warn">' + qCount + '</span>' : '') + '</button>',
    '<button class="tab ' + (state.tab==='audit'?'active':'') + '" data-action="goTab" data-id="audit">' + ic('activity') + '审计事件流</button>'
  ].join('');

  const workers = allVisibleWorkers();
  const cWorking = workers.filter(w => w.status === 'working').length;
  const cBlocked = workers.filter(w => w.status === 'blocked').length;
  const cRetry = workers.filter(w => w.status === 'retrying' || w.status === 'scheduled_retry').length;
  const cUnbound = workers.filter(w => w.status === 'unbound').length;

  document.getElementById('toolbar-right').innerHTML = state.tab !== 'work' ? '' :
    '<div class="summary-inline">' +
      '<span class="s-item"><span class="dot ok"></span>运行中 <b>' + cWorking + '</b></span>' +
      '<span class="s-item"><span class="dot warn"></span>待授权 <b>' + cBlocked + '</b></span>' +
      '<span class="s-item"><span class="dot retry"></span>重试 <b>' + cRetry + '</b></span>' +
      '<span class="s-item"><span class="dot unbound"></span>待命 <b>' + cUnbound + '</b></span>' +
    '</div>' +
    '<div class="seg" role="group">' +
      '<button class="' + (state.workMode==='dag'?'active':'') + '" data-action="setWorkMode" data-id="dag">' + ic('dag','sm') + '拓扑画布</button>' +
      '<button class="' + (state.workMode==='cards'?'active':'') + '" data-action="setWorkMode" data-id="cards">' + ic('grid','sm') + '卡片视图</button>' +
    '</div>';
}

function renderUnmanagedBox(){
  const snap = getSnap();
  const unm = (snap.unmanaged_live_agents || []).filter(a => {
    if (state.project !== 'all' && a.project_id !== state.project) return false;
    return !(snap.projects || []).some(p => (p.controllers || []).includes(a.pane_id));
  });
  if (!unm.length) return '';
  return '<div class="unmanaged-box"><div class="unm-head"><div class="unm-title">' + ic('monitor') + '外部在线会话（Herdr 实时检测）<span class="tag">' + unm.length + '</span></div><span style="font-size:13px;color:var(--text-3)">尚未接入 chflow 控制面。「接入管控」登记为临时受管工位（可派发/调权限）；「绑定角色」关联为固定项目分工</span></div><div class="unm-grid">' +
    unm.map(a => {
      const title = paneTitle(a);
      const loc = paneLoc(a);
      const st = ST[a.agent_status] || ST.idle;
      return '<div class="unm-item" title="Herdr 窗格编号: ' + esc(a.pane_id) + '">' +
        '<div class="unm-info">' +
          '<div class="unm-name"><span class="dot ' + st.c + '"></span><span>' + esc(title) + '</span><span class="pill ' + st.c + '">' + st.label + '</span></div>' +
          '<div class="unm-sub">' + (loc ? '<span class="loc-chip">' + esc(loc) + '</span>' : '') + '<span class="tag">' + esc(projectName(a.project_id)) + '</span></div>' +
        '</div>' +
        '<div style="display:flex;gap:5px;flex:none">' +
          '<button class="btn icon sm ghost" data-action="focusPane" data-pane="' + esc(a.pane_id) + '" title="在 Herdr 中定位此窗格">' + ic('locate','sm') + '</button>' +
          '<button class="btn sm" data-action="openBindPane" data-pane="' + esc(a.pane_id) + '" data-proj="' + esc(a.project_id) + '" title="绑定到 backend / reviewer 等固定项目角色（支持热替换会话）">绑定角色</button>' +
          '<button class="btn sm primary" data-action="adoptPane" data-pane="' + esc(a.pane_id) + '" data-proj="' + esc(a.project_id) + '" title="登记为当前项目受管工位：纳入权限与任务派发管理（不占用固定角色名）">接入管控</button>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div></div>';
}

function renderCardsView(){
  const projs = visibleProjects();
  const sections = projs.map(p => {
    const workers = buildProjectWorkers(p.project_id);
    const ctrls = buildProjectControllers(p, workers);
    return '<div class="proj-section">' +
      '<div class="proj-head"><div class="proj-title">' + ic('folder','lg') + '<span>' + esc(p.name) + '</span><span class="proj-meta mono">' + esc(shortPath(p.root)) + '</span></div><div style="display:flex;gap:8px"><button class="btn sm" data-action="openNewRole">' + ic('plus','sm') + '新建角色</button><button class="btn sm" data-action="openDispatch">' + ic('send','sm') + '派发任务</button></div></div>' +
      (ctrls.length ? '<div class="ctrl-row">' + ctrls.map(c => {
        const stInfo = !c.live ? { label: '已离线', c: 'danger' } : c.status === 'blocked' ? { label: '待授权', c: 'warn' } : c.paused ? { label: '已暂停', c: 'warn' } : c.typing ? { label: '输入中', c: 'warn' } : c.status === 'working' ? { label: '运行中', c: 'ok' } : { label: '就绪', c: 'ok' };
        const pm = c.managed && c.perm ? permModeMeta(c.kind, c.perm, c.nativePerm, c.permMode) : null;
        return '<div class="ctrl-card ' + (!c.live ? 'st-offline' : '') + '" data-action="openCtrl" data-id="' + esc(c.nodeId) + '">' +
          '<div class="dn-head"><div class="dn-title">' + ic('compass') + '<span>' + esc(c.name) + '</span><span class="tag">主控</span></div><span class="pill ' + stInfo.c + '"><span class="dot ' + stInfo.c + '"></span>' + stInfo.label + '</span></div>' +
          '<div class="dn-sub"><span>' + esc(harnessName(c.kind)) + '</span>' + (c.location ? '<span class="loc-chip">' + esc(c.location) + '</span>' : '') + '<span class="mono">' + esc(shortPath(c.cwd)) + '</span></div>' +
          '<div class="dn-foot" style="padding-top:6px"><span>管辖 ' + c.managedRolesCount + ' 角色 · 活跃 ' + c.activeTasksCount + (c.queuedCount ? ' · 候投 ' + c.queuedCount : '') + '</span><div style="display:flex;align-items:center;gap:4px">' +
            (pm ? '<span class="tag">' + esc(pm.short + (c.perm === 'auto-workspace' ? 'auto-ws' : c.perm)) + '</span>' : '') +
            (c.live ? '<button class="btn icon sm ghost" data-action="focusPane" data-pane="' + esc(c.paneId) + '" title="在 Herdr 中定位此窗格">' + ic('locate','sm') + '</button>' : '') +
          '</div></div></div>';
      }).join('') + '</div>' : '') +
      '<div class="role-grid">' + (workers.length ? workers.map(w => {
        const st = ST[w.status] || ST.idle;
        return '<div class="role-card ' + (w.status==='blocked'?'st-blocked':w.status==='unbound'?'st-unbound':w.status==='offline'?'st-offline':'') + '" data-action="openWorker" data-id="' + esc(w.nodeId) + '">' +
          '<div class="dn-head"><div class="dn-title">' + (w.isRole ? ic('role','role-ic') : ic('monitor','sm')) + '<span>' + esc(w.name) + '</span></div><span class="pill ' + st.c + '"><span class="dot ' + st.c + '"></span>' + st.label + '</span></div>' +
          '<div class="dn-sub">' + esc(w.desc) + '</div>' +
          (w.task ? '<div class="dn-task"><div class="dn-task-top"><span>' + esc(w.task.task) + '</span><span class="menu-meta">第 ' + esc(w.task.turn || 1) + ' 轮</span></div><div class="dn-task-note">' + esc(w.task.block?.reason || w.task.note || w.task.reason || st.label) + '</div></div>'
            : w.status === 'unbound' && w.role ? '<div style="margin-top:12px"><button class="btn sm primary" data-action="openSwap" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">' + ic('plus','sm') + '绑定或启动</button></div>' : '') +
          '<div class="dn-foot" style="margin-top:auto"><span>' + (w.bindingMode==='unbound'?'未绑定':esc(harnessName(w.kind) + (w.location ? ' · ' + w.location : ''))) + '</span><span class="tag">' + esc(w.perm === 'auto-workspace' ? 'auto-ws' : w.perm) + '</span></div>' +
        '</div>';
      }).join('') : '<div class="box" style="color:var(--text-3)">该项目尚未配置角色；可从下方外部在线会话绑定，或点击「新建角色」启用全局模板。</div>') + '</div></div>';
  }).join('');
  return (sections || '<div class="box" style="color:var(--text-3)">暂无项目数据</div>') + renderUnmanagedBox();
}

function renderQueueView(){
  const snap = getSnap();
  const pending = (snap.queue || []).filter(q => PENDING_QUEUE.has(q.state));
  const retries = (snap.scheduled_retries || []).filter(r => r.state === 'pending' || r.state === 'running');
  const paused = snap.paused_recipients || [];
  return '<h2 class="section-h">投递队列与重试</h2>' +
    '<p class="section-sub">控制回执投递与退避重试。「强推」立即注入目标窗格；「仅阅」标记为已消费不打断终端输入；「丢弃」撤销投递。</p>' +
    (paused.length ? '<div class="box warn" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><b>免打扰暂停中的收件会话：</b>' + paused.map(p => { const pm = findPaneMeta(p); return '<span class="tag">' + esc(pm ? paneTitle(pm) : p) + '</span>'; }).join(' ') + '</div><div style="display:flex;gap:6px">' + paused.map(p => '<button class="btn sm" data-action="resumeRecipient" data-pane="' + esc(p) + '">恢复投递</button>').join('') + '</div></div>' : '') +
    '<div class="q-group"><div class="q-group-title">' + ic('keyboard','sm') + '候投回执队列 · ' + pending.length + '</div>' +
    (pending.length ? pending.map(q => {
      const rp = q.recipient?.pane ? findPaneMeta(q.recipient.pane) : null;
      const toLabel = rp ? (paneTitle(rp) + (paneLoc(rp) ? ' (' + paneLoc(rp) + ')' : '')) : (q.recipient?.label || '');
      const qWorker = String(q.worker || q.task || '').replace(/^@/, '');
      return '<div class="q-card"><div class="q-left"><div class="q-icon warn">' + ic('keyboard') + '</div><div><div class="q-title">' + esc(qWorker) + ' → ' + esc(toLabel) + ' <span class="tag">' + esc(q.task) + '#' + esc(q.turn || 1) + '</span></div><div class="q-desc">' + esc(q.note || q.status || q.type) + '</div><div class="q-meta"><span>状态：' + esc(q.state) + '</span><span>入队 ' + esc(fmtClock(q.created)) + '</span></div></div></div><div class="q-right"><span class="pill warn">' + esc(q.state) + '</span><div class="q-btns"><button class="btn sm danger-ghost" data-action="dropQueue" data-id="' + esc(q.event_id) + '">' + ic('trash','sm') + '丢弃</button><button class="btn sm" data-action="consumeQueue" data-id="' + esc(q.event_id) + '">' + ic('eye','sm') + '仅阅</button><button class="btn sm primary" data-action="pushQueue" data-id="' + esc(q.event_id) + '">' + ic('zap','sm') + '强推</button></div></div></div>';
    }).join('') : '<div class="box" style="color:var(--text-3)">当前无候投回执</div>') +
    '</div>' +
    '<div class="q-group"><div class="q-group-title">' + ic('refresh','sm') + '定时重试与回退计划 · ' + retries.length + '</div>' +
    (retries.length ? retries.map(r => '<div class="q-card"><div class="q-left"><div class="q-icon retry">' + ic('clock') + '</div><div><div class="q-title">' + esc(r.task) + '</div><div class="q-desc">' + esc(r.reason || '按计划重试') + '</div><div class="q-meta"><span>预计 ' + esc(fmtEta(r.nextAt, snap.now)) + '</span><span>状态：' + esc(r.state) + '</span></div></div></div><div class="q-right"><span class="pill retry">' + esc(r.state) + '</span><div class="q-btns"><button class="btn sm danger-ghost" data-action="cancelRetry" data-id="' + esc(r.task) + '">' + ic('trash','sm') + '取消重试</button></div></div></div>').join('') : '<div class="box" style="color:var(--text-3)">当前无重试计划</div>') +
    '</div>';
}

function renderAuditView(){
  const logs = (getSnap().audit || []).slice().reverse().slice(0, 80);
  return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px"><div><h2 class="section-h">审计事件流</h2><p class="section-sub" style="margin-bottom:0">记录派发、授权放行、角色换绑、会话离线清理与 Daemon 控制事件（已脱敏）。</p></div><button class="btn sm" data-action="pruneNow">' + ic('refresh','sm') + '整理离线与已结单记录</button></div>' +
    (logs.length ? '<div class="audit-list">' + logs.map(e => {
      const cls = /block|error|fail|offline/.test(e.event || '') ? 'warn' : /retry/.test(e.event || '') ? 'retry' : /succeed|submit/.test(e.event || '') ? 'ok' : 'idle';
      return '<div class="audit-row"><span class="audit-time mono">' + esc(fmtClock(e.at)) + '</span><span class="pill ' + cls + '">' + esc(e.event) + '</span><span>' + (e.task ? '<b>' + esc(e.task) + '</b> · ' : '') + esc(e.detail || '') + '</span></div>';
    }).join('') + '</div>' : '<div class="box" style="color:var(--text-3)">暂无审计记录</div>');
}

function findWorkerByNodeId(nodeId){
  return allVisibleWorkers().find(w => w.nodeId === nodeId) || (getSnap().projects || []).flatMap(p => buildProjectWorkers(p.project_id)).find(w => w.nodeId === nodeId);
}
function findCtrlByNodeId(nodeId){
  for (const p of (getSnap().projects || [])){
    const c = buildProjectControllers(p, buildProjectWorkers(p.project_id)).find(x => x.nodeId === nodeId);
    if (c) return c;
  }
  return null;
}

function renderPermPanel(opts){
  const { kind, perm, nativePerm, workspaceMode, nativeWorkspaceMode, permMode, target, paneId, isIdle, managed, adoptFirst, isHeadless, pendingRestart, restarting, lastRestartError, hasActiveTask } = opts;
  const activePerm = perm || 'ask';
  const nat = isHeadless ? activePerm : (nativePerm || 'unknown');
  const wsMode = workspaceMode || defaultWorkspaceMode(kind);
  const natWs = isHeadless ? wsMode : nativeWorkspaceMode;
  const pm = isHeadless
    ? { mode: 'native', label: '下轮原生生效', cls: 'ok', short: '', note: '无头执行器每次派发都会以当前目标权限原生启动，无需手动重启。', needsRestart: false }
    : permModeMeta(kind, activePerm, nat, permMode, wsMode, natWs);
  const permInfo = PERMS.find(p => p.id === activePerm) || PERMS[1];
  const natLabel = isHeadless ? '每轮原生启动' : (nat === 'unknown' ? '未知（外部启动）' : (nat === 'auto-workspace' && natWs ? nat + ' · ' + natWs : nat));
  const curLabel = !managed ? '未接入管控' : (activePerm === 'auto-workspace' && wsMode ? activePerm + ' · ' + wsMode : activePerm);
  const wsOpts = workspaceModeOptions(kind);
  const showWsBase = Boolean(managed && activePerm === 'auto-workspace' && wsOpts.length > 1);
  const showRestart = Boolean(!isHeadless && paneId && managed && (pm.needsRestart || pendingRestart || restarting));
  const pendingLabel = pendingRestart ? (pendingRestart.perm + (pendingRestart.perm === 'auto-workspace' && pendingRestart.workspace_mode ? ' · ' + pendingRestart.workspace_mode : '')) : '';

  let restartHtml = '';
  if (showRestart){
    if (restarting){
      restartHtml = '<div class="perm-restart-bar"><span>正在安全重启会话并保留上下文（支持分级退出与失败自动回退）...</span><div class="perm-restart-actions"><button class="btn sm" disabled>' + ic('refresh','sm') + '重启中...</button></div></div>';
    } else if (pendingRestart){
      restartHtml = '<div class="perm-restart-bar warn"><span>已预约空闲后自动重启 → <b class="mono">' + esc(pendingLabel) + '</b>（窗格一进入空闲即自动执行，失败自动回退）。</span><div class="perm-restart-actions">' +
        '<button class="btn sm" data-action="cancelRestart" data-pane="' + esc(paneId) + '">取消预约</button>' +
        '<button class="btn sm danger-ghost" data-action="forceRestartApplyPerm" data-pane="' + esc(paneId) + '" data-perm="' + esc(pendingRestart.perm || activePerm) + '" data-kind="' + esc(kind) + '" data-ws-mode="' + esc(pendingRestart.workspace_mode || wsMode) + '"' + (hasActiveTask ? ' disabled title="该工位存在进行中任务，请先结单/取消或等待空闲后自动重启"' : '') + '>强制中断立即重启</button>' +
      '</div></div>';
    } else if (isIdle){
      restartHtml = '<div class="perm-restart-bar ' + (pm.mode==='restart_required'?'warn':'') + '"><span>会话当前空闲，可保留上下文安全重启并安装原生权限（支持分级退出与失败自动回退）。</span><div class="perm-restart-actions">' +
        '<button class="btn sm ' + (pm.mode==='restart_required'?'warn':'primary') + '" data-action="restartApplyPerm" data-pane="' + esc(paneId) + '" data-perm="' + esc(activePerm) + '" data-kind="' + esc(kind) + '" data-ws-mode="' + esc(wsMode) + '">' + ic('refresh','sm') + '保留上下文重启</button>' +
        '<button class="btn sm ghost" data-action="forceRestartApplyPerm" data-pane="' + esc(paneId) + '" data-perm="' + esc(activePerm) + '" data-kind="' + esc(kind) + '" data-ws-mode="' + esc(wsMode) + '" title="若优雅退出卡住，可强制中断进程后重启">强制重启</button>' +
      '</div></div>';
    } else {
      restartHtml = '<div class="perm-restart-bar ' + (pm.mode==='restart_required'?'warn':'') + '"><span>会话当前忙碌/阻塞，可预约空闲后自动重启，或强制中断当前回合并立即重启。</span><div class="perm-restart-actions">' +
        '<button class="btn sm ' + (pm.mode==='restart_required'?'warn':'primary') + '" data-action="scheduleAutoRestart" data-pane="' + esc(paneId) + '" data-perm="' + esc(activePerm) + '" data-kind="' + esc(kind) + '" data-ws-mode="' + esc(wsMode) + '">' + ic('clock','sm') + '空闲后自动重启</button>' +
        '<button class="btn sm danger-ghost" data-action="forceRestartApplyPerm" data-pane="' + esc(paneId) + '" data-perm="' + esc(activePerm) + '" data-kind="' + esc(kind) + '" data-ws-mode="' + esc(wsMode) + '"' + (hasActiveTask ? ' disabled title="该工位存在进行中任务，请先结单/取消或等待空闲后自动重启"' : '') + '>强制中断并重启</button>' +
      '</div></div>';
    }
  }

  return '<div class="box">' +
    '<div class="box-h"><span>权限策略</span><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
      (!isHeadless && paneId ? '<button class="perm-auto-toggle ' + (state.autoRestartPerm?'on':'') + '" data-action="toggleAutoRestartPerm" title="开启后，切换需要原生重启的权限档位时将自动重启（忙碌时自动预约空闲重启）">' + ic('refresh','sm') + '切权限自动重启：' + (state.autoRestartPerm?'开':'关') + '</button>' : '') +
      '<span class="pill ' + pm.cls + '">' + esc(pm.label) + '</span>' +
    '</div></div>' +
    '<div class="perm-meta-row"><span>原生启动权限：<b class="mono">' + esc(natLabel) + '</b></span><span>当前目标：<b class="mono">' + esc(curLabel) + '</b></span></div>' +
    '<div class="perm-grid">' +
      PERMS.map(p => '<button class="perm-btn ' + (managed && activePerm===p.id?'active':'') + '" data-action="setPerm" data-target="' + esc(target) + '" data-pane="' + esc(paneId || '') + '" data-perm="' + p.id + '" data-kind="' + esc(kind) + '" data-native="' + esc(nat) + '" data-cur-ws="' + esc(wsMode) + '" data-native-ws="' + esc(natWs || '') + '"' + (adoptFirst ? ' data-adopt-first="1"' : '') + (isHeadless ? ' data-headless="1"' : '') + '><span>' + p.zh + '</span><span class="perm-flag">' + esc(nativeFlagHint(kind, p.id, wsMode)) + '</span></button>').join('') +
    '</div>' +
    (showWsBase ? '<div class="ws-base-row"><span>工作区原生底座：</span><div class="ws-base-opts">' +
      wsOpts.map(o => '<button class="ws-base-btn ' + (wsMode===o.id?'active':'') + '" data-action="setWorkspaceMode" data-target="' + esc(target) + '" data-pane="' + esc(paneId || '') + '" data-ws-mode="' + o.id + '" data-kind="' + esc(kind) + '" data-native="' + esc(nat) + '" data-native-ws="' + esc(natWs || '') + '"' + (isHeadless ? ' data-headless="1"' : '') + '>' + esc(o.label) + '</button>').join('') +
    '</div></div>' : '') +
    '<div style="font-size:13px;color:var(--text-2);margin-top:4px">' + esc(pm.note) + '</div>' +
    '<div style="font-size:12.5px;color:var(--text-3);margin-top:3px">' + esc(permInfo.desc) + '</div>' +
    (lastRestartError ? '<div class="perm-restart-err">上次重启异常（原会话已保留或自动回退）：' + esc(lastRestartError) + '</div>' : '') +
    restartHtml +
  '</div>';
}

function renderDrawer(){
  const scrim = document.getElementById('scrim'), drawer = document.getElementById('drawer');
  if (!state.drawer){ scrim.classList.remove('open'); drawer.classList.remove('open'); return; }
  const activeEl = document.activeElement;
  if (activeEl && drawer.contains(activeEl) && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

  scrim.classList.add('open'); drawer.classList.add('open');

  if (state.drawer.kind === 'ctrl'){
    const c = findCtrlByNodeId(state.drawer.nodeId);
    if (!c){ state.drawer = null; return renderDrawer(); }
    const tab = state.drawer.tab || 'overview';
    const managedEntry = (getSnap().managed_panes || []).find(p => p.pane_id === c.paneId && !p.role);
    const hasCtrlWorkerTask = Boolean(managedEntry && taskForPane(managedEntry));
    const subWorkers = buildProjectWorkers(c.projectId).filter(w => w.controllerPane === c.paneId);
    const stInfo = !c.live ? { label: '已离线', c: 'danger' } : c.status === 'blocked' ? { label: '待授权', c: 'warn' } : c.paused ? { label: '已暂停投递', c: 'warn' } : c.typing ? { label: '正在输入', c: 'warn' } : c.status === 'working' ? { label: '运行中', c: 'ok' } : { label: '投递就绪', c: 'ok' };
    const isCtrlIdle = c.live && (c.status === 'idle' || c.status === 'done');

    let ctrlBody = '';
    if (tab === 'overview'){
      ctrlBody = '<div class="ctrl-kpi-grid">' +
        '<div class="ctrl-kpi"><b>' + c.managedRolesCount + '</b><span>管辖角色</span></div>' +
        '<div class="ctrl-kpi"><b>' + c.activeTasksCount + '</b><span>活跃任务</span></div>' +
        '<div class="ctrl-kpi"><b style="' + (c.blockedTasksCount?'color:var(--warn)':'') + '">' + c.blockedTasksCount + '</b><span>待授权</span></div>' +
        '<div class="ctrl-kpi"><b style="' + (c.queuedCount?'color:var(--accent)':'') + '">' + c.queuedCount + '</b><span>候投回执</span></div>' +
      '</div>' +
      '<div class="box"><div class="box-h"><span>会话与位置信息</span>' + (c.live ? '<button class="btn sm" data-action="focusPane" data-pane="' + esc(c.paneId) + '">' + ic('locate','sm') + '跳转 Herdr 窗格</button>' : '') + '</div>' +
        '<div style="font-size:13.5px;color:var(--text-2);display:grid;gap:6px">' +
          '<div>Harness / 模型：<b>' + esc(harnessName(c.kind)) + (c.model ? ' · ' + esc(c.model) : '') + '</b></div>' +
          '<div>Herdr 位置：<b>' + esc(c.location || '未命名工作区') + '</b></div>' +
          '<div>工作目录：<span class="mono" style="font-size:12.5px">' + esc(shortPath(c.cwd) || '—') + '</span></div>' +
          '<div style="margin-top:4px"><button class="tech-id" data-action="copyText" data-text="' + esc(c.paneId) + '">' + ic('copy','sm') + 'Herdr ID: ' + esc(c.paneId) + '</button></div>' +
        '</div></div>' +
      '<div class="box"><div class="box-h"><span>回执免打扰与队列控制</span>' + (c.queuedCount ? '<span class="pill warn">' + c.queuedCount + ' 条候投</span>' : '<span class="pill ok">通道畅通</span>') + '</div><p style="margin:0 0 12px;color:var(--text-2);font-size:13.5px">' + (!c.live ? '该主控窗格已退出，但仍有挂起回执或活跃任务关联。可在终端使用 handoff 移交控制权。' : '聚焦输入时自动扫描底部 16 行输入框防打扰；开启暂停后，所有回执将只暂存队列不注入终端。') + '</p><div style="display:flex;gap:8px;flex-wrap:wrap">' +
        (c.paused ? '<button class="btn sm primary" data-action="resumeRecipient" data-pane="' + esc(c.paneId) + '">恢复自动投递</button>' : '<button class="btn sm" data-action="pauseRecipient" data-pane="' + esc(c.paneId) + '">开启免打扰暂停</button>') +
        '<button class="btn sm" data-action="flushPane" data-pane="' + esc(c.paneId) + '">Flush 消费队列</button>' +
        (managedEntry && !hasCtrlWorkerTask ? '<button class="btn sm danger-ghost" data-action="releasePane" data-pane="' + esc(c.paneId) + '" title="移出受管工位登记，保留主控身份且不关闭终端">移出受管登记</button>' : '') +
      '</div></div>' +
      (c.live ? renderPermPanel({ kind: c.kind, perm: c.perm || 'ask', nativePerm: c.nativePerm || 'unknown', workspaceMode: c.workspaceMode, nativeWorkspaceMode: c.nativeWorkspaceMode, permMode: c.permMode, target: c.paneId, paneId: c.paneId, isIdle: isCtrlIdle, managed: c.managed, adoptFirst: !c.managed, pendingRestart: c.pendingRestart, restarting: c.restarting, lastRestartError: c.lastRestartError, hasActiveTask: hasCtrlWorkerTask }) : '');
    } else if (tab === 'managed'){
      ctrlBody = subWorkers.length ? subWorkers.map(w => {
        const wst = ST[w.status] || ST.idle;
        return '<div class="sub-worker-row" data-action="openWorker" data-id="' + esc(w.nodeId) + '">' +
          '<div style="min-width:0;flex:1"><div style="font-weight:600;display:flex;align-items:center;gap:7px">' + (w.isRole ? ic('role','sm role-ic') : ic('monitor','sm')) + '<span>' + esc(w.name) + '</span><span class="tag">' + esc(harnessName(w.kind)) + '</span></div>' +
          '<div style="font-size:12.5px;color:var(--text-3);margin-top:2px">' + esc(w.task ? (w.task.task + ' · 第 ' + (w.task.turn || 1) + ' 轮') : w.desc) + '</div></div>' +
          '<span class="pill ' + wst.c + '"><span class="dot ' + wst.c + '"></span>' + wst.label + '</span></div>';
      }).join('') : '<div class="box" style="color:var(--text-3)">该主控当前暂无下辖的角色或活跃工位。</div>';
    } else {
      const taskIds = new Set(subWorkers.map(w => w.task?.task).filter(Boolean));
      const logs = (getSnap().audit || []).filter(e => (e.detail && String(e.detail).includes(c.paneId)) || (e.task && taskIds.has(e.task))).slice().reverse().slice(0, 25);
      ctrlBody = logs.length ? '<div class="audit-list">' + logs.map(e => '<div class="audit-row"><span class="audit-time mono">' + esc(fmtClock(e.at)) + '</span><span class="pill idle">' + esc(e.event) + '</span><span>' + (e.task ? '<b>' + esc(e.task) + '</b> · ' : '') + esc(e.detail || '') + '</span></div>').join('') + '</div>'
        : '<div class="box" style="color:var(--text-3)">暂无与该主控相关的审计记录。</div>';
    }

    drawer.innerHTML = '<div class="dr-head"><div class="dr-top"><div><div class="dr-crumb">' + ic('folder','sm') + esc(projectName(c.projectId)) + ' · 主控会话' + (c.location ? '<span class="loc-chip">' + esc(c.location) + '</span>' : '') + '</div><div class="dr-name">' + esc(c.name) + ' <span class="pill ' + stInfo.c + '"><span class="dot ' + stInfo.c + '"></span>' + stInfo.label + '</span></div><div class="dr-desc">' + esc(harnessName(c.kind)) + ' · 管辖 ' + c.managedRolesCount + ' 角色 / ' + c.activeTasksCount + ' 活跃任务</div></div><button class="btn icon ghost" data-action="closeDrawer" aria-label="关闭">' + ic('x') + '</button></div>' +
      '<div class="dr-tabs"><button class="' + (tab==='overview'?'active':'') + '" data-action="drawerTab" data-tab="overview">概览</button><button class="' + (tab==='managed'?'active':'') + '" data-action="drawerTab" data-tab="managed">下辖工位 (' + subWorkers.length + ')</button><button class="' + (tab==='activity'?'active':'') + '" data-action="drawerTab" data-tab="activity">活动记录</button></div></div>' +
      '<div class="dr-body">' + ctrlBody + '</div>';
    return;
  }

  const w = findWorkerByNodeId(state.drawer.nodeId);
  if (!w){ state.drawer = null; return renderDrawer(); }
  const st = ST[w.status] || ST.idle;
  const tab = state.drawer.tab || 'overview';
  const task = w.task;
  const workerTasks = tasksForWorker(w);
  const latestTask = task || workerTasks[0];
  const targetForPerm = task?.task || w.paneId || w.rawRole || w.name;
  const permInfo = PERMS.find(p => p.id === w.perm) || PERMS[1];

  let bodyHtml = '';
  if (tab === 'overview'){
    if (w.status === 'blocked' && task){
      const diagKey = task.task + ':diag';
      if (state.fileCache[diagKey] === undefined) void loadTaskFile(task.task, 'diag', task.turn || 1);
      const diagText = state.fileCache[diagKey] || '正在加载脱敏终端诊断...';
      bodyHtml += '<div class="box warn"><div class="box-h"><span style="display:flex;align-items:center;gap:7px;color:var(--warn)">' + ic('alert') + '等待你的授权</span><span class="tag">' + esc(task.block?.kind || 'blocked') + '</span></div>' +
        '<div class="mono" style="font-size:13px">' + esc(task.block?.reason || '') + '</div>' +
        '<div class="term">' + esc(diagText) + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn primary" data-action="approveTask" data-id="' + esc(task.task) + '">' + ic('check','sm') + '批准一次 (Enter)</button>' +
          '<button class="btn" data-action="setPerm" data-target="' + esc(targetForPerm) + '" data-perm="auto-workspace">升为工作区自动并放行</button>' +
          '<button class="btn danger-ghost" data-action="denyTask" data-id="' + esc(task.task) + '">' + ic('x','sm') + '拒绝 (Esc)</button>' +
        '</div>' +
        (w.paneId ? '<div class="keybar"><span style="font-size:12.5px;color:var(--text-3);margin-right:4px">直控按键:</span>' +
          [['Enter','enter'],['Esc','esc'],['↑','up'],['↓','down'],['Tab','tab'],['Ctrl+C','ctrl+c']].map(([lbl,k]) => '<button class="keybtn" data-action="sendKey" data-target="' + esc(task.task) + '" data-key="' + k + '">' + lbl + '</button>').join('') +
        '</div><div class="term-input-row"><input id="term-text-input" placeholder="向终端发送文本并回车..."><button class="btn sm primary" data-action="sendTermText" data-target="' + esc(task.task) + '">发送</button></div>' : '') +
      '</div>';
    }

    bodyHtml += '<div class="box"><div class="box-h"><span>会话绑定与热替换</span><div style="display:flex;gap:6px">' +
      (w.paneId && w.status !== 'offline' ? '<button class="btn sm" data-action="focusPane" data-pane="' + esc(w.paneId) + '">' + ic('locate','sm') + '跳转终端</button>' : '') +
      (w.role ? '<button class="btn sm primary" data-action="openSwap" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">' + ic('swap','sm') + '热替换会话</button>' : '') +
      '</div></div><div style="font-size:14px;color:var(--text-2);display:grid;gap:6px">' +
      '<div>执行位置：<b>' + (w.bindingMode==='unbound'?'未绑定（待命）':w.bindingMode==='headless'?'无头执行器':esc(w.location || 'Herdr 交互窗格')) + '</b></div>' +
      '<div>Harness / 模型：<b>' + esc(harnessName(w.kind)) + (w.model ? ' · ' + esc(w.model) : '') + '</b></div>' +
      (w.paneId ? '<div style="margin-top:4px"><button class="tech-id" data-action="copyText" data-text="' + esc(w.paneId) + '">' + ic('copy','sm') + 'Herdr ID: ' + esc(w.paneId) + '</button></div>' : '') +
    '</div></div>';

    if (w.bindingMode !== 'unbound'){
      const isWorkerIdle = w.bindingMode === 'pane' && (w.status === 'idle' || w.status === 'done');
      bodyHtml += renderPermPanel({
        kind: w.kind, perm: w.perm, nativePerm: w.nativePerm, workspaceMode: w.workspaceMode, nativeWorkspaceMode: w.nativeWorkspaceMode, permMode: w.permMode,
        target: targetForPerm, paneId: w.bindingMode === 'pane' ? w.paneId : '',
        isIdle: isWorkerIdle, managed: true, adoptFirst: false, isHeadless: w.bindingMode === 'headless',
        pendingRestart: w.pendingRestart, restarting: w.restarting, lastRestartError: w.lastRestartError, hasActiveTask: Boolean(task)
      });
    }

    bodyHtml += '<div class="box"><div class="box-h"><span>' + (task ? '当前任务 · ' + esc(task.task) : latestTask ? '最近任务 · ' + esc(latestTask.task) : '角色与工位操作') + '</span>' + (latestTask ? '<button class="btn sm ghost" data-action="drawerTab" data-tab="mail">打开信箱 →</button>' : '') + '</div>' +
      (task ? '<div style="font-size:13.5px;color:var(--text-2);margin-bottom:10px">状态：<b>' + esc(task.state) + '</b> · 第 ' + esc(task.turn || 1) + ' 轮' + (task.note ? ' · ' + esc(task.note) : '') + '</div>'
        : latestTask ? '<div style="font-size:13.5px;color:var(--text-2);margin-bottom:10px">最近状态：<b>' + esc(latestTask.state) + '</b> · 共 ' + esc(latestTask.turn || 1) + ' 轮' + (workerTasks.length > 1 ? '（共 ' + workerTasks.length + ' 条任务记录）' : '') + '</div>'
        : '<div style="font-size:13.5px;color:var(--text-3);margin-bottom:10px">当前无活跃任务，可直接派发新任务。</div>') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        (!task && latestTask ? '<button class="btn sm primary" data-action="openDispatch" data-target="' + esc(w.role ? w.role.role : (w.paneId || '')) + '" data-proj="' + esc(w.projectId) + '" data-task="' + esc(latestTask.task) + '">' + ic('send','sm') + '续写第 ' + (Number(latestTask.turn || 1) + 1) + ' 轮</button>' : '') +
        '<button class="btn sm ' + (!task && latestTask ? '' : 'primary') + '" data-action="openDispatch" data-target="' + esc(w.role ? w.role.role : (w.paneId || '')) + '" data-proj="' + esc(w.projectId) + '">' + ic('send','sm') + (task ? '派发新任务' : '派发任务') + '</button>' +
        (task ? '<button class="btn sm" data-action="finishTask" data-id="' + esc(task.task) + '">' + ic('check','sm') + '验收结单</button><button class="btn sm danger-ghost" data-action="cancelTask" data-id="' + esc(task.task) + '">取消任务</button>' : '') +
        (!w.role && w.paneId ? '<button class="btn sm" data-action="openBindPane" data-pane="' + esc(w.paneId) + '" data-proj="' + esc(w.projectId) + '">绑定为角色</button>' : '') +
        (!w.role && w.paneId && !task ? '<button class="btn sm danger-ghost" data-action="releasePane" data-pane="' + esc(w.paneId) + '" title="仅移出 chflow 受管列表，不关闭 Herdr 终端窗格">移出管控</button>' : '') +
        (w.role && w.bindingMode !== 'unbound' ? '<button class="btn sm danger-ghost" data-action="unbindRole" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">解绑会话</button>' : '') +
        (w.role && w.role.source !== 'config' ? '<button class="btn sm danger-ghost" data-action="removeRole" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">移除角色</button>' : '') +
      '</div></div>';
  } else if (tab === 'mail'){
    const mailTask = workerTasks.find(t => t.task === state.drawer.taskId) || task || workerTasks[0];
    if (!mailTask){
      bodyHtml = '<div class="box" style="color:var(--text-3)">当前无关联任务信箱。</div>';
    } else {
      const maxTurn = Math.max(1, Number(mailTask.turn || 1));
      const curTurn = Math.min(maxTurn, Math.max(1, Number(state.drawer.turn || maxTurn)));
      const bKey = mailTask.task + ':brief:' + curTurn, oKey = mailTask.task + ':out:' + curTurn;
      if (state.fileCache[bKey] === undefined) void loadTaskFile(mailTask.task, 'brief', curTurn);
      if (state.fileCache[oKey] === undefined) void loadTaskFile(mailTask.task, 'out', curTurn);
      let btns = '';
      for (let i = 1; i <= maxTurn; i++) btns += '<button class="btn sm ' + (i===curTurn?'primary':'') + '" data-action="drawerTurn" data-task="' + esc(mailTask.task) + '" data-turn="' + i + '">第 ' + i + ' 轮</button>';
      const taskSel = workerTasks.length > 1
        ? '<select id="mail-task-select" class="mail-select">' + workerTasks.map(t => '<option value="' + esc(t.task) + '"' + (t.task===mailTask.task?' selected':'') + '>' + esc(t.task + ' · ' + t.state + ' (共 ' + (t.turn || 1) + ' 轮)') + '</option>').join('') + '</select>'
        : '<span class="tag mono">' + esc(mailTask.task) + ' · ' + esc(mailTask.state) + '</span>';
      bodyHtml = '<div class="mail-bar">' + taskSel + '<button class="btn sm ghost" data-action="refreshMail" data-task="' + esc(mailTask.task) + '" data-turn="' + curTurn + '">' + ic('refresh','sm') + '刷新信箱</button></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' + btns + '</div>' +
        '<div class="box"><div class="box-h"><span>任务书（' + esc(mailTask.task) + ' · t' + curTurn + '-brief.md）</span></div><div class="mail-pre">' + esc(state.fileCache[bKey] ?? '正在加载...') + '</div></div>' +
        '<div class="box"><div class="box-h"><span>交付回执（' + esc(mailTask.task) + ' · t' + curTurn + '-reply.md）</span></div><div class="mail-pre">' + esc(state.fileCache[oKey] ?? '正在加载...') + '</div></div>';
    }
  } else {
    const taskIds = new Set(workerTasks.map(t => t.task));
    const logs = (getSnap().audit || []).filter(e => !taskIds.size || (e.task && taskIds.has(e.task))).slice().reverse().slice(0, 20);
    bodyHtml = logs.length ? '<div class="audit-list">' + logs.map(e => '<div class="audit-row"><span class="audit-time mono">' + esc(fmtClock(e.at)) + '</span><span class="pill idle">' + esc(e.event) + '</span><span>' + (e.task ? '<b>' + esc(e.task) + '</b> · ' : '') + esc(e.detail || '') + '</span></div>').join('') + '</div>'
      : '<div class="box" style="color:var(--text-3)">暂无相关审计事件。</div>';
  }

  drawer.innerHTML = '<div class="dr-head"><div class="dr-top"><div>' +
    '<div class="dr-crumb">' + ic('folder','sm') + esc(projectName(w.projectId)) + ' · ' + (w.role ? '项目角色' : '受管工位') + (w.location ? '<span class="loc-chip">' + esc(w.location) + '</span>' : '') + '</div>' +
    '<div class="dr-name">' + (w.isRole ? ic('role','role-ic') : ic('monitor','sm')) + '<span>' + esc(w.name) + '</span> <span class="pill ' + st.c + '"><span class="dot ' + st.c + '"></span>' + st.label + '</span></div>' +
    '<div class="dr-desc">' + esc(w.desc) + '</div>' +
    '</div><button class="btn icon ghost" data-action="closeDrawer" aria-label="关闭">' + ic('x') + '</button></div>' +
    '<div class="dr-tabs"><button class="' + (tab==='overview'?'active':'') + '" data-action="drawerTab" data-tab="overview">概览</button><button class="' + (tab==='mail'?'active':'') + '" data-action="drawerTab" data-tab="mail">任务信箱' + (workerTasks.length ? ' (' + workerTasks.length + ')' : '') + '</button><button class="' + (tab==='activity'?'active':'') + '" data-action="drawerTab" data-tab="activity">活动记录</button></div></div>' +
    '<div class="dr-body">' + bodyHtml + '</div>';
}

function openModal(title, bodyHtml, footerHtml){
  document.getElementById('modal-root').innerHTML =
    '<div class="modal-back" data-backdrop="modal">' +
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal-h"><span>' + title + '</span><button class="btn icon ghost" data-action="closeModal" aria-label="关闭">' + ic('x') + '</button></div>' +
        '<div class="modal-b">' + bodyHtml + '</div>' +
        '<div class="modal-f">' + footerHtml + '</div>' +
      '</div>' +
    '</div>';
}
function closeModal(){ document.getElementById('modal-root').innerHTML = ''; }

function openForceRestartModal(paneId, permVal, kind, wsMode){
  const targetLabel = permVal + (permVal === 'auto-workspace' && wsMode ? ' · ' + wsMode : '');
  openModal('强制中断并重启会话',
    '<div class="box warn" style="margin-bottom:14px"><b>将中断目标窗格当前回合，并通过分级退出（Esc / Ctrl+C / ' + (kind === 'pi' ? '/quit' : '/exit') + ' / Ctrl+D）返回 Shell 后以原生参数重启。</b><div style="font-size:13px;color:var(--text-2);margin-top:4px">若新权限启动失败，系统会自动回退并拉回原权限与原对话上下文。</div></div>' +
    '<div style="font-size:13.5px;color:var(--text-2);display:grid;gap:6px"><div>目标窗格：<b class="mono">' + esc(paneId) + '</b>（' + esc(harnessName(kind)) + '）</div><div>目标原生权限：<b class="mono">' + esc(targetLabel) + '</b></div></div>',
    '<button class="btn" data-action="closeModal">取消</button><button class="btn danger" data-action="confirmForceRestart" data-pane="' + esc(paneId) + '" data-perm="' + esc(permVal) + '" data-kind="' + esc(kind) + '" data-ws-mode="' + esc(wsMode || '') + '">' + ic('refresh','sm') + '确认强制中断并重启</button>'
  );
}

function openStopModal(){
  const activeCount = (getSnap().tasks || []).filter(t => !TERMINAL_STATES.has(t.state)).length;
  openModal('停止后台 Daemon 服务',
    (activeCount ? '<div class="box warn" style="margin-bottom:14px"><b>注意：当前仍有 ' + activeCount + ' 个活跃任务。</b><div style="font-size:13px;color:var(--text-2);margin-top:4px">停止 Daemon 不会关闭 Herdr 终端窗格，但会中止回执队列投递与本控制台监听。</div></div>' : '<p style="margin:0 0 10px">当前无活跃任务，可以安全停止后台 Daemon。</p>') +
    '<p style="margin:0;font-size:13.5px;color:var(--text-3)">停止后页面将断开连接且不再自动重连；CLI 中也可随时使用 <code>chflow stop</code> 或 <code>chflow quit</code>。</p>',
    '<button class="btn" data-action="closeModal">取消</button><button class="btn danger" data-action="confirmStopDaemon" data-force="' + (activeCount ? '1' : '0') + '">' + ic('power','sm') + (activeCount ? '强制停止服务' : '确认停止服务') + '</button>'
  );
}

function syncSwapModalFields(){
  const mode = document.getElementById('sw-mode')?.value || 'spawn';
  const paneField = document.getElementById('sw-pane-field');
  const kindSel = document.getElementById('sw-kind');
  const closeOldRow = document.getElementById('sw-close-old-row');
  if (paneField) paneField.style.display = mode === 'pane' ? 'block' : 'none';
  if (closeOldRow) closeOldRow.style.display = mode === 'spawn' || mode === 'pane' ? 'flex' : 'none';
  if (kindSel){
    const agyOpt = kindSel.querySelector('option[value="agy"]');
    if (agyOpt) agyOpt.disabled = mode === 'headless';
    if (mode === 'headless' && kindSel.value === 'agy') kindSel.value = 'codex';
  }
}

function openSwapModal(role, projectId){
  const r = (getSnap().roles || []).find(x => x.role === role && x.project_id === projectId);
  const unm = getSnap().unmanaged_live_agents || [];
  openModal('热替换角色会话 · ' + esc(role),
    '<div class="field"><label>绑定方式</label><select id="sw-mode"><option value="spawn">新开 Herdr 交互窗格并绑定</option><option value="headless">切换至无头执行器 (Headless)</option>' + (unm.length ? '<option value="pane">绑定已有在线会话</option>' : '') + '</select></div>' +
    (unm.length ? '<div class="field" id="sw-pane-field" style="display:none"><label>选择在线会话</label><select id="sw-pane">' + unm.map(a => '<option value="' + esc(a.pane_id) + '">' + esc(paneTitle(a) + (paneLoc(a) ? ' (' + paneLoc(a) + ')' : '')) + '</option>').join('') + '</select></div>' : '') +
    '<div class="field-row"><div class="field"><label>目标 Harness</label><select id="sw-kind">' + ['codex','claude','pi','agy'].map(k => '<option value="' + k + '" ' + ((r?.kind||r?.default_kind)===k?'selected':'') + '>' + harnessName(k) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>模型（可选）</label><input id="sw-model" value="' + esc(r?.model || r?.default_model || '') + '" placeholder="留空沿用默认"></div></div>' +
    '<label class="check-row" id="sw-close-old-row"><input type="checkbox" id="sw-close-old" checked> 替换完成后关闭旧的空闲窗格</label>',
    '<button class="btn" data-action="closeModal">取消</button><button class="btn primary" data-action="confirmSwap" data-role="' + esc(role) + '" data-proj="' + esc(projectId) + '">' + ic('swap','sm') + '确认热替换</button>'
  );
  const swMode = document.getElementById('sw-mode');
  if (swMode){ swMode.addEventListener('change', syncSwapModalFields); syncSwapModalFields(); }
}

function openNewRoleModal(){
  const snap = getSnap();
  const projs = snap.projects || [];
  const globals = snap.global_roles || [];
  const defProj = state.project !== 'all' ? state.project : (projs[0]?.project_id || '');
  const tmplHtml = globals.length ? '<div class="tmpl-strip"><span style="font-size:12.5px;color:var(--text-3);display:inline-flex;align-items:center;gap:5px">' + ic('globe','sm') + '全局模板（点击填充）:</span>' +
    globals.map(g => '<button type="button" class="tmpl-chip" data-action="fillGlobalTemplate" data-role="' + esc(g.role) + '">' + ic('role','sm role-ic') + esc(g.role) + ' <span style="color:var(--text-3)">' + esc(harnessName(g.default_kind || 'codex')) + '</span></button>').join('') + '</div>' : '';

  openModal('新建角色 / 全局角色模板',
    tmplHtml +
    '<div class="field" id="nr-proj-field"><label>所属项目</label><select id="nr-proj">' + (projs.length ? projs.map(p => '<option value="' + esc(p.project_id) + '" ' + (p.project_id===defProj?'selected':'') + '>' + esc(p.name) + '</option>').join('') : '<option value="">当前默认项目</option>') + '</select></div>' +
    '<div class="field-row"><div class="field"><label>角色名（小写字母/数字/-）</label><input id="nr-name" placeholder="implementer"></div><div class="field"><label>默认 Harness</label><select id="nr-kind"><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="pi">Pi</option><option value="agy">Antigravity</option></select></div></div>' +
    '<div class="field"><label>职责说明</label><input id="nr-desc" placeholder="功能实现、重构与回归测试"></div>' +
    '<div class="field-row"><div class="field"><label>默认权限档位</label><select id="nr-perm"><option value="auto-workspace">auto-workspace（工作区自动）</option><option value="auto">auto（Harness 原生 Auto）</option><option value="readonly">readonly（只读）</option><option value="ask">ask（逐项询问）</option><option value="yolo">yolo（完全放行）</option></select></div><div class="field"><label>默认模型（可选）</label><input id="nr-model" placeholder="留空用默认"></div></div>' +
    '<label class="check-row"><input type="checkbox" id="nr-wt" checked> Git 仓库下默认启用独立 Worktree 隔离</label>' +
    '<label class="check-row"><input type="checkbox" id="nr-global"> 保存为全局角色模板（所有项目可按需实例化复用）</label>',
    '<button class="btn" data-action="closeModal">取消</button><button class="btn primary" data-action="confirmNewRole">保存角色</button>'
  );
  const gCheck = document.getElementById('nr-global');
  const pField = document.getElementById('nr-proj-field');
  if (gCheck && pField) gCheck.addEventListener('change', () => { pField.style.display = gCheck.checked ? 'none' : 'block'; });
}

function openDispatchModal(preTarget, preProj, preTask){
  const snap = getSnap();
  const roles = snap.roles || [];
  const globals = snap.global_roles || [];
  const panes = snap.managed_panes || [];
  const unm = snap.unmanaged_live_agents || [];
  const defProj = preProj || (state.project !== 'all' ? state.project : (snap.projects?.[0]?.project_id || ''));

  const encOpt = obj => esc(JSON.stringify(obj));
  const opts = [];
  for (const r of roles){
    const sel = preTarget === r.role && (!preProj || preProj === r.project_id) ? 'selected' : '';
    opts.push('<option value="' + encOpt({ kind: 'role', project: r.project_id, target: r.role }) + '" ' + sel + '>项目角色 · ' + esc(projectName(r.project_id) + ' / ' + r.role + ' (' + (ST[r.agent_status]?.label || r.binding_mode) + ')') + '</option>');
  }
  const existingRoleNames = new Set(roles.filter(r => !defProj || r.project_id === defProj).map(r => r.role));
  for (const g of globals){
    if (existingRoleNames.has(g.role)) continue;
    opts.push('<option value="' + encOpt({ kind: 'global_role', project: defProj, target: g.role }) + '">全局模板 · ' + esc(g.role + ' (' + harnessName(g.default_kind || 'codex') + ' · 自动启用)') + '</option>');
  }
  for (const p of panes.filter(x => !x.role)){
    const sel = preTarget === p.pane_id ? 'selected' : '';
    opts.push('<option value="' + encOpt({ kind: 'pane', project: p.project_id, target: p.pane_id }) + '" ' + sel + '>受管工位 · ' + esc(paneTitle(p) + (paneLoc(p) ? ' (' + paneLoc(p) + ')' : '')) + '</option>');
  }
  for (const a of unm){
    const sel = preTarget === a.pane_id ? 'selected' : '';
    opts.push('<option value="' + encOpt({ kind: 'unmanaged', project: a.project_id, target: a.pane_id }) + '" ' + sel + '>外部会话 · ' + esc(paneTitle(a) + (paneLoc(a) ? ' (' + paneLoc(a) + ')' : '') + ' · 派发并接入') + '</option>');
  }

  openModal(preTask ? ('续写任务 · ' + esc(preTask)) : '派发任务',
    '<div class="field"><label>目标角色、全局模板或在线会话</label><select id="dp-target">' + (opts.length ? opts.join('') : '<option value="">请先创建角色或启动一个在线会话</option>') + '</select></div>' +
    '<div class="field"><label>任务 ID（选填：留空新建第 1 轮；填已有任务 ID 将续写进入下一轮）</label><input id="dp-task" value="' + esc(preTask || '') + '" placeholder="留空自动生成，如 feat-auth"></div>' +
    '<div class="field"><label>任务书正文（将自动写入 .chflow/ 文件信箱）</label><textarea id="dp-brief" placeholder="清晰描述目标、验收标准与可写范围..."></textarea></div>' +
    '<label class="check-row"><input type="checkbox" id="dp-spawn" checked> 若角色处于待命或来自全局模板，自动按预设拉起并绑定</label>',
    '<button class="btn" data-action="closeModal">取消</button><button class="btn primary" data-action="confirmDispatch">' + ic('send','sm') + (preTask ? '发送下一轮' : '立即派发') + '</button>'
  );
}

function openBindPaneModal(paneId, projectId){
  const pm = findPaneMeta(paneId);
  const roles = (getSnap().roles || []).filter(r => !projectId || r.project_id === projectId);
  const globals = getSnap().global_roles || [];
  const existingNames = new Set(roles.map(r => r.role));
  const choices = [
    ...roles.map(r => '<option value="' + esc(JSON.stringify({ project: r.project_id, role: r.role })) + '">项目角色 · ' + esc(projectName(r.project_id) + ' / ' + r.role) + '</option>'),
    ...globals.filter(g => !existingNames.has(g.role)).map(g => '<option value="' + esc(JSON.stringify({ project: projectId || '', role: g.role })) + '">全局模板 · ' + esc(g.role + ' (启用并绑定)') + '</option>')
  ];
  openModal('绑定会话「' + esc(pm ? paneTitle(pm) : paneId) + '」到角色',
    choices.length
      ? '<div class="field"><label>选择目标角色或全局模板</label><select id="bp-role">' + choices.join('') + '</select></div>'
      : '<p style="margin:0;color:var(--text-2)">当前项目暂无角色或全局模板，请先点击「新建角色」或直接「接入管控」。</p>',
    '<button class="btn" data-action="closeModal">取消</button>' + (choices.length ? '<button class="btn primary" data-action="confirmBindPane" data-pane="' + esc(paneId) + '">确认绑定</button>' : '')
  );
}
`;
