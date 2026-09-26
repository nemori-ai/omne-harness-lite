# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.arrival-events` v2 是 `candidate`，未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> 起草时只做了手核；**V-1 的本地自检跑过三次**（2026-09-24 整批对齐与第一轮评审修复、2026-09-25 修复波 2，第 1～9 节，只判通过与拒绝，见[结果与反例](#结果与反例)），其余义务仍未开始。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～9 节逐行过 Schema，比对「Schema」一列（第 11 节按行写了校验对象，本版只手核；第 10 节 Schema 本来就放行，不参与） | Draft 2020-12 校验器（须支持 `if`／`then`／`else` 与跨文件 `$ref`，并能按 `$id` 解析到 `data.content-blocks`、`data.call-accounts`、`data.loop-extension` 的 Schema） | [S-5](v2/contract.md#s-5-信封与目标)～[S-16](v2/contract.md#s-16-收尾)、[S-23](v2/contract.md#s-23-执行帧的另外四条) 的顶层部分、[S-27](v2/contract.md#s-27-判别式与枚举闭合) | **本地自检已跑三次**（最近一次 2026-09-25 修复波 2）：第 1～9 节 77 行 0 处不符；第 11 节未机检 |
| V-2 | **拒绝值的具名与优先级**：每个拒绝行，接收边界给出的拒绝值等于「拒绝值」一列；第 11 节专验优先级；嵌着的块与账取那两份契约的名字 | 接收边界的一致性用例（同一份输入跨实现比对） | [S-28](v2/contract.md#s-28-表示层拒绝值)、[S-29](v2/contract.md#s-29-表示层拒绝不是判定也不修补) | **未开始**。只验 Schema 通过与否不够——两个实现可以都拒绝、却报不同的名字 |
| V-3 | **Schema 管不到、本契约自己的拒绝值**：`presentation_invalid`（取值集为空）、`head_modality_mismatch`（块头模态与块的类型不符）、`frame_media_inline`（任意一层、语音填字节）、`replace_payload_shape`（要借开块） | 接收边界的校验 ＋ [`examples.md` 第 10 节](v2/examples.md#10-schema-通过但仍然非法的)「谁判」为「本契约」的各行 | [S-9](v2/contract.md#s-9-块头)、[S-10](v2/contract.md#s-10-呈现提示)、[S-12](v2/contract.md#s-12-填整体替换)、[S-23](v2/contract.md#s-23-执行帧的另外四条) | **未开始** |
| V-4 | **序列规则**：第 10 节其余各行在消费一侧得到的失败值 | 由 `capability.stream-assembly` 的一致性用例承担 | [S-7](v2/contract.md#s-7-块索引)、[S-17](v2/contract.md#s-17-一条流的形状)、[S-18](v2/contract.md#s-18-块的一生)、[S-24](v2/contract.md#s-24-违反语法由消费一方判定并命名) | **未开始**；名字归那份契约，**演练也落在那份契约的验证入口** |
| V-5 | **封口块等于归约**（生产者义务）：模型侧传输适配与工具侧发帧原语各自的性质测试——随机切分同一内容，比对封口块与各次填的归约；经节流后比对封口块与实际送达的 | 生产者一侧的性质测试 | [S-19](v2/contract.md#s-19-归约一块此刻是什么)、[S-20](v2/contract.md#s-20-封口块等于归约)、[S-22](v2/contract.md#s-22-节流只动填合并不改结果砍了要说) | **未开始**。消费一侧不重算、不比较，**这条违反在运行时不会被发现**——证据只能在生产者一侧 |
| V-6 | **传输一侧不中间解析**：喂一段残缺的参数流，观察传输适配从未解析它、封口不带块 | 规范场景 [S-31](v2/contract.md#s-31-工具调用的封口不带块) ＋ 静态检查 [SC-1](#静态检查义务) | [S-13](v2/contract.md#s-13-封口) | **未开始**。这正是 [D-035 保留前提 1](../../../record/decisions/message-and-stream-baseline/decision.md) 的那条，pi fork 的补丁要兑现它 |
| V-7 | **规范场景** [S-30](v2/contract.md#s-30-帧只许引用)～[S-35](v2/contract.md#s-35-拒绝值逐个) | 规范场景演练：真实生产者、真实消费一侧 | 见各场景 | **未执行** |
| V-8 | **消费者路径走查**（[CS-1～CS-4](v2/contract.md#消费者核对场景)） | 结构化走查；有提供者之后升级为真实演练 | [S-4](v2/contract.md#s-4-到达事件不是记录条目)、[S-5](v2/contract.md#s-5-信封与目标)、[S-7](v2/contract.md#s-7-块索引)、[S-8](v2/contract.md#s-8-开块)、[S-12](v2/contract.md#s-12-填整体替换)、[S-13](v2/contract.md#s-13-封口)、[S-16](v2/contract.md#s-16-收尾)、[S-18](v2/contract.md#s-18-块的一生)、[S-19](v2/contract.md#s-19-归约一块此刻是什么)、[S-23](v2/contract.md#s-23-执行帧的另外四条) | **未开始**。走查不需要提供者，现在就做得了；**CS-4 的「快照之后从哪一个事件接着收」本契约不回答**，如实记为「本版到此为止」 |
| V-9 | **跨进程**：[S-25](v2/contract.md#s-25-装配给与协议给) 右列六行逐行演练 | 规范场景演练 | [S-5](v2/contract.md#s-5-信封与目标)、[S-17](v2/contract.md#s-17-一条流的形状)、[S-20](v2/contract.md#s-20-封口块等于归约)、[S-21](v2/contract.md#s-21-第一个内容步骤)、[S-28](v2/contract.md#s-28-表示层拒绝值) | **未开始，且本版装配下无法演练**——单机同进程传参不构成接收边界。**这不是免除** |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。本版全部状态为「未开始」，**不得以「已列出」充当「已通过」**。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 传输适配与发帧原语里不存在解析工具调用参数的调用点；参数片段只被相接、不被解析 | [S-13](v2/contract.md#s-13-封口) | 未开始 |
| SC-2 | 不存在把到达事件写进会话日志、或为回放而逐个存下事件的写路径 | [S-4](v2/contract.md#s-4-到达事件不是记录条目) | 未开始 |
| SC-3 | 节流的实现只作用于 `fill`；`open`、`close`、`trim`、`account`、`finish` 不经过合并、截短或丢弃的路径 | [S-22](v2/contract.md#s-22-节流只动填合并不改结果砍了要说) | 未开始 |
| SC-4 | 不存在「呈现提示认不出就改照 `mediaType` 画」的降级分支 | [S-10](v2/contract.md#s-10-呈现提示) | 未开始 |

## 结果与反例

### 已执行：V-1 本地自检（2026-09-24 两次，2026-09-25 一次）

| 项 | 值 |
|---|---|
| 工具 | `jsonschema` 4.26.0（`Draft202012Validator`）＋ `referencing`，锁定 uv 环境（`uv run --offline`）；设计根下全部 `*.schema.json` 按 `$id` 登进同一个解析表，跨契约 `$ref` 都解析到真身；脚本在任务暂存区，不入库 |
| 第一次（整批对齐） | 见[变化的影响](#变化的影响)那一条：第 1～9 节 77 行，0 处不符 |
| 第二次（第一轮评审修复之后） | 第 1～9 节 **77/77** 与「Schema」列一致（通过 29、拒绝 48）；第 3 节按每行的校验对象（`BlockHead`／`PresentationHint`）分别求值。本轮新增的三行在第 10、11 节，**不参与机核** |
| 第三次（修复波 2，2026-09-25） | 本契约的 Schema 与实例本轮只改了 `FinishEvent` 的说明，但 `data.content-blocks` 收紧了完整工具调用块的 `tool`，所以照同一口径（`uv run --offline`）重跑：第 1～9 节 **77/77** 与「Schema」列一致（通过 29、拒绝 48） |
| 范围与局限 | 只判 Schema 通过与否；「拒绝值」一列（V-2）、第 10 节的判定（V-3、V-4）、第 11 节的优先级都未机核；**不支持**任何规范场景 |

### 尚无的记录

V-2～V-9 **一条执行记录也没有**。起草时的手核只保证 `examples.md` 的实例与它们的标注在起草者眼里不互相矛盾，
**未登记、无输入快照、未进 [`record/evidence/`](../../../record/evidence/README.md)**，不作为任何一条义务的证据。

首次执行时在此记录工具与版本、环境、配置、输入范围、可复现步骤与原始结果位置；原始产物归 `record/evidence/`。
**必须分开陈述**：Schema 校验、拒绝值一致性、规范场景演练、真实组合的符合性——四者不能互相冒充。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**序列的行为模型在 `capability.stream-assembly` v2 的 `formal/Assembly.tla`，
它检查的是**装配结果**上的性质（账至多一次、收尾之后无事件、块次序是开块次序、一次装配 == 一次性到达）；
**那个模型把「封口块等于归约」当作前提（生产者义务），不检查它**——这一条的证据是 V-5，不是那个模型。

## 变化的影响

- **起草（2026-09-23）**：首版候选，建在 PF-009 rev 7、PF-006 rev 17、PF-013 rev 8、PF-012 rev 10 上；
  依赖 `data.content-blocks` v2 与 `data.call-accounts` v2（**两者都是 candidate、未冻结**——它们在评审中改了被引用的 `$defs` 或条款，本契约要同轮复核）。
- **同日，起草中途收到主线的对齐裁定**（落进本版，不是另一版）：目标加 `dispatch`；`FailureCause` 改 `$ref` `data.loop-extension` v2，不自定义；
  `ModelCallId` 改 `$ref` `data.call-accounts` v2；出错断时已交付的块归 `data.model-response` 的 `delivered`。**因此两处 `$ref` 在本工作树里解析不到，`make design-check` 以此报两条错**——主线已明示这两处留给对齐波。
- **同日，第二道主线裁定（块 D 机制读数：三层全是纯计算）**：装配状态由宿主持有、事件由宿主按目标路由（[S-1](v2/contract.md#s-1-本契约拥有什么)、[S-3](v2/contract.md#s-3-本契约不拥有什么)、[S-24](v2/contract.md#s-24-违反语法由消费一方判定并命名) 随之改写：「目标此刻有一条流」不再是序列规则）；
  节流分发出一侧与投递一侧，只有前者进账（[S-22](v2/contract.md#s-22-节流只动填合并不改结果砍了要说)）；被拒的增量由宿主以 `rejected` 的 `trim` 说出来（[S-29](v2/contract.md#s-29-表示层拒绝不是判定也不修补)）；
  首个内容排除空载荷（[S-21](v2/contract.md#s-21-第一个内容步骤)）。**全部落在本版**，此前没有任何评审或证据用过旧说法。
- **同日，`capability.stream-assembly` v2 起草时回写三处措辞**：[S-12](v2/contract.md#s-12-填整体替换)、[S-24](v2/contract.md#s-24-违反语法由消费一方判定并命名) 原说要借开块才能判的拒绝值「只有 `replace_payload_shape`」，
  实际帧流上往语音块填字节的 `frame_media_inline` 也要借开块；[S-28](v2/contract.md#s-28-表示层拒绝值) 补一句「这两项只在那块此刻开着时才判，否则取消费一侧的序列失败值」。
  **拒绝值集合与次序不变**，V-2、V-3 的口径随之更准确。
- **`data.messages` v2 与本契约并行起草**：本契约只在正文里以坐标提到它（落点），不依赖它的任何条款。
- **[G-3](v2/contract.md#九已知缺口) 闭合**（呈现提示的取值集）：[S-10](v2/contract.md#s-10-呈现提示) 与 S-33 的正反例重写 ⇒ **出 v2**。
- **[G-4](v2/contract.md#九已知缺口) 闭合**：若模型侧也允许改变内容的砍，[S-22](v2/contract.md#s-22-节流只动填合并不改结果砍了要说) 不变，但 V-5 要在模型侧补跑。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：

  | 改了什么 | 依据 | 条款 | Schema | 实例 |
  |---|---|---|---|---|
  | `ModelCallId`、`FailureCause` 的 `$ref` 解析通过，catalog 补登 `data.call-accounts` S-37 与 `data.loop-extension` S-17；G-1、G-2 闭合 | 两份契约对齐后已有定义 | 抬头、S-3、S-5、S-16、S-26 | `$comment` 一处 | 第 8 节两行去掉「待 G-2」 |
  | 块 `id` 的分配者：模型侧是生产的一方、工具侧是宿主的帧入口，与 `data.content-blocks/v2#S-3` 措辞统一 | 账本 S4-a | S-8 | — | — |
  | 一条消息里 `id` 重复由 `data.messages` 的 `block_id_duplicate` 在接收边界拒；G-6 闭合 | 账本 S4 | S-24、S-26 表 | — | 第 10 节一行 |
  | Q4、Q17 依据补成 D-058 链接，其余三项写明「主线裁定」；G-7 闭合 | D-058 已合入 | 设计依据 | — | — |

  **本地自检**（Draft 2020-12，`jsonschema` 按仓库 `uv.lock`，脚本在任务暂存区、不入库）：以对齐后整棵设计树的全部 Schema 建 registry，
  [`examples.md`](v2/examples.md) 第 1～9 节 77 行（预期通过 29、拒绝 48）按各节「校验对象」逐行求值，**0 处不符**——第 3 节脚本只按第一个 `$defs` 判、报了 1 处，那三行（第二、三、六行）的校验对象是 `PresentationHint`，改按它单独求值，三行都与预期一致。
  **只判 Schema 通过与否**：拒绝值是哪一个、第 10 节的序列规则都不在内；第 11、12 节未机检。
  （这一条表里的「账本 S4-a」「账本 S4」「写明主线裁定」是当时的写法；第一轮评审修复已把依据改成 D-060 链接或规格层推导，见下一条。）
- **2026-09-24 第一轮独立评审修复（候选未冻结，原地改）**——逐条处置见[独立评审](#独立评审)：
  - **产品依据逐 topic 复核到当前 rev**（按各 topic changelog 逐版读）：
    PF-009 rev 7→8：「工具帧出错照常收尾」⇒ 帧流 `lost` 多了执行者没有回答、执行者换了代两种来路，`interrupted` 限于有意停下（[S-16](v2/contract.md#s-16-收尾)，与主线 K2 一致）；「在途快照含已到片段」归 `capability.stream-assembly` 的快照、本契约 S-4 只引在途状态，不改；「开口是账」落成 `data.messages` 的「已开口」记录，本契约 S-21 只定哪一步是第一个内容，不改；「入站语音整条到」——本语法本来只有模型回复与执行帧两个生产者，不改；
    PF-006 rev 17→19：发帧与帧的协议未变，不改；
    PF-013 rev 8→12：rev 9 的媒体类型键优先与 transcript、rev 10 凭据、rev 11 呈现责任、rev 12 路由名——本契约引的 §5.4 首 token、§5.7 状态码、§5.13 两次发出未变，不改；
    PF-012 rev 10→14：对账两行、否决、拓展件不可用、转换件——不涉本契约。
  - **K4**：块头模态不符改由本契约拒，拒绝值 `head_modality_mismatch` 进 [S-28](v2/contract.md#s-28-表示层拒绝值)（九值），次序排在 `presentation_invalid` 之后、`fill_kind_not_appendable` 之前；[S-9](v2/contract.md#s-9-块头)、[S-24](v2/contract.md#s-24-违反语法由消费一方判定并命名)、Schema `BlockHead` 描述与头部 `$comment`、实例第 10 节（改「谁判」、加一行）与第 11 节（加一行）一致。**表示层拒绝值集合改变**。**消费者影响**：`capability.stream-assembly` 删去它自己失败集合里的 `head_modality_mismatch`，改为原名引用本契约 S-28 的表示层拒绝值。
  - **K2**：[S-16](v2/contract.md#s-16-收尾) 工具那一列写明 `interrupted` 只给有意停下、`lost` 的三种来路；对到 `ToolInternalEnding` 的表只在 `data.messages/v2#S-14`（本契约以坐标指路、不登依赖）。`FinishReason` 不加值。
  - **依赖补登**：`data.content-blocks` 加 `S-5`；`data.call-accounts` 加 `S-11`、`S-21`；新依赖 `data.identity-values` v2 `S-33`。头部、README、catalog 一致。
  - **依据链接化**：`dispatch` → D-060 §一 S8-c；帧入口 → S4-a；记账载荷、成因取值、`id` 重复的归属改写成规格层推导并写理由；G-7 的关闭说明同步。施工标签（块 B、块 C）换成契约坐标。本轮落的 K 各项，契约正文的依据链到 D-060 §五（K1～K50，2026-09-24 夜追加）。
  - 「一次发出」链到 UL-upstream-send；Schema 两处「此刻解析不到」更正；实例第 13 节与 V-1 的证据陈述按实际更正。
  - 本地自检重跑（77/77，见[结果与反例](#结果与反例)）。

- **2026-09-25 修复波 2（主线裁定 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) M1、M12；候选未冻结，原地改）**——逐条处置见[独立评审「第二轮」](#第二轮2026-09-25)：
  - **M12**：[S-16](v2/contract.md#s-16-收尾) 的 `interrupted` 不再含「宿主决定把它带走」——模型侧只有用户发起的停下（直接叫停、插队顺带、用户取消了这次运行）；**宿主放弃在途的流一律 `lost`、不带 `error`**（系统发起的运行取消、宿主停止或被撤下；与桥换代同类，模型侧那一次发出的收场由 `data.model-response` 记成被中断、`run_cancelled`，不是故障）；工具那一列 `lost` 补「宿主被撤下」。`FinishReason` 不加值。Schema `FinishEvent` 说明同步。
  - **M1**：回复流结局对到 `AssistantMessage` 的 `ending` 的表在 `data.messages/v2#S-10`（与 S-14 一样只以坐标指路、不登依赖）：头部、「没有产品行」表、S-16、「Schema 管得到什么」与包入口同改。
  - **MS2-5**：工具那一列 `interrupted` 写成「收场为 `interrupted` 的全部情形」，补 agent 掐掉已转后台的那段执行。
  - **AE2-1**：V-1 行与包入口状态行的次数更正。
  - **语义**：`interrupted` 的所指收窄（宿主那一支移到 `lost`）；**表示不变**。**消费者影响**：`capability.stream-assembly` 的放弃动作与 `capability.model-request-runtime`、`capability.tool-execution-runtime` 的撤除走 `lost`（M12 那几处归各自的起草者）。**证据**：V-1 重跑，77/77。
- **跨进程演化启动**：V-9 从「无法演练」转为**必须演练**；本版的全部证据只保留其单机范围。

结果不改写规范。发现语义问题回到来源设计（PF-009／PF-006／PF-013），不在这里改契约。
- **2026-09-25 修订波：pi-ai 传输节点反推**（仍是 `candidate`，未冻结，原地改；主线裁定 [D-060 §八 N-40](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④，PAT-N4）：收尾的 `error` 加成员 `inBand`（只取 `true`、只能与 `statusCode` 同在；在即那个状态码是流已开始之后带内错误的 `code`、不是 HTTP 状态），与 `data.model-response/v2#S-15` 同一个成员、同一个意思；[S-16](v2/contract.md#s-16-收尾) 那一条与 Schema `FinishEvent.error` 同步。**只加一个可缺的成员**，已有实例都不带它、仍然通过；没有证据因此作废。

## 独立评审

| 评审 | 日期 | 基线 | 发现 | 处置 | 落点 |
|---|---|---|---|---|---|
| spec-reviewer，S25 第一轮批 R1 | 2026-09-24 | HUB `765b01dc` | AE-1 产品依据 rev 过时，PF-009 rev 8 未复核 | **改**：四个 topic 逐版复核；PF-009 rev 8 的「工具帧出错照常收尾」落进 S-16，其余三处与既有条款一致（记录见[变化的影响](#变化的影响)） | 头部；S-16 |
| 同上 | 同上 | 同上 | AE-2 块头模态不符有两个拒绝名 | **改**（主线 K4，留在本契约那一种）：`head_modality_mismatch` 进 S-28，S-9、S-24、Schema、实例同改 | S-9、S-24、S-28；Schema `BlockHead`；实例第 10、11 节 |
| 同上 | 同上 | 同上 | AE-3 采纳对方口径却没登依赖 | **改**：补登 CB `S-5`、CA `S-11`／`S-21`、identity-values `S-33` | 头部依赖表；catalog；README |
| 同上 | 同上 | 同上 | AE-4 「一次发出」说无词条 | **改**：链 UL-upstream-send；`dispatch` 注为规格层 token | 第二节 |
| 同上 | 同上 | 同上 | AE-5 README 说 loop-extension「待并入」 | **改** | README |
| 同上 | 同上 | 同上 | AE-6 Schema 两处说「此刻解析不到」 | **改** | Schema 头部与 `FinishEvent` 的 `$comment` |
| 同上 | 同上 | 同上 | AE-7 自核陈述与 V-1 前后矛盾 | **改**：两处都写「机核第 1～9 节」，第 11 节只手核 | 实例第 13 节；V-1 |

### 第二轮（2026-09-25）

reviewer：spec-reviewer，S25 第二轮批 R1；基线 HUB `8ad37c50`。本批对本契约的总判是「可进 F 反向核对」。依据一律是 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)。

| # | 发现（等级） | 处置 | 落点 |
|---|---|---|---|
| AE2-1 | V-1 行仍写「已跑一次」，包入口状态行写「原地改一次」（建议） | **改**：两处按实际更正 | V-1；包入口状态行 |
| MS2-5（本契约那一半） | `interrupted` 工具那一列的列举漏了 agent 掐掉后台执行（建议） | **改**：写成「收场为 `interrupted` 的全部情形」并补上 | S-16 |
| MS2-4 引出（本契约那一半） | S-16 的 `interrupted` 含「宿主决定把它带走」，与「只有用户叫停才是 `interrupted_by_user`」对不上（MS2-4 的一部分） | **改**（M12）：宿主放弃在途的流一律 `lost`、不带 `error`；`interrupted` 在模型侧只指用户发起的停下；回复流对到 `ending` 的表在 `data.messages` S-10（M1） | S-16；Schema `FinishEvent` |

## 对齐义务

- **`capability.stream-assembly`**：块头模态不符的拒绝值是本契约 S-28 的 `head_modality_mismatch`（表示层），那份契约的失败集合里不再另有同名的判定失败；原名引用、排在它全部判定失败之前。
- **`FinishReason` 对到 `ToolInternalEnding` 与 `AssistantMessage` 的 `ending`**：两张表在 `data.messages/v2#S-14`、`#S-10`；本契约改 S-16 的取值或意思时，那两张表同轮复核。
- **宿主放弃在途的流落 `lost`**（M12）：`capability.stream-assembly` S-22 ⑦ 删「宿主把它带走」、`capability.model-request-runtime` S-36／S-51、`capability.tool-execution-runtime` S-48 撤除时放弃在途状态——与本契约 S-16 同一句，归各自的起草者。
- **`data.call-accounts/v2#S-11`**：它以坐标引本契约 S-23 第 1 条的「一帧」作定义性引用、不登依赖（会成环）；本契约改这个单位时，那份契约同轮复核。
