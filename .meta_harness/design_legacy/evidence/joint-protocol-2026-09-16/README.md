# D-015 联合协议静态追踪（2026-09-16）

本页按已接受的旧 [D-015](../../decisions/tool-execution-message-stream-hooks/decision.md) 及局部新选择
[D-018](../../decisions/e-message-stream-hooks/decision.md)、[D-020](../../decisions/e-message-recovery-protocol/decision.md)，
追踪当前 **candidate v1** 跨能力链。它是设计核对证据，不是新行为决定、全部 J 场景通过、catalog 接受、
冻结或提供者符合性证明。下文「条款要求」表示规范中的义务；「有限检查」只指列出的模型抽象。

## 输入锁

读取基线 `41cbe0776f1c1e0950f8f2465964c3fb48c5a7c3`。路径均相对于 `design/`，摘要为
该基线文件内容的完整 SHA-256；本页的判断仅适用于这些字节。F/S/G/L/M/E 是迁移批次，
不是额外的产品坐标。`scenarios.md` 仅在现有坐标包含该文件时列出。

```text
F spec/data/agent-runtime-identity/v1/contract.md                 567c8e57aa0ac9cb467f3338a12f289c2cf98e43e7221d3b70de42e22a72d7fd
F spec/capabilities/live-agent/v1/contract.md                      90e4a0093fdb2a0626cf0ea56334de9218c86427ef15a437763ad84a8bb2297f
F spec/capabilities/live-agent/v1/scenarios.md                     da829bf7e7ab08e4aa3a184c813c178a044c72fa7758ac42653d7c52d9225d1c
F spec/compositions/agent-session-binding/v1/contract.md           8fa4dc2f8b7504809f152fc1f650e84c76b2869e96b1c711756050121912c7f0
F spec/compositions/agent-session-binding/v1/scenarios.md          6c1af3de09405afc63b819e1d5e6cb3c7fb815df01a53150d0dd19d5f8cff3b9
S spec/data/core-work/v1/contract.md                               92da6116b71dd4e85a7156ac4baf0615f595398c7718e3a216be18ee4368c2fd
S spec/capabilities/durable-records/v1/contract.md                 2b0e230114db6350b2b349c1e6db0746142024922d07f8352b9ecb1de835a024
S spec/capabilities/durable-records/v1/scenarios.md                d6bc47371473e33ef1b747d3bce86e02b9cdb4f982a33e87e3b36c01a505de56
S spec/compositions/core-work-coordination/v1/contract.md          3c1dc606df46a2c27a153c6b4e108513288a2364e483a6cecda2e0cf7473cdfb
S spec/compositions/core-work-coordination/v1/scenarios.md         44ce96b4362db311e0dde485aa3e071f8fab658f2f76480ba562c0571a9c4ab0
S spec/capabilities/engineering-observation/v1/contract.md         0c920b27a5df79c62ec09e3f6c235e9186461486d2378c2b39931dfa70417484
G spec/capabilities/tenant-governance/v1/contract.md                e3fba354bc9f2a540c8ec9ff6d1fe8ae659289f641f358d98544296e9c31c04a
G spec/capabilities/tenant-governance/v1/scenarios.md               4702baf0068458620d1b6a80cbc6790a52c31e98e80c27bb2a91ff83fcab7d12
G spec/capabilities/action-authorization/v1/contract.md            9dfc59b5265fe58048d00ac4c1c838ab1c4f1af6a67195dc269b8c4356114e78
G spec/capabilities/budget-accounting/v1/contract.md               784c48bbe27853e2ae84c316b221d5e5cf9ec094b0e624337e0367120ceb6b71
L spec/capabilities/session/v1/contract.md                          dab0166e029d8aa96f721c1eba4965e90d835753d252bd85de3d13e21a74742f
L spec/capabilities/run/v1/contract.md                              762e0113ac3634a8b828d66d924629a51adf03753b2db3dcb62e09cf1fa05bde
L spec/capabilities/run-driver/v1/contract.md                       c4d3e65c40a750eabc722da6e3c3dfe0f21433573865cf75390334e4658c81fc
L spec/capabilities/run-driver/v1/scenarios.md                      e066e7543971d9065bd8296954f5a51a65d0e5a747a7a591470bf7a9e2dc4e8f
L spec/capabilities/tools/v1/contract.md                            2a3f605cfdae0e851b35f71da0b714272604d68c5d79935b9a08d5f15c5f9c27
L spec/capabilities/tools/v1/scenarios.md                           4cbe51c441341ac8e45c31d6456cb934b54bf443562d7784a01ed4656e53e672
L spec/capabilities/human-decisions/v1/contract.md                  67c632803e4976960f36b19634ccf8b039319d8b4d6c0273f37b8d1768f562b0
L spec/capabilities/command-input/v1/contract.md                    40e3066f9802d1b7510246f675ea18b8f624eabed6f9786276a6c5f6a959aa44
L spec/compositions/session-run-agent-lifecycles/v1/contract.md     5bcda5e09685ec237f2153f11d7fc3500dc34505f58233568bc63f514053302f
L spec/compositions/session-run-agent-lifecycles/v1/scenarios.md    65d7bc49d1c8aded32e80b9af1b81800a302ab1fe4bc10c90e5e013dd1cc6161
M spec/capabilities/model-execution/v1/contract.md                  d7d6f9508f31915e48c4bbd33a89067c13f14c8af74cca706b12788b128091bf
M spec/capabilities/model-execution/v1/scenarios.md                 77b4b541b7729b1e1c10a9deb15702c01c555954f0c029c397ade43391ce9cc3
M spec/capabilities/media-content/v1/contract.md                   81c1669d3b023a5d90db1cda04d79342c62e813036225b840315e146477e0026
E spec/capabilities/message-stream/v1/contract.md                  a4ac7ff8fb7168d034c7bc0a5bd09bdfa57a79212a25214f3ad735589780538b
E spec/capabilities/message-stream/v1/scenarios.md                 2b5413628ce6513a6c2fddab1b0d1084fc8540a74d518cae9982977ca9c22afe
E spec/capabilities/external-hooks/v1/contract.md                  68525bd3253e430ed65415d1c3f86cc76e3e25205eff4d79dce2e511933a4890
E spec/capabilities/external-hooks/v1/scenarios.md                 a7c5644726360ce4a28b68b077adcd5022102e8f97043a499e3837fe59d372a4
D decisions/tool-execution-message-stream-hooks/decision.md        0dfba46d8986c4cc460e43e0a1ca6c991efb25cab0a480566ef2666f74f305cc
D decisions/e-message-stream-hooks/decision.md                     03985f0b2df2fdf7c65bd734a511d179bf24421232ddf955d99a5fe33b5046a7
D decisions/e-message-recovery-protocol/decision.md                c95aeeb548865be080bbbcbf43e6d8c10a13b2313d244671db54c4eeb7dc0a62
```

