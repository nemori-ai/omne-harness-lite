# tests 索引

<!-- documentation:placeholder -->

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

<!-- documentation:placeholder -->

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口的导出集合
- [core.spec.ts](core.spec.ts)：`createMcpCore` 的配置校验、四个服务与类别端口
- [config.spec.ts](config.spec.ts)：`validateConfig`
- [connection.spec.ts](connection.spec.ts)：`Connection` 的状态机穷举
- [in-flight.spec.ts](in-flight.spec.ts)：`InFlightCalls` 的五条性质
- [gate.spec.ts](gate.spec.ts)、[types.spec-d.ts](types.spec-d.ts)：关口的六种答复与能力令牌
- [ensure.spec.ts](ensure.spec.ts)：连接表的复用、重建、单飞、配值缺陷、连接失败、句柄释放、连接时限与键
- [entry.spec.ts](entry.spec.ts)：遗忘谓词 `holdsNothing`，五种资源各一例
- [teardown.spec.ts](teardown.spec.ts)：拆除在 `close()`／`stop()`／`release()` reject 每种组合下每步都执行；落点在途时的 `release`／`closeAll`、关停后不建连、关停时立即释放句柄
- [turns.spec.ts](turns.spec.ts)：每个持有一次只跑一个的轮次
- [port-breach.spec.ts](port-breach.spec.ts)：读类端口（采用、资格、存储）reject 当作 `unknown`／`unavailable`
- [refresh.spec.ts](refresh.spec.ts)：读口与发布边界，含并发与迟到结果
- [races.spec.ts](races.spec.ts)：交错：发布边界紧挨写入、旧代际迟到的页、取页时限、关闭对建连、挂起或抛出的端口、建连中中止、旧修订令牌、服务层关口、时限后交来或 reject 的落点、临界区重读的时限
- [status.spec.ts](status.spec.ts)：状态视图
- [release.spec.ts](release.spec.ts)：关闭次序与 `closeAll`
- [memory-store.spec.ts](memory-store.spec.ts)：内存存储的符合性套件与隔离
- [doubles/](doubles/)：`world.ts`（端口替身与采用样本）、`core.ts`（服务组装）、`scripted-transport.ts`、`ports.ts`（计数替身）、`stalls.ts`（挂起一次调用或不再答复的端口）、`faults.ts`（关闭次序的三步做完再 reject 的端口）、`deferred.ts`、`values.ts`
- [fixtures/](fixtures/index.md)：测试固定输入（本包目前没有）
