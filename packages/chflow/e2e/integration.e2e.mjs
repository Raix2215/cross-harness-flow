import assert from 'node:assert/strict';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { createFixture, eventually } from './fake-herdr.mjs';
import { installPack } from './pack.mjs';

const execFile = promisify(execFileCallback);
const timeout = 48_000;
async function cli(fx,args,expected=0,options){
  const res=await fx.cli(args,options);
  assert.equal(res.code,expected,`${args[0]}: ${res.stdout}\n${res.stderr}`);
  assert.ok(res.json);
  return res.json;
}
const daemonPid=async fx=>(await cli(fx,['daemon','status'])).data.pid;
const prompts=(fx,pane)=>fx.herdr.prompts.filter(p=>p.pane===pane&&p.completedAt);
const release=fx=>fx.herdr.setAgent(fx.caller,{agent_status:'idle'});
const envProgram='#!/usr/bin/env node\n';

async function ended(pid){
  try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')return true;throw e;}
  if(process.platform==='linux'){
    const stat=await readFile('/proc/'+pid+'/stat','utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e));
    return !stat || stat.slice(stat.lastIndexOf(')')+2).startsWith('Z');
  }
  return false;
}

test('E2E-11 headless transports, async reply, group cleanup, and Herdr SSH routing',{timeout},async t=>{
  const fx=await createFixture(t);
  const normalPid=join(fx.root,'normal-child.pid'), timeoutPid=join(fx.root,'timeout-child.pid');
  await fx.writeExecutable('codex',envProgram+`
const a=process.argv.slice(2);
if(a[0]!=='exec'||!a.includes('--json')||!a.includes('read-only')) process.exit(10);
const fs=require('node:fs'); const {spawn}=require('node:child_process');
const child=spawn(process.execPath,['-e','setInterval(()=>{},30000)'],{stdio:'ignore'}); child.unref();
fs.writeFileSync(${JSON.stringify(normalPid)},String(child.pid));
process.stdin.resume();process.stdin.on('end',()=>{
  for(const row of [{type:'thread.started',thread_id:'fixture-codex'},{type:'item.completed',item:{type:'agent_message',text:'Codex output'}},{type:'turn.completed'}])console.log(JSON.stringify(row));
});`);
  await fx.writeExecutable('claude',envProgram+`
const a=process.argv.slice(2);
if(!a.includes('-p')||!a.includes('--output-format')||!a.includes('json'))process.exit(10);
let input=''; process.stdin.setEncoding('utf8').on('data',s=>input+=s);
process.stdin.on('end',()=>{
  if(input.includes('task=never#1')){
    const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},30000)'],{stdio:'ignore'});
    require('node:fs').writeFileSync(${JSON.stringify(timeoutPid)},String(child.pid));
    process.on('SIGTERM',()=>child.kill('SIGTERM'));
    setInterval(()=>{},30000);
    return;
  }
  console.log(JSON.stringify({type:'result',result:'Claude output',session_id:'fixture-claude'}));
});`);
  await fx.writeExecutable('pi',envProgram+`
if(!process.argv.includes('rpc'))process.exit(10);
const lines=require('node:readline').createInterface({input:process.stdin});
lines.on('line',line=>{
  const r=JSON.parse(line);
  if(r.type==='extension_ui_response'){if(!r.cancelled)process.exitCode=10;return;}
  if(r.type!=='prompt')return;
  if(r.message.includes('task=head-question#1')){
    console.log(JSON.stringify({type:'extension_ui_request',method:'select',id:'question',title:'Choose a fake model'}));return;
  }
  console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'Pi output'}],stopReason:'stop'}}));
  console.log(JSON.stringify({type:'agent_settled'}));
});`);
  const codex=await cli(fx,['run','--kind','codex','--transport','exec','--perm','readonly','--brief','Headless coding review','--max-retries','0']);
  assert.equal(codex.state,'succeeded');
  assert.equal(codex.agent_session.value,'fixture-codex');
  assert.match(await readFile(codex.out,'utf8'),/Codex output/);
  await eventually(async()=>ended(Number(await readFile(normalPid,'utf8'))),{message:'Normal exit left a live descendant'});
  const claude=await cli(fx,['run','--kind','claude','--transport','print','--brief','Headless Claude']);
  assert.match(await readFile(claude.out,'utf8'),/Claude output/);
  const never=await cli(fx,['run','--kind','claude','--task','never','--brief','Time out with a descendant','--timeout','0.5','--max-retries','0'],1);
  assert.equal(never.stop_reason,'timeout');
  assert.equal(never.state,'failed');
  await eventually(async()=>ended(Number(await readFile(timeoutPid,'utf8'))),{message:'Timeout left a live descendant'});
  const pi=await cli(fx,['run','--kind','pi','--transport','rpc','--task','head-pi','--brief','Pi background task','--bg']);
  assert.equal(pi.state,'submitted');
  await eventually(()=>prompts(fx,fx.caller).find(p=>p.text.includes('task=head-pi#1')&&p.text.includes('status=succeeded')));
  assert.match(await readFile(pi.out,'utf8'),/Pi output/);
  const question=await cli(fx,['run','--kind','pi','--task','head-question','--brief','Exercise question handling'],2);
  assert.equal(question.reason,'question_blocked');
  assert.match(await readFile(question.diag,'utf8'),/Choose a fake model/);
  const remote=await cli(fx,['start','remote-pi','--kind','pi','--place','workspace','--cwd',fx.workspace,'--machine','lab-profile']);
  assert.deepEqual(remote.route,{machine:'lab-profile'});
  await cli(fx,['send','remote-pi','--machine','lab-profile','--task','remote-task','--brief','Use this shared mailbox']);
  assert.ok(fx.herdr.starts.some(p=>p.name==='remote-pi'&&p.route.machine==='lab-profile'));
  assert.ok(fx.herdr.prompts.some(p=>p.text.includes('task=remote-task#1')&&p.route.machine==='lab-profile'));
  assert.equal(fx.herdr.reads.length,0);
});

function mcp(t,fx,{flags=[],env={},executable}={}){
  const child=spawn(executable??process.execPath,executable?['mcp',...flags]:[fx.cliPath,'mcp',...flags],{
    cwd:fx.workspace,env:{...fx.env,...env},stdio:'pipe',shell:!!executable&&process.platform==='win32',
  });
  const inbox=[];
  let stderr='';
  child.stderr.setEncoding('utf8').on('data',s=>stderr+=s);
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,stderr})));
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>inbox.push({line,object:JSON.parse(line)}));
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();});
  const send=msg=>child.stdin.write(JSON.stringify(msg)+'\n');
  const find=id=>inbox.find(r=>r.object.id===id||Array.isArray(r.object)&&r.object.some(x=>x.id===id));
  const receive=id=>eventually(()=>find(id),{message:`No MCP response ${id}`});
  const request=(id,method,params)=>({jsonrpc:'2.0',id,method,params});
  const call=(id,method,params)=>{send(request(id,method,params));return receive(id);};
  const eof=async()=>{child.stdin.end();const rc=await closed;assert.equal(rc.code,0,rc.stderr);};
  return {send,receive,find,request,call,eof};
}

