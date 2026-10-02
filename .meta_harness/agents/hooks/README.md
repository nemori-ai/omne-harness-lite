# 宿主钩子的源

[`hooks.yaml`](hooks.yaml) 是宿主无关的钩子声明，编译工具（[tooling](../../tooling/README.md#agent-编译)）
把它生成为两端的项目级钩子文件：Claude Code 的 `.claude/settings.json`（只有 `hooks` 一段）与
Codex 的 `.codex/hooks.json`。两端在 `Stop`、`SubagentStop` 上读同一个形状：
事件名 → 若干组 `{"matcher"?, "hooks": [{"type": "command", "command", "timeout"}]}`；
`Stop` 一组不带 matcher，`SubagentStop` 一组的 matcher 是子代理类型名用 `|` 连起来。
生成物不手改；没有 `hooks.yaml` 或列表为空时不产出这两个文件。

现在只有一条：`loop-stop-facts`，在会话收工（`Stop`）与 developer、verification-developer、
tui-developer 子代理收工（`SubagentStop`）时跑执行仓库的收工钩子（`tools/ts-checks/src/loop/stop-hook.ts`，
说明在 `tools/ts-checks/README_ZH.md`「收工钩子」一节）。
它只在这次变更碰了 `packages/`、`apps/` 的产品源码、且有要解释的红项时，把那几条读数作为事实反馈回去，
同一分支上同一组读数只反馈一次；钩子自己出错从不拦人。

## 怎么生效

- 生成物落在工作区的 `.meta_harness/.claude/`、`.meta_harness/.codex/`，经根下的 `.claude`、`.codex`
  软链接暴露给宿主。编译与接入命令见 tooling；**编译不等于宿主已经加载**。
- Claude Code：交互会话里要先接受该目录的工作区信任；设置文件改了由宿主自动重载。
  会话从主检出启动再进工作树时，读的是哪一份设置，宿主文档没有说明。
- Codex：项目要受信任，且每条非托管钩子都要在 `/hooks` 里按定义逐条信任；定义一改就要重新信任。
- 字段与行为的出处：研究[收工钩子：两个宿主在收工点能做什么、不能做什么](../../research/host-stop-hooks/README.md)
  （Claude Code 2.1.287、Codex CLI 0.159.0，2026-10-01 取证，没有实际触发过钩子）与 Codex 文档 Hooks 页「Config shape」一节。
  宿主升级后先回那里重新核对，再改这里。

## 怎么关

- 临时关一次会话：环境变量 `OMNE_LOOP_HOOK=off`，脚本立即退出、什么都不做。
- 长期关：`tools/ts-checks/loop.config.json` 的 `hook.enabled` 置 `false`。
- 拿掉这条钩子：从 `hooks.yaml` 删掉它并重新编译。
