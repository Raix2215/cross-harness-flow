import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { Delivery, ManagedPane, Project, Role, Route, Task } from './types.js';
import { pendingDeliveryStates, routeKey, terminal } from './types.js';

const pendingEvents='state IN ('+[...pendingDeliveryStates,'delivering'].map(state=>"'"+state+"'").join(',')+')';
export class Store {
  private db: DatabaseSync;
  private transactionChanges: number|undefined;
  constructor(root: string, private onChange: (count: number)=>void) {
    this.db=new DatabaseSync(join(root,'state.sqlite3'));
    this.db.exec(`
      PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS tasks (task TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS deliveries (event_id TEXT PRIMARY KEY, task TEXT NOT NULL, attempt TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS deliveries_pending ON deliveries(state);
      CREATE INDEX IF NOT EXISTS deliveries_task ON deliveries(task,attempt);
      CREATE TABLE IF NOT EXISTS paused_recipients (route TEXT NOT NULL, pane TEXT NOT NULL, PRIMARY KEY (route, pane));
      CREATE TABLE IF NOT EXISTS scheduled_retries (task TEXT PRIMARY KEY, attempt TEXT NOT NULL, at INTEGER NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS panes (route TEXT NOT NULL, pane TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (route,pane));
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS project_overrides (route TEXT NOT NULL, pane TEXT NOT NULL, terminal TEXT NOT NULL, project TEXT NOT NULL, PRIMARY KEY (route,pane));
      CREATE TABLE IF NOT EXISTS roles (project TEXT NOT NULL, role TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (project,role));
      CREATE TABLE IF NOT EXISTS audit (at INTEGER NOT NULL, task TEXT, event TEXT NOT NULL, detail TEXT);
    `);
  }
  transaction<T>(fn:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    this.transactionChanges=0;
    let value:T;
    try { value=fn(); this.db.exec('COMMIT'); }
    catch(e) { this.transactionChanges=0; this.db.exec('ROLLBACK'); throw e; }
    finally {
      const changes=this.transactionChanges;
      this.transactionChanges=undefined;
      if(changes) this.onChange(changes);
    }
    return value;
  }
  private changed({changes}:{changes:number|bigint}) {
    if(!changes) return;
    if(this.transactionChanges===undefined) this.onChange(Number(changes));
    else this.transactionChanges+=Number(changes);
  }
  private decode<T>(row: Record<string, unknown>|undefined):T|undefined { return row ? JSON.parse(String(row.data)) : undefined; }
  task(id: string) {return this.decode<Task>(this.db.prepare('SELECT data FROM tasks WHERE task=?').get(id));}
  tasks() {return this.db.prepare('SELECT data FROM tasks ORDER BY rowid').all().map(r=>this.decode<Task>(r)!);}
  save(task: Task) {this.changed(this.db.prepare('INSERT INTO tasks VALUES(?,?) ON CONFLICT(task) DO UPDATE SET data=excluded.data WHERE tasks.data<>excluded.data').run(task.task,JSON.stringify(task)));}
  delivery(e: Delivery) {this.changed(this.db.prepare('INSERT INTO deliveries VALUES(?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET state=excluded.state,data=excluded.data WHERE deliveries.data<>excluded.data').run(e.event_id,e.task,e.attempt,e.state,JSON.stringify(e)));}
  events(all=false,task?:string) {
    const where=task ? ` WHERE task=?${all?'':` AND ${pendingEvents}`}` : all?'':` WHERE ${pendingEvents}`;
    const q=this.db.prepare('SELECT data FROM deliveries'+where+' ORDER BY rowid');
    return (task?q.all(task):q.all()).map(r=>this.decode<Delivery>(r)!);
  }
  event(id:string) {return this.decode<Delivery>(this.db.prepare('SELECT data FROM deliveries WHERE event_id=?').get(id));}
  setPaused(route:Route,pane:string,paused:boolean) {
    const sql=paused?'INSERT OR IGNORE INTO paused_recipients VALUES(?,?)':'DELETE FROM paused_recipients WHERE route=? AND pane=?';
    this.changed(this.db.prepare(sql).run(routeKey(route),pane));
  }
  isPaused(route:Route,pane:string) {
    return !!this.db.prepare('SELECT 1 FROM paused_recipients WHERE route=? AND pane=?').get(routeKey(route),pane);
  }
  pausedPanes(route:Route) {
    return this.db.prepare('SELECT pane FROM paused_recipients WHERE route=? ORDER BY pane').all(routeKey(route)).map(row=>String(row.pane));
  }
  schedule(t: Task, at: number) {
    this.changed(this.db.prepare("INSERT INTO scheduled_retries VALUES(?,?,?,'pending') ON CONFLICT(task) DO UPDATE SET attempt=excluded.attempt,at=excluded.at,state='pending'").run(t.task,t.attempt,at));
  }
  scheduleState(t:Task, state:string) {this.changed(this.db.prepare("UPDATE scheduled_retries SET state=? WHERE task=? AND attempt=? AND state IN ('pending','running') AND state<>?").run(state,t.task,t.attempt,state));}
  plans(all=false) {return this.db.prepare('SELECT * FROM scheduled_retries'+(all?'':" WHERE state IN ('pending','running')")+' ORDER BY at').all();}
  pane(route:Route,pane:string) {return this.decode<ManagedPane>(this.db.prepare('SELECT data FROM panes WHERE route=? AND pane=?').get(routeKey(route),pane));}
  panes() {return this.db.prepare('SELECT data FROM panes ORDER BY rowid').all().map(r=>this.decode<ManagedPane>(r)!);}
  savePane(p:ManagedPane) {
    const {pane_id,terminal_id,name,agent:kind,cwd,foreground_cwd,agent_session,workspace_id,tab_id,revision,state_change_seq,agent_status}=p.agent;
    this.changed(this.db.prepare('INSERT INTO panes VALUES(?,?,?) ON CONFLICT(route,pane) DO UPDATE SET data=excluded.data WHERE panes.data<>excluded.data').run(routeKey(p.route),pane_id,JSON.stringify({...p,agent:{pane_id,terminal_id,name,agent:kind,cwd,foreground_cwd,agent_session,workspace_id,tab_id,revision,state_change_seq,agent_status}})));
  }
  removePane(p:ManagedPane) {
    this.changed(this.db.prepare('DELETE FROM panes WHERE route=? AND pane=?').run(routeKey(p.route),p.agent.pane_id));
  }
  project(id:string) {return this.decode<Project>(this.db.prepare('SELECT data FROM projects WHERE id=?').get(id));}
  projects() {return this.db.prepare('SELECT data FROM projects ORDER BY id').all().map(row=>this.decode<Project>(row)!);}
  saveProject(p:Project) {
    this.changed(this.db.prepare('INSERT INTO projects VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE projects.data<>excluded.data').run(p.project_id,JSON.stringify(p)));
  }
  projectOverride(route:Route,pane:string,terminal:string) {
    return this.db.prepare('SELECT project FROM project_overrides WHERE route=? AND pane=? AND terminal=?')
      .get(routeKey(route),pane,terminal)?.project as string|undefined;
  }
  assignProject(route:Route,pane:string,terminal:string,project:string) {
    this.changed(this.db.prepare('INSERT INTO project_overrides VALUES(?,?,?,?) ON CONFLICT(route,pane) DO UPDATE SET terminal=excluded.terminal,project=excluded.project')
      .run(routeKey(route),pane,terminal,project));
  }
  role(project:string,name:string) {
    return this.decode<Role>(this.db.prepare('SELECT data FROM roles WHERE project=? AND role=?').get(project,name));
  }
  roles() {
    return this.db.prepare('SELECT data FROM roles ORDER BY project,role').all().map(row=>this.decode<Role>(row)!);
  }
  saveRole(r:Role) {
    this.changed(this.db.prepare('INSERT INTO roles VALUES(?,?,?) ON CONFLICT(project,role) DO UPDATE SET data=excluded.data WHERE roles.data<>excluded.data')
      .run(r.project_id,r.role,JSON.stringify(r)));
  }
  removeRole(r:Role) {
    this.changed(this.db.prepare('DELETE FROM roles WHERE project=? AND role=?').run(r.project_id,r.role));
  }
  pruneTasks(tasks:Task[]) {
    const pending=new Set(this.events().map(event=>event.task));
    const candidates=tasks.filter(t=>terminal(t.state)&&!pending.has(t.task));
    const removeTask=this.db.prepare('DELETE FROM tasks WHERE task=?');
    const removePlan=this.db.prepare('DELETE FROM scheduled_retries WHERE task=?');
    this.transaction(()=>{
      for(const {task} of candidates){
        this.changed(removeTask.run(task));
        this.changed(removePlan.run(task));
      }
    });
    return candidates.length;
  }
  audit(task:string|null,event:string,detail?:string) {this.changed(this.db.prepare('INSERT INTO audit VALUES(?,?,?,?)').run(Date.now(),task,event,detail??null));}
  logs(task?:string) {
    const q=this.db.prepare('SELECT rowid AS id, * FROM audit'+(task?' WHERE task=?':'')+' ORDER BY rowid DESC LIMIT 100');
    return task?q.all(task):q.all();
  }
  close() {this.db.close();}
}
