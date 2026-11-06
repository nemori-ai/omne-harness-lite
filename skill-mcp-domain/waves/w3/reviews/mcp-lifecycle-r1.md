# w3-mcp-lifecycle 第 1 轮评审（PR #1134，head f8bf19596，基线 92a8e3cdf）

派发：2026-11-05，reduce 本会话。四路独立评审：L3 实现（含 review-code 正确性一面，implementation-reviewer，opus@high）、设计与实践（general-purpose，opus）、表达（design-reviewer，opus@xhigh）、交付边界（review-delivery，待派）。结构读数与差分变异由 reduce 在最终 head 跑。

## 设计与实践（opus，2026-11-05 交回）

结论：无阻断。5 条非阻断，10 条建议。

### 非阻断

- **N1** P7「经 closeAll 交出」没有用例也没有变异（`src/internal/table.ts:411-418` 的 `...scope.defects()` 与 `AggregateError`）。只有 `tests/port.spec.ts` 读 `scope.defects()`；没有用例断言 `closeAll` 以 `AggregateError` 拒绝；M1–M15 都没改这几行；探索器不注入本包错误。改法：向注入的作用域 spawn 一个拒绝的任务，`closeAll()` 断言 `AggregateError` 含它；删掉展开的变异。
- **N2** `closeAll` 答复之后作用域里出现的错误没有去向（`scope.ts:14-24`、`table.ts:401-420`、`tests/model/explore.ts:316`）。作用域无退出、`defects` 不清空；迟到落点在 `closeAll` 之后出的本包错误只进 `defects`；再调 `closeAll` 会重抛旧错。探索器用缺省参数建表，看不到作用域。SPEC P7 与探索器一栏都没写这个例外。改法：探索器自建作用域，在 `afterStep` 与 `rest()` 末尾断言 `defects()` 为空；SPEC P7 写明去向或明说未覆盖；彻底的办法是 `TaskScope.exit()`。
- **N3** 时限来源是隐藏的全局依赖：`AbortSignal.timeout` 写死在 `table.ts:335`、`build.ts:303`、`discovery.ts:111`。探索器替换全局并用 AsyncLocalStorage 按调用次序分辨时限（`explore.ts:460-474`、`729-749`），实现多建或少建一个时限会悄悄错位；单测用真实的 1ms、50ms 计时器。波段规格要求「小值与注入时钟」。改法：deps 加 `timeout(ms, label?)`，缺省 `AbortSignal.timeout`，discovery 取同一个。
- **N4** 探索器的 `BOUNDED_PORTS`（`tests/model/ports.ts:54-61`）没跟上 K1：不含 `store.read`、`transport.close`、`process.stop`、`credential.release`，这些在建连时限之后答复时不算迟到，P6 不检查。改法：按调用实际所在的 `within` 记录时限（做了 N3 的 label 后可直接拿到），或把这四个端口在建连上下文里的调用算作有时限，重跑三个快场景。
- **N5** 「先写红」没有留证据（无 `tmp/closures/w3-mcp-lifecycle/red/`）；红实际来自上一闭包探索器的反例与本闭包的事后变异。改法：PR 说明明说，不声称先写红。

### 建议

- **S1** MC-15 的违约答复分散在约 10 处调用；「端口只经 `ask`」只靠 grep 维持。改法：`port.ts` 放按端口方法的违约答复表；可加 lint。
- **S2** 任务作用域分两路传入（`index.ts:54-56`、`table.ts:136` 缺省参数、`tests/doubles/core.ts:20-26` 复制装配），传错一个 discovery 的错误就不进 `closeAll`。改法：表持有并公开作用域，discovery 从表取。
- **S3** `scope` 一词两义并遮蔽（`table.ts:136` 与 `175`、`391`；类型 `Scope` 在 `entry.ts:82`）。改法：类型改名 `StopRange`。
- **S4** 落点生命周期分在四个文件。改法：合成 `landing.ts`。
- **S5** 资源字段的写者不止 `entry.ts`，与文件头说法不符。
- **S6** 三份「单飞 promise 槽加自清」。
- **S7** 三处「转 lost 再拆除」；catch 分支里 `within(teardown)` 拒绝时原 `error` 丢失。改法：合成带参数的收场；catch 用 `AggregateError` 保留两个错误。
- **S8** 类型精度：`ask<T>` 允许成功值作违约答复；`CatalogMark` 的 `'pending'` 泄到 `lose()`；K3 收场返回 `stage: 'settings'` 名不副实。
- **S9** 「ready 但没有 peer」可表示（基线就有）。
- **S10** 探索器：`properties.ts:241` 用栈帧名判签名；`siteOf()` 取不到 src 帧时返回空串；去重交叉核对只在 `throws` 做过。`entry.ts:87-95` 有遗留 JSDoc。

