import { createHash } from 'node:crypto';
import { invalid, type Kind } from './types.js';
const explicitQuestion = /ask[_ -]question|ask[_ -]user[_ -]question|pi-ask-user|request[_ -]user[_ -]input|your answer:|user question|question prompt/i;
const interactiveQuestion = /type something|space to toggle|tab to switch|select an option|enter to submit|enter to select|esc to cancel|use arrow keys|choose an option|select one|type your own|question \d+ of|\(recommended\)|other\s*\(type/i;
const permission = /would you like to (?:run|make this edit|apply|create|write|edit|delete)|yes, proceed|yes,? (?:allow|run command)|allow bash|do you want to (?:allow|run|make this edit|create|write|edit|delete|modify|apply)|allow (?:once|always)|type yes to approve|permission (?:request|required|prompt)|requesting permission|run this command\?|accept this (?:file )?(?:edit|change|write|patch|diff|creation|deletion)\??|accept (?:file )?(?:edit|changes?)\??|apply (?:this |the )?(?:file )?(?:edit|patch|diff|change)\??|approval required|approve this|approve the (?:command|action|edit|change|patch|file|write)|allow (?:this|the) (?:tool|command|action|file|edit|write|change|patch)|allow (?:all )?edits (?:during|for|in) this session|allow execution|execute (?:this )?command|run shell command|allow command|confirm execution|allow (?:for|in) this session|(?:requires|needs|waiting for) approval|outside (?:the )?sandbox|bypass sandbox|\[y\/n\]/i;
const promptStart = /^\s*[│┃]*\s*(?:requesting permission|permission (?:request|required|prompt)|approval required|would you like to (?:run|make this edit|apply|create|write|edit|delete)|do you want to (?:allow|run|make this edit|create|write|edit|delete|modify|apply)|accept this (?:file )?(?:edit|change|write|patch|diff|creation|deletion)|apply (?:this |the )?(?:file )?(?:edit|patch|diff|change)|allow execution|execute (?:this )?command|run shell command|allow command|confirm execution|(?:bash|shell) command|ask[_ -]question|ask[_ -]user[_ -]question|pi-ask-user|request[_ -]user[_ -]input|user question|question prompt)\b/i;
export function activePromptText(raw:string){
  let lines=raw.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').split('\n');
  const rule=/^\s*[╭╮╰╯┌┐└┘├┤│─━═┄┈-]{6,}\s*$/;
  const status=/(?:^\s*(?:[│|]\s*)?(?:(?:cwd|path):\s*)?~\/\S+(?:\s*$|\s*[·│|]|\s+(?:accept-edits|tokens|context)\b)|[·│]\s*~\/\S+)/i;
  for(let i=lines.length-1;i>=0;i--){
    const tail=lines.slice(i+1);
    if(rule.test(lines[i])&&tail.some(line=>status.test(line))&&!tail.some(line=>permission.test(line)||
      /^\s*[│┃]*\s*(?:❯|›|>|\u25b8|\u25b6)/.test(line))){
      lines=lines.slice(0,i);break;
    }
  }
  lines=lines.filter((line,i)=>i<lines.length-3||!status.test(line)||
    !/·|\b(?:cwd|path):|\b(?:accept-edits|tokens|context)\b/i.test(line)||permission.test(line));
  // The latest prompt header separates the current interaction from scrollback.
  const start=lines.findLastIndex(line=>promptStart.test(line));
  if(start>=0)lines=lines.slice(start);
  return lines.join('\n');
}
export function classifyBlock(raw:string){
  const s=activePromptText(raw).replace(/\s+/g,' ');
  return explicitQuestion.test(s)?'question':permission.test(s)?'permission':interactiveQuestion.test(s)?'question':'unknown';
}
export const signature=(s:string)=>createHash('sha256').update(s.trim().replace(/\s+/g,' ')).digest('hex');
export function approveKey(kind:Kind,screen:string,passthrough=false):string|undefined {
  const visible=activePromptText(screen);
  if(passthrough)return /(?:\btype y(?:es)?\b|\bpress y\b|\[y\/n\]|\(y\/n\))/i.test(visible)&&
    !/\btype yes to approve\b/i.test(visible)?'y':'enter';
  if(/(?:❯|›|>|\u25b8|\u25b6)\s*(?:\d+[.)]\s*)?(?:no\b|deny\b|reject\b|decline\b|cancel\b|always\b|allow (?:always\b|(?:for|in) this session\b)|yes,?\s+(?:and|don't|always|allow\s+(?:always|all\b|(?:for|in) this session\b)))/i.test(visible))
    return undefined;
  if(/(?:\btype y(?:es)?\b|\bpress y\b|\[y\/n\]|\(y\/n\))/i.test(visible))
    return /\btype yes to approve\b/i.test(visible)?undefined:'y';
  if(kind==='codex'||kind==='claude'||kind==='agy') return 'enter';
  if(/\b(?:allow once|yes, proceed|yes, run command|press enter to confirm)\b/i.test(visible)) return 'enter';
  return undefined;
}
export function keyArg(s:string) {
  if(!/^(?:[A-Z0-9._:/?+-]|enter|esc(?:ape)?|space|tab|shift\+tab|up|down|left|right|backspace|delete|home|end|pgup|pgdn|ctrl\+[cug])$/i.test(s)||s==='-')
    return invalid('Unrecognized respond key.');
  return s.length===1?s:s.toLowerCase();
}
