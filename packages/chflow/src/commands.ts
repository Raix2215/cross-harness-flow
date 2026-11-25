import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clean, input } from './sensitive.js';
import { FlowError, type Context, type Invocation, type Opts } from './types.js';

export const commandOptions:Record<string,string>={
  start:'kind name perm workspace_mode readonly resume place worktree base worktree_path trust_repository workspace direction label focus pane cwd model effort provider machine session attended unattended bg timeout matrix channel controller project role',
  adopt:'name perm workspace_mode readonly controller takeover as_controller machine session attended unattended bg matrix channel project role',
  handoff:'to to_machine to_session notify_old machine session',
  switch:'model effort provider perm workspace_mode readonly restart force auto_restart allow_last machine session timeout attended unattended bg matrix channel',
  send:'task brief brief_file perm workspace_mode readonly watch wait cwd machine session attended unattended bg model effort provider timeout matrix channel max_retries retry_backoff retry_at retry_after fallback controller project role spawn',
  reply:'attempt ok fail question progress note body out file stdin',
  wait:'timeout machine session', watch:'',
  run:'kind task transport perm workspace_mode readonly bg brief brief_file cwd model effort provider machine session attended unattended timeout matrix channel max_retries retry_backoff retry_at retry_after fallback controller',
  respond:'expect_visible key text submit_key', inspect:'screen lines diag',
  resume:'brief brief_file attended unattended bg matrix switch max_retries retry_backoff',
  retry:'at after switch max_retries retry_backoff brief brief_file attended unattended bg matrix',
  finish:'ok fail note attempt', cancel:'close_pane reconcile', list:'all panes machine session project role', health:'all machine session project role',
  inbox:'machine session', flush:'machine session',
};
const roleOptions=new Map([
  ['list','project global machine session'],
  ['set','project global desc kind model effort provider channel perm workspace_mode worktree cwd'],
  ['bind','project pane spawn headless kind model effort provider channel perm workspace_mode worktree cwd controller close_old attended machine session timeout matrix'],
  ['unbind','project'],['remove','project global'],
]);
export const roleActionOptions=(action:string)=>roleOptions.get(action);
const cliOptions=new Map([
  ['role','project global desc kind model effort provider channel perm workspace_mode worktree cwd pane spawn headless controller close_old attended machine session timeout matrix'],
  ['project','project name cwd'],
  ['prune','tasks project machine session'],
  ['ui','port host open session machine allow_remote standalone'],
  ['open','port host session machine allow_remote standalone'],
  ['status','watch session machine project'],['top','session machine project'],
  ['approve','key text submit_key'],['perm','perm workspace_mode restart auto_restart force'],
  ['queue','event to to_session to_machine'],['view','turn'],
]);
export const optionsFor=(method:string)=>cliOptions.get(method)??
  (method==='project.init'?cliOptions.get('project'):method.startsWith('role.')?roleOptions.get(method.slice(5)):
    Object.hasOwn(commandOptions,method)?commandOptions[method]:undefined);
