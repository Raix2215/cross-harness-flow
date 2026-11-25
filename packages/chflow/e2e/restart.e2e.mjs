import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {setTimeout as sleep} from 'node:timers/promises';
import {createFixture, eventually} from './fake-herdr.mjs';
const env={CHFLOW_EXIT_GRACE_MS:'70',CHFLOW_EXIT_STEP_MS:'45',CHFLOW_SHELL_SETTLE_MS:'15'};
async function command(fx,args,code=0){const r=await fx.cli(args);assert.equal(r.code,code,r.stdout+'\n'+r.stderr);return r.json;}
const health=fx=>command(fx,['health']);
const pane=async(fx,id)=>(await health(fx)).managed_panes.find(p=>p.pane_id===id);
async function worker(fx,kind='pi',name='restart-worker'){
  return command(fx,['start',name,'--kind',kind,'--perm','ask']);
}
async function bind(fx,p){
  await command(fx,['role','set','restart-role','--kind','pi']);
  await command(fx,['role','bind','restart-role','--pane',p.pane_id]);
}
const restarts=(fx,id)=>fx.herdr.requests.filter(x=>x.method==='agent.start'&&x.pane===id);
async function ui(t,fx){
  const child=spawn(process.execPath,[fx.cliPath,'ui','--port','0','--json'],{cwd:fx.workspace,env:fx.env,stdio:['ignore','pipe','pipe']});
  const exited=new Promise(resolve=>child.once('exit',resolve));
  t.after(async()=>{if(child.exitCode===null)child.kill('SIGTERM');await exited;});
  const lines=createInterface({input:child.stdout});
  const info=await new Promise(resolve=>lines.once('line',line=>resolve(JSON.parse(line))));
  const html=await(await fetch(info.url+'/')).text();
  const token=html.match(/"csrfToken"\s*:\s*"([0-9a-f]{64})"/)[1];
  return {
    snapshot:async()=>(await(await fetch(info.url+'/api/snapshot')).json()).data,
    action:async(action,target,opts={},status=200)=>{
      const r=await fetch(info.url+'/api/action',{method:'POST',headers:{Origin:info.url,'X-Chflow-Token':token,'Content-Type':'application/json'},body:JSON.stringify({action,target,opts})});
      const body=await r.json();assert.equal(r.status,status,JSON.stringify(body));return body;
    },
  };
}
test('E2E-35 protected restart, exit escalation, retry and rollback preserve pane/session identities', {timeout:90000}, async t=>{
  for(const kind of ['pi','codex','claude','agy'])await t.test(kind+' exits natively and retains an unreported exact session',async t=>{
    const fx=await createFixture(t,{env});
    const id='w1:p90',session={kind:kind==='pi'?'path':'id',value:kind==='pi'?fx.workspace+'/exact.json':'exact-session'};
    fx.herdr.addAgent(id,{name:'exact-worker',agent:kind,agent_session:session});
    await command(fx,['adopt',id]);
    fx.herdr.configureRestart(id,{omitSession:true});
    for(const perm of ['readonly','ask']){
      const result=await command(fx,['switch',id,'--perm',perm,'--restart','--attended','--timeout','4']);
      assert.equal(result.native_perm,perm);assert.deepEqual(result.agent_session,session);
      assert.equal(result.restarting,false);assert.equal(result.pending_restart,null);
    }
    assert.ok(fx.herdr.prompts.filter(x=>x.pane===id).every(x=>x.text===(kind==='pi'?'/quit':'/exit')));
    assert.ok(restarts(fx,id).every(x=>x.params.includes(session.value)),'Each restart must use the retained exact session');
  });
  await t.test('shell settlement and transient shell topology never prune a role',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);await bind(fx,p);
    fx.herdr.configureRestart(p.pane_id,{startDelayMs:250});
    const running=command(fx,['switch',p.pane_id,'--perm','readonly','--restart','--timeout','4']);
    await eventually(()=>fx.herdr.prompts.some(x=>x.pane===p.pane_id&&x.text==='/quit'));
    const view=await health(fx);assert.equal(view.managed_panes.find(x=>x.pane_id===p.pane_id).restarting,true);
    assert.equal(view.roles.find(x=>x.role==='restart-role').binding_mode,'pane');
    await running;
    const final=await health(fx);assert.equal(final.roles.find(x=>x.role==='restart-role').pane_id,p.pane_id);
    assert.ok(!final.audit?.some(x=>x.event==='pane_pruned'&&x.detail===p.pane_id));
    const exit=fx.herdr.prompts.find(x=>x.text==='/quit');assert.ok(restarts(fx,p.pane_id).at(-1).at-exit.completedAt>=10);
  });
  await t.test('stuck graceful exit escalates through pane keys to ctrl+d',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);
    fx.herdr.configureRestart(p.pane_id,{exitOn:'ctrl+d'});
    await command(fx,['switch',p.pane_id,'--perm','readonly','--restart','--timeout','4']);
    const keys=fx.herdr.keys.filter(x=>x.pane===p.pane_id&&x.method==='pane.send-keys').flatMap(x=>x.keys);
    assert.deepEqual(keys.slice(0,2),['esc','ctrl+u']);assert.ok(keys.filter(x=>x==='ctrl+c').length>=2);assert.ok(keys.includes('ctrl+d'));
  });
  await t.test('exit timeout never overlays another process or loses a role',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);await bind(fx,p);
    fx.herdr.configureRestart(p.pane_id,{exitOn:'never'});const before=restarts(fx,p.pane_id).length;
    const failed=await command(fx,['switch',p.pane_id,'--perm','readonly','--restart','--timeout','4'],1);
    assert.equal(failed.error.code,'restart_timeout');assert.deepEqual(failed.error.details,{stage:'exit',still_running:true,rolled_back:false});
    assert.equal(restarts(fx,p.pane_id).length,before);
    const s=await health(fx);assert.equal(s.roles.find(x=>x.role==='restart-role').pane_id,p.pane_id);
    assert.equal(s.managed_panes.find(x=>x.pane_id===p.pane_id).native_perm,'ask');
    assert.equal(s.managed_panes.find(x=>x.pane_id===p.pane_id).pending_restart,null);
  });
  await t.test('transient startup failure retries once',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);const before=restarts(fx,p.pane_id).length;
    fx.herdr.failNext('agent.start',{code:'spawn_failed'});
    const result=await command(fx,['switch',p.pane_id,'--perm','readonly','--restart','--timeout','4']);
    assert.equal(result.native_perm,'readonly');assert.equal(restarts(fx,p.pane_id).length-before,2);
  });
  await t.test('persistent startup failure restores native scope and the bound original session',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);await bind(fx,p);
    fx.herdr.failNext('agent.start',{code:'spawn_failed'});fx.herdr.failNext('agent.start',{code:'spawn_failed'});
    const result=await command(fx,['switch',p.pane_id,'--perm','readonly','--restart','--timeout','4'],1);
    assert.equal(result.error.code,'restart_rolled_back');assert.equal(result.error.details.rolled_back,true);assert.equal(result.error.details.restored_perm,'ask');
    const s=await health(fx),saved=s.managed_panes.find(x=>x.pane_id===p.pane_id);
    assert.equal(saved.native_perm,'ask');assert.equal(saved.perm,'ask');assert.deepEqual(saved.agent_session,p.agent_session);
    assert.equal(s.roles.find(x=>x.role==='restart-role').pane_id,p.pane_id);assert.equal(saved.last_restart_error,'spawn_failed');
    assert.ok(s.audit.some(x=>x.event==='pane_restart_rolled_back'));
    assert.ok(!fx.herdr.starts.at(-1).extra.includes('--no-mcp'),'Rollback uses old native flags');
  });
  await t.test('rollback failure preserves recovery metadata and stops',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);await bind(fx,p);
    for(let i=0;i<3;i++)fx.herdr.failNext('agent.start',{code:'spawn_failed'});
    const failed=await command(fx,['switch',p.pane_id,'--perm','readonly','--restart','--timeout','4'],1);
    assert.equal(failed.error.code,'restart_failed');assert.equal(failed.error.details.rolled_back,false);
    const s=await health(fx);assert.ok(s.managed_panes.some(x=>x.pane_id===p.pane_id&&x.last_restart_error));
    assert.equal(s.roles.find(x=>x.role==='restart-role').pane_id,p.pane_id);
    assert.ok(s.audit.some(x=>x.event==='pane_restart_rollback_failed'));
  });
  await t.test('folder trust handling is identity-scoped and auto never confirms it',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx,'claude');
    fx.herdr.configureRestart(p.pane_id,{trust:true});
    const result=await command(fx,['switch',p.pane_id,'--perm','auto-workspace','--restart','--allow-last','--timeout','4']);
    assert.equal(result.native_perm,'auto-workspace');assert.ok(fx.herdr.keys.some(x=>x.method==='agent.send-keys'&&x.keys.includes('enter')));
    const before=fx.herdr.keys.length;
    const failed=await command(fx,['switch',p.pane_id,'--perm','auto','--restart','--allow-last','--timeout','4'],1);
    assert.equal(failed.error.code,'restart_rolled_back');
    const rollback=restarts(fx,p.pane_id).at(-1);
    assert.ok(fx.herdr.keys.slice(before).filter(x=>x.method==='agent.send-keys').every(x=>x.at>=rollback.at),'Native auto never confirms folder trust; only rollback may confirm');
  });
  await t.test('invalid launch arguments fail before exit or any interrupt key',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);const n=fx.herdr.keys.length;
    const result=await command(fx,['switch',p.pane_id,'--perm','readonly','--workspace-mode','auto','--restart'],1);
    assert.equal(result.error.code,'invalid_args');assert.equal(fx.herdr.keys.length,n);assert.equal(fx.herdr.prompts.length,0);
  });
  await t.test('void Herdr commands accept empty stdout while malformed output or empty queries still fail',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);
    fx.herdr.failNext('pane.send-keys',{code:0,rawStdout:'unexpected plain text\n'});
    const bad=await command(fx,['switch',p.pane_id,'--perm','readonly','--restart','--timeout','4'],1);
    assert.equal(bad.error.code,'invalid_response');
    assert.equal((await pane(fx,p.pane_id)).last_restart_error,'invalid_response');
    fx.herdr.failNext('pane.get',{code:0,rawStdout:''});
    const emptyQuery=await command(fx,['switch',p.pane_id,'--perm','readonly','--restart','--timeout','4'],1);
    assert.equal(emptyQuery.error.code,'invalid_response');
    fx.herdr.failNext('agent.prompt',{code:0,rawStdout:''});
    fx.herdr.configureRestart(p.pane_id,{exitOn:'ctrl+c'});
    const okResult=await command(fx,['switch',p.pane_id,'--perm','readonly','--restart','--timeout','4']);
    assert.equal(okResult.native_perm,'readonly');assert.equal(okResult.last_restart_error,null);
  });
});
test('E2E-36 idle scheduling, cancellation, force and GUI rollback use the protected restart path', {timeout:90000}, async t=>{
  await t.test('CLI schedules busy workers, then consumes the request once idle',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);await bind(fx,p);
    fx.herdr.setAgent(p.pane_id,{agent_status:'working'});
    const scheduled=await command(fx,['switch',p.pane_id,'--perm','readonly','--auto-restart']);
    assert.equal(scheduled.scheduled_restart,true);assert.equal(scheduled.pending_restart.perm,'readonly');
    assert.equal((await health(fx)).roles.find(x=>x.role==='restart-role').pending_restart.perm,'readonly');
    fx.herdr.setAgent(p.pane_id,{agent_status:'idle'});
    await eventually(async()=>{const p2=await pane(fx,p.pane_id);return p2?.native_perm==='readonly'&&!p2.pending_restart;});
  });
  await t.test('an active managed task delays the restart even after its native pane becomes idle',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);
    const task=await command(fx,['send',p.pane_id,'--task','scheduled-after-task','--brief','Complete before changing the native permission']);
    const before=restarts(fx,p.pane_id).length;
    await command(fx,['switch',p.pane_id,'--perm','readonly','--auto-restart']);
    fx.herdr.setAgent(p.pane_id,{agent_status:'idle'});await health(fx);
    assert.equal(restarts(fx,p.pane_id).length,before);
    await command(fx,['reply',task.task,'--attempt',task.attempt,'--ok','--body','Task completed']);
    await eventually(async()=>{const saved=await pane(fx,p.pane_id);return saved?.native_perm==='readonly'&&!saved.pending_restart;});
  });
  await t.test('working and blocked native sessions require force and use pane interrupts',async t=>{
    const fx=await createFixture(t,{env});const p=await worker(fx);
    for(const state of ['working','blocked']){
      fx.herdr.setAgent(p.pane_id,{agent_status:state});
      assert.equal((await command(fx,['switch',p.pane_id,'--restart'],1)).error.code,'pane_not_ready');
      const start=fx.herdr.keys.length;
      await command(fx,['switch',p.pane_id,'--restart','--force','--timeout','4']);
      assert.deepEqual(fx.herdr.keys.slice(start,start+3).map(x=>x.keys),[['esc'],['ctrl+c'],['ctrl+c']]);
    }
    const task=await command(fx,['send',p.pane_id,'--task','protected-task','--brief','Keep the managed task intact']);
    assert.equal((await command(fx,['switch',p.pane_id,'--restart','--force'],1)).error.code,'pane_busy');
    await command(fx,['cancel',task.task]);
  });
  await t.test('GUI pending state projects to controllers, cancels, and idle applies automatically',async t=>{
    const fx=await createFixture(t,{env});const api=await ui(t,fx);
    await api.action('adopt',fx.caller);
    fx.herdr.setAgent(fx.caller,{agent_status:'working'});
    await api.action('set_perm',fx.caller,{perm:'readonly',auto_restart:true});
    let s=await api.snapshot();assert.equal(s.managed_panes.find(x=>x.pane_id===fx.caller).pending_restart.perm,'readonly');
    assert.equal(s.controller_views.find(x=>x.pane_id===fx.caller).pending_restart.perm,'readonly');
    await api.action('cancel_restart',fx.caller);
    assert.equal((await pane(fx,fx.caller)).pending_restart,null);
    await api.action('set_perm',fx.caller,{perm:'readonly',auto_restart:true});
    await api.action('set_perm',fx.caller,{perm:'ask',auto_restart:true});
    await api.action('cancel_restart',fx.caller);
    fx.herdr.setAgent(fx.caller,{agent_status:'idle'});
    const p=await worker(fx);await api.action('set_perm',p.pane_id,{perm:'readonly',auto_restart:true});
    await eventually(async()=>{const q=await pane(fx,p.pane_id);return q?.native_perm==='readonly'&&!q.pending_restart;});
    assert.equal((await pane(fx,p.pane_id)).last_restart_error,null);
  });
  await t.test('automatic rollback consumes the request once and preserves its failure diagnostic',async t=>{
    const fx=await createFixture(t,{env});const api=await ui(t,fx);const p=await worker(fx);
    fx.herdr.setAgent(p.pane_id,{agent_status:'working'});
    await api.action('set_perm',p.pane_id,{perm:'readonly',auto_restart:true});
    fx.herdr.failNext('agent.start',{code:'spawn_failed'});fx.herdr.failNext('agent.start',{code:'spawn_failed'});
    fx.herdr.setAgent(p.pane_id,{agent_status:'idle'});
    await eventually(async()=>{const s=await health(fx);return s.audit.some(x=>x.event==='pane_auto_restart_failed');});
    const saved=await pane(fx,p.pane_id);assert.equal(saved.native_perm,'ask');assert.equal(saved.pending_restart,null);assert.equal(saved.last_restart_error,'spawn_failed');
    const count=restarts(fx,p.pane_id).length;await sleep(650);await health(fx);assert.equal(restarts(fx,p.pane_id).length,count);
  });
  await t.test('cancel by native alignment and GUI rollback report a 409 without retry loops',async t=>{
    const fx=await createFixture(t,{env});const api=await ui(t,fx);const p=await worker(fx);
    fx.herdr.setAgent(p.pane_id,{agent_status:'working'});
    await api.action('set_perm',p.pane_id,{perm:'readonly',auto_restart:true});
    await api.action('set_perm',p.pane_id,{perm:'ask',auto_restart:true});
    assert.equal((await pane(fx,p.pane_id)).pending_restart,null);
    fx.herdr.setAgent(p.pane_id,{agent_status:'idle'});
    fx.herdr.failNext('agent.start',{code:'spawn_failed'});fx.herdr.failNext('agent.start',{code:'spawn_failed'});
    const failed=await api.action('switch',p.pane_id,{perm:'readonly',restart:true,timeout:4},409);
    assert.equal(failed.error.code,'restart_rolled_back');assert.equal(failed.error.details.rolled_back,true);
    const saved=await pane(fx,p.pane_id);assert.equal(saved.native_perm,'ask');assert.equal(saved.pending_restart,null);
    const count=restarts(fx,p.pane_id).length;await sleep(650);await health(fx);assert.equal(restarts(fx,p.pane_id).length,count);
  });
});