### 转正确性一面
`ensure` 在 `turns.inTurn` 排队的那段不经 `within`（`table.ts:336`）；SPEC 前提已写「connectBound 不同的情形没有覆盖」。

### 评审者认为做对的
端口调用全经 `ask`；`within` 两个分支都挂处理；`forget` 是唯一出口；`releaseLanding` 先置空再释放；无非空断言与说谎的 `as`；`Started` 包装必须保留；单测与探索器分工清楚。

## L3 实现（implementation-reviewer，opus@high，2026-11-05 交回）

结论：1 条阻断，1 条非阻断，3 条范围外待裁。在 head 上重跑快层：20 个文件、315 条通过、3 条留给慢层。四个探针执行后删除，工作树干净。

### 阻断

- **B1** 临界区排队的等待不受本次 `ensure` 的时限约束（`src/internal/table.ts:335-338`：先起时限，再 `await turns.inTurn(holding, () => begin(...))`，排队这段没经 `within`）。同源的次要问题在 `table.ts:235`：`within(admitWithoutEligibility(...), bound, scope)` 先调用了端口，已经过期的调用仍发出一次采用读取。违背 SPEC P8 T2「时限都到期之后不再等任何端口就答复」、闭包裁定 K1、MC-5「重读在这次 `ensure` 自己的连接时限内等待」。SPEC 只在证据前提里写过「`connectBound` 不同的情形没有覆盖」，那是证据的限制，不是承诺的例外。
  - 探针 1（已执行）：同一持有，接入点不配 connect-timeout，重读采用永不答复；refresh A 带 `connectBound 1500`，refresh B 带 50，同时发起。B 在 1508 ms 才答 `connection-unavailable`，采用读了 4 次。应在约 50 ms 答复。
  - 第二条可达路径（读出）：同一持有的两个采用修订配了不同的 connect-timeout。
  - 现有证据为什么没发现：`races.spec.ts:530` 两个 refresh 的时限都是 50 ms；探索器与 TLC 的前提都是上界相同。
  - 建议修法：`begin` 开头 `if (bound.aborted) return refused(...)`；`ensure` 里 `await within(turns.inTurn(...), bound, scope)`；补两个时限不同的用例；探索器加场景或改 SPEC 证据前提。

### 非阻断

- **N1** `ask` 的闭包包住了非端口计算（`build.ts:140-143`：`markUnavailable` 在 `ask` 闭包里，修订号用尽时抛 `RangeError`，被读成存储违约）。探针 3（已执行）：`revision = Number.MAX_SAFE_INTEGER`，`ensure` 答 `catalog: 'unavailable'`，`store.write` 0 次，不抛出。基线直接传出 `RangeError`；`discovery.ts:197` 的做法是先在闭包外算好。修法：在 `ask` 外先算好 `markUnavailable(...)`。

### 范围外待裁

- **R1** 加入别人在途建连的调用方不受自己的时限约束（`table.ts:113` `reuseOf` 直接返回 `existing.pending`）。探针 2（已执行）：A 1500 ms、落点挂起；B 50 ms 加入，B 在 1505 ms 才答复。MC-5 写单飞「只受连接时限约束」（单数）。
- **R2** (a) 落点还在时限内时 `closeAll` 到达，句柄要等时限到才释放（探针 4：`atShut: []`，403 ms 后才 `credential.release`）；契约 S9 写「`closeAll` 时落点仍在途的连接，进程凭据句柄立即释放」，实现只把超出时限之后的落点当作在途落点。(b) 同一交错下，`closeAll` 之后建连因时限失败，`failed()` 在作用域里写了一次持久标记；MC-5 写「建连途中表关停时 … 不标记清单」「关停开始后才完成的 `ensure` 与关停之后才开始的 `ensure` 答同样的拒绝」，被这个反例推翻。
- **R3**（读出，未执行）HTTP `open` 超出时限时，句柄先于迟到的传输释放（`build.ts:251`、`teardown.ts:86-91`、`closeArrived`）；契约 S9「HTTP 凭据句柄随连接关闭释放」对迟到的传输读法不清。

### 未覆盖
结构度量未跑；手工变异与 `gates-2` 的日志早于提交（09:13）；`discovery.ts` 的发布边界与 `status.ts`、`guard.ts` 只读差异。

