# verification

本目录承载本包的持续验证资源：模型、论证或证明。

## 允许的内容

`models/` 下的形式模型，`proofs/` 下的论证或证明，以及说明文件。

## 边界

每份资源说明所验证的性质、前提、运行命令、覆盖与限制。单次运行的原始输出留任务 tmp，不进本目录。

## 维护

被验证的承诺变化时，同步模型、证明与本目录 `index.md`。

## 本包事实

现在为空，`models/` 与 `proofs/` 都没有资源。本成员的性质 4 依赖一条还没有进入 basis 的 Cordis 机制读数。本成员已在入口测试固定配置读取与另外两条内核读数；候选条目的 basis 登记仍归拥有者。这些读数由真实 Cordis 测试核验，不放在本目录，清单见 [Cordis 说明](../docs/cordis.md#机制读数与假设)。Service 实现行为的验证归 [execution-environment-host-local](../../execution-environment-host-local/verification/README.md)。某条性质只靠 probe 与测试无法覆盖时，才在这里加入模型或证明。
