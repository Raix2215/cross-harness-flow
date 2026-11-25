import { fileText } from './mailbox.js';
import { clean } from './sensitive.js';
import { FlowError, invalid, kinds, perms, str, type Context, type Kind, type Launch, type Opts, type Perm, type Route, type Session, type WorkspaceMode } from './types.js';
import { same } from './herdr.js';
const efforts=['off','minimal','low','medium','high','xhigh','max'];
const model=/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/;
const elevated = ['--allow-dangerously-skip-permissions','--approve-for-me','--full-auto','--yolo','--no-sandbox','--settings','--add-dir','--mcp-config','--plugin-dir','--extension','--permission-mode','--mode','--approval-mode','--allowedTools','--allowed-tools','--config','--sandbox','--ask-for-approval','--ignore-rules','--trust','--enable','--disable','--profile','--tools','--exclude-tools','--no-mcp'];
export function kindOf(value:unknown):Kind {
  if(!kinds.includes(value as Kind)) return invalid('Choose kind codex, claude, pi, or agy.');
  return value as Kind;
}
export function permission(o:Opts, base:Perm='ask'):Perm {
  if(o.readonly&&o.perm&&o.perm!=='readonly') return invalid('--readonly conflicts with --perm.');
  const p=o.readonly?'readonly':o.perm??base;
  if(!perms.includes(p as Perm)) return invalid('Invalid permission tier.');
  return p as Perm;
}
export function allowedWorkspaceModes(kind:Kind):WorkspaceMode[]{
  return kind==='codex'?['workspace-write','approve-for-me']:kind==='pi'?[]:['accept-edits','auto'];
}
export function defaultWorkspaceMode(kind:Kind):WorkspaceMode|undefined{
  return kind==='codex'?'workspace-write':kind==='pi'?undefined:'accept-edits';
}
export function workspaceMode(kind:Kind,value:unknown):WorkspaceMode|undefined{
  if(value===undefined)return undefined;
  const normalized=kind==='claude'&&value==='acceptEdits'?'accept-edits':value;
  if(!allowedWorkspaceModes(kind).includes(normalized as WorkspaceMode))return invalid('Unsupported workspace mode for '+kind+'.');
  return normalized as WorkspaceMode;
}
export function effectivePermMode(kind:Kind,perm:Perm,nativePerm?:Perm|'unknown',wsMode?:WorkspaceMode,nativeWsMode?:WorkspaceMode):'native'|'proxy'|'restart_required' {
  if(kind==='pi')return (perm==='readonly')!==(nativePerm==='readonly')?'restart_required':'native';
  if(perm==='readonly'||nativePerm==='readonly')return nativePerm===perm?'native':'restart_required';
  if(perm==='ask')return ['auto','auto-workspace','yolo'].includes(nativePerm??'unknown')?'restart_required':'native';
  const autoBase=kind==='codex'?'approve-for-me':'auto';
  if(perm==='auto')return nativePerm==='auto'||nativePerm==='auto-workspace'&&nativeWsMode===autoBase?'native':'restart_required';
  if(perm==='auto-workspace'){
    const target=wsMode??defaultWorkspaceMode(kind),current=nativePerm==='auto-workspace'?
      nativeWsMode??defaultWorkspaceMode(kind):nativePerm==='auto'?autoBase:undefined;
    return target&&target===current?'native':'proxy';
  }
  return nativePerm==='yolo'?'native':'proxy';
}
export function launch(kind:Kind,o:Opts,base?:Launch):Launch{
  const workspace_mode=o.workspace_mode!==undefined?workspaceMode(kind,o.workspace_mode):
    base?.workspace_mode&&allowedWorkspaceModes(kind).includes(base.workspace_mode)?base.workspace_mode:undefined;
  const result={kind,perm:permission(o,base?.perm),workspace_mode,model:str(o,'model')??base?.model,effort:str(o,'effort')??base?.effort,provider:str(o,'provider')??base?.provider,attended:!!o.attended||base?.attended,channel:str(o,'channel')??base?.channel};
  for(const s of [result.model,result.provider]) if(s&&(!model.test(s)||!clean(s))) return invalid('Invalid model or provider.');
  if(result.provider&&kind!=='pi') return invalid('--provider is only supported for Pi.');
  if(result.effort&&!efforts.includes(result.effort)) return invalid('Invalid reasoning effort.');
  return result;
}
export function native(l:Launch,extra:string[]=[]):string[]{
  const {kind,perm,model,effort,provider}=l;
  for(const t of extra){
    const f=t.split('=')[0];
    if (/^--[\w-]*(?:token|api-key|cookie|password|secret)(?:[=-]|$)/i.test(f))
      throw new FlowError('sensitive_input','Credential flags are not accepted.');
    const risky=f.startsWith('--dangerously-') || elevated.includes(f) || /^-(?:e|a|s|c|p|t|xt)(?!-)/.test(f);
    if(perm==='readonly'&&risky) throw new FlowError('readonly_conflict','Native arguments conflict with readonly scope.');
    if (perm!=='readonly'&&(f.startsWith('--dangerously-')||['--allow-dangerously-skip-permissions','--approve-for-me','--full-auto','--yolo','--no-sandbox','--permission-mode','--mode','--approval-mode','--sandbox','--ask-for-approval'].includes(f)|| (kind==='codex' && (/^-[asc](?!-)/.test(f)||f==='--config'||f==='--profile'))))
      return invalid('Use --perm and managed model options instead of native permission overrides.');
    if(kind==='agy'&&(/^-(?:p)(?!-)/.test(f)||f==='--print'||f==='--prompt'))
      throw new FlowError('compliance_blocked','agy requires a supervised interactive pane.');
    clean(t);
  }
  const args:string[]=[];
  if(provider) args.push('--provider',provider);
  if(model) args.push(kind==='codex'?'-m':'--model',model);
  if(effort){
    const v=({codex:{off:'low',minimal:'low',max:'xhigh'},claude:{off:'low',minimal:'low',xhigh:'max'},pi:{max:'xhigh'},agy:{off:'low',minimal:'low'}}[kind] as Record<string,string>)[effort]??effort;
    args.push(kind==='codex'?'-c':kind==='pi'?'--thinking':'--effort',kind==='codex'?`model_reasoning_effort="${v}"`:v);
  }
  const map:Record<Kind,Record<Perm,string[]>>={
    codex:{readonly:['-s','read-only'],ask:[],auto:['--approve-for-me'],
      'auto-workspace':l.workspace_mode==='approve-for-me'?['--approve-for-me']:['-a','never','-s','workspace-write'],yolo:['--dangerously-bypass-approvals-and-sandbox']},
    claude:{readonly:['--permission-mode','plan'],ask:[],auto:['--permission-mode','auto'],
      'auto-workspace':['--permission-mode',l.workspace_mode==='auto'?'auto':'acceptEdits'],yolo:['--dangerously-skip-permissions']},
    pi:{readonly:['--no-mcp','--tools','read,grep,find,ls'],ask:[],auto:[], 'auto-workspace':[],yolo:[]},
    agy:{readonly:['--mode','plan'],ask:[],auto:['--mode','auto'],
      'auto-workspace':['--mode',l.workspace_mode==='auto'?'auto':'accept-edits'],yolo:['--dangerously-skip-permissions']},
  };
  return [...args,...map[kind][perm],...extra];
}
type Channel={id:string;harness:Kind;auth_type?:string;status?:string;automation_safe?:boolean;model?:string;provider?:string;effort?:string};
type Matrix={channels:Channel[];fallback_chain?:string[]};
const scalar=(value:string)=>value.replace(/[ \t]+#.*$/,'').trim().replace(/^(['"])(.*)\1$/,'$2');
function yamlSection(data:string, key:string){
  return data.match(new RegExp('^'+key+':[ \\t]*(?:#[^\\n]*)?\\n([\\s\\S]*?)(?=^[\\w-]+:|(?![\\s\\S]))','m'))?.[1]??'';
}
function yamlList(data:string,key:string,indent:string){
  const lines=data.split('\n');
  const start=lines.findIndex(line=>line.startsWith(indent+key+':')&&!scalar(line.slice(indent.length+key.length+1)));
  if(start<0) return undefined;
  const values:string[]=[];
  for(const line of lines.slice(start+1)){
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    const entry=/^([ \t]*)-[ \t]+(.*)$/.exec(line);
    if(!entry||entry[1].length<=indent.length)break;
    const value=scalar(entry[2]);
    if(value)values.push(value);
  }
  return values;
}
export function channelMatrix(path?:string):Matrix{
  if(!path) return {channels:[]};
  let data:string;
  try {data=clean(fileText(path));} catch(e){if(e instanceof FlowError) throw e; return invalid('Cannot read the logical channel matrix.');}
  if(data.trimStart().startsWith('{')){
    let value:any;
    try { value=JSON.parse(data); } catch { return invalid('Invalid logical channel matrix.'); }
    const {channels,routing_rules}=value, fallback_chain=routing_rules?.fallback_chain;
    if(!Array.isArray(channels)||channels.some(c=>!c||typeof c.id!=='string'||typeof c.harness!=='string')||
      (fallback_chain!==undefined&&(!Array.isArray(fallback_chain)||fallback_chain.some(x=>typeof x!=='string'))))
      return invalid('Invalid logical channel matrix.');
    return {channels:channels.map(({models,...c})=>({...c,model:c.model??(Array.isArray(models)&&typeof models[0]==='string'?models[0]:undefined)})),fallback_chain};
  }
  data=data.replace(/\r\n/g,'\n')+'\n';
  const result:Channel[]=[];
  const section=yamlSection(data,'channels');
  const indent=section.match(/^([ \t]*)-[ \t]+id:[ \t]*/m)?.[1];
  if(indent!==undefined){
    for(const block of section.split(new RegExp('^'+indent+'-[ \\t]+id:[ \\t]*','m')).slice(1)){
      const [name,...lines]=block.split('\n');
      const fields=lines.join('\n'), fieldIndent=fields.match(/^([ \t]+)(?:harness|model|models):/m)?.[1]??indent+'  ';
      const props=Object.fromEntries([...fields.matchAll(new RegExp('^'+fieldIndent+'(harness|auth_type|status|automation_safe|model|provider|effort):([^\\n]*)','gm'))].map(m=>[m[1],scalar(m[2])]));
      result.push({...props,id:scalar(name),harness:props.harness as Kind,automation_safe:props.automation_safe==='true',
        model:props.model??yamlList(fields,'models',fieldIndent)?.[0]});
    }
  }
  const routing=yamlSection(data,'routing_rules');
  const routeIndent=routing.match(/^([ \t]+)fallback_chain:/m)?.[1];
  return {channels:result,fallback_chain:routeIndent?yamlList(routing,'fallback_chain',routeIndent):undefined};
}
export function channels(path?:string):Channel[]{
  return channelMatrix(path).channels;
}
export function compliance(l:Launch,r:Route,o:Opts,ctx:Context,headless=false, matrix:Channel[]=[]){
  if(o.unattended&&o.attended) return invalid('Choose attended or unattended operation.');
  if(l.kind==='agy'){
    if(o.bg||o.unattended||headless) throw new FlowError('compliance_blocked','agy requires a supervised interactive pane; background, unattended and headless execution are disabled.');
    const foreground=!!ctx.caller&&same(r,ctx.caller.route)||!!ctx.tty&&!('machine' in r);
    if ((!foreground || ['readonly','auto','auto-workspace','yolo'].includes(l.perm))&&!l.attended)
      throw new FlowError('compliance_blocked','Pass --attended for supervised agy.');
    if(o.retry_at||o.retry_after||o.at||o.after||o.retry_backoff||Number(o.max_retries??0)>0)
      throw new FlowError('compliance_blocked','Automated retries are disabled for agy.');
  }
  const eligible=matrix.filter(c=>c.harness===l.kind&&c.status!=='unavailable'&&(!l.channel||c.id===l.channel));
  if((o.matrix||o.channel)&&!eligible.length) throw new FlowError('compliance_blocked','No matching available logical channel.');
  if(o.unattended&&!eligible.some(c=>c.automation_safe===true&&['api-key','service-account','team-api'].includes(c.auth_type??'')))
    throw new FlowError('compliance_blocked','Unattended execution requires a validated automation-safe channel.');
}
export function resumeArgs(l:Launch,s:Session|undefined,allowLast=false):string[]{
  if(s?.value && s.kind===(l.kind==='pi'?'path':'id') && !s.value.startsWith('-')){
    const v=clean(s.value);
    return l.kind==='codex'?['resume',v]:l.kind==='claude'?['--resume',v]:l.kind==='pi'?['--session',v]:['--conversation',v];
  }
  if(!allowLast) throw new FlowError('missing_session_id','No exact session available; inspect the pane or use --allow-last.');
  return l.kind==='codex'?['resume','--last']:l.kind==='pi'?['-c']:['--continue'];
}
export function fallbackSpecs(value:string|string[]|undefined,perm:Perm,matrix:Channel[]):Launch[]{
  if(value===undefined) return [];
  return (Array.isArray(value)?value:value.split(',')).map(item=>{
    const s=item.trim();
    const ch=matrix.find(c=>c.id===s&&c.status!=='unavailable');
    const t=s.split(':'); const kind=kindOf(ch?.harness??t[0]);
    if(kind==='agy') return invalid('agy is not eligible as a fallback target.');
    if(ch) return launch(kind,{perm,channel:ch.id,model:ch.model,provider:ch.provider,effort:ch.effort});
    if(t.length>4) return invalid('Invalid fallback channel specification.');
    const [p,m,e]=t.length===4?t.slice(1):[undefined,t[1],t[2]];
    const [provider,modelName]=kind==='pi'&&m?.includes('/')&&!p ? m.split(/\/(.*)/s):[p,m];
    return launch(kind,{perm,provider:provider||undefined,model:modelName||undefined,effort:e||undefined});
  });
}
