import { CSS, SVG_SPRITE } from './ui-styles.js';
import { PREVIEW_JS } from './ui-preview.js';
import { DAG_JS } from './ui-dag.js';
import { VIEWS_JS } from './ui-views.js';

export interface UiBootConfig {
  mode: 'live' | 'preview' | 'auth';
  version: string;
  csrfToken?: string;
  defaultRoute?: { socket?: string; session?: string; machine?: string };
  authError?: string;
}

const THEME_BOOT_SCRIPT = `<script>(function(){try{var s=localStorage.getItem('chflow-theme');var t=(s==='dark'||s==='light')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){}})();</script>`;
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><style>path,rect{color:#111317}@media(prefers-color-scheme:dark){path,rect{color:#f3f4f6}}</style><path fill-rule="evenodd" d="M8.5 7H19.5C20.9 7 22 8.1 22 9.5V38.5C22 39.9 20.9 41 19.5 41H8.5C7.1 41 6 39.9 6 38.5V9.5C6 8.1 7.1 7 8.5 7ZM11.4 18.6L16.8 24L11.4 29.4L9.7 27.7L13.4 24L9.7 20.3Z" fill="currentColor"/><path fill-rule="evenodd" d="M28 7H39.5C40.9 7 42 8.1 42 9.5V14.8C42 16.2 40.9 17.3 39.5 17.3H28C26.6 17.3 25.5 16.2 25.5 14.8V9.5C25.5 8.1 26.6 7 28 7ZM36.8 10.7A1.45 1.45 0 1 0 36.8 13.6A1.45 1.45 0 1 0 36.8 10.7Z" fill="currentColor"/><rect x="26.7" y="20.4" width="14.1" height="7.8" rx="2.1" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="29.8" y="23.2" width="5.2" height="2.2" rx="1" fill="currentColor"/><path d="M28 31.3H39.5C40.9 31.3 42 32.4 42 33.8V38.5C42 39.9 40.9 41 39.5 41H28C26.6 41 25.5 39.9 25.5 38.5V33.8C25.5 32.4 26.6 31.3 28 31.3Z" fill="currentColor"/></svg>`;
const FAVICON_LINK = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}">`;

