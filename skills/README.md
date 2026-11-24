# cross-harness-flow Skill（v3.3）

[`cross-harness-flow/`](./cross-harness-flow/) 是纯文档 Skill，通过 `chflow` 与 [Herdr](https://github.com/herdrdev/herdr) 协同 Pi、Codex、Claude Code 和 Antigravity。CLI、项目级 MCP 与随 Daemon 常驻的 Web 控制台共享懒启动的每用户 Daemon；任务正文经工作区 `.chflow/` 信箱交接。

- [Skill 入口](./cross-harness-flow/SKILL.md)：派发门禁、权限分级、项目角色与会话热替换、回执与恢复流程。
- [操作手册](./cross-harness-flow/references/operations.md)：免提权及跨机离线安装、完整命令速查、项目级 MCP 模板和排障顺序。
- [Skill 分发包](./cross-harness-flow.skill)：标准化 ZIP，仅含 `cross-harness-flow/SKILL.md` 与 `cross-harness-flow/references/operations.md`。解包后交给宿主的 Skill 加载器即可。
- [chflow 运行时](../packages/chflow/README.md)：Node.js **22.13.0+**，零第三方运行时依赖；交互多工位编排依赖 [Herdr](https://github.com/herdrdev/herdr) **0.9.5+**。

首次使用前先检查 `command -v chflow`；缺失时按 [操作手册](./cross-harness-flow/references/operations.md) 用户级安装。用 `chflow` 查看实时状态与内置 Web 控制台链接，用 `chflow role` 管理项目固定角色，用 `chflow health` 检查实时在线工位，用 `chflow prune` 清理已关闭窗格。验收入口为 `packages/chflow/` 下的 `npm run test:e2e`。
