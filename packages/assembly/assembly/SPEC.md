# 定义求值与装配交接行为规格

本目录是 workspace 包 `@omne-harness/assembly`。下面从「一组租约」到「就绪、撤除和远端中断」的关闭行为，已由 [部分接受记录](https://github.com/nemori-ai/omne-harness-lite/issues/222#issuecomment-6162745308) 接受，是该范围的现行契约。求值快照、绑定生效点、缺依赖失败和旧新推进权仍待确定。

谁必须关闭、配置代际如何留在原提供者，以及同级 Cordis effect 的完成顺序不是关闭顺序，只写在[Cordis 装配与服务生命周期](../../../docs/architecture/deployment/cordis-and-lifecycle.md)。改那些句子只改该页。改下面的报告结果只改本页。

## 一组租约

一个协议实例关闭一个进程里的一组租约。资源拥有者换代时再建一个实例。本页不打开代际，也不把租约迁到另一个提供者。

远端不可用不是停止准入。本地代理仍在时，调用方不调用 `close`。

进程在 `close` 完成之前死亡时，这次调用不产生 `closed`、`failed` 或 `timed-out`。崩溃后的恢复归部署页所说的进程外监督。

步骤失败或报告为超时，不回滚已经发生的外部效果。

调用方提供步骤列表、排空超时和时钟。协议不选择关闭哪个后端。

排空超时小于 0 时，构造失败，错误文本是 `drain timeout is negative`。此时还没有任何租约。等待集合在关闭开始时为空，即使排空超时是 0，步骤仍执行。

## 报告

`closed` 只列出 `run` 已经完成的步骤。它没有失败列表。

`failed` 列出同样这些已完成的步骤、每一项失败 `{ step, message }`，以及被跳过的步骤名。抛错的步骤在 `failures` 里，不在 `steps` 里。

`timed-out` 按 `admit` 的顺序列出仍在等待的名字。名单不包含被排除的调用方。步骤不执行。之后的 `release` 不改写这份报告对象。

## admit

调用方传入租约名字。没有默认调用方、租户或账号。

准入为 `open` 时，空名字抛出 `lease name is empty`。这次调用不新增持有。已有租约保持不变。尚未持有的非空名字返回新的 id 并持有它。已经持有的名字返回同一个 id。

准入为 `stopped` 时，`admit` 抛出 `admission stopped`，并且不新增持有。这也包括 `admit('')`。停止期间不使用空名字错误。

当前 id 被 `release` 之后，再次 `admit` 同一个名字会返回新的 id。

`admit` 返回时，该租约已被持有。不发出事件。

## release

调用方传入租约 id。任何状态下都可以调用 `release`。这包括准入仍开放、正在排空、步骤正在执行，以及报告已经是 `closed`、`failed` 或 `timed-out`。

该 id 是这个名字当前持有的租约时，`release` 移除这个名字。否则 `release` 什么也不做。同一个 id 再次 `release` 什么也不做。上一个 id 的 `release` 不会移除同名的新租约。

`release` 不让这次 `close` 的 promise 确定。`close` 观察剩余的持有集合。报告已经确定之后，`release` 不改写报告。

不发出事件。

## detachObserver

调用方不传入参数。这次调用不释放租约，不停止准入，也不让 `close` 的 promise 确定。再调用一次仍然什么也不做。不发出事件。

观察者离开不取消已持有的租约。

## close

调用方可以传入 `{ caller: leaseId }`。第一次调用建立唯一的关闭 promise。之后的调用，包括传入另一个 `caller`，都返回同一个 promise。被排除的调用方由第一次调用固定。

第一次的 `caller` 当时已被持有时，排空不等待它。该 id 当时未被持有时，排空等待每一个已持有的租约。

`close` 在返回 promise 之前把准入设为 `stopped`。这发生在排空等待之前，也发生在任何步骤之前。此后的 `admit`，包括排空期间的 `admit`，抛出 `admission stopped`。

排空接着等待，直到每个被等待的租约都被释放，或注入的时钟走完排空超时。关闭开始时等待集合非空，并且排空超时是 0，报告就是 `timed-out`。这次关闭不调用 `clock.delay`。时钟走完时等待集合已经为空，步骤执行。等待集合仍非空，报告是 `timed-out`。

`clock.delay` 拒绝时，关闭 promise 以该错误拒绝。报告不是 `timed-out`，也不是 `failed`。准入保持 `stopped`。

步骤按列表顺序执行。一个步骤是 `{ name, run, when }`。`when` 是 `always` 或 `if-no-failure`。

前面的步骤抛错之后，`always` 步骤仍然执行。`if-no-failure` 步骤被跳过，名字写入 `skipped`。

步骤抛错，或其 promise 拒绝，记为 `{ step: name, message }`。值是 `Error` 时，`message` 取 `Error.message`。否则取 `String(error)`。

任一步骤抛错，或任一步骤被跳过，报告是 `failed`。否则报告是 `closed`。

关闭不取消租约。超时时仍被持有的租约，一直持有到 `release`。

不发出事件。promise 就是结果。这个 promise 只在本进程内有效。它不是跨进程决定。

## 两个实例

换代再建一个协议实例。新实例接受新租约。旧实例看不见它们。

旧实例的 `close` 只等待它自己持有的租约。新实例上的租约不会让这次 `close` 继续等待。旧实例的报告确定之后，新实例仍然可以 `admit`。

旧关闭不释放新实例的租约，也不停止新实例的准入。

## 退出

资源拥有者把退出工作按这个顺序放进步骤列表。在途结果的交接先于关闭后端。

`close` 在第一步执行前停止准入。步骤可以观察到新的 `admit` 抛出 `admission stopped`。

交接步骤失败之后，标成 `always` 的后端步骤仍然执行，报告是 `failed`。标成 `if-no-failure` 的后端步骤被跳过，名字记入 `skipped`。

## 就绪、撤除和远端中断

就绪不是准入 `open`。部署页说明 fiber 处于 `ACTIVE` 并不表示存储可写或远端可达。

撤除本地提供者，是对该实例调用 `close`。远端不可用时，本地实例留在原处。调用方不调用 `close`，也不把准入设为 `stopped`。

## 验证

`tests/close-protocol.spec.ts` 从 `@omne-harness/assembly` 核对关闭行为。`tests/public-entry.spec.ts` 从包名核对公开导出。

在工作树根目录执行：

`pnpm --filter @omne-harness/assembly test`

`verification/close-protocol.test.ts` 与 `verification/process-kill.test.ts` 导入生产模块 `src/close-protocol.ts`。在本目录执行：

`node --experimental-strip-types --test verification/close-protocol.test.ts verification/process-kill.test.ts`

2026-10-14 在 Node v26.0.0 上跑过这两条命令。包测试 28 项通过。目录里的 node 测试 21 项通过。进程杀死试验观察到子进程收到 SIGKILL，并且没有写出关闭报告。仓库 engines 要求 Node `>=24.18.0 <25`。这次没有在该范围重跑。

这些测试没有覆盖真实后端，也没有覆盖远端中断。没有可启动的网络、MCP、执行环境或数据库成员，因此没有做这些试验。Cordis 4.0.4 的依赖换代、调用方 Context、清理顺序和异常传播，用 `packages.0.0.1.legacy/core/kernel-basis` 里已有的 basis 探针核对，不把该旧包当成新的辅助层。
