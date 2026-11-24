#!/usr/bin/env node
import { renderHelp, renderReply, renderStatusSnapshot, runTopDashboard, type UiSnapshotData } from './cli-render.js';
import { commandOptions, invocation, optionsFor, parse, syntax, ttyOperator } from './commands.js';
import { route } from './herdr.js';
import { context, openPeer, requestTimeout, type DaemonInfo, type Peer, type UiInfo } from './ipc.js';
import { failure, FlowError, success, VERSION, type Invocation, type Reply } from './types.js';
import { browse, serveUi } from './ui.js';

const args=process.argv.slice(2);
const divider=args.indexOf('--'),argCount=divider<0?args.length:divider;
let useJson=false;
for(let i=argCount-1;i>=0;i--)if(args[i]==='--json'){useJson=true;args.splice(i,1);}
const method=args.shift();
const tty=!!process.stdout.isTTY;
const operator=!!process.stdin.isTTY&&tty;
const operatorError=()=>new FlowError('operator_required','This command requires an interactive terminal.');

function help(command?:string){
  process.stdout.write(renderHelp(command,VERSION,commandOptions,optionsFor));
}

function render(reply:Reply,command:string){
  const result=renderReply(reply,command,{json:useJson,tty});
  process.exitCode=result.exitCode;
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
}

function data<T>(reply:Reply):T{
  if(reply.error)throw new FlowError(reply.error.code,reply.error.message,reply.exit_code,reply.error.details);
  return reply.data as T;
}

async function connected(run:(peer:Peer,signal:AbortSignal)=>Promise<void>){
  const peer=(await openPeer())!,abort=new AbortController();
  let interrupted=0;
  const stop=(exit:number)=>{interrupted=exit;abort.abort();peer.close();};
  const interrupt=()=>stop(130),terminate=()=>stop(143);
  process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
  try{await run(peer,abort.signal);}
  catch(e){if(!interrupted)throw e;}
  finally{
    peer.close();
    process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);
    if(interrupted)process.exitCode=interrupted;
  }
}

async function top(peer:Peer,inv:Invocation,signal:AbortSignal){
  const ctx={...inv.ctx,route:route(inv),operator:operator||undefined};
  const scoped={ctx,opts:{project:inv.opts.project}};
  const fetchSnapshot=async()=>data<UiSnapshotData>(await peer.call('ui.snapshot',scoped,45000,signal));
  const {ui_url}=data<DaemonInfo>(await peer.call('ping',{},5000,signal));
  data(await peer.call('ui.subscribe',scoped,45000,signal));
  process.exitCode=await runTopDashboard({
    peer,
    fetchSnapshot,
    uiUrl:ui_url,
    openBrowser:url=>{
      void peer.call('daemon.ui',{},5000,signal).then(reply=>{
        const ui=data<UiInfo>(reply);
        browse(ui.access_url??ui.url);
      }).catch(()=>browse(url));
    },
    runAction:async(action,target,opts)=>{
      if(!operator)return failure(operatorError());
      try{
        const requested=await invocation(action,ctx,target,opts);
        return await peer.call(action,requested,requestTimeout(action,requested.opts),signal);
      }catch(e){return failure(e);}
    },
  });
}

try{
  if(method==='--version'||method==='-v')process.stdout.write(VERSION+'\n');
  else if(method==='--help'||method==='-h'||args[0]==='-h'||args.slice(0,args.includes('--')?args.indexOf('--'):args.length).includes('--help'))
    help(method);
  else if(!method){
    if(!tty||useJson)help();
    else await connected(async(peer,signal)=>{
      const snap=data<UiSnapshotData>(await peer.call('ui.snapshot',{ctx:context(),opts:{}},45000,signal));
      process.stdout.write(renderStatusSnapshot(snap,{tty:true,uiUrl:snap.daemon?.ui_url}));
    });
  }else if(method==='daemon'){
    const action=args[0];
    if(args.length!==1)syntax('Usage: chflow daemon start|stop|status|logs');
    if(action==='_serve')await (await import('./daemon.js')).serve();
    else{
      const api=action==='stop'?'daemon.stop':action==='logs'?'daemon.logs':['start','status'].includes(action)?'ping':undefined;
      if(!api)syntax('Usage: chflow daemon start|stop|status|logs');
      const peer=await openPeer(action==='start');
      try{render(peer?await peer.call(api!):success({running:false}),method);}finally{peer?.close();}
    }
  }else if(method==='mcp'){
    if(args.some(a=>!['--enable-respond','--no-respond'].includes(a)))syntax('Usage: chflow mcp [--enable-respond | --no-respond]');
    await (await import('./mcp.js')).mcp(args);
  }else{
    const ctx=context();
    if(ttyOperator(method)){
      if(!operator)throw operatorError();
      ctx.operator=true;
    }
    const parsed=await parse(method,args,ctx),{inv}=parsed;
    if(method==='ui'||method==='open'){
      if(method==='open')inv.opts.open=true;
      if(['port','host','session','machine','allow_remote','standalone'].some(key=>inv.opts[key]!==undefined))
        await serveUi(inv,useJson);
      else await connected(async(peer,signal)=>{
        const info=data<UiInfo>(await peer.call('daemon.ui',{},5000,signal));
        const url=info.access_url??info.url;
        process.stdout.write((useJson?JSON.stringify(info):url)+'\n');
        if(inv.opts.open)browse(url);
      });
    }else{
      await connected(async(peer,signal)=>{
        if(method==='top'||method==='status'&&inv.opts.watch)await top(peer,inv,signal);
        else{
          const api=method==='status'?'ui.snapshot':parsed.method;
          render(await peer.call(api,inv,requestTimeout(api,inv.opts),signal),method);
        }
      });
    }
  }
}catch(e){render(failure(e),method??'');}
