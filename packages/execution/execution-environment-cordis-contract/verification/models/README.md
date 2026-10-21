# verification/models

本目录承载本包的形式模型，例如 TLA+、Alloy 或 SMT 模型。

## 允许的内容

模型源文件、配置与说明。

## 边界

说明模型对应的 `SPEC.md` 性质、抽象前提与未覆盖的部分。模型通过不等于实现符合。

## 维护

承诺或实现结构变化时，复核模型的抽象是否仍然成立。

## 本包事实

现在为空，本成员没有形式模型。本成员只定义服务形状，没有状态机或并发逻辑。退役与关闭的次序由 Service 实现与登记表机制实现，相关模型归 [execution-environment-host-local](../../../execution-environment-host-local/verification/models/README.md)。以后为本成员某条性质建立模型时，在这里写明性质、前提与运行命令。
