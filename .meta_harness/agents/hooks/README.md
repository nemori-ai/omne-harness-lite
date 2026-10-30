# 宿主钩子的源

[`hooks.yaml`](hooks.yaml) 是宿主无关的钩子声明，编译工具（[tooling](../../tooling/README.md#agent-编译)）
把它生成为两端的项目级钩子文件：Claude Code 的 `.claude/settings.json`（只有 `hooks` 一段）与
Codex 的 `.codex/hooks.json`。两端读同一个形状：
事件名 → 若干组 `{"matcher"?, "hooks": [{"type": "command", "command", "timeout"}]}`。
`Stop` 一组不带 matcher。`SubagentStop` 一组的 matcher 是子代理类型名用 `|` 连起来。
`SessionStart` 一组的 matcher 是 `session_sources` 用 `|` 连起来，Claude Code 拿它比对输入里的 `source`。
一条声明可以用 `hosts` 只给部分宿主。省略 `hosts` 时给全部宿主。
`SessionStart` 只为 Claude Code 生成，所以用它的声明必须写 `hosts: [claude-code]`。
生成物不手改。没有 `hooks.yaml`、列表为空或没有声明给某个宿主时，不产出那个宿主的文件。

## `loop-stop-facts`

它在会话收工（`Stop`）与 developer 子代理收工（`SubagentStop`）时跑执行仓库的收工钩子（`tools/repo-toolchain/src/loop/stop-hook.ts`，
说明在 `tools/repo-toolchain/README_ZH.md`「收工钩子」一节）。
它核对产品源码、全局架构约束及其引用的 Markdown 依据，有要报告的读数时反馈。触发与基线选择以执行仓库的工具为准。
新增偏离对 BASE 的预期判断，预期语义改动另列。机械范围归执行仓库的 `tools/repo-toolchain/src/arch/CONFORMANCE.md`。
同一分支上同一组读数只反馈一次；钩子自己出错从不拦人，只给用户一句警告。

命令先选择有脚本与依赖的检出，否则回退到主检出脚本。实际受检根来自事件payload.cwd；不能从脚本位置或单次工具workdir推断受检候选。回退脚本的配置可能仍按脚本位置读取，去重状态按git common目录或OMNE_METRICS_HOME保存。精确分工归[工具说明](../../../tools/repo-toolchain/README_ZH.md#收工钩子)。不在Git仓库里时命令退出0，这不证明检查已发生。

## `stale-skill-copies`

它只给 Claude Code，在新会话（`startup`）与压缩之后（`compact`）运行。
Claude Code 在会话第一次读写某个子目录里的文件时，加载那个子目录的 `.claude/skills/`。
所以从主检出启动的会话可以读到 `.worktrees/` 下其他工作树里的技能副本。
压缩之后，宿主还会重新附上已调用过的技能。这两种情形都可能让会话读到旧副本。
钩子运行 [`stale-skills.mjs`](../../tooling/src/stale-skills.mjs)，只读地列出主检出 `.worktrees/` 下有技能投影（`.claude/skills/`）的工作树。
满足下面任一条件的工作树进入提醒：

- 它的分支已删除。
- 它的 HEAD 是主检出当前 HEAD 的真祖先（已合入，或从更旧的基线建出且没有自己的提交）。HEAD 与主检出相同的不算。
- Git 不再登记这个目录为工作树。

会话自己所在的检出不进入提醒。有要提醒的工作树时，钩子在标准输出打印一行：
「技能请从当前检出加载；以下工作树里的技能副本可能过期：…」，每项带原因。
Claude Code 把这行加进会话上下文。没有要提醒的工作树时，钩子什么都不打印。
钩子不删任何东西。钩子自己出错时什么都不打印，并退出 0。当前检出没有这份脚本时，运行主检出里的那一份。

Claude Code 的技能发现没有按目录排除的设置。`skillOverrides` 与 `Skill(...)` 拒绝规则只按技能名生效，会同时隐藏当前检出里的同名技能。
所以这里只给提醒，不改工作树的目录布局。

## 隔离工作树与钩子观察

独立任务允许各写者使用隔离工作树，共享对象仍单写，具体条件归[协作交接](../../../docs/engineering/workflow.md#责任与协作交接)。每个写者须核对宿主传入的真实cwd与自己的检出；按绝对路径写别树、设置exec的workdir或源码重新生成，都不能证明hook观察已切换。原生宿主调用未核实的部分继续报告未覆盖，不以单树禁令代替证据。

## 怎么生效

- 生成物落在工作区的 `.meta_harness/.claude/`、`.meta_harness/.codex/`，经根下的 `.claude`、`.codex`
  软链接暴露给宿主。编译与接入命令见 tooling；**编译不等于宿主已经加载**。
- Claude Code：交互会话里要先接受该目录的工作区信任；设置文件改了由宿主自动重载。
  会话从主检出启动再进工作树时，读的是哪一份设置，宿主文档没有说明。
- Codex：项目要受信任，且每条非托管钩子都要在 `/hooks` 里按定义逐条信任；定义一改就要重新信任。
- 核对宿主字段与行为时，按实际采用版本查官方 [Claude Code hooks](https://code.claude.com/docs/en/hooks) 与 [Codex hooks](https://developers.openai.com/codex/hooks) 文档。
  宿主升级后先核对字段及失败行为，再修改声明和生成物。

`SessionStart`（`stale-skill-copies`）有夹具测试与生成物核对，还没有真实会话里的执行证据。

Claude Code 与 Codex 的 `Stop` 已有真实会话执行证据，包括本工作树的 Codex 正常事实反馈。证据只支持当次宿主、事件与受检工作树，不证明所有隔离执行者或 `SubagentStop` 已接通。只按绝对路径写另一棵树，不能使宿主的真实 cwd 自动切换。

命令重放可核对输入、输出和去重，但不能代替原生事件的重复调度、耗时和警告显示验证。单次运行记录留任务 `tmp`；更换宿主、版本或检出后，按实际事件重新核对。

## 怎么关

- `loop-stop-facts` 临时关一次会话：环境变量 `OMNE_LOOP_HOOK=off`，脚本立即退出、什么都不做。
- 长期关：`tools/repo-toolchain/loop.config.json` 的 `hook.enabled` 置 `false`。
- 拿掉 `loop-stop-facts`：从 `hooks.yaml` 删掉它并重新编译。
- `stale-skill-copies` 没有开关变量。要拿掉它，从 `hooks.yaml` 删掉它并重新编译。

测量入口按实际 cwd 工作树读取 task context，不从另一个树借 taskBase 或 targetBase。缺输入报告 unknown/error；没有 task context（pending）时按[收工钩子的基线规则](../../../tools/repo-toolchain/README_ZH.md#收工钩子)读取：主线与活跃集成轨道里离 HEAD 最近的合并点。规则归执行仓库 `docs/engineering/integration.md`；生成和静态检查不证明宿主实际执行。

## Cursor native adapter

Cursor 消费同一 hooks.yaml 里给它的声明（`hosts` 省略或含 `cursor`），cursor.yaml 拥有 native loop_limit。生成器输出 stop/subagentStop 和包内 bridge，协议、目标根与诊断边界归 [tooling](../../tooling/README.md#cursor-hook-协议)。不能直接复制旧宿主 decision/block 输出。CLI/IDE 用项目视图或单份原生插件，Cloud 由 setup 先生成项目视图；不依赖 SessionStart 或用户 hooks。真实原生执行与命令重放分别报告。
