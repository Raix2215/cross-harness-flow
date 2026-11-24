import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { invalid, type Kind } from './types.js';
const question = /ask[_ -]user[_ -]question|pi-ask-user|request[_ -]user[_ -]input|type something|space to toggle|tab to switch|select an option|enter to submit|your answer:|user question|question prompt/i;
const permission = /would you like to run|yes, proceed|allow bash|do you want to allow|allow once|type yes to approve|permission (?:request|required|prompt)|approval required|approve (?:this|the) (?:command|action)|allow (?:this|the) (?:tool|command|action)|\[y\/n\]/i;
const disallowed = /\b(?:sudo|doas|pkexec|mkfs(?:\.[\w-]+)?|shutdown|reboot)\b|\bdd\s+[^\n]*\b(?:if|of)=|\bgit\b[^\n]*\bpush\b[^\n]*(?:--force(?:-with-lease)?\b|\s-f\b|\s\+\S+:)|\.(?:ssh|aws|gnupg|env)(?:\b|\/)|(?:oauth_creds|auth)\.json\b|(?:\/etc\/|\/dev\/|\$\{?HOME\}?|~\/)|\b(?:curl|wget)\b[^\n]*\|\s*(?:ba|z|da)?sh\b/i;
export function classifyBlock(raw:string){
  const s=raw.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\s+/g,' ');
  return question.test(s)?'question':permission.test(s)?'permission':'unknown';
}
export function blacklist(raw:string,cwd:string) {
  if(disallowed.test(raw)) return true;
  for(const line of raw.split(/\n/)){
    if(!/\b(?:rm|rmdir|mv|cp|truncate|chmod|chown|tee|unlink|shred|rsync)\b|(?:^|\s)>{1,2}/i.test(line)) continue;
    for(const match of line.matchAll(/(?:^|[\s'"=(>])((?:\.{2}(?:\/|\b)|~(?:\/|\b)|\/|[A-Z]:[\\/])[^\s'";|&)<>]*)/gi)){
      const p=match[1];
      if(p.startsWith('~')) return true;
      const rel=relative(cwd,resolve(cwd,p));
      if(isAbsolute(rel)||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')) return true;
    }
  }
  return false;
}
export const signature=(s:string)=>createHash('sha256').update(s.trim().replace(/\s+/g,' ')).digest('hex');
export function approveKey(kind:Kind,screen:string):string|undefined {
  if(/\b(?:type y(?:es)?|press y|\[y\/n\]|\(y\/n\))/i.test(screen))
    return /\btype yes to approve\b/i.test(screen)?undefined:'y';
  if(/(?:❯|›|>)\s*(?:\d+\.\s*)?(?:no\b|deny\b|cancel\b|always\b|yes,?\s+(?:and|don't))/i.test(screen))
    return undefined;
  if(kind==='codex'||kind==='claude') return 'enter';
  if(/\b(?:allow once|yes, proceed|press enter to confirm)\b/i.test(screen)) return 'enter';
  return undefined;
}
export function keyArg(s:string) {
  if(!/^(?:[A-Z0-9._:/?+-]|enter|esc(?:ape)?|space|tab|shift\+tab|up|down|left|right|backspace|delete|home|end|pgup|pgdn|ctrl\+[cug])$/i.test(s)||s==='-')
    return invalid('Unrecognized respond key.');
  return s.length===1?s:s.toLowerCase();
}
