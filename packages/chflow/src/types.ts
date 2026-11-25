import { readFileSync } from 'node:fs';

export const VERSION = '3.6.1';
export const PROTOCOL = 1;
export const kinds = ['codex', 'claude', 'pi', 'agy'] as const;
export const perms = ['readonly', 'ask', 'auto', 'auto-workspace', 'yolo'] as const;
export const workspaceModes = ['accept-edits', 'auto', 'workspace-write', 'approve-for-me'] as const;
export type WorkspaceMode = (typeof workspaceModes)[number];
export type Kind = typeof kinds[number];
export type Perm = typeof perms[number];
export type Opts = Record<string, string | number | boolean | string[] | undefined>;
export type Route = { machine: string } | { session: string } | { socket: string };
export const routeKey = (route: Route) => JSON.stringify(route);
export interface Session { kind: string; value: string }
export interface Agent {
  pane_id: string; terminal_id: string; agent: Kind; name?: string;
  agent_status: string; state_change_seq: number; revision?: number; completion_seq?: number;
  agent_session?: Session | null; interactive_ready?: boolean; launch_pending?: boolean;
  cwd?: string; foreground_cwd?: string; workspace_id?: string; tab_id?: string;
  failure?: string | {code?: string}; error?: string | {code?: string}; failure_reason?: string; stop_reason?: string;
}
export interface Recipient { route: Route; pane: string; label: string; terminal?: string; kind?: Kind; session?: Session }
export interface PendingRestart {
  perm: Perm; workspace_mode?: WorkspaceMode; model?: string; effort?: string; provider?: string;
  allow_last?: boolean; attended?: boolean; requested_at: number;
}
export interface ManagedPane {agent:Agent; launch:Launch; route:Route; alias:string; controller?:Recipient; adopted:boolean; native_perm:Perm|'unknown'; native_workspace_mode?:WorkspaceMode; auto_guard?:boolean; pending_restart?:PendingRestart; last_restart_error?:string; adopted_sent?:boolean; project_id?:string; pre_role_alias?:string}
export interface Context { cwd: string; route: Route; caller?: Recipient; workspace?: string; tty?: boolean; operator?: boolean }
export interface Launch { kind: Kind; perm: Perm; workspace_mode?: WorkspaceMode; model?: string; effort?: string; provider?: string; attended?: boolean; channel?: string }
export interface Project {
  project_id: string; name: string; root: string; source: 'config'|'override'|'worktree'|'folder';
}
export interface GlobalRoleTemplate {
  role: string; description?: string;
  default_kind?: Kind; default_model?: string; default_effort?: string; default_provider?: string;
  default_channel?: string; default_perm?: Perm; default_workspace_mode?: WorkspaceMode; worktree?: boolean; cwd?: string;
}
export interface Role extends GlobalRoleTemplate {
  project_id: string; role: string; source: 'config'|'manual'; description?: string;
  default_kind?: Kind; default_model?: string; default_effort?: string; default_provider?: string;
  default_channel?: string; default_perm?: Perm; default_workspace_mode?: WorkspaceMode; worktree?: boolean; cwd?: string;
  config_root?: string;
  config_overrides?: Partial<Pick<Role,'description'|'default_kind'|'default_model'|'default_effort'|'default_provider'|'default_channel'|'default_perm'|'default_workspace_mode'|'worktree'|'cwd'>>;
  binding_mode: 'pane'|'headless'|'unbound'; pane_id?: string; terminal_id?: string;
  route?: Route; launch?: Launch; controller?: Recipient; launch_cwd?: string;
}
export interface Invocation { target?: string; opts: Opts; extra?: string[]; ctx: Context }
export type State = 'dispatching'|'submitted'|'delivery_unknown'|'blocked'|'retrying'|'scheduled_retry'|'succeeded'|'failed'|'cancelled'|'closing'|'close_unknown';
export const terminal = (s: State) => s === 'succeeded' || s === 'failed' || s === 'cancelled';
export interface Block { seq: number; kind: 'permission'|'question'|'unknown'; reason: string; diag: string; approved?: boolean; signature?: string; count?: number; since?: number }
export interface Task {
  task: string; attempt: string; turn: number; state: State; route: Route; caller?: Recipient; controller?: Recipient; return_route?: Recipient; launch: Launch;
  project_id?: string; role?: string;
  name: string; pane?: string; terminal?: string; session?: Session; cwd: string; brief: string; out: string; mail: string;
  mode: 'interactive'|'headless'; transport?: string; timeout?: number; reused?: boolean; adoptedDispatch?: boolean; rebuild?: boolean; recoveryMode?: 'resume'|'fallback'; startSeq?: number; seq?: number;
  revision?: number; activityAt: number; startedAt: number; working?: boolean; settledAt?: number; stalled?: boolean;
  block?: Block; lastClassified?: number; autoSignature?: string; autoCount?: number; retries: number;
  delays: number[]; fallback: Launch[]; nextAt?: number; quotaAt?: number; quotaDelay?: number; quotaUsed?: boolean;
  reason?: string; diag?: string; note?: string; stop_reason?: string; finished?: boolean; closeOwner?: string;
  recoveryProbe?: ProgressProbe;
  process?: {pid: number; stamp?: string};
  native_extra?: string[];
}
export interface ProgressProbe { seq?: number; revision?: number; artifact?: string }
export type EventType = 'result'|'interrupted'|'settled_no_reply'|'quota_exhausted'|'pane_gone'|'blocked'|'stalled'|'progress'|'fallback_switched'|'scheduled_retry'|'handed_off';
export const pendingDeliveryStates=['queued','deferred_user_typing','pending_unreachable','paused_by_operator'];
export interface Delivery {
  event_id: string; task: string; project_id?: string; attempt: string; turn: number; recipient: Recipient; worker: string; perm: Perm;
  type: EventType; status: string; note?: string; out?: string; diag?: string; seq?: number; created: number;
  state: string; failures: number; nextAt?: number; batch?: string; probe?: ProgressProbe;
}
export interface Reply { id?: string; ok: boolean; data?: unknown; error?: {code: string; message: string; details?: unknown}; exit_code: number }
export class FlowError extends Error {
  constructor(public code: string, message: string, public exit = 1, public details?: unknown) { super(message); }
}
export function failure(error: unknown): Reply {
  const e = error instanceof FlowError ? error : new FlowError('internal_error','Operation failed; inspect daemon logs.');
  return {ok: false, error:{code:e.code, message:e.message,details:e.details},exit_code:e.exit};
}
export const success = (data: unknown, exit_code=0): Reply => ({ok:exit_code===0,data,exit_code});
export const invalid = (message: string): never => { throw new FlowError('invalid_args',message); };
export const str = (o: Opts, k: string): string|undefined => typeof o[k] === 'string' ? o[k] : undefined;
export function seconds(value: unknown, def: number, min=0.001, max=86400): number {
  const n=value===undefined ? def : Number(value);
  if (!Number.isFinite(n) || n<min || n>max) return invalid('Duration is outside the supported range.');
  return n;
}
export function json(line: string): any { try { return JSON.parse(line); } catch { return undefined; } }
export function alive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
  if (process.platform === 'linux') {
    try {
      const stat = readFileSync('/proc/' + pid + '/stat', 'utf8');
      const end = stat.lastIndexOf(')');
      if (end >= 0) {
        const ch = stat.slice(end + 2, end + 3);
        if (ch === 'Z' || ch === 'X' || ch === 'x') return false;
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    }
  }
  return true;
}
