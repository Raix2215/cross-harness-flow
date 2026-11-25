export const CSS = `
:root{
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace;
}
[data-theme=light]{
  --bg:#f7f7f8; --surface:#ffffff; --surface-2:#f1f2f4; --surface-3:#e5e7eb;
  --canvas-bg:#fafafa; --canvas-dot:rgba(17,19,23,.09); --lane-bg:rgba(255,255,255,.86); --lane-border:#e2e4e9;
  --border:#e4e6eb; --border-strong:#c5c9d2;
  --text:#111317; --text-2:#4b515c; --text-3:#767d8a;
  --accent:#111317; --accent-fg:#ffffff; --accent-soft:#efeff2; --accent-text:#111317;
  --ok:#1b7f4d; --ok-soft:#edf7f1; --ok-border:#c3e4d0;
  --warn:#9a5b13; --warn-fg:#ffffff; --warn-soft:#faf3e8; --warn-border:#ebd1aa;
  --danger:#b53535; --danger-soft:#fbeef0; --danger-border:#f0c2c5;
  --retry:#5b4bb7; --retry-soft:#f2f0fb; --retry-border:#d7d0f2;
  --head:#2d6a73; --head-soft:#edf5f6;
  --idle:#6b7280; --idle-soft:#f2f3f5;
  --shadow:0 1px 2px rgba(17,19,23,.05),0 2px 6px rgba(17,19,23,.04);
  --shadow-hover:0 6px 18px rgba(17,19,23,.09);
  --shadow-lg:0 24px 56px rgba(17,19,23,.16),0 4px 12px rgba(17,19,23,.07);
  --scrim:rgba(17,19,23,.32);
  --term-bg:#111317; --term-text:#e2e5ec;
  --toast:#111317; --toast-fg:#ffffff;
}
[data-theme=dark]{
  --bg:#090a0c; --surface:#111317; --surface-2:#181b21; --surface-3:#22262f;
  --canvas-bg:#0c0e12; --canvas-dot:rgba(255,255,255,.08); --lane-bg:rgba(17,19,23,.82); --lane-border:#252932;
  --border:#232730; --border-strong:#373d4a;
  --text:#f3f4f6; --text-2:#a8aeb9; --text-3:#78808f;
  --accent:#f3f4f6; --accent-fg:#090a0c; --accent-soft:#1f232b; --accent-text:#f3f4f6;
  --ok:#46c281; --ok-soft:#12241a; --ok-border:#224a34;
  --warn:#e5a347; --warn-fg:#090a0c; --warn-soft:#261d11; --warn-border:#4f3a18;
  --danger:#e56a6a; --danger-soft:#2c1618; --danger-border:#55282c;
  --retry:#a494f2; --retry-soft:#1e1a33; --retry-border:#3d3466;
  --head:#57b7c2; --head-soft:#112427;
  --idle:#949ba8; --idle-soft:#1c2027;
  --shadow:0 2px 6px rgba(0,0,0,.40);
  --shadow-hover:0 8px 22px rgba(0,0,0,.52);
  --shadow-lg:0 24px 56px rgba(0,0,0,.65);
  --scrim:rgba(0,0,0,.62);
  --term-bg:#07080a; --term-text:#e2e5ec;
  --toast:#f3f4f6; --toast-fg:#090a0c;
}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:var(--font);font-size:14.5px;line-height:1.55;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}
code,.mono{font-family:var(--mono)}
.ic{width:16px;height:16px;flex:none;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle}
.ic.sm{width:14px;height:14px}
.ic.lg{width:19px;height:19px}
.role-ic{color:var(--accent)}
.mail-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.mail-select{height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-size:13px;max-width:300px}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:36px;padding:0 14px;border-radius:9px;border:1px solid var(--border);background:var(--surface);font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .14s,border-color .14s,opacity .14s,color .14s}
.btn:hover{background:var(--surface-2);border-color:var(--border-strong)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}
.btn.primary:hover{background:var(--accent);border-color:var(--accent);opacity:.86}
.btn.warn{background:var(--warn);border-color:var(--warn);color:var(--warn-fg)}
.btn.warn:hover{background:var(--warn);border-color:var(--warn);opacity:.88}
.btn.danger{background:var(--danger);border-color:var(--danger);color:#fff}
.btn.danger:hover{background:var(--danger);border-color:var(--danger);opacity:.88}
.btn.ghost{background:transparent;border-color:transparent}
.btn.ghost:hover{background:var(--surface-2)}
.btn.danger-ghost{background:transparent;border-color:transparent;color:var(--danger)}
.btn.danger-ghost:hover{background:var(--danger-soft)}
.btn.sm{height:30px;padding:0 11px;font-size:13px;border-radius:8px;gap:5px}
.btn.icon{width:36px;padding:0}
.btn.icon.sm{width:30px;padding:0}
.btn:disabled{opacity:.45;cursor:not-allowed}

.topbar{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--surface) 90%,transparent);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--border)}
.topbar-in{width:92%;max-width:2200px;margin:0 auto;height:58px;padding:0;display:flex;align-items:center;gap:12px}
.brand{display:flex;align-items:center;gap:9px;margin-right:4px}
.logo{width:28px;height:28px;color:var(--text);display:grid;place-items:center;flex:none}
.logo .ic{width:26px;height:26px}
.brand-name{font-size:17px;font-weight:750;letter-spacing:-.02em}
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
.tab-badge.warn{background:var(--warn);color:var(--warn-fg)}

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
.loc-chip{display:inline-flex;align-items:center;gap:5px;padding:1px 7px;border-radius:6px;font-size:12.5px;background:var(--surface-2);border:1px solid var(--border);color:var(--text-2);font-weight:500}
.tech-id{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:6px;font-family:var(--mono);font-size:12px;background:var(--surface-2);color:var(--text-3);border:1px solid var(--border);cursor:pointer}
.tech-id:hover{color:var(--text);border-color:var(--border-strong)}

.dag-shell{position:relative;height:max(540px, calc(100vh - 270px));border-radius:16px;border:1px solid var(--border);background:var(--canvas-bg);background-image:radial-gradient(var(--canvas-dot) 1.25px, transparent 1.25px);background-size:22px 22px;overflow:hidden;box-shadow:var(--shadow);user-select:none}
.dag-shell.expanded{position:fixed;inset:2vh 2vw;height:auto;z-index:42;border-radius:16px;box-shadow:var(--shadow-lg)}
.dag-shell.panning{cursor:grabbing}
.dag-stage{position:absolute;inset:0;transform-origin:0 0}
.dag-svg{position:absolute;left:0;top:0;width:4000px;height:3200px;pointer-events:none;overflow:visible}

.dag-lane{position:absolute;border-radius:18px;border:1px solid var(--lane-border);background:var(--lane-bg);backdrop-filter:blur(4px);pointer-events:none;transition:border-color .15s,box-shadow .15s}
.dag-lane.dragging{border-color:var(--accent);box-shadow:var(--shadow-lg);z-index:12;transition:none}
.dag-lane-head{display:flex;align-items:center;justify-content:space-between;padding:11px 18px;border-bottom:1px dashed var(--border);pointer-events:auto;cursor:grab;user-select:none;border-top-left-radius:18px;border-top-right-radius:18px}
.dag-lane-head:hover{background:color-mix(in srgb,var(--accent-soft) 35%,transparent)}
.dag-lane.dragging .dag-lane-head{cursor:grabbing}
.dag-lane-title{display:flex;align-items:center;gap:9px;font-size:15.5px;font-weight:700;color:var(--text)}
.dag-lane-grip{color:var(--text-3);display:inline-flex;align-items:center;margin-right:2px}
.dag-lane-meta{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-3)}
.dag-lane-resize{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;pointer-events:auto;border-bottom-right-radius:18px;display:flex;align-items:flex-end;justify-content:flex-end;padding:4px;color:var(--text-3);opacity:.55;transition:opacity .15s,color .15s}
.dag-lane-resize:hover{opacity:1;color:var(--accent)}
.dag-col-labels{position:absolute;top:52px;left:0;right:0;pointer-events:none}
.dag-col-label{position:absolute;font-size:12.5px;font-weight:600;color:var(--text-3);letter-spacing:.02em;display:flex;align-items:center;gap:6px}

.dag-node{position:absolute;background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:13px 16px;box-shadow:var(--shadow);cursor:pointer;transition:box-shadow .15s,border-color .15s;display:flex;flex-direction:column}
.dag-node:hover{box-shadow:var(--shadow-hover);border-color:var(--border-strong)}
.dag-node.selected{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft),var(--shadow-hover)}
.dag-node.dragging{cursor:grabbing;z-index:25;box-shadow:var(--shadow-lg);transition:none}

.dag-node.ctrl{width:316px;border-left:4px solid var(--accent)}
.dag-node.ctrl.st-offline{border-left-color:var(--danger);border-color:var(--danger-border);opacity:.86}
.dag-node.ctrl.st-blocked{border-left-color:var(--warn);border-color:var(--warn)}
.dag-node.role{width:342px}
.dag-node.role.st-blocked{border-color:var(--warn);background:linear-gradient(180deg,color-mix(in srgb,var(--warn-soft) 55%,var(--surface)) 0%,var(--surface) 44%)}
.dag-node.role.st-working{border-color:color-mix(in srgb,var(--ok) 45%,var(--border))}
.dag-node.role.st-retry{border-color:color-mix(in srgb,var(--retry) 50%,var(--border))}
.dag-node.role.st-offline{border-color:var(--danger-border);background:color-mix(in srgb,var(--danger-soft) 35%,var(--surface))}
.dag-node.role.st-unbound{border-style:dashed;background:color-mix(in srgb,var(--surface) 75%,var(--surface-2))}
.dag-node.fallback{width:264px;border:1.5px dashed var(--retry-border);background:color-mix(in srgb,var(--retry-soft) 50%,var(--surface))}

.dn-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dn-title{font-size:15px;font-weight:700;display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dn-sub{font-size:13px;color:var(--text-3);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px}
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
.empty-card{max-width:480px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px 28px;box-shadow:var(--shadow)}

.unmanaged-box{margin-top:16px;padding:15px 18px;border-radius:14px;border:1px solid var(--border);background:var(--surface)}
.unm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px;gap:12px;flex-wrap:wrap}
.unm-title{font-size:14.5px;font-weight:600;display:flex;align-items:center;gap:8px}
.unm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px}
.unm-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border-radius:11px;border:1px solid var(--border);background:var(--surface-2)}
.unm-info{min-width:0;flex:1}
.unm-name{font-size:14.5px;font-weight:600;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.unm-sub{font-size:12.5px;color:var(--text-3);margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}

.proj-section{margin-bottom:26px}
.proj-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.proj-title{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700}
.proj-meta{font-size:13px;color:var(--text-3);font-weight:400;display:inline-flex;align-items:center;gap:6px}
.ctrl-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-bottom:14px}
.ctrl-card{background:var(--surface);border:1.5px solid var(--border);border-left:4px solid var(--accent);border-radius:13px;padding:12px 15px;box-shadow:var(--shadow);cursor:pointer;display:flex;flex-direction:column;gap:7px;transition:box-shadow .15s,border-color .15s}
.ctrl-card:hover{box-shadow:var(--shadow-hover);border-color:var(--border-strong)}
.ctrl-card.st-offline{border-left-color:var(--danger);border-color:var(--danger-border);opacity:.85}
.ctrl-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.ctrl-kpi{padding:10px 10px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border);text-align:center}
.ctrl-kpi b{display:block;font-size:18px;line-height:1.2;font-variant-numeric:tabular-nums}
.ctrl-kpi span{display:block;font-size:12px;color:var(--text-3);margin-top:3px}
.sub-worker-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border-radius:11px;border:1px solid var(--border);background:var(--surface-2);cursor:pointer;margin-bottom:8px;transition:border-color .14s,background .14s}
.sub-worker-row:hover{border-color:var(--accent);background:var(--surface)}
.perm-meta-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;font-size:12.5px;color:var(--text-3)}
.perm-auto-toggle{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text-2);font-size:12px;font-weight:500;cursor:pointer;transition:all .14s}
.perm-auto-toggle:hover{border-color:var(--border-strong);color:var(--text)}
.perm-auto-toggle.on{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}
.perm-restart-bar{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--surface-2);border:1px dashed var(--border-strong);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--text-2)}
.perm-restart-bar.warn{background:var(--warn-soft);border-color:var(--warn-border);color:var(--warn)}
.perm-restart-actions{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.perm-restart-err{margin-top:8px;padding:7px 10px;border-radius:8px;background:var(--danger-soft);border:1px solid var(--danger-border);color:var(--danger);font-size:12px;line-height:1.45}
.role-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}
.role-card{background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:15px 16px;box-shadow:var(--shadow);cursor:pointer;display:flex;flex-direction:column;transition:box-shadow .15s,border-color .15s;min-height:172px}
.role-card:hover{box-shadow:var(--shadow-hover);border-color:var(--border-strong)}
.role-card.st-blocked{border-color:var(--warn)}
.role-card.st-unbound{border-style:dashed}
.role-card.st-offline{border-color:var(--danger-border)}

.tmpl-strip{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding:10px 12px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border)}
.tmpl-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-size:13px;cursor:pointer}
.tmpl-chip:hover{border-color:var(--accent);color:var(--accent-text)}

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
.dr-crumb{font-size:13px;color:var(--text-3);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
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

.perm-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-bottom:10px}
.perm-btn{padding:7px 4px;border-radius:9px;border:1px solid var(--border);background:var(--surface);font-size:12.5px;font-weight:600;cursor:pointer;text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1.25}
.perm-btn:hover{background:var(--surface-2)}
.perm-btn.active{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}
.perm-flag{font-family:var(--mono);font-size:10px;font-weight:500;opacity:.72;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.perm-btn.active .perm-flag{opacity:.82}
.ws-base-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:9px;background:var(--surface-2);border:1px solid var(--border);margin-bottom:8px;font-size:12.5px;color:var(--text-2)}
.ws-base-opts{display:inline-flex;gap:5px;flex-wrap:wrap}
.ws-base-btn{padding:4px 9px;border-radius:7px;border:1px solid var(--border);background:var(--surface);font-size:12px;font-family:var(--mono);cursor:pointer;color:var(--text-2)}
.ws-base-btn:hover{border-color:var(--border-strong);color:var(--text)}
.ws-base-btn.active{background:var(--accent);border-color:var(--accent);color:var(--accent-fg);font-weight:600}

.mail-pre{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:13px 15px;font-family:var(--mono);font-size:13px;line-height:1.65;white-space:pre-wrap;color:var(--text);max-height:360px;overflow:auto}

.ctx-menu{position:fixed;min-width:210px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-lg);padding:6px;z-index:80}
.ctx-item{width:100%;display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:8px;border:0;background:transparent;font-size:13.5px;cursor:pointer;text-align:left}
.ctx-item:hover{background:var(--surface-2)}
.ctx-item.danger{color:var(--danger)}
.ctx-item.danger:hover{background:var(--danger-soft)}

.modal-back{position:fixed;inset:0;background:var(--scrim);z-index:70;display:grid;place-items:center;padding:20px}
.modal{width:520px;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-lg);overflow:hidden}
.modal-h{padding:18px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;font-size:16.5px;font-weight:700}
.modal-b{padding:18px 20px;max-height:72vh;overflow-y:auto}
.modal-f{padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface-2)}
.field{margin-bottom:13px}
.field label{display:block;font-size:13.5px;font-weight:600;margin-bottom:5px;color:var(--text-2)}
.field input,.field select,.field textarea{width:100%;padding:9px 12px;border-radius:9px;border:1px solid var(--border);background:var(--surface);font-size:14px}
.field textarea{min-height:92px;resize:vertical}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.check-row{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--text-2);margin-top:6px;cursor:pointer}
.check-row input{width:auto}

.toasts{position:fixed;bottom:20px;right:24px;display:flex;flex-direction:column;gap:8px;z-index:90}
.toast{background:var(--toast);color:var(--toast-fg);padding:10px 15px;border-radius:10px;font-size:13.5px;box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:8px}
.toast.err{background:var(--danger);color:#fff}

.auth-wrap{min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg)}
.auth-card{width:440px;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px;box-shadow:var(--shadow-lg)}
.auth-err{padding:10px 12px;border-radius:9px;background:var(--danger-soft);border:1px solid var(--danger-border);color:var(--danger);font-size:13.5px;margin-bottom:14px}
`;

