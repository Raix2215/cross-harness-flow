export interface UiBootConfig {
  mode: 'live' | 'preview' | 'auth';
  version: string;
  csrfToken?: string;
  defaultRoute?: { socket?: string; session?: string; machine?: string };
  authError?: string;
}

const CSS = `
:root{
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace;
}
[data-theme=light]{
  --bg:#f5f6f8; --surface:#ffffff; --surface-2:#f2f4f7; --surface-3:#e8ebf0;
  --canvas-bg:#fafbfd; --canvas-dot:rgba(23,26,31,.09); --lane-bg:rgba(255,255,255,.78); --lane-border:#dfe3ea;
  --border:#e3e6eb; --border-strong:#c9cfd8;
  --text:#171a1f; --text-2:#4c5361; --text-3:#737b8b;
  --accent:#3451d1; --accent-soft:#eef1fd; --accent-text:#2a43b3;
  --ok:#13864a; --ok-soft:#e7f5ed; --ok-border:#b7e3ca;
  --warn:#b45309; --warn-soft:#fdf4e6; --warn-border:#f0cf9d;
  --danger:#c62f2f; --danger-soft:#fdeded; --danger-border:#f4bcbc;
  --retry:#6a3ccf; --retry-soft:#f2edfd; --retry-border:#d7c7f8;
  --head:#0e7681; --head-soft:#e5f4f5;
  --idle:#646c7c; --idle-soft:#f0f1f4;
  --shadow:0 1px 2px rgba(16,24,40,.05),0 2px 6px rgba(16,24,40,.04);
  --shadow-hover:0 6px 18px rgba(16,24,40,.10);
  --shadow-lg:0 24px 56px rgba(16,24,40,.18),0 4px 12px rgba(16,24,40,.08);
  --scrim:rgba(20,23,28,.30);
  --term-bg:#15181d; --term-text:#d9dee7;
  --toast:#1c2027;
}
[data-theme=dark]{
  --bg:#0e1013; --surface:#16191e; --surface-2:#1d2128; --surface-3:#262b34;
  --canvas-bg:#111419; --canvas-dot:rgba(255,255,255,.08); --lane-bg:rgba(22,25,30,.74); --lane-border:#282e38;
  --border:#272c34; --border-strong:#39404d;
  --text:#eceef2; --text-2:#b0b7c4; --text-3:#808897;
  --accent:#7d95ff; --accent-soft:#1c2340; --accent-text:#a9b7ff;
  --ok:#41c882; --ok-soft:#13271c; --ok-border:#24523a;
  --warn:#f0a63c; --warn-soft:#2a2013; --warn-border:#5a4219;
  --danger:#ff6b6b; --danger-soft:#331a1c; --danger-border:#5c292d;
  --retry:#ab8eff; --retry-soft:#231c3b; --retry-border:#42326e;
  --head:#3fc5cf; --head-soft:#11292c;
  --idle:#9aa1ad; --idle-soft:#1f232a;
  --shadow:0 2px 6px rgba(0,0,0,.35);
  --shadow-hover:0 8px 22px rgba(0,0,0,.48);
  --shadow-lg:0 24px 56px rgba(0,0,0,.60);
  --scrim:rgba(0,0,0,.55);
  --term-bg:#0a0c0f; --term-text:#d9dee7;
  --toast:#2b3039;
}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:var(--font);font-size:14.5px;line-height:1.55;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}
code,.mono{font-family:var(--mono)}
.ic{width:16px;height:16px;flex:none;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle}
.ic.sm{width:14px;height:14px}
.ic.lg{width:19px;height:19px}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:36px;padding:0 14px;border-radius:9px;border:1px solid var(--border);background:var(--surface);font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .14s,border-color .14s,filter .14s,color .14s}
.btn:hover{background:var(--surface-2);border-color:var(--border-strong)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.primary:hover{filter:brightness(1.07)}
.btn.warn{background:var(--warn);border-color:var(--warn);color:#fff}
.btn.warn:hover{filter:brightness(1.07)}
.btn.danger{background:var(--danger);border-color:var(--danger);color:#fff}
.btn.danger:hover{filter:brightness(1.07)}
.btn.ghost{background:transparent;border-color:transparent}
.btn.ghost:hover{background:var(--surface-2)}
.btn.danger-ghost{background:transparent;border-color:transparent;color:var(--danger)}
.btn.danger-ghost:hover{background:var(--danger-soft)}
.btn.sm{height:30px;padding:0 11px;font-size:13px;border-radius:8px;gap:5px}
.btn.icon{width:36px;padding:0}
.btn:disabled{opacity:.45;cursor:not-allowed}

.topbar{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--surface) 90%,transparent);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--border)}
.topbar-in{width:92%;max-width:2200px;margin:0 auto;height:58px;padding:0;display:flex;align-items:center;gap:12px}
.brand{display:flex;align-items:center;gap:10px;margin-right:4px}
.logo{width:32px;height:32px;border-radius:9px;background:var(--accent);color:#fff;display:grid;place-items:center}
.brand-name{font-size:17px;font-weight:700;letter-spacing:-.01em}
.brand-sub{font-size:13px;color:var(--text-3);padding-left:10px;border-left:1px solid var(--border)}
.spacer{flex:1}
.vsep{width:1px;height:24px;background:var(--border)}
.daemon{display:flex;align-items:center;gap:9px;height:36px;padding:0 4px 0 13px;border:1px solid var(--border);border-radius:999px;background:var(--surface)}
.daemon .d-txt{font-size:13.5px;font-weight:600}
.daemon .d-meta{font-size:12.5px;color:var(--text-3);font-variant-numeric:tabular-nums}
.dot-live{width:8px;height:8px;border-radius:50%;flex:none}
.dot-live.ok{background:var(--ok);box-shadow:0 0 0 3px var(--ok-soft)}
.dot-live.warn{background:var(--warn);box-shadow:0 0 0 3px var(--warn-soft)}
.dot-live.off{background:var(--danger);box-shadow:0 0 0 3px var(--danger-soft)}

.proj-wrap{position:relative}
.menu-pop{position:absolute;top:calc(100% + 6px);left:0;min-width:260px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-lg);padding:6px;z-index:60}
.menu-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;border-radius:8px;border:0;background:transparent;text-align:left;cursor:pointer;font-size:14px}
.menu-item:hover{background:var(--surface-2)}
.menu-item.active{background:var(--accent-soft);color:var(--accent-text);font-weight:600}
.menu-meta{font-size:12.5px;color:var(--text-3)}

main{width:92%;max-width:2200px;margin:0 auto;padding:16px 0 40px}
.off-banner{display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:13px;background:var(--danger-soft);border:1px solid var(--danger-border);margin-bottom:14px;font-size:14.5px}
.off-banner .t{flex:1}
body.daemon-off #focus,body.daemon-off #view,body.daemon-off #toolbar-row{opacity:.48;filter:grayscale(.65);pointer-events:none;user-select:none}

.focus{border:1px solid var(--warn-border);background:var(--warn-soft);border-radius:13px;padding:9px 12px 10px;margin-bottom:12px}
.focus-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 2px 8px}
.fh-l{display:flex;align-items:center;gap:8px;color:var(--warn);font-size:14px;font-weight:600}
.fh-l b{color:var(--text)}
.fh-count{font-size:12.5px;font-weight:600;color:var(--warn);background:var(--surface);border:1px solid var(--warn-border);border-radius:999px;padding:0 8px}
.fh-r{display:flex;align-items:center;gap:10px}
.fh-hint{font-size:12.5px;color:var(--text-3)}
.focus-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:8px}
.fi{display:flex;align-items:center;gap:11px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 12px;min-width:0}
.fi-icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--warn-soft);color:var(--warn);flex:none}
.fi-body{flex:1;min-width:0}
.fi-title{font-size:14px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.fi-sub{font-size:12.5px;color:var(--text-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fi-code{display:inline-block;max-width:100%;margin-top:2px;font-size:12.5px;background:var(--surface-2);border-radius:5px;padding:1px 7px;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fi-actions{display:flex;gap:5px;flex:none}

.toolbar-row{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--border);margin-bottom:12px;flex-wrap:wrap}
.tabs{display:flex;align-items:center;gap:4px}
.tab{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border:0;background:transparent;font-size:14.5px;font-weight:500;color:var(--text-2);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab:hover{color:var(--text)}
.tab.active{color:var(--text);font-weight:600;border-bottom-color:var(--accent)}
.tab-badge{font-size:12.5px;font-weight:600;padding:0 7px;border-radius:999px;background:var(--surface-2);color:var(--text-2)}
.tab-badge.warn{background:var(--warn);color:#fff}

.toolbar-right{display:flex;align-items:center;gap:14px;padding-bottom:8px;flex-wrap:wrap}
.summary-inline{display:flex;align-items:center;gap:12px;font-size:13.5px;color:var(--text-2);flex-wrap:wrap}
.s-item{display:inline-flex;align-items:center;gap:6px}
.s-item b{color:var(--text);font-variant-numeric:tabular-nums}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.dot.ok{background:var(--ok)}
.dot.warn{background:var(--warn)}
.dot.retry{background:var(--retry)}
.dot.idle{background:var(--idle)}
.dot.danger{background:var(--danger)}
.dot.unbound{border:1.5px dashed var(--text-3);background:transparent}

.seg{display:inline-flex;padding:3px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border);gap:2px}
.seg button{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:7px;border:0;background:transparent;font-size:13.5px;font-weight:500;color:var(--text-2);cursor:pointer}
.seg button.active{background:var(--surface);color:var(--text);font-weight:600;box-shadow:var(--shadow)}

.pill{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:12.5px;font-weight:600;line-height:1.45;white-space:nowrap}
.pill.ok{background:var(--ok-soft);color:var(--ok)}
.pill.warn{background:var(--warn-soft);color:var(--warn)}
.pill.retry{background:var(--retry-soft);color:var(--retry)}
.pill.idle{background:var(--idle-soft);color:var(--idle)}
.pill.head{background:var(--head-soft);color:var(--head)}
.pill.danger{background:var(--danger-soft);color:var(--danger)}
.tag{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:6px;font-size:12.5px;background:var(--surface-2);color:var(--text-2);border:1px solid var(--border)}

.dag-shell{position:relative;height:max(540px, calc(100vh - 270px));border-radius:16px;border:1px solid var(--border);background:var(--canvas-bg);background-image:radial-gradient(var(--canvas-dot) 1.25px, transparent 1.25px);background-size:22px 22px;overflow:hidden;box-shadow:var(--shadow);user-select:none}
.dag-shell.expanded{position:fixed;inset:2vh 2vw;height:auto;z-index:42;border-radius:16px;box-shadow:var(--shadow-lg)}
.dag-shell.panning{cursor:grabbing}
.dag-stage{position:absolute;inset:0;transform-origin:0 0}
.dag-svg{position:absolute;left:0;top:0;width:4000px;height:3200px;pointer-events:none;overflow:visible}

.dag-lane{position:absolute;border-radius:18px;border:1px solid var(--lane-border);background:var(--lane-bg);backdrop-filter:blur(4px);pointer-events:none}
.dag-lane-head{display:flex;align-items:center;justify-content:space-between;padding:11px 18px;border-bottom:1px dashed var(--border);pointer-events:auto}
.dag-lane-title{display:flex;align-items:center;gap:9px;font-size:15.5px;font-weight:700;color:var(--text)}
.dag-lane-meta{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-3)}
.dag-col-labels{position:absolute;top:52px;left:0;right:0;pointer-events:none}
.dag-col-label{position:absolute;font-size:12.5px;font-weight:600;color:var(--text-3);letter-spacing:.02em;display:flex;align-items:center;gap:6px}

.dag-node{position:absolute;background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:13px 16px;box-shadow:var(--shadow);cursor:pointer;transition:box-shadow .15s,border-color .15s;display:flex;flex-direction:column}
.dag-node:hover{box-shadow:var(--shadow-hover);border-color:var(--border-strong)}
.dag-node.selected{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft),var(--shadow-hover)}
.dag-node.dragging{cursor:grabbing;z-index:25;box-shadow:var(--shadow-lg)}

.dag-node.ctrl{width:268px;border-left:4px solid var(--accent)}
.dag-node.role{width:336px}
.dag-node.role.st-blocked{border-color:var(--warn);background:linear-gradient(180deg,color-mix(in srgb,var(--warn-soft) 55%,var(--surface)) 0%,var(--surface) 44%)}
.dag-node.role.st-working{border-color:color-mix(in srgb,var(--ok) 45%,var(--border))}
.dag-node.role.st-retry{border-color:color-mix(in srgb,var(--retry) 50%,var(--border))}
.dag-node.role.st-offline{border-color:var(--danger-border);background:color-mix(in srgb,var(--danger-soft) 35%,var(--surface))}
.dag-node.role.st-unbound{border-style:dashed;background:color-mix(in srgb,var(--surface) 75%,var(--surface-2))}
.dag-node.fallback{width:264px;border:1.5px dashed var(--retry-border);background:color-mix(in srgb,var(--retry-soft) 50%,var(--surface))}

.dn-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dn-title{font-size:15px;font-weight:700;display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dn-sub{font-size:13px;color:var(--text-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dn-task{margin-top:8px;padding:7px 10px;border-radius:9px;background:var(--surface-2);font-size:13.5px;color:var(--text-2)}
.dn-task-top{display:flex;align-items:center;justify-content:space-between;gap:6px;font-weight:600;color:var(--text)}
.dn-task-note{font-size:12.5px;color:var(--text-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dn-alert{margin-top:8px;padding:7px 10px;border-radius:9px;background:var(--warn-soft);border:1px solid var(--warn-border);color:var(--warn);font-size:13px;display:flex;align-items:center;gap:7px}
.dn-alert span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--mono);font-size:12.5px}
.dn-retry{margin-top:7px;padding:6px 10px;border-radius:9px;background:var(--retry-soft);color:var(--retry);font-size:12.5px;display:flex;align-items:center;gap:6px}
.dn-actions{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap}
.dn-foot{margin-top:auto;padding-top:8px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;color:var(--text-3)}
.dn-foot-left{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.edge-path{fill:none;stroke:var(--border-strong);stroke-width:2}
.edge-path.working{stroke:var(--accent);stroke-width:2.2;stroke-dasharray:6 5;animation:flow 1.2s linear infinite}
.edge-path.blocked{stroke:var(--warn);stroke-width:2.4}
.edge-path.retry{stroke:var(--retry);stroke-width:2;stroke-dasharray:5 5}
.edge-path.fallback{stroke:var(--retry);stroke-width:1.9;stroke-dasharray:4 4;opacity:.85}
@keyframes flow{to{stroke-dashoffset:-22}}
.edge-badge{position:absolute;transform:translate(-50%,-50%);padding:2px 8px;border-radius:999px;background:var(--surface);border:1px solid var(--border);font-size:12px;font-weight:600;color:var(--text-2);white-space:nowrap;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.edge-badge.blocked{border-color:var(--warn-border);background:var(--warn-soft);color:var(--warn)}
.edge-badge.working{border-color:color-mix(in srgb,var(--accent) 35%,var(--border));color:var(--accent-text)}
.edge-badge.retry,.edge-badge.fallback{border-color:var(--retry-border);background:var(--retry-soft);color:var(--retry)}

.dag-hint{position:absolute;bottom:12px;left:16px;padding:6px 12px;border-radius:10px;background:color-mix(in srgb,var(--surface) 90%,transparent);backdrop-filter:blur(8px);border:1px solid var(--border);font-size:12.5px;color:var(--text-3);z-index:10}
.dag-controls{position:absolute;bottom:12px;right:16px;display:flex;align-items:center;gap:4px;padding:4px;border-radius:11px;background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(8px);border:1px solid var(--border);box-shadow:var(--shadow);z-index:10}
.dag-controls button{height:30px;padding:0 10px;border-radius:7px;border:0;background:transparent;font-size:13px;font-weight:500;color:var(--text-2);cursor:pointer;display:inline-flex;align-items:center}
.dag-controls button:hover{background:var(--surface-2);color:var(--text)}
.dag-zoom-val{min-width:46px;text-align:center;font-size:13px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums}

.empty-canvas{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:32px;color:var(--text-2)}
.empty-card{max-width:460px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px 28px;box-shadow:var(--shadow)}

.unmanaged-box{margin-top:16px;padding:14px 18px;border-radius:14px;border:1px solid var(--border);background:var(--surface)}
.unm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px;gap:12px;flex-wrap:wrap}
.unm-title{font-size:14.5px;font-weight:600;display:flex;align-items:center;gap:8px}
.unm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}
.unm-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 13px;border-radius:11px;border:1px solid var(--border);background:var(--surface-2)}
.unm-info{min-width:0}
.unm-name{font-size:14px;font-weight:600;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.unm-sub{font-size:12.5px;color:var(--text-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.proj-section{margin-bottom:26px}
.proj-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.proj-title{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700}
.proj-meta{font-size:13px;color:var(--text-3);font-weight:400;display:inline-flex;align-items:center;gap:6px}
.ctrl-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.ctrl-chip{display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:999px;border:1px solid var(--border);background:var(--surface);font-size:13.5px;cursor:pointer}
.ctrl-chip:hover{border-color:var(--border-strong);background:var(--surface-2)}
.role-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.role-card{background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:15px 16px;box-shadow:var(--shadow);cursor:pointer;display:flex;flex-direction:column;transition:box-shadow .15s,border-color .15s;min-height:170px}
.role-card:hover{box-shadow:var(--shadow-hover);border-color:var(--border-strong)}
.role-card.st-blocked{border-color:var(--warn)}
.role-card.st-unbound{border-style:dashed}
.role-card.st-offline{border-color:var(--danger-border)}

.section-h{font-size:18px;font-weight:700;margin:0 0 4px}
.section-sub{font-size:14px;color:var(--text-3);margin:0 0 18px}
.q-group{margin-bottom:22px}
.q-group-title{font-size:14px;font-weight:600;color:var(--text-2);display:flex;align-items:center;gap:7px;margin-bottom:10px}
.q-card{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border-radius:13px;border:1px solid var(--border);background:var(--surface);margin-bottom:9px;flex-wrap:wrap}
.q-left{display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1}
.q-icon{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--surface-2);color:var(--text-2);flex:none}
.q-icon.warn{background:var(--warn-soft);color:var(--warn)}
.q-icon.retry{background:var(--retry-soft);color:var(--retry)}
.q-title{font-size:14.5px;font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.q-desc{font-size:13.5px;color:var(--text-2);margin-top:3px}
.q-meta{font-size:12.5px;color:var(--text-3);margin-top:4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.q-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex:none}
.q-btns{display:flex;gap:6px;flex-wrap:wrap}

.audit-list{border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden}
.audit-row{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);font-size:14px}
.audit-row:last-child{border-bottom:0}
.audit-time{font-size:12.5px;color:var(--text-3);width:84px;flex:none;font-variant-numeric:tabular-nums}

.scrim{position:fixed;inset:0;background:var(--scrim);z-index:45;opacity:0;pointer-events:none;transition:opacity .2s}
.scrim.open{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;bottom:0;width:560px;max-width:94vw;background:var(--surface);border-left:1px solid var(--border);box-shadow:var(--shadow-lg);z-index:50;transform:translateX(100%);transition:transform .22s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column}
.drawer.open{transform:translateX(0)}
.dr-head{padding:18px 22px 0;border-bottom:1px solid var(--border)}
.dr-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dr-crumb{font-size:13px;color:var(--text-3);display:flex;align-items:center;gap:6px}
.dr-name{font-size:21px;font-weight:700;display:flex;align-items:center;gap:10px;margin-top:4px;flex-wrap:wrap}
.dr-desc{font-size:14px;color:var(--text-2);margin-top:3px}
.dr-tabs{display:flex;gap:6px;margin-top:14px}
.dr-tabs button{padding:9px 12px;border:0;background:transparent;font-size:14px;font-weight:500;color:var(--text-2);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.dr-tabs button.active{color:var(--text);font-weight:600;border-bottom-color:var(--accent)}
.dr-body{flex:1;overflow-y:auto;padding:18px 22px 28px}

.box{border:1px solid var(--border);border-radius:13px;padding:15px;margin-bottom:14px;background:var(--surface)}
.box.warn{border-color:var(--warn-border);background:var(--warn-soft)}
.box-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;font-size:15px;font-weight:600}
.term{background:var(--term-bg);color:var(--term-text);border-radius:10px;padding:12px 14px;font-family:var(--mono);font-size:13px;line-height:1.65;overflow-x:auto;white-space:pre-wrap;margin:10px 0 12px;max-height:280px}
.keybar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)}
.keybtn{height:28px;padding:0 10px;border-radius:7px;border:1px solid var(--border);background:var(--surface);font-family:var(--mono);font-size:12.5px;cursor:pointer}
.keybtn:hover{background:var(--surface-2)}
.term-input-row{display:flex;gap:6px;margin-top:10px}
.term-input-row input{flex:1;padding:7px 11px;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-size:13.5px}

.perm-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px}
.perm-btn{padding:8px 6px;border-radius:9px;border:1px solid var(--border);background:var(--surface);font-size:13px;font-weight:500;cursor:pointer;text-align:center}
.perm-btn:hover{background:var(--surface-2)}
.perm-btn.active{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-text);font-weight:600}

.mail-pre{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:13px 15px;font-family:var(--mono);font-size:13px;line-height:1.65;white-space:pre-wrap;color:var(--text);max-height:360px;overflow:auto}

.ctx-menu{position:fixed;min-width:200px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-lg);padding:6px;z-index:80}
.ctx-item{width:100%;display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:8px;border:0;background:transparent;font-size:13.5px;cursor:pointer;text-align:left}
.ctx-item:hover{background:var(--surface-2)}
.ctx-item.danger{color:var(--danger)}
.ctx-item.danger:hover{background:var(--danger-soft)}

.modal-back{position:fixed;inset:0;background:var(--scrim);z-index:70;display:grid;place-items:center;padding:20px}
.modal{width:500px;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-lg);overflow:hidden}
.modal-h{padding:18px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;font-size:16.5px;font-weight:700}
.modal-b{padding:18px 20px;max-height:72vh;overflow-y:auto}
.modal-f{padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface-2)}
.field{margin-bottom:13px}
.field label{display:block;font-size:13.5px;font-weight:600;margin-bottom:5px;color:var(--text-2)}
.field input,.field select,.field textarea{width:100%;padding:9px 12px;border-radius:9px;border:1px solid var(--border);background:var(--surface);font-size:14px}
.field textarea{min-height:92px;resize:vertical}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.check-row{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--text-2);margin-top:6px}
.check-row input{width:auto}

.toasts{position:fixed;bottom:20px;right:24px;display:flex;flex-direction:column;gap:8px;z-index:90}
.toast{background:var(--toast);color:#fff;padding:10px 15px;border-radius:10px;font-size:13.5px;box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:8px}
.toast.err{background:var(--danger)}

.auth-wrap{min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg)}
.auth-card{width:440px;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px;box-shadow:var(--shadow-lg)}
.auth-err{padding:10px 12px;border-radius:9px;background:var(--danger-soft);border:1px solid var(--danger-border);color:var(--danger);font-size:13.5px;margin-bottom:14px}
`;