const APP_CORE_TOP = String.raw`
(function(){
'use strict';
const BOOT = window.__CHFLOW_BOOT__ || { mode: 'preview', version: '3.6.1' };
const ic = (name, cls='') => '<svg class="ic ' + cls + '"><use href="#i-' + name + '"/></svg>';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const TERMINAL_STATES = new Set(['succeeded','failed','cancelled']);
const PENDING_QUEUE = new Set(['queued','deferred_user_typing','paused_by_operator','delivering','pending_unreachable']);
const HARNESS_NAMES = { agy: 'Antigravity', claude: 'Claude Code', codex: 'Codex', pi: 'Pi' };
const harnessName = k => HARNESS_NAMES[k] || k || 'Agent';

function defaultWorkspaceMode(kind){
  if (kind === 'agy' || kind === 'claude') return 'accept-edits';
  if (kind === 'codex') return 'workspace-write';
  return '';
}
function workspaceModeOptions(kind){
  if (kind === 'agy') return [
    { id: 'accept-edits', label: '--mode accept-edits', short: 'accept-edits' },
    { id: 'auto', label: '--mode auto', short: 'auto' }
  ];
  if (kind === 'claude') return [
    { id: 'accept-edits', label: 'acceptEdits', short: 'acceptEdits' },
    { id: 'auto', label: 'auto', short: 'auto' }
  ];
  if (kind === 'codex') return [
    { id: 'workspace-write', label: 'workspace-write', short: 'workspace-write' },
    { id: 'approve-for-me', label: '--approve-for-me', short: 'approve-for-me' }
  ];
  return [];
}
function nativeFlagHint(kind, permId, wsMode){
  const wm = wsMode || defaultWorkspaceMode(kind);
  if (kind === 'pi') return permId === 'readonly' ? '--tools read...' : '原生无弹窗';
  if (kind === 'agy'){
    if (permId === 'readonly') return '--mode plan';
    if (permId === 'ask') return '默认询问';
    if (permId === 'auto') return '--mode auto';
    if (permId === 'auto-workspace') return wm === 'auto' ? '--mode auto' : 'accept-edits';
    return 'skip-perms';
  }
  if (kind === 'claude'){
    if (permId === 'readonly') return 'plan';
    if (permId === 'ask') return 'default';
    if (permId === 'auto') return 'auto';
    if (permId === 'auto-workspace') return wm === 'auto' ? 'auto' : 'acceptEdits';
    return 'skip-perms';
  }
  if (kind === 'codex'){
    if (permId === 'readonly') return 'read-only';
    if (permId === 'ask') return 'on-request';
    if (permId === 'auto') return 'approve-for-me';
    if (permId === 'auto-workspace') return wm === 'approve-for-me' ? 'approve-for-me' : 'ws-write';
    return 'bypass-all';
  }
  return permId;
}

function effectivePermMode(kind, perm, nativePerm, wsMode, nativeWsMode){
  const p = perm || 'ask', n = nativePerm || 'unknown';
  if (kind === 'pi'){
    return ((p === 'readonly') !== (n === 'readonly')) ? 'restart_required' : 'native';
  }
  if (p === 'readonly' || n === 'readonly') return n === p ? 'native' : 'restart_required';
  if (p === 'ask') return (n === 'auto' || n === 'auto-workspace' || n === 'yolo') ? 'restart_required' : 'native';
  if (p === 'auto'){
    const autoBase = kind === 'codex' ? 'approve-for-me' : 'auto';
    const isNativeAuto = n === 'auto' || (n === 'auto-workspace' && nativeWsMode === autoBase);
    return isNativeAuto ? 'native' : 'restart_required';
  }
  if (p === 'auto-workspace'){
    const targetBase = wsMode || defaultWorkspaceMode(kind);
    const curBase = n === 'auto-workspace' ? (nativeWsMode || defaultWorkspaceMode(kind))
      : (n === 'auto' ? (kind === 'codex' ? 'approve-for-me' : 'auto') : '');
    return (targetBase && curBase === targetBase) ? 'native' : 'proxy';
  }
  if (p === 'yolo') return n === 'yolo' ? 'native' : 'proxy';
  return 'native';
}

function permModeMeta(kind, perm, nativePerm, backendMode, wsMode, nativeWsMode){
  const mode = backendMode || effectivePermMode(kind, perm, nativePerm, wsMode, nativeWsMode);
  const flagHint = nativeFlagHint(kind, perm, wsMode);
  if (mode === 'native'){
    const note = kind === 'pi'
      ? (perm === 'readonly' ? 'Pi 已以原生只读工具集启动（禁写、禁 shell、禁 MCP）。' : 'Pi 原生无交互审批弹窗（ask / auto / auto-workspace / yolo 运行效果一致）；如需只读隔离，请切至「只读」并重启。')
      : perm === 'auto'
        ? '已由 Harness 原生 Auto（' + flagHint + '）自主审核决策，chflow 不介入代按。'
        : perm === 'auto-workspace'
          ? '底层已以原生底座（' + flagHint + '）运行，同时由 chflow 守卫自动放行权限确认弹窗（避开提问与拒绝项，无命令黑名单）。'
          : '当前进程的原生启动参数与目标权限档位一致。';
    return { mode, label: '原生生效', cls: 'ok', short: '', note, needsRestart: false };
  }
  if (mode === 'proxy'){
    const note = perm === 'yolo'
      ? '运行中零过滤器直通放行（不做命令黑名单与文案限制，仅避开用户提问与防死循环）；如需底层沙箱完全交由 Harness 原生 yolo，可空闲时保留上下文重启。'
      : '运行中由 chflow 自动放行权限确认弹窗（无命令黑名单，避开提问与拒绝项）；目标原生底座（' + flagHint + '）与当前进程不同，可空闲时保留上下文重启原生应用。';
    return {
      mode, label: '代理放行 · 原生待重启', cls: 'head', short: '代理·',
      note,
      needsRestart: true
    };
  }
  let note = '目标权限与当前进程原生启动参数不兼容，运行中无法原地生效，需空闲时保留上下文重启会话。';
  if (kind === 'pi') note = 'Pi 默认无交互审批弹窗，切换或退出「只读」必须保留上下文重启以重新挂载工具集。';
  else if (perm === 'auto') note = '「Harness Auto」完全交由 Harness 自身（' + flagHint + '）审核，chflow 不会用按键代理冒充；请空闲时点击下方按钮保留上下文重启并原生生效。';
  else if (perm === 'readonly') note = '运行中无法原地收紧进程沙箱为只读，请点击下方按钮保留上下文重启并启用原生只读。';
  else if (nativePerm === 'readonly') note = '当前进程以原生只读沙箱启动，按键代理无法突破写保护，需保留上下文重启解除只读。';
  else if (perm === 'ask') note = '进程已以自动放行模式启动，恢复逐项询问需保留上下文重启。';
  return { mode, label: '需重启生效', cls: 'warn', short: '待重启·', note, needsRestart: true };
}

const PERMS = [
  {id:'readonly', zh:'只读', desc:'原生只读/规划模式：仅允许读取与查询，拒绝写入。'},
  {id:'ask', zh:'逐项询问', desc:'交由人工逐项确认，chflow 不自动代按。'},
  {id:'auto', zh:'Harness Auto', desc:'完全交给 Harness 原生 Auto 审核引擎决策（agy/claude --mode auto、codex --approve-for-me），chflow 不代按。'},
  {id:'auto-workspace', zh:'工作区自动', desc:'可选 accept-edits / workspace-write / Harness Auto 原生底座，并由 chflow 自动放行权限确认弹窗（避开提问与拒绝项，无命令黑名单）。'},
  {id:'yolo', zh:'完全放行', desc:'零过滤直通放行（仅避开提问与防死循环），原生重启启用 Harness 全放行模式。'}
];
const ST = {
  working:{label:'运行中', c:'ok'},
  submitted:{label:'运行中', c:'ok'},
  dispatching:{label:'派发中', c:'ok'},
  blocked:{label:'待授权', c:'warn'},
  retrying:{label:'退避重试', c:'retry'},
  scheduled_retry:{label:'定时重试', c:'retry'},
  idle:{label:'空闲', c:'idle'},
  done:{label:'空闲', c:'idle'},
  unbound:{label:'待命', c:'idle'},
  offline:{label:'离线', c:'danger'}
};

function shortPath(p){
  if (!p) return '';
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : String(p);
}
function folderBase(p){
  if (!p) return '';
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(p);
}
const AUTO_ALIAS_RX = /^(?:pi|codex|claude|agy)-[0-9a-f]{6}$/;
function paneTitle(p){
  if (!p) return 'Agent';
  if (p.role) return String(p.role).replace(/^@/, '');
  if (p.display_name && !AUTO_ALIAS_RX.test(p.display_name)) return String(p.display_name).replace(/^@/, '');
  const custom = [p.alias, p.name].find(v => v && v !== p.pane_id && !AUTO_ALIAS_RX.test(v));
  if (custom) return String(custom).replace(/^@/, '');
  const dir = folderBase(p.cwd), h = harnessName(p.kind);
  return dir ? (dir + ' · ' + h) : h;
}
function paneLoc(p){
  if (!p) return '';
  if (p.location_label) return p.location_label;
  const parts = [p.workspace_label, p.tab_label].filter(Boolean);
  if (parts.length) return parts.join(' / ');
  return shortPath(p.cwd);
}
function fmtUptime(startedAt, now){
  if (!startedAt) return '';
  const ms = Math.max(0, (now || Date.now()) - Date.parse(startedAt));
  const m = Math.floor(ms / 60000);
  if (m < 1) return '刚刚启动';
  const h = Math.floor(m / 60);
  return h > 0 ? '已运行 ' + h + ' 小时 ' + (m % 60) + ' 分' : '已运行 ' + m + ' 分钟';
}
function fmtEta(ts, now){
  if (!ts) return '即将重试';
  const sec = Math.max(0, Math.round((ts - (now || Date.now())) / 1000));
  if (sec < 60) return sec + ' 秒后';
  return Math.floor(sec / 60) + ' 分 ' + (sec % 60) + ' 秒后';
}
function fmtClock(ts){
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2,'0')).join(':');
}

const THEME_KEY = 'chflow-theme';
const DAG_STORAGE_KEY = 'chflow-dag-layout-v1';
const AUTO_RESTART_KEY = 'chflow-auto-restart-perm';
function getSavedAutoRestart(){
  try { return localStorage.getItem(AUTO_RESTART_KEY) === '1'; } catch { return false; }
}

function getSavedTheme(){
  try {
    const v = localStorage.getItem(THEME_KEY);
    return (v === 'dark' || v === 'light') ? v : null;
  } catch { return null; }
}
function systemPrefersDark(){
  try { return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  catch { return false; }
}
function applyTheme(theme, persist){
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  if (persist){
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  }
}
applyTheme(getSavedTheme() || (systemPrefersDark() ? 'dark' : 'light'), false);
try {
  const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (mq && mq.addEventListener){
    mq.addEventListener('change', ev => {
      if (!getSavedTheme()){
        applyTheme(ev.matches ? 'dark' : 'light', false);
        renderTopbar();
      }
    });
  }
} catch {}

function loadDagPersist(){
  try {
    const raw = localStorage.getItem(DAG_STORAGE_KEY);
    if (!raw) return { offsets: {}, laneOffsets: {}, laneSizes: {} };
    const parsed = JSON.parse(raw);
    return {
      offsets: parsed && typeof parsed.offsets === 'object' ? parsed.offsets : {},
      laneOffsets: parsed && typeof parsed.laneOffsets === 'object' ? parsed.laneOffsets : {},
      laneSizes: parsed && typeof parsed.laneSizes === 'object' ? parsed.laneSizes : {}
    };
  } catch { return { offsets: {}, laneOffsets: {}, laneSizes: {} }; }
}
function saveDagPersist(){
  try {
    localStorage.setItem(DAG_STORAGE_KEY, JSON.stringify({
      offsets: state.dag.offsets,
      laneOffsets: state.dag.laneOffsets,
      laneSizes: state.dag.laneSizes
    }));
  } catch {}
}

const persistedDag = loadDagPersist();
const state = {
  snap: BOOT.mode === 'preview' ? makePreviewSnapshot() : null,
  connected: BOOT.mode === 'preview',
  daemonStopped: false,
  stopReason: null,
  project: 'all',
  tab: 'work',
  workMode: 'dag',
  projMenuOpen: false,
  focusCollapsed: false,
  autoRestartPerm: getSavedAutoRestart(),
  drawer: null,
  fileCache: {},
  fileInFlight: {},
  lastFileSeq: 0,
  dag: { tx: 24, ty: 14, scale: 0.85, offsets: persistedDag.offsets, laneOffsets: persistedDag.laneOffsets, laneSizes: persistedDag.laneSizes, fitted: false, expanded: false },
  lastLayout: null
};

let es = null, reconnectTimer = null, reconnectDelay = 1200;

function toast(msg, isErr){
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.innerHTML = ic(isErr ? 'alert' : 'check','sm') + '<span>' + esc(msg) + '</span>';
  const box = document.getElementById('toasts');
  if (box){ box.appendChild(el); setTimeout(() => el.remove(), 3200); }
}

async function apiAction(action, target, opts){
  if (BOOT.mode === 'preview') return handlePreviewAction(action, target, opts || {});
  const res = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Chflow-Token': BOOT.csrfToken || '' },
    body: JSON.stringify({ action, target, opts: opts || {} })
  });
  const body = await res.json().catch(() => ({ ok: false, error: { message: 'HTTP ' + res.status } }));
  if (!res.ok || !body.ok){
    const err = new Error(body.error?.message || ('请求失败 (' + res.status + ')'));
    err.code = body.error?.code;
    throw err;
  }
  return body.data;
}

async function loadTaskFile(taskId, kind, turn, force){
  const key = taskId + ':' + kind + (kind === 'diag' ? '' : ':' + turn);
  if (BOOT.mode === 'preview'){
    state.fileCache[key] = PREVIEW_FILES[key] || '（示例文件暂无更多正文）';
    return state.fileCache[key];
  }
  if (!force && state.fileCache[key] !== undefined) return state.fileCache[key];
  if (state.fileInFlight[key]) return state.fileInFlight[key];
  const q = kind === 'diag' ? 'kind=diag' : 'kind=' + encodeURIComponent(kind) + '&turn=' + encodeURIComponent(String(turn));
  state.fileInFlight[key] = (async () => {
    try {
      const res = await fetch('/api/tasks/' + encodeURIComponent(taskId) + '/file?' + q);
      const body = await res.json();
      state.fileCache[key] = body.ok ? (body.data?.exists ? (body.data.content || '（文件为空）') : '（尚未生成该文件）') : ('读取失败：' + (body.error?.message || ''));
    } catch (e){
      state.fileCache[key] = '读取失败：' + (e.message || e);
    } finally {
      delete state.fileInFlight[key];
    }
    renderDrawer();
    return state.fileCache[key];
  })();
  return state.fileInFlight[key];
}

function refreshOpenDrawerFiles(){
  if (!state.drawer || state.drawer.kind !== 'worker') return;
  const w = findWorkerByNodeId(state.drawer.nodeId);
  if (!w) return;
  if (state.drawer.tab === 'mail'){
    const list = tasksForWorker(w);
    const mailTask = list.find(t => t.task === state.drawer.taskId) || w.task || list[0];
    if (!mailTask) return;
    const maxTurn = Math.max(1, Number(mailTask.turn || 1));
    const curTurn = Math.min(maxTurn, Math.max(1, Number(state.drawer.turn || maxTurn)));
    void loadTaskFile(mailTask.task, 'brief', curTurn, true);
    void loadTaskFile(mailTask.task, 'out', curTurn, true);
  } else if (state.drawer.tab === 'overview' && w.status === 'blocked' && w.task){
    void loadTaskFile(w.task.task, 'diag', w.task.turn || 1, true);
  }
}

async function connectLive(){
  if (BOOT.mode !== 'live') return;
  clearTimeout(reconnectTimer);
  if (es){ es.close(); es = null; }
  state.daemonStopped = false;
  state.stopReason = null;
  try {
    const res = await fetch('/api/snapshot');
    const body = await res.json();
    if (body.ok && body.data){ state.snap = body.data; state.connected = true; render(); }
  } catch { state.connected = false; render(); }

  es = new EventSource('/api/events');
  es.addEventListener('snapshot', ev => {
    try {
      const next = JSON.parse(ev.data);
      const prevSeq = state.snap?.seq || 0;
      state.snap = next;
      state.connected = true;
      state.daemonStopped = false;
      reconnectDelay = 1200;
      if (next.seq > prevSeq && next.seq !== state.lastFileSeq){
        state.lastFileSeq = next.seq;
        render();
        refreshOpenDrawerFiles();
        return;
      }
      render();
    } catch {}
  });
  es.addEventListener('shutdown', ev => {
    let reason = 'manual';
    try { reason = JSON.parse(ev.data || '{}').reason || 'manual'; } catch {}
    state.daemonStopped = true;
    state.stopReason = reason;
    state.connected = false;
    state.drawer = null;
    if (es){ es.close(); es = null; }
    clearTimeout(reconnectTimer);
    render();
  });
  es.onerror = () => {
    if (state.daemonStopped) return;
    state.connected = false;
    if (es){ es.close(); es = null; }
    render();
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(10000, Math.round(reconnectDelay * 1.5));
      connectLive();
    }, reconnectDelay);
  };
}

function getSnap(){ return state.snap || { projects: [], roles: [], global_roles: [], managed_panes: [], unmanaged_live_agents: [], controller_views: [], tasks: [], queue: [], scheduled_retries: [], paused_recipients: [], audit: [], daemon: {} }; }
function visibleProjects(){
  const list = getSnap().projects || [];
  return state.project === 'all' ? list : list.filter(p => p.project_id === state.project);
}
function projectName(pid){
  return (getSnap().projects || []).find(p => p.project_id === pid)?.name || pid || 'default';
}
function findPaneMeta(paneId){
  if (!paneId) return null;
  const snap = getSnap();
  return (snap.managed_panes || []).find(p => p.pane_id === paneId) || (snap.unmanaged_live_agents || []).find(a => a.pane_id === paneId) || null;
}
function taskForRole(r){
  const tasks = getSnap().tasks || [];
  if (r.active_task){
    const hit = tasks.find(t => t.task === r.active_task);
    if (hit) return hit;
  }
  return tasks.find(t => t.project_id === r.project_id && t.role === r.role && !TERMINAL_STATES.has(t.state));
}
function taskForPane(p){
  return (getSnap().tasks || []).find(t => (t.pane_id === p.pane_id || t.pane === p.pane_id) && !TERMINAL_STATES.has(t.state));
}
function tasksForWorker(w){
  const tasks = getSnap().tasks || [];
  const list = tasks.filter(t => {
    if (w.task && t.task === w.task.task) return true;
    if (w.role && t.project_id === w.projectId && t.role === w.role.role) return true;
    if (w.paneId && (t.pane_id === w.paneId || t.pane === w.paneId)) return true;
    return false;
  });
  return list.slice().sort((a, b) => {
    const aAct = !TERMINAL_STATES.has(a.state) ? 1 : 0;
    const bAct = !TERMINAL_STATES.has(b.state) ? 1 : 0;
    if (aAct !== bAct) return bAct - aAct;
    return Number(b.startedAt || 0) - Number(a.startedAt || 0);
  });
}
function roleDisplayStatus(r, task){
  if (r.binding_mode === 'unbound') return 'unbound';
  if (r.binding_mode === 'pane' && r.live === false) return 'offline';
  if (task){
    if (task.state === 'blocked') return 'blocked';
    if (task.state === 'scheduled_retry') return 'scheduled_retry';
    if (task.state === 'retrying') return 'retrying';
    if (task.state === 'submitted' || task.state === 'dispatching') return 'working';
  }
  return r.agent_status || 'idle';
}
function paneDisplayStatus(p, task){
  if (p.live === false) return 'offline';
  if (task){
    if (task.state === 'blocked') return 'blocked';
    if (task.state === 'scheduled_retry') return 'scheduled_retry';
    if (task.state === 'retrying') return 'retrying';
    if (task.state === 'submitted' || task.state === 'dispatching') return 'working';
  }
  return p.agent_status || 'idle';
}

function buildProjectWorkers(projectId){
  const snap = getSnap();
  const project = (snap.projects || []).find(p => p.project_id === projectId);
  const ctrlIds = new Set(project?.controllers || []);
  for (const r of (snap.roles || []).filter(x => x.project_id === projectId)) if (r.controller?.pane) ctrlIds.add(r.controller.pane);
  for (const t of (snap.tasks || []).filter(x => x.project_id === projectId && !TERMINAL_STATES.has(x.state))) if (t.controller?.pane) ctrlIds.add(t.controller.pane);

  const items = [];
  const boundPanes = new Set();
  const seenTasks = new Set();

  for (const r of (snap.roles || []).filter(x => x.project_id === projectId)){
    const task = taskForRole(r);
    const pm = r.pane_id ? findPaneMeta(r.pane_id) : null;
    if (r.pane_id) boundPanes.add(r.pane_id);
    if (task) seenTasks.add(task.task);
    const wKind = task?.kind || r.kind || r.default_kind || 'codex';
    const wPerm = task?.perm || r.perm || r.default_perm || 'ask';
    const wNative = r.native_perm || pm?.native_perm || (r.binding_mode === 'headless' ? wPerm : 'unknown');
    const wWsMode = r.workspace_mode || pm?.workspace_mode || task?.launch?.workspace_mode || defaultWorkspaceMode(wKind);
    const wNativeWs = r.native_workspace_mode || pm?.native_workspace_mode || (r.binding_mode === 'headless' ? wWsMode : undefined);
    items.push({
      nodeId: 'role:' + r.project_id + ':' + r.role,
      itemKind: 'role',
      isRole: true,
      name: r.role,
      rawRole: r.role,
      desc: r.description || (r.binding_mode === 'headless' ? '无头角色槽位' : '项目稳定角色'),
      location: pm ? paneLoc(pm) : '',
      projectId: r.project_id,
      status: roleDisplayStatus(r, task),
      perm: wPerm,
      nativePerm: wNative,
      workspaceMode: wWsMode,
      nativeWorkspaceMode: wNativeWs,
      permMode: r.perm_mode || pm?.perm_mode || effectivePermMode(wKind, wPerm, wNative, wWsMode, wNativeWs),
      pendingRestart: r.pending_restart || pm?.pending_restart || null,
      restarting: Boolean(r.restarting || pm?.restarting),
      lastRestartError: r.last_restart_error || pm?.last_restart_error || null,
      kind: wKind,
      model: r.model || r.default_model || '',
      bindingMode: r.binding_mode,
      paneId: r.pane_id,
      controllerPane: task?.controller?.pane || r.controller?.pane || null,
      task, role: r
    });
  }

  for (const p of (snap.managed_panes || []).filter(x => x.project_id === projectId && !x.role && !boundPanes.has(x.pane_id))){
    const task = taskForPane(p);
    // Avoid duplicating a live controller pane in the temporary worker column when it has no worker task
    if (!task && (p.is_controller || ctrlIds.has(p.pane_id))) continue;
    if (task) seenTasks.add(task.task);
    const pKind = p.kind || 'codex';
    const pPerm = task?.perm || p.perm || 'ask';
    const pNative = p.native_perm || 'unknown';
    const pWsMode = p.workspace_mode || task?.launch?.workspace_mode || defaultWorkspaceMode(pKind);
    const pNativeWs = p.native_workspace_mode;
    items.push({
      nodeId: 'pane:' + p.pane_id,
      itemKind: 'pane',
      isRole: false,
      name: paneTitle(p),
      desc: p.adopted ? '临时受管工位 · 已接入控制面' : '临时受管工位',
      location: paneLoc(p),
      projectId: p.project_id,
      status: paneDisplayStatus(p, task),
      perm: pPerm,
      nativePerm: pNative,
      workspaceMode: pWsMode,
      nativeWorkspaceMode: pNativeWs,
      permMode: p.perm_mode || effectivePermMode(pKind, pPerm, pNative, pWsMode, pNativeWs),
      pendingRestart: p.pending_restart || null,
      restarting: Boolean(p.restarting),
      lastRestartError: p.last_restart_error || null,
      kind: pKind,
      model: p.model || '',
      bindingMode: 'pane',
      paneId: p.pane_id,
      controllerPane: task?.controller?.pane || p.controller?.pane || null,
      task, pane: p
    });
  }

  for (const t of (snap.tasks || []).filter(x => x.project_id === projectId && !TERMINAL_STATES.has(x.state) && !seenTasks.has(x.task))){
    const pm = t.pane_id || t.pane ? findPaneMeta(t.pane_id || t.pane) : null;
    const tKind = t.kind || 'codex';
    const tPerm = t.perm || 'ask';
    const tNative = pm?.native_perm || (t.mode === 'headless' ? tPerm : 'unknown');
    items.push({
      nodeId: 'task:' + t.task,
      itemKind: 'task',
      isRole: Boolean(t.role),
      name: t.role ? t.role : (pm ? paneTitle(pm) : (t.name || t.task)),
      desc: t.mode === 'headless' ? '一次性无头任务' : '活跃任务',
      location: pm ? paneLoc(pm) : '',
      projectId: t.project_id,
      status: t.state === 'submitted' ? 'working' : t.state,
      perm: tPerm,
      nativePerm: tNative,
      permMode: pm?.perm_mode || effectivePermMode(tKind, tPerm, tNative),
      kind: tKind,
      model: '',
      bindingMode: t.mode === 'headless' ? 'headless' : 'pane',
      paneId: t.pane_id || t.pane,
      controllerPane: t.controller?.pane || null,
      task: t
    });
  }

  return items;
}

function buildProjectControllers(project, workers){
  const snap = getSnap();
  const views = (snap.controller_views || []).filter(v => v.project_id === project.project_id);
  const viewByPane = new Map(views.map(v => [v.pane_id, v]));
  const ids = new Set([...views.map(v => v.pane_id), ...(project.controllers || [])]);
  for (const w of workers) if (w.controllerPane) ids.add(w.controllerPane);
  const pausedSet = new Set(snap.paused_recipients || []);
  const activeTasks = (snap.tasks || []).filter(t => t.project_id === project.project_id && !TERMINAL_STATES.has(t.state));

  const out = [];
  for (const paneId of ids){
    const cv = viewByPane.get(paneId);
    const info = findPaneMeta(paneId);
    const managedEntry = (snap.managed_panes || []).find(p => p.pane_id === paneId);
    const live = cv ? Boolean(cv.live) : Boolean(info && info.live !== false);
    const queued = (snap.queue || []).filter(q => PENDING_QUEUE.has(q.state) && q.recipient?.pane === paneId);
    const ownedWorkers = workers.filter(w => w.controllerPane === paneId);
    const ownedRolesCount = cv?.managed_roles_count ?? ownedWorkers.filter(w => w.itemKind === 'role').length;
    const ownedTempCount = cv?.managed_workers_count ?? ownedWorkers.filter(w => w.itemKind !== 'role').length;
    const ownedTasks = activeTasks.filter(t => t.controller?.pane === paneId);
    const activeCount = cv?.active_tasks_count ?? ownedTasks.length;
    const blockedCount = cv?.blocked_tasks_count ?? ownedTasks.filter(t => t.state === 'blocked').length;
    const queuedCount = cv?.queued_count ?? queued.length;
    const hasActiveWork = queuedCount > 0 || activeCount > 0 || ownedWorkers.some(w => w.status !== 'unbound' && w.status !== 'offline');
    if (!live && !hasActiveWork) continue;

    const typing = cv?.typing ?? queued.some(q => q.state === 'deferred_user_typing');
    const paused = cv?.paused ?? pausedSet.has(paneId);
    const kind = cv?.kind || info?.kind || 'agent';
    const managed = cv?.managed ?? Boolean(managedEntry);
    const perm = cv?.perm || managedEntry?.perm || undefined;
    const nativePerm = cv?.native_perm || managedEntry?.native_perm || (managed ? 'unknown' : undefined);
    const workspaceMode = cv?.workspace_mode || managedEntry?.workspace_mode || defaultWorkspaceMode(kind);
    const nativeWorkspaceMode = cv?.native_workspace_mode || managedEntry?.native_workspace_mode;
    const permMode = cv?.perm_mode || (managed && perm ? effectivePermMode(kind, perm, nativePerm, workspaceMode, nativeWorkspaceMode) : undefined);
    const name = (cv?.display_name && !AUTO_ALIAS_RX.test(cv.display_name)) ? cv.display_name : (info ? paneTitle(info) : ('主控 ' + String.fromCharCode(65 + out.length)));

    out.push({
      nodeId: 'ctrl:' + project.project_id + ':' + paneId,
      paneId, projectId: project.project_id,
      live, name, kind,
      model: cv?.model || managedEntry?.model || '',
      effort: cv?.effort || managedEntry?.effort || '',
      cwd: cv?.cwd || info?.cwd || project.root || '',
      location: cv?.location_label || (info ? paneLoc(info) : ''),
      status: live ? (cv?.agent_status || info?.agent_status || 'idle') : 'offline',
      managed, perm, nativePerm, workspaceMode, nativeWorkspaceMode, permMode,
      pendingRestart: cv?.pending_restart || managedEntry?.pending_restart || null,
      restarting: Boolean(cv?.restarting || managedEntry?.restarting),
      lastRestartError: cv?.last_restart_error || managedEntry?.last_restart_error || null,
      typing, paused, queuedCount,
      managedRolesCount: ownedRolesCount,
      managedWorkersCount: ownedTempCount,
      activeTasksCount: activeCount,
      blockedTasksCount: blockedCount
    });
  }
  return out;
}

function allVisibleWorkers(){
  return visibleProjects().flatMap(p => buildProjectWorkers(p.project_id));
}
`;

