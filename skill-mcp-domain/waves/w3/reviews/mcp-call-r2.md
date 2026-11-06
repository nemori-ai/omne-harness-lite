# w3-mcp-call 第 2 轮评审（增量，head `5204d3799`）

简报：`mcp-call-r2-briefs.md`。

## E. 交付边界（general-purpose，sonnet，medium）

W3 调用口 PR #1141 第 2 轮 E 面（交付边界）。head 5204d3799，验收清单 1–10 中 1、3–8、10 达到，2、9 未达到，另有 2 条证据义务未达到，并列出 11 项冲突项。只读，未改任何文件。

**依据与范围**
- 卡 #1119 正文、评论 6659833572（第 1 轮证据）、6660127599（第 1 轮评审与裁定）、6665868317（第 2 轮证据）。
- 闭包规格 `w3-mcp-call.md` 的验收 1–10 与「性质及证据义务」。
- 我在工作树里抽查了验证记录和用例标题。
- `tmp/closures/` 下的原件不算证据，这是 review-delivery 的规则，我也没有去读。
- 两个版本的证据：6659833572 的头是 7d91a330c，6665868317 的头是 5204d3799。

**验收清单（第 1 轮 E 的两项未达到逐条复核，其余按现状判）**

| # | 结论 | 依据与缺项 |
| --- | --- | --- |
| 1 | 达到 | 6665868317 §5：「`VITEST_MAX_WORKERS=6 pnpm turbo run build typecheck test …`：exit 0，19/19 任务；mcp 430、契约 548、host-local 1，无类型错误（`gates-r2/turbo.log` `057665cc2110b64e`）」。「`test:slow`：exit 0，8 通过、12 跳过，632 s」。 |
| 2 | **未达到**（复核第 1 轮未达到项） | 6665868317 对第 9 步没有任何说明。第 1 轮缺的两样仍缺：第 9 步的标签用例，或「第 9 步在发出之后、不产生未发出」的说明。原因是 MC-16 重编号为 13 步，已定事项 28 的第 9 步（`classifyOutcome`、任务登记、`markEnded`）现在对应 MC-16 的第 12、13 步。工作树里「step 9:」标签现在指 `transport.call` 的 `not-sent`（invoke.spec 三例），第 12、13 步没有标签用例。第 2 轮其余各项在工作树里可核：`invoke.spec.ts:427` 的 TypeError 用例、第 2、3、4、5、7、11 步的标签用例，映射表 C07–C14，R2 各原因。 |
| 3 | 达到 | `cancel.spec.ts`、C15、C18、C30a/b、C46；评论 6659833572 第 3 行。第 1 轮已达到，且无回退。 |
| 4 | 达到 | `continue.spec.ts`，C25–C28；6659833572 第 4 行。工作树另有两字段都缺答 TypeError 的用例（`continue.spec.ts:189`）。 |
| 5 | 达到 | 6659833572 第 5 行，C29–C42、C45。 |
| 6 | 达到 | 6659833572 第 6 行，grep 0 行。 |
| 7 | 达到 | 同上，`tests/types.spec-d.ts`。 |
| 8 | 达到 | 6659833572 第 8 行；第 2 轮另有契约 `classify.spec.ts` 与 `public-entry.spec.ts` 随修复改动。 |
| 9 | **未达到**（复核第 1 轮未达到项） | 6665868317 §5 给了七项的「全部 exit 0」和日志哈希（`a52e6d10c26e`、`712cdaf40510`、空、`2bf6a5708bbd`、`a3700ff555bd`、`30b59530cbd0`、`581ce43945af`）。第 1 轮裁定要的是「七项门禁的输出尾部与日志哈希」，输出尾部一项也没贴，连 `lint:deps` 的尾行也不再贴。`lint:oxlint` 的日志是「空」，没有尾部可读。`git ls-files --eol \| grep -c w/crlf` = 0，评论里有，我在头上自跑也是 0（自跑不算证据）。缺的是六项以上的命令输出尾部，各一两行即可。 |
| 10 | 达到 | 6665868317 §2：三条 `git grep` 均空（`gates/greps.log` `8d0c662cdc8b67b5`）。 |

**性质及证据义务**

| 义务 | 结论 | 依据与缺项 |
| --- | --- | --- |
| 「用例 → 缺陷 → 变红」表 | 部分达到 | 记录在成员 `verification/README.md` 的 C01–C52：54 条中 52 条变红，C37（等价）、C50（交探索器）存活。另有探索器负控 N1–N7、TLC 负控 9 个。这些变红证据的有效头见下一行。 |
| 「全部手工变异在最终 head 上重跑」（第 1 轮裁定要求） | **未达到** | README 写「在最终 head `e510d444f` 上跑」，C51、C52 在 `da392b283` 上跑。最终 head 是 5204d3799。`e510d444f` 之后 `src/` 有两处行为改动：`1a143a4d4`（`calls.ts`、`lost.ts`、`tasks.ts`，F1(d) 的 `loseInScope`）与 `104261a42`（`calls.ts` 的 S8 先判关停）。受它们影响的 C11–C14、C24（`lose` 路径）、C07、C36、C44（关停）没有在最终 head 重跑。6665868317 §6 自己写的也是「在 `e510d444f` 上」。另外，F1(d) 的 `loseInScope` 与 S8 在 `calls.ts` 的新检查没有各自的 C 行变异。它们只有改动前变红的新用例（`f1d/red.log`、`s8/red.log`）和探索器 P13 与 P14。N1–N7 里没有一条翻转 `loseInScope`。 |
| 不重发 | 达到 | C45（任务）、C46（发出后取消）、C25/C26（换代）；6665868317 没有重复，README 里有。 |
| 取消后不等对端 | 达到 | C16，`cancel.spec.ts`「does not wait for cancelRequest」。 |
| 映射表每行一个变异 | 达到（受上面「重跑」一项的限制） | C07–C14、C47。N4 的两行有对应行。 |
| 形式化守护（派发后追加的义务） | 达到 | P9–P14，11 个场景零违例，TLC 15 份配置符合判读；6665868317 §3 与 README 核对一致。 |
| 隔离的变异 | 达到 | C30a/b、C32a/b、C33、N4a–d。 |

**交付范围与门禁的旁证**
- 范围外改动：第 1 轮到 head 的差分里，`packages/mcp/mcp` 与 `mcp-contract` 之外的文件为 0。契约的 `classify.ts`、`outcomes.ts`、`index.ts`、`docs/public-api.md` 以及它们的用例，超出规格原写范围，依据是第 1 轮裁定第 6 条，见冲突项 4。
- 变异之外的证据，6665868317 没写：差分变异未跑（第 2 轮评审 D 面跑，不在本卡验收内）。

