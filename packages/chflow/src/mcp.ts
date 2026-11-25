import { createInterface } from 'node:readline';
import { acceptsTarget, allowsExtra, commandOptions, flag, invocation, optionsFor, requiresTarget } from './commands.js';
import { context, MAX_LINE, openPeer, requestTimeout } from './ipc.js';
import { kinds, perms, workspaceModes, PROTOCOL, VERSION, json, type Opts } from './types.js';

const versions=['2025-06-18','2025-03-26','2024-11-05'];
const descriptions:Record<string,string>={start:'Start or migrate a Herdr agent.',adopt:'Register or take over a live agent.',handoff:'Transfer control and queued receipts.',switch:'Change model, effort or native scope.',send:'Dispatch a mailbox brief.',reply:'Write a result or progress receipt.',wait:'Wait for a state change.',watch:'Check daemon monitoring.',run:'Run a headless worker.',respond:'Answer the verified blocked prompt.',inspect:'Read task state; screen is explicit.',resume:'Continue the same session.',retry:'Retry, schedule or switch channels.',finish:'Confirm the reviewed outcome.',cancel:'Cancel a task and its plans.',list:'List tasks, queues and panes.',health:'Check daemon and agents.',inbox:'List waiting receipts for a pane.',flush:'Read and consume queued receipts.',role:'List or manage project role slots.'};
const numeric=new Set(['timeout','lines','max_retries']);
const hidden=new Set(['name','brief_file','file','stdin','force','auto_restart','as_controller']);
function fields(method:string){
  return Object.fromEntries(optionsFor(method)!.split(' ').filter(n=>n&&!hidden.has(n)).map(n=>[n,
    n==='kind'?{enum:method==='run'?kinds.slice(0,3):kinds}:n==='perm'?{enum:perms}:n==='workspace_mode'?{enum:workspaceModes}:n==='transport'?{enum:['exec','print','rpc']}:n==='key'?{type:'array',items:{type:'string'}}:flag(n,method)?{type:'boolean'}:numeric.has(n)?{type:'number'}:{type:'string'}]));
}
const requiredOptions:Record<string,string[]>={role:['action'],start:['kind'],send:['brief'],run:['kind','brief'],handoff:['to'],respond:['expect_visible']};
function tool(method:string){
  const f=fields(method);
  if(method==='role'){
    f.action={enum:['list','set','bind','unbind','remove']};
    f.role={type:'string'};
  }
  if(acceptsTarget(method))f.target={type:'string'};
  if(allowsExtra(method))Object.assign(f,{extra:{type:'array',items:{type:'string'}}});
  const required=[...(requiresTarget(method)?['target']:[]),...(requiredOptions[method]??[])];
  return {name:'flow_'+method,description:descriptions[method],inputSchema:{type:'object',properties:f,required:required.length?required:undefined,additionalProperties:false}};
}
type Rpc={id?:string|number|null;jsonrpc?:string;method?:string;params?:any};
const rpcError=(id:Rpc['id'],code:number,message:string)=>({jsonrpc:'2.0',id:id??null,error:{code,message}});
const record=(o:unknown):o is Record<string,unknown>=>!!o&&typeof o==='object'&&!Array.isArray(o);
export async function mcp(args:string[]){
  const allow=!args.includes('--no-respond')&&process.env.CHFLOW_MCP_DISABLE_RESPOND!=='1'&&(args.includes('--enable-respond')||process.env.CHFLOW_MCP_ENABLE_RESPOND==='1');
  const methods=[...Object.keys(commandOptions).filter(k=>allow||k!=='respond'),'role'];
  const tools=methods.map(tool),ctx=context();
  const peer=(await openPeer())!;
  await peer.call('mcp.attach',{protocol:PROTOCOL});
  const calls=new Map<Rpc['id'],AbortController>();
  let ended=false;
  const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
  const close=()=>{
    ended=true;
    for(const c of calls.values())c.abort();
    peer.close();
    lines.close();
  };
  async function request(msg:Rpc){
    if(!msg||msg.jsonrpc!=='2.0'||typeof msg.method!=='string')return rpcError(msg?.id,-32600,'Invalid Request');
    const {id,method,params}=msg;
    if(id===undefined){if(method==='notifications/cancelled')calls.get(params?.requestId)?.abort();return;}
    const result=(value:unknown)=>({jsonrpc:'2.0',id,result:value});
    if(method==='initialize')return result({protocolVersion:versions.includes(params?.protocolVersion)?params.protocolVersion:versions[0],capabilities:{tools:{}},serverInfo:{name:'chflow',version:VERSION}});
    if(method==='ping')return result({});
    if(method==='tools/list')return result({tools});
    if(method!=='tools/call')return rpcError(id,-32601,'Method not found');
    const name=params?.name, command=typeof name==='string'&&name.startsWith('flow_')?name.slice(5):'';
    if(!methods.includes(command)||calls.has(id))return rpcError(id,-32602,'Unknown tool or duplicate request ID');
    const a=params?.arguments??{};
    if(!record(a))return rpcError(id,-32602,'Expected an arguments object');
    const {target,extra,...opts}=a;
    const def=tools.find(x=>x.name===name)!.inputSchema;
    if(def.required?.some(k=>!Object.hasOwn(a,k))||Object.keys(a).some(k=>!Object.hasOwn(def.properties,k))||Object.entries(a).some(([k,v])=>{
      const p=def.properties[k];
      return p.enum?!p.enum.includes(v as never):p.type==='array'?!Array.isArray(v)||v.some((x:unknown)=>typeof x!=='string'):typeof v!==p.type;
    }))return rpcError(id,-32602,'Tool arguments do not match the declared schema');
    const controller=new AbortController();calls.set(id,controller);
    try{
      const {action,role,...roleOpts}=opts;
      const method=command==='role'?'role.'+action:command;
      const inv=await invocation(method,ctx,(command==='role'?role:target) as string|undefined,
        (command==='role'?roleOpts:opts) as Opts,extra as string[]|undefined);
      const r=await peer.call(method,inv,requestTimeout(method,inv.opts),controller.signal);
      return result({content:[{type:'text',text:JSON.stringify(r.data??r.error)}],isError:!!r.error,structuredContent:{...r,id:undefined}});
    }catch{return rpcError(id,-32602,'Invalid or cancelled tool operation');}
    finally{calls.delete(id);}
  }
  const send=(v:unknown)=>{if(v!==undefined&&!ended)process.stdout.write(JSON.stringify(v)+'\n');};
  lines.on('line',line=>{
    if(Buffer.byteLength(line)>MAX_LINE)return send(rpcError(null,-32700,'Request too large'));
    const msg=json(line);
    if(msg===undefined)return send(rpcError(null,-32700,'Parse error'));
    if(Array.isArray(msg)){
      if(!msg.length)return send(rpcError(null,-32600,'Invalid Request'));
      void Promise.all(msg.map(request)).then(rs=>{const out=rs.filter(v=>v!==undefined);if(out.length)send(out);});
    }else void request(msg).then(send);
  });
  process.stdout.on('error',close);
  await new Promise<void>(ok=>lines.once('close',()=>{close();ok();}));
}
