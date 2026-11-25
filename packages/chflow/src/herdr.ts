import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { FlowError, json, routeKey, type Agent, type Context, type Invocation, type Route, str, invalid, seconds } from './types.js';
import { clean } from './sensitive.js';
export const transient = /^(?:timeout|cli_timeout|.*(?:connect|transport|socket|ssh|unreachable|temporar|broken_pipe|econn|eof|reset|offline).*)$/i;
export const missing = /(?:pane|agent|target)_(?:not_found|missing|gone|not_running)|not_found/;
export const idle = (a:Agent) => ['idle','done'].includes(a.agent_status) && a.interactive_ready!==false && !a.launch_pending;
export function route(inv:Invocation):Route {
  const machine=str(inv.opts,'machine'), session=str(inv.opts,'session');
  if (machine&&session) return invalid('Choose --machine or --session.');
  if (machine && !/^[A-Za-z0-9][A-Za-z0-9 _.:/@-]{0,127}$/.test(machine)) return invalid('Invalid machine label.');
  if (session && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(session)) return invalid('Invalid session name.');
  return machine ? {machine:clean(machine)} : session ? {session:clean(session)} : inv.ctx.route;
}
export function same(a:Route,b:Route) {return routeKey(a)===routeKey(b);}
function raw(r:Route, args:string[], timeout:number, ctx?:Context):Promise<string>{
  const env={...process.env};
  for(const name of Object.keys(env)) if(name.startsWith('HERDR_')) delete env[name];
  if ('socket' in r) env.HERDR_SOCKET_PATH=r.socket;
  if(ctx?.caller && same(ctx.caller.route,r)) {
    env.HERDR_ENV='1'; env.HERDR_PANE_ID=ctx.caller.pane;
    if(ctx.workspace) env.HERDR_WORKSPACE_ID=ctx.workspace;
  }
  const prefix='machine' in r?['--machine',r.machine]:'session' in r?['--session',r.session]:[];
  return new Promise((ok,no)=>{
    const child=execFile('herdr',[...prefix,...args],{env,timeout,maxBuffer:2*1024*1024,windowsHide:true},(err,out,stderr)=>{
      if(!err) return ok(out);
      const entry=stderr.trim().split('\n').reverse().map(json).find(v=>v?.error||v?.code);
      const e=entry?.error??entry;
      const code=err.killed?'cli_timeout':err.code==='ENOENT'?'cli_missing':
        typeof e?.code==='string' && /^[a-z0-9_]{1,64}$/i.test(e.code) ? e.code :
        /timed?\s*out/i.test(stderr)?'cli_timeout':/connect|broken pipe|reset by peer|ssh/i.test(stderr)?'transport_error':'herdr_error';
      no(new FlowError(code,'Herdr '+args.slice(0,2).join(' ')+' failed ('+code+').',code==='agent_blocked'?2:1));
    });
    child.stdin?.end();
  });
}
export function controlDelays() {
  const env=process.env.CHFLOW_IPC_BACKOFF_MS;
  const a=env?.split(',').map(Number);
  if(!a?.length||a.some(n=>!Number.isFinite(n)||n<0)) return [1000,2000,4000];
  return a.length===1?[a[0],a[0]*2,a[0]*4]:a;
}
export async function herdr(r:Route,args:string[], options:{timeout?:number;mutate?:boolean;ctx?:Context}={}):Promise<any>{
  const delays=controlDelays();
  for(let i=0;;i++){
    try {
      const v=json(await raw(r,args,options.timeout??12000,options.ctx));
      if(v?.result && typeof v.result==='object') return v.result;
      const code=v?.error?.code;
      if(typeof code==='string' && /^[a-z0-9_]{1,64}$/i.test(code)) throw new FlowError(code,'Herdr request failed ('+code+').',code==='agent_blocked'?2:1);
      throw new FlowError('invalid_response','Herdr returned an unexpected JSON envelope.');
    } catch(e) {
      if(!(e instanceof FlowError) || !transient.test(e.code) || i>=delays.length || (options.mutate&&!/^(?:connect_refused|connection_refused|machine_connection_failed|ssh_connect_failed)$/.test(e.code))) throw e;
      await sleep(delays[i]);
    }
  }
}
export function checkedAgent(value:any):Agent {
  if(typeof value?.pane_id!=='string'||!value.pane_id||typeof value.terminal_id!=='string'||!value.terminal_id||
    typeof value.agent_status!=='string'||!Number.isSafeInteger(value.state_change_seq)||
    [value.cwd,value.foreground_cwd].some(path=>path!=null&&typeof path!=='string'))
    throw new FlowError('invalid_agent','Herdr returned no verified agent identity.');
  clean(JSON.stringify([value.pane_id,value.terminal_id,value.name,value.cwd,value.foreground_cwd,value.agent_session,value.workspace_id,value.tab_id]));
  return value;
}
export async function get(r:Route,target:string) {return checkedAgent((await herdr(r,['agent','get',target])).agent);}
export async function screen(r:Route,pane:string,lines:number) {return raw(r,['agent','read',pane,'--source','visible','--lines',String(lines)],15000);}
export async function inputPosition(r:Route,pane:string,terminal:string) {
  const {pane:p}=await herdr(r,['pane','get',pane]);
  if(p?.pane_id!==pane||p.terminal_id!==terminal||typeof p.focused!=='boolean'||!Number.isSafeInteger(p.revision))
    throw new FlowError('invalid_pane','Herdr returned no verified pane input metadata.');
  return {focused:p.focused as boolean,revision:p.revision as number,
    ready:p.agent_status==='idle'||p.agent_status==='done'};
}
export async function hasDraft(r:Route,pane:string) {
  const lines=(await screen(r,pane,3)).trimEnd().split(/\r?\n/).slice(-3);
  const input=lines.findLastIndex(line=>/^\s*(?:[❯›]|>(?:\s|$))/.test(line));
  return input>=0&&(/^\s*[❯>›]\s*\S/.test(lines[input])||
    lines.slice(input+1).some(line=>/^\s+[^─━═\s]/.test(line)));
}
export async function notifyTyping(r:Route,count:number) {
  await herdr(r,['notification','show',`chflow: ${count} 条回执待投递`,'--body','清空草稿后自动送达，或执行 chflow flush。','--sound','none'],{mutate:true});
}
export async function prompt(r:Route,pane:string,text:string) {return herdr(r,['agent','prompt',pane,text],{mutate:true});}
export async function keys(r:Route,pane:string,k:string[]) {if(k.length) await herdr(r,['agent','send-keys',pane,...k],{mutate:true});}
export async function literal(r:Route,pane:string,text:string) {await herdr(r,['pane','send-text',pane,...(text.startsWith('-')?['--']:[]),text],{mutate:true});}
export async function closePane(r:Route,pane:string) {return herdr(r,['pane','close',pane],{mutate:true});}
export async function focusAgent(r:Route,pane:string) {return herdr(r,['agent','focus',pane],{mutate:true});}
export interface HerdrLabels { workspaces:Record<string,string>; tabs:Record<string,string>; }
export async function listHerdrLabels(r:Route):Promise<HerdrLabels> {
  const workspaces:Record<string,string>={}, tabs:Record<string,string>={};
  const [ws,tb]=await Promise.all([
    herdr(r,['workspace','list'],{timeout:4000}).catch(()=>undefined),
    herdr(r,['tab','list'],{timeout:4000}).catch(()=>undefined),
  ]);
  if(Array.isArray(ws?.workspaces)){
    for(const item of ws.workspaces){
      if(typeof item?.workspace_id==='string'&&typeof item?.label==='string'&&item.label.trim())
        workspaces[item.workspace_id]=clean(item.label.trim());
    }
  }
  if(Array.isArray(tb?.tabs)){
    for(const item of tb.tabs){
      if(typeof item?.tab_id==='string'&&typeof item?.label==='string'&&item.label.trim())
        tabs[item.tab_id]=clean(item.label.trim());
    }
  }
  return {workspaces,tabs};
}
const option=(key:string,v?:string)=> v===undefined?[]:[key,v];
export async function startPane(inv:Invocation,r:Route,name:string,kind:string,native:string[]){
  const o=inv.opts, target=str(o,'pane'), cwd=str(o,'cwd'), workspace=str(o,'workspace'), worktree=str(o,'worktree');
  const focus=o.focus?'--focus':'--no-focus', place=str(o,'place')??(worktree?'workspace':target?'pane':'split');
  if(!['pane','split','tab','workspace'].includes(place)||(worktree&&place!=='workspace')||
     (target&&['tab','workspace'].includes(place))||(workspace&&['split','pane'].includes(place))||
     (worktree&&cwd&&workspace)) return invalid('Incompatible Herdr layout options.');
  const timeout=seconds(o.timeout,30,4,300);
  let layout:any={}, pane=target;
  const mut={mutate:true,ctx:inv.ctx};
  if(place==='pane') {if(!pane) return invalid('--place pane requires --pane.');}
  if(place==='split'){
    const caller=inv.ctx.caller && same(inv.ctx.caller.route,r)?inv.ctx.caller.pane:undefined;
    const direction=str(o,'direction')??'right';
    if(!['right','down'].includes(direction)) return invalid('Expected split direction right or down.');
    layout=await herdr(r,['pane','split','--direction',direction,focus,...option('--pane',target??caller),...option('--cwd',cwd)],mut);
    pane=layout.pane?.pane_id;
  }
  if(place==='tab'){
    const ws=workspace??(inv.ctx.caller&&same(inv.ctx.caller.route,r)?inv.ctx.workspace:undefined);
    layout=await herdr(r,['tab','create',focus,...option('--workspace',ws),...option('--cwd',cwd),...option('--label',str(o,'label'))],mut);
    pane=layout.root_pane?.pane_id;
  }
  if(place==='workspace'){
    const cmd=worktree?['worktree','create','--branch',worktree,...option('--workspace',workspace),...option('--base',str(o,'base')),...option('--path',str(o,'worktree_path')),...(o.trust_repository?['--trust-repository']:[])]:['workspace','create'];
    layout=await herdr(r,[...cmd,focus,...option('--cwd',cwd),...option('--label',str(o,'label'))],mut);
    pane=layout.root_pane?.pane_id;
  }
  if(!pane) throw new FlowError('invalid_layout','Herdr did not return a target pane ID.');
  const agent=await startIn(r,pane,name,kind,native,timeout);
  return {agent,place,worktree_path:layout.worktree?.path as string|undefined};
}
export async function startIn(r:Route,pane:string,name:string,kind:string,native:string[],timeout=30){
  const res=await herdr(r,['agent','start',name,'--kind',kind,'--pane',pane,'--timeout',String(Math.round(timeout*1000)),...(native.length?['--',...native]:[])],{mutate:true,timeout:timeout*1000+5000});
  return res.agent?.terminal_id? checkedAgent(res.agent):get(r,pane);
}
