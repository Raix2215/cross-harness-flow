import { dirname } from 'node:path';
import { same } from './herdr.js';
import { defaultWorkspaceMode, effectivePermMode } from './harnesses.js';
import { isManagedProjectConfig, projectId, readGlobalRoles, roleActive, roleName } from './projects.js';
import type { Store } from './store.js';
import { str, terminal, type Invocation, type Recipient, type Role, type Route, type Task } from './types.js';
import { harnessLabel, readableDisplayName, sameRecipientAgent, Workspaces, type LiveTopology } from './workspaces.js';

export const received=(t:Task)=>({...t,perm:t.launch.perm,kind:t.launch.kind,pane_id:t.pane,agent_session:t.session,return_route:t.return_route??null,controller:t.controller??null});

export class SnapshotViews {
  constructor(private db:Store,private work:Workspaces,private cachedTopology:(r:Route)=>LiveTopology|undefined){}
  roleView(role:Role,r:Route,topology:ReturnType<Workspaces['topologyView']>,tasks:Task[]){
    const {launch:l,config_overrides,config_root,launch_cwd,...defaults}=role;
    const pane=role.binding_mode==='pane'&&role.route&&same(r,role.route)?
      topology.managed_panes.find(p=>p.pane_id===role.pane_id&&p.terminal_id===role.terminal_id):undefined;
    const task=roleActive(role,tasks),kind=pane?.kind??l?.kind,perm=pane?.perm??l?.perm;
    const workspace_mode=pane?.workspace_mode??l?.workspace_mode??(kind?defaultWorkspaceMode(kind):undefined);
    const native_perm=role.binding_mode==='headless'?perm:pane?.native_perm;
    const native_workspace_mode=role.binding_mode==='headless'?(perm==='auto-workspace'?workspace_mode:undefined):pane?.native_workspace_mode;
    const perm_mode=pane&&kind&&perm?effectivePermMode(kind,perm,native_perm,workspace_mode,native_workspace_mode):'native';
    return {...defaults,controller:pane?pane.controller:role.controller,kind:pane?.kind??l?.kind,model:pane?.model??l?.model,
      effort:pane?.effort??l?.effort,provider:pane?.provider??l?.provider,perm,native_perm,workspace_mode,native_workspace_mode,perm_mode,
      pending_restart:pane?.pending_restart??null,restarting:pane?.restarting??false,last_restart_error:pane?.last_restart_error??null,
      live:role.binding_mode==='headless'||!!pane?.live,
      agent_status:role.binding_mode==='unbound'?'unbound':role.binding_mode==='headless'?
        (task?.state??'idle'):(pane?.agent_status??'offline'),active_task:task?.task};
  }

  roleViews(topology:ReturnType<Workspaces['topologyView']>,r:Route,tasks:Task[],project?:string,roleFilter?:string){
    return this.db.roles().filter(role=>(!project||role.project_id===project)&&(!roleFilter||role.role===roleFilter)).map(role=>{
      if(role.route&&!same(role.route,r)&&role.binding_mode==='pane'){
        const live=this.cachedTopology(role.route);
        if(live)return this.roleView(role,role.route,this.work.topologyView(role.route,live,this.db.project(role.project_id)?.root??'.'),tasks);
      }
      return this.roleView(role,r,topology,tasks);
    });
  }

