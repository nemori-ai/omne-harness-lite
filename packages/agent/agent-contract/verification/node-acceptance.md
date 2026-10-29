# Agent 节点验收表

本页把 [Loop 完整算法](../../agent/docs/architecture/loop-algorithm.md#节点表)节点表的「终止或进展条件」与「如何返回」改写成可断言的用例名，供实现卡逐节点对表验收。范围是 [Agent 运行时实现线](https://github.com/nemori-ai/omne-harness-lite/issues/502)「围绕 Loop 的生长顺序」中阶段 1 至 3 成为真实的节点。节点的读写、等待与转移只归节点表，行为只归 [SPEC](../SPEC.md)，场景的必须结果只归[持续验证场景](scenarios.md)。本页不是已运行的证据。

本页随 `agent-contract/verification` 维护：阶段 4 至 7 的节点由各阶段首卡补行，实现卡在节点落地时填写「实现用例」列。

## 读表方法

- 每个「节点 × 阶段部分」至少一行。一个节点在不同阶段分部分落地时，每个部分各有行。
- 行号写作 `NA-<节点>-<序号>`，序号在同一节点内按加入顺序分配。行号一经使用不重排、不复用。实现测试的用例名以行号开头，例如 `NA-I3-1: ...`，供追踪。
- 子卡列写父卡「阶段与子任务」的编号。阶段 1 与 2 的编号后附 Issue 号。所有阶段 1 节点另由 1.2 的骨架走通正常路径，本列只写补齐该节点精确语义的子卡。
- 用例名是一句可断言的话，写可观察的结果：返回值、提交、事件、节点去向或执行状态。用例名不写实现细节。
- SC-AG 列只写按场景要旨确实覆盖该行的编号。场景文字只提到节点 ID 不算覆盖。没有场景覆盖的行写「新增场景」，提议见下文[新增场景提议](#新增场景提议)。
- 实现用例列在建表时写「待实现」。实现卡落地时改为测试文件与用例名。

## 验收表

| 行号 | 节点 | 阶段与部分 | 子卡 | 用例名 | SC-AG | 实现用例 |
| --- | --- | --- | --- | --- | --- | --- |
| NA-U0-1 | U0 | 1 | 1.3（#511） | invoke 交出的输入经 U0、Q1、Q2 接纳后，Journal.inputs 返回的内容与 invoke 交出的内容相同 | SC-AG-01 | `agent/tests/loop-admission.spec.ts`：`NA-U0-1: Journal.inputs returns the content that invoke handed over` |
| NA-Q1-1 | Q1 | 1 | 1.3（#511） | 合法的外部输入候选由 Q1 直接转 Q2，Q1 与 Q2 之间没有扩展调用，Q1 不改变 Journal 修订号 | 新增场景 | `agent/tests/loop-admission.spec.ts`：`NA-Q1-1: Q1 passes a lawful candidate straight to Q2, with no call and no commit between` |
| NA-Q2-1 | Q2 | 1 | 1.3（#511） | accept 返回 accepted 时，接纳回执随 checkpoint 提交，节点转 Q4 | 新增场景 | `agent/tests/loop-admission.spec.ts`：`NA-Q2-1: an accepted Model reply commits its admission with the checkpoint, and the node goes to Q4`；外部输入部分为 `NA-Q2-1: an accepted external input saves no receipt of its own (S-13 of #558); it goes to open unchanged`，回执不另存，见 #558 S-13 裁决 |
| NA-Q2-2 | Q2 | 1 | 1.3（#511） | accept 的提交回执未知时，以同一操作身份与同一候选再次调用 accept 得到原回执，没有第二个操作身份 | SC-AG-163 | `agent/tests/loop-admission.spec.ts`：`NA-Q2-2: invoke answers commit-unknown and frees the slot; the same operation again gets the original result and runs on` |
| NA-Q4-1 | Q4 | 1 | 1.3（#511） | Q4 把接纳结果交回固定调用位置：外部输入回 U0 的受理方，模型回复回 I3，Q4 不重试 | 新增场景 | `agent/tests/loop-admission.spec.ts`：`NA-Q4-1: Q4 returns each admission to its call position once: the input to U0 and E0, the reply to I3` |
| NA-E0-1 | E0 | 1（open） | 1.3（#511） | invoke 先预约单执行槽，再以 open 保存输入内容与初始 checkpoint，取得 Authority 后节点转 E1 | SC-AG-01 | `agent/tests/loop-admission.spec.ts`：`NA-E0-1: the slot is reserved while open runs; after the Authority the node goes to E1` |
| NA-E0-2 | E0 | 1（open） | 1.3（#511） | 同一操作身份重复 invoke 认回原执行与原挂接，不再次 open，不新建执行 | SC-AG-40 | `agent/tests/loop-admission.spec.ts`：`NA-E0-2: while the run goes on`、`NA-E0-2: after the execution ended`、`NA-E0-2: in a new runtime over the same Journal, open gives the original back and the execution is not driven`。进程内重复不再 open；新 runtime 的 open 按幂等查找原记录 |
| NA-E0-3 | E0 | 1（open） | 1.3（#511） | 执行占用执行槽时，另一个新 invoke 返回 busy，不进入隐藏队列 | SC-AG-12 | `agent/tests/loop-admission.spec.ts`：`NA-E0-3: while the first invoke is reserved, in the same turn`、`NA-E0-3: while the first run is running`、`NA-E0-3: while the first run is stopped`、`NA-E0-3: while the open of the first invoke is unresolved` |
| NA-E0-4 | E0 | 1（open） | 1.3（#511） | open 的提交回执未知时，执行槽预约保留，R0 以原操作身份查询，不以新身份再次 open | SC-AG-163 | `agent/tests/loop-admission.spec.ts`：`NA-E0-4: pending, then applied: the retry queries the original operation, then runs on`、`NA-E0-4: applied: the query finds it committed, and the same open gives the original receipt back`、`NA-E0-4: dropped: the query finds it excluded, and the same operation opens anew`、`NA-E0-4: a failure of the retry before open keeps the R0 item, because the open may have committed` |
| NA-E1-1 | E1 | 1 | 1.4（#512） | 资格核验允许时 E1 转 E2，E1 不写业务状态 | SC-AG-161 | `agent/tests/loop-recovery.spec.ts`：`NA-E1-1: allowed enters E2 with no extra access check or business write`、`NA-E1-1: detach between E1 and E2 stops before another Model connection` |
| NA-E1-2 | E1 | 1 | 1.4（#512） | 资格核验不可用时 E1 转 W0，执行状态为 waiting，节点不进入 E2 | 新增场景 | `agent/tests/provider-access.spec.ts` 的 C2 invoke：`check unavailable returns unavailable and does not pass`，核对公开守卫零写；`agent/tests/loop-recovery.spec.ts`：`NA-E1-2: unavailable E1 load preserves the original continuation in a dependency wait`，核对合法受理后的内部读失败等待。本行原资格不可用等待措辞与 SPEC 不同，这两项不构成原措辞全通过 |
| NA-E1-3 | E1 | 1 | 1.4（#512） | 执行状态已为终态时 E1 转 F4，节点不进入 E2 | 新增场景 | `agent/tests/loop-recovery.spec.ts`：`NA-E1-3: ended goes to F4 without entering E2`、`NA-E1-3: a terminal E2 snapshot takes priority over unresolved business continuation` |
| NA-E2-1 | E2 | 1 | 1.4（#512） | E2 以 load、inputs、query 只读认回后转 E4，Journal 修订号不变 | SC-AG-161 | `agent/tests/loop-recovery.spec.ts`：`NA-E2-1: load, query, inputs and reply admissions reclaim facts without a revision change` |
| NA-E2-2 | E2 | 1 | 1.4（#512） | load 返回 unavailable 时 E2 转 W0，等待依据含 dependency 等待，没有以空快照继续的推进 | SC-AG-184 | `agent/tests/loop-recovery.spec.ts`：`NA-E2-2: unavailable %s saves dependency waiting instead of empty facts`、`NA-E2-2: a reply projection gap saves waiting` |
| NA-E4-1 | E4 | 1 | 1.4（#512） | `position` 停在输入边界时 E4 转 I0，I0 承接受理时保存的输入 | SC-AG-161 | `agent/tests/loop-recovery.spec.ts`：`NA-E4-1: input boundary %s delegates I0 to the evaluator`、`NA-E4-1: I0 takes the input content saved by acceptance` |
| NA-E4-2 | E4 | 1 | 1.4（#512） | 纯求值之后、意图提交之前崩溃，恢复后 E4 回原节点，重算得到相同的下一步，修订号不变 | SC-AG-164 | `agent/tests/loop-recovery.spec.ts`：`NA-E4-2: saved position %s resumes at %s without changing its facts` 及同前缀的字段映射用例；`agent/tests/loop-evaluator.spec.ts` 的 500 组事实属性测试核对重算纯性。`agent/acceptance/PD-agent-progression.stage1.acceptance.ts` 的 `SIGKILL at I2` 另核对真实进程退出后的已存 ready/step 重建与原意图相等。Journal 宿主存活 |
| NA-E4-3 | E4 | 1 | 1.4（#512） | 主调用在 M1 等待时崩溃，恢复后 E4 转 R0，原调用收场后 M5 回 I3 | SC-AG-185 | `agent/tests/loop-recovery.spec.ts`：`NA-E4-3: a pending operation goes to R0 and a settled operation resumes the main call at M1`、`NA-E4-3: R0 keeps the original operation when its result is %s`、`NA-E4-3: recovery of the original main call reaches I3 without another admission`、`NA-E4-3: %s %s %s resumes its successor or original frame without consuming twice`。原操作 committed/excluded 矩阵为同协调者验证；`agent/acceptance/PD-agent-progression.stage1.acceptance.ts` 的 `SIGKILL at M1` 杀死执行子进程后以原 Authority 认回原调用，只有一次 admit、完整读取、ACK 与 message。Journal 宿主存活 |
| NA-I0-1 | I0 | 1 | 1.5（#513） | 水位线以内的全部合格输入按受理顺序进入一个输入批，输入批与新 step 在一次提交中固定，事件流有一条 input-taken | 新增场景 | `agent/tests/loop-intake-prepare.spec.ts`：`NA-I0-1: fixes all accepted inputs, the new step and one input-taken in one commit` |
| NA-I0-2 | I0 | 1 | 1.5（#513） | 已进入输入批的输入不再进入后续 step 的输入批 | 新增场景 | `agent/tests/loop-intake-prepare.spec.ts`：`NA-I0-2: an input accepted before reply custody waits for the next step`、`NA-I0-2: two invokes on the runtime take disjoint input batches`（真实在途 changed 的完整接续留后续卡） |
| NA-I1-1 | I1 | 1（ready） | 1.5（#513） | I1 取得准备结果后提交 checkpoint 的 `requestPreparation`，P0、P1 直通时节点转 I2 | 新增场景 | `agent/tests/loop-intake-prepare.spec.ts`：`NA-I1-1: reads conditions, selects, reads context and commits assembled before P1 produces ready` |
| NA-I1-2 | I1 | 1（ready） | 1.5（#513） | 新 execution 的 Runtime Context 读取传入空的 adopted，最终请求记录之后 adoptedContext 等于这次读取的 coverage | SC-AG-75 | `agent/tests/loop-intake-prepare.spec.ts`：`NA-I1-2: new execution reads with no adopted coverage, then M0 adopts the returned coverage` |
| NA-I1-3 | I1 | 1（ready） | 1.5（#513） | 条件、选择、Runtime Context 或请求准备的读取端口不可用时 I1 转 W0，`requestPreparation` 不变 | 新增场景 | `agent/tests/loop-intake-prepare.spec.ts`：`NA-I1-3: unavailable %s saves one I1 wait without preparing or calling Model` |
| NA-I2-1 | I2 | 1 | 1.6（#514） | 主调用的 PendingCall 用途为 main、返回去处为 I3，M5 返回后节点转 I3 | SC-AG-185 | `agent/tests/loop-recovery.spec.ts`：`NA-E4-3: recovery of the original main call reaches I3 without another admission`，核对 main 用途与原调用准入；`agent/tests/loop-transitions.spec.ts` 的 I2/M5 正常路径行核对返回 I3。同一协调者接续，不证明公开恢复 |
| NA-I2-2 | I2 | 1 | 1.6（#514） | 主调用在途时到达的新输入不改写已记录的最终请求 | 新增场景 | `agent/tests/loop-main-call.spec.ts`：`NA-I2-2: input submitted while Model is in flight leaves its fixed request and reference unchanged`。直接 Journal.submit 不改原请求与 reference，原回复准入后停在 I8；不证明完整 SC-AG-157 |
| NA-M0-1 | M0 | 1（main） | 1.6（#514） | FinalRequest、adoptedContext 与效果意图在向 Model 受理之前一次提交，在提交前后崩溃时 PendingCall 与 EffectIntent 的身份不变 | SC-AG-160 | `agent/tests/loop-main-call.spec.ts`：`NA-M0-1: saves the fixed request, PendingCall, context and effect together before admission`、`NA-M0-1: drops the coordinator before intent and rebuilds the same call from saved ready at I2`、`C1: drops the coordinator after intent and rebuilds M6 from Journal under the original authority`。覆盖一次提交与提交前后丢弃协调者；I2 从已存 ready/step 派生原身份，PendingCall/EffectIntent 与原候选相同、无新 prepare、只受理一次。限原 runtime/Access/Authority 串行、I2 无未决操作，`agent/acceptance/PD-agent-progression.stage1.acceptance.ts` 的 `SIGKILL at I2` 与 `SIGKILL at M6` 另核对真实进程死亡、同一原意图及唯一受理。Journal 宿主存活，不证明公开恢复或宿主死亡耐久 |
| NA-M6-1 | M6 | 1 | 1.6（#514） | 同一原调用只向 Model 受理一次，受理回执丢失时认回原受理并在 M1 等待，没有新的 PendingCall | SC-AG-162 | `agent/tests/loop-main-call.spec.ts`：`NA-M6-1: a lost admission receipt is inspected by the original reference without another admit`、`NA-M6-1: revocation after not-accepted prevents admission`、`C1: a fresh coordinator recalls the original admission after its receipt and observation were lost`。按原 reference/admission 接续，不另建调用；窄入口保留原 Access/Authority，不 attach。`agent/acceptance/PD-agent-progression.stage1.acceptance.ts` 的 `SIGKILL at M1` 另核对真实执行进程死亡后唯一 admit 与原调用接续 |
| NA-M1-1 | M1 | 1 | 1.6（#514） | Model 仍在重试或查询结果未知时 M1 保持等待，不投影为真实收场；真实收场后节点转 M3 | SC-AG-69、SC-AG-165 | `agent/tests/loop-main-call.spec.ts`：`NA-M1-1: retry-decision and no live route save producer waiting without consuming a result`；`agent/tests/loop-port-failures.spec.ts` 的 M1 inspect 不可用用例；`agent/tests/loop-invoke.spec.ts`：`invoke returns the handle at the acceptance, before the main call settles`。等待真实收场，不将观察失败当作调用终局。Agent 不发 stream 事件，生产者的过程流由观察者经 Model 的 current 直接观察 |
| NA-M3-1 | M3 | 1（processed） | 1.6（#514） | processed 路径先保存完成依据，再解除 Model 的交付责任，事件流有 producer 事件，节点转 M4 | SC-AG-170 | `agent/tests/loop-main-call.spec.ts`: NA-M3-1 processed/ACK/cost; `a processed record with unknown %s receipt is queried without reading again`; L3-B1/B2. Immutable readable facts are preserved, then bound by Journal, then ACK. The strict adapter reads actual materials, original associations, Journal binding and current qualification. False evidence, raw content or an absent binding fails. Preserve/binding failure or unknown keeps materials and sends zero ACK. After ACK, discarded caches restore through completion. readNext/closeRead/dispatches failures reenter legally. `loop-recovery.spec.ts` retains all four M3 commit cases and unique producer. Non-durable test assembly only; R1 covers the real committed-M4 cut. Original ACK confirmation restores the same receipt. A stable consumption release queries unknown writes. Failure or unknown keeps responsibility. Overall O0 delivery remains outside #514. The #518 `agent/acceptance/PD-agent-progression.stage1.acceptance.ts` committed-M4 SIGKILL case preserves original completion and ACK, records release through O0, and emits exactly one message and terminal event. The Journal host survives |
| NA-M3-2 | M3 | 1（processed） | 1.6（#514） | Model 以最终失败收场时 M3 保管失败事实与费用，节点经 M4、M5 回 I3，之后不经过 M2 | SC-AG-153 | `agent/tests/loop-main-call.spec.ts`: NA-M3-2 final failure, SC-AG-166 partial tool arguments, L3-B1 partial/no-reply discarded-cache cases. Interpreted outcome, original parts/settlement/dispatch costs and I3 responsibility remain in immutable readable facts bound by Journal completion. After ACK, no Model full-content read is required. Final failure never enters M2; partial output is not no-reply |
| NA-M4-1 | M4 | 1（直通） | 1.6（#514） | 没有采用调模型之后位置的扩展时，M4 不产生扩展调用，节点转 M5 | 新增场景 | `agent/tests/loop-transitions.spec.ts` 的 `M4 on proceed goes to M5` 行；`agent/tests/loop-main-call.spec.ts` 的 NA-M3-2 最终失败用例与 NA-M0-1 无 M4 提交断言。只覆盖无采用扩展的直通，不声明扩展经过已实现 |
| NA-M5-1 | M5 | 1 | 1.6（#514） | 主请求的结果由 M5 回 I3，不进入压缩或扩展的返回去处 | SC-AG-185 | `agent/tests/loop-transitions.spec.ts` 的 `M5 on return-I3 goes to I3` 行；`agent/tests/loop-recovery.spec.ts`：`NA-E4-3: recovery of the original main call reaches I3 without another admission`。只覆盖 main 返回 I3，不声明压缩或扩展用途已实现 |
| NA-I3-1 | I3 | 1（成功） | 1.7（#515） | ModelReplyAdmission 与接续在同一次提交中成立，准入成功后节点转 I4 | 新增场景 | `agent/tests/loop-reply-close.spec.ts`：`NA-I3-1` 的同 revision 与交接回执未知用例；`agent/tests/loop-recovery.spec.ts` 的 Q2/Q4/I3 committed/excluded 原操作矩阵核对唯一准入与唯一 message。仅同协调者接续，不证明公开恢复。 |
| NA-I3-2 | I3 | 1（最终失败） | 1.7（#515） | 主调用最终失败且没有有效回复时 I3 转 F1，失败候选的 kind 为 no-reply | SC-AG-153 | `agent/tests/loop-reply-close.spec.ts`：`NA-I3-2: final failure without content fixes the real no-reply candidate before F1`。保留 #514 的材料、原 ACK 与注入时刻回归；无回复不产生准入事实。 |
| NA-I4-1 | I4 | 1（空批） | 1.7（#515） | 已准入回复没有工具调用部件时 I4 提交空动作批，节点转 I8 | SC-AG-140 | `agent/tests/loop-reply-close.spec.ts`：`NA-I4-1: an admitted reply without tool calls commits its empty batch before I8`，核 source、空 actions/slots/barrier 与 I8 消费清空。 |
| NA-I8-1 | I8 | 1（去向） | 1.7（#515） | 没有动作、普通队列为空且没有未完等待时，I8 形成完成候选转 F1，不直接写终态 | SC-AG-140 | `agent/tests/loop-reply-close.spec.ts`：`NA-I8-1: an empty queue and no outstanding wait propose completion before terminal commit`，I8 只前移到 F1，终态由后续 tryFinish 写入。 |
| NA-I8-2 | I8 | 1（去向） | 1.7（#515） | 有新的合格输入时 I8 以新 step 转 I0 | 新增场景 | `agent/tests/loop-reply-close.spec.ts`：两个 `NA-I8-2` 用例分别核对在途 Journal.submit 后同执行 step-2，以及终态释放后新 invoke 的新执行首 step。不证明公开 submit。 |
| NA-I8-3 | I8 | 1（去向） | 1.7（#515） | 有未完成的等待时 I8 转 W0，不形成完成候选 | SC-AG-140 | `agent/tests/loop-reply-close.spec.ts`：`NA-I8-3: an unprocessed responsibility waits at I8 despite an empty action batch and queue`；`agent/tests/loop-evaluator.spec.ts` 的同号用例核对在途生产与未交清结果。只保存一次等待，不证明真实唤醒。 |
| NA-F1-1 | F1 | 1（基本） | 1.8（#516） | F1 把执行状态置为 settling 并提交 FinishIntent 候选，之后才调用 tryFinish | SC-AG-140 | `agent/tests/loop-terminal.spec.ts`：`NA-F1-1: candidate and before-terminal evidence are fixed before the one terminal commit`；`loop-intake-prepare.spec.ts` 保留 F1 excluded 的原候选与时刻回归。 |
| NA-F3-1 | F3 | 1 | 1.8（#516） | tryFinish 一次共同提交终态、ended 事件、终态后观察责任与原操作结果，不等待调用方批准，节点转 F4 | SC-AG-01、SC-AG-60 | `agent/tests/loop-terminal.spec.ts`：NA-F1-1 的原终态、末事件与 query 回执同修订核对；NA-F4-1 的两项固定观察责任共同建账。内存 Journal。 |
| NA-F3-2 | F3 | 1 | 1.8（#516） | tryFinish 回执丢失时 R0 查询原终结，load 读到 ended 后节点转 F4，ended 事件唯一 | SC-AG-180、SC-AG-64 | `agent/tests/loop-terminal.spec.ts`：`C2: lost %s finish queries the original operation before any further finish`，applied 唯一终态、dropped 原操作重试、pending 原查询；查询/读取 unavailable 零 waiting 提交。 |
| NA-F3-3 | F3 | 1 | 1.8（#516） | tryFinish 返回 changed 时 R0 回 E4 重读，再回 I8 或 F1；返回 blocked 时先交清保管再重提 | SC-AG-190、SC-AG-61 | `agent/tests/loop-terminal.spec.ts`：C1 的 before-F1/before-F3 新输入竞争；NA-F3-3 的真实 custody blocked 保留与 transfer 后重提；未知不当 blocked。B1 的 no-reply 取时/F1 提交竞争在同次驱动承接新输入，原调用各 admit/read/ACK 一次、零虚假 producer 等待。 |
| NA-F4-1 | F4 | 1（登记） | 1.8（#516） | 终态后观察未登记完时进程退出，恢复后从终态后责任台账认回，不恢复推进态 | SC-AG-65 | `agent/tests/loop-terminal.spec.ts`：`NA-F4-1: a nonempty terminal ledger survives coordinator loss and recalls the original observation registration`。非空两项台账、原登记丢回执查询、已登记认回与未登记保留、idle 后合法宿主登记。`agent/acceptance/PD-agent-progression.stage1.acceptance.ts` 的 `S2 NA-F4-1` 另在实际 SIGKILL 并确认退出后，从同一宿主 Journal 认回终态、原登记与未登记项；不重复消息、ACK 或终结，保留后续合法宿主登记。只核台账认回，不执行阶段 3 纯观察求值，不证明 Journal 宿主死亡耐久。 |
| NA-O0-1 | O0 | 1 | 1.8（#516） | O0 不等待读取方，交清本实例的事件与结果责任后转 E9，读取方之后从原游标读到终态事件 | SC-AG-06 | `agent/tests/loop-terminal.spec.ts`：NA-O0-1 的原 Model ACK/completion 认回，无重读/重 ACK；NA-E9-1 / NA-O0-1 的 idle 后原句柄迟读 ended、零读取方代 ACK。其他 custody 保留真实 pending。`agent/acceptance/PD-agent-progression.stage1.acceptance.ts` 的 `SIGKILL at M4` 另核跨执行进程的原 completion/ACK 认回与 release，没有二次读取或 ACK。 |
| NA-E9-1 | E9 | 1（idle） | 1.8（#516） | 执行终结后 runtime 回 idle 并保持登记，同一 runtime 以新执行身份承接下一次 invoke | SC-AG-10 | `agent/tests/loop-terminal.spec.ts`：`NA-E9-1 / NA-O0-1: idle retains registration and unacknowledged events for the original reader`，原 execution 拒绝重开，新 execution 可复用，登记未撤。 |
| NA-W0-1 | W0 | 1（基本形） | 1.9（#517） | 进入 W0 时执行状态 waiting、等待依据与 Journal 修订一次提交，事件流有 waiting 事件 | SC-AG-182 | `agent/tests/loop-recovery.spec.ts`：`NA-W0-1: state, basis and event commit once while observe remains occupied`、`NA-W0-1: a failed waiting commit stays a failure and saves no event`；`agent/tests/loop-wait-reconcile.spec.ts`：`NA-W0-1: an input racing the waiting commit is reread without abandoning the original call`、`NA-W0-1: a dependency that recovers during W0 is reread before the check timer` |
| NA-W0-2 | W0 | 1（基本形） | 1.9（#517） | 唤醒通知丢失时到检查时刻重读来源，进度变化后经 E1 继续，没有新挂接 | SC-AG-161、SC-AG-185 | `agent/tests/loop-wait-reconcile.spec.ts`：`NA-W0-2: a lost notification wakes at the configured check time without another admission`、`NA-W0-2: an input arriving as observation starts is reread before sleeping under the original attachment`。原挂接、真实原调用收场、计时重读与清理；不证明进程耐久。 |
| NA-R0-1 | R0 | 1（基本形） | 1.9（#517） | Journal 提交回执丢失时 R0 以原操作身份 query，committed 时取原结果回后继节点 | SC-AG-163 | `agent/tests/loop-wait-reconcile.spec.ts`：`NA-R0-1: a lost applied M0 receipt keeps one logical producer and resumes automatically`；`loop-recovery.spec.ts` 保留各原提交的 committed 矩阵。 |
| NA-R0-2 | R0 | 1（基本形） | 1.9（#517） | query 返回 unknown 时 R0 保持等待，不用新操作身份重试，不把查无记录当作 excluded | SC-AG-195、SC-AG-71 | `agent/tests/loop-wait-reconcile.spec.ts`：原 M0 的 unknown、query/load unavailable 零干扰写入，pending 经过两次检查仍不重做；`NA-R0-2: an unknown W0 commit is queried without a second waiting submission`；`NA-R0-2: %s coordinator continuation queries unknown M3 before another fallible load` 核对同一及新协调者窄接续先查询原操作；取消清理不修改 Journal 责任。 |
| NA-R0-3 | R0 | 1（基本形） | 1.9（#517） | query 返回带排除依据的 excluded 时，R0 才回原节点重新求值 | SC-AG-163、SC-AG-195 | `agent/tests/loop-wait-reconcile.spec.ts`：`NA-R0-3: a lost dropped M0 receipt keeps one logical producer and resumes automatically`；`loop-recovery.spec.ts` 保留各原提交的 excluded 矩阵。 |
| NA-R0-4 | R0 | 1（基本形） | 1.9（#517） | Model 效果意图已提交、尚未受理时崩溃，R0 按原 reference 查询 Model，原调用至多受理一次 | SC-AG-160、SC-AG-162 | `agent/tests/loop-main-call.spec.ts`：`NA-M0-1: drops the coordinator before intent and rebuilds the same call from saved ready at I2`、`C1: drops the coordinator after intent and rebuilds M6 from Journal under the original authority`、`C1: a fresh coordinator recalls the original admission after its receipt and observation were lost`。原 runtime/Access/Authority 串行。`agent/acceptance/PD-agent-progression.stage1.acceptance.ts` 的 `SIGKILL at M6` 与 `SIGKILL at M1` 另核同一非耐久宿主 Journal 上执行进程死亡后的原调用接续、唯一 admit 与原意图。 |
| NA-I4-2 | I4 | 2（动作批） | 2.1（#520） | 两个完整的工具调用部件解析为两个 Action，顺序与回复一致，各带原参数与身份，节点转 A0 | 新增场景 | 待实现 |
| NA-I4-3 | I4 | 2（动作批） | 2.1（#520） | 参数块未完整到达的工具调用部件不被解析，部分结果之后没有 A0 | SC-AG-166 | 待实现 |
| NA-A0-1 | A0 | 2（官方准入链） | 2.2（#521） | 官方准入 allow 时该动作的 ActionJudgment 带准入证据，随 checkpoint 的 `batch` 提交 | 新增场景 | 待实现 |
| NA-A0-2 | A0 | 2（官方准入链） | 2.2（#521） | 官方准入 deny 时该动作的判断为 denied，拒绝依据随 `batch` 提交 | SC-AG-115 | 待实现 |
| NA-A0-3 | A0 | 2（官方准入链） | 2.2（#521） | admit 返回 unavailable 或 Failure 时本批全部动作被拒绝，不出卡，拒绝依据写明准入不可用 | SC-AG-116、SC-AG-209 | 待实现 |
| NA-A1-1 | A1 | 2 | 2.3（#522） | 全部动作的判断到达结论之前 Tool 的发起数为零；到达结论且有获准动作时屏障记 open 并写 `batchDecision` 依据，节点转 A2 | 新增场景 | 待实现 |
| NA-A1-2 | A1 | 2 | 2.3（#522） | 全部动作在判断阶段被拒绝时屏障记 all-denied，节点转 A3 | SC-AG-115、SC-AG-141 | 待实现 |
| NA-A3-1 | A3 | 2 | 2.3（#522） | 全拒时 A3 按原动作顺序为每个动作建立 denied 槽位，不等待任何工具，本批没有 T4 | SC-AG-115、SC-AG-141 | 待实现 |
| NA-A3-2 | A3 | 2 | 2.3（#522） | 全拒之后拒绝消息进入历史，I8 以新 step 转 I0，下一步不是终态候选 | SC-AG-115、SC-AG-141 | 待实现 |
| NA-A2-1 | A2 | 2 | 2.4（#524） | 完整请求 facts、intent、原位置与 effect intent 先保存再 invoke；accepted 保存 associated 与 dispatched 后转 T0，commit-unknown 带引用转原调用对账 | SC-AG-160、SC-AG-162、SC-AG-216 | 待实现 |
| NA-A2-2 | A2 | 2 | 2.4（#524） | `toolConcurrency` 为 1 时获准动作按原顺序逐个发起 | SC-AG-132 | 待实现 |
| NA-A2-3 | A2 | 2 | 2.4（#524） | invoke 的 rejected 仅在无历史受理或未决尝试时建 denied 转 T2；否则保留原 pending、请求、consumer、effect intent 与 open 屏障，转原调用恢复，不建竞争 denied | SC-AG-114、SC-AG-162、SC-AG-222、SC-AG-223 | 待实现 |
| NA-T0-1 | T0 | 2 | 2.5（#525） | 原 Tool 在途时 T0 转 W0，各槽位独立等待，先到的结果不等待其他槽位即转 T1 | SC-AG-120、SC-AG-173 | 待实现 |
| NA-T0-2 | T0 | 2 | 2.5（#525） | Tool 内部 Ask 投影为 tool-active 且 waiting 为 human，没有 present 调用 | SC-AG-121、SC-AG-68 | 待实现 |
| NA-T0-3 | T0 | 2 | 2.5（#525） | Tool 的查询暂不可用时槽位保持未知并等待，没有失联结论，没有重发 | SC-AG-182 | 待实现 |
| NA-T1-1 | T1 | 2（processed） | 2.5（#525） | 真实结果按原动作身份保管到自己的槽位，保管依据保存后才解除生产责任，事件流有 producer 事件，节点转 T2 | SC-AG-170 | 待实现 |
| NA-T1-2 | T1 | 2（background） | 2.7（#527） | 确认的后台占位使槽位记为 background 并转 T3，不经过 T2，原 consumption 的结果责任不释放 | SC-AG-50、SC-AG-120、SC-AG-146 | 待实现 |
| NA-T1-3 | T1 | 2（background） | 2.7（#527） | 推进中迟到的最终结果以同一 consumption 到达，节点序列为 I8、T1、I8，原槽位不变，原批不重开 | SC-AG-122、SC-AG-146、SC-AG-172 | 待实现 |
| NA-T1-4 | T1 | 2（background） | 2.7（#527） | 执行已无推进资格或已终结时，迟到结果由 O0 只保管与对账，没有新的 Next | SC-AG-123、SC-AG-172 | 待实现 |
| NA-T2-1 | T2 | 2（直通） | 2.6（#526） | 全拒批次中每个 denied 槽位经 T2 转 T3，候选消息不变 | SC-AG-141 | 待实现 |
| NA-T3-1 | T3 | 2 | 2.5（#525） | 有槽位缺失或历史尝试未决时 T3 转 W0；较晚 rejected 不补 denied，原受理认回后沿原槽位继续，到齐才离开 T3 | SC-AG-173、SC-AG-222 | 待实现 |
| NA-T3-2 | T3 | 2 | 2.5（#525） | 槽位齐备且没有已发起的动作时 T3 转 T5，不经过 T4 | SC-AG-115、SC-AG-141 | 待实现 |
| NA-T3-3 | T3 | 2 | 2.5（#525） | 获准动作在等并发名额、尚无槽位时，T3 不判为齐备 | SC-AG-132 | 待实现 |
| NA-T4-1 | T4 | 2（直通） | 2.6（#526） | 至少一个槽位曾为 dispatched 时，全部槽位齐备之后 T4 对本批只经过一次，节点转 T5 | SC-AG-120、SC-AG-132 | 待实现 |
| NA-T5-1 | T5 | 2 | 2.6（#526） | 两个结果按原动作顺序各经 Q2 接纳为一条消息；历史未知后拒绝不计该动作完成，不产生竞争拒绝消息，全部完成后节点转 I8 | SC-AG-120、SC-AG-132、SC-AG-222 | 待实现 |
| NA-T5-2 | T5 | 2 | 2.6（#526） | T5 部分提交后崩溃，恢复后只提交尚未接纳的候选，每个候选的 accept 只成立一次 | SC-AG-130、SC-AG-173 | 待实现 |
| NA-T5-3 | T5 | 2 | 2.6（#526） | 全拒的拒绝消息以 action-denied 来源按原动作顺序交消息准入 | SC-AG-115 | 待实现 |
| NA-H0-1 | H0 | 2 | 2.6（#526） | 执行仍有推进资格时工具结果被拒收，H0 形成失败候选转 F1，Tool 没有第二次受理 | SC-AG-57、SC-AG-126 | 待实现 |
| NA-H0-2 | H0 | 2 | 2.6（#526） | 工具结果被拒收之后执行已无推进资格时，H0 只保管原结果转 O0，没有失败候选 | SC-AG-126 | 待实现 |
| NA-H0-3 | H0 | 2 | 2.6（#526） | 全拒批次中一个拒绝消息被拒收、执行仍有推进资格时，H0 形成失败候选转 F1 | SC-AG-130 | 待实现 |
| NA-X0-1 | X0 | 3 | 3.1 | 装配发布新版后，已开始的扩展调用仍按原精确采用解析实现，新版只出现在新建的 Passage 中 | SC-AG-102 | 待实现 |
| NA-X0-2 | X0 | 3 | 3.1 | 原实现或材料不可用时 X0 保持具名等待，等待依据含缺失的实现与材料，扩展调用保持 requested | SC-AG-102、SC-AG-184 | 待实现 |
| NA-X0-3 | X0 | 3 | 3.1 | 同一位置的多个扩展按装配顺序依次建立扩展调用 | 新增场景 | 待实现 |
| NA-X1-1 | X1 | 3 | 3.1 | 首次调用之前提交扩展调用的初始迁移，提交确认之前扩展没有被调用 | 新增场景 | 待实现 |
| NA-X1-2 | X1 | 3 | 3.1 | 已有最终 Conclusion 的扩展调用在恢复后不再被调用，X1 直接转 X5 | SC-AG-102、SC-AG-176 | 待实现 |
| NA-X1-3 | X1 | 3 | 3.6 | 人已答复、尚未 processed 时崩溃，恢复后以 replay 携带全部轮次的答复调用原精确采用，同一轮没有第二次 present | SC-AG-101、SC-AG-177 | 待实现 |
| NA-X1-4 | X1 | 3 | 3.6 | 扩展调用停在 asked 且没有答复时，恢复后节点转 X4 等待，不重出卡 | SC-AG-176 | 待实现 |
| NA-X2-1 | X2 | 3 | 3.2 | 扩展经注入能力发起的模型调用先提交操作再发出；崩溃后 replay 按原序号认回，只有一次模型调用与一笔费用 | SC-AG-100 | 待实现 |
| NA-X2-2 | X2 | 3 | 3.2 | 回放时同一序号的请求与已记录操作不同，能力锁存 replayInconsistent，之后不发出新操作，operations 的项数不变 | SC-AG-103 | 待实现 |
| NA-X3-1 | X3 | 3 | 3.2 | 扩展合法返回 proceed、veto、stop 或 inject 时，输出经 `judgeExtensionOutput` 校验后写入最终 Conclusion，节点转 X5 | 新增场景 | 待实现 |
| NA-X3-2 | X3 | 3 | 3.2 | 位置或干预力不允许的输出被拒收为 bad_output，依 `onError` 形成最终 Conclusion，推进不变 | SC-AG-105、SC-AG-107、SC-AG-109 | 待实现 |
| NA-X3-3 | X3 | 3 | 3.2 | replay 返回 controlUnavailable 或 notStartedUnavailable 时扩展调用保持 requested 并转 W0，没有不可用分支的 Conclusion | SC-AG-100 | 待实现 |
| NA-X3-4 | X3 | 3 | 3.2 | 扩展返回 ask 时提交新一轮 CardRound，节点转 X4 | SC-AG-112 | 待实现 |
| NA-X4-1 | X4 | 3 | 3.5 | 卡片呈现后执行转 W0 并写 waiting 事件；答复齐备后以 replay 携带全部轮次的答复转 X2 | SC-AG-145 | 待实现 |
| NA-X4-2 | X4 | 3 | 3.5 | present 回执丢失时 lookup 按原轮次与完整请求身份集合认回，没有第二次 present | SC-AG-45 | 待实现 |
| NA-X4-3 | X4 | 3 | 3.5 | present 确定失败时该动作被拒绝，Agent 代写结论转 X5，不登记人工等待 | SC-AG-129 | 待实现 |
| NA-X4-4 | X4 | 3 | 3.5 | 人对卡片拒答时 read 返回 declined，原扩展在 replay 中读到 declined，同一轮没有第二次 present | SC-AG-117 | 待实现 |
| NA-X4-5 | X4 | 3 | 3.5 | 同批另一动作的官方准入不可用时，已呈现且没有答复的卡片被作废，read 返回 invalidated | SC-AG-128 | 待实现 |
| NA-X4-6 | X4 | 3 | 3.5 | 同一张卡片收到重复答复或并发答复时只有一个有效答复 | SC-AG-118 | 待实现 |
| NA-X4-7 | X4 | 3 | 3.6 | 原扩展或后继扩展再次返回 ask 时开出新一轮卡片，仍属原批，旧轮次不重新呈现 | SC-AG-44、SC-AG-112 | 待实现 |
| NA-X5-1 | X5 | 3 | 3.3 | 合法 inject 的消息经 Q1、Q2、Q4 进入历史一次，节点回原扩展节点 | 新增场景 | 待实现 |
| NA-X5-2 | X5 | 3 | 3.3 | 扩展取得 stopped 且 terminal 为 failed 时，Agent 记录以该扩展为来源的控制请求，节点转 F1 | 新增场景 | 待实现 |
| NA-X5-3 | X5 | 3 | 3.3 | vetoed 在 P0 与 F2 都回 I8，没有新依据时 I8 转 W0，不重新提出同一请求或同一候选 | SC-AG-135、SC-AG-147 | 待实现 |
| NA-E3-1 | E3 | 3 | 3.4 | 新逻辑执行经过执行开始之后位置一次，同一操作重复 invoke 或 resume 时不再经过 | SC-AG-12、SC-AG-40 | 待实现 |
| NA-E3-2 | E3 | 3 | 3.4 | 该位置的扩展调用提交之前崩溃，恢复后 E4 回 E3 接续同一次经过，该位置的 Passage 恰有一个 | SC-AG-12 | 待实现 |
| NA-E3-3 | E3 | 3 | 3.4 | 没有适用扩展时 E3 结束时单独提交 `position` 前移，提交之前重入 E3 不产生扩展调用 | 新增场景 | 待实现 |
| NA-P0-1 | P0 | 3 | 3.4 | 调模型之前位置的扩展 proceed 后节点转 P1，同一次经过不再次经过该位置 | SC-AG-59 | 待实现 |
| NA-P0-2 | P0 | 3 | 3.4 | 扩展 veto 时 Model 没有受理记录，P0 转 I8，没有新依据时执行状态为 waiting | SC-AG-135 | 待实现 |
| NA-P0-3 | P0 | 3 | 3.4 | 扩展改写 `preparation.recipient` 时被拒收为 rewrite_touches_immutable | SC-AG-109 | 待实现 |
| NA-P1-1 | P1 | 3 | 3.4 | 再选择结果一致时 prepare 带 previous、改写依据与该位置的经过，返回 ready 后节点转 I2 | SC-AG-59 | 待实现 |
| NA-P1-2 | P1 | 3 | 3.4 | 再选择结果不一致时重新读取并重新准备，节点留在 P1，最终请求不混合新旧模型 | SC-AG-58 | 待实现 |
| NA-P1-3 | P1 | 3 | 3.4 | prepare 返回 invalid 且 field 为 request 时 P1 转 F1，失败候选为 request-rejected 并附 Model 的原结果 | SC-AG-155 | 待实现 |
| NA-M2-1 | M2 | 3 | 3.x（父卡未指定） | 首内容前可重试失败时扩展返回 retry，结论交 Model 的重试策略，M2 回 M1 等待同一调用，没有新 step | SC-AG-137、SC-AG-153 | 待实现 |
| NA-M2-2 | M2 | 3 | 3.x（父卡未指定） | 没有 retry 结论时 Model 按不再重试收场，M2 回 M1，原调用最终失败后不再经过 M2 | SC-AG-153 | 待实现 |
| NA-M4-2 | M4 | 3（扩展） | 3.4 | 调模型之后位置的扩展在 complete_reply 维度返回 proceed 时，M4 有一个 Passage，节点转 M5 | 新增场景 | 待实现 |
| NA-M4-3 | M4 | 3（扩展） | 3.4 | failure 维度的最终失败触发中扩展返回 retry 时，按不合法输出依 `onError` 形成最终 Conclusion，Model 没有收到重试决定 | SC-AG-137 | 待实现 |
| NA-A0-4 | A0 | 3（扩展链） | 3.4 | 同一动作的扩展按声明顺序串行，不同动作的链并行，链之间不读取对方的 Conclusion | SC-AG-111 | 待实现 |
| NA-A0-5 | A0 | 3（扩展链） | 3.4 | 链内扩展改写生效参数后，链末官方准入按新参数判断，旧批准不沿用到新参数 | SC-AG-48、SC-AG-113 | 待实现 |
| NA-A0-6 | A0 | 3（扩展链） | 3.4 | 链内扩展返回 ask 时该链在 X4 等待，同批其他链继续判断 | SC-AG-145 | 待实现 |
| NA-A1-3 | A1 | 3（卡片） | 3.5 | 本轮卡片在每条链到达最终 Conclusion 或合法等待之后一次呈现；有链在等人时 A1 转 W0，Tool 的发起数为零 | SC-AG-43、SC-AG-111、SC-AG-145 | 待实现 |
| NA-T2-2 | T2 | 3（扩展） | 3.4 | 单结果扩展对每个槽位各经过一次，改写后的 candidate 随 Passage 提交，一个槽位的经过不等待其他槽位 | SC-AG-120 | 待实现 |
| NA-T4-2 | T4 | 3（扩展） | 3.4 | 整批扩展返回 rewrite 时被拒收为 output_not_allowed_at_position，各槽位的候选消息不变 | SC-AG-106 | 待实现 |
| NA-F2-1 | F2 | 3 | 3.4 | 落终态之前位置的扩展 proceed 时 F2 转 F3，tryFinish 在 F2 的 Passage 之后 | SC-AG-140 | 待实现 |
| NA-F2-2 | F2 | 3 | 3.4 | 扩展 veto 时 F2 转 I8，没有 tryFinish 调用，执行状态回到 advancing | SC-AG-147 | 待实现 |
| NA-F4-2 | F4 | 3（扩展） | 3.4 | 落终态之后位置的扩展返回 stop 或 ask 时被拒收为 bad_output，没有 waiting 事件，终态不变 | SC-AG-108、SC-AG-148 | 待实现 |

## 新增场景提议

下表把 SC-AG 列为「新增场景」的行归成六个场景。编号是建议值，取自 [编号规则](scenarios.md#编号规则)中对应号段的空号。是否收入及最终编号由 scenarios.md 的拥有者决定。

| 建议编号 | 号段 | 场景要旨 | 覆盖的行 |
| --- | --- | --- | --- |
| SC-AG-156 | 140 至 159 Loop 节点与控制入口 | 一条 invoke 的输入在没有工具和扩展时走完一圈：Q1 不经扩展转 Q2，Q2 的接纳回执随 checkpoint 提交，Q4 回受理方；I0 一次提交输入批与新 step 并写 input-taken；I1 提交准备结果；M4 不产生扩展调用；I3 的准入结论与接续同次提交后转 I4 | NA-Q1-1、NA-Q2-1、NA-Q4-1、NA-I0-1、NA-I1-1、NA-M4-1、NA-I3-1 |
| SC-AG-157 | 140 至 159 Loop 节点与控制入口 | 主调用在途时新输入到达：已记录的最终请求不变，回复之后 I8 以新 step 转 I0 承接这条输入，已承接的输入不进入下一个输入批 | NA-I0-2、NA-I2-2、NA-I8-2 |
| SC-AG-158 | 140 至 159 Loop 节点与控制入口 | E1 的资格核验不可用、I1 的读取端口不可用时都转 W0 且不前进；另一次执行已为终态时 E1 转 F4 | NA-E1-2、NA-E1-3、NA-I1-3 |
| SC-AG-159 | 140 至 159 Loop 节点与控制入口 | 调模型之后位置的扩展返回 proceed 时 M4 有一个 Passage；返回 inject 时消息经 X5、Q1、Q2、Q4 进入历史一次；取得 stopped 且 terminal 为 failed 时记录控制请求并转 F1 | NA-M4-2、NA-X5-1、NA-X5-2 |
| SC-AG-138 | 100 至 139 扩展、整批动作与消息准入 | 一个回复含两个完整的工具调用部件：I4 按回复顺序解析两个 Action；官方准入都 allow 并带准入证据；两个判断都到达结论之前 Tool 的发起数为零，之后屏障记 open 并写 `batchDecision` | NA-I4-2、NA-A0-1、NA-A1-1 |
| SC-AG-139 | 100 至 139 扩展、整批动作与消息准入 | 同一位置有两个扩展：按装配顺序建立扩展调用，每个调用先提交初始迁移再被调用，合法输出经校验写入最终 Conclusion；另一次该位置没有适用扩展时，E3 单独提交 `position` 前移，不产生扩展调用 | NA-X0-3、NA-X1-1、NA-X3-1、NA-E3-3 |

## 与父卡的出入

下列各项是本表依据的节点表与 [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) 正文之间的差异。本表按节点表写行，这些差异交父卡拥有者处理。

1. 父卡写节点表有 48 个节点，节点表实有 56 行。阶段 1 至 3 涉及其中 49 个。其余 7 个是 C0 至 C4、Q5（阶段 4）与 F0（阶段 5），不在本表。
2. M2 属于阶段 3，3.1 至 3.7 的子卡都没有列出 M2。本表的子卡列写「3.x（父卡未指定）」。
3. 1.2 的阶段 1 正常路径从 E4 直接到 I0，从 I1 直接到 I2，从 F1 直接到 F3。节点表中初始 checkpoint 的 `position` 是 E3，I2 读取的 ready 准备由 P1 写入，F1 只转 F2。本表把阶段 1 的 E3、P0、P1、F2 当作直通，NA-I1-1 与 NA-F1-1 按此写。
4. 生长表写阶段 1 的 I8 是「两种去向」，1.7 列出三种去向：F1、I0、W0。本表按三种写行。
5. 2.6 交付「T2 直通、T4 直通」，生长表只把 T2、T4 列在阶段 3。本表为 T2、T4 各加一行阶段 2 直通。
6. 生长表没有把 A1 列在阶段 3，3.5 写卡片呈现受 A1 约束。本表为 A1 加一行阶段 3（卡片）。
7. H0 在阶段 2 成为真实节点。工具结果被拒收时经 Q5、Q4 回 T5 再到 H0，Q5 属于阶段 4。NA-H0-2 的「已无推进资格」需要取消或暂停，F0 与暂停属于阶段 5。阶段 2 只能用替身驱动 NA-H0-1 至 NA-H0-3。
8. 2.2 写 need-decision 在阶段 2 按 deny 处理并记原因。节点表与 SPEC 中 need-decision 使官方准入出卡并在 X4 等待。本表不为阶段 2 的这项处置建行，阶段 3 由 NA-A1-3 与 NA-A0-6 按节点表验收。
9. 读图约定三规定 stopped 的 terminal 为 cancelled 时经 E1 转 F0，F0 属于阶段 5。阶段 3 的 NA-X5-2 只写 failed 一支。
10. 0.4 的子任务行列出节点组 E、I、M、Q、F、O、A、T、X，0.4 子卡正文另列 W、R、H。生长表还含 U0、P0、P1。本表以生长表为准，包含全部这些节点。
11. 3.7 不拥有单独的节点。它的规则落在 NA-A0-3、NA-X0-2、NA-X3-2 与 NA-X4-5。

## Tool 关联补充目标

| 行号 | 节点 | 阶段与部分 | 子卡 | 用例名 | SC-AG | 实现用例 |
| --- | --- | --- | --- | --- | --- | --- |
| NA-A2-4 | A2 | 2 | 2.4（#524） | association-unknown 保存无引用 intent 与完整材料，以原 consumer 和当前资格重入 invoke | SC-AG-217 | 待实现 |
| NA-T0-4 | T0 | 2 | 2.5（#525） | 只投影 associated Tool 调用；原受理认回后沿原槽位保管、处理与解除。控制先认回原 C，再扫描新 pending；recordControl 先资格/租户与规范引用、原 R 认回，再校验新 target/引用/stage，失败精确映射归 SPEC | SC-AG-218、SC-AG-219、SC-AG-222、SC-AG-224、SC-AG-225 | T0 节点待实现；其中 Journal 控制与引用记录子承诺已有[公开端口测试](../../agent/tests/journal-tool-control.spec.ts)，不代表节点通过 |
| NA-R0-5 | R0 | 2 | 2.4、2.5 | Tool commit-unknown 保存原引用后 lookup，not-accepted 仍沿原 invoke 接续，association-unknown 保留 intent；后来 rejected 不排除历史尝试，当前资格不足保留未知与交接责任 | SC-AG-216、SC-AG-217、SC-AG-222、SC-AG-223 | 待实现 |

已有 NA-R0-4、NA-M0-1、NA-M6-1 的实现证据只覆盖 Model。Tool 另按本表与新增场景验证，不从原 admission 查询推广为 Tool 协议。F0 多前台 Tool 取消对应关系与 Q11/Q13 的其余机制仍属后续工作。
