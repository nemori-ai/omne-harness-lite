# 外部命令式 hooks 兼容

**当前正式契约为 [capability.external-hooks v1](v1/contract.md)**，接受依据
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)。这是该身份的
首个版本，没有被取代的前身。精确版本、状态与接受依据以 [catalog](../../catalog.json) 为准。

本能力把 [PF-025](../../../docs/requirements/product/agent/PF-025-external-hooks-compatibility.md)
的兼容承诺固定为精确契约：用户以 Claude Code 或 Codex 的事件名、配置形状与 stdin/stdout JSON
协议写的 hook，在本系统的哪个站点运行、取得哪些效果、哪些效果降级、哪些不支持，以及每次
运行的主体、来源与失败怎样可辨认。进程内扩展点是权威，命令式 hook 是它的一个适配器；兼容
不扩大 [run-driver v3](../run-driver/v3/contract.md) 与 [tools v2](../tools/v2/contract.md) 给出的
扩展点权力。本能力不拥有队列、调用、请求或 Run 的状态权威，也不新建第二套事件机制。

| 对象 | 当前状态与依据 |
|---|---|
| 设计与规格 | v1 由 D-015 接受；来源为 [hooks 兼容提案](../../../docs/proposals/hooks-compat/README.md)（[事件映射与机制](../../../docs/proposals/hooks-compat/mapping.md)、[需求覆盖](../../../docs/proposals/hooks-compat/requirements.md)、[独立评审与处置](../../../docs/proposals/hooks-compat/review.md)），上游事实依据为[六系统循环、事件与 hooks 研究](../../../docs/research/agent-loop-events-and-hooks/README.md) |
| 形式模型 | 无。本能力不建自己的 TLA+ 模型；扩展点权力上界与站点义务的模型证据由 tools v2 与 run-driver v3 的模型间接承担，未覆盖项见[验证范围](verification.md) |
| 目标实现 | 尚未开始。提供者候选为新包 `packages/agent/hooks-compat`：一个 command runner、一个站点适配器与两个配置装载器（Claude Code settings 形状、Codex `hooks.json` 与 `config.toml [hooks]`） |

[规范场景](v1/scenarios.md)列出提供者验收条件。设计接受、模型检查与实现验收分别记录；本页
不代替精确契约。

## 提供者映射提示（非规范）

契约只写语言无关的扩展点义务，具体服务键与登记形状归提供者设计。当前候选映射为：S1 的到达
守卫为 `omneSession.registerArrivalGuard`；S5 的执行守卫为
`omneTools.registerGuard({site: 'pre_execute'})`；S7 的投影选择器为
`omneTools.registerProjectionSelector({site: 'post_execute'})`；S8、S9 与旁路 B 的观察者消费
`records.envelope.committed` 广播；`PermissionRequest` 的程序化作答登记为
[human-decisions v2](../human-decisions/v2/contract.md) 的受信作答者。插件 ready 的条件是全部
登记成功且 command runner 可用；任一扩展点不可用即不 ready 并写
`hooks.config.rejected{guard_unavailable}`。这些键是可变实现映射，不是契约义务；契约义务见
[v1 契约](v1/contract.md) 的 HK-04 与 HK-05。
