import { appendFileSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { clean, redact } from './sensitive.js';
import { FlowError, invalid } from './types.js';
export const fileText = (path: string) => readFileSync(path,'utf8');
export function atomic(path: string, value: string, mode=0o600) {
  const tmp = path+'.'+randomUUID()+'.tmp';
  try { writeFileSync(tmp,value,{mode,flag:'wx'}); renameSync(tmp,path); }
  finally { rmSync(tmp,{force:true}); }
}
export function ignore(workspace: string) {
  let gitPath: string;
  try {
    gitPath = execFileSync('git',['-C',workspace,'rev-parse','--git-path','info/exclude'],
      {encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:2000}).trim();
  } catch { return; }
  const path = isAbsolute(gitPath) ? gitPath : resolve(workspace,gitPath);
  mkdirSync(dirname(path),{recursive:true});
  const existing = fileTextIf(path);
  if (!existing?.split(/\r?\n/).some(s=>s.trim()==='.chflow/'))
    appendFileSync(path,(existing && !existing.endsWith('\n') ? '\n' : '')+'.chflow/\n');
}
export function fileTextIf(path: string) {
  try { return fileText(path); } catch(e) { if ((e as NodeJS.ErrnoException).code==='ENOENT') return undefined; throw e; }
}
export function mailbox(root: string, cwd: string|undefined, task: string, turn: number, brief: string) {
  const write = (mail: string) => {
    clean(mail);
    mailboxDirectory(mail,true);
    const paths={mail,brief:join(mail,`t${turn}-brief.md`),out:join(mail,`t${turn}-reply.md`)};
    writeMailboxFile(mail,paths.brief,brief);
    return paths;
  };
  if (cwd && isAbsolute(cwd)) {
    try {
      if (statSync(cwd).isDirectory()) {
        const paths=write(join(cwd,'.chflow','tasks',task));
        ignore(cwd);
        return paths;
      }
    } catch(e) { if (e instanceof FlowError) throw e; }
  }
  return write(join(root,'mail','tasks',task));
}
export function diagnostic(mail: string, seq: number, event: string, value: string) {
  const path=join(mail,`diag-${seq}-${event}.txt`);
  writeMailboxFile(mail,path,redact(value));
  return path;
}

export function mailboxDirectory(mail:string,create=false){
  for(const dir of [dirname(dirname(mail)),dirname(mail),mail]){
    if(create)mkdirSync(dir,{recursive:true,mode:0o700});
    if(!lstatSync(dir).isDirectory())throw new FlowError('invalid_mailbox','Task mailbox directories must be regular directories without symlinks.');
  }
}
export function writeMailboxFile(mail:string,path:string,value:string){
  if(resolve(dirname(path))!==resolve(mail))throw new FlowError('invalid_mailbox','Write must be directly inside the task mailbox.');
  mailboxDirectory(mail);
  atomic(path,value);
}
const fileLimit=1024*1024;
export function readMailboxFile(mail:string,path:string,redacted=true){
  const rel=relative(mail,path);
  if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))return invalid('File must be inside the task mailbox.');
  const checkSize=(size:number)=>{
    if(size>fileLimit)throw new FlowError('file_too_large','Mailbox file exceeds 1 MiB.');
  };
  try{
    mailboxDirectory(mail);
    const expected=resolve(realpathSync(mail),rel);
    const before=lstatSync(path);
    if(!before.isFile()||realpathSync(path)!==expected)return invalid('Mailbox path must be a regular file without symlinks.');
    checkSize(before.size);
    const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    try{
      const stat=fstatSync(fd);
      if(!stat.isFile()||stat.dev!==before.dev||stat.ino!==before.ino||
        realpathSync(path)!==expected)return invalid('Mailbox file changed while opening.');
      checkSize(stat.size);
      const buffer=Buffer.allocUnsafe(fileLimit+1);
      let size=0;
      while(size<buffer.length){
        const n=readSync(fd,buffer,size,buffer.length-size,null);
        if(!n)break;
        size+=n;
      }
      checkSize(size);
      return {exists:true,content:redacted?redact(buffer.toString('utf8',0,size)):buffer.toString('utf8',0,size),updated_at:Math.floor(stat.mtimeMs)};
    }finally{closeSync(fd);}
  }catch(e){
    if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;
    if((e as NodeJS.ErrnoException).code==='ELOOP')return invalid('Mailbox path must be a regular file without symlinks.');
    throw e;
  }
}