## 端到端交接

共同前提：首版仅一个已声明的协调域；[DR-01/02](../../spec/capabilities/durable-records/v1/contract.md)
使提交批次全成或全败，`eventId=(domain,batchSeq,recordIndex)` 是事实身份，operationId 只是操作去重；
[CC-02/03/04](../../spec/compositions/core-work-coordination/v1/contract.md) 把短门排位与效果前的耐久确认分开。
活体 [AR-8/10、CB-09](../../spec/compositions/agent-session-binding/v1/contract.md) 的 WorkPermit 和 Run epoch
只允许当前实例提交，不把它们误作工具执行 owner 的永久身份。

| 场景与事实 owner | 授权、同批提交与耐久事实 | 发布、投影与有权读者 | 结论及有限模型 |
|---|---|---|---|
| 正常模型→工具→接续 | [RD-09/10](../../spec/capabilities/run-driver/v1/contract.md) 提议；[TL-07/15](../../spec/capabilities/tools/v1/contract.md) 的 Action、Run 等待登记、AU-05/06 判定、BG-03 精确 attempt 预留/使用与执行许可按 [CC-01/03](../../spec/compositions/core-work-coordination/v1/contract.md) 提交；[TL-08/15](../../spec/capabilities/tools/v1/contract.md) 先 accepted、再耐久 dispatch_intent、再效果；终态+call settlement+Inbound arrival 同批。 | [SE-12/14](../../spec/capabilities/session/v1/contract.md) 对发起 Run 裁决，continuation 同批释放该 call 登记（[LC-04 行 9](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）；[SE-03](../../spec/capabilities/session/v1/contract.md) 从提交事实派生唯一历史结果；[MS-01/04/11/14](../../spec/capabilities/message-stream/v1/contract.md) 只提示并按权限拉取。 | 条款链可读，但 LC-04 与 CC-01 的新基线联合接受仍被下述冻结门阻断。Admission、Budget、ToolCall、RunDriver、Lifecycles 各是局部有限模型，未检查整个复合批。 |
| deny、ask、人工批准与内建 `human` | [AU-04～06](../../spec/capabilities/action-authorization/v1/contract.md) 的 deny 不产生执行许可；ask 由 [TL-15/HD-03/06](../../spec/capabilities/human-decisions/v1/contract.md) 创建附属 system_approval，决定只供同一 Action/attempt 消费，批准后仍经当前门及 BG-03；[TL-17/HD-05](../../spec/capabilities/tools/v1/contract.md) 的 `human` 答复把唯一决定、call settlement 与 arrival 同批，不另造 `human_answer` arrival。 | Inbound 对发起 Run 按 [SE-13/14](../../spec/capabilities/session/v1/contract.md) 分流；未占位则结果为 tool_result，已占位则下一 Step 的 reminder 只引用原 CallRef（TL-19、[CD-03](../../spec/data/core-work/v1/contract.md)）；读者沿 SE-20/MS-14。 | HD request/provisional 与 ToolCall 模型分别覆盖局部状态；没有批准、授权、预算与结果交付的联合模型。 |
| 失败、迟到与恢复 | [TL-20](../../spec/capabilities/tools/v1/contract.md) 区分未 accepted、已 accepted、dispatch_intent、终态未送达；[CC-06](../../spec/compositions/core-work-coordination/v1/contract.md) 仅在完整 owner roots、旧 claim 处置和新 writer epoch 后开放；[MC-06](../../spec/capabilities/model-execution/v1/contract.md) 与 BG-01/03 让 unknown 和迟到费用留在原 attempt。 | 原 operation 的历史 publication blocked 不改写；新代 lookup 可以说明其位置已被基线覆盖。TL-15 的 settlement 用原 `(call,attempt)` 受理，SE-18 扫描未裁决 arrival；MS-22 以 current disposition 收口，不从断线或缺席猜结果。 | CC RuntimeRevision/RecoveryEligibility 有限检查覆盖 publication/recovery 门；ToolCall/RunDriver 覆盖各自窗口。真实 claim、attempt 查询与多次崩溃未证。 |
| interrupt、cancel、force_stop、remove/recover | [RN-03/05](../../spec/capabilities/run/v1/contract.md) 封闭 epoch；[TL-08/09](../../spec/capabilities/tools/v1/contract.md) 的墓碑和精确 `quiescent/isolated` 关闭 exposure；unknown/unverified 不能使 force_stop 进入 cancelled。[LC-04 行 4～6](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) 分别处理终态、强停与 interrupt；[CB-06/13](../../spec/compositions/agent-session-binding/v1/contract.md) 撤绑定不撤外部效果。 | [LC-06/08](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) 广播只作提示，重建须先读完整前缀和裁决；[SE-14/17](../../spec/capabilities/session/v1/contract.md) 把迟到结果路由至 context/queue/closed，不复活旧 Run。 | RunDriver/Lifecycles、JointHooksRunControl、CC RecoveryEligibility 检查有限 safety；真实执行隔离、资源清理及多崩溃均为提供者义务。LC-04 同批范围待 S+L 联合接受。 |
| 耐久结果、授权投影、游标 | [DR-01](../../spec/capabilities/durable-records/v1/contract.md) 的批内顺序与 eventId；[SE-03/10/20](../../spec/capabilities/session/v1/contract.md) 分别拥有历史、投影和读权；[MS-06～12/22](../../spec/capabilities/message-stream/v1/contract.md) 把帧当提示，完整授权批、状态与正文安装完才移动客户端 cursor，迟到 snapshot 用 token/visibility/asOf CAS 拒绝。 | changes/snapshot 在披露点重查 [MS-14/15](../../spec/capabilities/message-stream/v1/contract.md)；缺权、删除与缺席不可相互区分。 [MC-12～14](../../spec/capabilities/model-execution/v1/contract.md) active publisher 的 pub/cut/generation 经 MS-23 listener→compact baseline→drain→live；source-lost 仅发非终态 MS-24 控制帧。 | Message Stream 单协议与 JointProjectionRecovery 有限模型覆盖完整安装、旧快照竞争及部分 active 换代；不验证真实客户端事务、全部 marker 队列、源恢复或逐媒体披露。 |
| 工具媒体过程与结果 | [TL-12/19](../../spec/capabilities/tools/v1/contract.md) 让执行 owner 标帧来源，只有 [CT-02/03](../../spec/capabilities/media-content/v1/contract.md) 耐久保留且记录 `producedBy(call,attempt)` 后才可在终态结果引用相同 MediaRef；[CT-04](../../spec/capabilities/media-content/v1/contract.md) 允许媒体取得/存储过程中按块呈现进度与错误，不能把尚未耐久的引用写成成功结果。 | 耐久结果经 SE-03 派生历史；[MS-18/21](../../spec/capabilities/message-stream/v1/contract.md) 仅发媒体引用/公开块，终端读取重新核 SE-20/MS-14；同一产物的 frame/result 按 mediaId 去重呈现。 | 这里的 retain→结果门有条款；现有 JointProjectionRecovery **没有**验证 CT 占用、产物来源或客户端媒体去重。准备稿 J12 若要求过程预览一律先 retain 成功，会比当前 CT-04 更严，不能作为本设计的验证前提。 |
| Hook 通知、工具门与关闭上下文 | [HK-15/20](../../spec/capabilities/external-hooks/v1/contract.md) 的 PreToolUse 只能收紧 TL-07 门，超时不重跑，提交前重验 CC-02/AU-06；程序化答复仍须 HD-05 资格。[HK-07/17](../../spec/capabilities/external-hooks/v1/contract.md) 每次运行恰一条耐久 completion，pass context 只有实际 take 才入下一 Step，close context 只留审计。 | `presentationEntries[]` 从唯一 completion 经 [OB-02](../../spec/capabilities/engineering-observation/v1/contract.md) 的有权投影呈现，不直接写 MS 事实帧；close/deny 与队列或调用的事实由各自 owner 提交，MS-01 只投递可披露事实。 | JointHooksRunControl 的 gate/close 三个 case 与十个定向反例覆盖局部竞态；不证明 OB 真实持久投影、命令进程或客户端通知去重。 |
| Stop hook 续跑 | 原 Run completed 已提交才执行 [HK-16](../../spec/capabilities/external-hooks/v1/contract.md) Stop；唯一 completion 后 `(RunRef,handler)` 去重 trigger 入队；[SE-06](../../spec/capabilities/session/v1/contract.md) takeTrigger 与 [LC-04 行 3](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) Run 创建/epoch 同批；HK-16 固定配置 revision、重查资格、占 cap slot，未过门则 source_invalid。 | trigger 后续由 Session 队列拥有；达到 cap 的观察只关联原 trigger，不生成第二条 completion；每个实际续跑 Run 经 HK-16 所述 BG-03 预算准入，模型调用仍走自己的门。 | JointHooksRunControl 检查 cap、revision、stopping、撤权、重复观察的有限 case。**预算预留与 trigger take/Run start 是否同一提交未在 LC-04 行 3 明示**；不能从 HK-16 的“沿 BG-03 预留”推断已有原子伙伴，须由 S/G/L owner 明确核对。 |

## 未闭合处与最小后续

1. **发布阻断，S+L：** [CC-01](../../spec/compositions/core-work-coordination/v1/contract.md) 仍明确写新 baseline
   “尚无”生命周期坐标，LC-04 行未成为它当前的同提交保证，并登记
   `s-lifecycle-lc04-joint-review-freeze`；如今 LC v1 已在输入锁内，不能仅因文件出现而自行解除门。
   联合核对 CC-01 的具名组合与 [LC-04 行 1～9](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)
   的提交 owner、同域与恢复约束，修正矛盾表述后重锁这两份资源。此前本页涉及 LC-04 的交接均未获发布闭合。
2. **未明示交接，S+G+L：** HK-16 要求续跑 Run 经过 BG-03 预留，但
   [BG-03](../../spec/capabilities/budget-accounting/v1/contract.md) 写“调用受理共同提交”，
   LC-04 行 3 的 trigger take/Run start 未列预算伙伴。核定该费用准入的精确 attempt/Step 身份、
   与 cap slot 的原子边界及预算拒绝时的 trigger disposition；只补这条交接，不发明另一个预算政策。
3. **验证边界：** 当前证据没有一个覆盖 J01～J16 全部交错的模型或可执行 trace 正反例。
   仅在上述 owner 交接修订后，针对“授权/预算/许可/settlement 同批”“stop cap/预算同批”及
   “媒体 retain/终态结果/读权”三个尚未由现有联合模型覆盖的竞态做最小定向核对；
   E 的变化使用当前 MS/HK 条款，不能复用准备稿中的旧占位或把单协议 PASS 称为联合通过。

现有 [形式证据总览](../formal-2026-09-16/README.md) 与
[消息投影](../formal-2026-09-16/j-message-projection/README.md)、
[Hooks 控制](../formal-2026-09-16/j-hooks-control/README.md) 分别固定实际 TLC 结果和范围；
上述未闭合项不被已有有限检查或本页静态追踪消除。
