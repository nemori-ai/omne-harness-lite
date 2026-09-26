# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：形式检查已跑（有界；作证据的只有 P-1、P-7，P-2～P-6 在模型里按构造成立、不作证据）；其余一律未开始。**`capability.stream-assembly` v2 是 `candidate`，未接受、未冻结；
> 尚无提供者设计、尚无源码、尚无装配。工具侧宿主已逐条承诺 [S-28](v2/contract.md#s-28-宿主要兑现的前提)（`capability.tool-execution-runtime/v2#S-62`，candidate），模型侧也已逐条承诺（`capability.model-request-runtime/v2#S-51`，candidate；原 G-2 闭合）。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **行为模型**：P-1（块次序）与 P-7（两半：一次性形式逐个被接受、结果相等）在有界范围内无反例；三个变异配置各给出反例 | TLC，按 [`formal/README.md`](v2/formal/README.md) 的四份配置 | [S-6](v2/contract.md#s-6-一块在状态里是什么)、[S-9](v2/contract.md#s-9-一块怎样落) 的块次序与落法、[S-27](v2/contract.md#s-27-一次到达装配等于一次性到达) | **已跑，见下文「结果与反例」**。只在所列常量内成立；**不覆盖** P-2～P-6（模型里按构造成立，证据归 V-4 的 S-34、S-35、S-38），也不覆盖 formal/README「盖不到什么」一节列的语义 |
| V-2 | **一致性用例**：[`examples.md`](v2/examples.md) 第 2～8 节的每一串事件交给实现，快照与结算结果逐项等于手算值；第 5 节每行得到逐字相同的失败值、状态不变 | 同一份语言无关用例集跨实现比对（[D-035](../../../record/decisions/message-and-stream-baseline/decision.md) 选择表末行：共用一份一致性用例集） | [S-7](v2/contract.md#s-7-快照交出什么)～[S-16](v2/contract.md#s-16-首个内容的位置)、[S-23](v2/contract.md#s-23-本能力自己的失败值)～[S-26](v2/contract.md#s-26-被拒不改状态后果归宿主) | **未开始**。手算值只由起草者核过，**手核不是证据** |
| V-3 | **性质测试**：随机切分、随机合并同一段内容（含 `rate_merged` 的 `trim`），结算的块相等；随机的砍，汇总满足 `data.call-accounts/v2#S-15` 三式与 `merged + cut + frame_too_long ≤ emitted` | 生成式测试 | [S-13](v2/contract.md#s-13-账)、[S-14](v2/contract.md#s-14-砍的汇总)、[S-27](v2/contract.md#s-27-一次到达装配等于一次性到达) | **未开始**。它补的是模型抽象掉的那一半：真实载荷、真实块形状、砍的汇总 |
| V-4 | **规范场景** [S-31](v2/contract.md#s-31-并开两块一次砍一次整体替换)～[S-39](v2/contract.md#s-39-先截短后拒收只计一次) | 规范场景演练：真实的到达装配实现 | 见各场景；S-34、S-35、S-38 同时是 P-2～P-6 的证据 | **未执行**。S-32 的后一半（不执行、回 `failed` 结果）归工具执行运行时，证据是它的场景 `capability.tool-execution-runtime/v2#S-64` |
| V-5 | **消费者路径走查**（[CS-1～CS-4](v2/contract.md#消费者核对场景)） | 结构化走查；宿主契约建立之后升级为真实演练 | [S-8](v2/contract.md#s-8-收尾结算交出什么)、[S-9](v2/contract.md#s-9-一块怎样落)、[S-13](v2/contract.md#s-13-账)、[S-16](v2/contract.md#s-16-首个内容的位置)、[S-20](v2/contract.md#s-20-snapshot读快照)、[S-22](v2/contract.md#s-22-abandon放弃) | **未开始**。走查不需要提供者，现在就做得了 |
| V-6 | **宿主前提**：[S-28](v2/contract.md#s-28-宿主要兑现的前提) 各条在两个宿主的契约里各有承诺与证据 | 宿主契约的条款与场景 | [S-28](v2/contract.md#s-28-宿主要兑现的前提) | **工具侧**：承诺已写（`capability.tool-execution-runtime/v2#S-62`，第 1～4、6、7、9 条），证据义务归那份契约，**未开始**。**模型侧**：承诺已写（`capability.model-request-runtime/v2#S-51`，第 1、2、4、6、7、8、9 条），证据义务归那份契约（它的场景 S-52），**未开始**。**这不是免除** |
| V-7 | **跨进程**：[S-29](v2/contract.md#s-29-部署装配给与协议给) 右列七行逐行演练 | 规范场景演练 | [S-29](v2/contract.md#s-29-部署装配给与协议给) | **未开始，且本版的部署装配下无法演练**——单机同进程传值不构成接收边界 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。本版全部状态为「未开始」，**不得以「已列出」充当「已通过」**。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 到达装配的实现里，工具调用参数的解析调用点**恰一处**，且只在接受封口的那条路径上；快照与结算的路径不解析 | [S-10](v2/contract.md#s-10-工具调用在封口那一下解析且只解析这一次) | 未开始 |
| SC-2 | 到达装配的实现不持有按目标键控的表、不读时钟、不做 I/O、不发通知 | [S-1](v2/contract.md#s-1-本契约拥有什么)、[S-3](v2/contract.md#s-3-本契约不拥有什么) | 未开始 |
| SC-3 | 被拒的那条路径上不存在任何对状态的写 | [S-26](v2/contract.md#s-26-被拒不改状态后果归宿主) | 未开始 |
| SC-4 | 快照交出的值与状态不共享可变部分 | [S-7](v2/contract.md#s-7-快照交出什么) | 未开始 |

## 结果与反例

### V-1：TLC，2026-09-24（S25 第一轮修复之后，现行）

- **规范修订**：工作树 `panqiwei/assets-runtimes`，HEAD `ff7867d1` 之上未提交的修改（本轮修复）。四份输入逐文件复制进证据目录并记 sha256：
  `Assembly.tla` `82349727…264b`、`Assembly.cfg` `af96e0ff…c82c`、`Assembly_OrderByClose.cfg` `7a437b75…bbe3`、`Assembly_ReplaceAsAppend.cfg` `7e5e1c6d…231`、`Assembly_OneShotCloseFirst.cfg` `2680ba91…986`。
- **工具**：TLC2 Version 2026.09.12.025210（rev 867aefb），`-workers 1`，`/usr/local/bin/java`、`/opt/tlaplus/tla2tools.jar`；每个配置单独一次，脚本、输入、原始日志与退出码在 `tmp/formal-runs/stream-assembly-v2-2026-09-24d/`（任务区，**未登记进 [`record/evidence/`](../../../record/evidence/README.md)**）。

| 配置 | 结果 | 范围与数字 |
|---|---|---|
| `Assembly.cfg`（登记为 `stream-assembly-v2-assembly`） | **退出码 0：九个不变量在本范围内无反例**；作证据的是 `BlockOrderIsOpenOrder`、`SplitInvariance`、`OneShotAccepted` | 常量 `Indices = {0, 1}`、`Frags = {"a", "b"}`、`MaxEvents = 6`。生成 871,519 个状态、826,411 个不同状态，完整状态图深度 9，用时 1 分 10 秒 |
| `Assembly_OrderByClose.cfg`（有效性核对，不登记） | **退出码 12：`BlockOrderIsOpenOrder` 被违反**，如预期 | 18,457 个状态时停；反例里有后开先封的两块 |
| `Assembly_ReplaceAsAppend.cfg`（有效性核对，不登记） | **退出码 12：`SplitInvariance` 被违反**，如预期 | 4,454 个状态时停；反例里有一个被填两次的整体替换块 |
| `Assembly_OneShotCloseFirst.cfg`（有效性核对，不登记；本轮新增） | **退出码 12：`OneShotAccepted` 被违反**，如预期 | 3,362 个状态时停；反例 6 步：模型侧开 0、填 `a`、封 0、放弃——一次性形式把封口排到填之前，填落在已封口的块上 |

**模型改了什么**（相对 2026-09-23）：新增 `OneShotAccepted`（S-27 的前一半）与变异 `oneshot_close_first`；注释改用「本能力」「到达装配这一步」、标出按构造成立的六个不变量。`Assemble`、`Valid`、`OneShot`、`SplitInvariance` 的定义没有改。

**不能据此声称**：任意常量下成立；P-2～P-6 被模型检查过（按构造，不作证据）；一次性形式过得了表示层判定（`OneShotAccepted` 只到 `Valid`）；解析、被砍过的调用、快照、首个内容、砍的汇总已被检查；实现符合本契约。

### V-1：TLC，2026-09-23（首次，已被上一节取代）

- **规范修订**：本分支工作区（`panqiwei/assets-runtimes-spec-arrival`，基线 `73f13ea` 之上、本契约首次提交之前的工作树）；模型文件 `v2/formal/Assembly.tla`。
- **工具**：TLC2 Version 2026.09.12.025210（rev 867aefb），`-workers 1`，Java 21（Eclipse Adoptium 21.0.12.1），经 `make design-check FORMAL=run`。

| 配置 | 结果 | 范围与数字 |
|---|---|---|
| `Assembly.cfg`（登记为 `stream-assembly-v2-assembly`） | **退出码 0：八个不变量在本范围内无反例** | 常量 `Indices = {0, 1}`、`Frags = {"a", "b"}`、`MaxEvents = 6`。同一常量下另跑一次以取统计：生成 871,519 个状态、826,411 个不同状态，完整状态图深度 9，用时 52 秒。**那一次是临时包了一个恒假的后置条件让 TLC 把统计打出来（退出码 255），不是登记的任务**；包装文件已删 |
| `Assembly_OrderByClose.cfg`（临时登记、跑完即撤） | **退出码 12：`BlockOrderIsOpenOrder` 被违反**，如预期 | 反例 7 步：开 0、开 1、封 1、封 0、放弃 ⇒ 块次序 `1, 0`。对得上变异的含义（后开先封） |
| `Assembly_ReplaceAsAppend.cfg`（临时登记、跑完即撤） | **退出码 12：`SplitInvariance` 被违反**，如预期 | 反例 6 步：以整体替换开 0、填 `a`、再填 `a`、放弃 ⇒ 分次到达得 `a a`、一次性到达得 `a`。对得上变异的含义 |

**这三次运行之后**，模型文件只改过两处注释里的条款号（不改任何定义）。**提交前复跑**（2026-09-23 20:33–20:34 UTC，`make design-check FORMAL=run`）：
`FORMAL stream-assembly-v2-assembly: executed; exit=0`——当时没有记下所绑定的提交号与输入哈希，**这次复跑不可复核**；检查器在成功时不回显 TLC 输出，状态数取自上表那一次。
2026-09-24 整批对齐那一笔写的「本轮重跑」没有留下结果，同样不作证据。两者都已被上一节的运行取代。
原始输出未存档进 [`record/evidence/`](../../../record/evidence/README.md)——本次只在工作树里跑、未登记 run；**这是一次起草时的检查，不是可复现的证据登记**。

**不能据此声称**：任意常量下成立；解析、被砍过的调用、快照、首个内容、砍的汇总已被检查（它们不在模型里）；实现符合本契约。

## 变化的影响

- **起草（2026-09-23）**：首版候选，建在 PF-009 rev 7、PF-006 rev 17、PF-013 rev 8、PF-012 rev 10 上；
  依赖 `data.arrival-events` v2（**同批起草、candidate**）、`data.content-blocks` v2 与 `data.call-accounts` v2（**candidate、未冻结**）——它们在评审中改了被消费的条款，本契约同轮复核。
- **起草中途收到主线的操作面裁定**（落进本版，不是另一版）：五个纯操作作用于调用方持有的状态值；删去 `target_unknown`、`target_already_open`；收尾不产出消息；解析不了只标记；节流分两侧；在途状态随宿主存续。
  **因此 `data.messages` v2 不是本契约的依赖**（简报原列为依赖）——本能力只在正文里以名字指出宿主把结果包到哪里。
- **本契约对 `data.arrival-events` v2 的一处回写**（同批、未冻结，原地改）：那份契约 S-12、S-24、S-28 原说「要借开块才能判的只有 `replace_payload_shape`」，
  实际还有帧流上往语音块填字节的 `frame_media_inline`；并补了「那块没开着时这两项不参与」——与本契约 [S-25](v2/contract.md#s-25-判定次序) 一致。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定」的，出处后来落进 [D-060 §S4](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s4arrival-events--stream-assembly报回的)。
  - **G-1 闭合**：解析不了的调用块取 `data.content-blocks/v2#S-12` 的形状（`complete: true`、`rawArguments`、`unparseable: true`）；[S-11](v2/contract.md#s-11-参数收齐却解析不了只标记) 与规范场景 S-32 原写「不是 `complete: true`」，**与那边相反，已改**；examples 第 7a 节给出 JSON。**模型不变**（模型里封口的调用块一律 `sealed`，不区分这两种）。
  - **G-3 闭合**：模型侧 `trims` 的家是 `data.model-response` 的 `trims`；**G-6 闭合**：`BlockId` 重复在落盘边界上是 `data.messages` 的 `block_id_duplicate`，本能力不加失败值。
  - [S-16](v2/contract.md#s-16-首个内容的位置) 写明「零次填充就封口、封口块非空的块也算开口」，与 `data.arrival-events/v2#S-21` 逐字一致；语义未变。
  - **G-2 改写**：两份宿主契约已立，但都没有逐条承诺 S-28 的九条——owner 改为两份宿主契约的起草者；G-4 的 owner 写明词条批。
  - **对证据的影响**：写的是「V-1 的登记任务在本轮重跑」，但没有留下结果（见「结果与反例」）。
- **2026-09-24 S25 第一轮评审修复（候选，未冻结，原地改；评审基线 `765b01dc`）**：
  - **产品依据逐版复核**：PF-009 7→8（§9.2 在途快照含开着的追加块已到片段、不带此前砍过什么；「已经开口」是账、先记后推；工具帧出错照常收尾，有块才有 `ToolInternalMessage`）——[S-7](v2/contract.md#s-7-快照交出什么) 与之一致，G-4、G-5 闭合，快照语义**不变**；S-2、CS-2 的 `ToolInternalMessage` 判据改为「`blocks` 非空」、结局改引 `data.messages/v2#S-14`。
    PF-006 17→19（rev 18：参数说完了却解析不了 → 不执行、以失败回给 agent；rev 19：模型面名字与说明必填）——前者的拥有者落到工具执行运行时，[S-11](v2/contract.md#s-11-参数收齐却解析不了只标记)、S-28 第 5 条、S-32 改指 `capability.tool-execution-runtime/v2#S-23`、`#S-64`；后者不触及本能力（本能力不解读 `tool` 的名字）。
    PF-013 8→12（rev 9：首 token 是交出的第一样内容、不论模态，整交的整块交出才算、光开口不算；rev 10～12 凭据、档案、否决与停机归宿主）——[S-16](v2/contract.md#s-16-首个内容的位置) 的内容步骤判据已与 rev 9 一致，不改。PF-012 本契约不再引用。
  - **归属**：「每一帧至多计一次未原样送达」写成本能力的去重规则（[S-14](v2/contract.md#s-14-砍的汇总) 的 `配对(t)`），靠 [S-28](v2/contract.md#s-28-宿主要兑现的前提) 第 4 条新增的两处「紧挨」认出配对；S-28 第 4 条写明「增量」只指生产者交出的事件；第 5 条不再是宿主前提（编号保留）；新增规范场景 [S-39](v2/contract.md#s-39-先截短后拒收只计一次) 与 examples 第 7 节 7c。
  - **G-2 收窄为模型侧**：工具侧由 `capability.tool-execution-runtime/v2#S-62` 逐条承诺第 1～4、6、7、9 条；G-4、G-5、G-7 闭合（依据落持久记录，见契约[设计依据](v2/contract.md#设计依据)下的表）。
  - **用词**：弃用的「装配器／流装配器」改为「本能力」「做到达装配的一方」；S-1、S-4、S-15、S-27 的「装配」写全「到达装配」并链词条（S-15、S-27 标题随之改，锚点只在本包内被引，已同改）；S-29 改名「部署装配给与协议给」并说明此处「装配」是部署装配。账本编号与施工标签删去。
  - **形式**：P-2～P-6 标「按构造，不作证据」，证据改为规范场景；新增 `OneShotAccepted` 与有效性核对配置 `Assembly_OneShotCloseFirst.cfg`；formal/README 修正「三条」为两条、把「带 `error` 的收尾」列入盖不到（examples 第 5 节新增第 28 行）。V-1 覆盖收窄到 P-1、P-7，重跑结果见上。
  - **登记**：catalog 依赖补 `data.arrival-events` S-4 与新配置；covers 相关 note 按现行内容改（`reviewed` 保持 false）。
  - **`head_modality_mismatch` 改为原名引用**（与 `data.arrival-events` 同轮修订对齐：它在那份契约 S-28 成了表示层拒绝值）：[S-23](v2/contract.md#s-23-本能力自己的失败值) 删去这一行，判定失败由九个变为八个；[S-24](v2/contract.md#s-24-表示层拒绝值原名引用) 本身的拒绝值由八个变为九个；[S-25](v2/contract.md#s-25-判定次序) 按那份契约的次序把它排在 `presentation_invalid` 之后，`open` 那一行只剩两个；examples 第 5 节第 6 行依据改指 S-24。**可观察的值不变**，只是先后：同一个 `open` 既重开索引又模态不符，此前得 `index_reused`，现在得 `head_modality_mismatch`。
  - **依据**：本轮主线裁定链 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)（K2、K23、K24、K28），见契约[设计依据](v2/contract.md#设计依据)下的表。
- **2026-09-25 修复波 1b（候选，未冻结，原地改）**：[G-2](v2/contract.md#十已知缺口) 闭合——模型侧宿主在 `capability.model-request-runtime/v2#S-51` 逐条承诺 [S-28](v2/contract.md#s-28-宿主要兑现的前提) 第 1、2、4、6、7、8、9 条（[D-060 §六 L6](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）。改动只在指路与状态：契约 S-2、S-28 引语、头部依赖说明、设计依据表加一行、G-2 行、第十二节末句；V-6 的模型侧由「阻断」改为「未开始」。**本契约语义不变**；模型不变，**本轮未运行 TLC**；catalog 本契约条目不变（`capability.model-request-runtime` 对本契约的消费 clauses 由那份契约登记）。
- **2026-09-25 修复波 2（第二轮独立评审之后；候选，未冻结，原地改；评审基线 `8ad37c50`，本轮起点 HUB `7c3ef6c2`）**：逐条处置见[独立评审 · 第二轮](#第二轮2026-09-25)。
  - **宿主被撤下时在途的流**（[D-060 §七 M12](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：[S-22](v2/contract.md#s-22-abandon放弃) 开头与 ⑦ 删「宿主把它带走」这个两读的说法，写明宿主被撤下（有序撤除、替换）不是有意停下、一律走 `abandon`、结局 `lost`；哪些情形算有意停下改指 `data.messages` S-10、S-14 的对应表；[S-28](v2/contract.md#s-28-宿主要兑现的前提) 第 6 条同句。
  - **路由键**（M16 在本契约的同一句，推导）：S-28 第 1 条补「同时承载多个会话的宿主按（会话，目标）路由」；[S-29](v2/contract.md#s-29-部署装配给与协议给) 第三行左列原写「宿主绑定在一个会话上」，与两个宿主都承载多个会话不符，改为按（会话，目标）路由。
  - 设计依据第二张表加两行；本文件「独立评审」X-2 那一行补「修复波 1b 闭合 G-2」（SA2-2）。
  - **本契约五个操作的语义不变**：`abandon` 交出什么、`accept` 怎样判都没动，改的是宿主前提里哪种情形走哪条路。**模型不变，本轮未运行 TLC**；catalog 本契约条目不变；covers 不变。
  - **对消费者**：两个宿主须按 S-28 第 6 条在撤下时对在途的流调 `abandon`——工具侧已在 `capability.tool-execution-runtime/v2#S-48`、`#S-62` 第 6 条落，模型侧归 `capability.model-request-runtime` S-36、S-51（R5 同轮）。
- **2026-09-25 修复波 3：实现映射反推（候选，未冻结，原地改）**：裁定出处 [D-060 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M36；处置见文末[实现映射反推（2026-09-25）](#实现映射反推2026-09-25)。
  - [S-10](v2/contract.md#s-10-工具调用在封口那一下解析且只解析这一次) 第 3 条写明「严格」：RFC 8259、重复键即失败、数值无损；examples 第 7 节加 7d。**可观察的变化**：此前一个宽松的解析器会把 `{"path": "a.md", "path": "b.md"}` 解成 `{"path": "b.md"}`（完整的调用），现在它落成解析不了的那一种；大整数此前没有约束，现在必须原样。
  - **模型不变**（模型里封口的调用块一律 `sealed`，不区分解析成功与否，也不含数值）；**本轮未运行 TLC**。catalog 本契约条目不变；covers 不变。
  - **对消费者**：工具执行运行时对解析不了的那一种已有收场（`capability.tool-execution-runtime/v2#S-23`），不需改；两个宿主把 `arguments` 包进消息、落盘与回读须无损，落盘一侧归 `data.messages`（同一条裁定，另一位起草者同轮落）。
- **跨进程演化启动**：V-7 从「无法演练」转为**必须演练**；本版的全部证据只保留其单机范围。

结果不改写规范。发现语义问题回到来源设计（PF-009／PF-013／PF-006），不在这里改契约。

## 独立评审

处置栏的 K 编号指 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) 的主线裁定。

| 评审 | 对象与基线 | 发现 | 处置 | 落在哪 |
|---|---|---|---|---|
| spec-reviewer，2026-09-24 | v2 candidate，基线 `765b01dc` | SA-1 P-2～P-6 复述守卫 | **接受**：标「按构造，不作证据」、证据改为规范场景；V-1 收窄到 P-1、P-7；不补否定配置（补了只驳倒守卫本身） | 契约 P-2～P-6、[S-30](v2/contract.md#s-30-本版选用的形式工件)；formal/README 第一张表；`Assembly.tla` 注释；V-1 |
| 同上 | 同上 | SA-2 S-27 前一半没有断言 | **接受**：新增 `OneShotAccepted` 与变异 `oneshot_close_first`（反例如预期）；「只到 `Valid`」写进盖不到 | `Assembly.tla`、`Assembly.cfg`、`Assembly_OneShotCloseFirst.cfg`；[S-27](v2/contract.md#s-27-一次到达装配等于一次性到达) 证据句；formal/README |
| 同上 | 同上 | SA-3 「装配器」弃用词；「装配」同名不同义 | **接受** | [S-1](v2/contract.md#s-1-本契约拥有什么)、[S-4](v2/contract.md#s-4-装配状态是调用方持有的一个值)、S-15、S-27、[S-29](v2/contract.md#s-29-部署装配给与协议给)；README；formal/README |
| 同上 | 同上 | SA-4 S-2 说宿主契约未建立、带施工标签 | **接受** | [S-2](v2/contract.md#s-2-消费者) |
| 同上 | 同上 | SA-5 「增量」含不含宿主自己发的 `trim` | **接受**：只指生产者交出的事件，宿主自己的 `trim`、`finish` 被拒不补 `rejected` | [S-26](v2/contract.md#s-26-被拒不改状态后果归宿主)、[S-28](v2/contract.md#s-28-宿主要兑现的前提) 第 4 条 |
| 同上 | 同上 | SA-6 formal/README「三条」只列两条 | **接受** | formal/README；examples 第 5 节第 28 行 |
| 同上 | 同上 | SA-7 依赖漏 arrival-events S-4；covers note 过时；复跑无提交号 | **接受** | 契约头部依赖表；catalog；covers；本文件「结果与反例」 |
| 同上 | 同上 | X-2 工具侧宿主没接住 S-28 | **接受**（K23；对方落条款）：`capability.tool-execution-runtime/v2#S-62`；G-2 收窄为模型侧，**不关**——K23 写的是「G-2 关」，但模型侧宿主还没有条款，关掉就是一条无人承诺的前提，已报主线。**其后修复波 1b 闭合 G-2**（[D-060 §六 L6](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)：模型侧宿主在 `capability.model-request-runtime/v2#S-51` 逐条承诺） | [S-28](v2/contract.md#s-28-宿主要兑现的前提)、G-2；V-6 |
| 同上 | 同上 | X-3 解析不了的调用谁收场 | **接受**（K24）：拥有者是工具执行运行时 | [S-11](v2/contract.md#s-11-参数收齐却解析不了只标记)、S-28 第 5 条、S-32 |
| 同上 | 同上 | X-7 ④ `ToolInternalMessage` 判据 | **接受**（K2）：`closeOut` 的 `blocks` 非空；结局引 `data.messages/v2#S-14` | [S-2](v2/contract.md#s-2-消费者)、S-28 第 7 条、CS-2 |
| 同上 | 同上 | X-8 「每帧至多计一次」归属 | **接受**（K28）：本能力的去重规则 | [S-13](v2/contract.md#s-13-账)、[S-14](v2/contract.md#s-14-砍的汇总)；S-39；examples 7c |
| 同上 | 同上 | X-10 产品 rev 过期 | **接受**：逐版复核，见「变化的影响」 | 契约头部；G-4、G-5 |
| 同上 | 同上 | X-11 规格层名字无词条 | **接受**（按主线：产品正文没定义的规格层名字不立词条）：装配状态、位置、首个内容的位置标「（无词条）」；到达装配、在途状态等已有词条的全部链接 | 契约「规格层 token 与词条的对应」、S-1 |
| 同上 | 同上 | X-12 账本编号与施工标签 | **接受** | 契约设计依据、S-2、G 表；本文件 |

### 第二轮（2026-09-25）

spec-reviewer 第二轮复评，对象 v2 candidate，基线 HUB `8ad37c50`，发现表 `tmp/assets-runtimes/reviews/r2-R4a.md`（任务区）；处置依据 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)。总判为「可进 F 反向核对」，第一轮 SA-1～SA-7 核为全部兑现。

| # | 发现 | 处置 | 落在哪 |
|---|---|---|---|
| SA2-1（X2-2 在本契约的一半） | 【应修】S-22 ⑦「宿主把它带走」与 S-22 开头、S-28 第 6 条相冲 | **接受**（M12）：宿主被撤下时在途的流一律 `abandon` → `lost`，不是有意停下；删那个说法，有意停下的判据改指 `data.messages` S-10、S-14 | [S-22](v2/contract.md#s-22-abandon放弃) 开头与 ⑦、[S-28](v2/contract.md#s-28-宿主要兑现的前提) 第 6 条、设计依据第二张表 |
| SA2-2 | 【建议】「独立评审」X-2 那一行仍写 G-2「不关」 | **接受**：处置栏补「修复波 1b 闭合（D-060 §六 L6）」 | 本文件第一轮表 X-2 行 |
| M16（连带） | 模型侧宿主 S-51 第 1 条、工具侧宿主 S-62 第 1 条按（会话，目标）路由；本契约 S-29 第三行原写「宿主绑定在一个会话上」 | **改**（推导，同一件事一个说法）：S-28 第 1 条补一句，S-29 第三行左列改为按（会话，目标）路由 | [S-28](v2/contract.md#s-28-宿主要兑现的前提) 第 1 条、[S-29](v2/contract.md#s-29-部署装配给与协议给) 第三行 |

## 实现映射反推（2026-09-25）

realization-drafter 起草节点时报回的契约层缺陷，主线裁定见 [D-060 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)（下称 M 编号）。本契约涉及一条。

| 裁定 | 来源 | 处置 | 落在哪 |
|---|---|---|---|
| M36 JSON 解析口径：RFC 8259 严格解析；重复键 ⇒ 解析失败；超出 2^53 的整数与金额无损保留原文 | 戊 SA-1、MSG-3 | **接受**：S-10 第 3 条补「什么算成功」「数值无损」两项。**裁定里写的是「重复键 ⇒ 解析失败（`malformed`）」；在本契约里读作 S-10 第 3 条的「失败」一支，即解析不了的那一种调用块，不是表示层拒绝值 `malformed`**——本能力的 `malformed` 只判事件本身的形状（`data.arrival-events` S-28），参数原文解析失败从来不拒收封口（S-11）。这一读法原是推导，已经 [D-060 §八 N-20](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 接受（`malformed` 只在读 JSON 文本的接收边界） | [S-10](v2/contract.md#s-10-工具调用在封口那一下解析且只解析这一次) 第 3 条、设计依据表、examples 第 7 节 7d |

**examples 对 Schema 的机检（2026-09-25，跨批对齐，drafter 丑）**：暂存区脚本（不入库），`jsonschema` 4.26.0（`Draft202012Validator` ＋ `referencing`，锁定 uv 环境），设计根下全部 `*.schema.json` 按 `$id` 登表。本能力不发布 Schema，examples 的结果 JSON 是含义的记法；把 `H1M0` 之类的标注记法展开成两位的 `visibility` 之后，取各代码块里的块按 `data.content-blocks` 的 `ContentBlock`、账的各部分按 `data.call-accounts` 的 `FrameAccount`／`Usage`／`Cost`／`TrimSummary` 判：**19 处，0 不符**。第 2 节「第 7 个事件之后的快照」是本能力快照的记法（`opened`／`content`），不是 data 值，不判；事件表里的逐个事件含有意被拒的，按行判要逐行标预期，本轮未判。只核形状，不是 V- 义务的执行证据。

## 2026-09-26 D-068 当前 v3

`capability.stream-assembly · v3` 已接受并冻结，[精确契约](v3/contract.md) 的接受范围与32资源摘要见 [D-068](../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json)。本段为当前导航，此前旧版接受与验证记录保留原适用范围。新版推荐不自动升级消费者；八个core提供者须显式采用，24个外部消费者仍钉2。实现、公开旧Schema闭包及新组合证据尚待完成，不从规格接受推断通过。
