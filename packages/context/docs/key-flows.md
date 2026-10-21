# Context 组的协作入口

本页只放跨成员流程与按读者的阅读路径。单成员流程归各成员 `docs/flows.md`：契约成员写协议级流程，实现成员与 `-cordis` 成员写机制级流程。本页不复制提交、重试、恢复或状态协议。

## 跨成员流程

| 编号 | 流程 | 参与成员 | 唯一流程位置 |
| --- | --- | --- | --- |
| F-CX01 | 一次模型请求的上下文闭环 | runtime-context-contract、request-context-contract | 见[成员流程 F-RC03、F-RC04](../runtime-context-contract/docs/flows.md)与[成员流程 F-RQ01](../request-context-contract/docs/flows.md) |
| F-CX02 | 块变化到模型可见 | runtime-context-contract、request-context-contract | 见[成员流程 F-RC06](../runtime-context-contract/docs/flows.md)与[成员流程 F-RQ02](../request-context-contract/docs/flows.md) |
| F-CX03 | 压缩后重给快照 | request-context-contract、runtime-context-contract；触发者是作用域持有者（重签模型类读者的资格） | 见[成员流程 F-RQ03](../request-context-contract/docs/flows.md)与[成员流程 F-RC04](../runtime-context-contract/docs/flows.md) |

## 按读者选择阅读路径

| 读者 | 起点 | 接着读 | 读到这里就够 |
| --- | --- | --- | --- |
| 独立消费者：不建会话，直接用纯函数与端口 | [runtime-context-contract 消费说明](../runtime-context-contract/docs/context.md)、[request-context-contract 消费说明](../request-context-contract/docs/context.md) | 两个契约的 `SPEC.md` 与 `docs/public-api.md` | 知道输入、输出、失败与自己要提供的端口 |
| 作用域持有者：决定登记、签发资格、提交步 | [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md) | [成员流程](../runtime-context-contract/docs/flows.md) | 知道持有者面的操作与提交材料 |
| 生产者：声明并供给块 | [runtime-context-contract 对象模型](../runtime-context-contract/docs/object-model.md) | [runtime-context-cordis-contract Cordis 说明](../runtime-context-cordis-contract/docs/cordis.md) | 知道块声明怎么写、怎么登记、卸载时怎样撤除 |
| 消费者契约作者：在自己的定义里声明需要 | [runtime-context-contract 对象模型](../runtime-context-contract/docs/object-model.md) | [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md) | 知道需要以自己的形状声明，绑定与翻译归集成方 |
| 协调者适配器作者：把上层端口翻译到纯操作 | [request-context-contract 消费说明](../request-context-contract/docs/context.md) | [request-context-contract SPEC](../request-context-contract/SPEC.md)、[对象模型](../request-context-contract/docs/object-model.md) | 知道四种结果、三类失败、计划进度与锚点怎样往返 |
| 实现者 | [runtime-context 架构](../runtime-context/docs/architecture.md)、[request-context 架构](../request-context/docs/architecture.md) | 两个实现成员的 `SPEC.md` 与 `docs/flows.md` | 知道表、缓存、失效条件与默认策略 |
| 装配者 | [runtime-context-cordis Cordis 说明](../runtime-context-cordis/docs/cordis.md)、[request-context-cordis Cordis 说明](../request-context-cordis/docs/cordis.md) | [IC 约定](../../../docs/architecture/cordis-integration-conventions.md) | 知道服务键、intercept 配置、依赖与撤除方式 |