**未达到项各缺什么**
1. 验收 2：卡上一句说明，或第 12、13 步的标签用例，加上对「已定事项 28 第 9 步改称 MC-16 第 12、13 步」的说明。
2. 验收 9：六项门禁（`typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`check:design`）的输出尾部，贴在卡评论里。
3. 变异重跑：`1a143a4d4`、`104261a42` 之后的 C 序列在 5204d3799 上重跑，或写明哪些行不受影响；F1(d)、S8 各补一条能翻转的变异，或写明由探索器的哪条负控承担。

**冲突项（裁定或修订与派发时卡文、规格原文）**

调度者裁定与追加记录未在卡正文或规格正文落地的，已在第 1 轮裁定里说明「波末写回」，这里只列现仍成立的：
1. 卡正文「契约变更：additive」「两契约成员只做可加改动」与已定事项 7（`McpPorts.checkOutput` 必填）、已定事项 4 及 fix1 自裁 3（`ContinueRequest` 两字段都缺是前提违反，TypeError）冲突。裁定「本卡的可加指公开形状」，卡正文限定句等波末。契约 SPEC 决定清单第 26、27 条已记出处。
2. 波段规格已定事项 31、MC3-7（`cancelTask` 不建连、不为取消启动新进程）被闭包规格第 5 条（契约 S2）取代；波段规格已定事项 19、27 被第 9 条收窄；波段规格原文待波末写回（第 1 轮裁定 2、3）。
3. 闭包规格第 1 条与已定事项 28（「每步失败答未发出并撤销占位」）：第 1 轮裁定的根因第 1 点改为「未发出且停止信号已到期 → 键转已结束、答 `cancelled`」。键随后可再用（`in-flight.ts` 的 `reserve` 对 `ended` 放行），但 `cancel` 此后答 `no-call-in-flight` 而不是 `unknown`。
4. 闭包规格写范围：契约 `classify.ts`、`outcomes.ts`（新值 `output-check-failed`）、`index.ts`、`docs/public-api.md` 与相应用例，契约 SPEC 的 R2、S2、决定清单、依据表，都在原写范围之外（原写范围只许改 S3、O1、`./testing` 样本列表）。依据是第 1 轮裁定第 6 条（吸收点放 `classifyOutcome`）与追加记录，范围扩大由卡拥有者裁定，没有改规格正文的写范围一节。
5. 闭包规格「reduce 已定的事」第 2 条（转 `lost` 按契约 S7）与成员的按原因转 `lost` 的偏离（第 1 轮 B1，退出条件是契约给出标记，计划 6b）冲突。偏离表登记，契约的形状改动未做。
6. 闭包规格第 2 条第 5 点的「`ensure` 失败映射」与第 1 轮裁定 N7：任务操作新建连接时 `discover` 无应答、时限先到、建连途中关停都答 `connection-unavailable`，`effect-unknown`（`no-connection`）只留给 S2 的「不能新建」。闭包规格第 5 条与验收 5 写的是后者的宽口径。
7. `w3-mcp-call-model` 追加记录（F1(b) 作为端口前提 WF5）与闭包规格「性质及证据义务」的「每个异步副作用有等待上界或明确拥有者」：信号触发后 `transport.call`、`transport.answer` 的有界结束依赖传输按契约 T5 的义务，不是调用口自己的上界。
8. 契约 S8 修订（`closeAll` 之后 `continueWithInput` 答「未发出：`connection-unavailable`」，`104261a42`）与已定事项 29、闭包规格「reduce 已定的事」第 4 条（代际不同答 `unknown`）：`closeAll` 之后后者不再成立。
9. 与 `w3-mcp-lifecycle` 的 P8 A1 理由冲突：F1(d) 之后调用与任务操作转 `lost` 时不等拆除（`loseInScope`），成员 SPEC 已知限制「拆除的端口挂起」收窄为发现的调用方。闭包规格第 2 条（「经连接表已有的 `lose`」）未改。
10. 契约内部冲突，仍未决：R1「资格非 `granted` 只答 `Refusal`」与 S2 任务操作答 `effect-unknown`（`no-connection`）；组页 `architecture.md:497,504` 的 `cancelTask` 与 S2 不一致。归计划 6b 与波末写回。
11. 闭包规格的追加记录（13:30）把形式化义务加给了本闭包的评审之外的 `w3-mcp-call-model`；卡正文的验证拥有者表与 C3–C4 判据仍没有该义务，等波末加限定。卡正文「当前执行与交接」仍写「W2 已收波，准备开 W3」，W3 行写 `w3-mcp-call` 首项是连接表遗忘谓词，与闭包目标边界不符，第 1 轮裁定 6 称波末更新。

**子代理的通过不是接受，上述未达到项由父会话保留。**

## C. 设计与实践（general-purpose，opus，high）

范围：`git diff 7d91a330c..5204d3799`，覆盖 `packages/mcp/mcp/src/`、`tests/`（含 `tests/model/`）与 `packages/mcp/mcp-contract/src/`。判据为 ub-mode、`pstack:typescript-best-practices`、`docs/defensive-patterns.md`，以及 `layers-and-dependencies.md`「方法依据与采用范围」。只读，没有改工作树。两个探针放在工作树外的 `/tmp/call-c2-probe/`，用 `npx vitest run --config /tmp/call-c2-probe/vitest.config.mts` 在真实装配上运行。

## 结论：第 1 轮 C 的根因在结构上已经消除，不是补洞

1. **一个出口。** `perform`（`calls.ts:294-326`）从 `reserve` 起由一个 `try/finally` 收口，只调用一次 `inFlight.conclude(key, phase)`。`InFlightCalls.conclude`（`in-flight.ts:69-75`）按阶段和 `stop.aborted` 判定：结束，或撤销占位。第 1 轮散在 6 处的 `release`/`markEnded` 已经删除。T9、`checkOutput` 抛出、本包的编程错误都经过这个 `finally`。
2. **一个停止信号。** `reserve` 交出 `AbortSignal.any([signal, cancel.signal])`。发出前的关口、存储读取和 `ensure` 都经 `under(stop, …)` 等待，`answerOf` 也在同一个 `stop` 下等应答。`stopOf` 和重复的 `cancelled` 字段已经删除。
3. **发出后不等对端。** `cancelRequest` 交给 `scope.spawn`（`calls.ts:282`）。
4. **本包计算不进 `ask`。** 任务操作的 `request(send, read)` 把端口调用和读答复分成两个参数（`tasks.ts:148-165`），由函数形状保证。`classifyOutcome` 在契约里吸收 `checkOutput` 的抛出（`classify.ts:34-42`），所以 O1「全函数」成立。
5. **发出代际。** `markSent(key, connection, ensured.generation)`。

机械守护有两层：探索器的 P11（`P11-answered-with-open-reservation`、`P11-reservation-left`、`P11-concluded-twice`），以及 `in-flight.spec.ts` 的 `conclude` 用例。`loseInScope` 声称「返回前连接已拒绝请求」，依据是 `builder.markLost` 在第一个 `await` 之前同步执行 `entry.connection.lose(reason)`（`build.ts:161`），我核对过这一点成立。但这个保证靠异步函数的同步前缀，跨了三层函数（`loseInScope` → `table.lose` → `markLost`），只由注释守住，见非阻断 6。

第 1 轮 C 的其余项：

| 项 | 状态 |
| --- | --- |
| 阻断 1–3 | 已消除 |
| 阻断 4（`markSent` 代际） | 值已改对，还有一个窗口，见非阻断 1 |
| 非阻断 1、2 | 已消除 |
| 非阻断 3（`decideForUse` 共用） | 已消除 |
| 非阻断 4（先判关停） | 已消除 |
| 非阻断 5（`lose` 收进一处，`connectionFailureOf` 共用） | 已消除 |
| 非阻断 6（`issuedAt` 现在被读取，`tasks.ts:155`） | 已消除 |
| 非阻断 7（依赖类型方向） | 改了，但成了类型环，见非阻断 8 |
| 非阻断 9（`holdingAt` 的 `reached` 排次序） | 已消除 |
| 非阻断 10（`Sent<P>` 对象参数） | 已消除 |

## 阻断

无。

## 非阻断

1. **发出与登记之间的 `cancel` 不核代际。** 位置：`calls.ts` `answerOf` 和 `InFlightCalls.cancel` 的 `reserved` 分支。
   - 探针 `cancel-during-send-gen.spec.ts`：`transport.call` 还没返回时，连接 `lose`，再经 `refresh` 重建到第 2 代，这时 `cancel` 答 `signalled`。`call` 返回后，`cancelRequest` 发给了第 1 代已关闭的传输。读数：`{"answer":"signalled","cancelRequests":[1],"cancels":1}`。
   - 这符合 MC-12（只占位答 `signalled`）和 MC-16 第 11 步（「含落在发出与登记之间的」）。但 MC-12「代际已换不触发」这条规则的理由在这个窗口里失效了。
   - 根在形状：「已发出调用的代际是否仍是当前」这个判断只在 `cancel` 的 `sent` 分支做，`answerOf` 的路径不做，违反 ub-mode「一个决定只在一处」。另外，发出代际在 `transport.call` 之前就已知（`ensured.generation`），却到 `await` 之后才登记。
   - 建议：在 `Entry` 加一个 `sending` 阶段，调用 `transport.call` 之前就记下连接与代际，让 `cancel` 全程按代际判。或者在 `answerOf` 里 spawn 之前先核 `on.ensured.connection.isCurrent(on.ensured.generation)`。还有一种做法：SPEC 写明这个窗口。危害低，因为请求经 `ask` 发出。

2. **阶段有两个来源。** 位置：`perform` 的局部变量 `let phase` 与表项的 `Entry.phase`。
   - T9 时两者不一致：表项是 `reserved`，局部变量是 `sent`。`in-flight.spec.ts:200` 专门固定了这种情形。
   - `markSent` 对非 `reserved` 的键抛出 `TypeError`（`in-flight.ts:57-58`），这是「不该发生」型的守卫，违反 typescript-best-practices「constructive modeling」。
   - 建议：`reserve` 交出一个 `Reservation` 句柄（`stop`、`sending(conn, gen)`、`conclude()`），阶段只存在表里。这和第 1 条是同一处改动，`perform` 的可变局部变量和 `TypeError` 守卫都会消失。

3. **「cancelled」由两处决定。** 位置：`under` 返回 `fail(CANCELLED)`（`calls.ts:165,167`），`perform` 的 `unsent` 又在 `stop.aborted` 时改成 `CANCELLED`（`:300-301`）。
   - `under` 只在 `stop` 已触发时给出 `CANCELLED`，所以两处任删一处，行为都不变，等价变异会存活。违反 ub-mode「一个决定只在一处」。
   - `under` 的签名 `F | typeof CANCELLED` 实际展开成整个 `NotSentReason`，于是 `prepare:228` 要用 `'stage' in` 区分两种失败词汇。
   - 建议：`under` 只交出 `'stopped'` 这类哨兵，由 `perform` 统一判为 `cancelled`。

4. **建连失败映射的 connect 阶段一条规则写了两份。** 位置：`notSentOfEnsure`（`calls.ts:90-94`）与 `failureOfEnsure`（`tasks.ts:51-53`），都是 `failure.reason.kind === 'effect-unknown' ? CONNECTION_UNAVAILABLE : failure.reason`。
   - settings 阶段两边的映射本来就不同，是合理差异；connect 阶段的规则相同（「`discover` 的效果未知不是本请求的效果未知」）。
   - 同类小重复：`classifyOutcome` 的上下文在 `outcomeOf` 与 `resultOf` 各拼一次；`ensureOptionsOf` 与 `tasks.ts:93` 的内联写法相同；`{kind:'connection-unavailable'}` 在 calls、tasks、lost 三个文件各有一个不同类型的常量。
   - 建议：connect 阶段的规则移到 `lost.ts` 或 `entry.ts`，挨着 `EnsureFailure`。

5. **任务操作的关口等待没有界，也没有登记。** 位置：`tasks.ts` `built` → `decideForUse` → `admit`。
   - 这一步不在任何时限或信号下，任务时限从请求才开始（MC-17 第 4 步）。采用或资格端口永不答复时，`queryTask` 等操作也永不返回。
   - SPEC「已知限制」只登记了 `refresh` 的关口与存储读取，还写了「调用口没有这项限制」，没有提任务操作。这是第 1 轮之前就有的写法，本轮改了 `built` 但没有处理。违反 DP-06（异步等待须有边界或明确拥有者）与 DP-10（规格与实现对齐）。
   - 建议：登记为已知限制，或者把关口放进连接时限。

6. **「拒绝请求先于返回」只由注释守住。** 位置：`lost.ts:32-44` `loseInScope`。
   - 它依赖 `table.lose` 和 `markLost` 在第一个 `await` 之前同步改状态。将来有人在 `table.lose` 开头加一个 `await`，这个保证会静默失效，类型和结构都拦不住。
   - 建议：表暴露一个同步的「标记失联」，拆除另走 spawn。或者 `lose` 交出 `{ marked, done }`。我没有核对 P14 或用例能否抓到这类退化，留给 A。

7. **`checkOutput` 的抛出被吸收后没有诊断出口。** 位置：`classify.ts:37-41` 用的是裸 `catch {}`。
   - 结论偏安全（判 `violates`），这是卡拥有者的裁定，不构成「假成功」。但原错误（例如 schema 引擎不支持的关键字）丢了，宿主看到 `output-check-failed` 却无从排查。这与 DP-01 的「原错误写进诊断」、DP-05 的「校验回调失败不能静默」有张力。
   - 另外，`OutputCheck.violates.reason` 是开放的 `string`：宿主校验函数自己返回 `'output-check-failed'` 时，和吸收的情形区分不开，违反 typescript-best-practices「discriminated unions」。属于契约层，建议记进 6b 或 K7 待办。

8. **依赖类型成了环。** `calls.ts` 和 `tasks.ts` 的 `Pick<InvokerDependencies, …>` 从 `invoker.ts` 取类型，`invoker.ts` 又引入这两个模块的 `createCalls`/`createTasks`。环只在类型层，运行时会被擦除，但叶子模块依赖了组装者的类型。更顺的方向是两个模块各自声明自己的依赖，由 `invoker.ts` 合成 `CallsDependencies & TasksDependencies`。`lint:deps` 的结论归 A。

9. **契约类型允许非法值。** `ContinueRequest` 的 `requestState` 与 `inputResponses` 都是可选，运行时由 `checkRequest` 抛出 `TypeError`。JavaScript 调用方需要这道检查，但 TypeScript 类型可以写成「至少一个」的并集，让非法值写不出来（typescript-best-practices「constructive modeling」）。这是契约形状问题，不是本包的。

10. **可读性小项。**
    - `outcomeOf` 名字像纯推导，里面却有两个副作用（转 `lost`、登记任务）。`notSentBy` 的名字也没说它会转 `lost`。
    - T9 用 `ask(…, undefined)` 的 `undefined` 当「违约」哨兵（`calls.ts:307-315`），换成具名常量更清楚。
    - `Sent<P>.access` 只读了 `.tenant`，`on.key.tenant` 已经有。
    - `asIs` 带一个没用的参数 `_on`。
    - MC-16 第 8 步「发出前最后核对停止信号」在代码里没有独立对应，靠 `under` 收尾的复核。`await prepare` 与 `transport.call` 之间还有几个微任务的空隙，空隙里的 `cancel` 会让传输收到一次带已触发信号的 `call`（T5 答 `not-sent`，最终答复仍是 `cancelled`）。SPEC 或代码二选一写明即可。

11. **关停先判在任务操作上有一个时序边界，供 A 或卡拥有者判断，我不列为缺陷。**
    - 探针 `task-closeall-during-gate.spec.ts`：任务操作正在等关口（`decideForUse`）时 `closeAll` 完成，这次操作答 `connection-unavailable`，紧接着的同一操作答 `effect-unknown(no-connection)`。
    - 原因：关停在两处判。`connectionOf` 入口答 `NO_CONNECTION`；`ensure` 入口的 `shut` 返回 settings 阶段的 `connection-unavailable`，`failureOfEnsure` 原样交出。`EnsureRefusal` 不区分关停与临界区时限到期。
    - MC-17 第 3 步把「建连途中关停」定为 `connection-unavailable`，这次关停发生在建连开始之前，落在 S8 字面与 MC-17 映射之间。调用口两边都答 `connection-unavailable`，不受影响。

## 用例与探索器

- `cancel.spec.ts` 的赛跑用例改用 `holdingAt(...).reached` 排次序，已经核对调用到了传输。
- 剩下的 `await settled()`（例如 `invoke.spec.ts:718,732-733`）后面都跟着计数断言（`tools/call` 长度为 1），走错分支时会失败，不会误通过，可以接受。`turns(5)` 是「不挂住」的活性上界，魔数可以接受。
- 有一处仍靠轮次：`cancel.spec.ts`「a store read that never answers」用 `turns(2)` 加 `pending` 判断，没有确认已经到了存储读取。因为 `settled` 是 `setImmediate`，会排空微任务，实际顺序是确定的；但给 `store.read` 包一个 `reached` 会更直接。
- 新用例断言的是公开答复：`cancel` 的答复、`tools/call` 计数、`status.inspect` 和结局值，没有断言内部调用。
- **`CountedInFlight` 只观察，不改变被测行为**（`tests/model/explore.ts:434-466`）：每个覆写都先调 `super`，再报给 desk；desk 的 `report` 只往列表追加，不抛出（`:1291-1298`）。P11 是在内部方法调用这一层投影的；如果按非阻断 1、2 改成句柄，P11 的投影要跟着改。

## 未覆盖

- 没跑结构读数、差分变异和全套门禁（归 A、D）。
- 没逐行读 `tests/model/explore.ts` 新增的约 650 行里与计数视图无关的部分，也没读 `scenarios.ts`、`ports.ts` 的细节。
- 契约 SPEC 与 README 的表达归 B。

探针文件：`/tmp/call-c2-probe/cancel-during-send-gen.spec.ts`、`/tmp/call-c2-probe/task-closeall-during-gate.spec.ts`。

## B. 表达（design-reviewer，expression，opus，xhigh）

本次是「表达」判断。我读的判据页是 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/.meta_harness/.claude/skills/harness-design-handbook/references/review/expression.md`，只读了这一页。它是宿主投影，canonical 源在同树 `.meta_harness/agents/skills/harness-design-handbook/canonical/references/review/expression.md`，两者我没有逐字比对。