const SVG_SPRITE = `<svg style="display:none" aria-hidden="true">
  <defs>
    <symbol id="i-logo" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.2 7.2L11 15.6M15.8 7.2L13 15.6M8.5 6h7"/></symbol>
    <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></symbol>
    <symbol id="i-dag" viewBox="0 0 24 24"><rect x="2.5" y="4" width="6" height="5" rx="1.2"/><rect x="15.5" y="3" width="6" height="5" rx="1.2"/><rect x="15.5" y="15" width="6" height="5" rx="1.2"/><path d="M8.5 6.5h3.5c1.5 0 1.5-1 3.5-1M8.5 6.5h2c2.2 0 1.8 11 5 11"/></symbol>
    <symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
    <symbol id="i-user-plus" viewBox="0 0 24 24"><path d="M15.5 20.5v-1.5a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4v1.5"/><circle cx="9" cy="7.5" r="3.5"/><path d="M19 8v6M22 11h-6"/></symbol>
    <symbol id="i-send" viewBox="0 0 24 24"><path d="M21 3L10 14"/><path d="M21 3l-6.5 18-4-8-8-4L21 3z"/></symbol>
    <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></symbol>
    <symbol id="i-moon" viewBox="0 0 24 24"><path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"/></symbol>
    <symbol id="i-power" viewBox="0 0 24 24"><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 2.5V12"/></symbol>
    <symbol id="i-alert" viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.2M12 17.2h.01"/></symbol>
    <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 21.5s7.5-3.6 7.5-9.6V5.4L12 2.5 4.5 5.4v6.5c0 6 7.5 9.6 7.5 9.6z"/></symbol>
    <symbol id="i-keyboard" viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/></symbol>
    <symbol id="i-terminal" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7.5 9.5l3 2.5-3 2.5M13 15h4"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6.5L9.5 17 4 11.5"/></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></symbol>
    <symbol id="i-eye" viewBox="0 0 24 24"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></symbol>
    <symbol id="i-zap" viewBox="0 0 24 24"><path d="M13 2.5L4 13.5h7.5l-1 8 9-11H12l1-8z"/></symbol>
    <symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 2.5l9.5 5-9.5 5-9.5-5 9.5-5z"/><path d="M2.5 12l9.5 5 9.5-5M2.5 16.5l9.5 5 9.5-5"/></symbol>
    <symbol id="i-inbox" viewBox="0 0 24 24"><path d="M21.5 12.5h-5.5l-2 3h-4l-2-3H2.5"/><path d="M5.5 5.1L2.5 12.5v5.5a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-5.5l-3-7.4a2 2 0 0 0-1.8-1.1H7.3a2 2 0 0 0-1.8 1.1z"/></symbol>
    <symbol id="i-activity" viewBox="0 0 24 24"><path d="M21.5 12h-4l-3 8.5-5-17-3 8.5h-4"/></symbol>
    <symbol id="i-folder" viewBox="0 0 24 24"><path d="M21.5 18.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h4.8l2 2.8h8.2a2 2 0 0 1 2 2z"/></symbol>
    <symbol id="i-branch" viewBox="0 0 24 24"><circle cx="6.5" cy="5.5" r="2.2"/><circle cx="6.5" cy="18.5" r="2.2"/><circle cx="17.5" cy="7.5" r="2.2"/><path d="M6.5 7.7v8.6M17.5 9.7c0 4.3-5.5 3.6-9.6 7.1"/></symbol>
    <symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.8 8.2l-2 5.6-5.6 2 2-5.6 5.6-2z"/></symbol>
    <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></symbol>
    <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5v5h-5"/></symbol>
    <symbol id="i-swap" viewBox="0 0 24 24"><path d="M16.5 3.5l4 4-4 4"/><path d="M20.5 7.5h-15"/><path d="M7.5 20.5l-4-4 4-4"/><path d="M3.5 16.5h15"/></symbol>
    <symbol id="i-cpu" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9.5 2v3M14.5 2v3M9.5 19v3M14.5 19v3M2 9.5h3M2 14.5h3M19 9.5h3M19 14.5h3"/></symbol>
    <symbol id="i-monitor" viewBox="0 0 24 24"><rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 20.5h8M12 16.5v4"/></symbol>
    <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 13.5a4.5 4.5 0 0 0 6.8.5l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.6 1.6"/><path d="M14 10.5a4.5 4.5 0 0 0-6.8-.5l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6"/></symbol>
    <symbol id="i-trash" viewBox="0 0 24 24"><path d="M3.5 6.5h17M9 6.5V4.5h6v2M18.5 6.5l-.9 13a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9l-.9-13"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></symbol>
    <symbol id="i-maximize" viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></symbol>
    <symbol id="i-minimize" viewBox="0 0 24 24"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></symbol>
  </defs>
</svg>`;

