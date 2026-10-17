# Model 成员测试

本目录维护单元和契约测试。[public-entry.spec.ts](public-entry.spec.ts) 使用真实 workspace 包入口，检查根入口导出清单，并核对源码不到达保管实现、Cordis 或 model-host-local。[judgment.spec.ts](judgment.spec.ts) 用内存状态快照直接覆盖存在性与解析的判定：五种结果、租户隔离、官方默认凭据的取舍与关闭。public-entry.spec.ts 还断言 `./cordis` 与 `./execute` 子路径不可解析、清单只导出根入口且不声明 Cordis、proper-lockfile 与 model-cordis-contract。判定对未经铸造的查询租户一律返回拒绝，快照里有未经铸造的绑定租户时不给工厂秘密，由 judgment.spec.ts 覆盖。保管、持久化、文件故障与 Cordis 插件的测试在 [model-host-local](../../model-host-local/tests/index.md)。

运行命令为 `pnpm --filter @omne-harness/model test`。这些测试不覆盖完整模型请求、流式、托管恢复、ACK 或结果清理。运行实现完成后须加入实际提供者与存储交接的验证，并注明替身和故障范围。

固定输入归 [fixtures](fixtures/index.md)。持续验证义务见 [verification](../../model-contract/verification/index.md)，目录导航见 [index](index.md)。

## 安装闭包

`pnpm --filter @omne-harness/model run install-closure` 调用 model-contract 的安装闭包设施，策略为 [fixtures/install-policy.json](fixtures/install-policy.json)，场景为 [install/scenario.mjs](install/scenario.mjs)。场景只导入 `@omne-harness/model`、`@omne-harness/model-contract` 与 `@omne-harness/legal-identity`：以注入的端口调用 `deliver`，覆盖已发送、拒绝、缺席三条路径，并对一个快照做铸造租户的判定。给出 `--scenario` 时设施把闭包里的每个工作区成员声明为消费工程的直接依赖，所以场景导入得到 model-contract 与 legal-identity。运行带 `--out <报告.json>` 写出报告，退出码 0 表示 `forbidden` 为空且全部检查（含 `scenario-run`）通过。报告写在任务的 `tmp/`，不入库；它只证明 model 自己的安装闭包与场景，不证明 model-host-local 的闭包，也不证明运行工厂或任何宿主。
