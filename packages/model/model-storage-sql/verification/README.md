# model-storage-sql 持续验证

本目录维护本成员自有的验证资源。行为用例在 [tests/](../tests/index.md)，共同协议的模型由 [model-contract](../../model-contract/verification/models/index.md) 维护。

本目录现有一个有限模型，检查请求正文分块保存的规则。模型只证明列出的有限状态，不证明实现；实现由 `tests/request-body.spec.ts` 守。这些资源不覆盖真实提供者的 Worker、耐久性、队列与关闭。

[目录索引](index.md)。
