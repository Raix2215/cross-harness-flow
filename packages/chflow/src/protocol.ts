import type { Delivery, Task } from './types.js';
import { redact } from './sensitive.js';
const one=(s:string)=>redact(s).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g,' ').trim();
export function note(s:string|undefined) {
  const v=one((s??'').split(/\r?\n/,1)[0]);
  if(/^[{[]|CROSS_HARNESS_MSG|\{"(?:schema|reply_to)"/.test(v)) return '';
  return [...v].slice(0,160).join('');
}
const endpoint=(label:string,pane:string)=>one(label)+'('+one(pane)+')';
export function dispatch(t:Task, mode:'assigned'|'resume'|'fallback'='assigned'){
  const from=t.caller?endpoint(t.caller.label,t.caller.pane):'chflow(cli)';
  const to=endpoint(t.name,t.pane??'headless');
  const via='machine' in t.route?' | via='+one(t.route.machine):'';
  const instruction=mode==='assigned'?(t.adoptedDispatch?'以当前 brief 为本轮任务边界，读取后执行':'读取 brief 后执行'):mode==='resume'?'读取 brief 与已有产物，继续当前任务':'读取原 brief 与已有产物，接力执行';
  return [
    `[chflow] task=${t.task}#${t.turn} from=${from} to=${to} scope=${t.launch.perm}`,
    `status=${mode}${mode==='assigned'&&t.adoptedDispatch?' | mode=adopted':''} | brief=${one(t.brief)} | out=${one(t.out)}${via}`,
    t.mode==='headless'
      ? `action: ${instruction}；在最终回复中给出结果，由 Daemon 写入 out。`
      : `action: ${instruction}；写入 out（只读可用 --body），然后运行 chflow reply ${t.task} --attempt ${t.attempt.slice(0,12)} --ok --note "<一句话结论>"。`,
  ].join('\n');
}
function summary(e:Delivery){
  return `status=${one(e.status)}${e.out?' | out='+one(e.out):''}${e.diag?' | diag='+one(e.diag):''}${e.note?(e.type==='blocked'&&e.seq!==undefined?' | reason=':' | note=')+note(e.note):''}`;
}
export function batchEntry(e:Delivery){
  return `- ${e.task}#${e.turn} (${one(e.worker)}, ${e.perm}): ${summary(e)}`;
}
export function wake(events:Delivery[],index?:string) {
  const e=events[0], to=endpoint(e.recipient.label,e.recipient.pane);
  if(events.length>1){
    return [
      `[chflow:batch] count=${events.length} to=${to}`,
      ...(index?[`status=batch | index=${one(index)}`]:events.map(batchEntry)),
      'action: 逐项按需读取 out 或 diag；已完成项用 chflow finish，阻塞或失败项用 chflow respond/resume/retry。',
    ].join('\n');
  }
  const action=e.status==='succeeded'
    ? `核验 out 后执行 chflow finish ${e.task} --ok。`
    : e.type==='blocked' ? `按需查看 diag；确认后用 chflow respond ${e.task} 或由用户接管。`
    : e.type==='progress' ? '按需查看 out，等待后续结果。'
    : `按需查看诊断；可用 chflow resume ${e.task} 或 chflow retry ${e.task}。`;
  return [`[chflow] task=${e.task}#${e.turn} from=${one(e.worker)} to=${to} scope=${e.perm}`,summary(e),`action: ${action}`].join('\n');
}