test('E2E-12 MCP shared daemon, compact schema, EOF, and isolated offline package',{timeout},async t=>{
  const fx=await createFixture(t);
  await cli(fx,['daemon','start']);const pid=await daemonPid(fx);
  const m=mcp(t,fx);
  for(const [i,protocolVersion] of ['2025-06-18','2025-03-26','2024-11-05'].entries())
    assert.equal((await m.call(i+1,'initialize',{protocolVersion})).object.result.protocolVersion,protocolVersion);
  const list=await m.call(4,'tools/list');
  const bytes=Buffer.byteLength(list.line);
  assert.ok(bytes<10000,`default MCP tools/list is ${bytes} bytes`);
  const tools=list.object.result.tools;
  const names=tools.map(x=>x.name);
  assert.equal(names.length,19);
  assert.equal(names.includes('flow_respond'),false);
  for(const name of ['health','list','inspect','start','adopt','handoff','switch','send','reply','wait','watch','run','resume','retry','finish','cancel','role'])
    assert.ok(names.includes('flow_'+name));
  assert.deepEqual(tools.find(x=>x.name==='flow_run').inputSchema.properties.kind.enum,['codex','claude','pi']);
  assert.deepEqual(tools.find(x=>x.name==='flow_run').inputSchema.properties.transport.enum,['exec','print','rpc']);
  const health=await m.call(5,'tools/call',{name:'flow_health'});
  assert.equal(health.object.result.structuredContent.data.daemon.pid,pid);
  for(const [flags,env,enabled] of [[[],{CHFLOW_MCP_ENABLE_RESPOND:'1'},true],[['--no-respond'],{CHFLOW_MCP_ENABLE_RESPOND:'1'},false],[['--enable-respond'],{CHFLOW_MCP_DISABLE_RESPOND:'1'},false]]){
    const peer=mcp(t,fx,{flags,env});
    assert.equal((await peer.call(1,'tools/list')).object.result.tools.some(x=>x.name==='flow_respond'),enabled);
    await peer.eof();
  }
  fx.herdr.addAgent('w1:p11');
  const sent=await cli(fx,['send','w1:p11','--task','mcp-running','--brief','Remain active across MCP EOF']);
  m.send([m.request(10,'tools/call',{name:'flow_wait',arguments:{target:sent.task,timeout:6}}),m.request(11,'tools/call',{name:'flow_inspect',arguments:{target:sent.task}})]);
  assert.deepEqual((await m.call(12,'ping')).object.result,{});
  assert.equal(m.find(10),undefined,'A blocking batch should not hold the independent ping');
  const parallel=mcp(t,fx);
  parallel.send([parallel.request(1,'tools/call',{name:'flow_list'}),parallel.request(2,'tools/call',{name:'flow_health'})]);
  const batch=await parallel.receive(1);
  assert.deepEqual(batch.object.map(r=>r.id),[1,2]);
  for(const r of batch.object)assert.equal(r.result.structuredContent.exit_code,0);
  await parallel.eof();await m.eof();
  assert.equal(await daemonPid(fx),pid);
  await cli(fx,['reply',sent.task,'--attempt',sent.attempt,'--ok','--body','Still alive'],2,{pane:'w1:p11'});
  await eventually(()=>prompts(fx,fx.caller).find(p=>p.text.includes('task=mcp-running#1')&&p.text.includes('status=succeeded')));
  const installed=await installPack(fx.root,fx.env);
  const {stdout}=await execFile(installed,['health','--json'],{env:fx.env,cwd:fx.workspace,shell:process.platform==='win32'});
  assert.equal(JSON.parse(stdout).daemon.pid,pid);
  const packed=mcp(t,fx,{executable:installed});
  assert.equal((await packed.call(1,'initialize',{protocolVersion:'2025-06-18'})).object.result.serverInfo.version,'3.3.0');
  await packed.eof();
  t.diagnostic(`MCP compact tools/list: ${bytes} bytes; npm pack + offline install + health/MCP passed`);
});

