# verification

本目录承载本包的持续验证资源：模型、论证或证明。

## 允许的内容

`models/` 下的形式模型，`proofs/` 下的论证或证明，以及说明文件。

## 边界

每份资源说明所验证的性质、前提、运行命令、覆盖与限制。单次运行的原始输出留任务 tmp，不进本目录。

## 维护

被验证的承诺变化时，同步模型、证明与本目录 `index.md`。

## 本包事实

`models/` 有提交顺序与读取隔离的两个 TLA+ 模型，`proofs/` 有对应的手写证明。性质、源码对应与机读守卫见 [formal-mapping.md](formal-mapping.md)，运行记录与发现的缺陷见 [formal-runs.md](formal-runs.md)。守卫驱动真实机制，所以放在 [runtime-context](../../runtime-context/tests/README.md) 成员的测试里。

本成员的持续验证义务列在 SPEC 的[持续验证义务](../SPEC.md#持续验证义务)，现在由测试承担的部分见 [tests/](../tests/README.md)。测试资源包含纯函数、三面六操作套件与非耐久替身。有限范围的模型通过不等于实现符合，也不提供耐久保证。
