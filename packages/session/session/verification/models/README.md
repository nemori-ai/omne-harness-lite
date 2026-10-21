# verification/models

本目录承载本包的形式模型，例如 TLA+、Alloy 或 SMT 模型。

## 允许的内容

模型源文件、配置与说明。

## 边界

说明模型对应的 `SPEC.md` 条款、抽象前提与未覆盖的部分。模型通过不等于实现符合。

## 维护

承诺或实现结构变化时，复核模型的抽象是否仍然成立。

## 本包事实

目前没有模型。候选模型是 Run 两层状态机（[RS-01 至 RS-10](../../../session-contract/SPEC.md#run-两层状态机与不变量)）与 `claim` 到 `resume` 之间的窗口（[PM-05](../../../session-contract/SPEC.md#pm-05)），尚未立项，没有负责人。故障场景先在 [fault-scenarios.md](../../docs/fault-scenarios.md) 以可观察结果表达。
