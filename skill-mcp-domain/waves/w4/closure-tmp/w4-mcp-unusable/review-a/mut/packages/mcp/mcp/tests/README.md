# tests

<!-- documentation:placeholder -->

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

<!-- documentation:placeholder -->

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

<!-- documentation:placeholder -->

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

<!-- documentation:placeholder -->

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

替身：契约 `./testing` 的五个内存替身（经 `doubles/ports.ts` 加计数与脚本化的 `stop()` 范围）与计数的输出校验函数、`doubles/scripted-transport.ts` 的传输工厂（脚本化传输对象做什么，给连接表的用例）、`doubles/peer.ts` 在契约的 `createScriptedTransportFactory` 上建调用口的世界（脚本化对端说什么，记录对端收到的请求，给调用口与任务操作的用例）、`doubles/transports.ts` 按打开次序改写一条传输的方法（挂住的 `cancelRequest`、迟到或永不兑现的应答、违约的 `call`；`peer.ts` 的调用门也经它）、`doubles/stalls.ts` 让选中的端口调用等到测试放行或不再答复（迟到的落点、凭据与采用答复；选哪几次由 `doubles/calls.ts` 按调用序号决定）、`doubles/faults.ts` 让 `close()`、`stop()`、`release()` 做完再 reject（违反契约的提供者），也能按进程序号决定 `stop()` 的答复。凭据替身共用 `doubles/handles.ts` 的句柄包装。`doubles/watched.ts` 在计数收口次数的在途表上装配调用口，逐微任务落下 `closeAll` 的扫描用例据此判断调用在那一刻是否已答复：答复与收口在同一段同步执行里决定。并发用例用 `doubles/deferred.ts` 排次序，不用计时器；只有连接时限与取页时限的用例用 1 ms、50 ms 的真实时限。真实依赖：无。`public-entry.spec.ts` 经构建产物导入包名，其余用例经相对路径导入 `src/`。

`model/` 是连接表与调用口的有界穷举探索器。它用 `model/ports.ts` 的可编程端口替身驱动真实的 `createConnectionTable`，以及同一张表上真实的 `createCalls` 与 `createTasks`（在途表经一个只计数的子类观察），由探索器自己触发时限，按宽度优先走遍 `model/scenarios.ts` 写明的调度，在每个可达状态核对性质 P1–P14。生命周期场景在 `model/lifecycle.spec.ts`，调用口场景（`invoke`、`continueWithInput`、`cancel`、调用方中止、任务操作、`drop`）在 `model/calls.spec.ts`。范围、结果、发现与它和两个 TLA+ 模型的映射见 [verification/README.md](../verification/README.md)。宽场景、两键场景、任务与隔离场景很耗 CPU，只在慢层运行。缺口：没有真实传输、进程与对端。契约的内存进程替身在脚本化传输关闭 stdout 之后 `stop()` reject，所以调用口用例里丢失的连接带 `residual`。