const operatorOptions=new Map([
  ['respond',commandOptions.respond+' force'],['ui.set_perm','perm workspace_mode auto_restart'],['ui.terminal','keys text submit_key prompt'],
  ['ui.screen','lines'],['ui.queue_pause',''],['ui.queue_resume',''],['ui.queue_deliver_now','event_id'],
  ['ui.queue_consume','event_id'],['ui.queue_drop','event_id'],['ui.queue_reroute','event_id to to_session to_machine'],
  ['ui.cancel_retry',''],['ui.assign_project','project reset machine session'],['ui.project_persist','project name cwd'],['ui.focus_pane','machine session'],
  ['ui.release_pane','machine session'],['ui.cancel_restart','machine session'],
  ['ui.prune',cliOptions.get('prune')!],
  ...[...roleOptions].filter(([action])=>action!=='list').map(([action,opts])=>['ui.role.'+action,opts] as const),
]);
const operatorRequired=new Set(['ui.set_perm','ui.terminal','ui.screen','ui.cancel_retry','ui.assign_project','ui.focus_pane','ui.release_pane','ui.cancel_restart']);
const operatorOptional=new Set([
  'ui.queue_pause','ui.queue_resume','ui.queue_deliver_now','ui.queue_consume','ui.queue_drop','ui.queue_reroute',
]);
export const flag=(name:string,method?:string)=>booleanOptions.has(name)||name==='worktree'&&(method==='role'||!!method?.includes('role.'));
const booleanOptions=new Set('readonly takeover as_controller reset notify_old restart auto_restart allow_last watch wait attended unattended bg ok fail question progress stdin screen diag close_pane reconcile all panes enable_respond no_respond trust_repository focus open force allow_remote standalone spawn headless close_old tasks global'.split(' '));
const repeatable=new Set(['key','keys']);
const required=new Set('adopt handoff switch send reply wait watch respond inspect resume retry finish cancel'.split(' '));
export const acceptsTarget=(method:string)=>required.has(method)||['start','health','inbox','flush'].includes(method);
export const requiresTarget=(method:string)=>required.has(method);
export const allowsExtra=(method:string)=>['start','switch','run'].includes(method);
const textCommands=new Set(['send','run','resume','retry']);
export const syntax=(msg:string):never=>{throw new FlowError('invalid_args',msg,64);};
export const ttyOperator=(method:string)=>['approve','perm','queue'].includes(method);
const queueMethods=new Map([
  ['pause','ui.queue_pause'],['resume','ui.queue_resume'],['push','ui.queue_deliver_now'],
  ['drop','ui.queue_drop'],['consume','ui.queue_consume'],['reroute','ui.queue_reroute'],
]);