const APP_CORE_BOTTOM = String.raw`
function render(){
  renderTopbar();
  renderFocus();
  renderToolbar();
  const view = document.getElementById('view');
  if (state.tab === 'work'){
    view.innerHTML = state.workMode === 'dag' ? renderDagView() : renderCardsView();
    if (state.workMode === 'dag'){
      if (!state.dag.fitted){
        const shell = document.getElementById('dag-shell');
        const layout = state.lastLayout || computeDagLayout();
        const firstLane = layout.lanes[0];
        if (firstLane && shell){
          const sw = (shell.clientWidth || 1440) - 36, sh = (shell.clientHeight || 620) - 36;
          const tw = firstLane.w + 36, th = firstLane.h + 36;
          const s = Math.min(1.04, Math.max(0.72, Math.min(sw / tw, sh / th)));
          state.dag.scale = s;
          state.dag.tx = Math.max(16, Math.round((sw + 36 - tw * s) / 2));
          state.dag.ty = 8;
          state.dag.fitted = true;
          const stage = document.getElementById('dag-stage');
          if (stage) stage.style.transform = 'translate(' + state.dag.tx + 'px,' + state.dag.ty + 'px) scale(' + state.dag.scale + ')';
          const zv = document.getElementById('dag-zoom-val');
          if (zv) zv.textContent = Math.round(state.dag.scale * 100) + '%';
        }
      }
      bindDagInteractions();
    }
  } else if (state.tab === 'queue'){
    view.innerHTML = renderQueueView();
  } else {
    view.innerHTML = renderAuditView();
  }
  renderDrawer();
}

document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  const ctxRoot = document.getElementById('ctx-root');
  if (ctxRoot && ctxRoot.innerHTML){ ctxRoot.innerHTML = ''; return; }
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot && modalRoot.innerHTML){ closeModal(); return; }
  if (state.projMenuOpen){ state.projMenuOpen = false; renderTopbar(); return; }
  if (state.drawer){ state.drawer = null; render(); return; }
  if (state.dag.expanded){ state.dag.expanded = false; state.dag.fitted = false; render(); }
});

document.addEventListener('click', async ev => {
  if (!ev.target.closest('.ctx-menu')) document.getElementById('ctx-root').innerHTML = '';
  if (!ev.target.closest('.proj-wrap') && state.projMenuOpen){ state.projMenuOpen = false; renderTopbar(); }
  if (ev.target && ev.target.dataset && ev.target.dataset.backdrop === 'modal'){ closeModal(); return; }

  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action, id = btn.dataset.id;

  try {
    if (act === 'toggleProjMenu'){ state.projMenuOpen = !state.projMenuOpen; renderTopbar(); }
    else if (act === 'selectProject'){ state.project = id; state.projMenuOpen = false; state.dag.fitted = false; render(); }
    else if (act === 'toggleTheme'){ applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true); renderTopbar(); }
    else if (act === 'toggleFocus'){ state.focusCollapsed = !state.focusCollapsed; state.dag.fitted = false; render(); }
    else if (act === 'goTab'){ state.tab = id; render(); }
    else if (act === 'setWorkMode'){ state.workMode = id; render(); }
    else if (act === 'openWorker'){ state.drawer = { kind: 'worker', nodeId: id, tab: 'overview' }; render(); }
    else if (act === 'openCtrl'){ state.drawer = { kind: 'ctrl', nodeId: id, tab: 'overview' }; render(); }
    else if (act === 'openTask'){
      const w = allVisibleWorkers().find(x => x.task?.task === id);
      if (w){ state.drawer = { kind: 'worker', nodeId: w.nodeId, tab: 'overview' }; render(); }
    }
    else if (act === 'closeDrawer'){ state.drawer = null; render(); }
    else if (act === 'drawerTab'){
      if (state.drawer){
        state.drawer.tab = btn.dataset.tab;
        renderDrawer();
        if (btn.dataset.tab === 'mail') refreshOpenDrawerFiles();
      }
    }
    else if (act === 'drawerTurn'){
      if (state.drawer){
        if (btn.dataset.task) state.drawer.taskId = btn.dataset.task;
        state.drawer.turn = Number(btn.dataset.turn);
        renderDrawer();
        refreshOpenDrawerFiles();
      }
    }
    else if (act === 'refreshMail'){
      const tId = btn.dataset.task, tr = Number(btn.dataset.turn || 1);
      await Promise.all([loadTaskFile(tId, 'brief', tr, true), loadTaskFile(tId, 'out', tr, true)]);
      renderDrawer();
      toast('信箱内容已刷新');
    }
    else if (act === 'focusPane'){ await apiAction('focus_pane', btn.dataset.pane, {}); toast('已切换 Herdr 焦点至目标窗格'); }
    else if (act === 'copyText'){
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(btn.dataset.text || '');
      toast('已复制编号：' + (btn.dataset.text || ''));
    }
    else if (act === 'approveTask'){ await apiAction('terminal_control', id, { keys: ['enter'] }); toast('已发送 Enter 放行 ' + id); }
    else if (act === 'denyTask'){ await apiAction('terminal_control', id, { keys: ['esc'] }); toast('已发送 Esc 拒绝 ' + id); }
    else if (act === 'sendKey'){ await apiAction('terminal_control', btn.dataset.target, { keys: [btn.dataset.key] }); toast('已发送按键 ' + btn.dataset.key); }
    else if (act === 'sendTermText'){
      const input = document.getElementById('term-text-input');
      const txt = (input?.value || '').trim();
      if (!txt) return;
      await apiAction('terminal_control', btn.dataset.target, { text: txt, submit_key: 'enter' });
      input.value = ''; toast('已向终端发送文本');
    }
    else if (act === 'toggleAutoRestartPerm'){
      state.autoRestartPerm = !state.autoRestartPerm;
      try { localStorage.setItem(AUTO_RESTART_KEY, state.autoRestartPerm ? '1' : '0'); } catch {}
      renderDrawer();
      toast(state.autoRestartPerm ? '已开启：切权限时若需原生重启将自动执行或预约空闲重启' : '已关闭：切权限后改为手动点击重启');
    }
    else if (act === 'setPerm'){
      const pTarget = btn.dataset.target, permVal = btn.dataset.perm, pKind = btn.dataset.kind || '', pNative = btn.dataset.native || 'unknown';
      const wsMode = btn.dataset.wsMode || (permVal === 'auto-workspace' ? (btn.dataset.curWs || defaultWorkspaceMode(pKind)) : undefined);
      const nativeWs = btn.dataset.nativeWs || undefined;
      const isHeadless = btn.dataset.headless === '1';
      if (btn.dataset.adoptFirst === '1'){
        await apiAction('adopt', pTarget, { perm: permVal, ...(wsMode ? { workspace_mode: wsMode } : {}), ...(pKind === 'agy' ? { attended: true } : {}) });
      }
      const pm = permModeMeta(pKind, permVal, pNative, undefined, wsMode, nativeWs);
      const wantAuto = Boolean(state.autoRestartPerm && !isHeadless && pm.needsRestart);
      const res = await apiAction('set_perm', pTarget, { perm: permVal, ...(wsMode ? { workspace_mode: wsMode } : {}), ...(wantAuto ? { auto_restart: true } : {}) });
      if (wantAuto && res?.scheduled_restart) toast('已记录目标权限 (' + permVal + ')，已预约空闲后自动重启');
      else if (wantAuto) toast('正在自动保留上下文重启以应用原生权限 (' + permVal + ')...');
      else toast(pm.mode === 'proxy' ? ('已启用代理放行 (' + permVal + ')；原生参数需重启生效') : pm.mode === 'restart_required' ? ('已记录目标权限 (' + permVal + ')，请点击重启或预约空闲自动重启') : ('权限已切换为 ' + permVal + (wsMode ? ' (' + wsMode + ')' : '')));
    }
    else if (act === 'setWorkspaceMode'){
      const pTarget = btn.dataset.target, wsMode = btn.dataset.wsMode, pKind = btn.dataset.kind || '', pNative = btn.dataset.native || 'unknown', nativeWs = btn.dataset.nativeWs || undefined;
      const isHeadless = btn.dataset.headless === '1';
      const pm = permModeMeta(pKind, 'auto-workspace', pNative, undefined, wsMode, nativeWs);
      const wantAuto = Boolean(state.autoRestartPerm && !isHeadless && pm.needsRestart);
      const res = await apiAction('set_perm', pTarget, { perm: 'auto-workspace', workspace_mode: wsMode, ...(wantAuto ? { auto_restart: true } : {}) });
      if (wantAuto && res?.scheduled_restart) toast('已设定工作区底座 ' + wsMode + '，已预约空闲后自动重启');
      else if (wantAuto) toast('正在自动重启以应用工作区原生底座 ' + wsMode + '...');
      else toast(pm.mode === 'native' ? ('工作区原生底座已对齐：' + wsMode) : ('已设定工作区原生底座为 ' + wsMode + '（重启后生效）'));
    }
    else if (act === 'restartApplyPerm'){
      const paneId = btn.dataset.pane, permVal = btn.dataset.perm, pKind = btn.dataset.kind || '', wsMode = btn.dataset.wsMode || undefined;
      toast('正在保留上下文安全重启并应用原生权限 ' + permVal + '...');
      try {
        await apiAction('switch', paneId, { perm: permVal, ...(wsMode && permVal === 'auto-workspace' ? { workspace_mode: wsMode } : {}), restart: true, allow_last: true, ...(pKind === 'agy' ? { attended: true } : {}) });
        toast('已保留上下文重启并原生生效：' + permVal + (wsMode && permVal === 'auto-workspace' ? ' (' + wsMode + ')' : ''));
      } catch (e) {
        if (e && e.code === 'restart_rolled_back') toast('新权限启动失败，已自动回退恢复原会话', true);
        else throw e;
      }
    }
    else if (act === 'scheduleAutoRestart'){
      const paneId = btn.dataset.pane, permVal = btn.dataset.perm, pKind = btn.dataset.kind || '', wsMode = btn.dataset.wsMode || undefined;
      const res = await apiAction('switch', paneId, { perm: permVal, ...(wsMode && permVal === 'auto-workspace' ? { workspace_mode: wsMode } : {}), restart: true, auto_restart: true, allow_last: true, ...(pKind === 'agy' ? { attended: true } : {}) });
      toast(res?.scheduled_restart ? ('已预约空闲后自动重启 → ' + permVal) : ('已保留上下文重启并原生生效：' + permVal));
    }
    else if (act === 'cancelRestart'){
      await apiAction('cancel_restart', btn.dataset.pane, {});
      toast('已取消空闲自动重启预约');
    }
    else if (act === 'forceRestartApplyPerm'){
      openForceRestartModal(btn.dataset.pane, btn.dataset.perm, btn.dataset.kind || '', btn.dataset.wsMode || '');
    }
    else if (act === 'confirmForceRestart'){
      const paneId = btn.dataset.pane, permVal = btn.dataset.perm, pKind = btn.dataset.kind || '', wsMode = btn.dataset.wsMode || undefined;
      closeModal();
      toast('正在强制中断并重启会话以应用原生权限 ' + permVal + '...');
      try {
        await apiAction('switch', paneId, { perm: permVal, ...(wsMode && permVal === 'auto-workspace' ? { workspace_mode: wsMode } : {}), restart: true, force: true, allow_last: true, ...(pKind === 'agy' ? { attended: true } : {}) });
        toast('强制中断重启成功，已原生生效：' + permVal + (wsMode && permVal === 'auto-workspace' ? ' (' + wsMode + ')' : ''));
      } catch (e) {
        if (e && e.code === 'restart_rolled_back') toast('强制重启后新权限启动失败，已自动回退原会话', true);
        else throw e;
      }
    }
    else if (act === 'finishTask'){ await apiAction('finish', id, { ok: true }); toast('任务 ' + id + ' 已验收结单'); }
    else if (act === 'cancelTask'){ await apiAction('cancel', id, {}); toast('已取消任务 ' + id); }
    else if (act === 'unbindRole'){ await apiAction('role_unbind', btn.dataset.role, { project: btn.dataset.proj }); toast('已解绑角色 ' + btn.dataset.role); }
    else if (act === 'removeRole'){ await apiAction('role_remove', btn.dataset.role, { project: btn.dataset.proj }); state.drawer = null; toast('已移除角色 ' + btn.dataset.role); }
    else if (act === 'pushQueue'){ await apiAction('queue_deliver_now', undefined, { event_id: id }); toast('已立即强推回执'); }
    else if (act === 'consumeQueue'){ await apiAction('queue_consume', undefined, { event_id: id }); toast('已标记仅阅消费'); }
    else if (act === 'dropQueue'){ await apiAction('queue_drop', undefined, { event_id: id }); toast('已丢弃该回执'); }
    else if (act === 'cancelRetry'){ await apiAction('cancel_retry', id, {}); toast('已取消重试计划'); }
    else if (act === 'pauseRecipient'){ await apiAction('queue_pause', btn.dataset.pane, {}); toast('已暂停自动投递'); }
    else if (act === 'resumeRecipient'){ await apiAction('queue_resume', btn.dataset.pane, {}); toast('已恢复自动投递'); }
    else if (act === 'flushPane'){ await apiAction('flush', btn.dataset.pane, {}); toast('已消费候投队列'); }
    else if (act === 'adoptPane'){ await apiAction('adopt', btn.dataset.pane, { project: btn.dataset.proj || undefined }); toast('已接入受管工位（可派发任务与调整权限）'); }
    else if (act === 'releasePane'){ await apiAction('release_pane', btn.dataset.pane, {}); state.drawer = null; toast('已移出受管列表（Herdr 终端保持运行）'); }
    else if (act === 'openBindPane'){ openBindPaneModal(btn.dataset.pane, btn.dataset.proj); }
    else if (act === 'confirmBindPane'){
      const raw = document.getElementById('bp-role')?.value || '';
      if (!raw) return;
      const parsed = JSON.parse(raw);
      await apiAction('role_bind', parsed.role, { project: parsed.project || undefined, pane: btn.dataset.pane });
      closeModal(); toast('已绑定至角色 ' + parsed.role);
    }
    else if (act === 'pruneNow'){ const res = await apiAction('prune', undefined, { tasks: true }); toast('清理完成：窗格 ' + (res?.pruned_panes || 0) + '，归档任务 ' + (res?.pruned_tasks || 0)); }
    else if (act === 'openStopModal'){ openStopModal(); }
    else if (act === 'confirmStopDaemon'){
      closeModal();
      await apiAction('daemon_stop', undefined, { force: btn.dataset.force === '1' });
      state.daemonStopped = true; state.stopReason = 'manual'; state.drawer = null;
      if (es){ es.close(); es = null; }
      toast('Daemon 服务已停止'); render();
    }
    else if (act === 'reconnect'){
      if (BOOT.mode === 'preview'){ state.daemonStopped = false; state.stopReason = null; toast('已恢复预览'); render(); }
      else { toast('正在尝试重新连接...'); void connectLive(); }
    }
    else if (act === 'openSwap'){ openSwapModal(btn.dataset.role, btn.dataset.proj); }
    else if (act === 'confirmSwap'){
      const mode = document.getElementById('sw-mode').value;
      const opts = { project: btn.dataset.proj, kind: document.getElementById('sw-kind').value };
      const closeOldEl = document.getElementById('sw-close-old');
      if (mode !== 'headless' && closeOldEl?.checked) opts.close_old = true;
      const m = document.getElementById('sw-model').value.trim();
      if (m) opts.model = m;
      if (mode === 'headless') opts.headless = true;
      else if (mode === 'pane') opts.pane = document.getElementById('sw-pane').value;
      else { opts.spawn = true; if (opts.kind === 'agy') opts.attended = true; }
      await apiAction('role_bind', btn.dataset.role, opts);
      closeModal(); toast('角色 ' + btn.dataset.role + ' 热替换完成');
    }
    else if (act === 'openNewRole'){ openNewRoleModal(); }
    else if (act === 'fillGlobalTemplate'){
      const g = (getSnap().global_roles || []).find(x => x.role === btn.dataset.role);
      if (g){
        const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
        setVal('nr-name', g.role); setVal('nr-desc', g.description || '');
        setVal('nr-kind', g.default_kind || 'codex'); setVal('nr-perm', g.default_perm || 'auto-workspace');
        setVal('nr-model', g.default_model || '');
        const wt = document.getElementById('nr-wt'); if (wt) wt.checked = !!g.worktree;
      }
    }
    else if (act === 'confirmNewRole'){
      const name = (document.getElementById('nr-name').value || '').trim();
      if (!name){ toast('请输入角色名', true); return; }
      const isGlobal = !!document.getElementById('nr-global')?.checked;
      const opts = { kind: document.getElementById('nr-kind').value, perm: document.getElementById('nr-perm').value };
      if (isGlobal) opts.global = true;
      else { const proj = document.getElementById('nr-proj').value; if (proj) opts.project = proj; }
      const desc = document.getElementById('nr-desc').value.trim();
      const model = document.getElementById('nr-model').value.trim();
      if (desc) opts.desc = desc;
      if (model) opts.model = model;
      if (document.getElementById('nr-wt').checked) opts.worktree = true;
      await apiAction('role_set', name, opts);
      closeModal(); toast(isGlobal ? ('已保存全局角色模板 ' + name) : ('已创建项目角色 ' + name));
    }
    else if (act === 'openDispatch'){ openDispatchModal(btn.dataset.target, btn.dataset.proj, btn.dataset.task); }
    else if (act === 'confirmDispatch'){
      const raw = document.getElementById('dp-target').value;
      const brief = (document.getElementById('dp-brief').value || '').trim();
      const taskId = (document.getElementById('dp-task')?.value || '').trim();
      if (!raw || !brief){ toast('请选择目标并填写任务正文', true); return; }
      const sel = JSON.parse(raw);
      const opts = { brief };
      if (taskId) opts.task = taskId;
      if (sel.project) opts.project = sel.project;
      if ((sel.kind === 'role' || sel.kind === 'global_role') && document.getElementById('dp-spawn').checked) opts.spawn = true;
      const res = await apiAction('send', sel.target, opts);
      if (state.drawer?.kind === 'worker'){
        state.drawer.taskId = res?.task || taskId || undefined;
        state.drawer.turn = undefined;
      }
      closeModal(); toast(taskId ? ('已续写任务 ' + taskId) : '任务已派发');
      refreshOpenDrawerFiles();
    }
    else if (act === 'closeModal'){ closeModal(); }
    else if (act === 'dagExpand'){ state.dag.expanded = !state.dag.expanded; state.dag.fitted = false; render(); }
    else if (act === 'dagZoomIn'){ state.dag.scale = Math.min(1.5, state.dag.scale + 0.1); render(); }
    else if (act === 'dagZoomOut'){ state.dag.scale = Math.max(0.5, state.dag.scale - 0.1); render(); }
    else if (act === 'dagFit'){
      const shell = document.getElementById('dag-shell'), layout = state.lastLayout || computeDagLayout();
      const sw = (shell?.clientWidth || 1440) - 36, sh = (shell?.clientHeight || 620) - 36;
      state.dag.scale = Math.min(1.05, Math.max(0.52, Math.min(sw / layout.totalW, sh / layout.totalH)));
      state.dag.tx = Math.max(16, Math.round((sw + 36 - layout.totalW * state.dag.scale) / 2));
      state.dag.ty = 10; render();
    }
    else if (act === 'dagReset'){ state.dag = { tx: 24, ty: 14, scale: 0.85, offsets: {}, laneOffsets: {}, laneSizes: {}, fitted: false, expanded: state.dag.expanded }; try { localStorage.removeItem(DAG_STORAGE_KEY); } catch {} render(); }
  } catch (e){
    toast(e?.message || '操作失败', true);
  }
});

document.addEventListener('change', ev => {
  if (ev.target && ev.target.id === 'mail-task-select' && state.drawer){
    state.drawer.taskId = ev.target.value;
    state.drawer.turn = undefined;
    renderDrawer();
    refreshOpenDrawerFiles();
  }
});

if (BOOT.mode === 'live') void connectLive();
else render();
})();
`;

