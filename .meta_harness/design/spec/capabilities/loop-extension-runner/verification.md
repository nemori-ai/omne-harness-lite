# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-24，第一轮独立评审处置之后）：没有任何证据。**
> `capability.loop-extension-runner` v1 是 `candidate`，**经过第一轮独立评审、未接受**；尚无提供者设计、尚无源码。
> 回放的行为模型 **已触发、尚未建**（[契约 S-35](v1/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合)、[G-14](v1/contract.md#十三已知缺口)）；下面登记的规范场景**十四条一条都没演练**。
> **在模型建成之前，回放、先落后算、只跑一轮这几条只有场景这一种证据形式。**

## 证据义务

### 形式工件

**已触发、未建、未运行。**要检查的七条义务（名字、检查哪条性质、类型、前提）写在[契约 S-35](v1/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合)；下面「形式义务」一节记它的证据状态。
**这不是「已由模型覆盖」**：没有任何一条性质被一个模型检查过。

### 规范场景

**全部未开始**——它们要的是真实实现，而实现不存在。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-36 逐件顺序与改写叠加，放行判断看到最后那一份](v1/contract.md#s-36-逐件顺序与改写叠加放行判断看到最后那一份) | 演练，**清单故意把放行判断排在前面** | **未开始** | 排在末位是清单给的时，这条什么都证明不了；必须让 runner 自己挪 |
| [S-37 回放不出第二张卡、不再问第二遍模型](v1/contract.md#s-37-回放不出第二张卡不再问第二遍模型) | 演练 ＋ **协程回收** | **未开始** | 受阻：等待原语与卡片契约未起草（[G-8](v1/contract.md#十三已知缺口)）；三支（答复后最终结论、答复后新一轮、偏离即停）必须都跑 |
| [S-38 停机不产生第二条结论](v1/contract.md#s-38-停机不产生第二条结论) | **故障注入**，两个停机点同一次对比 | **未开始** | 受阻：一次经过的锚未定表示（[G-1](v1/contract.md#十三已知缺口)） |
| [S-39 装配清单变了，回放报不一致](v1/contract.md#s-39-装配清单变了回放报不一致) | 演练 | **未开始** | 之后运行怎么收归 loop（G-8），本场景只断言「没有新结论、一条不少」 |
| [S-40 注入链只有一层](v1/contract.md#s-40-注入链只有一层) | 演练 | **未开始** | 必须观察到 loop 到了下一个状态点——只看「没有第二条提醒」不够 |
| [S-41 不可用、报错、否决三者分得开](v1/contract.md#s-41-不可用报错否决三者分得开) | 演练 ＋ **故障注入** | **未开始** | 最容易被「出错就当无意见」抹掉的一条，**必须真跑** |
| [S-42 系统自带件不可用时由指定挂件顶上](v1/contract.md#s-42-系统自带件不可用时由指定挂件顶上) | **故障注入**，五件各一次；另跑「清单里没有放行判断」「转换件不可用 × 纯文本」「系统自带件写了 `unavailability`」 | **未开始** | 受阻：模态转换、重试、循环探测三件的能力标识未定（[G-3](v1/contract.md#十三已知缺口)）；放行判断那一行已由产品裁定（PF-012、D-039 U-5） |
| [S-43 找不到清单不是空链](v1/contract.md#s-43-找不到清单不是空链) | 演练 ＋ 故障注入 | **未开始** | —— |
| [S-44 连续被否决的回复被收住](v1/contract.md#s-44-连续被否决的回复被收住) | 演练 ＋ **在第 N−1 次之后停机**；另跑「L2 阈值与上限不同」「设置读不到」 | **未开始** | 受阻：连续否决上限这项运行时设置的名字与默认归 agent loop 那一程（未起草） |
| [S-45 模型的回复落盘之前改不了](v1/contract.md#s-45-模型的回复落盘之前改不了) | 演练，四支 | **未开始** | 原受阻于 `data.loop-extension` 的可改成员表，已在那边 S-23 写明（原 G-15 ①） |
| [S-46 retry 被拒，按上交继续](v1/contract.md#s-46-retry-被拒按上交继续) | 演练，**跨契约**（本契约 ＋ 模型请求运行时的 `canDispatchAgain`）；三支 | **未开始** | 只读守卫由模型请求运行时判，只跑本契约这一半证明不了 |
| [S-47 过期的协程写不进](v1/contract.md#s-47-过期的协程写不进) | **故障注入**（两副协程）；另跑一次无运行的经过（入站那一侧）两副协程并发 | **未开始** | 受阻：尝试栅栏与条件写入归 loop 那一程的契约与日志写入（G-8） |
| [S-48 放行判断一轮汇合、凭据扣住、答复只认自己的卡](v1/contract.md#s-48-放行判断一轮汇合凭据扣住答复只认自己的卡) | 演练，**跨契约**（本契约 ＋ 放行判断 ＋ 执行运行时 ＋ 兼容层）；另跑 `admit` 整批失败与拆批 | **未开始** | 受阻：凭据交出的表示（[G-16](v1/contract.md#十三已知缺口)）、自由作答落成授权表达的写入者（`capability.tool-admission` 的 G-2）、答复三种表示（[G-17](v1/contract.md#十三已知缺口)） |
| [S-49 声明了「不可用即否决」的租户件](v1/contract.md#s-49-声明了不可用即否决的租户件) | **故障注入**，四支 | **未开始** | 最容易被「不在就跳过」一刀切掉的一条，**必须真跑** |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| 尝试栅栏：只收序号最大那次尝试的写入 | [S-21](v1/contract.md#s-21-dispatch一次经过) ② | agent loop 那一程的契约 ＋ 日志写入 | 那份契约的场景；本契约 S-47 |
| 一批判完之前一个都不执行 | [S-29](v1/contract.md#s-29-一批动作每个动作一次经过) 第 3、9 条 | agent loop ＋ 执行运行时（凭据） | 本契约 S-48 跨契约演练 |
| 卡片按 (这一次经过, 那一件, 那条 `ask`) 恰一张、先于「在等人」可见 | [S-27](v1/contract.md#s-27-ask交出卡片并停在这一位置) | 等待原语（loop）＋ PF-008 卡片契约 | 那两份的场景；本契约 S-37 |
| 回放偏离的检出 | [S-28](v1/contract.md#s-28-回放) 第 4 条 | 等待原语（loop） | 本契约 S-37 第 ② 支 |
| `before_terminal` 否决理由到 agent 眼前 | [S-23](v1/contract.md#s-23-效果之后的事由谁做) | 上下文组装（PF-010） | [G-8](v1/contract.md#十三已知缺口) |
| 各件求得的位置、维度、干预力、策略；工作区来的只观察 | [S-6](v1/contract.md#s-6-拓展件链从装配清单来) 第 3 条 | 资产求值 ＋ 装配 | `capability.asset-evaluation` 的场景 |
| 无运行的经过按 (经过, name) 条件写入 | [S-21](v1/contract.md#s-21-dispatch一次经过) ② | 日志写入边界 | 本契约 S-47 第二支 |
| 连续否决上限是一项运行时设置、与 L2 分开 | [S-30](v1/contract.md#s-30-连续被否决的回复) 第 3 条 | agent loop 那一程（设置项的名字与默认） | 本契约 S-44 |

## 对齐义务

**与别的契约之间写进本契约的项**。2026-09-24 整批对齐逐行核对了对方正文；同日第一轮评审处置后的变化记在右列，对方那一半由各自批次改，**核对以最终合回的正文为准**。

| 来自 | 条款 | 本契约落在哪 | 核对状态 |
|---|---|---|---|
| `capability.tool-admission` v1 S-29／S-30 | ① 放行判断钉 `before_action` 链末（装配清单义务，runner 强制） | [S-6](v1/contract.md#s-6-拓展件链从装配清单来) 第 2 条 | **已核对，一致**（对方 S-29、S-30） |
| `capability.tool-admission` v1 S-14／S-29 | ② 拒绝投影成 `veto` 时 `reason` 原样带拒绝原因 token；runner 自己写的 `reason` 不借用它们 | [S-29](v1/contract.md#s-29-一批动作每个动作一次经过) 第 6 条 | **已核对，一致** |
| `capability.tool-admission` v1 S-24／S-29／S-34 | ③ `admit` 整批失败（含 `unavailable`）或它不可用时，同批每一项都得 `vetoed` | [S-29](v1/contract.md#s-29-一批动作每个动作一次经过) 第 7 条、[S-17](v1/contract.md#s-17-系统自带件不可用时一律关门)、[S-48](v1/contract.md#s-48-放行判断一轮汇合凭据扣住答复只认自己的卡) 末支 | **已核对，已统一**（D-040 S15-d）：不可用记录不带 `output`（现带 `unavailability: fallback`）、效果 `vetoed`；`admit` 失败记 `skipped: errored` ＋ `error`、按 `treat_as_veto` 效果 `vetoed`——**记录形状以对方 S-29／S-34 为权威**，本契约 S-48 已对齐 |
| `capability.tool-admission` v1 S-26 | 放行判断件的能力标识 `omne-official:admission-judgment` | [S-7](v1/contract.md#s-7-系统自带件怎样挂上) | **已核对，一致**（对方 S-26 正文，2026-09-24 读到）；`data.loop-extension` v1 examples 里仍写 `omne-official:tool-admission`，须改成同一个名字（已报主线） |
| `capability.tool-execution-runtime` v1 S-63 | 卸载判定件的能力标识 `omne-official:offload-judgment` | [S-7](v1/contract.md#s-7-系统自带件怎样挂上) | **已核对，一致**：对方 S-63「卸载判定这一件」给出（S-1 的拥有表指向它；K29 原写 S-1，本契约按实际给出处引 S-63） |
| `capability.tool-admission` v1 S-12／S-22 | ④ 答复以四个选项 id 或 `declined` 交回重判；自由作答不作为答复，先落授权表达再不带答复重判 | [S-29](v1/contract.md#s-29-一批动作每个动作一次经过) 第 8 条、[S-28](v1/contract.md#s-28-回放) 第 4 条（新一轮 `ask`） | **已核对，一致**（对方 S-12） |
| `capability.tool-admission` v1 S-31 | ⑤ 同批有等人的项时扣住已放行项的放行凭据，不交给执行运行时 | [S-29](v1/contract.md#s-29-一批动作每个动作一次经过) 第 9 条 | **已核对，一致**（对方 S-31：本能力不扣住，扣住归 runner 与执行运行时）；凭据交出的表示仍是 [G-16](v1/contract.md#十三已知缺口) |
| `capability.tool-admission` v1 S-28 | ⑥ 兼容件复用四档选项的卡，答复不带授权、不作为答复交给放行判断 | [S-28](v1/contract.md#s-28-回放) 第 4 条、[S-29](v1/contract.md#s-29-一批动作每个动作一次经过) 第 8 条 | **已核对，一致**（对方 S-28；`capability.hooks-import` v1 的 S-21 同） |
| `capability.tool-admission` v1 S-21／S-23 | 整批一次、按轮 | [S-29](v1/contract.md#s-29-一批动作每个动作一次经过) 第 5 条 | **已核对，一致**（对方 S-21、S-23）；整批输入的来路由 `data.loop-extension/v1#S-14` 的注答复 |
| `capability.modality-projection` v1 S-23 | 转换件在 `before_persist_message` 上是最后一个动块的 | [S-6](v1/contract.md#s-6-拓展件链从装配清单来) 第 2 条（本契约取整条链的末位） | **已核对**：对方要「最后一个动块的」，本契约取整条链的末位——强于对方的性质，不冲突；取法已报主线 |
| `capability.modality-projection` v1 S-20／G-2 | 转换件对模型回复交回「挂派生表示」的 `rewrite`，不算 D-5 要防的改写 | [S-14](v1/contract.md#s-14-结论合不合法两类判断) ② 前两行 | **已核对，一致**；`data.loop-extension` 一侧已在 S-23 写明（原 G-15 ①） |
| `capability.modality-projection` v1 S-21／S-22 | 转换件不可用只否决含要转的块（给模型看、还没带派生属性的语音块、图块、文件块，对方 S-20 ①）的消息 | [S-17](v1/contract.md#s-17-系统自带件不可用时一律关门) 转换件那一行 | **已核对，一致**（对方 S-21、S-22） |
| `capability.model-request-runtime` v1 | `select_model` 的合法目标判定；`retry` 的只读再发守卫 `canDispatchAgain(session, callId, plan) → {allowed} \| {refused{why}}`（MRR S-50），`why` 与 `dispatchAgain` 的拒绝同表，已终结是操作失败 `alreadyEnded` | [S-14](v1/contract.md#s-14-结论合不合法两类判断)、[S-26](v1/contract.md#s-26-retry-与它被拒) | **已核对，一致**：对方 S-24 `legalTargets`；只读守卫在对方 S-50，输入带 `plan`、守卫表与 S-30 同一张，已终结是操作失败 `alreadyEnded`（本契约按「不合法」处置） |
| `capability.asset-evaluation` v1 | 各件求得的四样值 | [S-6](v1/contract.md#s-6-拓展件链从装配清单来) | **已核对**：四样值是对方 S-8 `values` 里的项；它们在装配清单里怎样表示仍是 [G-2](v1/contract.md#十三已知缺口) |

| `data.loop-extension` v1 S-6／S-31／S-33 | 不可用处置：声明成员 `unavailability ∈ skip \| veto`（缺席 = `skip`）；不可用记录带实际采用的 `unavailability ∈ skip \| veto \| fallback`；系统自带件由指定挂件顶上 | [S-12](v1/contract.md#s-12-不可用与报错runner-怎么分)、[S-17](v1/contract.md#s-17-系统自带件不可用时一律关门) | **已核对**（对方本轮修订中的正文：S-6、S-31、S-33 已带这三处） |

**上表的能力契约都已登进 catalog**，clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面) 末表。

### 形式义务：回放的行为模型（已触发，未建）

**义务依据 D-040 S15-c**：`formal/Runner.tla` 由主线另派任务建，**本版目录里还没有它，也没有登记 formal task**——「未运行」如实登记。
要检查的七条义务（`OneFinalConclusionPerPiece`、`CommitBeforeNext`、`ReplayReproducesEffect`、`RemindersExactlyOnce`、`OneCardPerAsk`、`StaleAttemptCannotWrite`、`AnsweredPassCompletes`）与各自的前提（常量有界、实现结果非确定、栅栏与条件写入原子、答完之后再调一次 `dispatch` 的弱公平）写在[契约 S-35](v1/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合)；
**每一条登记为 formal task 时都要写明它检查哪条条款的哪条性质、在什么前提下**。

另配否定配置（关掉「先落」、关掉「按锚判重」、关掉栅栏）作 validity-check，预期出反例、**不登记为 formal task**。
**被建模方式吸收、不作证据的**：效果合成与三张处置表、`reason`／`error` 的措辞、答复的三种表示、放行判断一轮一次 `admit`——证据形式是场景（S-41、S-42、S-46、S-48、S-49）。

## 实际执行

**无。**本版没有形式工件，也没有实现；本页不记任何「通过」。

## 独立评审

**第一轮**：spec-reviewer，2026-09-24，基线 `765b01dc`（HUB），发现表 `tmp/assets-runtimes/reviews/r1-R4b.md` 第〇、一节。处置按主线的修复波裁定，K 编号即 [D-040 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) 的编号。

| 发现 | 处置 | 落点 |
|---|---|---|
| X1（rev 落后） | **改**：逐版复核 PF-012 10→14、PF-008 5→7、PF-002 16→20、PF-013 8→12、PF-014 5→7、PF-004 10→12，变化与落点见下「变化的影响」2026-09-24 第一轮一条；头部 rev 改到当前；covers note 同轮改 | 头部；S-12、S-17、S-27、S-29、S-30 |
| X4（「宿主」同名不同义） | **不改本契约**：本契约的「宿主」与 [UL-cancellation-follows-host](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host) 同义（主线词条第四轮结论）；hooks-import 改称「来源产品（Claude Code／Codex）」 | README 一处改称；hooks-import |
| R1（整批会合无调用协议） | **改**（K31）：`before_action` 上 `dispatch` 带 `actions`（这一批全部动作），runner 内部会合、一轮一次 `admit`、结果按 `CallId` 分回；下一轮 = 这一批答完之后对同一批的下一次 `dispatch`；拆批即 `invalidInput`；登进 S-32 | S-21 ①②④⑤⑥⑦、S-29 第 2～5 条、S-32「一批一次会合」、S-48、examples §1 |
| R2（租户件「声明为否决」、U-5） | **改**（K8）：S-12 加不可用处置表（租户件按声明、`veto` 只随求得 `veto` 档与「之前」位置、系统自带件 `fallback`）；记录带 `unavailability`；S-17 改为指定挂件、U-5 引 D-039；P-8 改依据；新增 P-19、S-49 | S-6 第 3 条、S-10 第 3 条、S-12、S-15、S-16、S-17、S-23、P-6、P-8、P-19、S-49、examples §6a |
| R3（被拒 `retry` 与 `treat_as_veto`） | **改**：被拒的 `retry` 按有效策略处置、照常参与合成——`ignore`／`record` 不终止，`treat_as_veto` 在该位置落 `stop{failed}`、终止（与 `data.loop-extension/v1#S-5`、`#S-34` 一致，不开例外） | S-26 第 3 条、S-46、examples §2b 变体 |
| R4（嵌套经过） | **改**：嵌套经过由 runner 自己发起、是外层 `dispatch` 的一部分；沿用外层栅栏；失败即外层以同一失败值收场；`ask` 在那里按表示层拒绝处置、不传外层；「runner 追加的提醒」凭 `producer = system` 且 `source.kind = extension` 认 | S-19 第 3、4 条 |
| R5（无运行的经过没有栅栏） | **改**：无运行的经过按 (经过, name) 条件写入，提醒按 `MessageId`；嵌套经过沿用外层栅栏；登进 S-32、P-13 | S-21 ②、S-32、P-13、S-47 |
| R6（答复三种表示分不开） | **改**：登 G-17（owner PF-008／`data.messages` G-5）；闭合前认不出的答复收 `unavailable`、停在那一项，不读成 `declined`、不替它再出卡 | S-29 第 8 条、G-17 |
| R7（S-35 自相矛盾） | **改**：S-35 改为「已触发、尚未闭合」，列七条义务名、检查哪条性质、前提；README 与本页头部同步；本轮不建模（G-14） | S-35、G-14、README、本页 |
| R8（缺席系统件的记录名与档位） | **改**：`extension` 取能力标识的 name，`power` 取声明值（放行判断恒 `veto`） | S-6 第 2 条、S-42 |
| R9（「链接待合流后补」） | **改**：链 UL-extension-point-pass、UL-extension-unavailability-policy、UL-consecutive-veto-limit；删过时说明 | 设计依据表、非词条清单、本页对齐义务 |
| 范围外 3（连续否决上限与 L2） | **改**（K49）：上限是 PF-012 那项运行时设置本身，与 L2 分开、各自阈值；读不到即 `unavailable` | S-30 第 3 条、P-17、S-44 |
| 范围外 4（「待产品负责人确认」） | **改**（G2）：依据改引 D-040／D-039／产品正文；本轮的 K 项引 D-040 §五（主线汇编，2026-09-24 夜）；仍未汇编进 D-040 的两条登 G-13 | 设计依据表、G-4、G-11、G-13 |
| K22（只读守卫） | **改**：`retry` 判定改用 `canDispatchAgain(session, callId, plan)`（MRR S-50，与 S-30 同一张守卫表；`plan.provider` 在守卫里判）；调用已终结得操作失败 `alreadyEnded`，runner 按「不合法」处置、不读 `why`（与 MRR 批的交接，2026-09-24） | S-4、S-14、S-26、S-32、S-46、examples §2、catalog |
| K26（`admit` 失败记录） | **改**：`skipped: errored` ＋ `error`，`output` 为 `treat_as_veto` 的 `veto`；以 tool-admission S-29／S-34 为权威 | S-29 第 7 条、S-48、examples §6b |
| K29（两件能力标识） | **改**：S-7 引 `omne-official:admission-judgment`（tool-admission S-26）与 `omne-official:offload-judgment`（TER 的给出处是 S-63，K29 写的 S-1 是它的拥有表）；G-3 收窄为其余三件；catalog 加 TER 依赖（S-63） | S-4、S-7、G-3、examples |

## 变化的影响

- **2026-09-24 第一轮独立评审处置（候选，未冻结，原地改）**：处置逐条见上表。
  - **产品依据 rev 复核**：PF-012 rev 11（落盘前对模型回复只能否决；转换件没登记 vs 不可用；系统自带件不走卸载；放行判断不能替换；连续否决上限；中断提醒不开 Run）、rev 12（**不可用处置**：租户件跳过／声明否决、系统自带件指定挂件、放行判断全拒件、「此刻不在、按 X 处置」可见）→ S-12、S-17、S-23、S-30 已落；rev 13～14（转换件本版不是资产、组织与租户换不了）→ 本契约原本就不许非系统件挂派生表示，无改动。PF-008 rev 6（写不出卡＝不放行、兼容件的卡不带授权）→ 原已落；rev 7（清卡第三条路「它等的执行已终局关成已作废」、放行判断不可用全拒件）→ S-27 第 6 条、S-29 第 8 条、S-17。PF-002 rev 17（同一位置先后＝装配清单顺序）→ 原已落；rev 19～20（不可用处置是这一件自己的声明）→ S-6 第 3 条、S-12。PF-004 rev 11～12（I-4 一次运行之内；构成变小也重新装配）→ 清单在两次尝试之间变了的处置不变（S-28 第 1 条），无改动。PF-013 rev 9～12（落盘前否决不是调用失败、转换件替换只在系统装配层）→ 与 S-23、S-17 一致，无改动。PF-014 rev 6～7（中断提醒不让队列非空、连接件开新会话）→ G-6 的描述改写，无条款改动。
  - **对证据的影响**：没有既有证据；S-41、S-42、S-44、S-46、S-47、S-48 的断言改了，仍登「未开始」；新增 S-49。
  - **消费者要知道的**：agent loop 在 `before_action` 上改为一批一次调 `dispatch`、拿回逐项效果；TER、MRR 引的本契约 S-17、S-21、S-6 锚点不变。
  - **依据链**：主线把本轮 K 项汇编进 [D-040 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)之后，设计依据表加一行链 K8、K22、K26、K29、K31、K49；G-13 由三条减为两条（K31 已入 D-040）；语义不变。
  - **与同轮对方批次的交接**（2026-09-24）：只读再发守卫改引 MRR S-50，输入带 `plan`（供应商允不允许在守卫里判），调用已终结得操作失败 `alreadyEnded`、按「不合法」处置（S-14、S-26、S-32、S-46、examples §2）；卸载判定件的能力标识改引 TER S-63（给出处），catalog 同改；S-17 转换件那一行改按「要转的块」口径（modality-projection S-20 ①），S-42 场景随之写明只给人看的块与已带派生属性的块照常落盘。**语义改变**：`retry` 的供应商不被允许，由原先「再发时被 `dispatchAgain` 拒、那一笔由它记」改为在落日志前判为不合法、按报错处置。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定」的，长期落点现为 D-040（S14-d、S15-a～S15-g）。
  - **四项并行依赖登进 catalog**（G-12 闭合），对齐义务表逐行核对完毕（上表右列）。
  - **放行判断件不得被替换、禁用或收窄**（S14-d）：[S-17](v1/contract.md#s-17-系统自带件不可用时一律关门) 末条改写，G-4 闭合。
  - **`data.loop-extension` 的四处已对齐**（G-15 闭合）；整批输入的来路由那边 S-14 的注答复，G-16 收窄为「凭据经哪一格交出」。
  - **回放要建行为模型**（S15-c）：[S-35](v1/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合) 与 G-14 改写，义务登在上面「形式义务」一节。
  - `retryRefused` 的读法随 `capability.model-request-runtime` 改（已终结归 `alreadyEnded`）。
  - **对证据的影响**：没有既有证据；S-45 的受阻原因解除，S-48 只剩凭据交出与授权写入者两处受阻。

- **2026-09-23 起草**：首版，没有旧证据可作废。起草途中按主线转来的补充原地修订了四处（候选未冻结）：
  系统自带件不可用的关门表与挂载写法、同位置两件 `retry` 取第一个、`retry` 被拒按上交继续；
  模态转换件钉末位与「挂派生表示」出口、转换件不可用只及含非文本模态块或文件块的消息；
  放行判断的六条对齐（上表）；回放时「答复之后再出卡」由「回放偏离」改为**新的一轮等人**，偏离改由等待原语检出、`replayInconsistent` 收场。
  **没有任何证据因此作废**——此前也没有证据。
- 此后契约任何一处改动涉及上表场景的，**对应场景重新登记为「未开始」**；对齐义务表中任一行核对出差异，先报主线，改判后在这里记一条。
- **（2026-09-24 措辞对齐 PF-013 rev 12，主线裁定，不改语义）**：`data.loop-extension` v1 的 `request.target` 与 `select_model` 的 `profile` 改为路由名（`RouteName`）之后，本契约第 163 行附近「`select_model` 的档案引用」改为「换上的路由名」，[S-25](v1/contract.md#s-25-before_model_call-上的换模型与重新组装) 第 1 条注明 `profile` 是一个路由名、有效模型是它落到的那一行；成员名 `profile` 不改，catalog 不变（本契约仍不据 `data.model-profile` 的条款写出承诺）。没有证据因此作废。
