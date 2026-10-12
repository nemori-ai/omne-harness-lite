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
它核对产品源码、全局架构约束及其引用的 Markdown 依据，有要报告的读数时反馈。触发与基线选择以执行仓库的工具为准。
新增偏离对 BASE 的预期判断，预期语义改动另列。机械范围归执行仓库的 `tools/ts-checks/src/arch/CONFORMANCE.md`。
同一分支上同一组读数只反馈一次；钩子自己出错从不拦人，只给用户一句警告。

命令先选择有脚本与依赖的检出，否则回退到主检出脚本。实际受检根来自事件payload.cwd；不能从脚本位置或单次工具workdir推断受检候选。回退脚本的配置可能仍按脚本位置读取，去重状态按git common目录或OMNE_METRICS_HOME保存。精确分工归[工具说明](../../../tools/ts-checks/README_ZH.md#收工钩子)。不在Git仓库里时命令退出0，这不证明检查已发生。

独立任务允许各写者使用隔离工作树，共享对象仍单写，具体条件归[协作交接](../../../docs/engineering/workflow.md#责任与协作交接)。每个写者须核对宿主传入的真实cwd与自己的检出；按绝对路径写别树、设置exec的workdir或源码重新生成，都不能证明hook观察已切换。原生宿主调用未核实的部分继续报告未覆盖，不以单树禁令代替证据。

## 怎么生效

- 生成物落在工作区的 `.meta_harness/.claude/`、`.meta_harness/.codex/`，经根下的 `.claude`、`.codex`
  软链接暴露给宿主。编译与接入命令见 tooling；**编译不等于宿主已经加载**。
- Claude Code：交互会话里要先接受该目录的工作区信任；设置文件改了由宿主自动重载。
  会话从主检出启动再进工作树时，读的是哪一份设置，宿主文档没有说明。
- Codex：项目要受信任，且每条非托管钩子都要在 `/hooks` 里按定义逐条信任；定义一改就要重新信任。
- 核对宿主字段与行为时，按实际采用版本查官方 [Claude Code hooks](https://code.claude.com/docs/en/hooks) 与 [Codex hooks](https://developers.openai.com/codex/hooks) 文档。
  宿主升级后先核对字段及失败行为，再修改声明和生成物。

Claude Code 与 Codex 的 `Stop` 已有真实会话执行证据，包括本工作树的 Codex 正常事实反馈。证据只支持当次宿主、事件与受检工作树，不证明所有隔离执行者或 `SubagentStop` 已接通。只按绝对路径写另一棵树，不能使宿主的真实 cwd 自动切换。

命令重放可核对输入、输出和去重，但不能代替原生事件的重复调度、耗时和警告显示验证。单次运行记录留任务 `tmp`；更换宿主、版本或检出后，按实际事件重新核对。

## 怎么关

- 临时关一次会话：环境变量 `OMNE_LOOP_HOOK=off`，脚本立即退出、什么都不做。
- 长期关：`tools/ts-checks/loop.config.json` 的 `hook.enabled` 置 `false`。
- 拿掉这条钩子：从 `hooks.yaml` 删掉它并重新编译。

采用多层集成后，测量入口按实际 cwd 工作树读取共同 context；不从另一个树借 taskBase 或 targetBase。缺输入报告 unknown/error，pending 保持原读法。规则归执行仓库 `docs/engineering/integration.md`；生成和静态检查不证明宿主实际执行。
