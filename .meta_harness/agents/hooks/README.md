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
它在这次变更碰了产品源码、全局架构 `constraints.json` 或原 realization 的 `bindings.yaml`，且有要报告的读数时反馈。
新增偏离对 BASE 的预期判断，预期语义改动另列。机械范围归执行仓库的 `tools/ts-checks/src/arch/CONFORMANCE.md`。
同一分支上同一组读数只反馈一次；钩子自己出错从不拦人，只给用户一句警告。

命令先定跑哪一份脚本：会话所在的工作树里有这份脚本且装了依赖，跑它自己的；否则跑主检出里的那一份
（刚建的工作树还没装依赖，脚本在那里加载不了解析器）。量的总是会话所在的那棵工作树。不在 git 仓库里时命令直接退出 0。

**它只量收工那一刻会话当前目录所在的那一棵检出。**会话站在主检出里、按路径把文件写进另一棵工作树，钩子看到的是主检出——那里没有改动，于是不反馈。
这不靠工具补，靠纪律：`worktree-discipline` skill 规定一个会话只用一棵工作树，主 agent 建好就 `cd` 进去（第二条红线），在里面干活直到这个单元并入主线；
派出去的实施者也在这同一棵树里写，所以子代理收工时钩子量的也是它。

## 怎么生效

- 生成物落在工作区的 `.meta_harness/.claude/`、`.meta_harness/.codex/`，经根下的 `.claude`、`.codex`
  软链接暴露给宿主。编译与接入命令见 tooling；**编译不等于宿主已经加载**。
- Claude Code：交互会话里要先接受该目录的工作区信任；设置文件改了由宿主自动重载。
  会话从主检出启动再进工作树时，读的是哪一份设置，宿主文档没有说明。
  **见过的一次**（2026-10-02，负责人的交互会话）：会话开在主检出，建了一棵新工作树并在里面写了文件，收工时 `Stop` 钩子被调用了，
  脚本认到的仓库根是那棵新工作树。同一天的另一次：会话没有 `cd`、按路径写进新工作树，钩子同样被调用了，认到的是主检出，没有反馈
  （宿主记录里那次钩子 1.4 秒、无输出、无报错）。可见钩子拿到的当前目录跟着会话里的 `cd` 走。
  `SubagentStop`、警告怎样显示、Codex 一端都还没有在真实会话里见过。
- Codex：项目要受信任，且每条非托管钩子都要在 `/hooks` 里按定义逐条信任；定义一改就要重新信任。
- 核对宿主字段与行为时，按实际采用版本查官方 [Claude Code hooks](https://code.claude.com/docs/en/hooks) 与 [Codex hooks](https://developers.openai.com/codex/hooks) 文档。
  宿主升级后先核对字段及失败行为，再修改声明和生成物。

## 怎么关

- 临时关一次会话：环境变量 `OMNE_LOOP_HOOK=off`，脚本立即退出、什么都不做。
- 长期关：`tools/ts-checks/loop.config.json` 的 `hook.enabled` 置 `false`。
- 拿掉这条钩子：从 `hooks.yaml` 删掉它并重新编译。
