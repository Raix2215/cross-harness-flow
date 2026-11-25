import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { channels, compliance, kindOf, launch, native, resumeArgs } from './harnesses.js';
import { checkedAgent, closePane, get, herdr, idle, keys, missing, prompt, route, same, screen, startIn, startPane } from './herdr.js';
import { paneCwd, Projects, roleActive, samePane } from './projects.js';
import { sessionsEqual } from './queue.js';
import { clean } from './sensitive.js';
import type { Store } from './store.js';
import { FlowError, invalid, routeKey, seconds, str, terminal, type Agent, type Context, type Invocation, type Launch, type ManagedPane, type Project, type Recipient, type Role, type Route, type Task } from './types.js';
export const paneKey=(r:Route,p:string)=>routeKey(r)+':'+p;
export function safeTarget(s:string|undefined){
  if(!s||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(s)) return invalid('Provide a valid Herdr target.');
  return clean(s);
}
const alias=(s:string)=>{
  if(!/^[a-z][a-z0-9_-]{0,31}$/.test(s)) return invalid('Agent alias must match [a-z][a-z0-9_-]{0,31}.');
  return s;
};
const recipient=(r:Route,a:Agent,label?:string):Recipient=>({route:r,pane:a.pane_id,label:label??a.name??a.pane_id,terminal:a.terminal_id,kind:a.agent,session:a.agent_session??undefined});
const sameRecipient=(a:Recipient,b:Recipient)=>same(a.route,b.route)&&a.pane===b.pane&&(!a.terminal||!b.terminal||a.terminal===b.terminal)&&(!a.session||!b.session||sessionsEqual(a.session,b.session));
export function matches(t:{terminal?:string; session?:Task['session'];launch:{kind:string}},a:Agent) {
  return t.terminal===a.terminal_id&&t.launch.kind===a.agent&&sessionsEqual(t.session,a.agent_session);
}
export function paneView(p:ManagedPane){
  return {pane_id:p.agent.pane_id,kind:p.agent.agent,terminal_id:p.agent.terminal_id,name:p.agent.name,alias:p.alias,
    cwd:p.agent.foreground_cwd??p.agent.cwd,agent_session:p.agent.agent_session,state_change_seq:p.agent.state_change_seq,revision:p.agent.revision,
    controller:p.controller??null,perm:p.launch.perm,native_perm:p.native_perm,adopted:p.adopted,route:p.route,model:p.launch.model,effort:p.launch.effort,provider:p.launch.provider};
}
// Herdr can leave a newly launched Harness blocked on its folder trust menu.
async function startWithTrust(inv:Invocation,r:Route,name:string,launch:Launch,flags:string[]){
  const o=inv.opts,k=launch.kind;
  const authorized=(k==='codex'||k==='claude'||k==='agy')&&(o.trust_repository||launch.perm==='auto-workspace'||launch.perm==='yolo');
  const unused=authorized&&await get(r,name).then(()=>false,(e:unknown)=>e instanceof FlowError&&missing.test(e.code));
  try{return await startPane(inv,r,name,k,flags);}
  catch(e){
    if(!unused||!(e instanceof FlowError)||e.code!=='agent_not_ready')throw e;
    const target=str(o,'pane'),place=str(o,'place')??(o.worktree?'workspace':target?'pane':'split');
    const agent=await get(r,name).catch(()=>undefined);
    if(!agent||agent.name!==name||agent.agent!==k||agent.agent_status!=='blocked'||(place==='pane'&&agent.pane_id!==target))throw e;
    const raw=await screen(r,agent.pane_id,25).catch(()=>'');
    const visible=raw.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
    const selection=visible.split(/\r?\n/).filter(line=>/^\s*[›❯>]/.test(line));
    if(!/trust this folder|do you trust the files in this folder|do you trust the contents of this project/i.test(visible)||selection.length!==1||
      !/^\s*[›❯>]\s*(?:\d+[.)]\s*)?(?:yes|trust|continue|allow)\b/i.test(selection[0])||
      /\b(?:without trusting|don't trust|do not trust)\b/i.test(selection[0]))throw e;
    const sameLaunch=(a:Agent)=>a.pane_id===agent.pane_id&&a.terminal_id===agent.terminal_id&&a.name===name&&a.agent===k;
    const result=(a:Agent)=>({agent:a,place,worktree_path:o.worktree?a.foreground_cwd??a.cwd:undefined});
    let current=await get(r,agent.pane_id);
    if(!sameLaunch(current))throw e;
    if(idle(current))return result(current);
    if(current.agent_status!=='blocked'||current.state_change_seq!==agent.state_change_seq||
      current.revision!==agent.revision)throw e;
    await keys(r,agent.pane_id,['enter']);
    const until=Date.now()+seconds(o.timeout,30,4,300)*1000;
    do{
      current=await get(r,agent.pane_id);
      if(!sameLaunch(current))throw e;
      if(idle(current))return result(current);
      await sleep(150);
    }while(Date.now()<until);
    throw e;
  }
}

const liveView=(a:Agent)=>({pane_id:a.pane_id,name:a.name,kind:a.agent,terminal_id:a.terminal_id,agent_status:a.agent_status,
  cwd:a.foreground_cwd??a.cwd,state_change_seq:a.state_change_seq,agent_session:a.agent_session,workspace_id:a.workspace_id,tab_id:a.tab_id});
const isLiveStatus=(status:string)=>!['exited','stopped','closed','offline','dead'].includes(status.toLowerCase());
export type LiveTopology={
  herdr:string;
  agents:ReturnType<typeof liveView>[];
  checkedPanes?:Set<string>;
  checkedRoles?:Set<string>;
};
const paneIdentity=(p:string,t:string)=>JSON.stringify([p,t]);
const bindingIdentity=(r:Role)=>JSON.stringify([r.project_id,r.role,r.pane_id,r.terminal_id]);

export class Workspaces {
  private locks=new Set<string>();
  readonly projects:Projects;
  constructor(private db:Store){this.projects=new Projects(db);}
  async lock<T>(r:Route,p:string,fn:()=>Promise<T>):Promise<T>{
    const k=paneKey(r,p);
    if(this.locks.has(k)) throw new FlowError('pane_busy','Another pane operation is in progress.');
    this.locks.add(k);
    try {return await fn();} finally {this.locks.delete(k);}
  }
  async caller(ctx:Context){
    if(!ctx.caller) return undefined;
    const c=ctx.caller;
    try{return recipient(c.route,await get(c.route,safeTarget(c.pane)),c.label===c.pane?undefined:c.label);}
    catch(e){if(ctx.operator!==true)throw e;}
  }
  async recipient(r:Route,pane:string){
    return recipient(r,await get(r,safeTarget(pane)));
  }
  controller(inv:Invocation,caller:Recipient|undefined){
    const requested=str(inv.opts,'controller');
    return requested===undefined?caller:this.recipient(inv.ctx.route,requested);
  }
  async target(r:Route,target:string,project?:string){
    const aliases=this.db.panes().filter(p=>same(r,p.route)&&p.alias===target);
    const saved=aliases.find(p=>p.project_id===project)??aliases[0];
    const a=await get(r,saved?.agent.pane_id??target);
    if(!isLiveStatus(a.agent_status))
      throw new FlowError('agent_not_running','The target agent session has exited.');
    kindOf(a.agent);
    const p=this.db.pane(r,a.pane_id);
    if(p&&(p.agent.terminal_id!==a.terminal_id||p.agent.agent!==a.agent||!sessionsEqual(p.agent.agent_session,a.agent_session)))
      throw new FlowError('identity_changed','The tracked pane identity changed; explicitly adopt the verified pane to register it again.');
    return {agent:a,p};
  }
  async owns(owner:Recipient|undefined,caller:Recipient|undefined,takeover=false,operator=false){
    if(operator===true || !owner || (caller&&sameRecipient(owner,caller)) || takeover) return;
    try {
      const a=await get(owner.route,owner.pane);
      if(!sameRecipient(owner,recipient(owner.route,a)) || a.agent_status==='exited') return;
    } catch(e) {if(e instanceof FlowError&&missing.test(e.code)) return;}
    throw new FlowError('pane_owned_by_other','The pane is controlled by another live session.',1,{controller:owner});
  }
  private conflict(t:Task|undefined,r:Route,p:string){
    return this.db.tasks().find(x=>x.task!==t?.task&&x.pane===p&&same(x.route,r)&&!terminal(x.state));
  }
  assertFree(t:Task|undefined,r:Route,p:string){
    if(this.conflict(t,r,p)) throw new FlowError('pane_busy','The pane is already running another chflow task.');
  }
  private aliasUnique(r:Route,pane:string|undefined,name:string){
    if(this.db.panes().some(p=>same(r,p.route)&&p.alias===name&&p.agent.pane_id!==pane)) return invalid('Pane alias is already registered on this route.');
  }
  async start(inv:Invocation,role?:Role){
    const {opts:o,ctx}=inv,r=route(inv),k=kindOf(o.kind),l=launch(k,o),matrix=channels(str(o,'matrix'));
    compliance(l,r,o,ctx,false,matrix);
    const name=alias(inv.target??k+'-'+randomUUID().slice(0,6));
    const explicit=o.place==='split'?undefined:str(o,'pane');
    const flags=native(l,inv.extra);
    const rs=str(o,'resume');
    const resumed=rs?resumeArgs(l,rs==='last'?undefined:{kind:k==='pi'?'path':'id',value:clean(rs)},rs==='last'):[];
    const action=async()=>{
      const c=await this.caller(ctx);
      if(explicit){
        safeTarget(explicit);
        const old=this.db.pane(r,explicit);
        await this.owns(old?.controller,c,false,ctx.operator);
        this.assertFree(undefined,r,explicit);
        if(old&&this.binding(old))throw new FlowError('role_busy','Unbind the role before replacing its pane.');
      }
      const controller=await this.controller(inv,c);
      this.aliasUnique(r,explicit,name);
      const cwd=str(o,'cwd');
      const requestedProject=str(o,'project');
      if(!('machine' in r))this.projects.resolve(cwd??ctx.cwd,requestedProject);
      const {agent,place,worktree_path}=await startWithTrust(inv,r,name,l,[...resumed,...flags]);
      if(agent.agent!==k) throw new FlowError('identity_changed','Herdr launched an unexpected Harness.');
      const project=this.projects.pane(r,agent,ctx.cwd,str(o,'project'),undefined,true);
      const p:ManagedPane={agent,route:r,launch:l,alias:name,controller,adopted:false,native_perm:l.perm,
        project_id:str(o,'project')===undefined?undefined:project.project_id};
      if(role)this.attach(p,role);
      else this.db.savePane(p);
      return {...paneView(p),alias:role?.role??name,project_id:project.project_id,role:role?.role,place,worktree_path,resume:rs?'requested':undefined};
    };
    return this.lock(r,explicit??'start:'+name,action);
  }
  async adopt(inv:Invocation,role?:Role){
    const r=route(inv),id=safeTarget(inv.target),o=inv.opts;
    const found=this.db.panes().find(p=>same(p.route,r)&&p.alias===id);
    const a=await get(r,found?.agent.pane_id??id), k=kindOf(a.agent);
    return this.lock(r,a.pane_id,async()=>{
      const p=this.db.pane(r,a.pane_id);
      const c=await this.caller(inv.ctx);
      const newOwner=await this.controller(inv,c);
      const clearOwner=!!o.takeover&&inv.ctx.operator===true&&!newOwner;
      if(o.takeover&&!newOwner&&!clearOwner) return invalid('Takeover requires a live controller pane.');
      await this.owns(p?.controller,c,!!o.takeover,inv.ctx.operator);
      if(!['working','idle','done'].includes(a.agent_status)) throw new FlowError('pane_not_ready','Adopt a working, idle or done agent.');
      const l=launch(k,o,p?.agent.agent===k?p.launch:undefined);
      compliance(l,r,o,inv.ctx,false,channels(str(o,'matrix')));
      const existingName=[p?.alias,a.name].find((s):s is string=>!!s&&/^[a-z][a-z0-9_-]{0,31}$/.test(s));
      const name=alias(str(o,'name')??existingName??(k+'-'+randomUUID().slice(0,6)));
      this.aliasUnique(r,a.pane_id,name);
      if(p && !matches({terminal:p.agent.terminal_id,session:p.agent.agent_session??undefined,launch:p.launch},a)) this.assertFree(undefined,r,a.pane_id);
      const existing=p&&this.binding(p);
      if(existing&&(role&&(existing.role!==role.role||existing.project_id!==role.project_id)||p?.agent.terminal_id!==a.terminal_id))
        throw new FlowError('role_busy','Unbind the role before replacing its pane.');
      if(role)this.assertFree(undefined,r,a.pane_id);
      const project=this.projects.pane(r,a,inv.ctx.cwd,str(o,'project'),p,true);
      if(existing&&existing.project_id!==project.project_id)
        throw new FlowError('role_busy','Unbind the role before reassigning its project.');
      const entry:ManagedPane={route:r,agent:a,launch:l,alias:name,controller:p?.controller,adopted:true,native_perm:'unknown',
        adopted_sent:p?.adopted_sent,project_id:str(o,'project')===undefined?p?.project_id:project.project_id,pre_role_alias:p?.pre_role_alias};
      const owner=clearOwner?undefined:newOwner??p?.controller;
      this.transfer(entry,owner,undefined,false,clearOwner);
      if(str(o,'project')!==undefined)this.projects.assign(r,a,project);
      if(role??existing)this.attach({...entry,controller:owner},(role??existing)!);
      return {...paneView({...entry,controller:owner}),alias:role?.role??existing?.role??name,project_id:project.project_id,role:role?.role??existing?.role,hint:'Use chflow switch '+name+' --perm '+l.perm+' --restart to install native permission settings.'};
    });
  }
  claim(old:ManagedPane|undefined,a:Agent,r:Route,c:Recipient|undefined,launching:ManagedPane['launch']):ManagedPane{
    if(old){const p={...old,agent:a,controller:c??old.controller};this.db.savePane(p);return p;}
    const p:ManagedPane={agent:a,route:r,launch:launching,alias:a.name??a.pane_id,controller:c,adopted:false,native_perm:'unknown'};
    this.db.savePane(p);return p;
  }
  private transfer(p:ManagedPane|undefined,newOwner:Recipient|undefined,task?:Task,notify=false,clear=false){
    const previous=p?.controller??task?.controller;
    const tasks=p?this.db.tasks().filter(t=>t.pane===p.agent.pane_id&&same(t.route,p.route)):task?[task]:[];
    const pending=tasks.flatMap(t=>this.db.events(false,t.task)).filter(e=>e.type!=='handed_off');
    const changed=newOwner?tasks.some(t=>!t.controller||!sameRecipient(t.controller,newOwner)):clear&&!!previous;
    if(newOwner&&changed&&pending.some(e=>e.state==='delivering')) throw new FlowError('delivery_in_flight','A delivery is in flight; retry handoff after it settles.');
    this.db.transaction(()=>{
      if(p){
        this.db.savePane({...p,controller:newOwner});
        const bound=this.binding(p);
        if(bound)this.db.saveRole({...bound,controller:newOwner});
      }
      if(!newOwner&&!clear) return;
      for(const t of tasks){
        if(!terminal(t.state)||pending.some(e=>e.task===t.task&&e.attempt===t.attempt))
          this.db.save({...t,controller:newOwner,caller:newOwner,return_route:newOwner});
      }
      if(newOwner)for(const e of pending){
        if(e.state==='delivering'||sameRecipient(e.recipient,newOwner)) continue;
        this.db.delivery({...e,recipient:newOwner,state:'queued',nextAt:undefined,failures:0});
      }
      if(changed||notify) this.db.audit(task?.task??null,'controller_transferred');
      if(notify&&previous&&newOwner&&!sameRecipient(previous,newOwner)) {
        const t=task??tasks[0];
        // A handoff can also concern an empty managed pane.
        this.db.delivery({event_id:randomUUID(),task:t?.task??'handoff',attempt:t?.attempt??'',turn:t?.turn??0,
          recipient:previous,worker:p?.alias??t?.name??'chflow',perm:p?.launch.perm??t?.launch.perm??'ask',type:'handed_off',
          status:'status=handed_off | to='+newOwner.label.replace(/[\r\n\x00-\x1f]/g,' ')+'('+newOwner.pane+')',created:Date.now(),state:'queued',failures:0});
      }
    });
  }
  async handoff(inv:Invocation){
    const o=inv.opts, id=safeTarget(inv.target),task=this.db.task(id),r=task?.route??route(inv);
    const to=safeTarget(str(o,'to')),toMachine=str(o,'to_machine'),toSession=str(o,'to_session');
    const dest=route({ctx:inv.ctx,opts:{machine:toMachine,session:toSession}});
    const c=await this.caller(inv.ctx);
    const target=task?.pane??(!task?(await this.target(r,id)).agent.pane_id:undefined);
    return this.lock(r,target??'task:'+id,async()=>{
      const p=target?this.db.pane(r,target):undefined;
      if(!p&&!task) throw new FlowError('not_managed','Adopt the target before transferring control.');
      await this.owns(p?.controller??task?.controller,c,false,inv.ctx.operator);
      const newOwner=await this.recipient(dest,to);
      if(target&&same(dest,r)&&target===newOwner.pane) return invalid('The Worker cannot control its own pane.');
      const fresh=task?this.db.task(task.task):undefined;
      this.transfer(p,newOwner,fresh,!!o.notify_old);
      return {pane_id:target,task:task?.task,controller:newOwner,transferred:true};
    });
  }
  async switch(inv:Invocation){
    const r=route(inv),o=inv.opts,target=safeTarget(inv.target);
    const initial=await this.target(r,target);
    const pane=initial.agent.pane_id;
    return this.lock(r,pane,async()=>{
      const {agent:a,p}=await this.target(r,pane), k=kindOf(a.agent), c=await this.caller(inv.ctx);
      await this.owns(p?.controller,c,false,inv.ctx.operator);this.assertFree(undefined,r,pane);
      if(!idle(a)) throw new FlowError('pane_not_ready','Wait for the agent to settle before switching.',a.agent_status==='blocked'?2:1);
      const l=launch(k,o,p?.launch);
      compliance(l,r,o,inv.ctx,false,channels(str(o,'matrix')));
      const changePerm=(o.perm!==undefined||o.readonly)&&l.perm!==p?.native_perm;
      if(!o.restart && (k!=='claude'||changePerm||o.provider))
        return {pane_id:pane,suggested_restart:true,perm:l.perm};
      let updated=a;
      if(o.restart){
        const n=native(l,inv.extra),rs=resumeArgs(l,a.agent_session??undefined,!!o.allow_last);
        const timeout=seconds(o.timeout,30,4,300);
        await prompt(r,pane,'/exit');
        const end=Date.now()+timeout*1000;
        while(true){
          const raw=(await herdr(r,['pane','get',pane])).pane;
          if(!raw||raw.terminal_id!==a.terminal_id) throw new FlowError('identity_changed','Pane identity changed while restarting.');
          if(!raw.agent) break;
          if(Date.now()>=end) throw new FlowError('restart_timeout','Agent did not return to its shell prompt.');
          await sleep(150);
        }
        updated=await startIn(r,pane,a.name??k+'-'+randomUUID().slice(0,6),k,[...rs,...n],timeout);
      }else{
        if(o.model) await prompt(r,pane,'/model '+l.model);
        if(o.effort) await prompt(r,pane,'/effort '+(l.effort==='xhigh'?'max':['off','minimal'].includes(l.effort??'')?'low':l.effort));
      }
      const controller=inv.ctx.operator===true?p?.controller??c:c??p?.controller;
      const entry:ManagedPane={route:r,agent:updated,launch:l,alias:p?.alias??a.name??pane,controller,adopted:p?.adopted??false,
        adopted_sent:p?.adopted_sent,native_perm:o.restart?l.perm:p?.native_perm??'unknown',project_id:p?.project_id,pre_role_alias:p?.pre_role_alias};
      const binding=p&&this.binding(p);
      if(binding)this.attach(entry,binding);
      else this.db.savePane(entry);
      return {...paneView(entry),role:binding?.role,restarted:!!o.restart};
    });
  }
  binding(p:ManagedPane){
    return this.db.roles().find(role=>samePane(role,p.route,p.agent.pane_id,p.agent.terminal_id));
  }

  attach(p:ManagedPane,role:Role){
    const other=this.binding(p);
    if(other&&(other.project_id!==role.project_id||other.role!==role.role))
      throw new FlowError('role_busy','The pane is already bound to another role.');
    const next:Role={...role,binding_mode:'pane',pane_id:p.agent.pane_id,terminal_id:p.agent.terminal_id,
      route:p.route,launch:p.launch,controller:p.controller,launch_cwd:undefined};
    this.db.transaction(()=>{
      if(!other)this.restoreAlias(this.boundPane(role));
      this.db.savePane({...p,alias:role.role,project_id:role.project_id,pre_role_alias:p.pre_role_alias??p.alias});
      this.projects.assign(p.route,p.agent,{project_id:role.project_id});
      this.db.saveRole(next);
    });
    return next;
  }

  boundPane(role:Role){
    const p=role.route&&role.pane_id?this.db.pane(role.route,role.pane_id):undefined;
    return p?.agent.terminal_id===role.terminal_id?p:undefined;
  }

  private restoreAlias(p:ManagedPane|undefined){
    if(p?.pre_role_alias===undefined)return;
    this.db.savePane({...p,alias:p.pre_role_alias,pre_role_alias:undefined});
  }

  detach(role:Role,remove=false){
    this.restoreAlias(this.boundPane(role));
    if(remove){this.db.removeRole(role);return;}
    return this.projects.unbind(role);
  }

  async bindExisting(inv:Invocation,role:Role){
    const r=route(inv);
    const {agent}=await this.target(r,safeTarget(str(inv.opts,'pane')),role.project_id);
    return this.lock(r,agent.pane_id,async()=>{
      const {agent:a,p}=await this.target(r,agent.pane_id);
      await this.assertOnline(r,a);
      this.assertFree(undefined,r,a.pane_id);
      const c=await this.caller(inv.ctx);
      await this.owns(p?.controller,c,false,inv.ctx.operator);
      const controller=await this.controller(inv,c)??p?.controller;
      if(controller?.pane===a.pane_id&&same(r,controller.route))return invalid('The Worker cannot control its own pane.');
      if(inv.opts.kind!==undefined&&inv.opts.kind!==a.agent)return invalid('The selected pane runs a different Harness.');
      const l=launch(kindOf(a.agent),inv.opts,p?.launch);
      compliance(l,r,inv.opts,inv.ctx,false,channels(str(inv.opts,'matrix')));
      const entry:ManagedPane=p?{...p,agent:a,launch:l,controller}:
        {agent:a,route:r,launch:l,alias:a.name??a.pane_id,controller,adopted:true,native_perm:'unknown'};
      return this.attach(entry,role);
    });
  }

  async closeOld(role:Role,replacement:Role,ctx:Context,caller:Recipient|undefined){
    if(!role.route||!role.pane_id||!role.terminal_id||role.binding_mode!=='pane'||
      samePane(replacement,role.route,role.pane_id,role.terminal_id))return;
    const r=role.route,pane=role.pane_id;
    await this.lock(r,pane,async()=>{
      this.assertFree(undefined,r,pane);
      const p=this.db.pane(r,pane);
      if(!p||p.agent.terminal_id!==role.terminal_id||this.binding(p))return;
      await this.owns(p.controller,caller,false,ctx.operator);
      let a:Agent;
      try{a=await get(r,pane);}catch(e){if(e instanceof FlowError&&missing.test(e.code))return;throw e;}
      if(!matches({terminal:p.agent.terminal_id,session:p.agent.agent_session??undefined,launch:p.launch},a))return;
      if(!idle(a))throw new FlowError('pane_not_ready','The role was rebound. The old pane is still busy.');
      await closePane(r,pane);
      this.db.removePane(p);
    });
  }

  async assignProject(inv:Invocation,project:Project){
    const r=route(inv);
    const {agent}=await this.target(r,safeTarget(inv.target));
    return this.lock(r,agent.pane_id,async()=>{
      const {agent:a,p}=await this.target(r,agent.pane_id);
      await this.assertOnline(r,a);
      const bound=p&&this.binding(p);
      this.db.transaction(()=>{
        if(bound&&bound.project_id!==project.project_id){
          if(roleActive(bound,this.db.tasks()))throw new FlowError('role_busy','Wait for the role task before reassigning its pane.');
          this.detach(bound);
        }
        this.projects.assign(r,a,project);
        const current=p&&this.db.pane(r,a.pane_id);
        if(current)this.db.savePane({...current,project_id:project.project_id});
      });
      return {pane_id:a.pane_id,terminal_id:a.terminal_id,project_id:project.project_id};
    });
  }

  private async assertOnline(r:Route,a:Agent){
    const live=await this.liveTopology(r);
    if(live.herdr!=='reachable')throw new FlowError(live.herdr,'Cannot verify the pane in the Herdr agent list.');
    if(!live.agents.some(row=>row.pane_id===a.pane_id&&row.terminal_id===a.terminal_id))
      throw new FlowError('pane_not_found','Pane identity is absent from the Herdr agent list.');
  }

  async liveTopology(r:Route):Promise<LiveTopology>{
    const checkedPanes=new Set(this.db.panes().filter(p=>same(p.route,r)).map(p=>paneIdentity(p.agent.pane_id,p.agent.terminal_id)));
    const checkedRoles=new Set(this.db.roles().filter(role=>role.route&&same(role.route,r)).map(bindingIdentity));
    try{
      const entries:unknown=(await herdr(r,['agent','list'])).agents;
      if(!Array.isArray(entries))throw new FlowError('invalid_response','Herdr returned no agent list.');
      // Reject an incomplete sample before it can erase registered identities.
      // Exclude exited/stopped agent processes even when their Herdr pane remains open.
      const agents=entries.map(a=>liveView(checkedAgent(a))).filter(a=>isLiveStatus(a.agent_status));
      return {agents,herdr:'reachable',checkedPanes,checkedRoles};
    }catch(e){return {agents:[],herdr:e instanceof FlowError?e.code:'unreachable'};}
  }

  sync(r:Route,{agents,herdr,checkedPanes,checkedRoles}:LiveTopology,project?:string){
    if(herdr!=='reachable')return 0;
    const online=new Map(agents.map(a=>[a.pane_id,a.terminal_id]));
    const tasks=this.db.tasks().filter(t=>!terminal(t.state));
    let pruned=0;
    this.db.transaction(()=>{
      for(const role of this.db.roles()){
        if(role.binding_mode==='pane'&&role.route&&same(role.route,r)&&role.pane_id&&
           checkedRoles?.has(bindingIdentity(role))&&online.get(role.pane_id)!==role.terminal_id&&
           !this.locks.has(paneKey(r,role.pane_id))&&(!project||role.project_id===project)&&!roleActive(role,tasks)){
          this.detach(role);
          this.db.audit(null,'role_offline',role.project_id+'/'+role.role);
        }
      }
      for(const p of this.db.panes()){
        const {pane_id:id,terminal_id:terminalId}=p.agent;
        if(!same(p.route,r)||!checkedPanes?.has(paneIdentity(id,terminalId))||online.get(id)===terminalId||
           this.locks.has(paneKey(r,id))||this.binding(p)||tasks.some(t=>t.pane===id&&same(t.route,r))||
           project&&this.projects.pane(r,p.agent,paneCwd(p.agent)??'.',undefined,p).project_id!==project)continue;
        this.db.removePane(p);
        this.db.audit(null,'pane_pruned',id);
        pruned++;
      }
    });
    return pruned;
  }

  topologyView(r:Route,{agents,herdr}:LiveTopology,cwd:string){
    const online=new Map(agents.map(a=>[a.pane_id,a]));
    const managed_panes=this.db.panes().filter(p=>same(p.route,r)).map(p=>{
      const a=online.get(p.agent.pane_id);
      const live=a!==undefined&&a.terminal_id===p.agent.terminal_id;
      if(live)online.delete(a.pane_id);
      const current=live?a:p.agent;
      return {...paneView(p),cwd:(live?a.cwd:undefined)??paneCwd(p.agent),live,agent_status:live?a.agent_status:'offline',
        state_change_seq:current.state_change_seq,workspace_id:current.workspace_id??null,tab_id:current.tab_id??null,
        project_id:this.projects.pane(r,live?a:p.agent,cwd,undefined,p).project_id,role:this.binding(p)?.role};
    });
    const unmanaged_live_agents=[...online.values()].map(a=>({...a,project_id:this.projects.pane(r,a,cwd).project_id}));
    return {managed_panes,unmanaged_live_agents,herdr};
  }
}
