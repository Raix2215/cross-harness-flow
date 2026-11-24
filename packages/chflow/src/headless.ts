import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { native, resumeArgs } from './harnesses.js';
import { classify } from './retry.js';
import { FlowError, invalid, json, type Kind, type Session, type Task } from './types.js';
export type HeadlessResult={ok:boolean; reason:string; output:string; diagnostic?:string; session?:Session};
const ui=new Set(['select','confirm','input','editor']);
const signaling=(pid:number,signal:NodeJS.Signals)=>{
  try {process.kill(process.platform==='win32'?pid:-pid,signal);return true;} catch {return false;}
};
export function processStamp(pid:number){
  if(process.platform!=='linux') return undefined;
  try {const stat=readFileSync('/proc/'+pid+'/stat','utf8');return stat.slice(stat.lastIndexOf(')')+2).split(' ')[19];} catch {return undefined;}
}
export async function stopGroup(pid:number){
  if(process.platform==='win32'){
    await new Promise<void>(ok=>execFile('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true},()=>ok()));
    return;
  }
  if(!signaling(pid,'SIGTERM')) return;
  const stop=Date.now()+3000;
  while(Date.now()<stop){
    try {process.kill(-pid,0);} catch {return;}
    await sleep(40);
  }
  signaling(pid,'SIGKILL');
}
export function transportFor(kind:Kind, requested?:string) {
  const t=requested??(kind==='codex'?'exec':kind==='claude'?'print':'rpc');
  if(!((kind==='codex'&&t==='exec')||(kind==='claude'&&t==='print')||(kind==='pi'&&['rpc','print'].includes(t))))
    return invalid('Supported transports: codex exec, claude print, pi rpc or print.');
  return t;
}
const content=(m:any):string=>typeof m==='string'?m:Array.isArray(m)?m.filter(p=>p?.type==='text'&&typeof p.text==='string').map(p=>p.text).join('\n'):'';
export async function headless(t:Task,prompt:string,signal:AbortSignal,started:(pid:number)=>void,extra:string[]=[]):Promise<HeadlessResult> {
  const kind=t.launch.kind, transport=transportFor(kind,t.transport);
  const flags=native(t.launch,extra), rpc=kind==='pi'&&transport==='rpc';
  const resume=t.session?resumeArgs(t.launch,t.session):[];
  // Approval is a Codex root option, while sandbox and JSON output belong to exec.
  const approvalIdx=kind==='codex'?flags.indexOf('-a'):-1;
  const approval=approvalIdx>=0?flags.splice(approvalIdx,2):[];
  const codexBase=[...approval,'exec','--json','--skip-git-repo-check','-C',t.cwd,...flags];
  const args=kind==='codex'?[...codexBase,...resume,'-']:kind==='claude'
    ?['-p','--output-format','json',...flags,...resume]
    :['--mode',rpc?'rpc':'json',...flags,...resume,...(rpc?[]:['-p','--',prompt])];
  const child=spawn(kind,args,{cwd:t.cwd,detached:true,stdio:'pipe',windowsHide:true,signal:undefined});
  child.stdin.on('error',()=>{});
  if(child.pid) started(child.pid);
  const session=t.session;
  let savedSession=session, output='', err='', stdout='', status='', evidence=false, cap=false;
  let settled=false, reachedTimeout=false, question:string|undefined, stop:Promise<void>|undefined;
  const terminate=()=>stop??=(child.pid?stopGroup(child.pid):Promise.resolve());
  const timer=setTimeout(()=>{reachedTimeout=true;void terminate();},(t.timeout??300)*1000);
  const abort=()=>{void terminate();};
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted) abort();
  const limit=1024*1024;
  child.stderr.setEncoding('utf8').on('data',(s:string)=>{if(err.length<65536)err=(err+s).slice(0,65536);});
  const capture=(s:string)=>{if(output.length<limit) output=(output+s).slice(0,limit);};
  if(kind==='claude') child.stdout.setEncoding('utf8').on('data',(s:string)=>{
    if(stdout.length+s.length>limit){cap=true;void terminate();}else stdout+=s;
  });
  else {
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{
      const e=json(line);
      if(!e || settled) return;
      if(kind==='codex'){
        if(e.type==='thread.started'&&typeof e.thread_id==='string') savedSession={kind:'id',value:e.thread_id};
        if(e.type==='turn.completed') evidence=true;
        if(e.type==='turn.failed'||e.type==='error') status=e.error?.message??e.error?.code??e.message??'error';
        if(e.type==='item.completed'&&e.item?.type==='agent_message'&&typeof e.item.text==='string') capture(e.item.text+'\n');
        return;
      }
      if(e.type==='session'&&typeof e.path==='string') savedSession={kind:'path',value:e.path};
      if(e.type==='response'&&e.id==='flow-prompt'&&e.success===false){ status=String(e.error??'error');settled=true;void terminate(); }
      if(e.type==='response'&&e.id==='flow-prompt'&&e.success===true&&e.data?.disposition==='handled'){evidence=true;settled=true;void terminate();}
      if(e.type==='extension_ui_request'&&typeof e.id==='string'){
        if(rpc&&child.stdin.writable) child.stdin.write(JSON.stringify({type:'extension_ui_response',id:e.id,cancelled:true})+'\n');
        if(ui.has(e.method)){
          question=[e.method,e.title,e.message,Array.isArray(e.options)?e.options.join('\n'):undefined].filter(x=>typeof x==='string').join('\n').slice(0,65536);
          settled=true;void terminate();
        }
      }
      if(e.type==='message_update'&&e.assistantMessageEvent?.type==='text_delta') capture(String(e.assistantMessageEvent.delta??''));
      if(e.type==='message_end'&&e.message?.role==='assistant'){
        const text=content(e.message.content); if(text) output=text.slice(0,limit);
        const reason=e.message.stopReason;
        if(reason==='error'||reason==='aborted') status=String(e.message.errorMessage??reason);
        else if(!rpc && reason&&!['toolUse','tool_use'].includes(reason)) evidence=true;
      }
      if(e.type==='agent_settled'){
        if(e.aborted) status='aborted';
        evidence=true;
        if(rpc){settled=true;void terminate();}
      }
    });
  }
  const wait=new Promise<{code:number|null;signal:NodeJS.Signals|null;error?:Error}>(ok=>{
    child.once('error',error=>ok({code:null,signal:null,error}));
    // On normal exit a descendant might still own stdio. Reclaim its group before waiting for close.
    child.once('exit',()=>{void terminate();});
    child.once('close',(code,signal)=>ok({code,signal}));
  });
  if(rpc) child.stdin.write(JSON.stringify({id:'flow-prompt',type:'prompt',message:prompt})+'\n');
  else child.stdin.end(kind==='pi'?undefined:prompt);
  try {
    const rc=await wait;
    clearTimeout(timer);
    await terminate();
    if(signal.aborted) return {ok:false,reason:'interrupted',output};
    if(rc.error) throw new FlowError('cli_missing','Could not launch the selected Harness.');
    if(reachedTimeout) return {ok:false,reason:'timeout',output,diagnostic:err,session:savedSession};
    if(question!==undefined) return {ok:false,reason:'question_blocked',output,diagnostic:question,session:savedSession};
    if(kind==='claude'){
      const e=json(stdout.trim());
      if(e && (e.type==='result'||typeof e.result==='string')){
        evidence=true;output=String(e.result??e.message??'');
        if(typeof e.session_id==='string') savedSession={kind:'id',value:e.session_id};
        if(e.is_error) status=output||e.subtype||'error';
      }
    }
    if(!cap&&evidence&&!status&&(rc.code===0||(rpc&&settled))) return {ok:true,reason:'completed',output:output.trim(),session:savedSession};
    return {ok:false,reason:classify([status,err].join('\n'),rc.signal?'interrupted':'invalid_output'),output,diagnostic:[status,err].filter(Boolean).join('\n').slice(0,65536),session:savedSession};
  } finally {
    clearTimeout(timer);signal.removeEventListener('abort',abort);
  }
}