export const SVG_SPRITE = `<svg style="display:none" aria-hidden="true">
  <defs>
    <symbol id="i-logo" viewBox="0 0 48 48"><path fill-rule="evenodd" d="M8.5 7H19.5C20.9 7 22 8.1 22 9.5V38.5C22 39.9 20.9 41 19.5 41H8.5C7.1 41 6 39.9 6 38.5V9.5C6 8.1 7.1 7 8.5 7Z M11.4 18.6L16.8 24L11.4 29.4L9.7 27.7L13.4 24L9.7 20.3Z" fill="currentColor" stroke="none"/><path fill-rule="evenodd" d="M28 7H39.5C40.9 7 42 8.1 42 9.5V14.8C42 16.2 40.9 17.3 39.5 17.3H28C26.6 17.3 25.5 16.2 25.5 14.8V9.5C25.5 8.1 26.6 7 28 7Z M36.8 10.7A1.45 1.45 0 1 0 36.8 13.6A1.45 1.45 0 1 0 36.8 10.7Z" fill="currentColor" stroke="none"/><rect x="26.7" y="20.4" width="14.1" height="7.8" rx="2.1" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="29.8" y="23.2" width="5.2" height="2.2" rx="1" fill="currentColor" stroke="none"/><path d="M28 31.3H39.5C40.9 31.3 42 32.4 42 33.8V38.5C42 39.9 40.9 41 39.5 41H28C26.6 41 25.5 39.9 25.5 38.5V33.8C25.5 32.4 26.6 31.3 28 31.3Z" fill="currentColor" stroke="none"/></symbol>
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
    <symbol id="i-locate" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></symbol>
    <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></symbol>
    <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18"/></symbol>
    <symbol id="i-grip" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/></symbol>
    <symbol id="i-resize" viewBox="0 0 16 16"><path d="M13 7L7 13M13 11L11 13"/></symbol>
    <symbol id="i-pause" viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></symbol>
    <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7V5z"/></symbol>
    <symbol id="i-role" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9.5" cy="10.5" r="2.2"/><path d="M6.2 16.5a3.4 3.4 0 0 1 6.6 0M15 9.5h3.2M15 13h2.4"/></symbol>
  </defs>
</svg>`;
