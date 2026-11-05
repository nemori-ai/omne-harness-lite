# tests 索引

<!-- documentation:placeholder -->

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

<!-- documentation:placeholder -->

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口的导出集合
- [mcp.spec.ts](mcp.spec.ts)：`createMcp` 的配置校验、服务共享一张表、端口时钟与类别端口
- [config.spec.ts](config.spec.ts)：`validateConfig`
- [connection.spec.ts](connection.spec.ts)：`Connection` 的状态机穷举
- [in-flight.spec.ts](in-flight.spec.ts)：`InFlightCalls` 的性质：占位一步、隔离、代际、发出前的取消、取消信号
- [invoke.spec.ts](invoke.spec.ts)：`invoke` 的次序每步一例、R2 每个原因、连接表答复的映射、发出后的 `signal`、结局
- [cancel.spec.ts](cancel.spec.ts)：`cancel` 只查在途表：另一主体或租户、发出前、发出后、发出与登记之间
- [continue.spec.ts](continue.spec.ts)：`continueWithInput` 同代际完成、换代不发、只带 `requestState`
- [tasks.spec.ts](tasks.spec.ts)：四个任务操作：发起者、复用不问端口、新建要资格与同一账户、答复的映射、`closeAll` 之后
- [gate.spec.ts](gate.spec.ts)、[types.spec-d.ts](types.spec-d.ts)：关口的六种答复与能力令牌
- [ensure.spec.ts](ensure.spec.ts)：连接表的复用、重建、单飞、配值缺陷、连接失败、句柄释放、连接时限与键
- [entry.spec.ts](entry.spec.ts)：`holdsNothing` 五种资源各一例；删除条件 `forgettable`（已关闭且什么也不持有）
- [teardown.spec.ts](teardown.spec.ts)：拆除在 `close()`／`stop()`／`release()` reject 每种组合下每步都执行；某个 `stop()` reject 时其余进程仍被要求停止；早先修订留下的未确认进程由新修订的条目再问；拆除等端口时条目不被删除；落点在途时的 `release`／`closeAll`、关停后不建连、关停时立即释放句柄
- [shutdown.spec.ts](shutdown.spec.ts)：`closeAll` 先释放在途落点的句柄，不等别的条目关闭，已交来进程的落点除外；建连途中关停（取凭据、起进程、协商时），不再起进程、不再打开传输、不交出连接，也不标记清单
- [turns.spec.ts](turns.spec.ts)：每个持有一次只跑一个的轮次
- [port.spec.ts](port.spec.ts)：端口适配器 `ask`（同步抛出与 reject 读成违约答复）与时限下的等待 `within`
- [port-breach.spec.ts](port-breach.spec.ts)：读类端口（采用、资格、存储）违约当作 `unknown`／`unavailable`；建连的端口同步抛出与 reject 同样收场
- [refresh.spec.ts](refresh.spec.ts)：读口与发布边界，含并发与迟到结果
- [races.spec.ts](races.spec.ts)：交错：发布边界紧挨写入、旧代际迟到的页、取页时限、关闭对建连、挂起或抛出的端口、建连中中止、旧修订令牌、服务层关口、时限后交来或 reject 的落点、临界区重读的时限、临界区等关闭或拆除的时限
- [status.spec.ts](status.spec.ts)：状态视图
- [release.spec.ts](release.spec.ts)：关闭次序与 `closeAll`
- [memory-store.spec.ts](memory-store.spec.ts)：内存存储的符合性套件与隔离
- [model/](model/)：连接表的有界穷举探索器：驱动真实的 `createConnectionTable`，在每个可达状态核对性质 P1–P8，见 [verification/README.md](../verification/README.md)
- [doubles/](doubles/)：`world.ts`（端口替身与采用样本）、`core.ts`（服务组装）、`scripted-transport.ts`、`ports.ts`（计数替身）、`stalls.ts`（挂起选中的调用或不再答复的端口）、`faults.ts`（关闭次序的三步做完再 reject 的端口；按进程序号答 `stop()` 的落点）、`handles.ts`（凭据替身共用的句柄包装）、`calls.ts`（按调用序号挑选）、`deferred.ts`、`peer.ts`（调用口的世界：契约的脚本化传输与对端收到的请求）、`identities.ts`（测试世界的租户与主体；契约值的样本用契约 `./testing` 的构造器）
- [fixtures/](fixtures/index.md)：测试固定输入（本包目前没有）
