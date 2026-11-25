import { spawn } from 'node:child_process';
import { connect, type Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { type Context, type Reply, type Route, FlowError, PROTOCOL, VERSION, invalid, json } from './types.js';
import { clean } from './sensitive.js';
export const stateDir=()=>resolve(process.env.CHFLOW_STATE_DIR||join(homedir(),'.local','state','chflow'));
export const configDir=()=>resolve(process.env.CHFLOW_CONFIG_DIR||(process.env.XDG_CONFIG_HOME?join(process.env.XDG_CONFIG_HOME,'chflow'):join(homedir(),'.config','chflow')));
export const socketPath=(root:string)=>join(root,'daemon.sock');
export const cliPath=()=>process.argv[1];
export const MAX_LINE=4*1024*1024;
export interface UiInfo {
  url:string; access_url?:string; host:string; port:number; auth_required:boolean;
}
export interface DaemonInfo {
  pid:number; version:string; protocol:number; endpoint:string; started_at:string; key?:string;
  ui_url?:string; ui_host?:string; ui_port?:number; ui_auth_required?:boolean;
}
interface DaemonConfig {
  fallback_chain?:string[]|string; matrix?:string;
  ui_host?:string; ui_port?:number|string; ui_disable?:boolean; ui_allow_remote?:boolean;
  ui_token?:string; ui_trusted_hosts?:string|string[];
}
export function readConfig(root=stateDir()):DaemonConfig {
  let raw:string;
  try {raw=readFileSync(join(root,'config.json'),'utf8');}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {};throw e;}
  if(!raw)return {};
  const value=json(clean(raw));
  if(!value||Array.isArray(value)||typeof value!=='object')return invalid('Invalid daemon config.json.');
  return value;
}
export function info(root=stateDir()):DaemonInfo|undefined {
  try {return json(readFileSync(join(root,'daemon.json'),'utf8'));} catch {return undefined;}
}
export function context():Context {
  const env=process.env;
  const route:Route=env.HERDR_SOCKET_PATH?{socket:clean(env.HERDR_SOCKET_PATH)}:{session:clean(env.HERDR_SESSION||'default')};
  const caller=env.HERDR_ENV==='1'&&env.HERDR_PANE_ID?{pane:clean(env.HERDR_PANE_ID),route,label:clean(env.CHFLOW_CALLER_LABEL||env.HERDR_PANE_ID)}:undefined;
  return {cwd:clean(process.cwd()),route,caller,workspace:env.HERDR_WORKSPACE_ID,tty:!!process.stdin.isTTY&&!!process.stdout.isTTY};
}
export class Peer {
  private requests=new Map<string,(reply:Reply|Error)=>void>();
  private closed=false;
  private disconnect=new AbortController();
  private uiListener?: (seq:number)=>void;
  readonly disconnected=this.disconnect.signal;
  constructor(private sock:Socket,private key?:string) {
    const lines=createInterface({input:sock});
    lines.on('line',line=>{
      const item=line.length<=MAX_LINE?json(line):undefined;
      if(item?.id) this.requests.get(item.id)?.(item as Reply);
      else if(item?.event==='ui.change'&&Number.isSafeInteger(item.seq))this.uiListener?.(item.seq);
    });
    sock.on('error',()=>this.close());
    sock.once('close',()=>this.close());
  }
  onUiChange(listener?: (seq:number)=>void){this.uiListener=listener;}
  call(method:string,params:unknown={},timeout=45000,signal?:AbortSignal):Promise<Reply> {
    if(this.closed||signal?.aborted) return Promise.reject(new FlowError('ipc_closed','Daemon connection closed.'));
    const id=randomUUID();
    return new Promise((ok,no)=>{
      const finish=(v:Reply|Error)=>{
        this.requests.delete(id);clearTimeout(timer);signal?.removeEventListener('abort',abort);
        return v instanceof Error?no(v):ok(v);
      };
      const abort=()=>{
        this.sock.write(JSON.stringify({id:randomUUID(),method:'_abort',params:{id},key:this.key})+'\n');
        finish(new FlowError('ipc_cancelled','Request cancelled.'));
      };
      const timer=setTimeout(()=>{
        this.sock.write(JSON.stringify({id:randomUUID(),method:'_abort',params:{id},key:this.key})+'\n');
        finish(new FlowError('ipc_timeout','Timed out waiting for the daemon.',3));
      },timeout);
      signal?.addEventListener('abort',abort,{once:true});
      this.requests.set(id,finish);
      const wire=JSON.stringify({id,method,params,key:this.key})+'\n';
      if(Buffer.byteLength(wire)>MAX_LINE){finish(new FlowError('invalid_args','Request is too large.'));return;}
      this.sock.write(wire);
    });
  }
  close(){
    if(this.closed) return;
    this.closed=true;
    this.sock.destroy();
    for(const cb of this.requests.values()) cb(new FlowError('ipc_closed','Daemon connection closed.'));
    this.disconnect.abort();
  }
}
export async function dial(root=stateDir()):Promise<Peer|undefined> {
  const meta=process.platform==='win32'?info(root):undefined;
  if(process.platform==='win32'&&!meta?.key) return;
  return new Promise(ok=>{
    const sock=process.platform==='win32'?connect(Number(meta!.endpoint.split(':').at(-1)),'127.0.0.1'):connect(socketPath(root));
    const timer=setTimeout(()=>{sock.destroy();ok(undefined);},300);
    sock.once('error',()=>{clearTimeout(timer);ok(undefined);});
    sock.once('connect',()=>{clearTimeout(timer);ok(new Peer(sock,meta?.key));});
  });
}
export async function openPeer(start=true) {
  const root=stateDir();
  let started=false;
  let lastLaunch=0;
  const end=Date.now()+5000;
  do {
    const peer=await dial(root);
    if(peer){
      const ping=await peer.call('ping',{},500).catch(()=>undefined);
      const meta=ping?.data as DaemonInfo|undefined;
      if(ping?.ok&&meta?.protocol===PROTOCOL&&(meta.version===VERSION||!start)) return peer;
      if(start&&ping?.ok&&meta?.protocol===PROTOCOL&&meta.version!==VERSION)
        await peer.call('daemon.stop',{},400).catch(()=>{});
      peer.close();
    }
    if(!start) return;
    // Other clients may also spawn contenders; only the process holding the lock can bind.
    if(!started||Date.now()-lastLaunch>300){
      const child=spawn(process.execPath,[cliPath(),'daemon','_serve'],{detached:true,stdio:'ignore',windowsHide:true});
      child.on('error',()=>{});child.unref();
      started=true;lastLaunch=Date.now();
    }
    await sleep(40);
  }while(Date.now()<end);
  throw new FlowError('daemon_unavailable','Daemon did not become ready within 5 seconds.');
}
export function requestTimeout(method:string,opts:Record<string,unknown>={}){
  const s=Number(opts.timeout??(method==='run'?300:method==='wait'?180:30));
  return ['start','switch','wait','run','send','role.bind','ui.role.bind'].includes(method)&&Number.isFinite(s)&&s>0?Math.max(45000,(s+30)*1000):45000;
}