**评审对象**：W3 调用口，PR #1141，第 2 轮增量。工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，head `5204d3799`，第 1 轮 head `7d91a330c`。

**范围**：
- 成员：`packages/mcp/mcp/` 下的 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/`、`src/README.md`、`src/index.md`、`tests/README.md`、`verification/README.md`、`verification/models/README.md`。
- 契约：`packages/mcp/mcp-contract/SPEC.md` 改动的句子（前言、依据表、第 26–27 条、R2、S2、S3、O1、O3），以及它的 `docs/public-api.md`。
- 只沿依赖展开到：契约 S1、S5、S7、S8、T5、T9、R1、R6、R7；`src/calls.ts`、`src/internal/in-flight.ts`、`src/internal/lost.ts`、`verification/models/Calls.tla:71-73`、`tests/model/scenarios.ts:169-170`、`tests/invoke.spec.ts` 与 `tests/cancel.spec.ts` 的用例标题。

**完成程度**：范围已覆盖。我没有 git，「本轮改动」的判断依据是第 1 轮全文的原句与四份闭包规格的追加记录。

**工具输出**：简报附了 `tmp/closures/w3-mcp-call/gates-r2/`（`head.txt` 为 `5204d379…`）。`check:docs` 与 `check:design` 都 PASS，但它们只核链接、镜像、出处与拥有者，不核语义与编号读法。下面的结论都是人工核对。

---

## 阻断

本次表达与规范范围内未发现阻断问题。

---

## 非阻断（按影响排序）

**R2-1 `closeAll` 之后，S8 与 S1 谁先判，成员里两个操作取了相反的答案**
- **类别**：跨契约一致。
- **位置**：
  - SPEC MC-16 第 3 步（`:118`）。
  - MC-7（`:63`）。
  - 「所有权」（`:171`）。
  - 偏离表（`:159-163`）没有对应行。
  - 实现在 `calls.ts:209`。
- **原句**：
  - `:118`：「先判关停：`closeAll` 之后答「未发出：`connection-unavailable`」，不问端口……再过关口 `admitForUse`」
  - `:63`：「`refresh` 的次序是关口 → `ensure`」
  - `:171`：「`refresh` 答 `connection-unavailable`；`invoke` 与 `continueWithInput` 答……不问端口」
- **依据**：
  - 契约 S1（`:299`）：「除 `ActionInvoker.cancel` 与 `Connections.closeAll` 以外，每个操作先经 `AdoptionView.endpoint` 核采用」。
  - 契约 S8（`:351`）只给任务操作写了次序（「先按 S2 判发起者……然后才判 `closeAll`」），没给 `invoke`、`continueWithInput`、`refresh` 写次序。
- **触发场景**：`closeAll` 之后，对一个未采用或被设置挡下的接入点，分别调用 `refresh` 和 `invoke`。
- **后果**：
  - `refresh` 先过关口，答 `not-available-to-you` 或 `blocked`。
  - `invoke` 答 `connection-unavailable`，不问采用。
  - 所以 `:171` 对 `refresh` 的平铺说法不成立。
  - `invoke` 偏离 S1 的字面次序，却没有登记偏离。
  - 第二个实现者两种次序都能选。
  - 这是本轮 S8 修复引入的。
- **作者需明确**：
  - 成员对 `closeAll` 之后的三个操作用同一条规则，并同步写进 MC-16 第 3 步、MC-7 与 `:171`。
  - 如果只对调用口先判 S8，就登记对 S1 的偏离，或者等契约裁定。见「范围外 1」。

**R2-2 C 序列的变异被称为跑在「最终 head」上，但之后源码又改过**
- **类别**：形式对应。
- **位置**：
  - `verification/README.md:251`；表的「运行时的 head」一列都是 `e510d444f`。
  - SPEC MC-16 映射表第 1 行（`:134`）。
- **原句**：
  - `:251`：「在最终 head `e510d444f` 上跑所列用例」
  - `:134`：「C07：`settings` 阶段的原因改答 `unknown` →「step 7: after closeAll」「step 7: a call that joins」变红」
- **依据**：
  - 同一页记录了 `e510d444f` 之后的两次源码改动：`:164`、`:170` 的 F1(d) 修复 `1a143a4d4`（`loseInScope`），和 `:242` 的 S8 先判（实现在 `calls.ts:209`）。
  - 本页只为 N5、C50 和「变异 S1」记了重跑。
  - 第 1 轮裁定第 9 条要求全部手工变异在最终 head 上重跑。
- **触发场景**：验收方把「最终 head」读成当前 head。
- **后果**：
  - 读 `calls.ts:209` 可知，「step 7: after closeAll」现在在第 3 步就答复，不再经过 C07 改动的那段映射。所以 C07 在当前 head 上让这一例变红的说法很可能不成立（我没有运行，标为未验证）。
  - 碰到 `lose` 路径的 C11、C14、C24、C38、C51，在当前 head 上的状态未知。
  - 声明超出了证据。
- **作者需明确**：
  - 把「最终 head」改成实际的 head，并写明哪些 C 行早于 `1a143a4d4` 和 `104261a42`。
  - 或者在当前 head 上重跑受影响的行，再更新记录。
  - 映射表第 1 行的「关停」一支，改引一个确实经过 `ensure` 的 `settings` 阶段的用例。
- 证据是否够接受归 E 判，在那边可能是阻断；D 应核差分变异有没有覆盖 `calls.ts:209` 与 `loseInScope` 那几行。

**R2-3 第 11 步「迟到的应答没有人读」可以照字面实现成发现 F2**
- **类别**：可实施性。
- **位置**：SPEC `:126`、`:174`。
- **原句**：「`cancelRequest(requestId)` 一次，交给连接表的作用域……迟到的应答没有人读。」
- **依据**：
  - SPEC P7（调用口场景，`:310`）：「被放弃的调用的应答也经 `ask` 读取。修复轮之前有反例（发现 F2）」。
  - `verification/README.md:171`。
  - `calls.ts:277-280` 用 `waitAtMost(ask(() => answer, …))`。
- **触发场景**：照第 11 步实现的人，停止信号触发后不给 `answer` 挂处理；之后对端的应答 reject（T9 允许这样）。
- **后果**：出现未处理的拒绝，F2 重现，违反 P7。同一份 SPEC 对此给出两种读法。
- **作者需明确**：在第 11 步与 `:174` 写明：应答总是经 `ask` 读取，它的 reject 被吸收；停止之后只丢弃它的值。

**R2-4 契约改动只记了两处出处，前言少数了（第 1 轮 N12 的残留）**
- **类别**：引用与归属。
- **位置**：契约 SPEC 前言 `:54`、依据表 `:13`、「三个入口」的 `.` 行 `:90`、O1 `:219`、O3 `:225`、R2 `:267`。
- **原句**：
  - `:54`：「第 26、27 条是调用口闭包随后加的两处」
  - `:225`：「……原因是 `output-check-failed`……以常量 `STRUCTURED_CONTENT_MISSING` 与 `OUTPUT_CHECK_FAILED` 从根入口导出」
  - `:267`：「`cancelled`：……收到了 `cancel`，或调用方的 `signal` 中止」
- **依据**：
  - O1/O3 的吸收、新的契约值与两个根导出，来自调用口第 1 轮裁定 6 与 fix1 已定事项 6。
  - R2 放宽 `cancelled`，来自 fix1 追加记录里对写者自裁第 2 条的采纳。
  - 契约 `docs/public-api.md:9` 已经列了这两个常量。
- **后果**：
  - 消费者找不到这三项改动的决定出处。
  - 前言让读者以为调用口闭包只改了两处。
  - `.` 行与 `public-api.md` 对根导出的说法不一致。
  - 依据表 `:13` 那一行注明 2026-11-04，却装着 2026-11-05 的决定。
- **作者需明确**：
  - 为 O1/O3 及两个常量、为 R2 的 `cancelled` 各补一条带出处的决定。
  - 改正前言的计数。
  - 在 `.` 行加上两个常量。
  - 调用口的决定另立一行依据，或者改 `:13` 的日期与范围。
- 「可加」的说法本身成立：第 26 条已写明对构造 `McpPorts` 的宿主不可加；第 27 条对调用方确实是放宽。

**R2-5 步号与编号读法的残留（第 1 轮 N1 与漂移第 13 条）**
- **类别**：引用与归属。
- **位置与原句**：
  - `tests/invoke.spec.ts:261`：「step 7: after closeAll nothing connects…」。SPEC `:115` 规定「用例标题与源码注释里的「step N」指它」，而 S8 先判现在是第 3 步（`:118`）。
  - SPEC `:18`：「公平性前提写作 WF1–WF3」「P8 的两条定理写作「P8 T1」「P8 T2」」。但 `:251-252` 已经有 WF4、WF5，`:276-277` 已经有 P14 T1、T2。
  - SPEC `:130`「（已定事项 2）」：按 `:18` 的规则，这应读作 W3 MCP 线的已定事项 2，而它实际指闭包 `w3-mcp-call`「reduce 已定的事」第 2 条，依据表也没有列 W3 线的第 2 条。
  - SPEC `:146`「闭包规格第 5、6 条」：现在有四份闭包规格，没写是哪一份。
- **后果**：按 SPEC 自己的读法回查，会落到错误的步号或错误的材料上。
- **作者需明确**：
  - 把用例标题改成 step 3。
  - `:18` 补上 WF4–WF5 和 P14 T1/T2 的读法。
  - `:130` 与 `:146` 的编号写明来源。

**R2-6 「未覆盖」对 C50 那种交错的说法比证据宽**
- **类别**：形式对应。
- **位置**：SPEC `:217` 与 `:242`；`verification/README.md:173`、`:306`。
- **原句**：
  - `:217`：「只由 `in-flight.spec.ts` 与 `perform` 的结构保证……调用口的并发由 `w3-mcp-call-model` 的探索器与 TLA+ 模型承担」
  - `:242`：「两种证据都表达不了；它由实现的那一行守住，没有变红的用例」
- **后果**：
  - `in-flight.spec.ts` 测不到 `calls.ts` 里的 `under`，C50 在服务层是存活的。
  - 后半句又暗示探索器覆盖了这种交错。
  - 同一页有两种说法。
- **作者需明确**：让 `:217` 与 `:242` 说同一句。

**R2-7 WF5 记在 T5 名下，但 T5 原文没有承诺这件事**
- **类别**：跨契约一致。
- **位置**：SPEC `:252`；`verification/README.md:168`。
- **原句**：
  - `:252`：「WF5：传输的 `call` 在停止信号触发之后最终答复（契约 T5：以 `not-sent` 答已触发的信号，或已经发出）」
  - `:168`：「是传输按契约 T5 的义务」
- **依据**：契约 T5（`:458`）只写了两种情形：「`signal` 在调用前已触发」与「在发出后触发」。`call` 进行中、请求还没离开时触发的情形，T5 没有写。
- **后果**：P14 T2 的调用一句建立在一个契约里没有拥有者的前提上。传输实现者读 T5，看不出在那段时间里有尽快结束 `call` 的义务。
- **作者需明确**：
  - 成员一侧写明：WF5 是前提，T5 目前没写这一段。
  - 补句归契约 T 段的拥有者。见「范围外 2」。

**R2-8 `models/README.md` 对四个键的描述与模型不符**
- **类别**：形式对应 / 表达歧义。
- **位置与原句**：`verification/models/README.md:19`：「A 与 B 只差租户，A 与 C 只差对端账户，A 与 D 只差租户但主体文本相同」。
- **依据**：
  - `Calls.tla:71-73` 的定义：A 是（home, alice, main），B 是（away, mallory, main），C 是（home, bob, other），D 是（away, alice, main）。
  - `scenarios.ts:169-170` 写 C 是「bob of the same tenant」。
  - 所以 A 与 B 差在租户和主体，A 与 C 差在主体和账户。
- **后果**：按文中的说法读负控 `calls-bad-key-blind`（A 调 `invoke`，C 调 `cancel`，「键只按租户」），C 的 `cancel` 停住 A 的调用按 MC-12 是正确行为。这样负控看起来像是在报正确行为，P12 的证据会被读错。
- **作者需明确**：按模型重写这一句。

**R2-9 README 两种语言的验证段仍只写 P1–P8**
- **类别**：归属越界（复述滞后）。
- **位置与原句**：`README.md:95`「The lifecycle properties P1–P8 of the connection table also have a TLA+ model…」，`README_ZH.md:95` 相同。
- **依据**：SPEC `:225` 与 `verification/README.md:3` 已经写了 P1–P14 与 `Calls.tla`。
- **作者需明确**：补上调用口的模型与 P9–P14，或者只链接到 SPEC「性质与证据」。

**R2-10 变异编号的残留**
- **类别**：引用与归属 / 形式对应。
- **位置与原句**：
  - `verification/README.md:178`：「本页有三个变异序列」。但 `:242` 又出现「变异 S1」：它不属于这三个序列，名字还与契约条款 S1 撞名。
  - N 序列表里的「C50」行与「号码不互指」不一致（`:178` 已说明）。
  - C21、C47、C48 写的「自裁 1、6、2」：第 1 轮 `w3-mcp-call` 的写者和 fix1 的写者各有一组自裁，这里没写是哪一组。
  - SPEC MC-12（`:83`）的两句变异声明没有对应的 C 行：「`reserve` 查后经 await 再占 → `in-flight.spec.ts`「exactly one of two concurrent callers」」；「`markSent` 记视图的实时代际 → `in-flight.spec.ts`「by the generation it was sent on」……」。C22 改的是 `calls.ts`，只列了 `invoke.spec.ts` 一例。
- **作者需明确**：
  - 把 S8 的变异编进 C 序列，或者声明第四个序列。
  - 自裁编号带上来源。
  - 没有记录的变异声明，补上记录或标为「未验证」。

**R2-11 B1 的残留**
- **类别**：表达歧义。
- **位置与原句**：
  - `src/internal/lost.ts:59`：「the connection is gone (S7)」。
  - `lost.ts:76-77`：「so the transport is no longer usable (S7)」。
  - 文件头 `:3-6` 已经改成「按原因判断，偏安全」，与这两处说法相反。
  - 偏离表 `:163`：「`not-sent` 的每个原因……都转 `lost`」。但第 9 步（`:124`）对已触发信号下的 `connection-unavailable` 有 T5 例外，不转 `lost`。
- **作者需明确**：两处函数注释改成与文件头同一口径；偏离表这一行补上 T5 例外。

---

## 第 1 轮逐条结论

- **B1**：已改。偏离表第 3 行（`:163`）、`docs/architecture.md:23`、`src/index.md:25`、`lost.ts` 文件头。残留见 R2-11。
- **N1**：大部分已改（`:115` 定了步号读法；`cancel.spec.ts:112,131,207` 已对齐）。残留见 R2-5。
- **N2**：已改（`verification/README.md:178` 三个序列分开；C 序列逐行写了 head；`:3` 范围；`:212`）。残留见 R2-10、R2-2。
- **N3**：已改。MC-12 `:83` 不再声称 M17；`:173`、`:310` 说明 M17 在新结构下不存在。
- **N4**：已改。映射表每行由 C07–C14 覆盖（`:134-140`；verification `:261-268`）。第 1 行的关停一支见 R2-2、R2-5。
- **N5**：已改（第 2 步 `:117`、第 13 步 `:128`、MC-12 `:83`）。
- **N6**：已改（第 7 步 `:122`；`docs/architecture.md:51` 一致）。
- **N7**：已改（MC-17 第 3 步 `:149`，按卡拥有者的裁定）。
- **N8**：已改（MC-17 第 1 步 `:147`；`:167`）。
- **N9**：已改（MC-11 `:79`、`:171`、`:167` 已去重）。
- **N10**：已改（P9–P14 与 `Calls.tla`，`:268-310`）。残留见 R2-6。
- **N11**：已改（README `:87` 只链接条款；`docs/flows.md:93,97` 与 `architecture.md:51` 只复述并链接）。残留见 R2-9。
- **N12**：部分已改（第 26、27 条 `:81-82`，前言 `:54`）。残留见 R2-4。
- **N13**：已改（MC-16 第 1 步 `:116`、契约 S2 `:302`、第 27 条、C28）。

**漂移清单**：
1. 已改（`architecture.md:51` 与第 7 步）。
2. 已改（`architecture.md:37` 写「三个 `class`」，`src/README.md:27`，`object-model.md:3`）。
3. 已改（`flows.md:97`）。
4. 已改，残留见 R2-11。
5. 已改，残留见 R2-2。
6. 已改（README 两种语言 `:99`）。
7. 已改（README 两种语言 `:64`）。
8. 已改（`:79`）。
9. 已改（`:171`）。
10. 已改（`:167`）。
11. 已改（`:83`、verification `:173`/`:310`）。
12. 已改（契约 R2 `:267`、S2 `:301`）；出处缺口见 R2-4。
13. 大部分已改，残留见 R2-5（`invoke.spec.ts:261`）。
14. 已改（verification `:3`、`:178`、`:212`）。

## 简报另核的四项

- **单一源**：守住了。行为只在成员 SPEC；README 与 `docs/` 只复述，并链接到 MC-12、MC-16、MC-17 的锚点。例外是 README `:95` 的滞后（R2-9），以及契约 `.` 行与 `public-api.md` 不一致（R2-4）。
- **三套变异编号与 P1–P14**：三处基本一致。`calls-bad-*` 与 P9–P14 的对应，在 SPEC `:312`、verification `:233`、models `:58-66` 三处吻合。例外见 R2-10、R2-8，以及 R2-5（`:18` 没有 WF4–WF5 与 P14 T1/T2 的读法）。
- **契约改动的出处与「可加」**：见 R2-4。
- **第 1 轮各项**：见上一节。

---

## 范围外待裁决（只列出，不据此否决）

1. **`closeAll` 之后 S8 与 S1 的先后**（`invoke`、`continueWithInput`、`refresh`）。
   - 甲：三个操作都先判 S8。代价：`refresh` 在关停后也不再问关口，MC-7 要改。
   - 乙：都先判 S1。代价：撤回 S8 修复里「不问端口」的部分，调用在关停后会问采用端口。
   - 拥有者：契约拥有者与卡拥有者。
2. **契约 T5 没写 `call` 进行中停止信号触发的情形**（R2-7）。拥有者：契约 T 段的拥有者（`w3-mcp-host` 或计划 6b）。
3. **第 1 轮范围外第 2 项在 HEAD 仍成立**：R1 `:263`「控制操作……只答 `Refusal`」与 S2 `:306` 的 `effect-unknown`（`no-connection`）冲突。拥有者：契约拥有者，计划 6b。
4. **R7 `:289` 对 `no-connection` 的定义**写的是「没有可重建连接的采用材料」，字面上不含「资格不是 `granted`」，而 S2 `:306` 把它归到 `no-connection`。拥有者：契约拥有者。

## 未覆盖

- **没有 git**：
  - 无法确认 `a446c2b9b` 到 `5204d3799` 之间 `src/` 没有变化。探索器与 TLC 的读数绑定在 `a446c2b9b` 上。
  - 无法确认成员依据表钉的契约修订 `104261a42` 已经包含契约的现行句子。
- **没有审读**：契约 T 段 T5、T9 以外的部分（T8 各行没有重读）；`tests/model/*.ts` 与 `Calls.tla` 只读了上面列出的几行。
- **不确定是否属于本轮改动**：生命周期探索器表（verification `:125-138`）和 `ConnectionTable.tla` 的运行记录（models `:88-107`）没有写对应的 head。
- **没有复跑**：变异、探索器与 TLC 都没有运行。R2-2 里 C07 的那条判断只来自读 `calls.ts:209`。
- **转交 A（正确性）**：`prepare` 在关口之前判 `isShut`（`calls.ts:209`）是否有意；`answerOf` 是否在每条路径上都经 `ask` 读应答。
- **转交 E（交付边界）**：C 序列是否在最终 head 上重跑（第 1 轮裁定第 9 条），在那边可能是阻断。
- **转交 D（差分变异）**：范围是否覆盖 `calls.ts:209` 与 `loseInScope` 的调用点。
- **转交「选择」判断**：S8 先于 S1 是否是想要的设计。

## 未决政策与缺口的 owner

- R2-1 至 R2-11 的成员侧修补：调用口的写者，或卡拥有者（reduce）。
- R2-4 的契约出处：卡拥有者。契约 SPEC 的这几句在调用口闭包的写范围内。
- 范围外 1、3、4：契约拥有者与 reduce。范围外 2：契约 T 段的拥有者。
- 证据重跑：E、D 的评审者与卡拥有者。

评审完成不代表规格已接受，也不代表实现已验证。

## 卡拥有者的裁定（C、B、E；A、D 交回后补）

三面都没有阻断。下面每条写处置：改（进入集中修复）、登记（写进 SPEC 的已知限制或说明）、6b（契约形状，归计划 6b）、波末（卡正文与波段规格的写回）。

### 先裁一条设计问题：`closeAll` 之后先判关停，还是先判采用（B R2-1、C 11）

裁定：要连接的操作在 `closeAll` 之后先判关停，不问端口。`refresh`、`invoke`、`continueWithInput` 都这样；任务操作先按 S2 判发起者（表内查找，不问端口），再判关停，这是 S8 原有的次序。

理由：关停是本实例生命周期的事实。之后要连接的操作不论采用与否都不能成功，答 `connection-unavailable` 对每个接入点都一样，不泄露接入点的任何信息，也没有要保护的效果。S1 先核采用，是为了决定请求者能否用这个接入点，并关掉撤采用的连接；关停之后这两件事都不存在。反过来，关停之后再问宿主端口，会让本实例依赖宿主在同一次关停里可能已经拆掉的端口；`refresh` 的关口还不在任何时限下（已知限制），会一直等。所以「关停之后不问端口」是更好的生命周期性质。

落点：契约 S8 加一句次序（关停先于 S1，不问端口；任务操作仍先判发起者）；成员 MC-7 的 `refresh` 次序改为「关停 → 关口 → `ensure`」，代码同步；MC-16 第 3 步、「所有权」一段与之一致。任务操作在关口等待期间发生的关停，关口之后再判一次，答 `effect-unknown`（`no-connection`），与 S8 一致（C 11 的探针给出了现在的不一致：先答 `connection-unavailable`，再答 `no-connection`）。

### C 面

1. 发出与登记之间的 `cancel` 不核代际：登记。这个窗口里请求可能已在线上，`cancelRequest` 发给请求所在的那个传输，是对的传输；答 `signalled` 是 MC-16 第 11 步已写的行为。SPEC 第 11 步补一句：窗口里的 `cancel` 不核代际，原因是发出代际在 `call` 返回之后才登记。不加 `sending` 阶段：它要同时改 `Calls.tla` 的阶段，收益只是窗口里一次答复的措辞。
2. 阶段两个来源、`markSent` 的 `TypeError` 守卫：改。`reserve` 交出一个 `Reservation` 句柄（`stop`、`sent(connection, generation)`、`conclude()`），阶段只存在表里；`perform` 的可变局部变量与守卫一起删掉。T9 也经 `sent(...)` 记发出（效果未知按已发出）。探索器的计数视图改为观察句柄的方法，P11 的三个检查照旧。
3. `cancelled` 两处决定：改。`under` 只交出「已停止」的哨兵，`perform` 一处判 `cancelled`；`prepare` 不再需要 `'stage' in` 区分。
4. connect 阶段的建连失败映射写了两份：改。一条规则一个函数，放在 `lost.ts` 或 `entry.ts`，调用口与任务操作共用；`classifyOutcome` 的上下文一处构造；`ensureOptionsOf` 共用；同类型的 `connection-unavailable` 常量只留一个。
5. 任务操作的关口等待没有界：登记。`TaskControl` 没有 `signal`，与 `refresh` 的关口同类。已知限制里 `refresh` 那一条扩到任务操作，并改掉「调用口没有这项限制」的对照句（调用口在调用方的 `signal` 下等）。给任务操作加 `signal` 是契约形状，记进 6b。
6. 「拒绝请求先于返回」只由注释守住：改。`table.lose` 改成同步函数，同步做完「标记失联、拒绝请求」，交回拆除与清单标记的 promise（例如 `{ done } | 'not-current'`）；`loseOn` 等它，`loseInScope` 把它交给作用域。将来有人在标记之前加 `await`，函数签名就变，类型检查会拦下。
7. `classify.ts` 的裸 `catch` 没有诊断出口，`violates.reason` 是开放字符串：6b（与 K7 一起）。
8. `InvokerDependencies` 的类型环：改。`calls.ts`、`tasks.ts` 各自声明依赖，`invoker.ts` 合成。
9. `ContinueRequest` 允许两字段都缺：6b。
10. 可读性：改。`outcomeOf`、`notSentBy` 换成说出副作用的名字；T9 的 `undefined` 哨兵换具名常量；去掉 `Sent.access` 里只为 `tenant` 存在的字段（如确实只读 `tenant`）与 `asIs` 的 `_on`；第 8 步与 `call` 之间几个微任务的空隙在 SPEC 第 8 步写明（传输收到已触发的信号，按 T5 答 `not-sent`，答复仍是 `cancelled`）。
11. 见上面的设计裁定。

### B 面

- R2-1：见上面的设计裁定。
- R2-2：改。C 序列里受 `1a143a4d4`、`104261a42` 影响的行（C07、C11–C14、C24、C36、C38、C44、C51）在最终 head 上重跑；F1(d) 的 `loseInScope` 与 S8 先判各补一条 C 行（翻转那一行、指定用例变红）；「最终 head」写实际的 head；映射表第 1 行「关停」一支改引一个经过 `ensure` 的 `settings` 阶段的用例。
- R2-3：改。第 11 步与「所有权」一段写明：应答总经 `ask` 读取，reject 被吸收；停止之后只丢弃它的值。
- R2-4：改。契约决定清单为 O1/O3 与两个常量、R2 的 `cancelled` 各补一条带出处的决定；前言计数改正；根入口 `.` 行补两个常量；调用口的决定另立依据行（日期 2026-11-05）。
- R2-5：改。用例标题「step 7: after closeAll」改为 step 3；SPEC 读法一段补 WF4–WF5 与 P14 T1/T2；「已定事项 2」「闭包规格第 5、6 条」写明来源。
- R2-6：改。两处说成同一句：C50 那种交错由 `perform` 的结构守住，服务层没有变红用例，探索器只覆盖它的场景所列交错。
- R2-7：改。WF5 在成员一侧写明是对传输的前提；契约 T5 补「`call` 进行中信号触发时尽快结束」一句，归 T 段拥有者，放进 `w3-mcp-host` 本轮修复（传输义务），两支合入父分支后一致。
- R2-8：改。按 `Calls.tla:71-73` 重写四个键的差别。
- R2-9：改。README 两种语言的验证段只链接 SPEC「性质与证据」，不再列编号。
- R2-10：改。S8 的变异编进 C 序列；自裁编号带来源；MC-12 的两句变异声明补记录或标为未验证。
- R2-11：改。`lost.ts` 两处注释与文件头同一口径；偏离表这一行补 T5 例外。
- 范围外 3、4（R1 与 S2、R7 的 `no-connection` 定义）：6b。

### E 面

- 验收 2：改。给覆盖分类与登记、覆盖收口的现有用例加「step 12:」「step 13:」标签；最终证据评论写一句：已定事项 28 的第 9 步就是 MC-16 第 12、13 步。
- 验收 9：最终证据评论贴七项门禁的输出尾部（各一两行），不只贴哈希。
- 变异重跑：同 B R2-2。
- 冲突 1–11：都是已裁事项的波末写回，或已登记的偏离，维持。冲突 3（未发出且停止信号已触发时键转已结束，`cancel` 此后答 `no-call-in-flight`）是第 1 轮根因裁定的结果，维持。冲突 7 的 WF5 由 B R2-7 的契约补句闭合。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

## 评审对象与完成程度

- 仓库与检出：`/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，head `5204d3799`。
- 范围：`git diff 7d91a330c..HEAD`，基线 `b2ba7dc89`。简报没有单写接受级别，因为它要求读 L3 热点，我按 L3 的问法做了。
- 第 1 轮的阻断逐条核过；卡拥有者本轮的裁定逐条核过；L3 热点逐行读过；检查表第 1–20 问都问过。
- 工作树保持干净：开始与结束时 `git status` 都为空，HEAD 不变。
- 工具产物的位置：
  - 探针与变异副本都在 `/tmp/ir-call-r2/`。
  - 度量产物写到了**主检出**的 `tmp/metrics/5204d3799/`，这是脚本自己的落点，目录被忽略。
  - 主检出另有一个未跟踪的 `docs/blogs/`，不是本次运行产生的。

## 工具一览

| 入口 | 命令 | 结果 | 输出在哪 |
|---|---|---|---|
| 变更清单 | `git diff --stat 7d91a330c..HEAD`，`git log --oneline` | 54 个文件，全部在 `packages/mcp/mcp` 与 `packages/mcp/mcp-contract`；28 个提交。与写入范围逐条对照归 E 面 | 本会话 |
| 验收与测试改动 | `git diff 7d91a330c..HEAD -- */tests` 筛被删的 `it`/`expect` 与 `.skip/.only/.todo` | 没有新增 skip/only/todo。被删的用例分两类，见本表下方 | 本会话 |
| 依赖规则 | `pnpm run lint:deps` | exit 0。「没有依赖违规、方向命中、成员之间的环，也没有未放行的组环（81 个成员、340 条成员边；1 个组环按具名例外放行）」 | `/tmp/ir-call-r2-lintdeps.log` |
| 结构度量 | `pnpm run metrics --coverage --base b2ba7dc89` | exit 0，耗时 19m41s。mcp 的覆盖率运行 exit 1，见本表下方 | `/tmp/ir-call-r2-metrics.log`；`/data/qiwei/repos/omne-harness-lite/tmp/metrics/5204d3799/` |
| 受影响测试 | 即上面那次覆盖率运行（mcp 全部 423 条） | 422 条通过，1 条超时，与第 1 轮同一现象 | 同上 |
| 失败归因 | `test:triage` | 无此入口适用于覆盖率运行，这一条未归因 | — |
| 全套检查 | — | 我没有跑。读了卡评论 6665868317 第 5 节；`gates-r2/` 的 10 份日志我逐个算了 sha256，前缀与卡上全部一致，见本表下方 | `tmp/closures/w3-mcp-call/gates-r2/` |
| L3 形式证据 | — | 只读卡上第 3 节，探索器与 TLC 都没有重跑，TLC 原件（在模型工作树里）也没读：**未验证** | — |
| 探针 | 用工作树的 vitest 跑 `--config /tmp/ir-call-r2/probe{,2}/vitest.config.mts` | 第 1 轮的 10 条探针，加本轮 6 条，见下文 | `/tmp/ir-call-r2/probe/`、`/tmp/ir-call-r2/probe2/` |
| 手工变异 | 工作树之外的副本 `/tmp/ir-call-r2/mut/{base,MA,MB,MC,MD}`，`vitest run --mode fast` | 基线副本：413 通过、2 条环境失败（`public-entry.spec.ts` 在副本里取不到包入口）。MA、MB 被杀；MC、MD 存活，失败集与基线副本相同 | 同目录 |

表中几项的细节：

- **被删的用例。**
  - 一类是步号重编后的改名。
  - 另一类随 API 删除：`in-flight.spec` 的 `stopOf`；「leaves a sent entry alone on release」；`markSent` 答 `'cancelled'` 的断言。最后一项的行为改由停止信号在第 11 步处理，由 `cancel.spec.ts:145`「that lands between the send and its record」承担。
- **mcp 覆盖率运行超时。** `FAIL tests/model/lifecycle.spec.ts > wide: … > P1–P8 hold`，`Error: Test timed out in 600000ms`，`Tests 1 failed | 422 passed (423)`。
- **全套检查日志的核对。**
  - 10 份日志的前缀：check-design `581ce43945af`、check-docs `30b59530cbd0`、format `a3700ff555bd`、lint-deps `2bf6a5708bbd`、lint-rules `712cdaf40510`、typecheck `a52e6d10c26e`、test-slow `7ff6729ea9e9a2de`、turbo `057665cc2110b64e`。lint-oxlint 是 `e3b0c442…`，即空文件的哈希，卡上写「空」。
  - `head.txt` 是 `5204d379…`。
  - test-slow 的尾部：`8 passed | 12 skipped`、`exit 0`。

### 结构读数：`7d91a330c..HEAD` 改动的函数

数据取自上面那次度量的 `metrics.json`。改动的 37 个函数全部是 `ok`，最高的是：

| 函数 | CC | 覆盖 | CRAP（score） |
|---|---|---|---|
| `calls.ts:201 prepare` | 9 | 100% | 9 |
| `tasks.ts:121 failureOf` | 7 | 78% | 7.54 |
| `tasks.ts:51 failureOfEnsure` | 6 | 67% | 7.33 |
| `in-flight.ts:83 InFlightCalls.cancel` | 7 | 82% | 7.29 |
| `tasks.ts:81 built` | 7 | 100% | 7 |

其余：`outcomeOf` 6、`request` 6、`perform` 5、`conclude` 5、`under` 4、契约 `outputCheck` 4，覆盖都是 100%。

第 1 轮的红项现在的读数：

- `perform`：CC 17 降到 5。
- `sendOn`：已拆成 `answerOf`（CC 2）与 `outcomeOf`（CC 6）。
- `failureOf`：CRAP 13.1 降到 7.54。
- `failureOfEnsure`：覆盖 0 升到 67%。
- 相对基线仍超线、本轮没改动的两个：`discovery.ts:124 publish` CC 17 / CRAP 17，`table.ts:313 begin` CC 12 / CRAP 12。

## 第 1 轮阻断逐条的结论（都在当前 head 上用第 1 轮原探针重跑）

- **A1/C1（`cancelRequest` 无上界）**：已消失。
  - P1 输出：`cancelRequests= 1 invoke answer after cancel = {"kind":"sent","outcome":{"kind":"unknown","cause":"abandoned"}}`。
  - C 的探针输出：`invoke returned after the abort, cancelRequest pending: true`。
  - 代码在 `calls.ts:282`（`scope.spawn(ask(...cancelRequest))`），用例是 `cancel.spec.ts:209`。
- **A2（发出前取消后又被拒）**：已消失。
  - P2 输出：`first cancel= signalled invoke= {"kind":"not-sent","reason":{"kind":"cancelled"}} second cancel= no-call-in-flight`。
  - 代码在 `calls.ts:300-301` 与 `in-flight.ts:73`，用例是 `cancel.spec.ts:234`。
- **A3/C2（`checkOutput` 抛出）**：已消失。
  - P4 输出：首次调用答 `sent`，结论是 `violates`（`output-check-failed`）；同键再调用答 `sent`；`cancel` 答 `no-call-in-flight`。
  - 吸收在契约的 `classify.ts` `outputCheck` 的 try/catch，收口在 `calls.ts:323-325` 的 `finally`，用例是 `invoke.spec.ts:631`。
- **C3/A-B1（分类在 `ask` 里）**：已消失。
  - P5 输出：`taskResult` 答 `ok`、`complete`，结论 `violates`（`output-check-failed`），`tasks/get=1`。
  - 代码在 `tasks.ts:160-164`，用例是 `tasks.spec.ts:474`。
- **C4（`markSent` 记成实时代际）**：已消失。
  - 探针输出：`cancel of the call sent on the earlier generation: unknown`，`cancelRequest notifications: 0`。
  - 代码在 `calls.ts:321` 与 `in-flight.ts:54`，用例是 `in-flight.spec.ts:136` 与 `invoke.spec.ts:695`。
- **A 的待裁第 (2) 项（P3，存储不答时中止）**：已闭合，答 `not-sent`（`cancelled`）。
- **C 的非阻断 1（建连期间 `cancel`）**：已闭合，输出 `cancel invoke settled before the build ended: true`。
- **E 第 2 条（第 9 步没有用例）**：已消失，靠的是步号重编。新的第 9 步有三条用例：`invoke.spec.ts:358`、`:369`、`:387`。原来的等应答一步现在是第 11 步，用例是 `invoke.spec.ts:399`。
- **E 第 9 条（门禁没有尾部与哈希）**：已消失。卡上第 5 节列了七项门禁与哈希，我逐个核对一致，见工具一览。

## 卡拥有者本轮裁定的落地

- **F1(b) 端口前提**：已落地。
  - `SPEC.md:252` 写 WF5，`:277` 写 P14 T2，`verification/README.md:95`，`Calls.tla:27`、`:517` 都有。
  - 实现在 `calls.ts:307-310`，不给 `transport.call` 加时限，与裁定一致。
- **F1(d)「只有报告 `lose` 产物的调用方才等 `lose`」**：已落地。
  - 只有 `discovery.ts:120` `await loseOn`；`calls.ts:240`、`:252` 与 `tasks.ts:124`、`:128` 都走 `loseInScope`。
  - 「请求当即被拒」在答复之前成立。代码上：`table.ts:414-422` 在调用 `builder.markLost` 之前没有 `await`，`build.ts:161` 的 `entry.connection.lose` 在第一个 `await` 之前同步执行。
  - 探针 SC-a 实测：调用的 `.then` 里同步读状态，得到 `state at answer= {"kind":"lost","reason":"stream-broken"}`。
- **S8**：入口处已落地，`calls.ts:209` 与 `tasks.ts:107` 先判关停，用例是 `continue.spec.ts:117` 与 `tasks.spec.ts:351`。关停落在调用途中时有偏差，见「范围外待裁决」第 1 条。

## 阻断

**1. 任务号在两个对端账户上相同，账户 A 的任务引用经账户 B 的连接与凭据发请求。**

- 归属：检查表第 9、10 问；L3 账户隔离。
- 位置：`internal/task-table.ts:33-35`（`record` 直接 `Map.set` 覆盖），`calls.ts:253-266`（`outcomeOf` 登记任务），`tasks.ts:154-155`、`:102-112`。
- 反例（探针 `probe2/account.spec.ts`）：
  1. alice 在匿名账户下发起任务 `t1`，代际 1。
  2. 采用改为凭据账户 `MAIN`，再发起一次，对端又答 `t1`。代际按连接键计数，新键也从 1 开始。
  3. 两条记录的任务表键都是（租户、主体、持有、`t1`），第二条覆盖第一条。
  4. 用第一次的引用 `refA` 查询：`issuedAt` 相等，校验通过，取 `record.account = MAIN`，在 `MAIN` 的连接上发出 `tasks/get`。
  - 输出：`ACC issuedAt A= 1 B= 1 opens= 2`，`ACC queryTask(refA)= {"ok":{"status":"working"}} tasks/get sent= 1`。
- 违背：成员 SPEC MC-17 自己列的反例「账户 A 发起的任务经账户 B 的凭据查询」。`cancelTask(refA)` 也会落到 B 的任务上，而 A 的任务从此无人可达。
- 前提与范围：
  - 需要对端在同一持有的两个账户上给出相同的任务号，任务号由对端控制。
  - 影响限于同一租户、同一主体，不跨租户。
  - 探索器的 `task-account` 场景只有一次 `invoke`、一个任务（`scenarios.ts:213-225`），没有建模这种碰撞，所以它的零违例不覆盖这一条。
- 实施者需要做的（写范围内）：碰撞时按拒绝收场。新记录与已有记录的账户或代际不同，就让该键的两个引用都答 `unknown`，而不是静默覆盖。补一条用例。
- 根因（契约 S2 的任务表键与 `TaskRef` 不带账户）列在「范围外待裁决」第 3 条。
- 派发者可以按前提由对端控制降级；证据已经完整给出。

## 非阻断

**1. MC-16 第 8 步「发出前最后核对停止信号，传输 `call` 计数 0」在代码里没有对应的一行。**

- 归属：检查表第 5、10 问。
- 位置：`calls.ts:304-310`。最后一次 `await under(...)` 与 `transport.call` 之间还隔着 `prepare` 的返回与 `perform` 的恢复，有几个微任务。
- 证据（探针 `probe2/step8.spec.ts`）：逐个微任务扫 `cancel` 的落点，得到
  - `k=30 cancel=signalled callEntered=[true] result=not-sent/cancelled tools/call=0`
  - `k=31` 相同。
  - 也就是说，传输的 `call` 方法在停止信号已触发时被调用了；线上请求数为 0，靠的是替身遵守 T5。
- 后果：只要传输遵守 T5，公开答复不变；成员 SPEC 的字面主张不成立。
- 关于 C50：`verification/README.md:173`、`:306` 说 C50「两种证据都表达不了」（答复与停止信号落在同一轮）。这个扫描说明这种交错在单元层可以构造，所以那条理由不成立；「公开面等价」的结论可能仍成立，需要用扫描法重判。
- 实施者需要做的，二选一：
  - 在 `transport.call` 之前补 `if (stop.aborted) return unsent(CANCELLED)`；
  - 或者把第 8 步改写成「最后一道由传输按 T5 答复」，并改 C50 的说明。

**2. MC-17 第 3 步 `settings` 阶段的两支映射没有用例。**

- 归属：检查表第 5 问。
- 位置：`tasks.ts:55-56`（重读采用答 `unknown` → `unknown`）与 `:59-60`（其余 → `no-connection`）。度量的覆盖率里这几条语句与分支命中都是 0。
- 变异证据：
  - MC（删掉 `case 'unknown'`）与 MD（`default` 改答 `connection-unavailable`）在副本快层的结果都是 `2 failed | 413 passed`，与基线副本相同，即两者都存活。
  - 这两支只有在采用于关口与 `ensure` 之间发生变化时才可达。
- 实施者需要做的：各补一条用例，用 `stallingAdoption` 一类的替身在关口之后改采用。

**3. S8「不问端口」对 `invoke` 没有断言。**

- 归属：检查表第 5 问。
- 变异 MA 删掉 `prepare` 开头的 `table.isShut()`，只有 `continue.spec.ts`「after closeAll is not sent」变红，被它杀死的原因是续调用的答复变成了 `unknown`。
- `invoke.spec.ts:261-267` 只断言答复与 `opens`。删掉这一判之后，答复仍由 `ensure` 给出 `connection-unavailable`，关口与存储照样被问。
- `4dfc0aace` 写的「守住它的是 `continue.spec.ts`」只守住了续调用的答复，没守住「不问端口」。
- 实施者需要做的：两条用例都断言 `portCalls` 与存储读取的次数不变。

**4. 度量红项没有交代。**

- 归属：检查表第 11 问。
- `discovery.ts:124 publish` CC 17（超 alert）与 `table.ts:313 begin` CC 12。两者本轮都没改动，是从基线以来带下来的。
- 第 1 轮裁定第 8 条要求在交回里逐条交代，卡评论 6665868317 第 7 节没有提到它们。
- 实施者需要做的：在交回里写明处置。

## 范围外待裁决

**1. S8 管不管已经过了入口判断的在途调用。**

探针 `probe2/s8.spec.ts`：`closeAll` 落在调用等关口的途中。

- 续调用答 `{"kind":"not-sent","reason":{"kind":"unknown"}}`，首次调用答 `connection-unavailable`。同一交错下两条路径答复不同，而 `104261a42` 的意图是两者同答。
- 两者在 `closeAll` 之后都又读了 1 次存储。
- 任务操作没有可复用的连接时答 `connection-unavailable`；`closeAll` 之后新发起的同一操作答 `effect-unknown`（`no-connection`）。
- MC-17 写的是「建连途中关停 → `connection-unavailable`」，这里的情形是 `ensure` 在关停之后才被调用。

所有答复都是「未发出」，没有谎报效果。需要契约拥有者裁定：契约 S8 的「`closeAll` 之后」是否覆盖在途操作。

**2. `closeAll` 不等调用口交给作用域的清单标记。**

探针 `probe2/scope.spec.ts`：

- 日志：`write asked | closeAll resolved | write released`。
- 之后清单 `revision 2`、`availability unavailable`，即存储写入落在 `closeAll` 返回之后。

MC-5 只对建连失败写了「`closeAll` 等这次标记写完」，`lose` 这一路没有对应条款。之后若出现本包错误，会走 `afterExit`。这一现象不是本轮引入的：第 1 轮调用自己等 `lose`，`closeAll` 同样不等。需要裁定 MC-10 是否要覆盖这一路。

**3. 契约 S2 的任务表键与 `TaskRef` 不带对端账户。** 这是阻断第 1 条的根因，只有契约拥有者能补。

## 未覆盖

- 我没有单独跑 `test:slow`、全套 `check` 与 `mcp-host-local`。手里的测试运行证据只有那次覆盖率运行（422/423 通过，1 条超时）与卡上已核哈希的日志。
- 探索器与 TLC 没有重跑；`tests/model/` 的改动（含计数视图 `CountedInFlight`）归 C 面；差分变异归 D 面。
- 表达、单一源与编号一致性转 B 面（design-reviewer）。写入范围与验收清单转 E 面（qa）。

## 观察（不是发现）

- 变异 MB（把 `loseInScope` 推迟一个微任务）是被下一次调用的清单答复间接杀死的。「答复时连接已拒新请求」没有直接断言：P14 用例里的 `await state(c)` 在变异下照样通过。
- `prepare` 对首次调用也算一次 `table.current(...)`，结果不用。



## D. 差分变异（general-purpose，sonnet，high）

D 面差分变异（PR #1141，head 5204d3799，工作树 clean 且运行期间无写者）：结论是 mcp 成员测量无效、命令退出 1，不能当零存活或零缺口，要修测试后复跑。

**命令与退出码**
- `VITEST_MAX_WORKERS=6 pnpm run mutation --base b2ba7dc89 --since 7d91a330c`，退出码 1（ELIFECYCLE，由 mcp 成员测量无效引起）。
- 先跑了 `--plan-only`：packages/mcp/mcp 7 个文件 80 段，packages/mcp/mcp-contract 3 个文件 5 段。`git diff --stat` 核对过，范围只含 `packages/mcp/mcp/src/` 与 `packages/mcp/mcp-contract/src/`，没有越界。
- 名额：启动时被别的会话的 `scripts/metrics.sh --in-slot --coverage` 占着，我等了 1181 秒才拿到名额。
- 日志开头写 Stryker 同时 6 个工作进程，按 VITEST_MAX_WORKERS 指定，不偏低；两个成员各分 3 个。
- 账本：`/data/qiwei/repos/omne-harness-lite/tmp/mutation-ledger/5204d3799/20261105-184745/`（summary.md、summary.json、各成员 mutation.json 与 log）。完整终端输出在 `/tmp/d-mut/run.log`。

**packages/mcp/mcp：测量无效，没有分数。** 变异体共 230 个，运行 283 秒。
- 被杀 198、超时 0、存活 22、无覆盖 3、编译错误 0。
- 运行错误 2、没跑测试 5，不计分。
- 没有变异体的改动段 44 段（大多是 import、类型、注释行，Stryker 不为这些生成变异体），逐段列表见 summary.md。

无效有两个原因：
1. 2 个 RuntimeError，Stryker 的 vitest runner 在 `errorToString` 里抛了 `TypeError: Cannot convert object to primitive value`。出错变异体：
   - calls.ts:216，ArrowFunction，`() => knownActionOf(...)` 换成 `() => undefined`。
   - calls.ts:252，EqualityOperator，`lost !== undefined` 换成 `lost === undefined`。
   - 这两个变异体让某条用例带着一个不能转成字符串的对象失败，runner 无法报告，因此判不了。
2. 5 个变异体有用例覆盖，却一条用例都没跑完，被判为运行出错（不是测试没测出来）：
   - calls.ts:105，`send.kind !== 'continue'` → `false`
   - calls.ts:229，`!issuedOn(send, ensured.ok.generation)` → `issuedOn(...)`
   - calls.ts:281，块 `{ scope.spawn(ask(() => on.ensured.transport.cancelRequest(requestId), undefined…` → `{}`
   - calls.ts:303，块 `{ const prepared = await prepare(send, access, stop) if ('failure' in prepared) …` → `{}`
   - in-flight.ts:74，`this.#entries.delete(text)` → `;`

**mcp 存活 22 个（文件:行、变异内容）**
- calls.ts:104，StringLiteral `'the arguments of an MCP action are a JSON object (isActionArgs)'` → `""`
- calls.ts:107，`inputResponses === undefined` → `true`
- calls.ts:108，StringLiteral `'a continuation carries the request state or the input responses'` → `""`
- calls.ts:118，BlockStatement `{ return request.connectBound === undefined ? {} : { connectBound: ... } }` → `{}`
- calls.ts:119，`request.connectBound === undefined` → `true`
- calls.ts:119，同一表达式 → `false`
- calls.ts:119，同一表达式 `===` → `!==`
- calls.ts:126，`send.kind === 'continue'` → `true`
- calls.ts:167，`waited.kind === 'expired' || stop.aborted` → `waited.kind === 'expired' && stop.aborted`
- calls.ts:167，`waited.kind === 'expired'` → `false`
- calls.ts:167，StringLiteral `'expired'` → `""`
- calls.ts:239，`failure.cause === 'connection-unavailable'` → `true`
- calls.ts:248，`outputSchema === undefined` → `false`
- calls.ts:251，`outcome.kind === 'unknown'` → `true`
- calls.ts:264，`outputSchema === undefined` → `false`
- calls.ts:281，`waited.kind === 'expired'` → `true`
- calls.ts:302，StringLiteral `'unsent'` → `""`
- internal/guard.ts:57，`decision.kind !== 'admitted'` → `true`
- internal/guard.ts:57，StringLiteral `'admitted'` → `""`
- tasks.ts:52，`failure.stage === 'connect'` → `true`
- tasks.ts:53，`failure.reason.kind === 'effect-unknown'` → `true`
- tasks.ts:55，StringLiteral `'unknown'` → `""`

**mcp 无覆盖 3 个**
- calls.ts:119，ObjectLiteral `{ connectBound: request.connectBound }` → `{}`
- tasks.ts:55，`case 'unknown': return UNKNOWN` → `case 'unknown':`
- tasks.ts:59，`default: return NO_CONNECTION` → `default:`

**packages/mcp/mcp-contract：测量有效。** 变异体 11 个，被杀 11、存活 0、无覆盖 0、运行错误 0、超时 0，分数 100%。有 3 个改动段没有变异体（classify.ts:5-12、classify.ts:29-33、index.ts:97），应是类型或导出位置。

**存活没有判等价，没有改夹具或代码，也没有手工变异。**
- 三个存活簇里，calls.ts:104、108、302 与 guard.ts:57 的 `'admitted'` 变异体是错误信息或判别字面量被换成 `""`，现有测试没断言文本。
- calls.ts:118-119 的 `connectBound` 的存活加无覆盖，说明该分支没有用例走到有绑定的情形。
- tasks.ts:52-59 的 `'unknown'` 与 `NO_CONNECTION` 分支存活加无覆盖，说明失败分类到 unknown 与 no-connection 的映射缺断言。
- calls.ts:167、281 的 `'expired'` 等待判定存活。
- 这些簇各自能否靠加用例杀死，本轮没有逐个验证，我这里没有证据说其中哪个是等价变异体。

**其他**
- 脚本末尾提示存活与无覆盖只是线索，判定会抖，需要复跑确认。
- 增量复用 0 个，因为是首次运行；快照在 `/data/qiwei/repos/omne-harness-lite/tmp/mutation-incremental/PanQiWei%2Fskill-mcp-w3-mcp-call`。
- 工作树没有受跟踪文件被改。运行写了 tmp/ 下的账本和增量快照，这些是未跟踪的。

## 卡拥有者的裁定（A、D）

### A 面

- **阻断 1（任务号跨账户碰撞）：改。** 判定成立：MC-17 自己列的反例被构造出来了，前提由对端控制，但账户隔离是 L3 热点，不降级。修法：任务表登记时，同一键已有记录且对端账户不同，该键转为「有歧义」，此后两个引用都答 `unknown`、不发请求（S2「表里没有」的同一答复）；同一账户、不同发起代际仍按现行规则以新记录为准（旧引用按 `issuedAt` 不符答 `unknown`）。用例用 A 的探针 `account.spec.ts` 改写。根因（`TaskRef` 与任务表键不带账户）记进 6b。
- 非阻断 1（第 8 步没有对应的一行）：改。`transport.call` 之前核停止信号，已触发就按 `cancelled` 收场；用例照 A 的 `step8.spec.ts` 逐个微任务扫 `cancel` 的落点，断言停止信号触发后 `call` 不被调用。C50 的说明按扫描法重写。
- 非阻断 2（MC-17 第 3 步 `settings` 阶段两支没有用例）：改，各补一条。
- 非阻断 3（S8「不问端口」对 `invoke` 没有断言）：改。两条用例都断言关口、存储与建连的端口调用次数。
- 非阻断 4（`publish` CC 17、`begin` CC 12）：本轮不改这两个函数（基线带来，不在本卡改动行），最终证据逐条写处置。
- 范围外 1（S8 管不管在途操作）：管。和 B R2-1 的裁定同一原则：关停之后不再问端口。实现上 `under` 在开始与等完之后都核停止信号与关停，交出「已停止」或「已关停」；调用口把「已关停」答「未发出：`connection-unavailable`」，于是首次调用与续调用同答，关停之后也不再读存储。任务操作在关口之后再核一次（C 11）。契约 S8 那一句写明「在途的操作在下一步之前判关停」。
- 范围外 2（`closeAll` 不等交给作用域的清单标记）：维持，登记。作用域拥有错误、不汇合完成，是生命周期已定的设计（`scope.ts` 文件头、P8 A1：端口可能永不答复）。MC-10 或「所有权」一段写明：调用与任务操作交给作用域的拆除与标记，可以落在 `closeAll` 返回之后；标记写入经 `ask`，端口失败不成为本包错误。
- 范围外 3（`TaskRef` 与任务表键不带账户）：6b。

### D 面

测量无效：2 个运行错误（Stryker 的 vitest runner 在 `errorToString` 上抛错，与 host 第 1 轮同一现象）与 5 个「有覆盖却没跑完」。处置：

- 成员 `@omne-harness/mcp` 采用与 host 相同的守卫：未处理的拒绝让用例失败，放进 `vitest.config.ts` 的 setup 文件（host 第 2 轮 C 的设计问题 2 同样裁为 setup 文件）。修复写者在交回里手工翻转这 7 个变异体，说明各自由哪条用例杀死。
- 22 个存活与 3 个无覆盖逐个处置：真实行为缺用例的补用例（`connectBound` 有值的建连、只带 `inputResponses` 的续调用、任务失败映射的 `unknown` 与 `no-connection` 两支、`guard.ts:57`、`calls.ts:239` 的「已触发信号下的非 `connection-unavailable` 未发出仍转 `lost`」）；条件可以由形状消掉的改形状（`outcomeOf` 里 `lostOfNoAnswer` 改为接收结局本身）；错误信息文字与 `exactOptionalPropertyTypes` 要求的条件展开写明不是承诺或等价，并说明为什么改不成可判定。被 C 2、C 3 改写的行在最终 head 上重测。
- 差分变异在修复轮的最终 head 上重跑一次（`--since 5204d3799`）。
