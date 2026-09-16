# D-013：Run 驱动器的 Cordis 边界

- 状态：旧谱系提供者设计方向已接受；新 provider 的具体接口、实现和生命周期证据仍须另行验收。
- 来源：`e3573ca72d18bfe7ddd002df5025551b51eede46:docs/decisions/D-013-run-driver-cordis-boundary.md`，SHA-256 `03296e998511ac2911bb9cdabbc990e62e6adb5dac0059f2f73116c39b4f4578`；来源提案为同修订 `docs/proposals/agent-loop-inbound/cordis.md` 与其入口接受记录。
- 接受依据：2026-09-14，任务作者接受与 D-012 同一设计的 Cordis 运行位置、效应和责任；原精确契约是 `run-driver@1` 与 `session-run@2`，需求消费基线同 D-012。

## 保留的选择

驱动器由 Factory 为每个活体实例准备和拥有；纯 `decide` 不成为独立全局状态权威。贡献登记、实例工作许可、投影与订阅各有装载效应和撤除完成条件；Yield 结算实例许可而不结算 Run。[Agent Run Driver provider](../../providers/agent-run-driver/design.md)负责把这些选择映射到具体生命周期。

活体 Agent 的准备/退出和工作许可、共同准入的 epoch/checkWork、Run 的 Yield/重取及调用级绑定各在自己边界承担责任。配置在相应工作边界重评；实例存续必需绑定变化走关闭/Yield/重取，操作必需条件变化走 `waiting_gate`，调用级绑定沿[Tools](../../spec/capabilities/tools/v1/contract.md)收口。驱动升级重取须有兼容证据，不能静默把旧 Run 迁给不兼容驱动。[RunDriver](../../spec/capabilities/run-driver/v1/contract.md)和[生命周期组合](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)拥有当前语义。

## 取代与限制

[D-014](../session-run-agent-lifecycles/decision.md)仅取代旧 provider 依赖表中 `session-run@2` 的引用；实例驱动、成对装卸和边界责任继续有效。[D-015](../tool-execution-message-stream-hooks/decision.md)随后修改了 Run/工具等待及驱动切点，provider 必须消费当前候选条款而非旧版本形状。旧决定留下的服务键、注入接口和兼容性声明曾是待闭合设计项；当前文件存在不等于其真实卸载、清理失败、依赖换代和崩溃恢复已获符合性证据。
