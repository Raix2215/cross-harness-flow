export const DAG_JS = String.raw`
const LANE_HEADER_CLEARANCE = 78;
const LANE_PAD_X = 24;
const LANE_PAD_BOTTOM = 24;

function computeLaneBounds(lane, laneNodes){
  const custom = state.dag.laneSizes[lane.id];
  const minW = Math.max(lane.defaultW, custom?.w || 0);
  const minH = Math.max(lane.defaultH, custom?.h || 0);
  let maxRight = lane.x + minW;
  let maxBottom = lane.y + minH;
  for (const n of laneNodes){
    if (n.x + n.w + LANE_PAD_X > maxRight) maxRight = n.x + n.w + LANE_PAD_X;
    if (n.y + n.h + LANE_PAD_BOTTOM > maxBottom) maxBottom = n.y + n.h + LANE_PAD_BOTTOM;
  }
  lane.w = Math.round(maxRight - lane.x);
  lane.h = Math.round(maxBottom - lane.y);
}

function computeDagLayout(){
  const projs = visibleProjects();
  const lanes = [], nodes = [], edges = [];
  let cursorY = 18;
  const colX = { ctrl: 32, role: 496, fallback: 988 };

  for (const p of projs){
    const rawWorkers = buildProjectWorkers(p.project_id);
    const ctrls = buildProjectControllers(p, rawWorkers);
    if (!rawWorkers.length && !ctrls.length) continue;

    const ctrlOrder = new Map(ctrls.map((c, i) => [c.paneId, i]));
    const workers = rawWorkers.slice().sort((a, b) => {
      const ca = a.controllerPane ? (ctrlOrder.get(a.controllerPane) ?? 99) : 100;
      const cb = b.controllerPane ? (ctrlOrder.get(b.controllerPane) ?? 99) : 100;
      return ca - cb;
    });
    const hasFallback = workers.some(w => (w.status === 'retrying' || w.status === 'scheduled_retry') && w.task?.fallback?.length);

    const roleH = w => w.status === 'blocked' ? 184 : (w.status === 'scheduled_retry' || w.status === 'retrying') ? 176 : w.status === 'unbound' ? 134 : 164;
    const ctrlH = 172, gapY = 18;
    const laneOff = state.dag.laneOffsets[p.project_id] || { dx: 0, dy: 0 };
    const laneBaseX = 20, laneBaseY = cursorY;
    const laneX = laneBaseX + laneOff.dx, laneY = laneBaseY + laneOff.dy;

    let ry = laneBaseY + 84;
    const centersByCtrl = new Map();
    const roleNodes = [];
    const laneNodes = [];
    for (const w of workers){
      const h = roleH(w);
      const off = state.dag.offsets[w.nodeId] || { dx: 0, dy: 0 };
      const x = Math.max(laneX + 20, laneX + colX.role + off.dx);
      const y = Math.max(laneY + LANE_HEADER_CLEARANCE, ry + laneOff.dy + off.dy);
      const rn = { kind: 'worker', laneId: p.project_id, id: w.nodeId, data: w, baseRelX: colX.role, baseRelY: ry - laneBaseY, x, y, w: 342, h };
      roleNodes.push(rn);
      laneNodes.push(rn);
      if (w.controllerPane){
        const arr = centersByCtrl.get(w.controllerPane) || [];
        arr.push(ry + h / 2);
        centersByCtrl.set(w.controllerPane, arr);
      }
      ry += h + gapY;
    }

    const rolesBottom = workers.length ? ry - gapY : laneBaseY + 230;
    let lastCtrlBottom = laneBaseY + 84 - gapY;
    for (const c of ctrls){
      const ys = centersByCtrl.get(c.paneId);
      const desiredY = ys && ys.length ? ((Math.min(...ys) + Math.max(...ys)) / 2 - ctrlH / 2) : (lastCtrlBottom + gapY);
      const baseY = Math.max(laneBaseY + 84, lastCtrlBottom + gapY, desiredY);
      lastCtrlBottom = baseY + ctrlH;
      const off = state.dag.offsets[c.nodeId] || { dx: 0, dy: 0 };
      const x = Math.max(laneX + 20, laneX + colX.ctrl + off.dx);
      const y = Math.max(laneY + LANE_HEADER_CLEARANCE, baseY + laneOff.dy + off.dy);
      const cn = { kind: 'ctrl', laneId: p.project_id, id: c.nodeId, data: c, baseRelX: colX.ctrl, baseRelY: baseY - laneBaseY, x, y, w: 316, h: ctrlH };
      nodes.push(cn);
      laneNodes.push(cn);
    }

    const bodyBottom = Math.max(rolesBottom, lastCtrlBottom);
    const defaultLaneW = hasFallback ? 1286 : 874;
    const defaultLaneH = (bodyBottom - laneBaseY) + 24;

    for (const rn of roleNodes){
      nodes.push(rn);
      const w = rn.data;
      if (w.controllerPane){
        const ctrlId = 'ctrl:' + p.project_id + ':' + w.controllerPane;
        const edgeCls = w.status === 'blocked' ? 'blocked' : w.status === 'working' ? 'working' : (w.status === 'retrying' || w.status === 'scheduled_retry') ? 'retry' : 'idle';
        const permShort = w.perm === 'auto-workspace' ? 'auto-ws' : w.perm;
        edges.push({ id: ctrlId + '->' + w.nodeId, from: ctrlId, to: w.nodeId, cls: edgeCls, label: permShort + (w.task?.turn ? ' · #' + w.task.turn : '') });
      }
      if ((w.status === 'retrying' || w.status === 'scheduled_retry') && w.task?.fallback?.length){
        const fid = 'fb:' + w.nodeId;
        const foff = state.dag.offsets[fid] || { dx: 0, dy: 0 };
        const chain = w.task.fallback.map(f => f.channel || harnessName(f.kind));
        const fx = Math.max(laneX + 20, laneX + colX.fallback + foff.dx);
        const fy = Math.max(laneY + LANE_HEADER_CLEARANCE, rn.y + 18 + foff.dy);
        const fn = {
          kind: 'fallback', laneId: p.project_id, id: fid, workerId: w.nodeId,
          data: { title: '回退链 · ' + chain[0], chain, retries: w.task.retries || 1, eta: fmtEta(w.task.nextAt, getSnap().now) },
          baseRelX: colX.fallback, baseRelY: (rn.y - laneY) + 18,
          x: fx, y: fy, w: 264, h: 134
        };
        nodes.push(fn);
        laneNodes.push(fn);
        edges.push({ id: w.nodeId + '->' + fid, from: w.nodeId, to: fid, cls: 'fallback', label: 'fallback' });
      }
    }

    const lane = { id: p.project_id, project: p, baseX: laneBaseX, baseY: laneBaseY, x: laneX, y: laneY, w: defaultLaneW, h: defaultLaneH, defaultW: defaultLaneW, defaultH: defaultLaneH, hasFallback, ctrlCount: ctrls.length, roleCount: workers.length };
    computeLaneBounds(lane, laneNodes);
    lanes.push(lane);
    cursorY += Math.max(defaultLaneH, lane.h) + 22;
  }

  const maxRight = Math.max(...lanes.map(l => l.x + l.w), 960);
  const maxBottom = Math.max(...lanes.map(l => l.y + l.h), cursorY);
  return { lanes, nodes, edges, totalH: Math.max(maxBottom + 28, 300), totalW: maxRight + 40 };
}

function buildEdgeGeometry(a, b){
  const x1 = a.x + a.w, y1 = a.y + a.h / 2;
  const x2 = b.x, y2 = b.y + b.h / 2;
  const dx = Math.max(46, Math.abs(x2 - x1) * 0.45);
  return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, d: 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2 };
}

function renderDagView(){
  const snap = getSnap();
  const layout = computeDagLayout();
  state.lastLayout = layout;
  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));

  let svgPaths = '', edgeBadges = '';
  for (const e of layout.edges){
    const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
    if (!a || !b) continue;
    const g = buildEdgeGeometry(a, b);
    const stroke = e.cls === 'blocked' ? 'var(--warn)' : e.cls === 'working' ? 'var(--accent)' : (e.cls === 'retry' || e.cls === 'fallback') ? 'var(--retry)' : 'var(--border-strong)';
    svgPaths += '<path class="edge-path ' + e.cls + '" data-edge-id="' + esc(e.id) + '" d="' + g.d + '"/>';
    svgPaths += '<circle data-edge-start="' + esc(e.id) + '" cx="' + g.x1 + '" cy="' + g.y1 + '" r="3.5" fill="var(--surface)" stroke="' + stroke + '" stroke-width="2"/>';
    svgPaths += '<circle data-edge-end="' + esc(e.id) + '" cx="' + g.x2 + '" cy="' + g.y2 + '" r="3.5" fill="' + stroke + '"/>';
    edgeBadges += '<div class="edge-badge ' + e.cls + '" data-edge-badge="' + esc(e.id) + '" style="left:' + g.mx + 'px;top:' + g.my + 'px">' + esc(e.label) + '</div>';
  }

  const lanesHtml = layout.lanes.map(l =>
    '<div class="dag-lane" data-lane-id="' + esc(l.id) + '" style="left:' + l.x + 'px;top:' + l.y + 'px;width:' + l.w + 'px;height:' + l.h + 'px">' +
      '<div class="dag-lane-head" data-lane-drag="' + esc(l.id) + '" title="按住拖动可移动整个项目容器">' +
        '<div class="dag-lane-title"><span class="dag-lane-grip">' + ic('grip','sm') + '</span>' + ic('folder') + '<span>' + esc(l.project.name) + '</span><span class="tag mono">' + esc(l.project.source === 'config' ? '已持久化' : (l.project.source || 'folder')) + '</span></div>' +
        '<div class="dag-lane-meta"><span>' + l.ctrlCount + ' 主控</span><span>·</span><span>' + l.roleCount + ' 角色/工位</span><span class="mono">' + esc(shortPath(l.project.root)) + '</span>' +
          (l.project.source !== 'config' && l.project.root ? '<button class="btn sm ghost" data-action="openPersistProject" data-proj="' + esc(l.project.project_id) + '" data-cwd="' + esc(l.project.root) + '" title="写入 .chflow/project.yaml 持久化项目归属与角色定义">持久化</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="dag-col-labels">' +
        '<span class="dag-col-label" style="left:32px">' + ic('compass','sm') + '主控会话 (Controllers)</span>' +
        '<span class="dag-col-label" style="left:496px">' + ic('layers','sm') + '项目角色与执行工位 (Roles)</span>' +
        (l.hasFallback ? '<span class="dag-col-label" style="left:988px">' + ic('refresh','sm') + '活跃回退链 (Fallback)</span>' : '') +
      '</div>' +
      '<div class="dag-lane-resize" data-lane-resize="' + esc(l.id) + '" title="拖拽调整项目容器尺寸">' + ic('resize','sm') + '</div>' +
    '</div>'
  ).join('');

  const nodesHtml = layout.nodes.map(n => {
    const sel = state.drawer?.nodeId === n.id ? 'selected' : '';
    if (n.kind === 'ctrl'){
      const c = n.data;
      const stInfo = !c.live ? { label: '已离线', c: 'danger' }
        : c.status === 'blocked' ? { label: '待授权', c: 'warn' }
        : c.paused ? { label: '已暂停', c: 'warn' }
        : c.typing ? { label: '输入中', c: 'warn' }
        : c.status === 'working' ? { label: '运行中', c: 'ok' }
        : { label: '就绪', c: 'ok' };
      const cPermMeta = c.managed && c.perm ? permModeMeta(c.kind, c.perm, c.nativePerm, c.permMode) : null;
      const permShort = c.perm === 'auto-workspace' ? 'auto-ws' : (c.perm || '');
      const ownSummary = c.observed && !c.managed && !c.managedRolesCount && !c.activeTasksCount
        ? '手动终端会话 · 自动归属当前项目'
        : '管辖 ' + c.managedRolesCount + ' 角色' + (c.managedWorkersCount ? ' · ' + c.managedWorkersCount + ' 工位' : '') + ' · 活跃 ' + c.activeTasksCount + (c.blockedTasksCount ? ' · 待审 ' + c.blockedTasksCount : '');
      const chNote = !c.live ? '主控会话已退出（仍有挂起回执或任务）'
        : c.paused ? '免打扰暂停中 · 回执暂存队列'
        : c.typing ? '检测到输入草稿 · 暂缓 ' + c.queuedCount + ' 条回执'
        : c.queuedCount ? '候投回执 ' + c.queuedCount + ' 条待送达'
        : !c.managed ? '仅观测（零侵入）· 点击调权限、切项目或转工位'
        : '回执通道畅通 · 16 行输入框防打扰';
      return '<div class="dag-node ctrl ' + (!c.live ? 'st-offline ' : c.status === 'blocked' ? 'st-blocked ' : '') + sel + '" data-node-id="' + esc(c.nodeId) + '" data-lane-id="' + esc(n.laneId) + '" data-node-kind="ctrl" title="Herdr 窗格: ' + esc(c.paneId) + '" style="left:' + n.x + 'px;top:' + n.y + 'px;min-height:' + n.h + 'px">' +
        '<div class="dn-head"><div class="dn-title">' + ic('compass') + '<span>' + esc(c.name) + '</span></div><span class="pill ' + stInfo.c + '"><span class="dot ' + stInfo.c + '"></span>' + stInfo.label + '</span></div>' +
        '<div class="dn-sub"><span>' + esc(harnessName(c.kind)) + (c.model ? ' · ' + esc(c.model) : '') + '</span>' + (c.location ? '<span class="loc-chip">' + esc(c.location) + '</span>' : '') + '</div>' +
        '<div class="dn-task"><div class="dn-task-top"><span>' + esc(ownSummary) + '</span>' + (c.queuedCount ? '<span class="pill warn">' + c.queuedCount + ' 候投</span>' : '') + '</div><div class="dn-task-note">' + esc(chNote) + '</div></div>' +
        '<div class="dn-foot"><span class="dn-foot-left">' + (cPermMeta ? '<span class="tag" title="' + esc(cPermMeta.note) + '">' + ic('shield','sm') + esc(cPermMeta.short + permShort) + '</span>' : '<span class="tag">仅观测</span>') + (c.overriddenProject ? ' <span class="tag">已指派</span>' : '') + '</span><div style="display:flex;align-items:center;gap:4px">' +
          (c.live ? '<button class="btn icon sm ghost" data-action="' + (c.paused ? 'resumeRecipient' : 'pauseRecipient') + '" data-pane="' + esc(c.paneId) + '" title="' + (c.paused ? '恢复自动投递回执' : '开启免打扰暂停投递') + '">' + ic(c.paused ? 'play' : 'pause','sm') + '</button>' : '') +
          (c.live ? '<button class="btn icon sm ghost" data-action="focusPane" data-pane="' + esc(c.paneId) + '" title="在 Herdr 中定位此窗格">' + ic('locate','sm') + '</button>' : '') +
        '</div></div>' +
      '</div>';
    }
    if (n.kind === 'fallback'){
      const fb = n.data;
      return '<div class="dag-node fallback" data-node-id="' + esc(n.id) + '" data-lane-id="' + esc(n.laneId) + '" data-node-kind="fallback" data-worker-id="' + esc(n.workerId) + '" style="left:' + n.x + 'px;top:' + n.y + 'px;min-height:' + n.h + 'px">' +
        '<div class="dn-head"><div class="dn-title">' + ic('refresh') + '<span>' + esc(fb.title) + '</span></div><span class="pill retry">#' + esc(fb.retries) + '</span></div>' +
        '<div class="dn-sub" style="margin-top:6px">回退顺序：' + esc(fb.chain.join(' → ')) + '</div>' +
        '<div class="dn-foot"><span>' + esc(fb.eta) + '</span><span style="color:var(--retry);font-weight:600">自动接管</span></div>' +
      '</div>';
    }
    const w = n.data;
    const st = ST[w.status] || ST.idle;
    const stCls = w.status === 'blocked' ? 'st-blocked' : w.status === 'working' ? 'st-working' : (w.status === 'retrying' || w.status === 'scheduled_retry') ? 'st-retry' : w.status === 'offline' ? 'st-offline' : w.status === 'unbound' ? 'st-unbound' : '';
    const bindText = w.bindingMode === 'unbound'
      ? ic('link','sm') + '待命 · 默认 ' + esc(harnessName(w.kind))
      : w.bindingMode === 'headless'
        ? ic('cpu','sm') + '无头 · ' + esc(harnessName(w.kind)) + (w.model ? ' · ' + esc(w.model) : '')
        : ic('monitor','sm') + esc(harnessName(w.kind)) + (w.location ? ' · ' + esc(w.location) : '');

    let mid = '';
    if (w.status === 'blocked' && w.task){
      mid = '<div class="dn-alert">' + ic('shield','sm') + '<span>' + esc(w.task.block?.reason || 'permission_prompt') + '</span></div>' +
        '<div class="dn-actions"><button class="btn sm warn" data-action="openWorker" data-id="' + esc(w.nodeId) + '">' + ic('terminal','sm') + '查看现场</button><button class="btn sm" data-action="approveTask" data-id="' + esc(w.task.task) + '">' + ic('check','sm') + '批准</button></div>';
    } else if ((w.status === 'scheduled_retry' || w.status === 'retrying') && w.task){
      mid = '<div class="dn-task"><div class="dn-task-top"><span>' + esc(w.task.task) + '</span><span class="menu-meta">#' + esc(w.task.turn || 1) + '</span></div></div>' +
        '<div class="dn-retry">' + ic('clock','sm') + '<span>' + esc(fmtEta(w.task.nextAt, snap.now)) + (w.task.reason ? ' · ' + esc(w.task.reason) : '') + '</span></div>';
    } else if (w.status === 'unbound' && w.role){
      mid = '<div class="dn-actions" style="margin-top:12px"><button class="btn sm primary" data-action="openSwap" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">' + ic('plus','sm') + '绑定或启动会话</button></div>';
    } else if (w.task){
      mid = '<div class="dn-task"><div class="dn-task-top"><span>' + esc(w.task.task) + '</span><span class="menu-meta">第 ' + esc(w.task.turn || 1) + ' 轮</span></div>' +
        '<div class="dn-task-note">' + esc(w.task.note || w.task.reason || st.label) + '</div></div>';
    } else {
      mid = '<div class="dn-task"><div class="dn-task-note">' + (w.status === 'offline' ? '窗格已离线，可热替换新会话' : '空闲就绪，随时可派发任务') + '</div></div>';
    }

    const wPermMeta = w.bindingMode !== 'unbound' ? permModeMeta(w.kind, w.perm, w.nativePerm, w.permMode) : null;
    const wPermLabel = (wPermMeta ? wPermMeta.short : '') + (w.perm === 'auto-workspace' ? 'auto-ws' : w.perm);
    return '<div class="dag-node role ' + stCls + ' ' + sel + '" data-node-id="' + esc(w.nodeId) + '" data-lane-id="' + esc(n.laneId) + '" data-node-kind="worker"' + (w.paneId ? ' title="Herdr 窗格: ' + esc(w.paneId) + '"' : '') + ' style="left:' + n.x + 'px;top:' + n.y + 'px;min-height:' + n.h + 'px">' +
      '<div class="dn-head"><div class="dn-title">' + (w.isRole ? ic('role','role-ic') : ic('monitor','sm')) + '<span>' + esc(w.name) + '</span></div><span class="pill ' + st.c + '"><span class="dot ' + st.c + '"></span>' + st.label + '</span></div>' +
      '<div class="dn-sub">' + esc(w.desc) + '</div>' +
      mid +
      '<div class="dn-foot"><span class="dn-foot-left">' + bindText + '</span><div style="display:flex;align-items:center;gap:4px">' +
        (w.paneId && w.status !== 'offline' ? '<button class="btn icon sm ghost" data-action="focusPane" data-pane="' + esc(w.paneId) + '" title="在 Herdr 中定位此窗格">' + ic('locate','sm') + '</button>' : '') +
        '<span class="tag" title="' + esc(wPermMeta ? wPermMeta.note : '') + '">' + ic('shield','sm') + esc(wPermLabel) + '</span>' +
      '</div></div>' +
    '</div>';
  }).join('');

  const emptyHtml = layout.lanes.length ? '' :
    '<div class="empty-canvas"><div class="empty-card"><div style="margin-bottom:10px;color:var(--accent)">' + ic('dag','lg') + '</div><div style="font-size:16px;font-weight:700;margin-bottom:6px">当前暂无在线会话或活跃项目</div><div style="font-size:13.5px;color:var(--text-3);margin-bottom:16px">在 Herdr 终端启动任意 Harness 会话后将自动归属对应目录项目并展示为主控；也可从顶部项目菜单切入已持久化项目一键拉起角色。</div><div style="display:flex;justify-content:center;gap:8px"><button class="btn" data-action="openNewRole">' + ic('user-plus','sm') + '新建角色</button><button class="btn primary" data-action="openDispatch">' + ic('send','sm') + '派发任务</button></div></div></div>';

  return '<div class="dag-shell ' + (state.dag.expanded ? 'expanded' : '') + '" id="dag-shell">' +
    emptyHtml +
    '<div class="dag-stage" id="dag-stage" style="transform:translate(' + state.dag.tx + 'px,' + state.dag.ty + 'px) scale(' + state.dag.scale + ')">' +
      lanesHtml + '<svg class="dag-svg">' + svgPaths + '</svg>' + edgeBadges + nodesHtml +
    '</div>' +
    '<div class="dag-hint">拖顶栏移项目 · 拖卡片容器自动贴合 · 右键卡片快捷切换项目/角色 · 布局自动记住 · Esc 关闭浮层</div>' +
    '<div class="dag-controls">' +
      '<button data-action="dagZoomOut" title="缩小">−</button>' +
      '<span class="dag-zoom-val" id="dag-zoom-val">' + Math.round(state.dag.scale * 100) + '%</span>' +
      '<button data-action="dagZoomIn" title="放大">+</button>' +
      '<button data-action="dagFit">适配</button>' +
      '<button data-action="dagReset">重置</button>' +
      '<button data-action="dagExpand" title="' + (state.dag.expanded ? '退出全屏画布' : '全屏展开画布') + '">' + ic(state.dag.expanded ? 'minimize' : 'maximize','sm') + '</button>' +
    '</div>' +
  '</div>';
}

function updateDraggedEdges(stage, layout){
  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));
  for (const e of layout.edges){
    const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
    if (!a || !b) continue;
    const g = buildEdgeGeometry(a, b);
    const pathEl = stage.querySelector('[data-edge-id="' + CSS.escape(e.id) + '"]');
    if (pathEl) pathEl.setAttribute('d', g.d);
    const c1 = stage.querySelector('[data-edge-start="' + CSS.escape(e.id) + '"]');
    if (c1){ c1.setAttribute('cx', String(g.x1)); c1.setAttribute('cy', String(g.y1)); }
    const c2 = stage.querySelector('[data-edge-end="' + CSS.escape(e.id) + '"]');
    if (c2){ c2.setAttribute('cx', String(g.x2)); c2.setAttribute('cy', String(g.y2)); }
    const badge = stage.querySelector('[data-edge-badge="' + CSS.escape(e.id) + '"]');
    if (badge){ badge.style.left = g.mx + 'px'; badge.style.top = g.my + 'px'; }
  }
}

function syncLaneDom(stage, layout, laneId){
  const lane = layout.lanes.find(l => l.id === laneId);
  if (!lane) return;
  const laneNodes = layout.nodes.filter(n => n.laneId === laneId);
  computeLaneBounds(lane, laneNodes);
  const laneEl = stage.querySelector('.dag-lane[data-lane-id="' + CSS.escape(laneId) + '"]');
  if (laneEl){
    laneEl.style.left = lane.x + 'px';
    laneEl.style.top = lane.y + 'px';
    laneEl.style.width = lane.w + 'px';
    laneEl.style.height = lane.h + 'px';
  }
}

function bindDagInteractions(){
  const shell = document.getElementById('dag-shell'), stage = document.getElementById('dag-stage');
  if (!shell || !stage) return;

  const applyTransform = () => {
    stage.style.transform = 'translate(' + state.dag.tx + 'px,' + state.dag.ty + 'px) scale(' + state.dag.scale + ')';
    const zv = document.getElementById('dag-zoom-val');
    if (zv) zv.textContent = Math.round(state.dag.scale * 100) + '%';
  };

  shell.onwheel = ev => {
    ev.preventDefault();
    state.dag.scale = Math.min(1.6, Math.max(0.3, state.dag.scale * (ev.deltaY < 0 ? 1.08 : 0.92)));
    applyTransform();
  };

  let lastTouchAt = 0;
  let touchState = null;

  const openNodeDrawer = nodeEl => {
    const id = nodeEl.dataset.nodeId;
    const kind = nodeEl.dataset.nodeKind;
    if (kind === 'worker') { state.drawer = { kind: 'worker', nodeId: id, tab: 'overview' }; render(); }
    else if (kind === 'ctrl') { state.drawer = { kind: 'ctrl', nodeId: id, tab: 'overview' }; render(); }
    else if (kind === 'fallback') { state.drawer = { kind: 'worker', nodeId: nodeEl.dataset.workerId, tab: 'overview' }; render(); }
  };

  shell.addEventListener('touchstart', ev => {
    lastTouchAt = Date.now();
    if (ev.target.closest('button') || ev.target.closest('.dag-controls')) return;
    const touches = ev.touches;
    if (touches.length === 2){
      ev.preventDefault();
      if (touchState?.el) touchState.el.classList.remove('dragging');
      shell.classList.remove('panning');
      const [t0, t1] = [touches[0], touches[1]];
      const rect = shell.getBoundingClientRect();
      const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
      const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
      touchState = {
        mode: 'pinch',
        dist: Math.max(1, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)),
        scale: state.dag.scale,
        worldX: (midX - state.dag.tx) / state.dag.scale,
        worldY: (midY - state.dag.ty) / state.dag.scale
      };
      return;
    }
    if (touches.length !== 1) return;
    const t = touches[0];
    const layout = state.lastLayout;
    const resizeEl = ev.target.closest('[data-lane-resize]');
    if (resizeEl){
      const laneId = resizeEl.dataset.laneResize;
      const lane = layout?.lanes.find(l => l.id === laneId);
      const laneEl = stage.querySelector('.dag-lane[data-lane-id="' + CSS.escape(laneId) + '"]');
      if (lane && laneEl){
        const laneNodes = layout.nodes.filter(n => n.laneId === laneId);
        laneEl.classList.add('dragging');
        touchState = {
          mode: 'resize', laneId, lane, el: laneEl, sx: t.clientX, sy: t.clientY, startW: lane.w, startH: lane.h,
          minW: Math.max(420, ...laneNodes.map(n => (n.x - lane.x) + n.w + LANE_PAD_X)),
          minH: Math.max(220, ...laneNodes.map(n => (n.y - lane.y) + n.h + LANE_PAD_BOTTOM))
        };
        return;
      }
    }
    const laneDragEl = ev.target.closest('[data-lane-drag]');
    if (laneDragEl){
      const laneId = laneDragEl.dataset.laneDrag;
      const lane = layout?.lanes.find(l => l.id === laneId);
      const laneEl = stage.querySelector('.dag-lane[data-lane-id="' + CSS.escape(laneId) + '"]');
      if (lane && laneEl){
        const laneNodes = layout.nodes.filter(n => n.laneId === laneId);
        laneEl.classList.add('dragging');
        touchState = {
          mode: 'lane', laneId, lane, el: laneEl, sx: t.clientX, sy: t.clientY,
          orig: state.dag.laneOffsets[laneId] || { dx: 0, dy: 0 },
          laneStartX: lane.x, laneStartY: lane.y,
          nodeStart: laneNodes.map(n => ({ n, el: stage.querySelector('.dag-node[data-node-id="' + CSS.escape(n.id) + '"]'), x: n.x, y: n.y }))
        };
        return;
      }
    }
    const nodeEl = ev.target.closest('.dag-node');
    if (nodeEl){
      const id = nodeEl.dataset.nodeId;
      const nodeObj = layout?.nodes.find(n => n.id === id);
      const lane = nodeObj ? layout?.lanes.find(l => l.id === nodeObj.laneId) : null;
      const startX = nodeObj ? nodeObj.x : 0;
      const startY = nodeObj ? nodeObj.y : 0;
      touchState = {
        mode: 'node', id, el: nodeEl, nodeObj, lane, sx: t.clientX, sy: t.clientY,
        startX, startY,
        baseAbsX: lane && nodeObj ? (lane.x + nodeObj.baseRelX) : startX,
        baseAbsY: lane && nodeObj ? (lane.y + nodeObj.baseRelY) : startY,
        moved: false
      };
      return;
    }
    shell.classList.add('panning');
    touchState = { mode: 'pan', px: t.clientX - state.dag.tx, py: t.clientY - state.dag.ty };
  }, { passive: false });

  shell.addEventListener('touchmove', ev => {
    if (!touchState) return;
    lastTouchAt = Date.now();
    const touches = ev.touches;
    if (touchState.mode === 'pinch' && touches.length >= 2){
      ev.preventDefault();
      const [t0, t1] = [touches[0], touches[1]];
      const rect = shell.getBoundingClientRect();
      const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
      const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
      const dist = Math.max(1, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
      state.dag.scale = Math.min(1.8, Math.max(0.3, touchState.scale * (dist / touchState.dist)));
      state.dag.tx = Math.round(midX - touchState.worldX * state.dag.scale);
      state.dag.ty = Math.round(midY - touchState.worldY * state.dag.scale);
      applyTransform();
      return;
    }
    if (touches.length !== 1) return;
    const t = touches[0];
    const layout = state.lastLayout;
    if (touchState.mode === 'pan'){
      ev.preventDefault();
      state.dag.tx = Math.round(t.clientX - touchState.px);
      state.dag.ty = Math.round(t.clientY - touchState.py);
      applyTransform();
    } else if (touchState.mode === 'resize'){
      ev.preventDefault();
      const nw = Math.max(touchState.minW, Math.round(touchState.startW + (t.clientX - touchState.sx) / state.dag.scale));
      const nh = Math.max(touchState.minH, Math.round(touchState.startH + (t.clientY - touchState.sy) / state.dag.scale));
      state.dag.laneSizes[touchState.laneId] = { w: nw, h: nh };
      touchState.lane.w = nw; touchState.lane.h = nh;
      touchState.el.style.width = nw + 'px'; touchState.el.style.height = nh + 'px';
    } else if (touchState.mode === 'lane'){
      ev.preventDefault();
      const ddx = (t.clientX - touchState.sx) / state.dag.scale;
      const ddy = (t.clientY - touchState.sy) / state.dag.scale;
      state.dag.laneOffsets[touchState.laneId] = { dx: Math.round(touchState.orig.dx + ddx), dy: Math.round(touchState.orig.dy + ddy) };
      touchState.lane.x = Math.round(touchState.laneStartX + ddx);
      touchState.lane.y = Math.round(touchState.laneStartY + ddy);
      touchState.el.style.left = touchState.lane.x + 'px';
      touchState.el.style.top = touchState.lane.y + 'px';
      for (const item of touchState.nodeStart){
        item.n.x = Math.round(item.x + ddx); item.n.y = Math.round(item.y + ddy);
        if (item.el){ item.el.style.left = item.n.x + 'px'; item.el.style.top = item.n.y + 'px'; }
      }
      if (layout) updateDraggedEdges(stage, layout);
    } else if (touchState.mode === 'node'){
      const ddx = (t.clientX - touchState.sx) / state.dag.scale;
      const ddy = (t.clientY - touchState.sy) / state.dag.scale;
      if (!touchState.moved && Math.hypot(t.clientX - touchState.sx, t.clientY - touchState.sy) > 8){
        touchState.moved = true;
        touchState.el.classList.add('dragging');
      }
      if (touchState.moved && touchState.nodeObj){
        ev.preventDefault();
        const minX = touchState.lane ? touchState.lane.x + 20 : -Infinity;
        const minY = touchState.lane ? touchState.lane.y + LANE_HEADER_CLEARANCE : -Infinity;
        touchState.nodeObj.x = Math.round(Math.max(minX, touchState.startX + ddx));
        touchState.nodeObj.y = Math.round(Math.max(minY, touchState.startY + ddy));
        state.dag.offsets[touchState.id] = { dx: touchState.nodeObj.x - touchState.baseAbsX, dy: touchState.nodeObj.y - touchState.baseAbsY };
        touchState.el.style.left = touchState.nodeObj.x + 'px';
        touchState.el.style.top = touchState.nodeObj.y + 'px';
        if (touchState.lane && layout) syncLaneDom(stage, layout, touchState.lane.id);
        if (layout) updateDraggedEdges(stage, layout);
      }
    }
  }, { passive: false });

  const endTouch = ev => {
    if (!touchState) return;
    lastTouchAt = Date.now();
    const ts = touchState;
    touchState = null;
    shell.classList.remove('panning');
    if (ts.el) ts.el.classList.remove('dragging');
    if (ts.mode === 'resize' || ts.mode === 'lane'){
      saveDagPersist();
    } else if (ts.mode === 'node'){
      if (ts.moved) saveDagPersist();
      else if (ev.type === 'touchend'){ ev.preventDefault(); openNodeDrawer(ts.el); }
    }
  };
  shell.addEventListener('touchend', endTouch, { passive: false });
  shell.addEventListener('touchcancel', endTouch);

  shell.onmousedown = ev => {
    if (ev.button !== 0 || Date.now() - lastTouchAt < 500) return;
    if (ev.target.closest('button') || ev.target.closest('.dag-controls')) return;

    const resizeEl = ev.target.closest('[data-lane-resize]');
    if (resizeEl){
      const laneId = resizeEl.dataset.laneResize;
      const layout = state.lastLayout;
      const lane = layout?.lanes.find(l => l.id === laneId);
      const laneEl = stage.querySelector('.dag-lane[data-lane-id="' + CSS.escape(laneId) + '"]');
      if (lane && laneEl){
        const sx = ev.clientX, sy = ev.clientY;
        const startW = lane.w, startH = lane.h;
        const laneNodes = layout.nodes.filter(n => n.laneId === laneId);
        const minNodeW = Math.max(420, ...laneNodes.map(n => (n.x - lane.x) + n.w + LANE_PAD_X));
        const minNodeH = Math.max(220, ...laneNodes.map(n => (n.y - lane.y) + n.h + LANE_PAD_BOTTOM));
        laneEl.classList.add('dragging');
        const onMove = me => {
          const nw = Math.max(minNodeW, Math.round(startW + (me.clientX - sx) / state.dag.scale));
          const nh = Math.max(minNodeH, Math.round(startH + (me.clientY - sy) / state.dag.scale));
          state.dag.laneSizes[laneId] = { w: nw, h: nh };
          lane.w = nw; lane.h = nh;
          laneEl.style.width = nw + 'px';
          laneEl.style.height = nh + 'px';
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          laneEl.classList.remove('dragging');
          saveDagPersist();
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return;
      }
    }

    const laneDragEl = ev.target.closest('[data-lane-drag]');
    if (laneDragEl){
      const laneId = laneDragEl.dataset.laneDrag;
      const layout = state.lastLayout;
      const lane = layout?.lanes.find(l => l.id === laneId);
      const laneEl = stage.querySelector('.dag-lane[data-lane-id="' + CSS.escape(laneId) + '"]');
      if (lane && laneEl){
        const sx = ev.clientX, sy = ev.clientY;
        const orig = state.dag.laneOffsets[laneId] || { dx: 0, dy: 0 };
        const laneNodes = layout.nodes.filter(n => n.laneId === laneId);
        const nodeStart = laneNodes.map(n => ({ n, el: stage.querySelector('.dag-node[data-node-id="' + CSS.escape(n.id) + '"]'), x: n.x, y: n.y }));
        const laneStartX = lane.x, laneStartY = lane.y;
        laneEl.classList.add('dragging');
        const onMove = me => {
          const ddx = (me.clientX - sx) / state.dag.scale;
          const ddy = (me.clientY - sy) / state.dag.scale;
          state.dag.laneOffsets[laneId] = { dx: Math.round(orig.dx + ddx), dy: Math.round(orig.dy + ddy) };
          lane.x = Math.round(laneStartX + ddx);
          lane.y = Math.round(laneStartY + ddy);
          laneEl.style.left = lane.x + 'px';
          laneEl.style.top = lane.y + 'px';
          for (const item of nodeStart){
            item.n.x = Math.round(item.x + ddx);
            item.n.y = Math.round(item.y + ddy);
            if (item.el){ item.el.style.left = item.n.x + 'px'; item.el.style.top = item.n.y + 'px'; }
          }
          updateDraggedEdges(stage, layout);
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          laneEl.classList.remove('dragging');
          saveDagPersist();
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return;
      }
    }

    const nodeEl = ev.target.closest('.dag-node');
    if (nodeEl){
      const id = nodeEl.dataset.nodeId;
      const sx = ev.clientX, sy = ev.clientY;
      const layout = state.lastLayout;
      const nodeObj = layout?.nodes.find(n => n.id === id);
      const lane = nodeObj ? layout?.lanes.find(l => l.id === nodeObj.laneId) : null;
      const startX = nodeObj ? nodeObj.x : 0;
      const startY = nodeObj ? nodeObj.y : 0;
      const baseAbsX = lane && nodeObj ? (lane.x + nodeObj.baseRelX) : startX;
      const baseAbsY = lane && nodeObj ? (lane.y + nodeObj.baseRelY) : startY;
      let moved = false;
      const onMove = me => {
        const ddx = (me.clientX - sx) / state.dag.scale, ddy = (me.clientY - sy) / state.dag.scale;
        if (!moved && Math.hypot(ddx, ddy) > 4){ moved = true; nodeEl.classList.add('dragging'); }
        if (moved && nodeObj){
          const minX = lane ? lane.x + 20 : -Infinity;
          const minY = lane ? lane.y + LANE_HEADER_CLEARANCE : -Infinity;
          nodeObj.x = Math.round(Math.max(minX, startX + ddx));
          nodeObj.y = Math.round(Math.max(minY, startY + ddy));
          state.dag.offsets[id] = { dx: nodeObj.x - baseAbsX, dy: nodeObj.y - baseAbsY };
          nodeEl.style.left = nodeObj.x + 'px';
          nodeEl.style.top = nodeObj.y + 'px';
          if (lane) syncLaneDom(stage, layout, lane.id);
          updateDraggedEdges(stage, layout);
        }
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        nodeEl.classList.remove('dragging');
        if (moved){
          saveDagPersist();
        } else {
          const kind = nodeEl.dataset.nodeKind;
          if (kind === 'worker') { state.drawer = { kind: 'worker', nodeId: id, tab: 'overview' }; render(); }
          else if (kind === 'ctrl') { state.drawer = { kind: 'ctrl', nodeId: id }; render(); }
          else if (kind === 'fallback') { state.drawer = { kind: 'worker', nodeId: nodeEl.dataset.workerId, tab: 'overview' }; render(); }
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    const px = ev.clientX - state.dag.tx, py = ev.clientY - state.dag.ty;
    shell.classList.add('panning');
    const onMove = me => {
      state.dag.tx = me.clientX - px; state.dag.ty = me.clientY - py;
      stage.style.transform = 'translate(' + state.dag.tx + 'px,' + state.dag.ty + 'px) scale(' + state.dag.scale + ')';
    };
    const onUp = () => {
      shell.classList.remove('panning');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  shell.oncontextmenu = ev => {
    const ctrlEl = ev.target.closest('.dag-node[data-node-kind="ctrl"]');
    if (ctrlEl){
      ev.preventDefault();
      const c = findCtrlByNodeId(ctrlEl.dataset.nodeId);
      if (!c) return;
      const managedEntry = (getSnap().managed_panes || []).find(p => p.pane_id === c.paneId && !p.role);
      const hasCtrlWorkerTask = Boolean(managedEntry && taskForPane(managedEntry));
      document.getElementById('ctx-root').innerHTML = '<div class="ctx-menu" style="left:' + Math.max(12, Math.min(ev.clientX, window.innerWidth - 236)) + 'px;top:' + Math.max(12, Math.min(ev.clientY, window.innerHeight - 310)) + 'px">' +
        '<button class="ctx-item" data-action="openCtrl" data-id="' + esc(c.nodeId) + '">' + ic('eye','sm') + '查看主控详情</button>' +
        (c.live ? '<button class="ctx-item" data-action="focusPane" data-pane="' + esc(c.paneId) + '">' + ic('locate','sm') + '跳转 Herdr 窗格</button>' : '') +
        (c.live ? '<button class="ctx-item" data-action="openProjectModal" data-pane="' + esc(c.paneId) + '" data-proj="' + esc(c.projectId) + '" data-cwd="' + esc(c.cwd || '') + '">' + ic('folder','sm') + '切换所属项目...</button>' : '') +
        (c.live ? '<button class="ctx-item" data-action="openBindPane" data-pane="' + esc(c.paneId) + '" data-proj="' + esc(c.projectId) + '">' + ic('link','sm') + '绑定为项目角色...</button>' : '') +
        (c.live ? '<button class="ctx-item" data-action="convertToWorker" data-pane="' + esc(c.paneId) + '" data-kind="' + esc(c.kind) + '" data-proj="' + esc(c.projectId) + '">' + ic('monitor','sm') + '转为临时受管工位</button>' : '') +
        (c.live && !c.managed ? '<button class="ctx-item" data-action="adoptAsController" data-pane="' + esc(c.paneId) + '" data-kind="' + esc(c.kind) + '">' + ic('shield','sm') + '接入管控（保留主控位）</button>' : '') +
        (c.live ? '<button class="ctx-item" data-action="' + (c.paused ? 'resumeRecipient' : 'pauseRecipient') + '" data-pane="' + esc(c.paneId) + '">' + ic(c.paused ? 'play' : 'pause','sm') + (c.paused ? '恢复自动投递回执' : '开启免打扰暂停') + '</button>' : '') +
        (managedEntry && !hasCtrlWorkerTask ? '<button class="ctx-item danger" data-action="releasePane" data-pane="' + esc(c.paneId) + '">' + ic('x','sm') + '移出管控（退回仅观测）</button>' : '') +
      '</div>';
      return;
    }
    const nodeEl = ev.target.closest('.dag-node[data-node-kind="worker"]');
    if (!nodeEl) return;
    ev.preventDefault();
    const w = findWorkerByNodeId(nodeEl.dataset.nodeId);
    if (!w) return;
    document.getElementById('ctx-root').innerHTML = '<div class="ctx-menu" style="left:' + Math.max(12, Math.min(ev.clientX, window.innerWidth - 226)) + 'px;top:' + Math.max(12, Math.min(ev.clientY, window.innerHeight - 290)) + 'px">' +
      '<button class="ctx-item" data-action="openWorker" data-id="' + esc(w.nodeId) + '">' + ic('eye','sm') + '查看详情</button>' +
      (w.paneId && w.status !== 'offline' ? '<button class="ctx-item" data-action="focusPane" data-pane="' + esc(w.paneId) + '">' + ic('locate','sm') + '跳转 Herdr 窗格</button>' : '') +
      (w.status === 'blocked' && w.task ? '<button class="ctx-item" data-action="approveTask" data-id="' + esc(w.task.task) + '">' + ic('check','sm') + '一键批准放行</button>' : '') +
      (w.role ? '<button class="ctx-item" data-action="openSwap" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">' + ic('swap','sm') + '热替换会话 / 模型</button>' : '') +
      (!w.role && w.paneId && w.status !== 'offline' ? '<button class="ctx-item" data-action="openProjectModal" data-pane="' + esc(w.paneId) + '" data-proj="' + esc(w.projectId) + '" data-cwd="' + esc(w.pane?.cwd || '') + '">' + ic('folder','sm') + '切换所属项目...</button>' : '') +
      (!w.role && w.paneId ? '<button class="ctx-item" data-action="openBindPane" data-pane="' + esc(w.paneId) + '" data-proj="' + esc(w.projectId) + '">' + ic('link','sm') + '绑定为项目角色</button>' : '') +
      (w.bindingMode !== 'unbound' ? '<button class="ctx-item" data-action="setPerm" data-target="' + esc(w.task?.task || w.paneId || w.rawRole || w.name) + '" data-perm="auto-workspace" data-kind="' + esc(w.kind) + '">' + ic('shield','sm') + '切为工作区自动</button>' : '') +
      (!w.role && w.paneId && !w.task ? '<button class="ctx-item danger" data-action="releasePane" data-pane="' + esc(w.paneId) + '">' + ic('x','sm') + '移出管控（退回仅观测）</button>' : '') +
      (w.role && w.bindingMode !== 'unbound' ? '<button class="ctx-item danger" data-action="unbindRole" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">' + ic('x','sm') + '解绑当前会话</button>' : '') +
    '</div>';
  };
}
`;