### 观察
`closeAll` 交出作用域错误之后，作用域里仍在运行的任务以后产生的本包错误没有去向（与设计与实践 N2 同一问题）。

## 表达（design-reviewer，opus@xhigh，2026-11-05 交回）

只读判据页 `harness-design-handbook/canonical/references/review/expression.md`。没有 shell，按 head 全文审 SPEC、VR、MR、README、README_ZH、docs/architecture、docs/flows、src/index、tests/index。TLC、探索器、变异的数字与原件一致。

结论：无阻断（前提：N1 取决于 reduce 对 K1 范围的裁定；若 K1 必须覆盖时限不等，就是实现缺陷）。

- **N1** P8 T2（K1）陈述比机制与证据宽：排队进临界区（`table.ts:335-338`）与加入在途建连（`table.ts:112-113`）不受本次时限；证据只核「全部时限到期后每个 `ensure` 已答复」的全局形式；SPEC:184 把「上界相同」写成证据前提。要么写进前提，要么改实现，需 reduce 裁定；SPEC:223 写明检查形式。
- **N2** 「每条性质在模型上都有一个负控」不成立：P3、P5、P7 在模型上没有负控，P8 T1 只有反定理探针。按性质逐条写清。
- **N3** SPEC:160「端口同步抛出……没有用例」已过时，与 K2、MC-15 冲突；MC-15 验证行补 `port.spec.ts` 与建连端口同步抛出的用例。
- **N4** K1「`refresh` 把 `pending` 读成本次连接失败」没有落点：MC-7 写出 connect 阶段每个 `catalog` 值对应的 `refresh` 答复。
- **N5** P1「只在携带它的每个进程 `stop()` 之后」与关停例外字面冲突：限定为 release 时已交来的进程，点名关停例外。
- **N6** `closeAll` 等不等作用域的任务、之后的错误去哪、重复调用报不报旧错误，没写。
- **N7** 「关停开始后才完成的 `ensure` 与之后才开始的答同样的拒绝」说宽了：关停后某步失败走 `failed`，标记清单、答该步的失败。收窄到 P4 或写明。契约 S8 对已在途 `refresh` 的适用交契约拥有者。
- **N8** 时限从哪里起算措辞有歧义：写成「`attempt()` 之后、取凭据之前的再停」并加进建立次序。
- **N9** 「先释放在途句柄，再关闭」：写成先发起释放、不等答复。
- **N10** 对契约 S5 的复述不准、没登记为偏离：改写成「与契约 S5 的差异」，登记偏离，退出条件是 K7 小卡。
- **N11** 依据表「兑现 T9」：限定到本包兑现的部分（`open`、`discover`、`listActions`、`close`）。
- **N12** 标签多义：K1–K3（契约与接手裁定）、T1–T7（契约、第 2 轮裁定、P8 定理）、W1–W3（公平性前提与波段）。加前缀或限定词。
- **N13** 偏离表的退出条件按字面已满足：改成「B 段 `w3-mcp-call` 删除（已定事项 26）」。
- **N14** P6 把「关闭后只为报告 `residual` 保留的条目算作 `none`」说成 MC-9 的规定：写明是 P6 的投影，MC-9 报 `lost`。
- **N15** M9、M10 的变红用例写「无」，其实是没运行：改「未运行」，并写明 MC-3 那句声称的证据来源。
- **N16** 过时文字：README「known counterexamples」、`port-breach` 只说 reject、MR:36 的历史段、SPEC:162 的挂起路径、状态行写「W2」。

范围外：K1 是否覆盖时限不等（reduce）；契约 S5、S8 的措辞（契约拥有者，K7）；`closeAll` 是否等作用域（reduce）。未覆盖：逐行 diff；MC-5/7/10/14 声称的一些变异证据在前面的闭包；MC-13 点名的「differs in the tenant」用例名在 `packages/mcp` 下没有匹配。

## 交付边界（general-purpose，sonnet，2026-11-05 交回）

11 条标准里 10 条达到。**未达到 1 条**：验收 1 缺 `pnpm turbo run build typecheck test --filter=@omne-harness/mcp` 原样命令的运行记录（PR 评论贴的是逐个 `pnpm --filter` 命令；`turbo` 的 `^build`、`^typecheck` 没有记录）。形式缺口。

