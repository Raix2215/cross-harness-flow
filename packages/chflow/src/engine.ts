import { randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { approveKey, blacklist, classifyBlock, keyArg, signature } from './approval.js';
import { channelMatrix, channels, compliance, fallbackSpecs, kindOf, launch, native, permission, resumeArgs } from './harnesses.js';
import { headless, processStamp, stopGroup, transportFor } from './headless.js';
import { closePane, controlDelays, get, herdr, idle, keys, literal, missing, prompt, route, same, screen, startPane, transient } from './herdr.js';
import { readConfig } from './ipc.js';
import { atomic, diagnostic, fileText, fileTextIf, mailbox } from './mailbox.js';
import { dispatch, note } from './protocol.js';
import { paneCwd, projectId, roleActive, roleDefaults, roleName, samePane } from './projects.js';
import { DeliveryQueue, sessionsEqual } from './queue.js';
import { backoff, classify, recovery, schedule } from './retry.js';
import { clean, input, redact } from './sensitive.js';
import type { Store } from './store.js';
import { FlowError, VERSION, alive, invalid, routeKey, seconds, str, success, terminal, type Agent, type Context, type Delivery, type Invocation, type Launch, type Opts, type ProgressProbe, type Project, type Recipient, type Reply, type Role, type Route, type Task } from './types.js';
import { matches, paneView, safeTarget, Workspaces, type LiveTopology } from './workspaces.js';

const ms=(name:string,def:number,min=0)=>seconds(process.env[name],def,min,86400000);
const idRx=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const taskId=(s?:string)=>s&&idRx.test(s)?clean(s):invalid('Provide a valid task ID.');
const attempt=()=>randomUUID().replaceAll('-','');
const active=(t:Task)=>!terminal(t.state)&&t.state!=='closing'&&t.state!=='close_unknown';
const errcode=(e:unknown)=>e instanceof FlowError?e.code:'internal_error';
const localCwd=(base:string,path?:string)=>path?resolve(base,path):base;
const received=(t:Task)=>({...t,perm:t.launch.perm,kind:t.launch.kind,pane_id:t.pane,agent_session:t.session,return_route:t.return_route??null,controller:t.controller??null});
const fileLimit=1024*1024;
function readMailboxFile(mail:string,path:string){
  const rel=relative(mail,path);
  if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))return invalid('File must be inside the task mailbox.');
  const checkSize=(size:number)=>{
    if(size>fileLimit)throw new FlowError('file_too_large','Mailbox file exceeds 1 MiB.');
  };
  try{
    for(const dir of [dirname(dirname(mail)),dirname(mail),mail]){
      if(!lstatSync(dir).isDirectory())return invalid('Invalid task mailbox directory.');
    }
    const expected=resolve(realpathSync(mail),rel);
    const before=lstatSync(path);
    if(!before.isFile()||realpathSync(path)!==expected)return invalid('Mailbox path must be a regular file without symlinks.');
    checkSize(before.size);
    const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    try{
      const stat=fstatSync(fd);
      if(!stat.isFile()||stat.dev!==before.dev||stat.ino!==before.ino||
        realpathSync(path)!==expected)return invalid('Mailbox file changed while opening.');
      checkSize(stat.size);
      const buffer=Buffer.allocUnsafe(fileLimit+1);
      let size=0;
      while(size<buffer.length){
        const n=readSync(fd,buffer,size,buffer.length-size,null);
        if(!n)break;
        size+=n;
      }
      checkSize(size);
      return {exists:true,content:redact(buffer.toString('utf8',0,size)),updated_at:Math.floor(stat.mtimeMs)};
    }finally{closeSync(fd);}
  }catch(e){
    if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;
    if((e as NodeJS.ErrnoException).code==='ELOOP')return invalid('Mailbox path must be a regular file without symlinks.');
    throw e;
  }
}
interface UiRoute {
  route:Route;
  clients:number;
  current?:LiveTopology;
  fingerprint?:string;
  sampledAt?:number;
  pending?:Promise<LiveTopology>;
}
export class Engine {
  private work:Workspaces;
  private queue:DeliveryQueue;
  private locks=new Map<string,Promise<void>>();
  private running=new Map<string,{controller:AbortController;done:Promise<void>}>();
  private pending=new Set<Promise<unknown>>();
  private stopping=false;
  private settle=ms('CHFLOW_SETTLE_MS',1800);
  private stall=ms('CHFLOW_STALL_MS',120000);
  private unblock=ms('CHFLOW_AUTO_APPROVAL_MS',2500);
  private uiRoutes=new Map<string,UiRoute>();
  constructor(private db:Store,private root:string,private onLiveChange:()=>void){
    this.work=new Workspaces(db);
    this.queue=new DeliveryQueue(db,root,ms('CHFLOW_DEBOUNCE_MS',2000),ms('CHFLOW_TYPING_QUIET_MS',2500),e=>this.revalidateResume(e));
  }
  recover(){
    this.queue.recover();
    for(const t of this.db.tasks()){
      if(t.state==='dispatching') {t.state=t.recoveryMode&&t.mode==='interactive'&&t.rebuild?'retrying':'delivery_unknown';t.nextAt=Date.now();this.db.save(t);}
      if(t.mode==='headless'&&['submitted','delivery_unknown'].includes(t.state)){
        this.track(this.lock(t.task,async()=>{
          if(t.process){
            const actual=processStamp(t.process.pid);
            if(t.process.stamp && (actual===undefined||actual===t.process.stamp)) await stopGroup(t.process.pid);
          }
          t.process=undefined;
          this.failure(t,'interrupted');
        }));
      }
    }
  }
  isBusy(){return !!this.running.size||!!this.pending.size||this.db.tasks().some(active)||!!this.db.events().length||!!this.db.plans().length;}
  activeTaskCount(){return this.db.tasks().filter(active).length;}
  hasLiveSessions(){
    for(const state of this.uiRoutes.values()){
      if(state.current?.herdr==='reachable'&&state.current.agents.length>0)return true;
    }
    return false;
  }
  async stop(){
    this.stopping=true;
    for(const proc of this.running.values()) proc.controller.abort();
    await Promise.allSettled([...this.running.values()].map(p=>p.done).concat([...this.pending].map(p=>p.then(()=>{}))));
  }
  private track(p:Promise<unknown>){
    this.pending.add(p);
    void p.catch(e=>{if(!this.stopping)this.db.audit(null,'background_error',errcode(e));}).finally(()=>this.pending.delete(p));
  }
  private async lock<T>(id:string,fn:()=>Promise<T>):Promise<T>{
    const behind=this.locks.get(id);
    const result=Promise.resolve(behind).then(fn);
    const tail=result.then(()=>{},()=>{});
    this.locks.set(id,tail);
    try{return await result;}finally{if(this.locks.get(id)===tail)this.locks.delete(id);}
  }
  private task(id:string|undefined){
    const t=this.db.task(taskId(id));
    if(!t) throw new FlowError('task_not_found','Task not found.');
    return t;
  }
  private save(t:Task){
    const existing=this.db.task(t.task);
    if(existing){t.caller=existing.caller;t.controller=existing.controller;t.return_route=existing.return_route;}
    this.db.save(t);
  }
  private checkAttempt(t:Task,v?:string,requireMultiple=true){
    if(!v&&requireMultiple&&t.turn>1) throw new FlowError('attempt_required','Pass the active --attempt for later turns.');
    if(v&&(!/^(?:[a-f0-9]{12}|[a-f0-9]{32})$/.test(v)||!t.attempt.startsWith(v)))
      throw new FlowError('attempt_mismatch','The attempt does not match the current task.');
    if(v?.length===12&&this.db.tasks().some(a=>a.task!==t.task&&a.attempt.startsWith(v))) throw new FlowError('attempt_mismatch','Attempt prefix is ambiguous; use the full ID.');
  }
  private async owner(t:Task,ctx:Context){
    if(ctx.operator!==true)await this.work.owns(t.controller,await this.work.caller(ctx));
  }
  private async verify(t:Task){
    if(!t.pane) throw new FlowError('no_pane','This task has no interactive pane.');
    const a=await get(t.route,t.pane);
    if(!matches(t,a)) throw new FlowError('identity_changed','Worker pane identity changed.');
    return a;
  }
  private dispatchMatrix(o:Invocation['opts']){
    const config=readConfig(this.root),path=str(o,'matrix')??config.matrix;
    const matrix=channelMatrix(path);
    const explicit=str(o,'fallback')??config.fallback_chain;
    return {path,channels:matrix.channels,fallback:explicit??matrix.fallback_chain,inherited:explicit===undefined};
  }
  private initial(inv:Invocation,id:string,prev:Task|undefined,r:Route,l:Launch,cwd:string|undefined,c:Recipient|undefined,mode:Task['mode'],matrix:ReturnType<Engine['dispatchMatrix']>):Task {
    const o=inv.opts;
    const fallback=matrix.inherited&&l.channel&&Array.isArray(matrix.fallback)?
      matrix.fallback.filter(item=>item.trim()!==l.channel):matrix.fallback;
    const fall=fallbackSpecs(fallback,l.perm,matrix.channels);
    if(o.unattended) for(const choice of fall) compliance(choice,r,{unattended:true,matrix:matrix.path,channel:choice.channel},inv.ctx,false,matrix.channels);
    const quota=schedule(o,'retry_'),delays=l.kind==='agy'?[]:backoff(o);
    const launchTimeout=mode==='headless'?seconds(o.timeout,300):undefined;
    const body=str(o,'brief');
    if(body===undefined) return invalid('Provide a task brief with --brief, --brief-file or stdin.');
    const turn=(prev?.turn??0)+1;
    const text=input(body);
    let paths:{mail:string;brief:string;out:string};
    if(prev){
      const mail=clean(prev.mail);
      paths={mail,brief:join(mail,'t'+turn+'-brief.md'),out:join(mail,'t'+turn+'-reply.md')};
      mkdirSync(mail,{recursive:true,mode:0o700});
      atomic(paths.brief,text);
    }else paths=mailbox(this.root,cwd,id,turn,text);
    return {task:id,attempt:attempt(),turn,route:r,caller:c,controller:c,return_route:c,launch:l,name:l.kind,mode,state:'dispatching',
      ...paths,cwd:cwd??inv.ctx.cwd,startedAt:Date.now(),activityAt:Date.now(),retries:0,delays,fallback:fall,quotaAt:quota.at,quotaDelay:quota.after,timeout:launchTimeout};
  }
  private previous(id:string){
    const previous=this.db.task(id);
    if(previous&&!terminal(previous.state)) throw new FlowError('task_busy','Finish or cancel the current round before dispatching another.');
    return previous;
  }
  private install(t:Task){
    this.db.transaction(()=>{this.db.save(t);this.queue.discard(t,'superseded_by_new_attempt');this.db.audit(t.task,'attempt_started',t.attempt);});
  }
  private async submit(t:Task,mode:'assigned'|'resume'|'fallback'){
    if(!t.pane) throw new FlowError('no_pane','Worker pane is not available.');
    try {
      await prompt(t.route,t.pane,dispatch(t,mode));
      t.state='submitted';t.activityAt=Date.now();
      this.save(t);
      this.db.audit(t.task,mode==='assigned'?'submitted':mode==='fallback'?'fallback_dispatched':'resumed');
    } catch(e) {
      if(transient.test(errcode(e))||['invalid_response','herdr_error'].includes(errcode(e))){t.state='delivery_unknown';this.save(t);}
      else if(mode==='assigned'){ this.complete(t,false,errcode(e),false); }
      throw e;
    }
  }
  private async send(inv:Invocation,signal:AbortSignal){
    const o=inv.opts;
    if(o.watch&&o.wait)return invalid('Choose --watch or --wait.');
    const brief=str(o,'brief');
    if(brief===undefined)return invalid('Provide a task brief with --brief, --brief-file or stdin.');
    input(brief);
    const id=taskId(str(o,'task')??'task-'+randomUUID().slice(0,12));
    const t=await this.lock(id,async()=>{
      const prev=this.previous(id);
      const requested=inv.target?.split('/')??[];
      const qualified=requested.length===2;
      const explicit=str(o,'project');
      if(qualified&&explicit!==undefined&&requested[0]!==explicit)return invalid('Project and qualified role must agree.');
      const project=this.work.projects.resolve(inv.ctx.cwd,qualified?requested[0]:explicit??prev?.project_id);
      const name=qualified?roleName(requested[1]):safeTarget(inv.target);
      const role=this.db.role(project.project_id,name);
      if(o.role!==undefined&&str(o,'role')!==name)return invalid('Role and target must agree.');
      if(qualified&&!role)throw new FlowError('role_not_found','Role not found in the requested project.');
      if(!role)return this.sendPane(inv,id,prev,route(inv),name,undefined,explicit===undefined?undefined:project);
      return this.lock(this.roleKey(role),async()=>{
        const fresh=this.db.role(role.project_id,role.role);
        if(!fresh)throw new FlowError('role_not_found','Role not found in the requested project.');
        if(prev&&((prev.role&&prev.role!==fresh.role)||this.work.projects.task(prev).project_id!==fresh.project_id))
          return invalid('A follow-up must use the task’s original project and role.');
        const caller=await this.work.caller(inv.ctx);
        if(prev)await this.work.owns(prev.controller,caller,false,inv.ctx.operator);
        if(fresh.route)await this.refreshRoute(fresh.route);
        let bound=this.db.role(role.project_id,role.role)??fresh;
        if(bound.binding_mode==='unbound'){
          if(!o.spawn)throw new FlowError('role_unbound','Bind this role with chflow role bind or pass --spawn.');
          bound=await this.bindRole({...inv,opts:{...o,spawn:true}},project,bound);
        }
        if(bound.route&&(o.machine||o.session)&&!same(bound.route,route(inv)))return invalid('The requested route does not match the role binding.');
        if(roleActive(bound,this.db.tasks()))throw new FlowError('role_busy','Wait for the active role task before sending.');
        if(bound.binding_mode==='headless'){
          const r=bound.route??route(inv);
          const options={...o,kind:bound.launch!.kind,cwd:str(o,'cwd')??bound.launch_cwd};
          const invocation={...inv,opts:options};
          return this.startHeadless(invocation,id,prev,r,project,bound);
        }
        return this.sendPane(inv,id,prev,bound.route!,bound.pane_id!,bound,project);
      });
    });
    return o.wait?this.waitTask(t,seconds(o.timeout,180),signal):success(received(t));
  }

