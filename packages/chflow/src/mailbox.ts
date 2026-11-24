import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { clean, redact } from './sensitive.js';
import { FlowError } from './types.js';
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
    mkdirSync(mail,{recursive:true,mode:0o700});
    const paths={mail,brief:join(mail,`t${turn}-brief.md`),out:join(mail,`t${turn}-reply.md`)};
    atomic(paths.brief,brief);
    return paths;
  };
  if (cwd && isAbsolute(cwd)) {
    try {
      if (statSync(cwd).isDirectory()) {
        ignore(cwd);
        const top = join(cwd,'.chflow');
        mkdirSync(top,{recursive:true,mode:0o700});
        mkdirSync(join(top,'tasks'),{recursive:true,mode:0o700});
        return write(join(top,'tasks',task));
      }
    } catch(e) { if (e instanceof FlowError) throw e; }
  }
  mkdirSync(join(root,'mail'),{recursive:true,mode:0o700});
  return write(join(root,'mail','tasks',task));
}
export function diagnostic(mail: string, seq: number, event: string, value: string) {
  const path=join(mail,`diag-${seq}-${event}.txt`);
  atomic(path,redact(value));
  return path;
}