async function stdinBody(){
  process.stdin.setEncoding('utf8');
  let s='';
  for await(const part of process.stdin){s+=part;if(Buffer.byteLength(s)>1024*1024) return syntax('Input exceeds 1 MiB.');}
  return input(s);
}
function localFile(ctx:Context,path:string){
  try{return input(readFileSync(resolve(ctx.cwd,path),'utf8'));}catch(e){if(e instanceof FlowError)throw e;return syntax('Cannot read the input file.');}
}
export async function invocation(method:string,ctx:Context,target?:string,opts:Opts={},extra?:string[],fromCli=false):Promise<Invocation>{
  const options=(ctx.operator===true?operatorOptions.get(method):undefined)??optionsFor(method);
  if(options===undefined)return syntax('Unknown command.');
  const needsTarget=requiresTarget(method)||operatorRequired.has(method)||method.includes('role.')&&!method.endsWith('.list');
  const hasTarget=acceptsTarget(method)||needsTarget||operatorOptional.has(method)||method==='approve';
  if(target!==undefined&&(!hasTarget||typeof target!=='string'||!target))return syntax('Unexpected target.');
  if(needsTarget&&!target)return syntax('Provide a target.');
  if(extra&&(!Array.isArray(extra)||extra.some(x=>typeof x!=='string')||!allowsExtra(method)))return syntax('Unexpected native arguments.');
  const allowed=new Set(options.split(' '));
  for(const [k,v] of Object.entries(opts)){
    const validType=flag(k,method)?typeof v==='boolean':typeof v==='string'||
      (repeatable.has(k)?Array.isArray(v)&&v.length>0&&v.every(x=>typeof x==='string'):typeof v==='number');
    if(!allowed.has(k)||!validType)return syntax('Unexpected option or value.');
    if(typeof v==='number')opts[k]=String(v);
  }
  if(textCommands.has(method)){
    if(opts.brief!==undefined&&opts.brief_file!==undefined)return syntax('Choose one brief source.');
    if(typeof opts.brief_file==='string')opts.brief=localFile(ctx,opts.brief_file);
    if(opts.brief===undefined&&fromCli&&['send','run'].includes(method)&&!process.stdin.isTTY)opts.brief=await stdinBody();
    delete opts.brief_file;
  }
  if(method==='reply'){
    if([opts.body!==undefined,!!opts.file,!!opts.out,!!opts.stdin].filter(Boolean).length>1)return syntax('Choose one reply source.');
    if(typeof opts.file==='string')opts.body=localFile(ctx,opts.file);
    if(opts.body==='-'||opts.stdin){if(!fromCli)return syntax('Supply body text to MCP.');opts.body=await stdinBody();}
    delete opts.file;delete opts.stdin;
  }
  if(typeof opts.matrix==='string'&&opts.matrix.trim())opts.matrix=resolve(ctx.cwd,opts.matrix);
  if(method==='start'&&opts.name){if(target)return syntax('Choose one start name.');target=String(opts.name);delete opts.name;}
  clean(JSON.stringify({target,opts,extra,ctx}));
  return {ctx,target,opts,extra};
}
export async function parse(method:string,args:string[],ctx:Context){
  const opts:Opts={},positional:string[]=[];
  let extra:string[]|undefined;
  for(let i=0;i<args.length;i++){
    const token=method==='status'&&args[i]==='-w'?'--watch':args[i];
    if(token==='--'){extra=args.slice(i+1);break;}
    if(token.startsWith('--')){
      const match=/^--([a-z][a-z0-9-]*)(?:=(.*))?$/s.exec(token);
      if(!match)return syntax('Invalid option syntax.');
      const key=match[1].replaceAll('-','_');
      if(Object.hasOwn(opts,key)&&!repeatable.has(key))return syntax('An option was supplied twice.');
      if(flag(key,method)){
        if(match[2]!==undefined)return syntax('Flag does not receive a value.');
        opts[key]=true;
      }else{
        const value=match[2]??args[++i];
        if(value===undefined||(match[2]===undefined&&value.startsWith('--')))return syntax('Missing option value.');
        if(repeatable.has(key)){
          const prev=opts[key];
          opts[key]=prev===undefined?[value]:[...(Array.isArray(prev)?prev:[String(prev)]),value];
        }else opts[key]=value;
      }
    }else{
      if(token.startsWith('-'))return syntax('Unexpected positional argument.');
      positional.push(token);
    }
  }
  const [target,value,...rest]=positional;
  if((value!==undefined&&!['perm','queue','view','role','project'].includes(method))||rest.length)
    return syntax('Unexpected positional argument.');
  if(method==='project'){
    if(target!=='init')return syntax('Choose project init.');
    if(value!==undefined){
      if(opts.project!==undefined)return syntax('Provide one project ID.');
      opts.project=value;
    }
    return {method:'project.init',inv:await invocation('project.init',ctx,undefined,opts,extra,true)};
  }
  if(method==='role'){
    if(!target||!roleOptions.has(target))return syntax('Choose role list, set, bind, unbind or remove.');
    const action='role.'+target;
    return {method:action,inv:await invocation(action,ctx,value,opts,extra,true)};
  }
  if(method==='perm'){
    if(value!==undefined&&opts.perm!==undefined)return syntax('Provide one permission tier.');
    if(value!==undefined)opts.perm=value;
    if(opts.restart||opts.force)return {method:'switch',inv:await invocation('switch',ctx,target,{...opts,restart:true},extra,true)};
    return {method:'ui.set_perm',inv:await invocation('ui.set_perm',ctx,target,opts,extra,true)};
  }
  if(method==='queue'){
    const action=target&&queueMethods.get(target);
    if(!action)return syntax('Choose queue pause, resume, push, drop, consume or reroute.');
    const {event,...options}=opts;
    if(options.event_id!==undefined)return syntax('Use --event to select a delivery.');
    if(event!==undefined)options.event_id=event;
    return {method:action,inv:await invocation(action,ctx,value,options,extra,true)};
  }
  if(method==='view'){
    const inv=await invocation(method,ctx,undefined,opts,extra,true);
    if(!target)return syntax('Provide a task ID.');
    const kind=value===undefined||value==='reply'?'out':value;
    return {method:'ui.file',inv:{...inv,target,opts:{...opts,kind}}};
  }
  return {method,inv:await invocation(method,ctx,target,opts,extra,true)};
}