const APP_JS = `
(function(){
'use strict';
const BOOT = window.__CHFLOW_BOOT__ || { mode: 'preview', version: '3.4.0' };
const ic = (name, cls='') => '<svg class="ic ' + cls + '"><use href="#i-' + name + '"/></svg>';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const TERMINAL_STATES = new Set(['succeeded','failed','cancelled']);
const PENDING_QUEUE = new Set(['queued','deferred_user_typing','paused_by_operator','delivering','pending_unreachable']);
const PERMS = [
  {id:'readonly', zh:'只读', desc:'只能读取文件与运行只读命令，拒绝所有写入。'},
  {id:'ask', zh:'逐项询问', desc:'写文件与执行命令前暂停等待人工确认。'},
  {id:'auto-workspace', zh:'工作区自动', desc:'工作区内自动放行安全操作，越界与高危命令拦截。'},
  {id:'yolo', zh:'完全放行', desc:'不做审批拦截，仅建议在明确授权或隔离环境中使用。'}
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

function makePreviewSnapshot(){
  const now = Date.now(), min = 60000;
  return {
    seq: 42, now, herdr: 'reachable',
    daemon: { pid: 48213, version: BOOT.version || '3.4.0', started_at: new Date(now - (3*60+12)*min).toISOString(), ui_url: 'http://127.0.0.1:4317', running: true },
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
      { pane_id: 'w2:p1', alias: 'backend', role: 'backend', kind: 'codex', model: 'codex-model', perm: 'auto-workspace', project_id: 'acme-api', live: true, agent_status: 'working', cwd: '~/workspace/acme-api', controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' } },
      { pane_id: 'w2:p3', alias: 'reviewer', role: 'reviewer', kind: 'claude', model: 'sonnet', perm: 'ask', project_id: 'acme-api', live: true, agent_status: 'blocked', cwd: '~/workspace/acme-api', controller: { pane: 'w1:p5', label: '主控 B', kind: 'codex' } },
      { pane_id: 'w3:p2', alias: 'frontend', role: 'frontend', kind: 'agy', model: 'primary-interactive', perm: 'auto-workspace', project_id: 'web-portal', live: true, agent_status: 'working', cwd: '~/workspace/web-portal', controller: { pane: 'w3:p1', label: '主控 A', kind: 'agy' } }
    ],
    unmanaged_live_agents: [
      { pane_id: 'w1:p2', name: '主控 A', kind: 'claude', agent_status: 'idle', cwd: '~/workspace/acme-api', project_id: 'acme-api' },
      { pane_id: 'w1:p5', name: '主控 B', kind: 'codex', agent_status: 'idle', cwd: '~/workspace/acme-api', project_id: 'acme-api' },
      { pane_id: 'w3:p1', name: '主控 A', kind: 'agy', agent_status: 'idle', cwd: '~/workspace/web-portal', project_id: 'web-portal' },
      { pane_id: 'w4:p1', name: 'scratch-claude', kind: 'claude', agent_status: 'idle', cwd: '~/workspace/web-portal', project_id: 'web-portal' },
      { pane_id: 'w4:p2', name: 'scratch-codex', kind: 'codex', agent_status: 'idle', cwd: '~/workspace/acme-api', project_id: 'acme-api' }
    ],
    tasks: [
      { task: 'feat-rate-limit', turn: 2, state: 'submitted', mode: 'interactive', kind: 'codex', perm: 'auto-workspace', name: 'backend', role: 'backend', pane_id: 'w2:p1', project_id: 'acme-api', controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' }, startedAt: now - 9*min, note: '正在编写 src/store/redis-store.ts' },
      { task: 'review-pr-87', turn: 1, state: 'blocked', mode: 'interactive', kind: 'claude', perm: 'ask', name: 'reviewer', role: 'reviewer', pane_id: 'w2:p3', project_id: 'acme-api', controller: { pane: 'w1:p5', label: '主控 B', kind: 'codex' }, startedAt: now - 4*min, block: { kind: 'permission', reason: 'pnpm test --filter @acme/api -- --runInBand', seq: 42, since: now - 4*min } },
      { task: 'sync-api-docs', turn: 1, state: 'scheduled_retry', mode: 'headless', kind: 'pi', perm: 'auto-workspace', name: 'docs', role: 'docs', project_id: 'acme-api', controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' }, startedAt: now - 14*min, retries: 2, nextAt: now + 125000, reason: '额度窗口受限 (HTTP 429)', fallback: [{ kind: 'codex', channel: 'codex-sub' }, { kind: 'claude', channel: 'claude-sub' }] },
      { task: 'checkout-ux', turn: 1, state: 'submitted', mode: 'interactive', kind: 'agy', perm: 'auto-workspace', name: 'frontend', role: 'frontend', pane_id: 'w3:p2', project_id: 'web-portal', controller: { pane: 'w3:p1', label: '主控 A', kind: 'agy' }, startedAt: now - 6*min, note: '正在更新 CheckoutForm.tsx' },
      { task: 'checkout-e2e', turn: 1, state: 'retrying', mode: 'headless', kind: 'codex', perm: 'auto-workspace', name: 'tester', role: 'tester', project_id: 'web-portal', controller: { pane: 'w3:p1', label: '主控 A', kind: 'agy' }, startedAt: now - 3*min, retries: 1, nextAt: now + 15000, reason: '执行器瞬时超时', fallback: [{ kind: 'claude', channel: 'claude-sub' }] }
    ],
    queue: [
      { event_id: 'ev-1', task: 'feat-rate-limit', turn: 1, state: 'deferred_user_typing', type: 'reply', status: 'succeeded', worker: 'backend(w2:p1)', perm: 'auto-workspace', note: '第 1 轮内存限流实现回执已生成，因你在 w1:p2 正在输入而暂缓投递', created: now - 65000, recipient: { pane: 'w1:p2', label: '主控 A' } }
    ],
    scheduled_retries: [
      { task: 'sync-api-docs', state: 'pending', nextAt: now + 125000, reason: 'quota_window_429' },
      { task: 'checkout-e2e', state: 'pending', nextAt: now + 15000, reason: 'transient_timeout' }
    ],
    paused_recipients: [],
    audit: [
      { id: 105, at: now - 4*min, task: 'review-pr-87', event: 'blocked', detail: 'permission (w2:p3)' },
      { id: 104, at: now - 65000, task: 'feat-rate-limit', event: 'deferred_user_typing', detail: 'w1:p2' },
      { id: 103, at: now - 8*min, task: 'sync-api-docs', event: 'scheduled_retry', detail: 'attempt=2 fallback=codex-sub' },
      { id: 102, at: now - 12*min, task: 'review-pr-87', event: 'submitted', detail: 'reviewer (ask)' },
      { id: 101, at: now - 18*min, task: null, event: 'pane_pruned', detail: 'w2:p9 exited' }
    ]
  };
}

const PREVIEW_FILES = {
  'review-pr-87:diag': '[blocked_kind=permission | state_change_seq=42]\\nRequesting permission for:\\n  pnpm test --filter @acme/api -- --runInBand\\n  env API_TOKEN=[redacted]\\n\\nRun this command?\\n> 1. Yes, run command\\n  2. Yes, and always allow in this session\\n  3. No, cancel',
  'review-pr-87:brief:1': '# review-pr-87 · 审阅 PR #87\\n1. 检查并发令牌扣减原子性\\n2. 核对 429 Retry-After 响应头\\n3. 确认单测边界覆盖',
  'review-pr-87:out:1': '（等待测试授权放行后生成完整审查结论）',
  'feat-rate-limit:brief:1': '# feat-rate-limit 第 1 轮 · 令牌桶限流中间件\\n- 新增 src/middleware/rate-limit.ts\\n- 覆盖放行、突发截断与窗口恢复单测',
  'feat-rate-limit:out:1': '已完成内存版限流实现与 9 项单测（全部通过）。建议第 2 轮接入 RedisStore。',
  'feat-rate-limit:brief:2': '# feat-rate-limit 第 2 轮 · 接入 RedisStore\\n- 抽象 TokenStore 接口并补充集成测试',
  'feat-rate-limit:out:2': '（执行中，尚未生成第 2 轮回执）'
};

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
  drawer: null, // { kind: 'role'|'pane'|'task'|'ctrl', id, projectId?, tab: 'overview'|'mail'|'activity', turn: 1 }
  fileCache: {},
  dag: { tx: 24, ty: 14, scale: 0.85, offsets: {}, fitted: false, expanded: false }
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

async function loadTaskFile(taskId, kind, turn){
  const key = taskId + ':' + kind + (kind === 'diag' ? '' : ':' + turn);
  if (BOOT.mode === 'preview'){
    state.fileCache[key] = PREVIEW_FILES[key] || '（示例文件暂无更多正文）';
    return state.fileCache[key];
  }
  if (state.fileCache[key] !== undefined && state.fileCache[key] !== null) return state.fileCache[key];
  state.fileCache[key] = null;
  const q = kind === 'diag' ? 'kind=diag' : 'kind=' + encodeURIComponent(kind) + '&turn=' + encodeURIComponent(String(turn));
  try {
    const res = await fetch('/api/tasks/' + encodeURIComponent(taskId) + '/file?' + q);
    const body = await res.json();
    state.fileCache[key] = body.ok ? (body.data?.exists ? (body.data.content || '（文件为空）') : '（尚未生成该文件）') : ('读取失败：' + (body.error?.message || ''));
  } catch (e){
    state.fileCache[key] = '读取失败：' + (e.message || e);
  }
  renderDrawer();
}

function handlePreviewAction(action, target, opts){
  const snap = state.snap;
  if (!snap) return {};
  if (action === 'daemon_stop'){
    state.daemonStopped = true; state.stopReason = 'manual'; state.drawer = null;
    render(); return { running: false };
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
    if (t){ t.perm = opts.perm; if (t.state === 'blocked' && (opts.perm === 'auto-workspace' || opts.perm === 'yolo')){ t.state = 'submitted'; delete t.block; } }
    if (p){ p.perm = opts.perm; if (p.agent_status === 'blocked' && (opts.perm === 'auto-workspace' || opts.perm === 'yolo')) p.agent_status = 'working'; }
    if (r){ r.perm = opts.perm; if (r.agent_status === 'blocked' && (opts.perm === 'auto-workspace' || opts.perm === 'yolo')) r.agent_status = 'working'; }
  } else if (action === 'queue_deliver_now' || action === 'queue_consume' || action === 'queue_drop'){
    snap.queue = snap.queue.filter(q => q.event_id !== opts.event_id);
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
  } else if (action === 'role_set'){
    snap.roles.push({ project_id: opts.project || snap.projects[0].project_id, role: target, description: opts.desc || '项目角色', source: 'manual', binding_mode: 'unbound', kind: opts.kind || 'codex', default_kind: opts.kind || 'codex', perm: opts.perm || 'ask', model: opts.model, live: false, agent_status: 'unbound' });
  } else if (action === 'role_bind'){
    const r = snap.roles.find(x => x.role === target && (!opts.project || x.project_id === opts.project));
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
    if (a){
      snap.unmanaged_live_agents = snap.unmanaged_live_agents.filter(x => x.pane_id !== target);
      snap.managed_panes.push({ pane_id: a.pane_id, alias: opts.name || a.name || a.pane_id, kind: a.kind, perm: opts.perm || 'ask', project_id: a.project_id, live: true, agent_status: a.agent_status, cwd: a.cwd });
    }
  } else if (action === 'send'){
    const r = snap.roles.find(x => x.role === target && (!opts.project || x.project_id === opts.project));
    const id = opts.task || ('task-' + Math.floor(100 + Math.random()*800));
    if (r){
      if (r.binding_mode === 'unbound'){ r.binding_mode = 'pane'; r.pane_id = 'w2:p8'; r.live = true; }
      r.agent_status = 'working'; r.active_task = id;
      snap.tasks.push({ task: id, turn: 1, state: 'submitted', mode: r.binding_mode === 'headless' ? 'headless' : 'interactive', kind: r.kind, perm: opts.perm || r.perm || 'ask', name: r.role, role: r.role, pane_id: r.pane_id, project_id: r.project_id, controller: { pane: 'w1:p2', label: '主控 A', kind: 'claude' }, startedAt: Date.now(), note: (opts.brief || '').slice(0, 48) });
    }
  }
  render();
  return { ok: true };
}

/* ==================== LIVE SSE CONNECTION ==================== */
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
      state.snap = JSON.parse(ev.data);
      state.connected = true;
      state.daemonStopped = false;
      reconnectDelay = 1200;
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

/* ==================== VIEW MODEL HELPERS ==================== */
function getSnap(){ return state.snap || { projects: [], roles: [], managed_panes: [], unmanaged_live_agents: [], tasks: [], queue: [], scheduled_retries: [], paused_recipients: [], audit: [], daemon: {} }; }
function visibleProjects(){
  const list = getSnap().projects || [];
  return state.project === 'all' ? list : list.filter(p => p.project_id === state.project);
}
function projectName(pid){
  return (getSnap().projects || []).find(p => p.project_id === pid)?.name || pid || 'default';
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
  const items = [];
  const boundPanes = new Set();
  const seenTasks = new Set();

  for (const r of (snap.roles || []).filter(x => x.project_id === projectId)){
    const task = taskForRole(r);
    if (r.pane_id) boundPanes.add(r.pane_id);
    if (task) seenTasks.add(task.task);
    items.push({
      nodeId: 'role:' + r.project_id + ':' + r.role,
      itemKind: 'role',
      name: r.role,
      desc: r.description || (r.binding_mode === 'headless' ? '无头角色槽位' : '项目稳定角色'),
      projectId: r.project_id,
      status: roleDisplayStatus(r, task),
      perm: task?.perm || r.perm || 'ask',
      kind: task?.kind || r.kind || r.default_kind || 'codex',
      model: r.model || '',
      bindingMode: r.binding_mode,
      paneId: r.pane_id,
      controllerPane: task?.controller?.pane || r.controller?.pane || null,
      task, role: r
    });
  }

  for (const p of (snap.managed_panes || []).filter(x => x.project_id === projectId && !x.role && !boundPanes.has(x.pane_id))){
    const task = taskForPane(p);
    if (task) seenTasks.add(task.task);
    items.push({
      nodeId: 'pane:' + p.pane_id,
      itemKind: 'pane',
      name: p.alias || p.name || p.pane_id,
      desc: '临时交互工位' + (p.adopted ? '（已纳管）' : ''),
      projectId: p.project_id,
      status: paneDisplayStatus(p, task),
      perm: task?.perm || p.perm || 'ask',
      kind: p.kind || 'codex',
      model: p.model || '',
      bindingMode: 'pane',
      paneId: p.pane_id,
      controllerPane: task?.controller?.pane || p.controller?.pane || null,
      task, pane: p
    });
  }

  for (const t of (snap.tasks || []).filter(x => x.project_id === projectId && !TERMINAL_STATES.has(x.state) && !seenTasks.has(x.task))){
    items.push({
      nodeId: 'task:' + t.task,
      itemKind: 'task',
      name: t.name || t.task,
      desc: t.mode === 'headless' ? '一次性无头任务' : '活跃任务',
      projectId: t.project_id,
      status: t.state === 'submitted' ? 'working' : t.state,
      perm: t.perm || 'ask',
      kind: t.kind || 'codex',
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
  const paneMeta = new Map();
  for (const a of (snap.unmanaged_live_agents || [])) paneMeta.set(a.pane_id, a);
  for (const p of (snap.managed_panes || [])) paneMeta.set(p.pane_id, p);

  const ids = new Set(project.controllers || []);
  for (const w of workers) if (w.controllerPane) ids.add(w.controllerPane);
  const paused = new Set(snap.paused_recipients || []);

  const list = [...ids].map((paneId, idx) => {
    const info = paneMeta.get(paneId);
    const queued = (snap.queue || []).filter(q => PENDING_QUEUE.has(q.state) && q.recipient?.pane === paneId);
    const typing = queued.some(q => q.state === 'deferred_user_typing');
    const isPaused = paused.has(paneId);
    return {
      nodeId: 'ctrl:' + project.project_id + ':' + paneId,
      paneId, projectId: project.project_id,
      name: info?.name || info?.alias || ('主控 ' + String.fromCharCode(65 + idx)),
      kind: info?.kind || 'agent',
      status: info?.agent_status || 'idle',
      typing, paused: isPaused, queuedCount: queued.length
    };
  });
  return list;
}

function allVisibleWorkers(){
  return visibleProjects().flatMap(p => buildProjectWorkers(p.project_id));
}

function computeDagLayout(){
  const projs = visibleProjects();
  const lanes = [], nodes = [], edges = [];
  let cursorY = 18;
  const colX = { ctrl: 32, role: 454, fallback: 938 };

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

    const roleH = w => w.status === 'blocked' ? 182 : (w.status === 'scheduled_retry' || w.status === 'retrying') ? 174 : w.status === 'unbound' ? 132 : 162;
    const ctrlH = 118, gapY = 18;

    let ry = cursorY + 84;
    const centersByCtrl = new Map();
    const roleNodes = [];
    for (const w of workers){
      const h = roleH(w);
      const off = state.dag.offsets[w.nodeId] || { dx: 0, dy: 0 };
      const rn = { kind: 'worker', id: w.nodeId, data: w, x: 20 + colX.role + off.dx, y: ry + off.dy, w: 336, h };
      roleNodes.push(rn);
      if (w.controllerPane){
        const arr = centersByCtrl.get(w.controllerPane) || [];
        arr.push(ry + h / 2);
        centersByCtrl.set(w.controllerPane, arr);
      }
      ry += h + gapY;
    }

    const rolesBottom = workers.length ? ry - gapY : cursorY + 190;
    let lastCtrlBottom = cursorY + 84 - gapY;
    for (const c of ctrls){
      const ys = centersByCtrl.get(c.paneId);
      const desiredY = ys && ys.length ? ((Math.min(...ys) + Math.max(...ys)) / 2 - ctrlH / 2) : (lastCtrlBottom + gapY);
      const baseY = Math.max(cursorY + 84, lastCtrlBottom + gapY, desiredY);
      lastCtrlBottom = baseY + ctrlH;
      const off = state.dag.offsets[c.nodeId] || { dx: 0, dy: 0 };
      nodes.push({ kind: 'ctrl', id: c.nodeId, data: c, x: 20 + colX.ctrl + off.dx, y: baseY + off.dy, w: 268, h: ctrlH });
    }

    const bodyBottom = Math.max(rolesBottom, lastCtrlBottom);
    const laneW = hasFallback ? 1236 : 826;
    const laneH = (bodyBottom - cursorY) + 24;
    lanes.push({ project: p, x: 20, y: cursorY, w: laneW, h: laneH, hasFallback, ctrlCount: ctrls.length, roleCount: workers.length });

    for (const rn of roleNodes){
      nodes.push(rn);
      const w = rn.data;
      if (w.controllerPane){
        const ctrlId = 'ctrl:' + p.project_id + ':' + w.controllerPane;
        const edgeCls = w.status === 'blocked' ? 'blocked' : w.status === 'working' ? 'working' : (w.status === 'retrying' || w.status === 'scheduled_retry') ? 'retry' : 'idle';
        const permShort = w.perm === 'auto-workspace' ? 'auto-ws' : w.perm;
        edges.push({ from: ctrlId, to: w.nodeId, cls: edgeCls, label: permShort + (w.task?.turn ? ' · #' + w.task.turn : '') });
      }
      if ((w.status === 'retrying' || w.status === 'scheduled_retry') && w.task?.fallback?.length){
        const fid = 'fb:' + w.nodeId;
        const foff = state.dag.offsets[fid] || { dx: 0, dy: 0 };
        const chain = w.task.fallback.map(f => f.channel || f.kind);
        nodes.push({
          kind: 'fallback', id: fid, workerId: w.nodeId,
          data: { title: '回退链 · ' + chain[0], chain, retries: w.task.retries || 1, eta: fmtEta(w.task.nextAt, getSnap().now) },
          x: 20 + colX.fallback + foff.dx, y: rn.y + 18 + foff.dy, w: 264, h: 134
        });
        edges.push({ from: w.nodeId, to: fid, cls: 'fallback', label: 'fallback' });
      }
    }
    cursorY += laneH + 22;
  }

  return { lanes, nodes, edges, totalH: Math.max(cursorY + 24, 300), totalW: Math.max(...lanes.map(l => l.x + l.w), 960) + 40 };
}

/* ==================== RENDER TOPBAR & FOCUS ==================== */
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
  document.getElementById('theme-btn').innerHTML = ic(isDark ? 'sun' : 'moon');

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
      blocked.map(t => '<div class="fi"><div class="fi-icon">' + ic('shield') + '</div><div class="fi-body"><div class="fi-title"><b>' + esc(t.role || t.name || t.task) + '</b> 等待授权 <span class="tag">' + esc(projectName(t.project_id)) + '</span></div><div class="fi-code">' + esc(t.block?.reason || t.block?.kind || 'permission_prompt') + '</div></div><div class="fi-actions"><button class="btn sm ghost" data-action="openTask" data-id="' + esc(t.task) + '">' + ic('terminal','sm') + '现场</button><button class="btn sm" data-action="denyTask" data-id="' + esc(t.task) + '">拒绝</button><button class="btn sm primary" data-action="approveTask" data-id="' + esc(t.task) + '">' + ic('check','sm') + '批准</button></div></div>').join('') +
      deferred.map(q => '<div class="fi"><div class="fi-icon">' + ic('keyboard') + '</div><div class="fi-body"><div class="fi-title"><b>' + esc(q.worker || q.task) + '</b> 回执暂缓 <span class="tag">' + esc(q.recipient?.pane || '') + '</span></div><div class="fi-sub">' + esc(q.note || q.status || q.state) + '</div></div><div class="fi-actions"><button class="btn sm" data-action="consumeQueue" data-id="' + esc(q.event_id) + '">' + ic('eye','sm') + '仅阅</button><button class="btn sm primary" data-action="pushQueue" data-id="' + esc(q.event_id) + '">' + ic('zap','sm') + '强推</button></div></div>').join('') +
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

/* ==================== DAG WORKSPACE ==================== */
function renderDagView(){
  const snap = getSnap();
  const layout = computeDagLayout();
  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));

  let svgPaths = '', edgeBadges = '';
  for (const e of layout.edges){
    const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
    if (!a || !b) continue;
    const x1 = a.x + a.w, y1 = a.y + a.h / 2;
    const x2 = b.x, y2 = b.y + b.h / 2;
    const dx = Math.max(46, Math.abs(x2 - x1) * 0.45);
    const d = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
    const stroke = e.cls === 'blocked' ? 'var(--warn)' : e.cls === 'working' ? 'var(--accent)' : (e.cls === 'retry' || e.cls === 'fallback') ? 'var(--retry)' : 'var(--border-strong)';
    svgPaths += '<path class="edge-path ' + e.cls + '" d="' + d + '"/>';
    svgPaths += '<circle cx="' + x1 + '" cy="' + y1 + '" r="3.5" fill="var(--surface)" stroke="' + stroke + '" stroke-width="2"/>';
    svgPaths += '<circle cx="' + x2 + '" cy="' + y2 + '" r="3.5" fill="' + stroke + '"/>';
    edgeBadges += '<div class="edge-badge ' + e.cls + '" style="left:' + ((x1+x2)/2) + 'px;top:' + ((y1+y2)/2) + 'px">' + esc(e.label) + '</div>';
  }

  const lanesHtml = layout.lanes.map(l =>
    '<div class="dag-lane" style="left:' + l.x + 'px;top:' + l.y + 'px;width:' + l.w + 'px;height:' + l.h + 'px">' +
      '<div class="dag-lane-head">' +
        '<div class="dag-lane-title">' + ic('folder') + '<span>' + esc(l.project.name) + '</span><span class="tag mono">' + esc(l.project.source || 'project') + '</span></div>' +
        '<div class="dag-lane-meta"><span>' + l.ctrlCount + ' 主控</span><span>·</span><span>' + l.roleCount + ' 角色/工位</span><span class="mono">' + esc(shortPath(l.project.root)) + '</span></div>' +
      '</div>' +
      '<div class="dag-col-labels">' +
        '<span class="dag-col-label" style="left:32px">' + ic('compass','sm') + '主控会话 (Controllers)</span>' +
        '<span class="dag-col-label" style="left:454px">' + ic('layers','sm') + '项目角色与执行工位 (Roles)</span>' +
        (l.hasFallback ? '<span class="dag-col-label" style="left:938px">' + ic('refresh','sm') + '活跃回退链 (Fallback)</span>' : '') +
      '</div>' +
    '</div>'
  ).join('');

  const nodesHtml = layout.nodes.map(n => {
    const sel = state.drawer?.nodeId === n.id ? 'selected' : '';
    if (n.kind === 'ctrl'){
      const c = n.data;
      const badgeCls = c.typing || c.paused ? 'warn' : 'ok';
      const badgeTxt = c.paused ? '已暂停' : c.typing ? '输入中' : '就绪';
      return '<div class="dag-node ctrl ' + sel + '" data-node-id="' + esc(c.nodeId) + '" data-node-kind="ctrl" style="left:' + n.x + 'px;top:' + n.y + 'px;min-height:' + n.h + 'px">' +
        '<div class="dn-head"><div class="dn-title">' + ic('compass') + '<span>' + esc(c.name) + '</span></div><span class="pill ' + badgeCls + '">' + badgeTxt + '</span></div>' +
        '<div class="dn-sub">' + esc(c.kind) + ' · <span class="mono">' + esc(c.paneId) + '</span></div>' +
        '<div class="dn-foot"><span class="dn-foot-left">' + (c.queuedCount ? '候投回执 ' + c.queuedCount + ' 条' : '回执通道畅通') + '</span><span class="mono">' + esc(c.status) + '</span></div>' +
      '</div>';
    }
    if (n.kind === 'fallback'){
      const fb = n.data;
      return '<div class="dag-node fallback" data-node-id="' + esc(n.id) + '" data-node-kind="fallback" data-worker-id="' + esc(n.workerId) + '" style="left:' + n.x + 'px;top:' + n.y + 'px;min-height:' + n.h + 'px">' +
        '<div class="dn-head"><div class="dn-title">' + ic('refresh') + '<span>' + esc(fb.title) + '</span></div><span class="pill retry">#' + esc(fb.retries) + '</span></div>' +
        '<div class="dn-sub" style="margin-top:6px">回退顺序：' + esc(fb.chain.join(' → ')) + '</div>' +
        '<div class="dn-foot"><span>' + esc(fb.eta) + '</span><span style="color:var(--retry);font-weight:600">自动接管</span></div>' +
      '</div>';
    }
    const w = n.data;
    const st = ST[w.status] || ST.idle;
    const stCls = w.status === 'blocked' ? 'st-blocked' : w.status === 'working' ? 'st-working' : (w.status === 'retrying' || w.status === 'scheduled_retry') ? 'st-retry' : w.status === 'offline' ? 'st-offline' : w.status === 'unbound' ? 'st-unbound' : '';
    const bindText = w.bindingMode === 'unbound'
      ? ic('link','sm') + '待命 · 默认 ' + esc(w.kind)
      : w.bindingMode === 'headless'
        ? ic('cpu','sm') + '无头 · ' + esc(w.kind) + (w.model ? ' · ' + esc(w.model) : '')
        : ic('monitor','sm') + esc(w.kind) + (w.paneId ? ' · ' + esc(w.paneId) : '');

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

    return '<div class="dag-node role ' + stCls + ' ' + sel + '" data-node-id="' + esc(w.nodeId) + '" data-node-kind="worker" style="left:' + n.x + 'px;top:' + n.y + 'px;min-height:' + n.h + 'px">' +
      '<div class="dn-head"><div class="dn-title"><span>' + esc(w.name) + '</span></div><span class="pill ' + st.c + '"><span class="dot ' + st.c + '"></span>' + st.label + '</span></div>' +
      '<div class="dn-sub">' + esc(w.desc) + '</div>' +
      mid +
      '<div class="dn-foot"><span class="dn-foot-left">' + bindText + '</span><span class="tag">' + ic('shield','sm') + esc(w.perm === 'auto-workspace' ? 'auto-ws' : w.perm) + '</span></div>' +
    '</div>';
  }).join('');

  const unm = (snap.unmanaged_live_agents || []).filter(a => {
    if (state.project !== 'all' && a.project_id !== state.project) return false;
    return !(snap.projects || []).some(p => (p.controllers || []).includes(a.pane_id));
  });
  const unmHtml = !unm.length ? '' : '<div class="unmanaged-box"><div class="unm-head"><div class="unm-title">' + ic('monitor') + '未纳管在线窗格（Herdr 实时在线）<span class="tag">' + unm.length + '</span></div><span style="font-size:13px;color:var(--text-3)">会话退出后自动移出；可一键纳管或绑定到项目角色</span></div><div class="unm-grid">' +
    unm.map(a => '<div class="unm-item"><div class="unm-info"><div class="unm-name"><span class="dot ok"></span><span class="mono">' + esc(a.pane_id) + '</span><span>' + esc(a.kind) + '</span><span class="tag">' + esc(projectName(a.project_id)) + '</span></div><div class="unm-sub mono">' + esc(a.agent_status) + ' · ' + esc(shortPath(a.cwd)) + '</div></div><div style="display:flex;gap:6px"><button class="btn sm" data-action="openBindPane" data-pane="' + esc(a.pane_id) + '" data-proj="' + esc(a.project_id) + '">绑定角色</button><button class="btn sm primary" data-action="adoptPane" data-pane="' + esc(a.pane_id) + '" data-proj="' + esc(a.project_id) + '">纳管</button></div></div>').join('') +
  '</div></div>';

  const emptyHtml = layout.lanes.length ? '' :
    '<div class="empty-canvas"><div class="empty-card"><div style="margin-bottom:10px;color:var(--accent)">' + ic('dag','lg') + '</div><div style="font-size:16px;font-weight:700;margin-bottom:6px">当前暂无项目角色或活跃派发</div><div style="font-size:13.5px;color:var(--text-3);margin-bottom:16px">点击右上角「新建角色」创建固定分工，或从下方未纳管窗格一键纳管，派发后这里将实时绘制主控与角色的拓扑结构。</div><div style="display:flex;justify-content:center;gap:8px"><button class="btn" data-action="openNewRole">' + ic('user-plus','sm') + '新建角色</button><button class="btn primary" data-action="openDispatch">' + ic('send','sm') + '派发任务</button></div></div></div>';

  return '<div class="dag-shell ' + (state.dag.expanded ? 'expanded' : '') + '" id="dag-shell">' +
    emptyHtml +
    '<div class="dag-stage" id="dag-stage" style="transform:translate(' + state.dag.tx + 'px,' + state.dag.ty + 'px) scale(' + state.dag.scale + ')">' +
      lanesHtml + '<svg class="dag-svg">' + svgPaths + '</svg>' + edgeBadges + nodesHtml +
    '</div>' +
    '<div class="dag-hint">拖拽空白平移 · 滚轮缩放 · 拖动节点排布 · 点击查看详情 · 右键快捷操作</div>' +
    '<div class="dag-controls">' +
      '<button data-action="dagZoomOut" title="缩小">−</button>' +
      '<span class="dag-zoom-val" id="dag-zoom-val">' + Math.round(state.dag.scale * 100) + '%</span>' +
      '<button data-action="dagZoomIn" title="放大">+</button>' +
      '<button data-action="dagFit">适配</button>' +
      '<button data-action="dagReset">重置</button>' +
      '<button data-action="dagExpand" title="' + (state.dag.expanded ? '退出全屏画布' : '全屏展开画布') + '">' + ic(state.dag.expanded ? 'minimize' : 'maximize','sm') + '</button>' +
    '</div>' +
  '</div>' + unmHtml;
}

function renderCardsView(){
  const projs = visibleProjects();
  if (!projs.length) return '<div class="box" style="color:var(--text-3)">暂无项目数据</div>';
  return projs.map(p => {
    const workers = buildProjectWorkers(p.project_id);
    const ctrls = buildProjectControllers(p, workers);
    return '<div class="proj-section">' +
      '<div class="proj-head"><div class="proj-title">' + ic('folder','lg') + '<span>' + esc(p.name) + '</span><span class="proj-meta mono">' + esc(shortPath(p.root)) + '</span></div><div style="display:flex;gap:8px"><button class="btn sm" data-action="openNewRole">' + ic('plus','sm') + '新建角色</button><button class="btn sm" data-action="openDispatch">' + ic('send','sm') + '派发任务</button></div></div>' +
      (ctrls.length ? '<div class="ctrl-row">' + ctrls.map(c => '<div class="ctrl-chip" data-action="openCtrl" data-id="' + esc(c.nodeId) + '">' + ic('compass','sm') + '<b>' + esc(c.name) + '</b><span>' + esc(c.kind) + ' · <span class="mono">' + esc(c.paneId) + '</span></span>' + (c.typing ? '<span class="pill warn">输入中</span>' : c.paused ? '<span class="pill warn">已暂停</span>' : '') + '</div>').join('') + '</div>' : '') +
      '<div class="role-grid">' + (workers.length ? workers.map(w => {
        const st = ST[w.status] || ST.idle;
        return '<div class="role-card ' + (w.status==='blocked'?'st-blocked':w.status==='unbound'?'st-unbound':w.status==='offline'?'st-offline':'') + '" data-action="openWorker" data-id="' + esc(w.nodeId) + '">' +
          '<div class="dn-head"><div class="dn-title">' + esc(w.name) + '</div><span class="pill ' + st.c + '"><span class="dot ' + st.c + '"></span>' + st.label + '</span></div>' +
          '<div class="dn-sub">' + esc(w.desc) + '</div>' +
          (w.task ? '<div class="dn-task"><div class="dn-task-top"><span>' + esc(w.task.task) + '</span><span class="menu-meta">第 ' + esc(w.task.turn || 1) + ' 轮</span></div><div class="dn-task-note">' + esc(w.task.block?.reason || w.task.note || w.task.reason || st.label) + '</div></div>'
            : w.status === 'unbound' && w.role ? '<div style="margin-top:12px"><button class="btn sm primary" data-action="openSwap" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">' + ic('plus','sm') + '绑定或启动</button></div>' : '') +
          '<div class="dn-foot" style="margin-top:auto"><span>' + (w.bindingMode==='unbound'?'未绑定':esc(w.kind + (w.paneId ? ' · ' + w.paneId : ' · 无头'))) + '</span><span class="tag">' + esc(w.perm === 'auto-workspace' ? 'auto-ws' : w.perm) + '</span></div>' +
        '</div>';
      }).join('') : '<div class="box" style="color:var(--text-3)">该项目尚未配置角色</div>') + '</div></div>';
  }).join('');
}

function renderQueueView(){
  const snap = getSnap();
  const pending = (snap.queue || []).filter(q => PENDING_QUEUE.has(q.state));
  const retries = (snap.scheduled_retries || []).filter(r => r.state === 'pending' || r.state === 'running');
  const paused = snap.paused_recipients || [];
  return '<h2 class="section-h">投递队列与重试</h2>' +
    '<p class="section-sub">控制回执投递与退避重试。「强推」立即注入目标窗格；「仅阅」标记为已消费不打断终端输入；「丢弃」撤销投递。</p>' +
    (paused.length ? '<div class="box warn" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><b>免打扰暂停中的收件窗格：</b>' + paused.map(p => '<span class="tag mono">' + esc(p) + '</span>').join(' ') + '</div><div style="display:flex;gap:6px">' + paused.map(p => '<button class="btn sm" data-action="resumeRecipient" data-pane="' + esc(p) + '">恢复 ' + esc(p) + '</button>').join('') + '</div></div>' : '') +
    '<div class="q-group"><div class="q-group-title">' + ic('keyboard','sm') + '候投回执队列 · ' + pending.length + '</div>' +
    (pending.length ? pending.map(q => '<div class="q-card"><div class="q-left"><div class="q-icon warn">' + ic('keyboard') + '</div><div><div class="q-title">' + esc(q.worker || q.task) + ' → ' + esc(q.recipient?.label || q.recipient?.pane || '') + ' <span class="tag">' + esc(q.task) + '#' + esc(q.turn || 1) + '</span></div><div class="q-desc">' + esc(q.note || q.status || q.type) + '</div><div class="q-meta"><span>状态：' + esc(q.state) + '</span><span>入队 ' + esc(fmtClock(q.created)) + '</span></div></div></div><div class="q-right"><span class="pill warn">' + esc(q.state) + '</span><div class="q-btns"><button class="btn sm danger-ghost" data-action="dropQueue" data-id="' + esc(q.event_id) + '">' + ic('trash','sm') + '丢弃</button><button class="btn sm" data-action="consumeQueue" data-id="' + esc(q.event_id) + '">' + ic('eye','sm') + '仅阅</button><button class="btn sm primary" data-action="pushQueue" data-id="' + esc(q.event_id) + '">' + ic('zap','sm') + '强推</button></div></div></div>').join('') : '<div class="box" style="color:var(--text-3)">当前无候投回执</div>') +
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

/* ==================== DRAWER ==================== */
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

function renderDrawer(){
  const scrim = document.getElementById('scrim'), drawer = document.getElementById('drawer');
  if (!state.drawer){ scrim.classList.remove('open'); drawer.classList.remove('open'); return; }
  scrim.classList.add('open'); drawer.classList.add('open');

  if (state.drawer.kind === 'ctrl'){
    const c = findCtrlByNodeId(state.drawer.nodeId);
    if (!c){ state.drawer = null; return renderDrawer(); }
    drawer.innerHTML = '<div class="dr-head"><div class="dr-top"><div><div class="dr-crumb">' + ic('folder','sm') + esc(projectName(c.projectId)) + ' · 主控会话</div><div class="dr-name">' + esc(c.name) + ' <span class="pill ' + (c.paused||c.typing?'warn':'ok') + '">' + (c.paused?'已暂停投递':c.typing?'正在输入':'投递就绪') + '</span></div><div class="dr-desc">' + esc(c.kind) + ' · <span class="mono">' + esc(c.paneId) + '</span></div></div><button class="btn icon ghost" data-action="closeDrawer">' + ic('x') + '</button></div><div class="dr-tabs"><button class="active">概览</button></div></div>' +
      '<div class="dr-body"><div class="box"><div class="box-h">收件免打扰控制</div><p style="margin:0 0 12px;color:var(--text-2)">开启暂停后，所有发往该主控窗格的回执都会进入候投队列，不会自动注入终端。</p><div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (c.paused ? '<button class="btn primary" data-action="resumeRecipient" data-pane="' + esc(c.paneId) + '">恢复自动投递</button>' : '<button class="btn" data-action="pauseRecipient" data-pane="' + esc(c.paneId) + '">开启免打扰暂停</button>') +
      '<button class="btn" data-action="flushPane" data-pane="' + esc(c.paneId) + '">Flush 消费队列</button></div></div></div>';
    return;
  }

  const w = findWorkerByNodeId(state.drawer.nodeId);
  if (!w){ state.drawer = null; return renderDrawer(); }
  const st = ST[w.status] || ST.idle;
  const tab = state.drawer.tab || 'overview';
  const task = w.task;
  const targetForPerm = task?.task || w.paneId || w.name;
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
        (w.paneId ? '<div class="keybar"><span style="font-size:12.5px;color:var(--text-3);margin-right:4px">直控按键 (' + esc(w.paneId) + '):</span>' +
          [['Enter','enter'],['Esc','esc'],['↑','up'],['↓','down'],['Tab','tab'],['Ctrl+C','ctrl+c']].map(([lbl,k]) => '<button class="keybtn" data-action="sendKey" data-target="' + esc(task.task) + '" data-key="' + k + '">' + lbl + '</button>').join('') +
        '</div><div class="term-input-row"><input id="term-text-input" placeholder="向终端发送文本并回车..."><button class="btn sm primary" data-action="sendTermText" data-target="' + esc(task.task) + '">发送</button></div>' : '') +
      '</div>';
    }

    bodyHtml += '<div class="box"><div class="box-h"><span>会话绑定与热替换</span>' +
      (w.role ? '<button class="btn sm primary" data-action="openSwap" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">' + ic('swap','sm') + '热替换会话 / 模型</button>' : '') +
      '</div><div style="font-size:14px;color:var(--text-2);display:grid;gap:6px">' +
      '<div>底层方式：<b>' + (w.bindingMode==='unbound'?'未绑定（待命）':w.bindingMode==='headless'?'无头执行器':'Herdr 交互窗格 ' + esc(w.paneId || '')) + '</b></div>' +
      '<div>Harness / 模型：<b>' + esc(w.kind) + (w.model ? ' · ' + esc(w.model) : '') + '</b></div>' +
      '<div style="font-size:13px;color:var(--text-3)">热替换底层会话后，现有任务线程（--task）与 .chflow/ 信箱历史无缝保留。</div>' +
    '</div></div>';

    if (w.bindingMode !== 'unbound'){
      bodyHtml += '<div class="box"><div class="box-h"><span>实时权限档位</span><span class="tag">' + esc(w.perm) + '</span></div><div class="perm-grid">' +
        PERMS.map(p => '<button class="perm-btn ' + (w.perm===p.id?'active':'') + '" data-action="setPerm" data-target="' + esc(targetForPerm) + '" data-perm="' + p.id + '">' + p.zh + '</button>').join('') +
      '</div><div style="font-size:13px;color:var(--text-3)">' + esc(permInfo.desc) + '</div></div>';
    }

    bodyHtml += '<div class="box"><div class="box-h"><span>' + (task ? '当前任务 · ' + esc(task.task) : '角色与工位操作') + '</span>' + (task ? '<button class="btn sm ghost" data-action="drawerTab" data-tab="mail">打开信箱 →</button>' : '') + '</div>' +
      (task ? '<div style="font-size:13.5px;color:var(--text-2);margin-bottom:10px">状态：<b>' + esc(task.state) + '</b> · 第 ' + esc(task.turn || 1) + ' 轮' + (task.note ? ' · ' + esc(task.note) : '') + '</div>' : '<div style="font-size:13.5px;color:var(--text-3);margin-bottom:10px">当前无活跃任务，可直接派发新任务。</div>') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn sm primary" data-action="openDispatch" data-target="' + esc(w.role ? w.role.role : (w.paneId || '')) + '" data-proj="' + esc(w.projectId) + '">' + ic('send','sm') + (task ? '继续追问' : '派发任务') + '</button>' +
        (task ? '<button class="btn sm" data-action="finishTask" data-id="' + esc(task.task) + '">' + ic('check','sm') + '验收结单</button><button class="btn sm danger-ghost" data-action="cancelTask" data-id="' + esc(task.task) + '">取消任务</button>' : '') +
        (w.role && w.bindingMode !== 'unbound' ? '<button class="btn sm danger-ghost" data-action="unbindRole" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">解绑会话</button>' : '') +
        (w.role && w.role.source !== 'config' ? '<button class="btn sm danger-ghost" data-action="removeRole" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">移除角色</button>' : '') +
      '</div></div>';
  } else if (tab === 'mail'){
    if (!task){
      bodyHtml = '<div class="box" style="color:var(--text-3)">当前无关联任务信箱。</div>';
    } else {
      const maxTurn = Math.max(1, Number(task.turn || 1));
      const curTurn = Math.min(maxTurn, Math.max(1, Number(state.drawer.turn || maxTurn)));
      const bKey = task.task + ':brief:' + curTurn, oKey = task.task + ':out:' + curTurn;
      if (state.fileCache[bKey] === undefined) void loadTaskFile(task.task, 'brief', curTurn);
      if (state.fileCache[oKey] === undefined) void loadTaskFile(task.task, 'out', curTurn);
      let btns = '';
      for (let i = 1; i <= maxTurn; i++) btns += '<button class="btn sm ' + (i===curTurn?'primary':'') + '" data-action="drawerTurn" data-turn="' + i + '">第 ' + i + ' 轮</button>';
      bodyHtml = '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">' + btns + '</div>' +
        '<div class="box"><div class="box-h">任务书（t' + curTurn + '-brief.md）</div><div class="mail-pre">' + esc(state.fileCache[bKey] || '正在加载...') + '</div></div>' +
        '<div class="box"><div class="box-h">交付回执（t' + curTurn + '-reply.md）</div><div class="mail-pre">' + esc(state.fileCache[oKey] || '正在加载...') + '</div></div>';
    }
  } else {
    const logs = (getSnap().audit || []).filter(e => !task || e.task === task.task).slice().reverse().slice(0, 20);
    bodyHtml = logs.length ? '<div class="audit-list">' + logs.map(e => '<div class="audit-row"><span class="audit-time mono">' + esc(fmtClock(e.at)) + '</span><span class="pill idle">' + esc(e.event) + '</span><span>' + esc(e.detail || '') + '</span></div>').join('') + '</div>'
      : '<div class="box" style="color:var(--text-3)">暂无相关审计事件。</div>';
  }

  drawer.innerHTML = '<div class="dr-head"><div class="dr-top"><div>' +
    '<div class="dr-crumb">' + ic('folder','sm') + esc(projectName(w.projectId)) + ' · ' + (w.role ? '项目角色' : '工位') + '</div>' +
    '<div class="dr-name">' + esc(w.name) + ' <span class="pill ' + st.c + '"><span class="dot ' + st.c + '"></span>' + st.label + '</span></div>' +
    '<div class="dr-desc">' + esc(w.desc) + '</div>' +
    '</div><button class="btn icon ghost" data-action="closeDrawer">' + ic('x') + '</button></div>' +
    '<div class="dr-tabs"><button class="' + (tab==='overview'?'active':'') + '" data-action="drawerTab" data-tab="overview">概览</button><button class="' + (tab==='mail'?'active':'') + '" data-action="drawerTab" data-tab="mail">任务信箱</button><button class="' + (tab==='activity'?'active':'') + '" data-action="drawerTab" data-tab="activity">活动记录</button></div></div>' +
    '<div class="dr-body">' + bodyHtml + '</div>';
}

/* ==================== MODALS ==================== */
function openModal(title, bodyHtml, footerHtml){
  document.getElementById('modal-root').innerHTML = '<div class="modal-back" data-action="closeModal"><div class="modal" onclick="event.stopPropagation()"><div class="modal-h"><span>' + title + '</span><button class="btn icon ghost" data-action="closeModal">' + ic('x') + '</button></div><div class="modal-b">' + bodyHtml + '</div><div class="modal-f">' + footerHtml + '</div></div></div>';
}
function closeModal(){ document.getElementById('modal-root').innerHTML = ''; }

function openStopModal(){
  const activeCount = (getSnap().tasks || []).filter(t => !TERMINAL_STATES.has(t.state)).length;
  openModal('停止后台 Daemon 服务',
    (activeCount ? '<div class="box warn" style="margin-bottom:14px"><b>注意：当前仍有 ' + activeCount + ' 个活跃任务。</b><div style="font-size:13px;color:var(--text-2);margin-top:4px">停止 Daemon 不会关闭 Herdr 终端窗格，但会中止回执队列投递与本控制台监听。</div></div>' : '<p style="margin:0 0 10px">当前无活跃任务，可以安全停止后台 Daemon。</p>') +
    '<p style="margin:0;font-size:13.5px;color:var(--text-3)">停止后页面将断开连接且不再自动重连；CLI 中也可随时使用 <code>chflow stop</code> 或 <code>chflow quit</code>。</p>',
    '<button class="btn" data-action="closeModal">取消</button><button class="btn danger" data-action="confirmStopDaemon" data-force="' + (activeCount ? '1' : '0') + '">' + ic('power','sm') + (activeCount ? '强制停止服务' : '确认停止服务') + '</button>'
  );
}

function openSwapModal(role, projectId){
  const r = (getSnap().roles || []).find(x => x.role === role && x.project_id === projectId);
  const unm = getSnap().unmanaged_live_agents || [];
  openModal('热替换角色会话 · ' + esc(role),
    '<div class="field"><label>绑定方式</label><select id="sw-mode"><option value="spawn">新开 Herdr 交互窗格并绑定</option><option value="headless">切换至无头执行器 (Headless)</option>' + (unm.length ? '<option value="pane">绑定已有在线窗格</option>' : '') + '</select></div>' +
    (unm.length ? '<div class="field"><label>已有在线窗格（仅“绑定已有窗格”生效）</label><select id="sw-pane">' + unm.map(a => '<option value="' + esc(a.pane_id) + '">' + esc(a.pane_id + ' · ' + a.kind + ' (' + shortPath(a.cwd) + ')') + '</option>').join('') + '</select></div>' : '') +
    '<div class="field-row"><div class="field"><label>目标 Harness</label><select id="sw-kind">' + ['codex','claude','pi','agy'].map(k => '<option value="' + k + '" ' + ((r?.kind||r?.default_kind)===k?'selected':'') + '>' + k + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>模型（可选）</label><input id="sw-model" value="' + esc(r?.model || '') + '" placeholder="留空沿用默认"></div></div>' +
    '<label class="check-row"><input type="checkbox" id="sw-close-old" checked> 替换完成后关闭旧的空闲窗格</label>',
    '<button class="btn" data-action="closeModal">取消</button><button class="btn primary" data-action="confirmSwap" data-role="' + esc(role) + '" data-proj="' + esc(projectId) + '">' + ic('swap','sm') + '确认热替换</button>'
  );
}

function openNewRoleModal(){
  const projs = getSnap().projects || [];
  const defProj = state.project !== 'all' ? state.project : (projs[0]?.project_id || '');
  openModal('新建项目角色槽位',
    '<div class="field"><label>所属项目</label><select id="nr-proj">' + (projs.length ? projs.map(p => '<option value="' + esc(p.project_id) + '" ' + (p.project_id===defProj?'selected':'') + '>' + esc(p.name) + '</option>').join('') : '<option value="">当前默认项目</option>') + '</select></div>' +
    '<div class="field-row"><div class="field"><label>角色名（小写字母/数字/-）</label><input id="nr-name" placeholder="reviewer"></div><div class="field"><label>默认 Harness</label><select id="nr-kind"><option value="codex">codex</option><option value="claude">claude</option><option value="pi">pi</option><option value="agy">agy</option></select></div></div>' +
    '<div class="field"><label>职责说明</label><input id="nr-desc" placeholder="异构代码与安全审查"></div>' +
    '<div class="field-row"><div class="field"><label>默认权限档位</label><select id="nr-perm"><option value="ask">ask（逐项询问）</option><option value="readonly">readonly（只读）</option><option value="auto-workspace">auto-workspace（工作区自动）</option><option value="yolo">yolo（完全放行）</option></select></div><div class="field"><label>默认模型（可选）</label><input id="nr-model" placeholder="留空用默认"></div></div>' +
    '<label class="check-row"><input type="checkbox" id="nr-wt"> 启动时默认启用独立 Git Worktree 隔离</label>',
    '<button class="btn" data-action="closeModal">取消</button><button class="btn primary" data-action="confirmNewRole">创建角色</button>'
  );
}

function openDispatchModal(preTarget, preProj){
  const roles = getSnap().roles || [];
  const panes = getSnap().managed_panes || [];
  const opts = [
    ...roles.map(r => '<option value="role:' + esc(r.project_id) + ':' + esc(r.role) + '" ' + (preTarget===r.role&&(!preProj||preProj===r.project_id)?'selected':'') + '>角色 ' + esc(projectName(r.project_id) + ' / ' + r.role + ' (' + r.binding_mode + ')') + '</option>'),
    ...panes.filter(p => !p.role).map(p => '<option value="pane:' + esc(p.project_id) + ':' + esc(p.pane_id) + '" ' + (preTarget===p.pane_id?'selected':'') + '>窗格 ' + esc((p.alias || p.pane_id) + ' (' + p.kind + ')') + '</option>')
  ];
  openModal('派发任务',
    '<div class="field"><label>目标角色或工位</label><select id="dp-target">' + (opts.length ? opts.join('') : '<option value="">请先创建角色或纳管窗格</option>') + '</select></div>' +
    '<div class="field"><label>任务书正文（将自动写入 .chflow/ 文件信箱）</label><textarea id="dp-brief" placeholder="清晰描述目标、验收标准与可写范围..."></textarea></div>' +
    '<label class="check-row"><input type="checkbox" id="dp-spawn" checked> 若角色处于待命（unbound），自动按预设拉起并绑定</label>',
    '<button class="btn" data-action="closeModal">取消</button><button class="btn primary" data-action="confirmDispatch">' + ic('send','sm') + '立即派发</button>'
  );
}

function openBindPaneModal(paneId, projectId){
  const roles = (getSnap().roles || []).filter(r => !projectId || r.project_id === projectId);
  openModal('绑定在线窗格 ' + esc(paneId) + ' 到角色',
    roles.length
      ? '<div class="field"><label>选择目标角色</label><select id="bp-role">' + roles.map(r => '<option value="' + esc(r.project_id) + '::' + esc(r.role) + '">' + esc(projectName(r.project_id) + ' / ' + r.role + ' (' + r.binding_mode + ')') + '</option>').join('') + '</select></div>'
      : '<p style="margin:0;color:var(--text-2)">该项目暂无角色槽位，请先点击「新建角色」或直接「纳管」该窗格。</p>',
    '<button class="btn" data-action="closeModal">取消</button>' + (roles.length ? '<button class="btn primary" data-action="confirmBindPane" data-pane="' + esc(paneId) + '">确认绑定</button>' : '')
  );
}

/* ==================== MAIN RENDER & DAG INTERACTIONS ==================== */
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
        const layout = computeDagLayout();
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

function bindDagInteractions(){
  const shell = document.getElementById('dag-shell'), stage = document.getElementById('dag-stage');
  if (!shell || !stage) return;

  shell.onwheel = ev => {
    ev.preventDefault();
    state.dag.scale = Math.min(1.5, Math.max(0.5, state.dag.scale * (ev.deltaY < 0 ? 1.08 : 0.92)));
    stage.style.transform = 'translate(' + state.dag.tx + 'px,' + state.dag.ty + 'px) scale(' + state.dag.scale + ')';
    const zv = document.getElementById('dag-zoom-val');
    if (zv) zv.textContent = Math.round(state.dag.scale * 100) + '%';
  };

  shell.onmousedown = ev => {
    if (ev.button !== 0) return;
    if (ev.target.closest('button') || ev.target.closest('.dag-controls')) return;
    const nodeEl = ev.target.closest('.dag-node');
    if (nodeEl){
      const id = nodeEl.dataset.nodeId;
      const sx = ev.clientX, sy = ev.clientY;
      const orig = state.dag.offsets[id] || { dx: 0, dy: 0 };
      let moved = false;
      const onMove = me => {
        const ddx = (me.clientX - sx) / state.dag.scale, ddy = (me.clientY - sy) / state.dag.scale;
        if (!moved && Math.hypot(ddx, ddy) > 4){ moved = true; nodeEl.classList.add('dragging'); }
        if (moved){ state.dag.offsets[id] = { dx: orig.dx + ddx, dy: orig.dy + ddy }; render(); }
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (!moved){
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
    const nodeEl = ev.target.closest('.dag-node[data-node-kind="worker"]');
    if (!nodeEl) return;
    ev.preventDefault();
    const w = findWorkerByNodeId(nodeEl.dataset.nodeId);
    if (!w) return;
    document.getElementById('ctx-root').innerHTML = '<div class="ctx-menu" style="left:' + Math.min(ev.clientX, window.innerWidth - 210) + 'px;top:' + Math.min(ev.clientY, window.innerHeight - 210) + 'px">' +
      '<button class="ctx-item" data-action="openWorker" data-id="' + esc(w.nodeId) + '">' + ic('eye','sm') + '查看详情</button>' +
      (w.status === 'blocked' && w.task ? '<button class="ctx-item" data-action="approveTask" data-id="' + esc(w.task.task) + '">' + ic('check','sm') + '一键批准放行</button>' : '') +
      (w.role ? '<button class="ctx-item" data-action="openSwap" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">' + ic('swap','sm') + '热替换会话 / 模型</button>' : '') +
      (w.bindingMode !== 'unbound' ? '<button class="ctx-item" data-action="setPerm" data-target="' + esc(w.task?.task || w.paneId || w.name) + '" data-perm="auto-workspace">' + ic('shield','sm') + '切为工作区自动</button>' : '') +
      (w.role && w.bindingMode !== 'unbound' ? '<button class="ctx-item danger" data-action="unbindRole" data-role="' + esc(w.role.role) + '" data-proj="' + esc(w.role.project_id) + '">' + ic('x','sm') + '解绑当前会话</button>' : '') +
    '</div>';
  };
}

document.addEventListener('click', async ev => {
  if (!ev.target.closest('.ctx-menu')) document.getElementById('ctx-root').innerHTML = '';
  if (!ev.target.closest('.proj-wrap') && state.projMenuOpen){ state.projMenuOpen = false; renderTopbar(); }

  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action, id = btn.dataset.id;

  try {
    if (act === 'toggleProjMenu'){ state.projMenuOpen = !state.projMenuOpen; renderTopbar(); }
    else if (act === 'selectProject'){ state.project = id; state.projMenuOpen = false; state.dag.fitted = false; render(); }
    else if (act === 'toggleTheme'){ document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; renderTopbar(); }
    else if (act === 'toggleFocus'){ state.focusCollapsed = !state.focusCollapsed; state.dag.fitted = false; render(); }
    else if (act === 'goTab'){ state.tab = id; render(); }
    else if (act === 'setWorkMode'){ state.workMode = id; render(); }
    else if (act === 'openWorker'){ state.drawer = { kind: 'worker', nodeId: id, tab: 'overview' }; render(); }
    else if (act === 'openCtrl'){ state.drawer = { kind: 'ctrl', nodeId: id }; render(); }
    else if (act === 'openTask'){
      const w = allVisibleWorkers().find(x => x.task?.task === id);
      if (w){ state.drawer = { kind: 'worker', nodeId: w.nodeId, tab: 'overview' }; render(); }
    }
    else if (act === 'closeDrawer'){ state.drawer = null; render(); }
    else if (act === 'drawerTab'){ if (state.drawer){ state.drawer.tab = btn.dataset.tab; renderDrawer(); } }
    else if (act === 'drawerTurn'){ if (state.drawer){ state.drawer.turn = Number(btn.dataset.turn); renderDrawer(); } }
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
    else if (act === 'setPerm'){ await apiAction('set_perm', btn.dataset.target, { perm: btn.dataset.perm }); toast('权限已切换为 ' + btn.dataset.perm); }
    else if (act === 'finishTask'){ await apiAction('finish', id, { ok: true }); toast('任务 ' + id + ' 已验收结单'); }
    else if (act === 'cancelTask'){ await apiAction('cancel', id, {}); toast('已取消任务 ' + id); }
    else if (act === 'unbindRole'){ await apiAction('role_unbind', btn.dataset.role, { project: btn.dataset.proj }); toast('已解绑角色 ' + btn.dataset.role); }
    else if (act === 'removeRole'){ await apiAction('role_remove', btn.dataset.role, { project: btn.dataset.proj }); state.drawer = null; toast('已移除角色 ' + btn.dataset.role); }
    else if (act === 'pushQueue'){ await apiAction('queue_deliver_now', undefined, { event_id: id }); toast('已立即强推回执'); }
    else if (act === 'consumeQueue'){ await apiAction('queue_consume', undefined, { event_id: id }); toast('已标记仅阅消费'); }
    else if (act === 'dropQueue'){ await apiAction('queue_drop', undefined, { event_id: id }); toast('已丢弃该回执'); }
    else if (act === 'cancelRetry'){ await apiAction('cancel_retry', id, {}); toast('已取消重试计划'); }
    else if (act === 'pauseRecipient'){ await apiAction('queue_pause', btn.dataset.pane, {}); toast('已暂停向 ' + btn.dataset.pane + ' 自动投递'); }
    else if (act === 'resumeRecipient'){ await apiAction('queue_resume', btn.dataset.pane, {}); toast('已恢复向 ' + btn.dataset.pane + ' 自动投递'); }
    else if (act === 'flushPane'){ await apiAction('flush', btn.dataset.pane, {}); toast('已消费 ' + btn.dataset.pane + ' 队列'); }
    else if (act === 'adoptPane'){ await apiAction('adopt', btn.dataset.pane, { project: btn.dataset.proj || undefined }); toast('已纳管窗格 ' + btn.dataset.pane); }
    else if (act === 'openBindPane'){ openBindPaneModal(btn.dataset.pane, btn.dataset.proj); }
    else if (act === 'confirmBindPane'){
      const val = document.getElementById('bp-role')?.value || '';
      const [proj, role] = val.split('::');
      if (!role) return;
      await apiAction('role_bind', role, { project: proj, pane: btn.dataset.pane });
      closeModal(); toast('已绑定至角色 ' + role);
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
      const opts = { project: btn.dataset.proj, kind: document.getElementById('sw-kind').value, close_old: document.getElementById('sw-close-old').checked };
      const m = document.getElementById('sw-model').value.trim();
      if (m) opts.model = m;
      if (mode === 'headless') opts.headless = true;
      else if (mode === 'pane') opts.pane = document.getElementById('sw-pane').value;
      else { opts.spawn = true; if (opts.kind === 'agy') opts.attended = true; }
      await apiAction('role_bind', btn.dataset.role, opts);
      closeModal(); toast('角色 ' + btn.dataset.role + ' 热替换完成');
    }
    else if (act === 'openNewRole'){ openNewRoleModal(); }
    else if (act === 'confirmNewRole'){
      const name = (document.getElementById('nr-name').value || '').trim();
      if (!name){ toast('请输入角色名', true); return; }
      const opts = { kind: document.getElementById('nr-kind').value, perm: document.getElementById('nr-perm').value };
      const proj = document.getElementById('nr-proj').value;
      const desc = document.getElementById('nr-desc').value.trim();
      const model = document.getElementById('nr-model').value.trim();
      if (proj) opts.project = proj;
      if (desc) opts.desc = desc;
      if (model) opts.model = model;
      if (document.getElementById('nr-wt').checked) opts.worktree = true;
      await apiAction('role_set', name, opts);
      closeModal(); toast('已创建角色 ' + name);
    }
    else if (act === 'openDispatch'){ openDispatchModal(btn.dataset.target, btn.dataset.proj); }
    else if (act === 'confirmDispatch'){
      const raw = document.getElementById('dp-target').value;
      const brief = (document.getElementById('dp-brief').value || '').trim();
      if (!raw || !brief){ toast('请选择目标并填写任务正文', true); return; }
      const [kind, proj, target] = raw.split(':');
      const opts = { brief };
      if (proj) opts.project = proj;
      if (kind === 'role' && document.getElementById('dp-spawn').checked) opts.spawn = true;
      await apiAction('send', target, opts);
      closeModal(); toast('任务已派发至 ' + target);
    }
    else if (act === 'closeModal'){ closeModal(); }
    else if (act === 'dagExpand'){ state.dag.expanded = !state.dag.expanded; state.dag.fitted = false; render(); }
    else if (act === 'dagZoomIn'){ state.dag.scale = Math.min(1.5, state.dag.scale + 0.1); render(); }
    else if (act === 'dagZoomOut'){ state.dag.scale = Math.max(0.5, state.dag.scale - 0.1); render(); }
    else if (act === 'dagFit'){
      const shell = document.getElementById('dag-shell'), layout = computeDagLayout();
      const sw = (shell?.clientWidth || 1440) - 36, sh = (shell?.clientHeight || 620) - 36;
      state.dag.scale = Math.min(1.05, Math.max(0.52, Math.min(sw / layout.totalW, sh / layout.totalH)));
      state.dag.tx = Math.max(16, Math.round((sw + 36 - layout.totalW * state.dag.scale) / 2));
      state.dag.ty = 10; render();
    }
    else if (act === 'dagReset'){ state.dag = { tx: 24, ty: 14, scale: 0.85, offsets: {}, fitted: false, expanded: state.dag.expanded }; render(); }
  } catch (e){
    toast(e?.message || '操作失败', true);
  }
});

if (BOOT.mode === 'live') void connectLive();
else render();
})();
`;

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
