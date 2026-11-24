import { randomBytes } from 'node:crypto';
import { chmodSync, closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Engine } from './engine.js';
import { route } from './herdr.js';
import { context, MAX_LINE, socketPath, stateDir, type DaemonInfo } from './ipc.js';
import { atomic } from './mailbox.js';
import { clean } from './sensitive.js';
import { Store } from './store.js';
import { alive, failure, FlowError, json, PROTOCOL, seconds, success, VERSION, type Invocation, type Reply } from './types.js';
import { startUiServer, uiSettings } from './ui.js';

const win=process.platform==='win32';
function unlink(path:string){try{unlinkSync(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
function acquire(path:string){
  for(let i=0;i<2;i++){
    try{
      const fd=openSync(path,'wx',0o600);
      try{writeFileSync(fd,String(process.pid)+'\n');}finally{closeSync(fd);}
      return true;
    }catch(e){
      if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
      try{
        const before=statSync(path),owner=Number(readFileSync(path,'utf8'));
        if(alive(owner)||(!owner&&Date.now()-before.mtimeMs<2000))return false;
        const after=statSync(path);
        if(before.ino!==after.ino||before.mtimeMs!==after.mtimeMs)return false;
        unlinkSync(path);
      }catch(err){if((err as NodeJS.ErrnoException).code!=='ENOENT')throw err;}
    }
  }
  return false;
}
export async function serve(){
  const root=stateDir(),lock=join(root,'daemon.lock'),path=join(root,'daemon.json'),sockPath=socketPath(root);
  mkdirSync(root,{recursive:true,mode:0o700});
  if(!win)chmodSync(root,0o700);
  if(!acquire(lock))return;
  let db:Store|undefined,engine:Engine|undefined;
  let ui:Awaited<ReturnType<typeof startUiServer>>|undefined;
  let uiError=failure(new FlowError('ui_disabled','The embedded Web UI is disabled.'));
  let closing=false,last=Date.now(),keep=0,seq=0;
  let loop:NodeJS.Timeout|undefined,notify:NodeJS.Timeout|undefined;
  const sockets=new Set<Socket>();
  const subscribers=new Set<Socket>();
  const uiListeners=new Set<()=>void>();
  const jobs=new Set<Promise<unknown>>();
  const idle=seconds(process.env.CHFLOW_IDLE_TIMEOUT_SEC,1800,0)*1000;
  const poll=seconds(process.env.CHFLOW_POLL_MS,250,20,60000);
  const meta:DaemonInfo={pid:process.pid,version:VERSION,protocol:PROTOCOL,endpoint:sockPath,started_at:new Date().toISOString(),key:win?randomBytes(32).toString('hex'):undefined};
  const publicMeta=()=>{
    const {key,...published}=meta;
    return {...published,running:true};
  };
  const changed=(count=1)=>{
    seq+=count;
    if(closing||notify||(!subscribers.size&&!uiListeners.size))return;
    notify=setTimeout(()=>{
      notify=undefined;
      const frame=JSON.stringify({event:'ui.change',seq})+'\n';
      for(const socket of subscribers){
        if(socket.writableLength>MAX_LINE)socket.destroy();
        else if(socket.writable)socket.write(frame);
      }
      for(const listener of uiListeners)listener();
    },120);
  };
  const invoke=(method:string,inv:Invocation,signal:AbortSignal)=>{
    const work=Promise.resolve().then(async()=>{
      if(closing||signal.aborted)throw new FlowError('ipc_cancelled','Request cancelled.');
      clean(JSON.stringify(inv));
      if(method==='ui.snapshot'){
        const data=await engine!.uiSnapshot(inv,()=>seq);
        return success({...data,daemon:publicMeta()});
      }
      const reply=await engine!.invoke(method,inv,signal);
      if(method==='health'&&reply.ok)
        return success({...reply.data as object,daemon:publicMeta()});
      return reply;
    }).catch(e=>{
      if(!(e instanceof FlowError))db!.audit(null,'internal_error',e instanceof Error?e.name:'unknown');
      return failure(e);
    }).finally(()=>jobs.delete(work));
    jobs.add(work);
    return work;
  };
  const server=createServer(socket=>{
    if(closing){socket.destroy();return;}
    sockets.add(socket);
    let mcp=false;
    let releaseUi:(()=>void)|undefined;
    const pending=new Map<string,AbortController>();
    const lines=createInterface({input:socket});
    const send=(id:string,result:Reply)=>{
      if(!socket.destroyed&&socket.writable){
        const data=JSON.stringify({...result,id})+'\n';
        socket.write(Buffer.byteLength(data)<=MAX_LINE?data:JSON.stringify({...failure(new FlowError('output_limit','Daemon response is too large.')),id})+'\n');
      }
    };
    socket.on('error',()=>socket.destroy());
    lines.on('error',()=>socket.destroy());
    socket.once('close',()=>{
      sockets.delete(socket);if(mcp)keep--;
      if(releaseUi){subscribers.delete(socket);releaseUi();last=Date.now();}
      for(const controller of pending.values())controller.abort();
    });
    lines.on('line',line=>{
      if(closing)return;
      if(Buffer.byteLength(line)>MAX_LINE){socket.destroy();return;}
      const msg=json(line);
      if(typeof msg?.id!=='string'||typeof msg.method!=='string'||(win&&msg.key!==meta.key)){socket.destroy();return;}
      const {id,method,params}=msg;
      last=Date.now();
      if(method==='_abort'){pending.get(params?.id)?.abort();return;}
      if(method==='ping'){send(id,success(publicMeta()));return;}
      if(method==='daemon.ui'){
        send(id,ui?success({...ui.info,daemon_pid:meta.pid,embedded:true}):uiError);return;
      }
      if(method==='mcp.attach'){if(!mcp){keep++;mcp=true;}send(id,success({attached:true}));return;}
      if(method==='daemon.logs'){send(id,success({audit:db!.logs()}));return;}
      if(method==='daemon.stop'){send(id,success({running:false,pid:process.pid}));setImmediate(()=>void stop());return;}
      if(!params?.ctx?.route||typeof params.ctx.cwd!=='string'||!params.opts||typeof params.opts!=='object'||pending.has(id)){
        send(id,failure(new FlowError('invalid_args','Invalid invocation.')));return;
      }
      const abort=new AbortController();pending.set(id,abort);
      const inv=params as Invocation;
      if(method==='ui.subscribe'){
        try{
          clean(JSON.stringify(inv));
          if(releaseUi)throw new FlowError('invalid_args','This connection is already subscribed.');
          releaseUi=engine!.watchUi(route(inv));
          subscribers.add(socket);
          send(id,success({pid:meta.pid,seq}));
        }catch(e){send(id,failure(e));}
        pending.delete(id);
        return;
      }
      void invoke(method,inv,abort.signal).then(r=>send(id,r)).finally(()=>pending.delete(id));
    });
  });
  const close=async()=>{
    if(loop)clearInterval(loop);
    if(notify)clearTimeout(notify);
    for(const sock of sockets)sock.destroy();
    await ui?.close();
    if(server.listening)await new Promise<void>(ok=>server.close(()=>ok()));
    await engine?.stop();
    await Promise.allSettled(jobs);
    db?.close();
    if(!win)unlink(sockPath);
    unlink(path);unlink(lock);
  };
  const stop=async()=>{
    if(closing)return;
    closing=true;
    try{await close();}catch{process.exitCode=1;}
  };
  try{
    if(!win)unlink(sockPath);
    db=new Store(root,changed);engine=new Engine(db,root,changed);engine.recover();
    try{
      const settings=uiSettings({},true);
      if(settings){
        const ctx={...context(),operator:true};
        ui=await startUiServer(settings,ctx,()=>({
          call:(method,inv,signal)=>invoke(method,inv,signal??new AbortController().signal),
          subscribe:listener=>{
            const unwatch=engine!.watchUi(ctx.route);
            uiListeners.add(listener);
            return ()=>{
              uiListeners.delete(listener);
              unwatch();
              last=Date.now();
            };
          },
        }));
        const {url,host,port,auth_required}=ui.info;
        Object.assign(meta,{ui_url:url,ui_host:host,ui_port:port,ui_auth_required:auth_required});
      }
    }catch(e){uiError=failure(e);}
    await new Promise<void>((ok,no)=>{
      server.once('error',no);
      const ready=()=>{server.off('error',no);ok();};
      if(win)server.listen(0,'127.0.0.1',ready);else server.listen(sockPath,ready);
    });
    const address=server.address();
    if(win&&address&&typeof address!=='string')meta.endpoint='127.0.0.1:'+address.port;
    if(!win)chmodSync(sockPath,0o600);
    atomic(path,JSON.stringify(meta)+'\n');
    process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
    loop=setInterval(()=>{
      if(idle&&!keep&&!subscribers.size&&!ui?.hasClients()&&!jobs.size&&!engine!.isBusy()&&Date.now()-last>=idle){void stop();return;}
      engine!.tick();
    },poll);
    engine.tick();
  }catch(e){await stop();throw e;}
}
