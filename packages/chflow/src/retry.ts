import { FlowError, invalid, seconds, str, type Opts, type Task } from './types.js';
export function backoff(o:Opts, previous?:number[]) {
  const raw=str(o,'retry_backoff')??(!previous?process.env.CHFLOW_DEFAULT_RETRY_BACKOFF:undefined);
  const base=raw?raw.split(',').map(s=>1000*seconds(s.trim(),0,0.001)) : previous??[5000,15000,45000,120000];
  const n=seconds(o.max_retries,base.length,0,100);
  if(!Number.isInteger(n)) return invalid('--max-retries must be an integer.');
  const source=base.length?base:[5000,15000,45000,120000];
  return Array.from({length:n},(_,i)=>source[Math.min(i,source.length-1)]);
}
export function duration(s:string) {
  const m=/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/.exec(s);
  if(!m) return invalid('Use a duration such as 30m, 2h or 90s.');
  const ms=Number(m[1])*({ms:1,s:1000,m:60000,h:3600000,d:86400000}[m[2]??'s']??1000);
  if(ms<1||ms>86400000*365) return invalid('Duration is outside the supported range.');
  return ms;
}
export function schedule(o:Opts,prefix='') {
  const at=str(o,prefix+'at'),after=str(o,prefix+'after');
  if(at&&after) return invalid('Choose either an absolute or a relative retry time.');
  if(after) return {after:duration(after)};
  if(at){
    const ts=Date.parse(at);
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(at)||!Number.isFinite(ts)) return invalid('Use an ISO 8601 timestamp with timezone.');
    return {at:ts};
  }
  return {};
}
export function classify(raw:unknown,defaultReason='interrupted'):string {
  const v=typeof raw==='string'?raw:typeof raw==='object'&&raw!==null&&'code' in raw?String(raw.code):'';
  if(/quota[_ -]?exhaust|usage[_ -]?limit|insufficient.quota|out of credits|quota exceeded|reset window/i.test(v)) return 'quota_exhausted';
  if(/rate[_ -]?limit|\b429\b|too many requests/i.test(v)) return 'rate_limited';
  if(/network|timeout|timed out|\b5\d\d\b|\b(?:dns|tls)\b|econn|connection reset|socket hang/i.test(v)) return 'network_error';
  if(/pane[_ -]?(?:gone|not_found)|agent_not_found/i.test(v)) return 'pane_gone';
  if(v==='settled_no_reply')return v;
  if(/aborted|interrupt|cancelled|sigterm|sigkill/i.test(v)) return 'interrupted';
  return defaultReason;
}
export type Recovery = {type:'fallback'}|{type:'scheduled_retry'|'retrying';at:number}|{type:'failed'};
export function recovery(t:Task,reason:string):Recovery {
  if(t.fallback.length && (reason==='quota_exhausted'||t.launch.kind==='agy')) return {type:'fallback'};
  if(t.launch.kind==='agy') return {type:'failed'};
  if(reason==='quota_exhausted'&&!t.quotaUsed && (t.quotaAt!==undefined||t.quotaDelay!==undefined))
    return {type:'scheduled_retry',at:t.quotaAt??Date.now()+t.quotaDelay!};
  if(t.retries<t.delays.length) return {type:'retrying',at:Date.now()+t.delays[t.retries]};
  return t.fallback.length?{type:'fallback'}:{type:'failed'};
}
export function busy():never { throw new FlowError('task_busy','Task has another operation in progress.'); }
