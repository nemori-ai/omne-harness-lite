# verification

本目录承载本包的持续验证资源：模型、论证或证明。

## 允许的内容

`models/` 下的形式模型，`proofs/` 下的论证或证明，以及说明文件。

## 边界

每份资源说明所验证的性质、前提、运行命令、覆盖与限制。单次运行的原始输出留任务 tmp，不进本目录。

## 维护

被验证的承诺变化时，同步模型、证明与本目录 `index.md`。

## 本包事实

[generation-handoff/](generation-handoff/README.md) 是进程代次退役、准入记录保存与执行路由唯一性的有限模型，结论只覆盖它写明的范围。[journal-facts/](journal-facts/README.md) 是会话日志里 Agent 事实族的行为模型，带有限范围的运行记录、手写证明与写操作的答复推导审计。`models/` 与 `proofs/` 没有资源。本成员的验证义务列在 SPEC 的[组合与验证](../SPEC.md#组合与验证)，按场景由测试承担，见 [tests/](../tests/README.md)。表中没有要求哪条义务必须用模型或证明验证。共同提交、认回与恢复的行为模型归 Session 契约的验证义务，不在本成员。journal-facts 只检查 Agent 事实族的追加、折叠与答复推导，不覆盖 Session 条目族。
