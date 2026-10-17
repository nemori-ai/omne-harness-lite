# Model 成员测试

本目录维护单元和契约测试。现有 [public-entry.spec.ts](public-entry.spec.ts) 使用真实 workspace 包入口，检查实际凭据根导出。[credential.spec.ts](credential.spec.ts) 覆盖存在性、解析、轮换、持久化、故障、跨进程更新和 Cordis 生命周期。

运行命令为 `pnpm --filter @omne-harness/model test`。这些凭据测试不覆盖完整模型请求、流式、托管恢复、ACK 或结果清理。运行实现完成后须加入实际提供者与存储交接的验证，并注明替身和故障范围。

固定输入归 [fixtures](fixtures/index.md)。持续验证义务见 [verification](../../model-contract/verification/index.md)，目录导航见 [index](index.md)。
