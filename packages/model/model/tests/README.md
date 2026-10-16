# Model 成员测试

本目录维护单元和契约测试。现有 [public-entry.spec.ts](public-entry.spec.ts) 使用真实 workspace 包入口，只检查当前导出为空，没有模拟模型提供者。

运行命令为 `pnpm --filter @omne-harness/model test`。该测试不覆盖请求、流式、恢复、ACK 或清理。运行实现完成后须加入实际提供者与存储交接的验证，并注明替身和故障范围。

固定输入归 [fixtures](fixtures/index.md)。持续验证义务见 [verification](../../model-contract/verification/index.md)，目录导航见 [index](index.md)。