test('E2E-13 safe adoption, controller ownership, queued handoff and native migration',{timeout},async t=>{
  const fx=await createFixture(t,{env:{CHFLOW_DEBOUNCE_MS:'350'}});
  const b={pane:fx.otherCaller}, noPane={env:{HERDR_ENV:'0',HERDR_PANE_ID:''}};
  const p='w1:p11',q='w1:p12';
  fx.herdr.addAgent(p,{agent:'codex',agent_status:'working',agent_session:{kind:'id',value:'existing-session'}});
  fx.herdr.addAgent(q);
  const health=await cli(fx,['health']);
  assert.ok(health.unmanaged_live_agents.some(x=>x.pane_id===p));
  const before=fx.herdr.prompts.length;
  const adopted=await cli(fx,['adopt',p,'--name','existing']);
  assert.equal(adopted.adopted,true);assert.equal(adopted.native_perm,'unknown');
  assert.equal(adopted.controller.pane,fx.caller);assert.equal(fx.herdr.prompts.length,before);
  assert.ok((await cli(fx,['list','--panes'])).managed_panes.some(x=>x.alias==='existing'&&x.adopted));
  fx.herdr.setAgent(p,{agent_status:'idle'});
  const sent=await cli(fx,['send','existing','--task','existing-task','--brief','Only read this task boundary']);
  assert.ok(prompts(fx,p).at(-1).text.includes('mode=adopted'));
  for(const cmd of [['send','existing','--brief','This should remain out'],['adopt',p],['switch','existing','--model','fixture-model']]){
    const error=(await cli(fx,cmd,1,b)).error;
    assert.equal(error.code,'pane_owned_by_other');assert.equal(error.details.controller.pane,fx.caller);
  }
  fx.herdr.setAgent(fx.caller,{agent_status:'working'});
  await cli(fx,['reply',sent.task,'--attempt',sent.attempt,'--ok','--body','External terminal callback'],2,noPane);
  const beforeTransfer=(await cli(fx,['list'])).queue.find(x=>x.task===sent.task);
  assert.equal(beforeTransfer.recipient.pane,fx.caller);
  const handed=await cli(fx,['handoff',sent.task,'--to',fx.otherCaller,'--notify-old']);
  assert.equal(handed.controller.pane,fx.otherCaller);
  const afterTransfer=(await cli(fx,['list','--all'])).queue.find(x=>x.event_id===beforeTransfer.event_id);
  assert.equal(afterTransfer.recipient.pane,fx.otherCaller);
  await eventually(()=>prompts(fx,fx.otherCaller).find(x=>x.text.includes('existing-task#1')));
  release(fx);
  const notice=await eventually(()=>prompts(fx,fx.caller).find(x=>x.text.startsWith('status=handed_off | to=')));
  assert.equal(notice.text.split('\n').length,1);
  assert.ok(!prompts(fx,fx.caller).some(x=>x.text.includes('existing-task#1')));
  fx.herdr.setAgent(fx.caller,{agent_status:'working'});
  fx.herdr.setAgent(fx.otherCaller,{agent_status:'idle'});
  await cli(fx,['adopt',q,'--name','takeover-worker']);
  const second=await cli(fx,['send','takeover-worker','--task','takeover-task','--brief','Move via explicit takeover']);
  await cli(fx,['reply',second.task,'--ok','--body','Queued for takeover'],2,{pane:q});
  await cli(fx,['adopt',q,'--takeover'],0,b);
  await eventually(()=>prompts(fx,fx.otherCaller).find(x=>x.text.includes('takeover-task#1')));
  release(fx);
  assert.ok(!prompts(fx,fx.caller).some(x=>x.text.includes('takeover-task#1')));
  for(const [i,session] of ['external-session-id','last'].entries()){
    const migrated=await cli(fx,['start','migrated-'+i,'--kind','codex','--resume',session]);
    assert.deepEqual(fx.herdr.starts.at(-1).extra,['resume',session==='last'?'--last':session]);
    assert.ok((await cli(fx,['list','--panes'])).managed_panes.some(x=>x.pane_id===migrated.pane_id));
  }
  assert.equal(fx.herdr.reads.length,0);
});
