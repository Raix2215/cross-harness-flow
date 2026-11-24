import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { kindOf, launch, permission } from './harnesses.js';
import { clean } from './sensitive.js';
import type { Store } from './store.js';
import { invalid, routeKey, str, terminal, type Agent, type ManagedPane, type Opts, type Project, type Role, type Route, type Task } from './types.js';

export const roleName=(value?:string)=>value&&/^[a-z][a-z0-9_-]{0,31}$/.test(value)?value:invalid('Role must match [a-z][a-z0-9_-]{0,31}.');
export const projectId=(value:string)=>/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(value)?clean(value):invalid('Provide a valid project ID.');
export const paneCwd=(a:{cwd?:string;foreground_cwd?:string})=>a.foreground_cwd??a.cwd;

function boundedFile(path:string,max:number){
  // Nonblocking open avoids waiting on special files in an untrusted worktree.
  let fd:number;
  try{fd=openSync(path,constants.O_RDONLY|constants.O_NONBLOCK);}
  catch(e){if(['ENOENT','ENOTDIR'].includes((e as NodeJS.ErrnoException).code??''))return undefined;throw e;}
  try{
    const info=fstatSync(fd);
    if(!info.isFile()||info.size>max)return invalid('Invalid project metadata file.');
    const buffer=Buffer.alloc(max+1);
    let size=0;
    while(size<=max){
      const bytes=readSync(fd,buffer,size,buffer.length-size,null);
      if(!bytes)break;
      size+=bytes;
    }
    if(size>max)return invalid('Project metadata exceeds its size limit.');
    return clean(buffer.toString('utf8',0,size));
  }finally{closeSync(fd);}
}
function canonical(cwd:string,local:boolean) {
  const path=clean(resolve(cwd));
  if(local)try{return clean(realpathSync(path));}catch(e){if(!['ENOENT','ENOTDIR'].includes((e as NodeJS.ErrnoException).code??''))throw e;}
  return path;
}
function scalar(raw:string){
  const value=raw.trim();
  const quoted=/^(['"])(.*?)\1(?:\s+#.*)?$/.exec(value);
  return quoted?quoted[2]:value.replace(/(?:^|\s+)#.*$/,'').trim();
}
export function roleDefaults(o:Opts,root:string,prior?:Role){
  const kind=o.kind!==undefined?kindOf(o.kind):prior?.default_kind;
  const model=str(o,'model')??prior?.default_model, effort=str(o,'effort')??prior?.default_effort;
  const provider=str(o,'provider')??(kind&&kind!=='pi'?undefined:prior?.default_provider);
  launch(kind??(provider?'pi':'codex'),{model,effort,provider,perm:o.perm});
  const desc=str(o,'desc')??prior?.description, cwd=str(o,'cwd');
  if(desc!==undefined&&(!desc.trim()||desc.length>512||/[\u0000-\u001f\u007f]/.test(desc)))return invalid('Use a single-line role description of at most 512 characters.');
  if(cwd!==undefined&&(!cwd||/[\u0000-\u001f\u007f]/.test(cwd)))return invalid('Provide a valid role directory.');
  return {
    description:desc===undefined?undefined:clean(desc),default_kind:kind,default_model:model,default_effort:effort,
    default_provider:provider,default_channel:str(o,'channel')??prior?.default_channel,
    default_perm:o.perm!==undefined?permission(o):prior?.default_perm,
    worktree:typeof o.worktree==='boolean'?o.worktree:prior?.worktree,cwd:cwd===undefined?prior?.cwd:clean(resolve(root,cwd)),
  };
}
const roleFields=new Map('description kind model effort provider channel perm worktree cwd'.split(' ').map(k=>[k,k==='description'?'desc':k]));
function readProject(root:string){
  const data=boundedFile(join(root,'.chflow','project.yaml'),65536);
  if(data===undefined)return;
  const fields=new Map<string,string>();
  const definitions=new Map<string,Opts>();
  let role:Opts|undefined, roleIndent=0, fieldIndent=0;
  for(const line of data.split(/\r?\n/)){
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    const match=/^( *)([\w-]+):\s*(.*)$/.exec(line);
    if(!match)return invalid('Invalid project.yaml mapping.');
    const [,indent,key,raw]=match,value=scalar(raw);
    const depth=indent.length;
    if(!depth){
      if(fields.has(key)||!['project','name','roles'].includes(key)||key==='roles'&&value)return invalid('Invalid project.yaml field.');
      fields.set(key,value);
      role=undefined;
      continue;
    }
    if(!fields.has('roles')||Array.from(fields.keys()).at(-1)!=='roles')return invalid('Role definitions must be under roles.');
    roleIndent ||= depth;
    if(depth===roleIndent){
      const name=roleName(key);
      if(value||definitions.has(name))return invalid('Invalid project.yaml role.');
      role={};
      definitions.set(name,role);
      continue;
    }
    fieldIndent ||= depth;
    const field=roleFields.get(key);
    if(!role||depth!==fieldIndent||depth<=roleIndent||!field||Object.hasOwn(role,field)||!value)
      return invalid('Invalid project.yaml role field.');
    if(field==='worktree'&&value!=='true'&&value!=='false')return invalid('Role worktree must be true or false.');
    role[field]=field==='worktree'?value==='true':value;
  }
  const id=fields.get('project');
  if(!id)return invalid('project.yaml requires a project ID.');
  const name=fields.get('name')??basename(root);
  if(!name||name.length>160||/[\u0000-\u001f\u007f]/.test(name))return invalid('Invalid project name.');
  const project:Project={project_id:projectId(id),name,root,source:'config'};
  const roles=[...definitions].map(([role,o]):Role=>({
    ...roleDefaults(o,root),project_id:project.project_id,role,source:'config',config_root:root,binding_mode:'unbound',
  }));
  return {project,roles};
}
function folder(root:string,source:Project['source']='folder'):Project{
  const name=basename(root)||root;
  const slug=basename(root).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,44)||'project';
  const hash=createHash('sha256').update(root).digest('hex').slice(0,12);
  return {project_id:slug+'-'+hash,name,root,source};
}
const unbound=(r:Role):Role=>{
  const {pane_id,terminal_id,route,launch,controller,launch_cwd,...defaults}=r;
  return {...defaults,binding_mode:'unbound'};
};
export const samePane=(role:Role,route:Route,pane:string,terminalId:string)=>
  role.binding_mode==='pane'&&role.route!==undefined&&routeKey(role.route)===routeKey(route)&&role.pane_id===pane&&role.terminal_id===terminalId;
export const roleActive=(r:Role,tasks:Task[])=>tasks.find(t=>!terminal(t.state)&&(
  t.project_id===r.project_id&&t.role===r.role ||
  r.binding_mode==='pane'&&r.route&&t.pane===r.pane_id&&t.terminal===r.terminal_id&&routeKey(t.route)===routeKey(r.route)
));

export class Projects {
  constructor(private db:Store){}

  private fromConfig(config:NonNullable<ReturnType<typeof readProject>>){
    const {project,roles}=config;
    for(const role of roles){
      const old=this.db.role(role.project_id,role.role);
      if(!old)this.db.saveRole(role);
      else if(old.source==='config'&&(!old.config_root||old.config_root===role.config_root)){
        const {binding_mode,pane_id,terminal_id,route,launch,controller,launch_cwd,config_overrides}=old;
        this.db.saveRole({...role,...config_overrides,binding_mode,pane_id,terminal_id,route,launch,controller,launch_cwd,config_overrides});
      }
    }
    return project;
  }

  private discover(cwd:string,local:boolean):Project {
    const path=canonical(cwd,local);
    if(!local)return folder(path);
    let gitRoot:string|undefined, worktreeRoot:string|undefined;
    for(let root=path;;root=dirname(root)){
      const config=readProject(root);
      if(config)return this.fromConfig(config);
      if(!gitRoot){
        const git=join(root,'.git');
        const info=statSync(git,{throwIfNoEntry:false});
        if(info){
          gitRoot=root;
          if(info.isFile()){
            const pointer=/^gitdir:\s*(.+)$/im.exec(boundedFile(git,4096)??'')?.[1].trim();
            if(pointer){
              const worktrees=dirname(resolve(root,pointer)),mainGit=dirname(worktrees);
              if(basename(worktrees)==='worktrees'&&basename(mainGit)==='.git'){
                worktreeRoot=canonical(dirname(mainGit),true);
              }
            }
          }
        }
      }
      if(dirname(root)===root)break;
    }
    if(worktreeRoot){
      const config=readProject(worktreeRoot);
      if(config)return this.fromConfig(config);
      return folder(worktreeRoot,'worktree');
    }
    return folder(path);
  }

  resolve(cwd:string,explicit?:string,local=true):Project{
    if(explicit!==undefined)projectId(explicit);
    let inferred:Project;
    try{inferred=this.discover(cwd,local);}
    catch(e){
      if(explicit===undefined)throw e;
      inferred=folder(canonical(cwd,local));
    }
    const prior=this.db.project(explicit??inferred.project_id);
    let project:Project;
    if(explicit===undefined||explicit===inferred.project_id){
      const sameConfig=prior?.source==='config'&&inferred.source==='config'&&prior.root!==inferred.root;
      project=sameConfig||inferred.source==='folder'&&prior?.source==='worktree'?prior:inferred;
    }else if(prior){
      // An explicit project may be selected from a directory outside its root.
      const config=prior.source==='config'?readProject(prior.root):undefined;
      project=config?.project.project_id===explicit?this.fromConfig(config):prior;
    }else{
      project={project_id:explicit,name:explicit,root:inferred.root,source:'override'};
    }
    this.db.saveProject(project);
    return project;
  }

  view(cwd:string,explicit?:string,local=true){
    // A bad declaration in an unrelated live pane must not hide other projects.
    try{return this.resolve(cwd,explicit,local);}
    catch{
      const prior=explicit&&this.db.project(explicit);
      if(prior)return prior;
      const root=canonical(cwd,false);
      const project=explicit?{project_id:projectId(explicit),name:explicit,root,source:'override' as const}:folder(root);
      this.db.saveProject(project);
      return project;
    }
  }

  pane(route:Route,a:Pick<Agent,'pane_id'|'terminal_id'|'cwd'|'foreground_cwd'>,cwd:string,explicit?:string,saved?:ManagedPane,strict=false){
    const override=this.db.projectOverride(route,a.pane_id,a.terminal_id);
    const id=explicit??override??saved?.project_id;
    const path=paneCwd(a)??cwd;
    const local=!('machine' in route)||!paneCwd(a);
    return strict?this.resolve(path,id,local):this.view(path,id,local);
  }

  task(t:Task){
    const known=t.project_id&&this.db.project(t.project_id);
    return known||this.view(t.cwd,t.project_id,t.mode==='headless'||!('machine' in t.route));
  }

  unbind(r:Role){
    const next=unbound(r);
    this.db.saveRole(next);
    return next;
  }

  assign(route:Route,a:Agent,project:Pick<Project,'project_id'>){
    this.db.assignProject(route,a.pane_id,a.terminal_id,project.project_id);
  }
}
