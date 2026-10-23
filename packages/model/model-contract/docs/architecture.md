# Model 领域契约架构

本成员拥有跨实现稳定的领域值、操作和行为协议。精确声明见 [public-api](public-api.md)，不按每个端口另建包。

## 依赖与职责

调用方、组装方、独立程序及提供者作者消费本成员。调用、档案、准备、转换、计量和持久化端口共享身份及回执，但调用者只取得所需能力。接口存在不授予业务权限。

纯契约可以包含必要的确定性校验、编解码和比较函数，不创建运行实例，不调度、读环境或执行 I/O。共享消息、内容、身份、JSON 和账目值沿原拥有者引用，不复制类型。共同 `Outcome` 从 `operation-result` 根入口取得，完整安装依赖的要求见[组架构](../../docs/architecture.md#安装闭包与共同依赖前置)。

新增[结果交付](../SPEC.md#结果推送与保存)继续复用 ConsumerRef、DurableEvidence、原 handoff/query 与 dispatches，不增加 Model 保管账本。公共观察的引用、游标和帧归 [stream-arrival](../../../common/stream-arrival/README.md#public-observation-contract)，本包只拥有 [Model 投影与 current](../SPEC.md#公共内容观察与当前目标)。公共层不依赖 Model 或 Tool，本包不取得 Agent 内部材料/日志编码或 Tool 投影规范化的所有权。接口采用、声明可消费与真实提供者实现按[交付边界](../SPEC.md#推送与公共观察的交付边界)分别核对。

## 实现与装配

[model](../../model/docs/architecture.md)拥有可复用协调算法，工厂配置与执行函数留在该成员。[Cordis 定义](../../model-cordis-contract/docs/architecture.md)拥有框架键及登记机制，具体宿主尚未初始化。任何实现都须满足本包 [SPEC](../SPEC.md)，内部算法不成为所有提供者必须采用的类结构。
