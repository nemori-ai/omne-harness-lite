# w3-mcp-table 第 1 轮评审（head 7aab1e0c4，基线 05f281394）

## reduce 复跑（evidence/w3-mcp-table/reduce/）

成员 build/typecheck/test 15/15（283 例）；lint:rules、lint:oxlint、lint:deps、format:check 退出 0。写者声称的结构性改动逐条 `grep` 核实：`entries.delete` 一处且经 `holdsNothing`；端口关闭/停止/释放只在 `teardown.ts`、`late.ts`；`finally` 5 处；`class` 只在两个聚合；测试无 `setTimeout`。

## 设计与实践 + SPEC 措辞（opus，探针在 scratchpad/probe-w3t/）

- 阻断 B1：`stopProcesses` 第一个 `stop()` reject 就中止循环，其余进程本轮不被要求停止；与已定事项 4「reject 当作 unconfirmed」不符（正常答 unconfirmed 时循环会继续）。探针 1：`closeAll` 时 lingering 的进程一次也没被问到。另：`teardown()` 的 `.then(confirmed, confirmed)` 吞掉整个关闭次序的任何 rejection，含编程错误。建议形状：每步在端口调用处吸收违约并返回记录（`stop().catch(() => 'unconfirmed')`），函数本身不 reject，编程错误照常抛出。
- 阻断 B2：`closeAll` 逐条目 `await closeEntry; await abandonLandings`，在途落点的句柄要等前面全部条目拆完；与已定事项 6「立即释放」不符。探针 2：前一个条目 `close()` 不答复时，后一个条目的句柄 200 ms 后仍未释放。
- 阻断 B3（SPEC）：「已知限制」删了临界区无界等待，但 `begin` 的 `await closeEntry/inFlight` 与 build 开头的 `await teardown` 在拆除端口不答复时仍无界；要写回已知限制。
- 建议：F1-1 注释「聚合只由 table 写」与事实不符；F1-2「凭据在条目或落点」「句柄在 process 或 lingering」两条跨模块不变式做成 entry.ts 的具名搬移；F1-3 JSDoc 错位；F1-4 `readAgain` 第三处重写采用读取；F2-1 删除条件 `closed ∧ holdsNothing` 抽成纯函数 `forgettable`；F2-2「清字段在端口答复之后」的隐式不变式写明或加用例；F4-1 `Late<T>` 与 `answerOf` 同一想法；F4-2 `Scope` 重复、`CONNECTION_UNAVAILABLE` 两份；F5-1 两处测试走内部 API；F5-2 替身重复；F6-1 两句行为限制放错节、`inspect` 与 `release` 视图不一致；F6-2 MC-14 把模块与函数名写成承诺、与所有权节重复；F6-3 五项资源写了两处。

## L3 逐行（implementation-reviewer，opus@high，44 个探针在 scratchpad/review-w3-mcp-table/probes/）

交付边界 1–9 与 MC3-3 达到；W2 用例未弱化。句柄取一次释放一次（a1–a6，含 8 种 reject 组合、并发 closeAll、关停中落点交来）全部成立；遗忘（b1–b3）成立；关停后拒绝（d1、d3、d4）成立；重读排队（e1，4 个 ensure 51 ms 全部答复）成立；键隔离回归（f1）成立。
- 阻断 B1：同设计面 B1，探针 c1（release）与 c3（closeAll）证实 lingering 的进程本轮没被问到。
- N1：建连卡在取凭据时 closeAll，放行后仍起进程、打开传输（d2）；`shut` 只在 `begin` 检查。
- N2：多进程拆除没有用例。
- 待裁 S1：拆除端口挂起（不是 reject）时，临界区的 `await closeEntry(other)`、`await inFlight` 无界（e2：400 ms 无答复）。待裁 S2：落点在途时 `release` 报 `unconfirmed` 而 `inspect` 报 `none`（单独 release 也如此）。
- 对写者裁定：1、2、3、5、6、7 同意；4 不同意；8 部分同意（措辞漏 release）。

## 第 2 轮（head 1160e92c8）

- 增量 L3（opus@high，探针 scratchpad/review-w3-mcp-table-r2/）：T1–T8 闭合；第 1 轮探针 46/46 转绿或保持绿；句柄 30 组合、遗忘、键隔离无回归。新阻断 B1：`closeAll` 先建 `abandoned` 不挂处理器再 await 各条目关闭，期间它 reject 即未处理拒绝、宿主退出，调用方 try/catch 接不到（n9 实证 EXIT 1）——T2 的实现带进来的回归。N1：存储挂起时加入在途建连的 `ensure` 无界等待（SPEC:122 写过头）。N2：迟到路径上四条 `void` 链在端口同步抛出时成为未处理拒绝（n4 EXIT 1）。待裁 P1–P4：`afterwards` 不吞拒绝对库不可接受（错误要有可观察、不崩溃的去向）；建连自身拆除挂起时调用方永远等待（n1、n2、n1b）；discover 途中关停仍答 ok；报告 `no-process` 的含义。

## reduce 处置（2026-11-04T11:20Z）：停止补洞，改为结构性处置

同一类问题（异步副作用的所有权、错误去向与等待上界）在 W2 三轮、W3 两轮反复出现，每轮修好一处又在相邻处出现。按 `quality.md` 不再派第 3 个补洞轮。根因与处置见 `waves/w3/structural.md`。