  private async sendPane(inv:Invocation,id:string,prev:Task|undefined,r:Route,target:string,role?:Role,project?:Project){
    const {opts:o,ctx}=inv;
    const scope=project?.project_id??this.work.projects.view(ctx.cwd).project_id;
    const initial=await this.work.target(r,target,scope);
    const pane=initial.agent.pane_id;
    const initialBinding=initial.p&&this.work.binding(initial.p);
    const dispatch=()=>this.work.lock(r,pane,async()=>{
      const {agent:a,p}=await this.work.target(r,pane);
      const binding=p&&this.work.binding(p);
      const expected=role??initialBinding;
      if(expected&&!samePane(expected,r,pane,a.terminal_id))
        throw new FlowError('identity_changed','The role pane identity changed.');
      if(binding?.role!==expected?.role||binding?.project_id!==expected?.project_id)
        throw new FlowError('role_busy','The pane’s role binding changed. Retry with its current role or pane.');
      if(prev?.role&&(binding?.role!==prev.role||binding?.project_id!==prev.project_id))
        return invalid('A follow-up must use the task’s original project and role.');
      const kind=kindOf(a.agent);
      const options=ctx.operator===true&&kind==='agy'&&o.attended===undefined?{...o,attended:true}:o;
      const l=launch(kind,options,p?.launch);
      const matrix=this.dispatchMatrix(o);
      compliance(l,r,options,ctx,false,matrix.channels);
      const c=await this.work.caller(ctx);
      await this.work.owns(p?.controller,c,false,ctx.operator);
      if(prev)await this.work.owns(prev.controller,c,false,ctx.operator);
      const controller=await this.work.controller(inv,c)??p?.controller;
      const self=(owner:Recipient|undefined)=>owner?.pane===pane&&same(owner.route,r);
      if(self(controller)||(ctx.operator!==true&&self(c)))return invalid('A caller cannot dispatch into its own pane.');
      this.work.assertFree(undefined,r,pane);
      if(!idle(a))throw new FlowError('pane_not_ready','Wait for the worker to settle before sending.',a.agent_status==='blocked'?2:1);
      const override=str(o,'cwd');
      if(override&&!isAbsolute(override)&&'machine' in r)return invalid('Remote workspace override must be absolute.');
      const wd=override?localCwd(ctx.cwd,override):paneCwd(a);
      const registration=this.work.projects.pane(r,a,ctx.cwd,undefined,p,true);
      const selected=project??(prev?this.work.projects.task(prev):
        override&&!p?.project_id?this.work.projects.resolve(wd!,undefined,!('machine' in r)):registration);
      const t=this.initial(inv,id,prev,r,l,wd,controller,'interactive',matrix);
      const managed=this.work.claim(p,a,r,controller,l);
      Object.assign(t,{pane,terminal:a.terminal_id,name:managed.alias,session:a.agent_session??undefined,startSeq:a.state_change_seq,
        seq:a.state_change_seq,revision:a.revision,reused:managed.native_perm!==l.perm,adoptedDispatch:managed.adopted&&!managed.adopted_sent,
        project_id:selected.project_id,role:(role??binding)?.project_id===selected.project_id?(role??binding)?.role:undefined});
      this.install(t);
      await this.submit(t,'assigned');
      if(t.adoptedDispatch)this.db.savePane({...managed,adopted_sent:true});
      return t;
    });
    return !role&&initialBinding?this.lock(this.roleKey(initialBinding),dispatch):dispatch();
  }
  private runHeadless(t:Task,mode:'assigned'|'resume'|'fallback',extra:string[]=[]){
    t.state='submitted';t.activityAt=Date.now();this.save(t);
    const controller=new AbortController();
    const done=headless(t,dispatch(t,mode),controller.signal,pid=>{
      t.process={pid,stamp:processStamp(pid)};this.save(t);
    },extra).then(res=>{
      const cur=this.db.task(t.task);
      if(!cur||cur.attempt!==t.attempt||terminal(cur.state)||this.stopping) return;
      cur.process=undefined;
      if(res.session&&redact(res.session.value)===res.session.value)cur.session=res.session;
      cur.stop_reason=res.reason;
      if(res.ok){
        const written=this.artifact(cur);
        if(written){if(redact(written)!==written) atomic(cur.out,redact(written));}
        else atomic(cur.out,redact(res.output));
        this.complete(cur,true,'completed');return;
      }
      if(res.output?.trim())atomic(cur.out,redact(res.output));
      if(res.diagnostic)cur.diag=diagnostic(cur.mail,cur.retries,'headless',res.diagnostic);
      if(res.reason==='question_blocked'){
        cur.state='blocked';cur.reason='question_blocked';this.save(cur);
        this.queue.enqueue(cur,'blocked','blocked(question)','question_blocked',{diag:cur.diag});return;
      }
      this.failure(cur,classify(res.reason,res.reason));
    }).catch(e=>{
      const cur=this.db.task(t.task);
      if(cur&&cur.attempt===t.attempt&&!terminal(cur.state)&&!this.stopping){
        cur.process=undefined;cur.stop_reason=errcode(e);this.complete(cur,false,errcode(e));
      }
    }).finally(()=>{if(this.running.get(t.task)?.controller===controller)this.running.delete(t.task);});
    this.running.set(t.task,{controller,done});
  }
  private async startHeadless(inv:Invocation,id:string,prev:Task|undefined,r:Route,project?:Project,role?:Role){
    const o=inv.opts,k=kindOf(o.kind),l=launch(k,o,role?.launch);
    const matrix=this.dispatchMatrix(o);
    compliance(l,r,o,inv.ctx,true,matrix.channels);
    if('machine' in r||o.session)return invalid('Headless run is local; use start/send for a remote Herdr Worker.');
    const transport=transportFor(k,str(o,'transport'));
    native(l,inv.extra);
    const c=await this.work.caller(inv.ctx);
    if(prev)await this.work.owns(prev.controller,c,false,inv.ctx.operator);
    if(role)await this.work.owns(role.controller,c,false,inv.ctx.operator);
    const controller=await this.work.controller(inv,c)??role?.controller;
    const cwd=localCwd(inv.ctx.cwd,str(o,'cwd'));
    const dispatchProject=project??(prev?this.work.projects.task(prev):this.work.projects.resolve(cwd));
    const task=this.initial(inv,id,prev,r,l,cwd,role||o.bg||o.controller!==undefined?controller:undefined,'headless',matrix);
    Object.assign(task,{controller,transport,project_id:dispatchProject.project_id,role:role?.role});
    this.install(task);this.runHeadless(task,'assigned',inv.extra);
    return task;
  }