const APP_JS = [APP_CORE_TOP, PREVIEW_JS, DAG_JS, VIEWS_JS, APP_CORE_BOTTOM].join('\n\n');

function renderAuthHtml(config: UiBootConfig): string {
  const safeBoot = JSON.stringify({ mode: 'auth', version: config.version, authError: config.authError }).replace(/</g, '\\u003c');
  const errHtml = config.authError
    ? `<div class="auth-err">${config.authError.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]!))}</div>`
    : '';
  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>chflow — Access Verification (v${config.version})</title>
${FAVICON_LINK}
${THEME_BOOT_SCRIPT}
<style>${CSS}</style>
</head>
<body>
${SVG_SPRITE}
<div class="auth-wrap">
  <div class="auth-card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div class="logo"><svg class="ic lg"><use href="#i-logo"/></svg></div>
      <div>
        <div class="brand-name">chflow 控制台访问校验</div>
        <div style="font-size:13px;color:var(--text-3)">v${config.version} · 非回环安全访问模式</div>
      </div>
    </div>
    ${errHtml}
    <form id="auth-form">
      <div class="field">
        <label for="token-input">访问令牌（Access Token）</label>
        <input id="token-input" name="token" type="password" autocomplete="off" placeholder="请输入启动控制台时生成的 48 位访问令牌" required>
      </div>
      <div id="auth-msg" style="display:none" class="auth-err"></div>
      <button type="submit" class="btn primary" style="width:100%"><svg class="ic sm"><use href="#i-lock"/></svg>验证并进入控制台</button>
    </form>
  </div>
</div>
<script>
window.__CHFLOW_BOOT__ = ${safeBoot};
document.getElementById('auth-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const token = document.getElementById('token-input').value.trim();
  const msg = document.getElementById('auth-msg');
  msg.style.display = 'none';
  try {
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    const body = await res.json();
    if (res.ok && body.ok) { location.href = '/'; return; }
    msg.textContent = body.error?.message || 'Invalid access token.';
    msg.style.display = 'block';
  } catch (e) {
    msg.textContent = e?.message || 'Network error.';
    msg.style.display = 'block';
  }
});
</script>
</body>
</html>`;
}

export function renderUiHtml(config: UiBootConfig): string {
  if (config.mode === 'auth') return renderAuthHtml(config);
  const bootPayload = {
    mode: config.mode,
    version: config.version,
    ...(config.mode === 'live' && config.csrfToken ? { csrfToken: config.csrfToken } : {}),
    ...(config.defaultRoute ? { defaultRoute: config.defaultRoute } : {}),
  };
  const safeBoot = JSON.stringify(bootPayload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>chflow — Cross-Harness Orchestrator (v${config.version})</title>
${FAVICON_LINK}
${THEME_BOOT_SCRIPT}
<style>${CSS}</style>
</head>
<body>
${SVG_SPRITE}
<header class="topbar">
  <div class="topbar-in">
    <div class="brand">
      <div class="logo"><svg class="ic lg"><use href="#i-logo"/></svg></div>
      <span class="brand-name">chflow</span>
      <span class="brand-sub">多 Agent 协同控制台</span>
    </div>
    <div class="proj-wrap">
      <button class="btn" id="proj-btn" data-action="toggleProjMenu">
        <svg class="ic"><use href="#i-grid"/></svg><span id="proj-label">全部项目</span><svg class="ic sm"><use href="#i-chevron-down"/></svg>
      </button>
      <div class="menu-pop" id="proj-menu" style="display:none"></div>
    </div>
    <div class="spacer"></div>
    <button class="btn" data-action="openNewRole"><svg class="ic"><use href="#i-user-plus"/></svg>新建角色</button>
    <button class="btn primary" data-action="openDispatch"><svg class="ic"><use href="#i-send"/></svg>派发任务</button>
    <div class="vsep"></div>
    <button class="btn icon ghost" id="theme-btn" data-action="toggleTheme" title="切换浅色 / 深色"></button>
    <div class="daemon" id="daemon"></div>
  </div>
</header>
<main>
  <div id="offbanner"></div>
  <div id="focus"></div>
  <div class="toolbar-row" id="toolbar-row">
    <nav class="tabs" id="tabs"></nav>
    <div class="toolbar-right" id="toolbar-right"></div>
  </div>
  <section id="view"></section>
</main>
<div class="scrim" id="scrim" data-action="closeDrawer"></div>
<aside class="drawer" id="drawer"></aside>
<div id="modal-root"></div>
<div id="ctx-root"></div>
<div class="toasts" id="toasts"></div>
<script>
window.__CHFLOW_BOOT__ = ${safeBoot};
${APP_JS}
</script>
</body>
</html>`;
}
