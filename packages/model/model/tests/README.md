# Model 成员测试

本目录维护单元和契约测试。[public-entry.spec.ts](public-entry.spec.ts) 使用真实 workspace 包入口，检查根入口导出清单，并核对源码不到达保管实现、Cordis 或 model-host-local。[judgment.spec.ts](judgment.spec.ts) 用内存状态快照直接覆盖存在性与解析的判定：五种结果、租户隔离、官方默认凭据的取舍与关闭。保管、持久化、文件故障与 Cordis 插件的测试在 [model-host-local](../../model-host-local/tests/index.md)。

运行命令为 `pnpm --filter @omne-harness/model test`。这些测试不覆盖完整模型请求、流式、托管恢复、ACK 或结果清理。运行实现完成后须加入实际提供者与存储交接的验证，并注明替身和故障范围。

固定输入归 [fixtures](fixtures/index.md)。持续验证义务见 [verification](../../model-contract/verification/index.md)，目录导航见 [index](index.md)。