  private async run(inv:Invocation,signal:AbortSignal){
    const o=inv.opts,r=route(inv),id=taskId(str(o,'task')??'task-'+randomUUID().slice(0,12));
    const t=await this.lock(id,()=>this.startHeadless(inv,id,this.previous(id),r));
    if(o.bg) return success(received(t));
    const abort=()=>{
      const current=this.db.task(t.task);
      if(current&&current.turn===t.turn&&active(current)){
        this.complete(current,false,'interrupted',false);this.running.get(t.task)?.controller.abort();
      }
    };
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted) abort();
    try {
      // Bound a foreground client independently of any future quota plan.
      return await this.waitTask(t,(t.timeout??300)+10,signal,true);
    } finally {signal.removeEventListener('abort',abort);}
  }
  private artifact(t:Task){
    try{
      const stat=lstatSync(t.out);
      if(!stat.isFile()||stat.size>1024*1024) return undefined;
      const v=fileText(t.out);return v.trim()?v:undefined;
    }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT') return undefined;throw e;}
  }
  private probe(t:Task,a?:Agent):ProgressProbe {
    let artifact:string|undefined;
    try{
      const stat=lstatSync(t.out);
      if(stat.isFile()&&stat.size>0&&stat.size<=1024*1024)artifact=`${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    return {seq:a?.state_change_seq??t.seq,revision:a?.revision??t.revision,artifact};
  }
  private humanResumed(t:Task,baseline:ProgressProbe,a:Agent|undefined,stalled=false){
    const now=this.probe(t,a);
    // A stall may already be recorded as working; only new activity invalidates it.
    const resumed=!!a&&((a.agent_status==='working'&&!stalled)||
      (baseline.seq!==undefined&&a.state_change_seq>baseline.seq)||
      (stalled&&a.revision!==baseline.revision));
    const output=now.artifact&&now.artifact!==baseline.artifact?this.artifact(t):undefined;
    if(!resumed&&!output)return false;
    this.db.transaction(()=>{
      this.db.scheduleState(t,'cancelled');
      this.queue.supersedeResume(t);
      this.db.audit(t.task,'superseded_by_human_resume');
      t.state='submitted';t.reason=undefined;t.nextAt=undefined;t.recoveryProbe=undefined;
      t.activityAt=Date.now();t.settledAt=undefined;t.recoveryMode=undefined;t.stalled=false;t.rebuild=false;t.block=undefined;
      if(a){
        t.working=a.agent_status==='working';t.startSeq=t.seq=a.state_change_seq;t.revision=a.revision;
        t.session=a.agent_session??t.session;
      }
      this.save(t);
    });
    if(output&&a?.agent_status!=='working'){
      const safe=redact(output);if(safe!==output)atomic(t.out,safe);
      this.complete(t,true,'artifact_written');
    }
    return true;
  }
  private async revalidateResume(e:Delivery){
    return this.lock(e.task,async()=>{
      const t=this.db.task(e.task);
      if(!t||t.attempt!==e.attempt||!active(t))return false;
      let a:Agent|undefined;
      try{a=await this.verify(t);}catch(err){
        if(errcode(err)!=='identity_changed')this.humanResumed(t,e.probe!,undefined,e.type==='stalled');
        return false;
      }
      return !this.humanResumed(t,e.probe!,a,e.type==='stalled');
    });
  }
  private complete(t:Task,ok:boolean,reason:string,notify=true,fromRecovery=false){
    this.db.transaction(()=>{
      if(fromRecovery)this.queue.supersedeResume(t);
      t.state=ok?'succeeded':'failed';t.reason=reason;t.nextAt=undefined;t.process=undefined;t.recoveryProbe=undefined;
      this.save(t);this.db.scheduleState(t,fromRecovery?'cancelled':'completed');
      this.db.audit(t.task,t.state,reason);
      if(notify)this.queue.enqueue(t,'result',t.state,t.note??(ok?undefined:reason+' (retries='+t.retries+')'),{out:ok||this.artifact(t)?t.out:undefined,diag:t.diag});
      else this.queue.discard(t,'superseded_by_terminal');
    });
  }
  private failure(t:Task,reason:string){
    const next=recovery(t,reason);
    this.db.transaction(()=>{
      t.reason=reason;t.startedAt=Date.now();t.block=undefined;t.recoveryMode=next.type==='fallback'?'fallback':'resume';
      this.db.audit(t.task,'business_failure',reason);
      if(next.type==='failed') return;
      t.nextAt=next.type==='fallback'?Date.now():next.at;
      t.state=next.type==='fallback'?'retrying':next.type;
      t.recoveryProbe=t.mode==='interactive'?this.probe(t):undefined;
      this.save(t);this.db.schedule(t,t.nextAt);
      if((reason==='interrupted'||reason==='settled_no_reply')&&t.recoveryProbe){
        this.queue.enqueue(t,reason,reason,'Awaiting retry.',{probe:t.recoveryProbe});
      }
      if(next.type==='scheduled_retry'){
        t.quotaUsed=true;this.save(t);
        this.queue.enqueue(t,'scheduled_retry','scheduled_retry',reason+'; '+new Date(t.nextAt).toISOString(),{diag:t.diag});
      }
    });
    if(next.type==='failed') this.complete(t,false,reason);
  }
  private async advance(t:Task,forced?:Launch,manual=false){
    let verified:Agent|undefined;
    if(t.mode==='interactive'&&t.pane&&t.recoveryProbe){
      try{verified=await this.verify(t);}catch(err){
        const code=errcode(err);
        if(code==='identity_changed'){this.complete(t,false,'identity_changed');return;}
        if(!missing.test(code)){
          if(this.humanResumed(t,t.recoveryProbe,undefined))return;
          if(manual)throw err;
          t.nextAt=Date.now()+Math.max(1000,controlDelays()[0]);
          this.db.transaction(()=>{this.save(t);this.db.schedule(t,t.nextAt!);});
          return;
        }
      }
      if(this.humanResumed(t,t.recoveryProbe,verified))return;
    }
    const previous=t.attempt;
    let mode=t.recoveryMode??'resume';
    const choice=forced??(mode==='fallback'?t.fallback[0]:undefined);
    if(choice){
      mode='fallback'; if(!forced)t.fallback=t.fallback.slice(1);
      t.launch=choice;t.name=choice.kind;t.retries=0;t.session=undefined;t.rebuild=t.mode==='interactive';
      if(t.mode==='headless')t.transport=transportFor(choice.kind);
    } else if(!manual&&t.state==='retrying'&&mode!=='fallback') t.retries++;
    const oldPane=t.pane;
    const plan=t.state==='scheduled_retry';
    t.attempt=attempt();t.activityAt=t.startedAt=Date.now();t.state='dispatching';t.nextAt=undefined;t.reason=undefined;t.working=false;t.settledAt=undefined;t.stalled=false;t.stop_reason=undefined;t.process=undefined;
    t.block=undefined;t.lastClassified=undefined;t.autoSignature=undefined;t.autoCount=0;t.recoveryMode=mode;t.recoveryProbe=undefined;
    this.db.transaction(()=>{
      this.db.scheduleState({...t,attempt:previous},plan?'triggered':'completed');
      this.save(t);this.queue.discard(t,'superseded_by_new_attempt');
      this.db.audit(t.task,choice?'fallback_switched':plan?'scheduled_retry_triggered':manual?'manual_retry':'retry',choice?.kind??String(t.retries));
      if(choice)this.queue.enqueue(t,'fallback_switched','fallback_switched','接力至 '+choice.kind,{out:this.artifact(t)?t.out:undefined,diag:t.diag});
    });
    if(t.mode==='headless'){this.runHeadless(t,mode);return;}
    try {
      let a=t.rebuild?undefined:verified;
      if(oldPane&&!t.rebuild&&!a){
        try{a=await this.verify(t);}catch(e){if(!missing.test(errcode(e))) throw e;t.rebuild=true;}
      }
      if(t.rebuild||!a){
        t.rebuild=true;this.save(t);
        const name=t.launch.kind+'-'+randomUUID().slice(0,6);
        const n=native(t.launch),rs=t.session?resumeArgs(t.launch,t.session):[];
        const ctx:Context={cwd:t.cwd,route:t.route,caller:t.controller};
        const {agent}=await startPane({ctx,opts:{place:'workspace',cwd:t.cwd}},t.route,name,t.launch.kind,[...rs,...n]);
        a=agent;t.name=name;t.pane=a.pane_id;t.terminal=a.terminal_id;t.session=a.agent_session??t.session;t.reused=false;t.rebuild=false;
        const owner=this.db.task(t.task)?.controller;
        const pane={agent:a,route:t.route,launch:t.launch,alias:name,controller:owner,adopted:false,native_perm:t.launch.perm,project_id:t.project_id};
        const role=t.project_id&&t.role?this.db.role(t.project_id,t.role):undefined;
        if(role)this.work.attach(pane,role);
        else this.db.savePane(pane);
        this.save(t);
      }
      if(!idle(a)) throw new FlowError('pane_not_ready','Worker pane is not ready to resume.');
      t.startSeq=a.state_change_seq;t.seq=a.state_change_seq;t.revision=a.revision;
      this.save(t);await this.submit(t,mode);
    }catch(e){
      if(this.db.task(t.task)?.state==='delivery_unknown') return;
      if(errcode(e)==='identity_changed') this.complete(t,false,'identity_changed');
      else this.failure(t,missing.test(errcode(e))?'pane_gone':transient.test(errcode(e))?'network_error':'interrupted');
    }
  }
  private async recoverCommand(method:'resume'|'retry',inv:Invocation){
    const id=taskId(inv.target),o=inv.opts;
    return this.lock(id,async()=>{
      const t=this.task(id),choice=str(o,'switch'), timed=schedule(o);
      await this.owner(t,inv.ctx);
      if(this.running.has(id)||['dispatching','closing','close_unknown'].includes(t.state))throw new FlowError('task_busy','The task is currently running or closing.');
      const selected=choice?fallbackSpecs(choice,t.launch.perm,channels(str(o,'matrix')??readConfig(this.root).matrix)):[];
      if(selected.length>1) return invalid('--switch accepts one fallback channel.');
      if(t.launch.kind==='agy'){
        if(o.bg||o.unattended||timed.at||timed.after||o.retry_backoff||Number(o.max_retries??0)>0||(method==='retry'&&!selected.length))
          throw new FlowError('compliance_blocked','agy cannot be retried automatically or on a timer.');
        if(!selected.length) compliance({...t.launch,attended:!!o.attended},t.route,o,inv.ctx);
      }
      let live:Agent|undefined;
      if(t.mode==='interactive'&&t.pane){
        try{live=await this.verify(t);}catch(e){if(!missing.test(errcode(e)))throw e;}
        if(live?.agent_status==='working'){
          if(active(t)&&(t.recoveryProbe||t.stalled))this.humanResumed(t,t.recoveryProbe??this.probe(t),live);
          return success({task:id,already_running:true,reason:'already_running_resumed_by_human'});
        }
        if(t.recoveryProbe&&this.humanResumed(t,t.recoveryProbe,live))return success(received(this.task(id)));
        t.recoveryProbe=this.probe(t,live);
      }
      if(t.state==='submitted'&&!t.stalled)throw new FlowError('task_busy','The worker is active; settle it before attempting recovery.');
      if(t.state==='succeeded'||t.state==='cancelled')throw new FlowError('task_terminal','Start a new turn for this task.');
      if(o.retry_backoff!==undefined||o.max_retries!==undefined)t.delays=backoff(o,t.delays);
      if(method==='retry')t.retries=0;
      const brief=str(o,'brief');
      if(brief!==undefined)atomic(t.brief,input(brief));
      if(timed.at!==undefined||timed.after!==undefined){
        if(selected.length)t.fallback=[...selected,...t.fallback];
        const at=timed.at??Date.now()+timed.after!;
        t.state='scheduled_retry';t.nextAt=at;t.recoveryMode=selected.length?'fallback':'resume';
        this.db.transaction(()=>{this.save(t);this.db.schedule(t,at);this.db.audit(id,'scheduled_retry',new Date(at).toISOString());this.queue.enqueue(t,'scheduled_retry','scheduled_retry',new Date(at).toISOString());});
      }else{
        const retryNow=inv.ctx.operator===true&&method==='retry'&&t.state==='scheduled_retry'&&!choice;
        if(!retryNow)t.recoveryMode=selected.length?'fallback':'resume';
        await this.advance(t,selected[0],true);
      }
      return success(received(this.task(id)));
    });
  }
  private async observe(t:Task){
    let a:Agent;
    try{a=await this.verify(t);}catch(e){
      if(missing.test(errcode(e))){t.rebuild=true;return this.failure(t,'pane_gone');}
      if(errcode(e)==='identity_changed')return this.complete(t,false,'identity_changed');
      return;
    }
    const now=Date.now(),seq=a.state_change_seq;
    if(t.seq!==seq||t.revision!==a.revision){
      t.seq=seq;t.revision=a.revision;t.activityAt=now;t.stalled=false;
    }
    if(a.agent_session)t.session=a.agent_session;
    if(a.agent_status==='blocked'){
      t.working=true;t.settledAt=undefined;
      if(t.lastClassified===seq){this.save(t);return;}
      t.lastClassified=seq;t.state='blocked';this.save(t);
      let raw='';
      try{raw=await screen(t.route,t.pane!,40);}catch{/* Leave an unknown block for the controller. */}
      const kind=classifyBlock(raw),diag=diagnostic(t.mail,seq,'blocked',raw),sig=signature(raw);
      t.diag=diag;t.block={seq,kind,diag,reason:kind==='permission'?'approval_required':kind==='question'?'user_question':'unknown_prompt',since:now};
      if(kind==='permission'&&t.reused&&['auto-workspace','yolo'].includes(t.launch.perm)){
        if(t.launch.perm==='auto-workspace'&&blacklist(raw,t.cwd))t.block.reason='blacklist_hit';
        else{
          const key=approveKey(t.launch.kind,raw),count=t.autoSignature===sig?(t.autoCount??0):0;
          if(count>=3)t.block.reason='approval_loop';
          else if(key){
            let latest:Agent|undefined;
            try{latest=await this.verify(t);}catch{/* Leave manual control in place. */}
            if(latest&&(latest.agent_status!=='blocked'||latest.state_change_seq!==seq)){
              t.state='submitted';t.block=undefined;this.save(t);this.queue.unblock(t);return;
            }
            if(latest){
              t.autoSignature=sig;t.autoCount=count+1;t.block.approved=true;this.save(t);
              try{await keys(t.route,t.pane!,[key]);this.db.audit(t.task,'auto_approved',String(seq));return;}
              catch{t.block.approved=false;t.block.reason='approval_delivery_unknown';}
            }
          }
        }
      }
      this.save(t);
      this.queue.enqueue(t,'blocked','blocked('+kind+')',t.block.reason,{diag,seq});
      return;
    }
    if(t.block||t.state==='blocked'){
      this.queue.unblock(t);t.block=undefined;t.state='submitted';t.settledAt=undefined;
    }
    if(a.agent_status==='working'){
      t.working=true;t.settledAt=undefined;t.state='submitted';
      if(!t.stalled&&now-t.activityAt>=this.stall){
        t.stalled=true;this.queue.enqueue(t,'stalled','stalled','No recent Worker activity.',{probe:this.probe(t,a)});this.db.audit(t.task,'stalled');
      }
    }else if(idle(a)&&(t.working||seq!==t.startSeq||t.state==='delivery_unknown')){
      t.settledAt??=now;
      const explicit=a.failure??a.error??a.failure_reason??a.stop_reason;
      if(explicit||now-t.settledAt>=this.settle){
        const output=this.artifact(t);
        if(output&&!explicit){if(redact(output)!==output)atomic(t.out,redact(output));return this.complete(t,true,'artifact_written');}
        const desc=typeof explicit==='string'?explicit:explicit?.code;
        return this.failure(t,classify(desc??'settled_no_reply',desc));
      }
    }
    this.save(t);
  }
  private roleKey(role:Pick<Role,'project_id'|'role'>){return 'role:'+role.project_id+'/'+role.role;}
  private resolvedProject(inv:Invocation,cwd=inv.ctx.cwd){
    return this.work.projects.resolve(cwd,str(inv.opts,'project'));
  }
  private roleFree(role:Role){
    if(roleActive(role,this.db.tasks()))throw new FlowError('role_busy','Wait for the active role task before changing its binding.');
  }
  private roleOptions(inv:Invocation,project:Project,role:Role):Opts{
    const o=inv.opts;
    const cwd=str(o,'cwd');
    if(cwd&&!isAbsolute(cwd)&&'machine' in route(inv))return invalid('Remote workspace override must be absolute.');
    const switching=o.kind!==undefined&&o.kind!==role.default_kind;
    return {
      kind:o.kind??role.default_kind,model:o.model??(switching?undefined:role.default_model),
      effort:o.effort??(switching?undefined:role.default_effort),provider:o.provider??(switching?undefined:role.default_provider),
      channel:o.channel??(switching?undefined:role.default_channel),perm:o.perm??role.default_perm,
      cwd:cwd?localCwd(inv.ctx.cwd,cwd):role.cwd??(isAbsolute(project.root)?project.root:inv.ctx.cwd),
      worktree:(o.worktree??role.worktree)?role.role+'-'+randomUUID().slice(0,8):undefined,
      controller:o.controller,attended:o.attended,unattended:o.unattended,bg:o.bg,matrix:o.matrix??readConfig(this.root).matrix,
      max_retries:o.max_retries,retry_backoff:o.retry_backoff,retry_at:o.retry_at,retry_after:o.retry_after,
      machine:o.machine,session:o.session,timeout:o.timeout,project:project.project_id,
    };
  }
  private async bindRole(inv:Invocation,project:Project,role:Role){
    const o=inv.opts,r=route(inv);
    if([o.pane!==undefined,!!o.spawn,!!o.headless].filter(Boolean).length!==1)
      return invalid('Choose exactly one of --pane, --spawn or --headless.');
    this.roleFree(role);
    const c=await this.work.caller(inv.ctx);
    await this.work.owns(this.work.boundPane(role)?.controller??role.controller,c,false,inv.ctx.operator);
    this.roleFree(role);
    let next:Role;
    if(o.pane!==undefined){
      if(o.worktree||o.cwd)return invalid('Use --spawn to create a pane in a specific workspace.');
      const matrix=o.matrix??readConfig(this.root).matrix;
      next=await this.work.bindExisting({...inv,opts:{...o,matrix}},role);
    }else{
      const opts=this.roleOptions(inv,project,role);
      const kind=kindOf(opts.kind);
      if(o.headless){
        const l=launch(kind,opts);
        compliance(l,r,opts,inv.ctx,true,channels(str(opts,'matrix')));
        if('machine' in r||o.session)return invalid('Headless roles require local execution.');
        if(o.worktree)return invalid('Use a local --cwd for a headless role.');
        const controller=await this.work.controller(inv,c);
        this.roleFree(role);
        next={...role,binding_mode:'headless',pane_id:undefined,terminal_id:undefined,route:r,launch:l,controller,launch_cwd:str(opts,'cwd')};
        this.db.transaction(()=>{
          this.work.detach(role);
          this.db.saveRole(next);
        });
      }else{
        await this.work.start({...inv,target:undefined,opts},role);
        next=this.db.role(role.project_id,role.role)!;
      }
    }
    if(o.close_old)await this.work.closeOld(role,next,inv.ctx,c);
    return next;
  }

  private async registerPane(method:'start'|'adopt',inv:Invocation){
    const o=inv.opts,requested=str(o,'role');
    const cwd=str(o,'cwd')?localCwd(inv.ctx.cwd,str(o,'cwd')):inv.ctx.cwd;
    if(str(o,'project')!==undefined)projectId(str(o,'project')!);
    if(requested===undefined)return this.work[method](inv);
    const name=roleName(requested);
    const r=route(inv);
    const agent=method==='adopt'&&str(o,'project')===undefined?
      await this.work.target(r,safeTarget(inv.target)):undefined;
    const project=agent?this.work.projects.pane(r,agent.agent,cwd,undefined,agent.p,true):this.resolvedProject(inv,cwd);
    return this.lock(this.roleKey({project_id:project.project_id,role:name}),async()=>{
      const role:Role=this.db.role(project.project_id,name)??{project_id:project.project_id,role:name,source:'manual',binding_mode:'unbound'};
      this.roleFree(role);
      await this.work.owns(this.work.boundPane(role)?.controller??role.controller,await this.work.caller(inv.ctx),false,inv.ctx.operator);
      this.roleFree(role);
      return this.work[method]({...inv,opts:{...o,project:project.project_id}},role);
    });
  }

  private async roleCommand(action:string,inv:Invocation){
    const {opts:o,ctx}=inv;
    const project=this.resolvedProject(inv);
    if(action==='list'){
      const r=route(inv),live=await this.refreshRoute(r);
      return {project_filter:project.project_id,roles:this.roleViews(this.work.topologyView(r,live,ctx.cwd),r,this.db.tasks(),project.project_id)};
    }
    const name=roleName(inv.target);
    return this.lock(this.roleKey({project_id:project.project_id,role:name}),async()=>{
      const old=this.db.role(project.project_id,name);
      if(action==='set'){
        const defaults=roleDefaults(o,ctx.cwd,old);
        const configOverrides=old?.source==='config'?{
          ...old.config_overrides,
          ...Object.fromEntries(Object.entries(defaults).filter(([key,value])=>value!==old[key as keyof Role])),
        }:undefined;
        const role:Role={...(old??{project_id:project.project_id,role:name,source:'manual',binding_mode:'unbound'}),
          ...defaults,config_overrides:configOverrides};
        this.db.saveRole(role);
        return this.singleRoleView(role,inv);
      }
      if(!old)throw new FlowError('role_not_found','Role not found in the requested project.');
      if(action==='bind')return this.singleRoleView(await this.bindRole(inv,project,old),inv);
      this.roleFree(old);
      await this.work.owns(this.work.boundPane(old)?.controller??old.controller,await this.work.caller(ctx),false,ctx.operator);
      this.roleFree(old);
      const remove=action==='remove'&&old.source==='manual';
      const next=this.db.transaction(()=>this.work.detach(old,remove));
      return next?this.singleRoleView(next,inv):{project_id:project.project_id,role:name,removed:true};
    });
  }

  private roleView(role:Role,r:Route,topology:ReturnType<Workspaces['topologyView']>,tasks:Task[]){
    const {launch:l,config_overrides,config_root,launch_cwd,...defaults}=role;
    const pane=role.binding_mode==='pane'&&role.route&&same(r,role.route)?
      topology.managed_panes.find(p=>p.pane_id===role.pane_id&&p.terminal_id===role.terminal_id):undefined;
    const task=roleActive(role,tasks);
    return {...defaults,controller:pane?pane.controller:role.controller,kind:pane?.kind??l?.kind,model:pane?.model??l?.model,
      effort:pane?.effort??l?.effort,provider:pane?.provider??l?.provider,perm:pane?.perm??l?.perm,
      live:role.binding_mode==='headless'||!!pane?.live,
      agent_status:role.binding_mode==='unbound'?'unbound':role.binding_mode==='headless'?
        (task?.state??'idle'):(pane?.agent_status??'offline'),active_task:task?.task};
  }

  private roleViews(topology:ReturnType<Workspaces['topologyView']>,r:Route,tasks:Task[],project?:string,roleFilter?:string){
    return this.db.roles().filter(role=>(!project||role.project_id===project)&&(!roleFilter||role.role===roleFilter)).map(role=>{
      if(role.route&&!same(role.route,r)&&role.binding_mode==='pane'){
        const live=this.uiRoutes.get(routeKey(role.route))?.current;
        if(live)return this.roleView(role,role.route,this.work.topologyView(role.route,live,this.db.project(role.project_id)?.root??'.'),tasks);
      }
      return this.roleView(role,r,topology,tasks);
    });
  }

  private async singleRoleView(role:Role,inv:Invocation){
    const r=role.route??route(inv);
    const live=await this.refreshRoute(r);
    const current=this.db.role(role.project_id,role.role)??role;
    return this.roleView(current,r,this.work.topologyView(r,live,inv.ctx.cwd),this.db.tasks());
  }

  private async prune(inv:Invocation){
    const project=str(inv.opts,'project');
    if(project)projectId(project);
    const routes=new Map([[routeKey(route(inv)),route(inv)]]);
    for(const p of this.db.panes())routes.set(routeKey(p.route),p.route);
    for(const role of this.db.roles())if(role.route)routes.set(routeKey(role.route),role.route);
    const counts=await Promise.all([...routes.values()].map(async r=>this.work.sync(r,await this.work.liveTopology(r),project)));
    const tasks=inv.opts.tasks?this.db.tasks().filter(t=>(!project||this.work.projects.task(t).project_id===project)&&!this.locks.has(t.task)):[];
    return {pruned_panes:counts.reduce((total,n)=>total+n,0),pruned_tasks:inv.opts.tasks?this.db.pruneTasks(tasks):0};
  }

  tick(){
    if(this.stopping)return;
    const routes=new Map<string,Route>();
    for(const p of this.db.panes())routes.set(routeKey(p.route),p.route);
    for(const role of this.db.roles())if(role.binding_mode==='pane'&&role.route)routes.set(routeKey(role.route),role.route);
    for(const [key,state] of this.uiRoutes){
      if(state.clients)routes.set(key,state.route);
      else if(!routes.has(key)&&!state.pending)this.uiRoutes.delete(key);
    }
    for(const r of routes.values()){
      if(Date.now()-(this.uiRoutes.get(routeKey(r))?.sampledAt??0)<500)continue;
      void this.refreshRoute(r).catch(e=>{if(!this.stopping)this.db.audit(null,'topology_error',errcode(e));});
    }
    for(const t of this.db.tasks()){
      if(this.locks.has(t.task))continue;
      if((t.state==='retrying'||t.state==='scheduled_retry')&&(t.nextAt??Infinity)<=Date.now()){
        this.track(this.lock(t.task,()=>this.advance(t)));continue;
      }
      if(t.mode==='interactive'&&['submitted','blocked','delivery_unknown'].includes(t.state)){
        if(t.block?.approved&&Date.now()-(t.block.since??Date.now())>=this.unblock&&t.lastClassified===t.block.seq){
          t.block.approved=false;t.block.reason='approval_unsettled';this.save(t);
          this.queue.enqueue(t,'blocked','blocked(permission)',t.block.reason,{diag:t.diag,seq:t.block.seq});
        }
        this.track(this.lock(t.task,()=>this.observe(t)));
      }
    }
    this.tickQueue();
  }
  private queueTick?:Promise<void>;
  private tickQueue(){
    if(this.stopping||this.queueTick)return;
    const work=this.queue.tick().finally(()=>{this.queueTick=undefined;});
    this.queueTick=work;this.track(work);
  }
  private routeState(r:Route){
    const key=routeKey(r),state:UiRoute=this.uiRoutes.get(key)??{route:r,clients:0};
    this.uiRoutes.set(key,state);
    return state;
  }
  watchUi(r:Route){
    const state=this.routeState(r);
    state.clients++;
    void this.refreshRoute(r).catch(()=>{});
    return ()=>{state.clients--;};
  }

  private refreshRoute(r:Route){
    const state=this.routeState(r);
    if(state.pending)return state.pending;
    state.sampledAt=Date.now();
    state.pending=this.work.liveTopology(r).then(topology=>{
      if(this.stopping)return topology;
      this.work.sync(r,topology);
      const agents=[...topology.agents].sort((a,b)=>a.pane_id.localeCompare(b.pane_id));
      const fingerprint=JSON.stringify({herdr:topology.herdr,agents});
      state.current=topology;
      if(fingerprint!==state.fingerprint){
        state.fingerprint=fingerprint;
        if(state.clients)this.onLiveChange();
      }
      return topology;
    }).finally(()=>{state.pending=undefined;});
    return state.pending;
  }

  private projectView(inv:Invocation,r:Route,live:LiveTopology,all:boolean){
    const {opts:o,ctx}=inv;
    const filter=str(o,'project'),roleFilter=str(o,'role');
    if(filter!==undefined)projectId(filter);
    if(roleFilter!==undefined)roleName(roleFilter);
    const current=this.work.projects.view(ctx.cwd);
    const topology=this.work.topologyView(r,live,ctx.cwd);
    const list=this.db.tasks();
    const roleProject=filter??(roleFilter?current.project_id:undefined);
    const roles=this.roleViews(topology,r,list,roleProject,roleFilter);
    const scoped=(row:{project_id:string})=>!filter||row.project_id===filter;
    const managed_panes=topology.managed_panes.filter(p=>scoped(p)&&(!roleFilter||p.project_id===roleProject&&p.role===roleFilter));
    const unmanaged_live_agents=topology.unmanaged_live_agents.filter(p=>scoped(p)&&!roleFilter);
    const tasks=list.map(t=>({...received(t),project_id:this.work.projects.task(t).project_id})).filter(t=>
      scoped(t)&&(!roleFilter||t.project_id===roleProject&&t.role===roleFilter));
    const ids=new Set(tasks.map(t=>t.task));
    const pending=(row:{task?:unknown})=>(!filter&&!roleFilter)||typeof row.task==='string'&&ids.has(row.task);
    const projectIds=new Set([
      current.project_id,...managed_panes.map(p=>p.project_id),...unmanaged_live_agents.map(p=>p.project_id),
      ...roles.map(row=>row.project_id),...tasks.map(t=>t.project_id),...this.db.projects().filter(p=>p.source==='override'||p.source==='config').map(p=>p.project_id),
    ]);
    if(filter)projectIds.add(filter);
    const projects=this.db.projects().filter(p=>projectIds.has(p.project_id)&&scoped(p)).map(project=>{
      const panes=managed_panes.filter(p=>p.project_id===project.project_id);
      const external=unmanaged_live_agents.filter(p=>p.project_id===project.project_id);
      const slots=roles.filter(role=>role.project_id===project.project_id);
      const work=tasks.filter(t=>t.project_id===project.project_id&&!terminal(t.state));
      const controllers=new Set([
        ...panes.map(p=>p.controller?.pane),...slots.map(row=>row.controller?.pane),
        ...tasks.filter(t=>t.project_id===project.project_id).map(t=>t.controller?.pane),
      ].filter((p):p is string=>p!==undefined));
      return {...project,controllers:[...controllers],roles_count:slots.length,live_panes:panes.filter(p=>p.live).length+external.length,
        active_tasks:work.length,blocked_count:work.filter(t=>t.state==='blocked').length};
    });
    const duplicateNames=new Set(projects.filter((p,i)=>projects.findIndex(q=>q.name===p.name)<i).map(p=>p.name));
    for(const p of projects)if(duplicateNames.has(p.name))p.name=dirname(p.root)+' / '+p.name;
    const visibleRecipients=new Set([...projects.flatMap(p=>p.controllers),...managed_panes.map(p=>p.pane_id),...unmanaged_live_agents.map(p=>p.pane_id)]);
    return {route:r,herdr:topology.herdr,managed_panes,unmanaged_live_agents,projects,roles,project_filter:filter,
      current_project:current.project_id,tasks:all?tasks:tasks.filter(t=>!terminal(t.state)),
      queue:this.db.events(all).filter(pending),scheduled_retries:this.db.plans(all).filter(pending),
      paused_recipients:this.db.pausedPanes(r).filter(p=>!filter||visibleRecipients.has(p)),
      audit:this.db.logs().filter(event=>!filter||typeof event.task==='string'&&ids.has(event.task))};
  }

  async uiSnapshot(inv:Invocation,sequence:()=>number){
    const r=route(inv),state=this.routeState(r);
    const refresh=this.refreshRoute(r);
    const live=state.clients?await Promise.race([
      refresh,sleep<LiveTopology>(500,state.current??{herdr:'checking',agents:[]},{ref:false}),
    ]):await refresh;
    const view=this.projectView(inv,r,live,true);
    return {seq:sequence(),now:Date.now(),...view};
  }
  private uiFile(inv:Invocation){
    const t=this.task(inv.target),kind=inv.opts.kind,requested=inv.opts.turn;
    if(kind!=='brief'&&kind!=='out'&&kind!=='diag')return invalid('Choose brief, out or diag.');
    const turn=requested===undefined?t.turn:/^\d+$/.test(String(requested))?Number(requested):NaN;
    if(!Number.isSafeInteger(turn)||turn<1||turn>t.turn)return invalid('Turn is outside the task history.');
    const mail=resolve(t.mail),diag=t.block?.diag??t.diag;
    const path=kind==='diag'?(diag?resolve(diag):''):join(mail,'t'+turn+(kind==='brief'?'-brief.md':'-reply.md'));
    return success({task:t.task,kind,turn,path,exists:false,content:'',...(path?readMailboxFile(mail,path):undefined)});
  }
  private activePaneTask(r:Route,pane:string){
    return this.db.tasks().find(t=>t.pane===pane&&same(t.route,r)&&t.mode==='interactive'&&active(t));
  }
  private uiSetPerm(inv:Invocation){
    const target=safeTarget(inv.target),requested=str(inv.opts,'perm');
    if(requested===undefined)return invalid('Provide a permission tier.');
    const perm=permission({perm:requested});
    const selected=this.db.task(target),r=selected?.route??route(inv);
    const pane=selected?selected.pane:this.db.panes().find(p=>same(r,p.route)&&(p.agent.pane_id===target||p.alias===target))?.agent.pane_id;
    if(!selected&&!pane)throw new FlowError('not_managed','Select a task or a managed pane.');
    const current=(pane?this.activePaneTask(r,pane):undefined)??selected;
    const apply=()=>{
      const p=pane?this.db.pane(r,pane):undefined;
      const running=pane?this.activePaneTask(r,pane):undefined;
      const ids=new Set([selected?.task,running?.task].filter((id):id is string=>!!id));
      this.db.transaction(()=>{
        if(p)this.db.savePane({...p,launch:{...p.launch,perm}});
        for(const id of ids){
          const t=this.task(id);
          t.launch={...t.launch,perm};
          t.reused=!p||p.native_perm!==perm;
          this.save(t);
        }
        this.db.audit(selected?.task??running?.task??null,'perm_updated',target+' '+perm);
      });
      if(running?.state==='blocked'&&(perm==='auto-workspace'||perm==='yolo')){
        this.track(this.lock(running.task,async()=>{
          const t=this.task(running.task);
          if(t.attempt!==running.attempt||t.state!=='blocked'||t.block?.approved||t.launch.perm!==perm)return;
          t.lastClassified=undefined;t.autoCount=0;this.save(t);
          await this.observe(t);
        }));
      }
      return success({target,perm});
    };
    const update=async()=>pane?this.work.lock(r,pane,async()=>apply()):apply();
    return current?this.lock(current.task,update):update();
  }
  private approve(inv:Invocation){
    const blocked=inv.target===undefined
      ?this.db.tasks().filter(t=>t.state==='blocked')
      :[this.task(inv.target)].filter(t=>t.state==='blocked');
    if(!blocked.length)throw new FlowError('task_not_found','No matching blocked task.');
    if(blocked.length>1)return invalid('Choose a blocked task: '+blocked.map(t=>t.task).join(', ')+'.');
    const t=blocked[0],{key,text,submit_key}=inv.opts;
    if(!t.pane)throw new FlowError('no_pane','The blocked task has no Worker pane.');
    const keys=key??(text===undefined?['enter']:undefined);
    return this.uiTerminal({...inv,target:t.task,opts:{keys,text,submit_key}},t);
  }
  private async uiTerminal(inv:Invocation,blocked?:Task){
    const {opts:o}=inv,target=safeTarget(inv.target);
    const text=str(o,'text'),message=str(o,'prompt'),rawKeys=o.keys,submit=str(o,'submit_key');
    if(rawKeys===undefined&&text===undefined&&message===undefined)return invalid('Provide keys, text or prompt.');
    if(text===undefined&&submit!==undefined)return invalid('A submit key requires literal text.');
    if(text!==undefined&&/[\x00-\x1f\x7f]/.test(text))return invalid('Use single-line terminal text.');
    const keyList=(rawKeys===undefined?[]:Array.isArray(rawKeys)?rawKeys:[String(rawKeys)]).map(keyArg);
    const last=submit===undefined?[]:[keyArg(submit)];
    const line=text===undefined?undefined:clean(text);
    const promptText=message===undefined?undefined:input(message);
    const selected=this.db.task(target),r=selected?.pane?selected.route:route(inv);
    const pane=selected?.pane??(await this.work.target(r,target)).agent.pane_id;
    const task=this.activePaneTask(r,pane);
    const send=()=>this.work.lock(r,pane,async()=>{
      if(selected?.pane){
        const fresh=this.task(selected.task);
        if(fresh.pane!==pane||!same(fresh.route,r))throw new FlowError('identity_changed','The Worker pane moved.');
        const agent=await this.verify(fresh);
        if(blocked&&(fresh.attempt!==blocked.attempt||fresh.state!=='blocked'||fresh.block?.seq!==blocked.block?.seq||
          agent.agent_status!=='blocked'||agent.state_change_seq!==blocked.block?.seq))
          throw new FlowError('block_changed','The Worker block changed before approval.');
      }else await this.work.target(r,pane);
      await keys(r,pane,keyList);
      if(line!==undefined){await literal(r,pane,line);await keys(r,pane,last);}
      if(promptText!==undefined)await prompt(r,pane,promptText);
      const current=this.activePaneTask(r,pane);
      this.db.transaction(()=>{
        if(current?.state==='blocked'){
          this.queue.unblock(current);
          current.block=undefined;current.state='submitted';this.save(current);
        }
        this.db.audit(current?.task??selected?.task??null,'terminal_control',pane);
      });
      return success({ok:true,pane});
    });
    return task?this.lock(task.task,send):send();
  }
  private screenLines(o:Invocation['opts']){
    const lines=seconds(o.lines,40,1,500);
    return Number.isInteger(lines)?lines:invalid('Screen line count must be an integer.');
  }
  private async uiScreen(inv:Invocation){
    const target=safeTarget(inv.target);
    if(this.db.task(target))return this.inspect({...inv,opts:{...inv.opts,screen:true}});
    const lines=this.screenLines(inv.opts),r=route(inv);
    const {agent}=await this.work.target(r,target);
    return success({pane_id:agent.pane_id,screen:redact(await screen(r,agent.pane_id,lines))});
  }
  private async uiQueue(method:string,inv:Invocation){
    const r=route(inv),o=inv.opts,pane=inv.target===undefined?undefined:safeTarget(inv.target);
    const eventId=str(o,'event_id');
    if(method==='queue_pause'){
      const caller=inv.ctx.caller;
      return success(this.queue.pause(r,safeTarget(pane??(caller&&same(caller.route,r)?caller.pane:undefined))));
    }
    if(method==='queue_resume'){
      const result=this.queue.resume(r,pane);
      this.tickQueue();
      return success(result);
    }
    if(method==='queue_deliver_now')return success(await this.queue.deliverNow(r,pane,eventId===undefined?undefined:safeTarget(eventId)));
    const id=safeTarget(eventId);
    if(method==='queue_consume'||method==='queue_drop')return success(await this.queue.editEvent(method,id));
    const dest=route({ctx:inv.ctx,opts:{session:str(o,'to_session'),machine:str(o,'to_machine')}});
    const recipient=await this.work.recipient(dest,safeTarget(str(o,'to')));
    const result=await this.queue.editEvent('queue_reroute',id,recipient);
    this.tickQueue();
    return success(result);
  }
  private cancelRetry(inv:Invocation){
    const id=taskId(inv.target);
    return this.lock(id,async()=>{
      const t=this.task(id);
      this.db.transaction(()=>{
        this.db.scheduleState(t,'cancelled');
        t.nextAt=undefined;
        if(t.state==='scheduled_retry'||t.state==='retrying'){
          t.state='failed';t.reason='operator_cancelled_retry';
          for(const e of this.db.events(false,id)){
            if(e.attempt===t.attempt&&e.type==='scheduled_retry'&&e.state!=='delivering')
              this.db.delivery({...e,state:'superseded_by_operator',nextAt:undefined});
          }
        }
        this.save(t);
        this.db.audit(id,'retry_cancelled');
      });
      return success(received(t));
    });
  }
  private async reply(inv:Invocation){
    const o=inv.opts,id=taskId(inv.target);
    return this.lock(id,async()=>{
      const t=this.task(id);this.checkAttempt(t,str(o,'attempt'));
      const recovering=t.state==='retrying'||t.state==='scheduled_retry';
      if(!['submitted','blocked','delivery_unknown'].includes(t.state)&&(!recovering||o.question||o.progress))
        throw new FlowError('task_inactive','This attempt is no longer accepting this reply.');
      const mood=['ok','fail','question','progress'].filter(v=>o[v]);
      if(mood.length>1)return invalid('Choose one reply status.');
      const body=str(o,'body'),out=str(o,'out');
      if(body!==undefined&&out)return invalid('Choose one reply body or artifact.');
      if(body!==undefined)atomic(t.out,input(body));
      if(out&&resolve(inv.ctx.cwd,out)!==t.out)atomic(t.out,input(fileText(resolve(inv.ctx.cwd,out))));
      const text=note(str(o,'note'));
      if(o.question||o.progress){
        this.queue.enqueue(t,o.question?'blocked':'progress',o.question?'blocked(question)':'progress',text,{out:body!==undefined||out?t.out:undefined});
        // A voluntary question is a message, distinct from a Herdr block snapshot.
      }else{
        t.note=text;this.complete(t,!o.fail,o.fail?'worker_reported_failure':'worker_replied',true,recovering);
      }
      const pending=this.db.events(false,id).some(e=>e.attempt===t.attempt);
      return success({...received(t),queued:pending},pending?2:0);
    });
  }
  private async respond(inv:Invocation){
    const id=taskId(inv.target),o=inv.opts,expect=str(o,'expect_visible');
    const force=o.force===true&&inv.ctx.operator===true;
    if(!force&&!expect?.trim())return invalid('respond requires --expect-visible.');
    const rawKey=o.key,text=str(o,'text'),submit=str(o,'submit_key');
    if(rawKey===undefined&&text===undefined&&submit===undefined)return invalid('Provide --key, --text or --submit-key.');
    const first=(rawKey===undefined?[]:Array.isArray(rawKey)?rawKey:[String(rawKey)]).map(keyArg);
    const last=submit?keyArg(submit):undefined;
    if(text!==undefined&&/[\r\n\x00-\x1f]/.test(text))return invalid('Response text must be a single plain line.');
    return this.lock(id,async()=>{
      const t=this.task(id);await this.owner(t,inv.ctx);
      const a=await this.verify(t);
      if(a.agent_status!=='blocked'){
        this.queue.unblock(t);return success({task:id,already_unblocked:true,reason:'already_unblocked_by_human'});
      }
      if(!force){
        if(!t.block||a.state_change_seq!==t.block.seq)throw new FlowError('block_changed','The current block has not been classified yet.',2);
        if(!fileText(t.block.diag).includes(clean(expect!)))throw new FlowError('expectation_mismatch','The expected text did not match the block snapshot.',2);
      }
      const again=await this.verify(t);
      if(again.agent_status!=='blocked'){
        this.queue.unblock(t);return success({task:id,already_unblocked:true,reason:'already_unblocked_by_human'});
      }
      if(again.state_change_seq!==a.state_change_seq)throw new FlowError('block_changed','The block changed; inspect it again.',2);
      if(first.length)await keys(t.route,t.pane!,first);
      if(text!==undefined)await literal(t.route,t.pane!,clean(text));
      if(last)await keys(t.route,t.pane!,[last]);
      this.db.audit(id,'responded',String(a.state_change_seq));
      return success({task:id,responded:true});
    });
  }
  private async waitTask(t:Task,timeout:number,signal:AbortSignal,foreground=false){
    const end=Date.now()+timeout*1000;
    while(!signal.aborted){
      const cur=this.task(t.task);
      if(cur.turn!==t.turn)throw new FlowError('attempt_mismatch','The task turn changed while waiting.');
      if(terminal(cur.state))return success(received(cur),cur.state==='succeeded'?0:1);
      if(cur.state==='blocked'&&(cur.mode==='headless'||!cur.block?.approved))return success(received(cur),2);
      if(foreground&&cur.state==='scheduled_retry')return success(received(cur),2);
      if(Date.now()>=end)return success(received(cur),3);
      await sleep(Math.min(100,end-Date.now()),undefined,{signal}).catch(()=>{});
    }
    throw new FlowError('ipc_cancelled','Request cancelled.');
  }
  private async wait(inv:Invocation,signal:AbortSignal){
    const id=safeTarget(inv.target),timeout=seconds(inv.opts.timeout,180), t=this.db.task(id);
    if(t)return this.waitTask(t,timeout,signal);
    const r=route(inv),until=Date.now()+timeout*1000;
    while(!signal.aborted){
      const {agent}=await this.work.target(r,id);
      if(idle(agent)||agent.agent_status==='blocked')return success(agent,agent.agent_status==='blocked'?2:0);
      if(Date.now()>=until)return success(agent,3);
      await sleep(Math.min(150,until-Date.now()),undefined,{signal}).catch(()=>{});
    }
    throw new FlowError('ipc_cancelled','Request cancelled.');
  }
  private async inspect(inv:Invocation){
    const t=this.task(inv.target),o=inv.opts;
    const value={...received(t),queue:this.db.events(true,t.task),audit:this.db.logs(t.task),diag_text:o.diag&&t.diag?fileTextIf(t.diag):undefined,screen:undefined as string|undefined};
    if(o.screen){
      await this.verify(t);
      const lines=this.screenLines(o);
      const raw=await screen(t.route,t.pane!,lines);
      value.screen=redact(raw);value.diag=diagnostic(t.mail,t.seq??0,'inspect',raw);
    }
    return success(value);
  }
  private async finish(inv:Invocation){
    const o=inv.opts,id=taskId(inv.target);
    if(!!o.ok===!!o.fail)return invalid('Choose --ok or --fail.');
    return this.lock(id,async()=>{
      const t=this.task(id);await this.owner(t,inv.ctx);this.checkAttempt(t,str(o,'attempt'),false);
      if(['cancelled','closing','close_unknown'].includes(t.state))throw new FlowError('task_inactive','This task cannot be finished.');
      const proc=this.running.get(id);
      t.note=note(str(o,'note'))??t.note;t.finished=true;
      this.complete(t,!!o.ok,'controller_finished',false);
      proc?.controller.abort();
      return success(received(t));
    });
  }
  private cancelled(t:Task){
    this.db.transaction(()=>{
      t.state='cancelled';t.reason='controller_cancelled';t.nextAt=undefined;t.process=undefined;t.closeOwner=undefined;
      this.save(t);this.db.scheduleState(t,'cancelled');this.queue.discard(t,'superseded_by_terminal');this.db.audit(t.task,'cancelled');
    });
  }
  private async cancel(inv:Invocation){
    const id=taskId(inv.target),o=inv.opts;
    return this.lock(id,async()=>{
      const t=this.task(id);await this.owner(t,inv.ctx);
      const closeState=['closing','close_unknown'].includes(t.state);
      if(closeState){
        const pid=Number(t.closeOwner?.split(':')[1]);
        if(!o.reconcile||alive(pid))throw new FlowError('close_in_progress','An outstanding close requires a dead owner and --reconcile.',2);
      }else if(o.reconcile)return invalid('No uncertain close to reconcile.');
      const running=this.running.get(id);
      if(!o.close_pane&&!closeState){this.cancelled(t);running?.controller.abort();return success(received(t));}
      if(!t.pane)throw new FlowError('no_pane','This task has no interactive pane.');
      this.work.assertFree(t,t.route,t.pane);
      return this.work.lock(t.route,t.pane,async()=>{
        const old=t.state;
        t.closeOwner='closing:'+process.pid+':'+randomUUID();t.state='closing';this.save(t);
        try{await this.verify(t);await closePane(t.route,t.pane!);}
        catch(e){
          const code=errcode(e);
          if(!missing.test(code)){
            if(transient.test(code)||code==='invalid_response'||code==='herdr_error')t.state='close_unknown';
            else {t.state=old;t.closeOwner=undefined;}
            this.save(t);throw e;
          }
        }
        this.cancelled(t);return success(received(t));
      });
    });
  }
  async invoke(method:string,inv:Invocation,signal:AbortSignal):Promise<Reply>{
    const {opts:o}=inv;
    if((method==='approve'||method.startsWith('ui.')&&method!=='ui.file')&&inv.ctx.operator!==true)
      throw new FlowError('operator_required','This action requires an authenticated Web UI or interactive terminal operator.');
    switch(method){
      case 'approve':return this.approve(inv);
      case 'ui.file':return this.uiFile(inv);
      case 'ui.set_perm':return this.uiSetPerm(inv);
      case 'ui.terminal':return this.uiTerminal(inv);
      case 'ui.screen':return this.uiScreen(inv);
      case 'ui.queue_pause':case 'ui.queue_resume':case 'ui.queue_deliver_now':
      case 'ui.queue_consume':case 'ui.queue_drop':case 'ui.queue_reroute':return this.uiQueue(method.slice(3),inv);
      case 'ui.cancel_retry':return this.cancelRetry(inv);
      case 'role.list':case 'role.set':case 'role.bind':case 'role.unbind':case 'role.remove':
      case 'ui.role.set':case 'ui.role.bind':case 'ui.role.unbind':case 'ui.role.remove':
        return success(await this.roleCommand(method.split('.').at(-1)!,inv));
      case 'prune':case 'ui.prune':return success(await this.prune(inv));
      case 'ui.assign_project': {
        const project=str(o,'project');
        if(!project)return invalid('Select a destination project.');
        return success(await this.work.assignProject(inv,this.resolvedProject(inv)));
      }
      case 'start':return success(await this.registerPane('start',inv));
      case 'switch':return success(await this.work.switch(inv));
      case 'adopt':return success(await this.registerPane('adopt',inv));
      case 'handoff':return success(await this.work.handoff(inv));
      case 'send':return this.send(inv,signal);
      case 'run':return this.run(inv,signal);
      case 'reply':return this.reply(inv);
      case 'wait':return this.wait(inv,signal);
      case 'watch':{const t=this.task(inv.target);return success({...received(t),watching:active(t)});}
      case 'respond':return this.respond(inv);
      case 'resume':case 'retry':return this.recoverCommand(method,inv);
      case 'inspect':return this.inspect(inv);
      case 'finish':return this.finish(inv);
      case 'cancel':return this.cancel(inv);
      case 'inbox':case 'flush': {
        const r=route(inv);
        const pane=safeTarget(inv.target??(inv.ctx.caller&&same(inv.ctx.caller.route,r)?inv.ctx.caller.pane:undefined));
        return success(method==='inbox'?{pane,queue:this.queue.inbox(r,pane)}:await this.queue.flush(r,pane));
      }
      case 'list':case 'health': {
        const r=route(inv),includePanes=method==='health'||!!o.panes;
        const live=includePanes?await this.refreshRoute(r):this.uiRoutes.get(routeKey(r))?.current??{herdr:'unchecked',agents:[]};
        const data=this.projectView(inv,r,live,!!o.all);
        if(!includePanes){
          const {tasks,queue,scheduled_retries,projects,roles,project_filter,current_project}=data;
          return success({tasks,queue,scheduled_retries,projects,roles,project_filter,current_project});
        }
        let target:unknown;
        if(inv.target){
          const task=this.db.task(inv.target);
          if(task){
            const project_id=this.work.projects.task(task).project_id;
            if(!data.project_filter||data.project_filter===project_id)target={...received(task),project_id};
          }else{
            const found=await this.work.target(r,safeTarget(inv.target),data.project_filter);
            const project_id=this.work.projects.pane(r,found.agent,inv.ctx.cwd,undefined,found.p).project_id;
            if(!data.project_filter||data.project_filter===project_id)target={...found.agent,project_id};
          }
        }
        return success({...data,target,daemon:{pid:process.pid,version:VERSION}});
      }
      default:throw new FlowError('unknown_method','Unknown chflow command.');
    }
  }
}
