# 跨 Harness Workflow Skill（v3.6）

[`cross-harness-flow/`](./cross-harness-flow/) 是纯文档 Skill，通过 `chflow` 与 [Herdr](https://github.com/herdrdev/herdr) 协同 Pi、Codex、Claude Code 和 Antigravity。CLI、项目级 MCP 与随 Daemon 常驻的纯黑白极简 Web 控制台共享懒启动的 Daemon；任务正文经工作区 `.chflow/` 信箱交接。

- [Skill 入口](./cross-harness-flow/SKILL.md)：四层工作流架构、全局/项目角色懒实例化、高自主默认推导、五档权限与恢复流程。
- [操作手册](./cross-harness-flow/references/operations.md)：全局模板、五档权限与 `--workspace-mode`、免提权及跨机安装、命令速查、项目级 MCP 模板和排障。
- [Skill 分发包](./cross-harness-flow.skill)：ZIP，仅含同名目录下的 `SKILL.md` 与 `references/operations.md`。解包后把该目录交给宿主的 Skill 加载器。
- [chflow npm 包](../packages/chflow/README.md)：Node.js 22.13.0+，交互工位使用 Herdr 0.9.5+。运行时和 Skill 分开安装。

首次使用前检查 `command -v chflow`；若缺失，确认后按操作手册安装到用户目录。用 `chflow` 查看实时全局状态与 Web 控制台地址，`chflow role --global` 沉淀全局角色模板，`chflow role set/bind` 在项目内懒实例化并热替换底层会话，`chflow health` 检查实时在线工位，`chflow adopt` 接入存量会话，`chflow handoff` 移交控制权及排队回执，`chflow prune` 清理已关闭窗格，`chflow stop` / `quit` 显式停机。长耗时活跃工位在触发 `stalled` 前会自动进行双采样活体复核；聚焦窗格有打字或草稿时暂缓唤醒，`chflow inbox` 查看积压，`chflow flush` 拉取摘要。跨机另行验证共享信箱和回程。

v2 的 Python 脚本、旧单元测试和评测案例见 [`legacy/v2/`](../legacy/v2/)，仅供查阅。v3 验收入口为 `packages/chflow/` 下的 `npm run test:e2e`。
