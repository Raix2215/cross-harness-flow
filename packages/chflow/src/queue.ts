import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { atomic } from './mailbox.js';
import { get, idle, prompt, controlDelays, transient, missing, hasDraft, inputPosition, notifyTyping } from './herdr.js';
import { batchEntry, note, wake } from './protocol.js';
import { FlowError, invalid, pendingDeliveryStates, routeKey, terminal, type Agent, type Delivery, type EventType, type ProgressProbe, type Recipient, type Route, type Task } from './types.js';
import type { Store } from './store.js';

const priority:Record<EventType,number>={result:5,interrupted:4,settled_no_reply:4,quota_exhausted:4,pane_gone:4,blocked:3,stalled:2,progress:1,fallback_switched:1,scheduled_retry:1,handed_off:1};
const resumeAlerts=new Set<EventType>(['interrupted','settled_no_reply','stalled']);
const keyOf=(route:Route,pane:string)=>routeKey(route)+':'+pane;
const recipientKey=(r:Recipient)=>keyOf(r.route,r.pane);
const pending=(e:Delivery|undefined):e is Delivery=>!!e&&pendingDeliveryStates.includes(e.state);
const matchesRecipient=(e:Delivery,a:Agent)=> (!e.recipient.terminal||e.recipient.terminal===a.terminal_id)&&(!e.recipient.kind||e.recipient.kind===a.agent)&&sessionsEqual(e.recipient.session,a.agent_session);
export const sessionsEqual=(a?:{kind:string;value:string}|null,b?:{kind:string;value:string}|null) => !a || (!!b&&a.kind===b.kind&&a.value===b.value);
export class DeliveryQueue {
  private doors=new Map<string,Promise<unknown>>();
  private safeAfter=new Map<string,number>();
  private readySince=new Map<string,number>();
  private input=new Map<string,{revision:number; since:number}>();
  constructor(private db:Store,private root:string,private debounce:number,private quiet:number,
    private revalidateResume:(e:Delivery)=>Promise<boolean>) {}
  private async enter<T>(key:string,fn:()=>Promise<T>){
    while(this.doors.has(key)) await this.doors.get(key)!.catch(()=>{});
    const result=Promise.resolve().then(fn);
    this.doors.set(key,result);
    try{return await result;}finally{this.doors.delete(key);}
  }
  inbox(route:Route,pane:string){
    const key=keyOf(route,pane);
    return this.db.events().filter(e=>recipientKey(e.recipient)===key);
  }
  pause(route:Route,pane:string){
    this.db.transaction(()=>{
      this.db.setPaused(route,pane,true);
      this.pauseWaiting(route,pane);
      this.db.audit(null,'queue_pause',pane);
    });
    return {pane,paused:true};
  }
  resume(route:Route,pane?:string){
    const panes=pane?[pane]:this.db.pausedPanes(route);
    this.db.transaction(()=>{
      for(const p of panes){
        this.db.setPaused(route,p,false);
        for(const e of this.inbox(route,p))if(e.state==='paused_by_operator')this.state(e,'queued');
      }
      this.db.audit(null,'queue_resume',pane);
    });
    return {pane,paused:false,resumed:panes.length};
  }
  private pauseWaiting(route:Route,pane:string){
    const key=keyOf(route,pane);
    this.readySince.delete(key);
    this.input.delete(key);
    for(const e of this.inbox(route,pane))
      if(e.state==='queued'||e.state==='deferred_user_typing')this.state(e,'paused_by_operator');
  }
  private paused(r:Recipient){
    return this.db.isPaused(r.route,r.pane);
  }
  async deliverNow(route:Route,pane?:string,eventId?:string){
    const event=eventId===undefined?undefined:this.db.event(eventId);
    if(eventId!==undefined&&!pending(event))return {delivered:0};
    const selected=event?[event]:this.db.events().filter(e=>pending(e)&&routeKey(e.recipient.route)===routeKey(route)&&(!pane||e.recipient.pane===pane));
    const groups=this.groups(selected);
    const results=await Promise.allSettled([...groups].map(([key,group])=>this.enter(key,async()=>{
      const events=group.map(e=>this.current(e)).filter((e):e is Delivery=>!!e);
      return events.length?this.push(events,true):0;
    })));
    let delivered=0,failure:unknown;
    for(const result of results){
      if(result.status==='fulfilled')delivered+=result.value;
      else failure??=result.reason;
    }
    if(failure instanceof FlowError)throw new FlowError(failure.code,failure.message,failure.exit,{delivered});
    if(failure)throw failure;
    return {delivered};
  }
  editEvent(method:'queue_consume'|'queue_drop'|'queue_reroute',id:string,to?:Recipient){
    const original=this.db.event(id);
    if(!pending(original))return invalid('Choose a pending delivery event.');
    return this.enter(recipientKey(original.recipient),async()=>{
      const e=this.current(original);
      if(!e)return invalid('The delivery is no longer pending at this recipient.');
      this.db.transaction(()=>{
        if(to)this.db.delivery({...e,recipient:to,state:'queued',failures:0,nextAt:undefined,batch:undefined});
        else this.state(e,method==='queue_consume'?'delivered':'superseded_by_operator');
        this.db.audit(e.task,method,e.event_id);
      });
      return {ok:true,to:to?.pane};
    });
  }
  flush(route:Route,pane:string){
    return this.enter(keyOf(route,pane),async()=>{
      const pending=this.inbox(route,pane).filter(e=>e.state!=='delivering');
      if(!pending.length)return {pane,consumed:0,summary:'chflow: inbox empty'};
      const agent=await get(route,pane);
      const snapshot=pending.filter(e=>matchesRecipient(e,agent));
      const accepted=await Promise.all(snapshot.map(e=>this.accept(e)));
      const events=snapshot.filter((e,i)=>accepted[i]&&this.current(e));
      this.db.transaction(()=>{for(const e of events)this.state(e,'delivered');});
      const summary=events.length?`[chflow:batch] count=${events.length} to=${pane}\n`+events.map(e=>e.type==='handed_off'?e.status:batchEntry(e)).join('\n'):'chflow: no verified receipts';
      return {pane,consumed:events.length,summary};
    });
  }
  recover(){
    for(const e of this.db.events()) if(e.state==='delivering') this.state(e,'pending_unreachable',Number.MAX_SAFE_INTEGER);
  }
  enqueue(t:Task,type:EventType,status:string,detail?:string,paths:{out?:string;diag?:string;seq?:number;probe?:ProgressProbe}={}){
    if(!t.caller) return;
    const candidates=this.db.events(false,t.task).filter(e=>e.state!=='delivering'&&e.type!=='handed_off');
    if(candidates.some(e=>e.attempt===t.attempt&&priority[e.type]>priority[type])) return;
    for(const e of candidates) this.state(e,e.attempt===t.attempt?'superseded_by_update':'superseded_by_new_attempt');
    this.db.delivery({event_id:randomUUID(),task:t.task,attempt:t.attempt,turn:t.turn,recipient:t.caller,worker:`${t.name}(${t.pane??'headless'})`,perm:t.launch.perm,type,status,note:note(detail),...paths,created:Date.now(),state:this.paused(t.caller)?'paused_by_operator':'queued',failures:0});
  }
  discard(t:Task,reason:string,keepResult=false){
    for(const e of this.db.events(false,t.task)) if(e.state!=='delivering' && (!keepResult||e.type!=='result')) this.state(e,reason);
  }
  unblock(t:Task){
    for(const e of this.db.events(false,t.task)) if(e.type==='blocked'&&e.attempt===t.attempt&&e.state!=='delivering')
      this.state(e,'superseded_by_human_unblock');
  }
  supersedeResume(t:Task){
    for(const e of this.db.events(false,t.task)) if(e.attempt===t.attempt&&e.state!=='delivering'&&(resumeAlerts.has(e.type)||e.type==='scheduled_retry'))
      this.state(e,'superseded_by_human_resume');
  }
  private state(e:Delivery,state:string,nextAt?:number) {
    this.db.delivery({...e,state,nextAt});
  }
  private current(e:Delivery){
    const entry=this.db.event(e.event_id);
    return pending(entry)&&recipientKey(entry.recipient)===recipientKey(e.recipient)?entry:undefined;
  }
  private async accept(e:Delivery) {
    if(!this.current(e)) return false;
    if(e.type==='handed_off') return true;
    const t=this.db.task(e.task);
    if(!t||t.attempt!==e.attempt){this.state(e,'superseded_by_new_attempt');return false;}
    if(e.type!=='result' && terminal(t.state)){this.state(e,'superseded_by_terminal');return false;}
    if(resumeAlerts.has(e.type)&&e.probe&&t.mode==='interactive')return this.revalidateResume(e);
    if(e.type!=='blocked'||e.seq===undefined||t.mode==='headless') return true;
    if(!t.pane) return false;
    try {
      const a=await get(t.route,t.pane);
      if(!this.current(e)) return false;
      if(a.terminal_id!==t.terminal || a.agent!==t.launch.kind || !sessionsEqual(t.session,a.agent_session)) {
        this.state(e,'superseded_by_identity_change'); return false;
      }
      if(a.agent_status!=='blocked'||a.state_change_seq!==e.seq) {
        this.state(e,a.agent_status!=='blocked'?'superseded_by_human_unblock':'superseded_by_new_state');return false;
      }
      return true;
    } catch(error) {
      if(this.current(e)&&error instanceof FlowError&&missing.test(error.code)) this.state(e,'superseded_by_identity_change');
      return false;
    }
  }
  private groups(events:Delivery[]){
    const groups=new Map<string,Delivery[]>();
    for(const e of events){
      const key=recipientKey(e.recipient);
      const group=groups.get(key);
      if(group) group.push(e); else groups.set(key,[e]);
    }
    return groups;
  }
  async tick(){
    const now=Date.now();
    const groups=this.groups(this.db.events().filter(e=>pending(e)&&e.state!=='paused_by_operator'&&(e.nextAt??0)<=now));
    for(const key of this.readySince.keys()) if(!groups.has(key)) this.readySince.delete(key);
    for(const key of this.input.keys()) if(!groups.has(key)) this.input.delete(key);
    for(const key of this.safeAfter.keys()) if(!groups.has(key)&&this.safeAfter.get(key)!<Date.now()) this.safeAfter.delete(key);
    await Promise.all([...groups].map(([key,es])=>this.deliver(key,es)));
  }
  private async typingGate(key:string,agent:Agent,events:Delivery[]){
    const {route,pane}=events[0].recipient;
    const at=await inputPosition(route,pane,agent.terminal_id);
    if(this.db.isPaused(route,pane))return false;
    if(!at.ready){this.input.delete(key);return false;}
    if(!at.focused){this.input.delete(key);return true;}
    const now=Date.now(),before=this.input.get(key);
    const defer=async()=>{
      const candidates=events.filter(e=>this.current(e));
      const alreadyNotified=candidates.some(e=>this.db.event(e.event_id)?.state==='deferred_user_typing');
      for(const e of candidates)this.state(e,'deferred_user_typing');
      if(candidates.length&&!alreadyNotified)await notifyTyping(route,candidates.length).catch(()=>{});
    };
    if(!before||before.revision!==at.revision){
      this.input.set(key,{revision:at.revision,since:now});
      if(before)await defer();
      return false;
    }
    if(now-before.since<this.quiet)return false;
    const draft=await hasDraft(route,pane);
    const after=await inputPosition(route,pane,agent.terminal_id);
    if(this.db.isPaused(route,pane))return false;
    if(!after.ready){this.input.delete(key);return false;}
    if(!after.focused){this.input.delete(key);return true;}
    if(draft||after.revision!==at.revision){
      this.input.set(key,{revision:after.revision,since:Date.now()});
      await defer();return false;
    }
    return true;
  }
  private async deliver(key:string,snapshot:Delivery[]){
    if(this.doors.has(key))return;
    return this.enter(key,async()=>{
      const recipient=snapshot[0].recipient;
      if(this.paused(recipient)){this.pauseWaiting(recipient.route,recipient.pane);return;}
      const live=(await Promise.all(snapshot.map(e=>this.accept(e)))).filter(Boolean);
      const candidates=snapshot.filter((_,i)=>live[i]);
      if(!candidates.length){this.readySince.delete(key);return;}
      const {recipient:r}=candidates[0];
      const a=await get(r.route,r.pane).catch((err:unknown)=>{
        if(this.paused(r))return undefined;
        for(const e of candidates.filter(e=>this.current(e))) this.retry(e,err,false);
        return undefined;
      });
      if(!a||!idle(a)){this.readySince.delete(key);return;}
      const since=this.readySince.get(key)??Date.now();
      this.readySince.set(key,since);
      if(Date.now()<Math.max(since+this.debounce,this.safeAfter.get(key)??0)) return;
      const checked=await Promise.all(candidates.map(e=>this.accept(e)));
      const rc=await get(r.route,r.pane).catch(()=>undefined);
      if(!rc||!idle(rc)||rc.state_change_seq!==a.state_change_seq||this.paused(r)) {this.readySince.delete(key);return;}
      const valid=candidates.filter((e,i)=>checked[i]&&this.current(e));
      let events=valid.filter(e=>matchesRecipient(e,rc));
      for(const e of valid) if(!events.includes(e)) this.state(e,'pending_unreachable',Number.MAX_SAFE_INTEGER);
      if(!events.length) return;
      const safe=await this.typingGate(key,rc,events).catch(()=>false);
      if(!safe||this.paused(r))return;
      events=events.map(e=>this.current(e)).filter((e):e is Delivery=>!!e);
      if(!events.length)return;
      if(events[0].type==='handed_off') events=events.slice(0,1);
      else events=events.filter(e=>e.type!=='handed_off');
      await this.push(events);
    });
  }
  private async push(events:Delivery[],operator=false){
    const r=events[0].recipient,key=recipientKey(r),batch=randomUUID();
    let index:string|undefined;
    if(events.length>3){
      const dir=join(this.root,'mail','batches');mkdirSync(dir,{mode:0o700,recursive:true});
      index=join(dir,batch+'.md'); atomic(index,events.map(batchEntry).join('\n')+'\n');
    }
    const text=events.length===1&&events[0].type==='handed_off'?events[0].status:wake(events,index);
    this.db.transaction(()=>{for(const e of events){e.batch=batch;this.state(e,'delivering');}});
    this.readySince.delete(key);
    try{
      await prompt(r.route,r.pane,text);
      this.db.transaction(()=>{
        for(const e of events){
          this.state(e,'delivered');
          if(operator)this.db.audit(e.task,'operator_deliver_now',e.event_id);
        }
      });
      this.safeAfter.set(key,Date.now()+this.debounce);
      return events.length;
    }catch(error){
      for(const e of events)this.retry(e,error,true);
      if(operator)throw error;
      return 0;
    }
  }
  private retry(e:Delivery,error:unknown,sending:boolean){
    const code=error instanceof FlowError?error.code:'unknown_error';
    const safe=!sending||missing.test(code)||/^(?:connect_refused|connection_refused|machine_connection_failed|ssh_connect_failed|agent_blocked|server_not_running|cli_missing)$/.test(code);
    const steps=controlDelays();
    this.state({...e,failures:e.failures+1},'pending_unreachable',safe
      ? Date.now()+(transient.test(code)||e.failures>=steps.length
        ? Math.max(5000,steps.at(-1)??0)
        : steps[Math.min(e.failures,steps.length-1)])
      : Number.MAX_SAFE_INTEGER);
  }
}