冲突项（不是结论，交 reduce）：
1. K1 的 `pending` 与契约 S5（`mcp-contract/SPEC.md:336` 对时限先到的情形没写）。
2. 作用域裁定「`closeAll` 以 `AggregateError` 抛出」与契约 `closeAll` 的签名与 S8（没写可 reject）。
3. K2 把同步抛出扩到所有端口，契约只在 T9 写了同步抛出。
4. K1 的建连计时起点与卡 #1119「连接时限从取凭据起」、组页 `packages/mcp/docs/architecture.md:194`。
5. 追加记录「删去 `cex-*`」与验收 3「改为正控」字面不同。
6. 既有用例的断言按 K1、K2 改写，与已定事项 24「不改测试断言」（只在 `w3-mcp-table` 范围内有效）。
7. 契约 S5 的 `degraded` 与 MC-5 的 `lost`（追加记录已登记）。

## reduce 裁定（2026-11-05）

原则：P8 T2 是 K1 定下的无条件承诺；已定事项 6 不分落点是否超出时限；本包的错误不能静默。修复由 reduce 本会话写（第 2 轮），之后对改动做增量复审。

**本轮修**

- **F1**（L3 B1、L3 R1、表达 N1）每次 `ensure` 只受自己的两个时限约束。排队进临界区经 `within`；`begin` 在时限已到时不读采用、不等、不建连；加入别人在途建连的调用方最多等自己的连接时限，到期答 connect 阶段的 `connection-unavailable`，`catalog` 为 `pending`。补「同一持有、时限不同」与「加入方时限更短」两条用例。P8 T2 的检查改成逐个 `ensure` 的形式（探索器与模型），SPEC 删去「上界相同」的证据前提。
- **F2**（L3 R2a）已定事项 6 覆盖时限内在途的落点：落点开始时就登记，`closeAll` 立即释放它携带的句柄。补用例。
- **F3**（L3 R2b、表达 N7）关停开始之后，建连某一步失败也不标记清单，答与关停之后才开始的 `ensure` 同样的拒绝。补用例。
- **F4**（L3 N1）`ask` 的闭包只包端口调用：`markUnavailable` 移到闭包外。补用例（修订号用尽时 `RangeError` 交给调用方）。
- **F5**（设计与实践 N1、N2，表达 N6，L3 观察）`closeAll` 取走并清空作用域的错误；`closeAll` 答复之后才出现的本包错误不再留在作用域，交给作用域的事后出口（缺省作为未捕获异常抛出，测试可注入）。补用例与变异。
- **F6**（设计与实践 S7）建连 `catch` 分支里拆除再抛错时，两个错误以 `AggregateError` 一起交出。
- **F7**（设计与实践 S2、S3、S10）作用域只由表持有，discovery 从表取；停止范围的类型改名 `StopRange`；删 `entry.ts` 的遗留 JSDoc。
- **F8**（设计与实践 N4）探索器把建连上下文里经 `within` 的端口调用都算作有时限，P6 的迟到检查覆盖它们。
- **F9**（表达 N2–N5、N8–N16，设计与实践 N5）SPEC、README、verification 的表达修正；PR 说明写明「红」来自上一闭包的反例与本闭包的变异，不声称先写红。
- **F10**（交付边界 4）在最终 head 上原样运行验收 1 的 `turbo` 命令并贴出。

**不在本轮修，登记去向**

- 设计与实践 N3（时限的来源写死为 `AbortSignal.timeout`，探索器替换全局）：F1 加了一个时限，探索器按调用次序认时限的做法要跟着改。若 F1 改动后探索器的认法变得不可靠，本轮就把时限改成注入（`deps.timeout(ms, kind)`）；否则登记为后续，退出条件是下一次改连接表的时限。
- 设计与实践 S1、S4、S5、S6、S8、S9：可读性改进，不影响行为。登记为后续，随下一次改连接表一起做。
- L3 R3（HTTP `open` 超出时限后句柄先于迟到的传输释放）：句柄的使用者是传输。义务放在传输一侧：`open` 的 `signal` 中止之后，传输不再调用凭据句柄。写进 `w3-mcp-host` 的规格与契约 T9；本包 MC-14 写明句柄在建连失败时释放。
- 契约措辞（交付边界冲突 1、2、3、7，表达范围外 2、3）：S5 的 `pending` 与 `degraded`、`closeAll` 可以 `AggregateError` 拒绝、K2 的同步抛出、S8 对已在途 `refresh` 的适用，并入波末小卡 K7。
- 交付边界冲突 4（卡与组页的计时起点）：波末写回组页与卡正文。冲突 5、6：K1、K2 取代已定事项 24 对这两处断言的约束；追加记录已说明 `cex-*` 的去向，不再处理。