  projectView(inv:Invocation,r:Route,live:LiveTopology,all:boolean){
    const {opts:o,ctx}=inv;
    const filter=str(o,'project'),roleFilter=str(o,'role');
    if(filter!==undefined)projectId(filter);
    if(roleFilter!==undefined)roleName(roleFilter);
    const current=this.work.projects.view(ctx.cwd);
    const topology=this.work.topologyView(r,live,ctx.cwd);
    const list=this.db.tasks();
    const roleProject=filter??(roleFilter?current.project_id:undefined);
    const roles=this.roleViews(topology,r,list,roleProject,roleFilter);
    const scoped=(row:{project_id:string})=>!filter||row.project_id===filter;
    const managed_panes=topology.managed_panes.filter(p=>scoped(p)&&(!roleFilter||p.project_id===roleProject&&p.role===roleFilter));
    const unmanaged_live_agents=topology.unmanaged_live_agents.filter(p=>scoped(p)&&!roleFilter);
    const tasks=list.map(t=>({...received(t),project_id:this.work.projects.task(t).project_id})).filter(t=>
      scoped(t)&&(!roleFilter||t.project_id===roleProject&&t.role===roleFilter));
    const ids=new Set(tasks.map(t=>t.task));
    const pending=(row:{task?:unknown;project_id?:unknown})=>(!filter&&!roleFilter)||
      !roleFilter&&filter!==undefined&&row.project_id===filter||typeof row.task==='string'&&ids.has(row.task);
    const onlineByPane=new Map<string,{pane_id:string;terminal_id:string;kind:string;agent_session?:{kind:string;value:string}|null}>();
    for(const p of topology.managed_panes)if(p.live)onlineByPane.set(p.pane_id,p);
    for(const a of topology.unmanaged_live_agents)if(!onlineByPane.has(a.pane_id))onlineByPane.set(a.pane_id,a);
    const retainedPaneIds=new Set(topology.managed_panes.filter(p=>p.restarting||p.pending_restart).map(p=>p.pane_id));
    const taskProjects=new Map(list.map(t=>[t.task,this.work.projects.task(t).project_id]));
    const pendingQueueRecipients=new Map<string,Map<string,Recipient>>();
    for(const event of this.db.events().filter(pending)){
      if(!same(event.recipient.route,r))continue;
      const project=event.project_id??taskProjects.get(event.task);
      if(project!==undefined&&filter&&project!==filter)continue;
      if(project===undefined)continue;
      const recipients=pendingQueueRecipients.get(project)??new Map<string,Recipient>();
      if(!recipients.has(event.recipient.pane))recipients.set(event.recipient.pane,event.recipient);
      pendingQueueRecipients.set(project,recipients);
    }
    const projectIds=new Set([
      ...(ctx.operator===true?[]:[current.project_id]),
      ...managed_panes.filter(p=>p.live||p.restarting||p.pending_restart).map(p=>p.project_id),...unmanaged_live_agents.map(p=>p.project_id),
      ...roles.map(row=>row.project_id),...tasks.filter(t=>!terminal(t.state)).map(t=>t.project_id),...pendingQueueRecipients.keys(),
      ...this.db.projects().filter(p=>p.source==='override'||p.source==='config').map(p=>p.project_id),
    ]);
    if(filter)projectIds.add(filter);
    const isControllerLive=(rec:Recipient)=>{
      const live=onlineByPane.get(rec.pane);
      return !!live&&sameRecipientAgent(rec,live);
    };
    const controllerMetaByProject=new Map<string,Map<string,Recipient>>();
    const projects=this.db.projects().filter(p=>projectIds.has(p.project_id)&&scoped(p)).map(project=>{
      const panes=managed_panes.filter(p=>p.project_id===project.project_id);
      const external=unmanaged_live_agents.filter(p=>p.project_id===project.project_id);
      const slots=roles.filter(role=>role.project_id===project.project_id);
      const work=tasks.filter(t=>t.project_id===project.project_id&&!terminal(t.state));
      const workingControllers=new Map<string,Recipient>();
      for(const t of work)if(t.controller&&same(t.controller.route,r)&&!workingControllers.has(t.controller.pane))workingControllers.set(t.controller.pane,t.controller);
      const recipients=pendingQueueRecipients.get(project.project_id)??new Map<string,Recipient>();
      const candidates=new Map<string,Recipient>();
      const add=(rec?:Recipient|null)=>{if(rec&&same(rec.route,r)&&!candidates.has(rec.pane))candidates.set(rec.pane,rec);};
      for(const p of panes)if(p.live||p.restarting||p.pending_restart)add(p.controller);
      for(const row of slots)if(row.binding_mode!=='unbound')add(row.controller);
      for(const rec of workingControllers.values())add(rec);
      for(const rec of recipients.values())add(rec);
      const controllers:string[]=[];
      const kept=new Map<string,Recipient>();
      for(const [pane_id,rec] of candidates){
        if(isControllerLive(rec)||retainedPaneIds.has(pane_id)||workingControllers.has(pane_id)||recipients.has(pane_id)){
          controllers.push(pane_id);
          kept.set(pane_id,rec);
        }
      }
      controllerMetaByProject.set(project.project_id,kept);
      return {...project,config_managed:project.source==='config'&&isManagedProjectConfig(project.root),
        controllers,roles_count:slots.length,live_panes:panes.filter(p=>p.live).length+external.length,
        active_tasks:work.length,blocked_count:work.filter(t=>t.state==='blocked').length};
    });
    const duplicateNames=new Set(projects.filter((p,i)=>projects.findIndex(q=>q.name===p.name)<i).map(p=>p.name));
    for(const p of projects)if(duplicateNames.has(p.name))p.name=dirname(p.root)+' / '+p.name;
    const controllerRefs=[...controllerMetaByProject.values()].flatMap(m=>[...m.values()]);
    const managed=managed_panes.map(p=>({...p,is_controller:controllerRefs.some(rec=>sameRecipientAgent(rec,p)),
      overridden_project:!!this.db.projectOverrideRecord(r,p.pane_id,p.terminal_id)}));
    const queue=this.db.events().filter(e=>same(e.recipient.route,r));
    const controller_views=projects.flatMap(project=>{
      const seenLive=new Set<string>();
      const explicit=project.controllers.map(pane_id=>{
        const rec=controllerMetaByProject.get(project.project_id)?.get(pane_id);
        const rawPane=topology.managed_panes.find(p=>p.pane_id===pane_id);
        const rawExt=topology.unmanaged_live_agents.find(p=>p.pane_id===pane_id);
        const pane=rawPane&&(!rec||sameRecipientAgent(rec,rawPane))?rawPane:undefined;
        const external=rawExt&&(!rec||sameRecipientAgent(rec,rawExt))?rawExt:undefined;
        const online=pane?.live?pane:external,metadata=online??pane;
        if(online)seenLive.add(pane_id);
        const ownedTasks=tasks.filter(t=>t.project_id===project.project_id&&!terminal(t.state)&&
          t.controller?.pane===pane_id&&same(t.controller.route,r));
        const receipts=queue.filter(e=>e.recipient.pane===pane_id);
        const recipient=rec??ownedTasks[0]?.controller??receipts[0]?.recipient;
        const kind=metadata?.kind??recipient?.kind??'unknown';
        const belongs=(owner:{pane:string;route:Route}|null|undefined)=>owner?.pane===pane_id&&same(owner.route,r);
        return {project_id:project.project_id,pane_id,live:!!online,observed:false,
          display_name:metadata?.display_name??readableDisplayName({pane_id,kind,name:recipient?.label}),
          kind,harness_label:metadata?.harness_label??harnessLabel(kind),model:pane?.model,effort:pane?.effort,
          location_label:metadata?.location_label??null,workspace_label:metadata?.workspace_label??null,
          tab_label:metadata?.tab_label??null,cwd:metadata?.cwd,agent_status:online?.agent_status??'offline',
          managed:!!pane,perm:pane?.perm,native_perm:pane?.native_perm,workspace_mode:pane?.workspace_mode,
          native_workspace_mode:pane?.native_workspace_mode,perm_mode:pane?.perm_mode,
          pending_restart:pane?.pending_restart??null,restarting:pane?.restarting??false,last_restart_error:pane?.last_restart_error??null,
          paused:this.db.isPaused(r,pane_id),typing:receipts.some(e=>e.state==='deferred_user_typing'),
          queued_count:receipts.filter(e=>pending(e)&&(!e.project_id||e.project_id===project.project_id)&&
            (!taskProjects.has(e.task)||taskProjects.get(e.task)===project.project_id)).length,
          managed_roles_count:roles.filter(role=>role.project_id===project.project_id&&belongs(role.controller)).length,
          managed_workers_count:managed_panes.filter(p=>p.project_id===project.project_id&&p.live&&!p.role&&
            p.pane_id!==pane_id&&!controllerRefs.some(c=>sameRecipientAgent(c,p))&&belongs(p.controller)).length,
          active_tasks_count:ownedTasks.length,blocked_tasks_count:ownedTasks.filter(t=>t.state==='blocked').length,
          overridden_project:!!(metadata&&this.db.projectOverrideRecord(r,pane_id,metadata.terminal_id))};
      });
      const observed=unmanaged_live_agents.filter(a=>a.project_id===project.project_id&&!seenLive.has(a.pane_id)).map(ext=>({
        project_id:project.project_id,pane_id:ext.pane_id,live:true,observed:true,
        display_name:ext.display_name,kind:ext.kind,harness_label:ext.harness_label,model:undefined,effort:undefined,
        location_label:ext.location_label,workspace_label:ext.workspace_label,tab_label:ext.tab_label,cwd:ext.cwd,
        agent_status:ext.agent_status,managed:false,perm:undefined,native_perm:undefined,workspace_mode:undefined,
        native_workspace_mode:undefined,perm_mode:undefined,pending_restart:null,restarting:false,last_restart_error:null,
        paused:this.db.isPaused(r,ext.pane_id),typing:false,queued_count:0,managed_roles_count:0,managed_workers_count:0,
        active_tasks_count:0,blocked_tasks_count:0,
        overridden_project:!!this.db.projectOverrideRecord(r,ext.pane_id,ext.terminal_id),
      }));
      return [...explicit,...observed];
    });
    const visibleRecipients=new Set([...projects.flatMap(p=>p.controllers),...managed_panes.map(p=>p.pane_id),...unmanaged_live_agents.map(p=>p.pane_id)]);
    return {route:r,herdr:topology.herdr,managed_panes:managed,unmanaged_live_agents,projects,controller_views,roles,global_roles:readGlobalRoles(),project_filter:filter,
      current_project:current.project_id,tasks:all?tasks:tasks.filter(t=>!terminal(t.state)),
      queue:this.db.events(all).filter(pending),scheduled_retries:this.db.plans(all).filter(pending),
      paused_recipients:this.db.pausedPanes(r).filter(p=>!filter||visibleRecipients.has(p)),
      audit:this.db.logs().filter(event=>!filter||typeof event.task==='string'&&ids.has(event.task))};
  }

}
