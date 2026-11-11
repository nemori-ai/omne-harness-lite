# verification/proofs

本目录承载本包的论证或证明。

## 允许的内容

证明源文件与说明。

## 边界

说明证明的性质、假设与适用范围。

## 维护

被证明的承诺变化时，复核证明是否仍然成立。

## 本包事实

[process-custody.md](process-custody.md) 对 [ProcessCustody](../models/README.md#processcustody) 的不变式做动作归纳，把 TLC 的结果推广到任意有限的执行域数、任意容量与崩溃次数。它覆盖 I1 至 I8、T3、T5 与 T8，范围是一份获取加一个保留范围。它是手写证明，没有机器检查。活性、多份获取与多个保留范围、租户隔离，以及 [TerminalSegments](../models/README.md#terminalsegments) 的性质不在其中，见该页「不在本页」一节。

三个核心设施的每项操作都须授权、根入口不导入 Cordis 这类性质，由 [tests/](../../tests/README.md) 直接核对。
