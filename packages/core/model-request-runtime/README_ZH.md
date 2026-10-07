# model-request-runtime

[English](README.md)

模型请求的公共定义、十五操作协议、显式宿主端口、codec，以及可独立消费的选择、重试、历史和响应构造函数。根入口不依赖 Cordis 或具体提供者；`readSettlementPrefix` 通过调用方显式提供的日志与登记执行读取，因此无框架依赖不等于没有 IO。

纯根还定义受信物理装配拥有者使用的 `ModelRuntimeExecutionSource`。它携带原内部执行能力，不能交给业务操作或调用方传入的 host。见[来源边界](SPEC.md#物理拥有者的执行来源)。

## 公开入口与归属

| 入口                               | 用途                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| [根入口](src/index.ts)             | `ModelRuntimeOperations`、完整操作输入/结果/失败消费/ACK/引用、宿主输入与支持端口、独立函数 |
| [./cordis](src/cordis.ts)          | `ModelRuntimeService`、宿主输入与执行支持的正式定义、唯一键与 Context 增补                  |
| [SPEC.md](SPEC.md)                 | 类型之外的业务行为与失败、并发、取消、恢复及独立函数边界                                    |
| [ADR](adr/runtime-integration.md)  | 公共面、提供者和宿主资源的责任选择                                                          |
| [验证资源](verification/README.md) | 可复跑的机制探针、有效模型来源与成立前提                                                    |

定义不安装服务，也不证明来源已经授权或真实写者停止。具体调用、存储、队列、调度、协调与物理关闭工厂由 [local 提供者](../../model/model-request-runtime-local/README_ZH.md)公开。五类相关公共定义各有唯一拥有者，不整体搬入本包。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/model-request-runtime run build
pnpm --filter @omne-harness-lite/model-request-runtime run typecheck
pnpm --filter @omne-harness-lite/model-request-runtime run test
```

源码、声明、运行装载和实际打包后的外部消费分别核验。有限静态检查与测试不代替全领域生命周期验收。
