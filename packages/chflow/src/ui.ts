import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { invocation, roleActionOptions } from './commands.js';
import { missing, route, transient } from './herdr.js';
import { openPeer, readConfig, requestTimeout, type Peer, type UiInfo } from './ipc.js';
import { clean } from './sensitive.js';
import { failure, FlowError, invalid, json, str, success, VERSION, type Context, type Invocation, type Opts, type Reply } from './types.js';
import { renderUiHtml, type UiBootConfig } from './ui-page.js';

const loopbacks=['127.0.0.1','localhost','::1'];
const urlHost=(host:string)=>isIP(host)===6?'['+host+']':host;
const bodyLimit=128*1024;
const actionOptions=new Map<string,string[]>([
  ['start','kind name perm readonly resume place worktree base worktree_path trust_repository workspace direction label focus pane cwd model effort provider machine session attended timeout matrix channel controller project role'.split(' ')],
  ['send','task brief perm readonly cwd machine session attended model effort provider timeout matrix channel max_retries retry_backoff retry_at retry_after fallback controller project role spawn'.split(' ')],
  ['run','kind task transport perm readonly bg brief cwd model effort provider attended timeout matrix channel max_retries retry_backoff retry_at retry_after fallback controller'.split(' ')],
  ['switch','model effort provider perm readonly restart allow_last machine session timeout attended matrix channel'.split(' ')],
  ['adopt','name perm readonly controller takeover machine session attended matrix channel project role'.split(' ')],
  ['handoff',['to','to_session','to_machine','notify_old','machine','session']],
  ['set_perm',['perm']],
  ['terminal_control',['keys','text','submit_key','prompt']],
  ['respond',['expect_visible','key','text','submit_key','force']],
  ['resume',['brief','attended']],
  ['retry',['after','at','switch','max_retries','retry_backoff']],
  ['flush',[]],
  ['finish',['ok','fail','note','attempt']],
  ['cancel',['close_pane','reconcile']],
  ['inspect_screen',['lines']],
  ['queue_pause',[]],
  ['queue_resume',[]],
  ['queue_deliver_now',['event_id']],
  ['queue_consume',['event_id']],
  ['queue_drop',['event_id']],
  ['queue_reroute',['event_id','to','to_session','to_machine']],
  ['cancel_retry',[]],
  ['assign_project',['project','machine','session']],
  ['prune',['tasks','project','machine','session']],
  ['daemon_stop',['force']],
  ...['set','bind','unbind','remove'].map(action=>['role_'+action,roleActionOptions(action)!.split(' ')] as [string,string[]]),
]);
const operatorCommands=new Map([
  ['assign_project','ui.assign_project'],['prune','ui.prune'],['daemon_stop','daemon.stop'],
  ...['set','bind','unbind','remove'].map(action=>['role_'+action,'ui.role.'+action] as const),
  ['set_perm','ui.set_perm'],['terminal_control','ui.terminal'],['inspect_screen','ui.screen'],['cancel_retry','ui.cancel_retry'],
  ...['queue_pause','queue_resume','queue_deliver_now','queue_consume','queue_drop','queue_reroute'].map(a=>[a,'ui.'+a] as const),
]);
const conflicts=new Set(['active_tasks','attempt_mismatch','block_changed','close_in_progress','delivery_in_flight',
  'expectation_mismatch','identity_changed','no_pane','not_managed','pane_busy','pane_not_ready',
  'missing_session_id','task_busy','task_inactive','task_terminal','role_busy','role_unbound']);
const record=(o:unknown):o is Record<string,unknown>=>!!o&&typeof o==='object'&&!Array.isArray(o);

function status(reply:Reply){
  const code=reply.error?.code??'';
  if(reply.ok||reply.exit_code===2)return 200;
  if(code==='auth_required'||code==='invalid_access_token')return 401;
  if(['forbidden_host','forbidden_origin','invalid_csrf_token','operator_required','compliance_blocked','pane_owned_by_other','readonly_conflict'].includes(code))return 403;
  if(missing.test(code))return 404;
  if(conflicts.has(code))return 409;
  if(code==='body_too_large'||code==='file_too_large')return 413;
  if(code.startsWith('ipc_')||code==='daemon_unavailable'||transient.test(code))return 503;
  return ['invalid_args','attempt_required','sensitive_input'].includes(code)?400:500;
}

