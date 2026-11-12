# verification/proofs

<!-- documentation:placeholder -->

本目录承载本包的论证或证明。

## 允许的内容

<!-- documentation:placeholder -->

证明源文件与说明。

## 边界

<!-- documentation:placeholder -->

说明证明的性质、假设与适用范围。

## 维护

<!-- documentation:placeholder -->

被证明的承诺变化时，复核证明是否仍然成立。

## 本包事实

[sdk/](sdk/README.md) 是 SPEC「与 SDK 的复用关系」一节的论证。复用表每一行写本包为什么复用或不复用 SDK 2.4.0 的某个部件，「证据」列引用三个探针的输出摘录，探针脚本在 `tests/probes/`。探针在 SDK 2.4.0 与本机 Node 的全局 `fetch` 上运行，结论只覆盖这两个版本。SDK 或 Node 升级时，重跑探针，再核对复用表。负责人：本成员的维护者。

本目录没有机器检查的证明。会话的形式模型放在 [models/](../models/index.md)。
