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

命令先选择有脚本与依赖的检出，否则回退到主检出脚本。实际受检根来自事件payload.cwd；不能从脚本位置或单次工具workdir推断受检候选。回退脚本的配置可能仍按脚本位置读取，去重状态按git common目录或OMNE_METRICS_HOME保存。精确分工归[工具说明](../../../tools/ts-checks/README_ZH.md#收工钩子)。不在Git仓库里时命令退出0，这不证明检查已发生。

独立任务允许各写者使用隔离工作树，共享对象仍单写，具体条件归[协作交接](../../../docs/engineering/workflow.md#责任与协作交接)。每个写者须核对宿主传入的真实cwd与自己的检出；按绝对路径写别树、设置exec的workdir或源码重新生成，都不能证明hook观察已切换。原生宿主调用未核实的部分继续报告未覆盖，不以单树禁令代替证据。

## 怎么生效

- 生成物落在工作区的 `.meta_harness/.claude/`、`.meta_harness/.codex/`，经根下的 `.claude`、`.codex`
  软链接暴露给宿主。编译与接入命令见 tooling；**编译不等于宿主已经加载**。
- Claude Code：交互会话里要先接受该目录的工作区信任；设置文件改了由宿主自动重载。
  会话从主检出启动再进工作树时，读的是哪一份设置，宿主文档没有说明。
  **见过的一次**（2026-10-02，负责人的交互会话）：会话开在主检出，建了一棵新工作树并在里面写了文件，收工时 `Stop` 钩子被调用了，
  脚本认到的仓库根是那棵新工作树。同一天的另一次：会话没有 `cd`、按路径写进新工作树，钩子同样被调用了，认到的是主检出，没有反馈
  （宿主记录里那次钩子 1.4 秒、无输出、无报错）。这些记录只支持当次宿主和事件的观察，不证明所有宿主或子代理随工具目录切换。
  `SubagentStop`、警告怎样显示、Codex 一端都还没有在真实会话里见过。
- Codex：项目要受信任，且每条非托管钩子都要在 `/hooks` 里按定义逐条信任；定义一改就要重新信任。
- 核对宿主字段与行为时，按实际采用版本查官方 [Claude Code hooks](https://code.claude.com/docs/en/hooks) 与 [Codex hooks](https://developers.openai.com/codex/hooks) 文档。
  宿主升级后先核对字段及失败行为，再修改声明和生成物。

## 怎么关

- 临时关一次会话：环境变量 `OMNE_LOOP_HOOK=off`，脚本立即退出、什么都不做。
- 长期关：`tools/ts-checks/loop.config.json` 的 `hook.enabled` 置 `false`。
- 拿掉这条钩子：从 `hooks.yaml` 删掉它并重新编译。