function respond(res:ServerResponse,reply:Reply,action=false){
  if(res.destroyed)return;
  const body={ok:reply.ok,data:reply.data,error:reply.error,exit_code:action||!reply.ok?reply.exit_code:undefined};
  if(body.error?.code==='body_too_large')res.setHeader('Connection','close');
  res.writeHead(status(reply),{'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}

function data<T>(reply:Reply){
  if(reply.ok)return reply.data as T;
  throw new FlowError(reply.error?.code??'daemon_unavailable',reply.error?.message??'Daemon request failed.',reply.exit_code);
}

function gate(req:IncomingMessage,name:string,allowed:Set<string>,code:string,optional=false){
  const values=req.headersDistinct[name];
  if(!values&&optional)return;
  if(values?.length!==1||!allowed.has(name==='host'?values[0].toLowerCase():values[0]))
    throw new FlowError(code,'Request header is not allowed.');
}

async function readBody(req:IncomingMessage){
  const tooLarge=()=>new FlowError('body_too_large','Request body exceeds 128 KiB.');
  if(Number(req.headers['content-length'])>bodyLimit)throw tooLarge();
  const chunks:Buffer[]=[];
  let size=0;
  for await(const chunk of req.iterator({destroyOnReturn:false})){
    size+=chunk.length;
    if(size>bodyLimit)throw tooLarge();
    chunks.push(chunk);
  }
  return json(Buffer.concat(chunks,size).toString('utf8')) as unknown;
}

export function browse(url:string){
  const os=process.platform;
  if(os==='linux'&&!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY)return;
  const [command,...args]=os==='darwin'?['open']:os==='win32'?['rundll32.exe','url.dll,FileProtocolHandler']:['xdg-open'];
  const child=spawn(command,[...args,url],{detached:true,stdio:'ignore',windowsHide:true});
  child.on('error',()=>{});
  child.unref();
}

export function uiSettings(opts:Opts={},embedded=false){
  if(embedded&&process.env.CHFLOW_UI_DISABLE==='1')return;
  const config=readConfig();
  if(embedded&&config.ui_disable===true)return;
  const host=str(opts,'host')??(embedded?(process.env.CHFLOW_UI_HOST??config.ui_host):undefined)??'127.0.0.1';
  const portArg=str(opts,'port')??(embedded?(process.env.CHFLOW_UI_PORT??config.ui_port):undefined);
  const allowRemote=opts.allow_remote===true||process.env.CHFLOW_UI_ALLOW_REMOTE==='1'||config.ui_allow_remote===true;
  const needsAuth=!loopbacks.includes(host);
  if(needsAuth&&(!allowRemote||!isIP(host)||host.includes('%')))
    return invalid('Choose 127.0.0.1, localhost or ::1, or enable remote access for an IP address.');
  if(portArg!==undefined&&(!/^\d+$/.test(String(portArg))||Number(portArg)>65535))
    return invalid('Port must be an integer from 0 to 65535.');
  const accessToken=needsAuth?(process.env.CHFLOW_UI_TOKEN??config.ui_token??randomBytes(24).toString('hex')):undefined;
  if(accessToken!==undefined){
    if(typeof accessToken!=='string'||accessToken.length<16||Buffer.from(accessToken).toString()!==accessToken)
      return invalid('The UI access token must be a string with at least 16 characters.');
    clean(accessToken);
  }
  const trusted=process.env.CHFLOW_UI_TRUSTED_HOSTS??config.ui_trusted_hosts??[];
  const entries=typeof trusted==='string'?trusted.split(','):trusted;
  if(!Array.isArray(entries)||entries.some(host=>typeof host!=='string'))
    return invalid('Trusted UI hosts must be a list of host names with optional ports.');
  const trustedHosts=entries.map(host=>host.trim().toLowerCase()).filter(Boolean);
  for(const authority of trustedHosts){
    if(!/^(?:[a-z0-9._-]+|\[[a-f0-9:.]+\])(?::\d{1,5})?$/.test(authority))
      return invalid('Trusted UI hosts must be host names with optional ports.');
    try{new URL('http://'+authority);}
    catch{return invalid('Invalid trusted UI host.');}
  }
  return {host,port:portArg===undefined?4317:Number(portArg),fallback:portArg===undefined,accessToken,trustedHosts};
}

type UiSettings=NonNullable<ReturnType<typeof uiSettings>>;
interface UiBackend {
  call(method:string,inv:Invocation,signal?:AbortSignal):Promise<Reply>;
  subscribe(listener:()=>void):()=>void;
  disconnected?:AbortSignal;
}

function listen(http:Server,host:string,port:number){
  return new Promise<number>((resolve,reject)=>{
    http.once('error',reject);
    http.listen(port,host==='localhost'?'127.0.0.1':host,()=>{
      http.off('error',reject);
      const address=http.address();
      if(!address||typeof address==='string')return reject(new FlowError('listen_failed','No HTTP listener is available.'));
      resolve(address.port);
    });
  });
}

export async function startUiServer(settings:UiSettings,ctx:Context,connect:()=>UiBackend|Promise<UiBackend>){
  const {host,accessToken,trustedHosts}=settings;
  const authRequired=accessToken!==undefined;
  const expected=accessToken===undefined?undefined:Buffer.from(accessToken);
  const matchesToken=(value:unknown)=>{
    if(typeof value!=='string'||!expected)return false;
    const supplied=Buffer.from(value);
    return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
  };
  const authenticated=(req:IncomingMessage)=>{
    const authorization=req.headersDistinct.authorization;
    if(authorization?.length===1&&matchesToken(/^Bearer (.+)$/i.exec(authorization[0])?.[1]))return true;
    const cookies=(req.headers.cookie??'').split(';').map(cookie=>cookie.trim()).filter(cookie=>cookie.startsWith('chflow_auth='));
    if(cookies.length!==1)return false;
    try{return matchesToken(decodeURIComponent(cookies[0].slice('chflow_auth='.length)));}
    catch{return false;}
  };
  const setCookie=(res:ServerResponse)=>{
    res.setHeader('Set-Cookie','chflow_auth='+encodeURIComponent(accessToken!)+'; HttpOnly; SameSite=Strict; Path=/');
  };
  const token=randomBytes(32);
  const html=renderUiHtml({mode:'live',version:VERSION,csrfToken:token.toString('hex'),defaultRoute:ctx.route});
  const login=(res:ServerResponse,authError?:string)=>{
    res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'});
    res.end(renderUiHtml({mode:'auth',version:VERSION,authError}));
  };
  const hosts=new Set(trustedHosts);
  const origins=new Set(trustedHosts.flatMap(authority=>
    ['http:','https:'].map(protocol=>new URL(protocol+'//'+authority).origin)));
  const sites=new Set(['same-origin','none']);
  const streams=new Map<ServerResponse,number>();
  let backend:UiBackend|undefined,release:(()=>void)|undefined,heartbeat:NodeJS.Timeout|undefined;
  let publishing=false,dirty=false;
  const snapshot=(project?:string)=>backend!.call('ui.snapshot',{ctx,opts:project===undefined?{}:{project}});
  const notifyShutdown=(reason:'idle'|'manual')=>{
    const frame='event: shutdown\ndata: '+JSON.stringify({reason})+'\n\n';
    for(const res of streams.keys()){
      try{if(!res.destroyed&&res.writable)res.write(frame);}catch{/* ignore */}
    }
  };
  const endStreams=()=>{
    for(const res of streams.keys())res.end();
    streams.clear();
    release?.();
    release=undefined;
  };
  const publish=async()=>{
    if(!streams.size)return;
    dirty=true;
    if(publishing)return;
    publishing=true;
    try{
      while(dirty&&streams.size){
        dirty=false;
        const state=data<{seq:number}>(await snapshot());
        const frame='id: '+state.seq+'\nevent: snapshot\ndata: '+JSON.stringify(state)+'\n\n';
        for(const [res,seen] of streams){
          if(seen>=state.seq)continue;
          if(res.writableNeedDrain)res.destroy();
          else{res.write(frame);streams.set(res,state.seq);}
        }
      }
    }catch{endStreams();}
    finally{publishing=false;}
  };

  const request=async(req:IncomingMessage,res:ServerResponse)=>{
    const url=new URL(req.url??'/','http://127.0.0.1');
    const path=url.pathname,method=req.method;
    const page=method==='GET'&&(path==='/'||path==='/index.html');
    const api=path.startsWith('/api/');
    if(page||api)gate(req,'host',hosts,'forbidden_host');
    if(api)gate(req,'sec-fetch-site',sites,'forbidden_origin',true);
    if(authRequired&&page&&url.searchParams.has('token')){
      const values=url.searchParams.getAll('token');
      if(values.length!==1||!matchesToken(values[0]))return login(res,'Invalid access token.');
      setCookie(res);
      res.writeHead(302,{Location:'/'});
      res.end();
      return;
    }
    if(authRequired&&method==='POST'&&path==='/api/auth'){
      gate(req,'origin',origins,'forbidden_origin');
      const body=await readBody(req);
      if(!record(body)||!matchesToken(body.token))
        throw new FlowError('invalid_access_token','Invalid access token.');
      setCookie(res);
      return respond(res,success({authenticated:true}));
    }
    if(authRequired&&(page||api)&&!authenticated(req)){
      if(page)return login(res);
      throw new FlowError('auth_required','Authenticate to access the Web UI.');
    }
    if(page){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end(html);
      return;
    }
    if(!backend||backend.disconnected?.aborted)
      throw new FlowError('daemon_unavailable','The Web UI daemon connection is unavailable.');
    if(method==='GET'&&path==='/api/snapshot'){
      respond(res,await snapshot(url.searchParams.get('project')??undefined));
    }else if(method==='GET'&&path==='/api/events'){
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive'});
      res.flushHeaders();
      streams.set(res,-1);
      res.once('close',()=>{
        streams.delete(res);
        if(!streams.size){release?.();release=undefined;}
      });
      release??=backend.subscribe(()=>void publish());
      void publish();
    }else if(method==='GET'&&/^\/api\/tasks\/[^/]+\/file$/.test(path)){
      const query=url.searchParams;
      if([...query.keys()].some(k=>k!=='kind'&&k!=='turn')||query.getAll('kind').length!==1||query.getAll('turn').length>1)
        return invalid('Provide kind and an optional turn.');
      let target:string;
      try{target=decodeURIComponent(path.split('/')[3]);}
      catch{return invalid('Invalid task ID encoding.');}
      respond(res,await backend.call('ui.file',{ctx,target,opts:{kind:query.get('kind')!,turn:query.get('turn')??undefined}}));
    }else if(method==='POST'&&path==='/api/action'){
      gate(req,'origin',origins,'forbidden_origin');
      const values=req.headersDistinct['x-chflow-token'];
      const supplied=values?.length===1&&/^[0-9a-f]{64}$/.test(values[0])?Buffer.from(values[0],'hex'):undefined;
      if(!supplied||!timingSafeEqual(token,supplied))throw new FlowError('invalid_csrf_token','Invalid CSRF token.');
      const body=await readBody(req);
      if(!record(body)||typeof body.action!=='string')return invalid('Provide a JSON action object.');
      const action=body.action,allowed=actionOptions.get(action);
      const opts=body.opts===undefined?{}:body.opts;
      if(!allowed||!record(opts)||Object.keys(opts).some(key=>!allowed.includes(key))||
        (body.target!==undefined&&typeof body.target!=='string'))return invalid('Invalid UI action or options.');
      const command=operatorCommands.get(action)??action;
      const options:Opts={...opts as Opts};
      if(action==='daemon_stop'){
        if(body.target!==undefined)return invalid('daemon_stop does not take a target.');
        if(options.force!==undefined&&typeof options.force!=='boolean')return invalid('force must be a boolean.');
        const abort=new AbortController();
        if(res.destroyed)abort.abort();
        res.once('close',()=>abort.abort());
        respond(res,await backend.call('daemon.stop',{ctx,opts:{check_active:true,force:options.force===true}},abort.signal),true);
        return;
      }
      if(action==='start'&&options.kind==='agy'&&options.attended===undefined)options.attended=true;
      if(action==='run'&&options.bg===undefined)options.bg=true;
      const requested=await invocation(command,ctx,body.target,options);
      const abort=new AbortController();
      if(res.destroyed)abort.abort();
      res.once('close',()=>abort.abort());
      respond(res,await backend.call(command,requested,abort.signal),true);
    }else{
      respond(res,failure(new FlowError('endpoint_not_found','Endpoint not found.')));
    }
  };
  const http=createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    void request(req,res).catch(e=>res.headersSent?res.destroy():respond(res,failure(e)));
  });
  const close=async()=>{
    if(heartbeat)clearInterval(heartbeat);
    backend?.disconnected?.removeEventListener('abort',endStreams);
    endStreams();
    if(http.listening)await new Promise<void>(resolve=>{
      http.close(()=>resolve());
      http.closeAllConnections();
    });
  };
  try{
    let port:number;
    try{port=await listen(http,host,settings.port);}
    catch(e){
      if(!settings.fallback||(e as NodeJS.ErrnoException).code!=='EADDRINUSE')throw e;
      port=await listen(http,host,0);
    }
    const wildcard=host==='0.0.0.0'||host==='::';
    const boundHosts=wildcard?Object.values(networkInterfaces()).flatMap(list=>
      (list??[]).filter(address=>!address.address.includes('%')).map(address=>address.address)):[];
    for(const ip of new Set([...loopbacks,host,...boundHosts])){
      const authority=urlHost(ip).toLowerCase();
      hosts.add(authority);
      hosts.add(authority+':'+port);
      const canonical=new URL('http://'+authority+':'+port);
      hosts.add(canonical.host);
      origins.add(canonical.origin);
    }
    backend=await connect();
    backend.disconnected?.addEventListener('abort',endStreams,{once:true});
    heartbeat=setInterval(()=>{
      for(const res of streams.keys()){
        if(res.writableNeedDrain)res.destroy();
        else res.write(': keepalive\n\n');
      }
    },15000);
    heartbeat.unref();
    const url='http://'+urlHost(host==='0.0.0.0'?'127.0.0.1':host==='::'?'::1':host)+':'+port;
    const info:UiInfo={url,host,port,auth_required:authRequired};
    if(authRequired){
      const access=new URL(url+'/');
      access.searchParams.set('token',accessToken!);
      info.access_url=access.href;
    }
    return {info,close,hasClients:()=>streams.size>0,notifyShutdown};
  }catch(e){
    await close();
    const code=(e as NodeJS.ErrnoException).code;
    if(e instanceof FlowError||!code)throw e;
    throw new FlowError(code,'Could not start the UI HTTP listener ('+code+').');
  }
}

export async function serveUi(inv:Invocation,useJson:boolean){
  const settings=uiSettings(inv.opts)!;
  const session=str(inv.opts,'session'),machine=str(inv.opts,'machine');
  if(session===''||machine===''||(session!==undefined&&machine!==undefined))
    return invalid('Provide a single nonempty session or machine.');
  const ctx={...inv.ctx,route:route(inv),operator:true};
  const controller=new AbortController(),{signal}=controller;
  const stop=(code:number)=>{process.exitCode=code;controller.abort();};
  const interrupt=()=>stop(130),terminate=()=>stop(143);
  process.once('SIGINT',interrupt);
  process.once('SIGTERM',terminate);
  let peer:Peer|undefined,server:Awaited<ReturnType<typeof startUiServer>>|undefined,daemon_pid:number|undefined;
  try{
    server=await startUiServer(settings,ctx,async()=>{
      const connection=peer=(await openPeer())!;
      daemon_pid=data<{pid:number}>(await connection.call('ui.subscribe',{ctx,opts:{}},45000,signal)).pid;
      return {
        call:(method,requested,signal)=>connection.call(method,requested,requestTimeout(method,requested.opts),signal),
        subscribe:listener=>{
          connection.onUiChange(listener);
          return ()=>connection.onUiChange(undefined);
        },
        disconnected:connection.disconnected,
      };
    });
    if(signal.aborted)return;
    const info=server.info,url=info.access_url??info.url;
    process.stdout.write((useJson?JSON.stringify({...info,pid:process.pid,daemon_pid}):
      'chflow ui listening on '+url+' (daemon pid='+daemon_pid+')')+'\n');
    if(inv.opts.open)browse(url);
    await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));
  }catch(e){
    if(!signal.aborted)throw e;
  }finally{
    await server?.close();
    peer?.close();
    process.removeListener('SIGINT',interrupt);
    process.removeListener('SIGTERM',terminate);
  }
}
