const ANSI_RX = /\x1b\[[0-9;]*m/g;
export const PENDING_QUEUE_STATES = new Set(['queued', 'deferred_user_typing', 'paused_by_operator', 'delivering', 'pending_unreachable']);
export const TERMINAL_TASK_STATES = new Set(['succeeded', 'failed', 'cancelled']);

export function useColor(tty: boolean): boolean {
  return tty && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
}

export function paint(tty: boolean) {
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

export function charWidth(cp: number): number {
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

export function visWidth(s: string): number {
  const plain = s.replace(ANSI_RX, '');
  let w = 0;
  for (const ch of plain) w += charWidth(ch.codePointAt(0) ?? 0);
  return w;
}

export function clip(s: string, maxWidth: number): string {
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

export function padEndVis(s: string, width: number): string {
  const w = visWidth(s);
  return w >= width ? s : s + ' '.repeat(width - w);
}

export function shortPath(p: unknown): string {
  if (!p) return '—';
  const s = String(p);
  const idx = s.indexOf('.chflow/');
  if (idx >= 0) return s.slice(idx);
  const wt = /\.worktrees\/([^/]+)/.exec(s);
  if (wt) return 'wt:' + wt[1];
  const parts = s.split('/').filter(Boolean);
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : s;
}

export function fmtElapsed(startAt: unknown, endAt?: unknown): string {
  if (!startAt) return '—';
  const sec = Math.max(0, Math.round(((Number(endAt || Date.now())) - Number(startAt)) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), r = sec % 60;
  return m < 60 ? `${m}m${r < 10 ? '0' : ''}${r}s` : `${Math.floor(m / 60)}h${m % 60}m`;
}

export function fmtRel(ts: unknown): string {
  if (!ts) return '—';
  const diff = Math.round((Number(ts) - Date.now()) / 1000);
  if (Math.abs(diff) < 3) return 'now';
  if (diff > 0) return diff < 60 ? `in ${diff}s` : `in ${Math.round(diff / 60)}m`;
  const ago = -diff;
  return ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.round(ago / 60)}m ago` : `${Math.round(ago / 3600)}h ago`;
}

export function statusChip(state: string, c: ReturnType<typeof paint>): string {
  if (state === 'blocked') return c.yellow('▲ blocked');
  if (state === 'working' || state === 'submitted' || state === 'dispatching') return c.blue('● ' + state);
  if (state === 'retrying' || state === 'scheduled_retry') return c.magenta('↻ ' + state);
  if (state === 'idle' || state === 'done' || state === 'succeeded') return c.green('✓ ' + state);
  if (state === 'headless') return c.cyan('◆ headless');
  if (state === 'unbound') return c.gray('◌ unbound');
  if (state === 'failed' || state === 'cancelled') return c.red('✕ ' + state);
  if (state === 'offline') return c.gray('○ offline');
  return c.dim('· ' + state);
}

export function permChip(perm: string, c: ReturnType<typeof paint>): string {
  if (perm === 'yolo') return c.red('yolo');
  if (perm === 'auto-workspace') return c.green('auto-ws');
  if (perm === 'readonly') return c.cyan('readonly');
  return c.dim(perm || 'ask');
}

export function formatTable(rows: string[][], widths: number[], indent = '  '): string[] {
  return rows.map(row => indent + row.map((cell, i) => i === row.length - 1 ? cell : padEndVis(cell, widths[i])).join('  '));
}

