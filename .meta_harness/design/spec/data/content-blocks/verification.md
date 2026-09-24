# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.content-blocks` v1 是 `candidate`（2026-09-25 修复波 3 原地改——[实现映射反推](#实现映射反推2026-09-25)），未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> **Schema 正反实例只跑过本地自检**（2026-09-23 对齐波、2026-09-24 第一轮评审修复、2026-09-25 修复波 2 各一次，见[本地自检](#本地自检)）：它只核「Schema」一列，**未登记为证据、未进 `record/evidence/`**；
> 六条规范场景、六条消费者核对场景、四条静态检查**一条都未执行**——文件存在不代替结果。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v1/examples.md) 第 1～13 节（带「校验对象」的那些）逐行过 Schema，比对「Schema」一列。第 14、15 节与第 3 节的相等用例不参与 | Draft 2020-12 校验器（须支持 `unevaluatedProperties`、`dependentRequired`，并能按 `$id` 解析到 `data.identity-values/v1` 的 Schema）＋ 该文件按节绑定的 `$defs` | [S-1](v1/contract.md#s-1-七类块)、[S-2](v1/contract.md#s-2-块底座)、[S-4](v1/contract.md#s-4-两个标注)、[S-7](v1/contract.md#s-7-媒体类型的规范形式)～[S-13](v1/contract.md#s-13-半截的工具调用)、[S-15](v1/contract.md#s-15-工具结果块)～[S-21](v1/contract.md#s-21-attachmentref)、[S-25](v1/contract.md#s-25-判别式与枚举闭合) 的**形状那一面** | **本地自检已跑三次**（[下文](#本地自检)：最近一次 2026-09-25，162 行，与「Schema」列逐行一致）；**未登记为证据**，拒绝值一列不在其内（那是 V-2） |
| V-2 | **拒绝值的具名与优先级**：对 `examples.md` 每个拒绝行，接收边界给出的拒绝值等于「拒绝值」一列；第 12 节六行专验优先级 | 接收边界的一致性用例（同一份输入跨实现比对） | [S-26](v1/contract.md#s-26-表示层拒绝值)、[S-27](v1/contract.md#s-27-表示层拒绝不是判定也不修补) | **未开始。**需要一个实现了接收边界校验的提供者。**只验 Schema 通过与否不够**——两个实现可以都拒绝、却报不同的名字 |
| V-3 | **Schema 管不到的四条形状约束**：一条消息内 `id` 重复（含嵌套）、引用形状下两处媒体类型不逐字相同、派生块与原块同一模态、非规范写法不被改写 | 接收边界的校验 ＋ [`examples.md` 第 14 节](v1/examples.md#14-schema-挡不住但同样非法的)前四行 | [S-3](v1/contract.md#s-3-blockid)、[S-7](v1/contract.md#s-7-媒体类型的规范形式)、[S-10](v1/contract.md#s-10-语音块与图块)、[S-19](v1/contract.md#s-19-派生表示与-transcript)、[S-27](v1/contract.md#s-27-表示层拒绝不是判定也不修补) | **未开始。**`id` 唯一那一条要在看得见整条消息的边界上验，**落点归 `data.messages`**（第二波），本页只登记本契约的义务已触发 |
| V-4 | **规范场景** [S-28](v1/contract.md#s-28-标注缺一即拒)～[S-33](v1/contract.md#s-33-派生表示不含文件块)：每条一个正例一个反例；**三条条件约束**（[S-29](v1/contract.md#s-29-半截调用两边都不给) 半截调用的标注、[S-30](v1/contract.md#s-30-结果里不发起调用) 结果里不发起调用、[S-31](v1/contract.md#s-31-语音与图的模态要对) 语音与图的模态）各在其中 | 规范场景演练：真实接收边界、真实落盘 | [S-4](v1/contract.md#s-4-两个标注)、[S-10](v1/contract.md#s-10-语音块与图块)、[S-13](v1/contract.md#s-13-半截的工具调用)、[S-16](v1/contract.md#s-16-结果里不发起调用)、[S-18](v1/contract.md#s-18-占位原因与它落在哪一格)、[S-19](v1/contract.md#s-19-派生表示与-transcript) | **未执行。**S-31 的两个反例**必须同跑**：只跑模态那一个，一个只信 Schema 的实现也会全过。S-29 要额外观察「`rawArguments` 从未被解析」，**只看拒绝值不够** |
| V-5 | **合取取用**：工具结果块给模型、里面一块标着不给模型；派生表示里的块只给模型 | PF-010 组装的规范场景 | [S-5](v1/contract.md#s-5-嵌套的块按合取取用) | **未开始。**需要 PF-010 组装的提供者；**本契约只拥有规则，演练归组装** |
| V-6 | **`opaque` 原样回传**：写入一份含大整数（`9007199254740993`）、嵌套对象与 `null` 的不透明数据，经落盘、读回、每一跳传输后与原值比对；另验缺席与 `null` 各自保留 | 规范场景 ＋ 跨实现一致性用例 | [S-9](v1/contract.md#s-9-思考块与不透明数据) | **未开始。**责任：日志与传输适配的提供者。**这条最容易在一次 JSON 往返里静默失败**，必须真跑 |
| V-7 | **落盘之后整块不变**：压缩、转换件、卸载各走一遍，前后逐字节比对已落盘的块 | 规范场景 ＋ 日志写路径的静态检查（[SC-1](#静态检查义务)） | [S-22](v1/contract.md#s-22-落盘之后整块不变) | **未开始**。需要日志的提供者 |
| V-8 | **消费者路径走查**（[CS-1～CS-6](v1/contract.md#消费者核对场景)） | 结构化走查（评审对象）；有提供者之后升级为真实演练 | [S-3](v1/contract.md#s-3-blockid)、[S-5](v1/contract.md#s-5-嵌套的块按合取取用)、[S-6](v1/contract.md#s-6-模态由媒体类型判定)、[S-9](v1/contract.md#s-9-思考块与不透明数据)、[S-12](v1/contract.md#s-12-完整的工具调用)、[S-13](v1/contract.md#s-13-半截的工具调用)、[S-15](v1/contract.md#s-15-工具结果块)、[S-17](v1/contract.md#s-17-六种收场)～[S-19](v1/contract.md#s-19-派生表示与-transcript)、[S-22](v1/contract.md#s-22-落盘之后整块不变)、[S-26](v1/contract.md#s-26-表示层拒绝值) | **未开始。**走查**不需要提供者**，现在就做得了；六条都不再停在缺口（CS-2、CS-4 原先停在 G-3／G-2、CS-4 的前台超时一支停在 G-7，三者都已闭合）；只剩 G-1（存储）挡住「解引用」那一步，不在这六条的路径上 |
| V-9 | **跨进程**：[第四节](v1/contract.md#四装配给与协议给)右列八行逐行演练 | 规范场景演练 | [S-3](v1/contract.md#s-3-blockid)、[S-4](v1/contract.md#s-4-两个标注)、[S-9](v1/contract.md#s-9-思考块与不透明数据)、[S-10](v1/contract.md#s-10-语音块与图块)、[S-14](v1/contract.md#s-14-callid)、[S-21](v1/contract.md#s-21-attachmentref)～[S-23](v1/contract.md#s-23-块不携带租户身份)、[S-26](v1/contract.md#s-26-表示层拒绝值) | **未开始，且本版装配下无法演练**——单机同进程传参不构成接收边界。**这不是免除**：跨进程演化启动时必须补做，登记在[变化的影响](#变化的影响) |
| V-10 | **静态检查**（[SC-1～SC-4](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | **未开始；检查器尚不存在** |
| V-11 | **JSON 严格读、数无损**（2026-09-25，M36）：① 重复成员名的参数串在那一次解析里落「解析不了」（`rawArguments` ＋ `unparseable: true`），不取一个；② 超出 ±2^53 的整数（`12345678901234567890`）在 `arguments` 与 `opaque` 里解析、落盘、回读之后逐字不变；③ 读一段块的 JSON 文本，任一层有重复成员名即 `malformed` | 规范场景演练（①归流装配那一次解析，②③归每一处读写）＋ [`examples.md` 第 14 节](v1/examples.md#14-schema-挡不住但同样非法的)末三行 | [S-12](v1/contract.md#s-12-完整的工具调用)、[S-24](v1/contract.md#s-24-规范表示)、[S-26](v1/contract.md#s-26-表示层拒绝值)、[S-22](v1/contract.md#s-22-落盘之后整块不变) | **未开始。**Schema 本地自检测不出（解析器读成什么 Schema 就看到什么），必须对读写路径本身演练；①的解析点在 `capability.stream-assembly` S-10（同批由子落） |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。本版全部状态为「未开始」，**不得以「已列出」充当「已通过」**。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 日志的写路径里不存在修改已落盘块的操作：没有对 `visibility`、`renderings`、`transcript`、`opaque`、`reason`、`blocks` 的就地更新 | [S-22](v1/contract.md#s-22-落盘之后整块不变) | 未开始 |
| SC-2 | 不存在解析半截调用 `rawArguments` 的调用点；完整调用的消费者只读 `arguments`，不从文本重新解析 | [S-12](v1/contract.md#s-12-完整的工具调用)、[S-13](v1/contract.md#s-13-半截的工具调用) | 未开始 |
| SC-3 | 除传输适配层外，没有代码读取或改写思考块的 `opaque` | [S-9](v1/contract.md#s-9-思考块与不透明数据) | 未开始 |
| SC-4 | 不存在从 `AttachmentRef.storage`／`key`、`origin` 的名字或块文本推归属、推收场的代码；收场只读 `outcome` | [S-15](v1/contract.md#s-15-工具结果块)、[S-21](v1/contract.md#s-21-attachmentref)、[S-23](v1/contract.md#s-23-块不携带租户身份) | 未开始 |

## 结果与反例

### 本地自检

**2026-09-23，整批对齐波，一次。**不是登记的证据：没有输入快照、没有进 [`record/evidence/`](../../../record/evidence/README.md)，只说明本版 `examples.md` 的「Schema」一列与 Schema 在这一刻对得上。

- **工具**：锁定 uv 环境里的 `jsonschema` 4.26.0（`Draft202012Validator`）＋ `referencing`，把设计根下全部 `*.schema.json` 按 `$id` 登进同一个解析表，跨契约 `$ref` 按 `$id` 解析。
- **做法**：逐节按「校验对象」把实例列喂给校验器，与「Schema」一列比对；第 13 节按每行第一列的 `$defs`。脚本在任务区暂存，不入库。
- **结果**：**155 行（通过 57、拒绝 98），与「Schema」列逐行一致，0 处不符**。
- **不覆盖**：「拒绝值」一列（V-2）、第 3 节的相等用例与第 14 节（不参与机检）；`contentEncoding` 按 Draft 2020-12 只作注解，base64 的形状由 `pattern` 判。

**2026-09-24，第一轮独立评审修复，一次。**同一口径（`jsonschema` 4.26.0，仓库 `uv.lock` 环境，设计根下全部 Schema 按 `$id` 登进解析表；脚本在任务暂存区，不入库）：
第 1～13 节 **158 行（通过 58、拒绝 100），0 处不符**。上一次记的 155 行是数错了（评审发现 CB-7：第 10、13 节各少数一两行）；本轮 `terminated_by_agent` 移出 `PlaceholderReason`，第 13 节那一行由通过翻为拒绝。不覆盖的范围同上。

**2026-09-25，修复波 2，一次。**同一口径（`jsonschema` 4.26.0，`uv run --offline`，设计根下全部 Schema 按 `$id` 登进解析表；脚本在会话暂存区，不入库）：
第 1～13 节 **162 行（通过 60、拒绝 102），0 处不符**。比上一次多的 4 行是第 9 节 `b71`～`b74`（完整调用的 `tool` 取模型面名字：定义名写法与带空格的名字被拒；半截调用上不判字符集）。同一次另把 `data.messages`、`data.arrival-events`、`data.model-response` 的实例按新的 `ToolCallBlock` 重跑，各自 0 处不符（记在各自的验证入口）。不覆盖的范围同上。

### 尚无的记录

V-2～V-11 **一条执行记录也没有**。起草时的手核只保证 `examples.md` 的实例与它们的标注在起草者眼里不互相矛盾，
**未登记、无输入快照、未进 [`record/evidence/`](../../../record/evidence/README.md)**，不作为任何一条义务的证据。

首次执行时在此记录工具与版本、环境、配置、输入范围、可复现步骤与原始结果位置；
原始产物归 `record/evidence/`。**必须分开陈述**：Schema 校验的结果、拒绝值一致性的结果、规范场景演练的结果、真实组合的符合性——
**四者不能互相冒充**，[S-27](v1/contract.md#s-27-表示层拒绝不是判定也不修补) 说的就是这件事，它对证据同样成立。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[契约的性质一节](v1/contract.md#性质)末尾：
没有状态转移；结构约束（闭合判别、条件约束、任意层无工具调用、派生块的限制）Schema 本身就能判，
建 Alloy 模型只会得到一份与 Schema 同义的平行工件；Schema 管不到的三条是一次遍历就能检查的谓词，证据形式是 V-3 与 V-5。
**这不是把义务省掉**：它们被改写成了 V-1～V-11。本契约**不拥有任何进展性质**，没有需要写成有界形式的断言。

## 变化的影响

- **起草（2026-09-23）**：首版候选，建在 PF-009 rev 7、PF-010 rev 5、PF-013 rev 8、PF-006 rev 17、PF-002 rev 16、PF-001 rev 16、PF-012 rev 10 上。
  **依赖 `data.identity-values` v1**（已接受、已冻结）的 `#S-31`、`#S-34`；Schema 经 `$ref` 取它的 `$defs/OpaqueIdentifier`——
  那一版不可原地改，**这条引用的目标不会漂移**；它若出 v2，本契约不自动跟随。
  **`data.call-accounts` v1 同批并行起草、`$ref` 本契约的 `$defs/CallId`**：那边的引用以本契约 v1 为准；本契约若在评审中改 `CallId` 的定义，须同轮通知那份契约。
- **整批对齐（2026-09-23，候选未冻结，原地改）**：
  - **不透明标识改按 S-31 散文自写**：`BlockId`、`CallId`、`AttachmentRef.storage`／`key` 不再跨契约 `$ref` `data.identity-values/v1` 的 `OpaqueIdentifier`，pattern 与那边逐字相同——**形状不变**；catalog 依赖仍是 `S-31`、`S-34`。
  - **G-2 闭合**：`PlaceholderReason` 八值 → 十一值（`backgrounded_at_start`、`run_cancelled`、`terminated_by_agent`），落格表与 Schema 的条件分支随之扩；`b99` 由拒绝翻为通过。**消费者影响**：`capability.tool-execution-runtime` 的 S-10 那三行「没有」转为「有」。
  - **G-3 闭合**：完整调用块多一种形状（`rawArguments` ＋ `unparseable: true`）；原来「完整调用带 `rawArguments` 即 `malformed`」收窄为「不与 `unparseable` 同现即 `malformed`」。**消费者影响**：`capability.stream-assembly` 的 S-11 与它的 G-1。
  - **来源标记二值 → 四值**（`slash_command_expansion`、`slash_command_record`）。**消费者影响**：`data.slash-command` 的 S-21、S-25 与它的 G-4。
  - **`producedBy` 收为常量 `system`**：原先的能力标识一支删去（本版没有合法的产出者走它）；**表示收紧**，写能力标识的实例由通过变为拒绝。
  - **新增**：`$defs/InlineBytes`（内联那一串 base64 的编码规则抽成共用定义，语音块与图块的 `inline` 改 `$ref` 它，**形状不变**；工具定义卸载的内联原始结果随之引用它）；S-19「派生块模态不同于原块」一条（Schema 管不到，V-3 多一项）；S-34 附件落块规则。
  - **措辞**：S-3 执行帧块由「帧入口」编号（与 `data.arrival-events` S-8 统一）；S-18 `abnormal_interruption` 的触发加「桥换代」；G-5（指路）、G-6（D-038）闭合；新增 G-7（前台上限的中断原因）、G-8（主线裁定无决定记录）。
  - V-1 已按新形状本地自检一次（[上文](#本地自检)）；V-4 的 S-32 那条场景的原因集合以 S-18 新表为准。
- **G-7 已裁决（主线 2026-09-24，候选未冻结，原地改）**：PF-006 rev 18 §6.7 加了「前台超时」一行，主线定名 `foreground_timeout`、落 `interrupted`。
  `PlaceholderReason` 十一值 → 十二值；[S-18](v1/contract.md#s-18-占位原因与它落在哪一格) 表加一行、那段缺口引文改写，CS-4、设计依据表与抬头各一处，G-7 划掉；Schema 的 `PlaceholderReason` 枚举与 `ToolResultBlock` 里 `interrupted` 那一支各加一个值；`examples.md` 加 `b99e`（通过）、`b99f`（配错格，拒绝）与 `$defs/PlaceholderReason` 的 `"foreground_timeout"`（通过）三行，`"interrupted_by_timeout"` 那一行仍拒、理由改写。
  **表示改变**：v1 是 candidate、未冻结，所以原地改，不出 v2。**消费者影响**：`capability.tool-execution-runtime` 的 S-10 那一行由「本版没有取值」转为 `foreground_timeout`、它的 G-3 闭合；`data.messages` v1 那一处「还没有原因取值（它的 G-7）」的说法过时，**待那份契约的 owner 改**（已报主线）。
  **证据**：本地自检只重跑了本节涉及的实例——工具结果块与 `PlaceholderReason` 两类共 25 处（Draft 2020-12，`jsonschema` 按仓库 `uv.lock`，脚本在任务暂存区），**0 处不符**；V-1 其余实例与 V-4 的 S-32 未重跑。
- **2026-09-24 同日第二轮（主线裁定；候选未冻结，原地改）**：
  - **`terminated_by_agent` 只落后台执行收场提醒的结果块，不落占位**（以 PF-006 §6.7 为准：「被 agent 停掉」写在那段执行收场的提醒里）：[S-18](v1/contract.md#s-18-占位原因与它落在哪一格) 那一行加这句与理由（agent 只能经 `BkgJobs()` 掐已转后台的执行，占位早已写下）；「`reason` 什么时候必带」表 `interrupted` 那一格补「后台那段执行以 `interrupted` 收场时，收场提醒里的结果块同样带原因」。
    `examples.md`：`b99b` 注明是收场提醒里的结果块、不是占位；第 14 节加一行（前台占位带 `terminated_by_agent`——Schema 放行、写入方挡）。**Schema 不变**：块自己看不出记的是哪一段，这一条由写入方兑现（落点归 `data.messages`）。
  - **PF-006 由 rev 17 对到 rev 19**：逐条核 changelog 的 rev 18、rev 19 两节——
    rev 18 的 §5.5「被中断」写全、§6.6 本版限定与发起即后台、§6.12 五个来处、§6.13 按尝试重取、§5.3 两项设置、flows／acceptance 各行：**本契约条款无影响**；
    §5.5「后台那段执行的收场本版不出等不到应答」：S-17 列的后台收场四种与产品同，数据形状不因版本收窄，**无影响**；
    §5.5 新小节「参数说完了却解析不了」与 §6.7 补的三个原因、§6.6 的「前台超时」：**语义与本契约已写的一致**，只是原先仅有主线裁定的依据现在有了产品正文——设计依据表加两行、「没有产品行」那一行改注、S-18 引言改写，covers 补登一条（→ S-12）、§6.7 那一条改注；
    rev 19（§5.3 说明必填、多命令只有命令清单）：不涉本契约。抬头随之对到 rev 19 并注明。
  - **证据**：Schema 与可机检的实例都没变，上一条的 25 处本地自检结果仍适用。
  - **（同日第三轮）** S-18 `backgrounded_auto` 那一行补「或前台上限到点且允许转后台」（PF-006 rev 18 §6.7 转后台那一行的原话）；措辞，不改取值与落格。
- **2026-09-24 第一轮独立评审修复（候选未冻结，原地改）**——逐条处置见[独立评审](#独立评审)：
  - **产品依据复核到当前 rev**（按各 topic changelog 从起草时的 rev 逐版读）：
    PF-009 rev 7→8（`SystemMessage` 不落日志、在途快照、开口是账、工具帧出错照常收尾、入站语音整条到）——都在消息、到达与账那一层，块的形状与取值不变，**无影响**；
    PF-010 rev 5→6（系统提示词只含文本、要求五改「原件／派生表示／transcript」三选一）——S-5、S-19 本来就把取哪一份交给 PF-010，**无影响**；
    PF-013 rev 8→12（rev 9 媒体类型键优先、只交 transcript 不合契约、本版不调模型、登记了用不了当转换失败、投影只算给模型看的块；rev 10 凭据；rev 11 呈现责任；rev 12 路由名按层覆盖）——S-19 的「同有同无」、S-20 的「恒为 `system`」与之一致，**无影响**；
    PF-002 rev 16→20（锁的是界、「谁可以使用它」、MCP 与连接件凭据只在租户层、连接件事件目录与厚信封）——S-8 来路、S-20 八类、S-34 附件落块都不涉，**无影响**；
    PF-001 rev 16→17（权限界与挑选、提升不动持有）——**无影响**；
    PF-012 rev 10→14（rev 11 落盘前对模型回复只能否决、挂派生表示不算改写，rev 12 不可用处置，rev 13–14 转换件本版不是资产）——**无语义影响**；S-20 的依据由「主线裁定」改指 PF-013 §4 与 PF-012 §4 的产品正文。
  - **依据落持久记录**：正文与 Schema 里「主线裁定 2026-09-2x，待产品负责人确认」改为链接 D-040 的小节（S1、S4、S13、S19、S20、S21）；已进产品正文的（`unparseable`、三个补的占位原因、前台超时）改引 PF-006；G-8 闭合。
  - **`terminated_by_agent` 移出 `PlaceholderReason`**（CB-3，按 [UL-placeholder-reason](../../../ubiquitous_language/terms/record-and-context.md#ul-placeholder-reason--占位原因--placeholder-reason) 注意 ②）：`PlaceholderReason` 十二值 → 十一值；工具结果块 `reason.code` 仍收那十二个值（`anyOf` 十一个占位原因与 `terminated_by_agent`），**块的表示不变**；`$defs/PlaceholderReason` 单独校验 `"terminated_by_agent"` 由通过变为拒绝（实例第 13 节一行）。**消费者影响**：没有契约单独 `$ref` `PlaceholderReason`；`capability.tool-execution-runtime` 写 `terminated_by_agent` 的那一处不受影响。
  - **词条**：`origin` 改称来路标记并链 [UL-origin-tag](../../../ubiquitous_language/terms/record-and-context.md#ul-origin-tag--来路标记--origin-tag)（词条第四轮新立）；`MediaType`、`PlaceholderReason` 移进词条对照表。**S-8 的标题「文本块与来源标记」没改**：`data.connector`、`data.slash-command`、`data.skill-package`、`capability.mcp-bridge` 以这个锚点引用它，改名要同轮改那几处链接，已报主线。
  - **措辞**：S-20 括注改为 asset-model S-2 的真实词法（允许冒号、不含 `/`）；S-12 与 CS-2「由宿主接一条 `failed` 结果」改为由工具执行一侧即刻以失败收场（与 `capability.tool-execution-runtime` 那一侧一致）；P-5、S-16 的依据改为规格层推导。
  - **证据**：V-1 本地自检重跑，158 行 0 处不符（[本地自检](#本地自检)）。其余义务状态不变。
- **2026-09-24 修复波 1b（主线裁定 [D-040 §六](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) L1、L12；候选未冻结，原地改）**：
  - **L1**：S-8 标题由「文本块与来源标记」改为「文本块与来路标记」，锚点随之变为 `#s-8-文本块与来路标记`；S-8 里那句「标题是旧称」删去。本包内（契约、实例第 5 节九处、包入口、本页）同轮改；
    包外指向旧锚点的有 `data.slash-command`、`data.connector`、`data.skill-package`、`data.messages`（本轮同一位起草者改）与 `capability.mcp-bridge`（另一位起草者改）——已全树 grep（含 URL 编码形式）核过，没有别处。原先那条「S-8 标题改名」的对齐义务已兑现，删去。
  - **L12**：登 [G-9](v1/contract.md#八已知缺口)「工具调用块的 `tool` 是否 `$ref` `ModelToolName`」（owner 主线，第二轮评审后定），S-12 的 `tool` 一行指向它；对齐义务补一条。
  - G-6 的「遗留一处对不上」改指 D-040 §四 已登的「以词条为准」。
  - **语义与表示都不变**：Schema 与实例的 JSON 未改，V-1 不重跑。

- **2026-09-25 修复波 2（主线裁定 [D-040 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) M2、M8、M22；候选未冻结，原地改）**——逐条处置见[独立评审「第二轮」](#第二轮2026-09-25)：
  - **M8（G-9 关）**：完整工具调用块的 `tool` 取模型面名字，Schema 新增 `$defs/ModelToolName`（定义项 22 项），逐字照 `data.tool-definition` v1 的同名定义写（`^[A-Za-z0-9_-]{1,128}(?![\s\S])`），`ToolCallBlock.tool` 改引它；半截调用块的 `tool` 不变（收到的原值）。**不 `$ref` 那份契约、不登 catalog 依赖**：那份契约依赖本契约，按 [registry「互引成环的登记口径」](../../../registry/README.md#covers)逐字自定义、以它为家，对齐义务见下。
    **表示改变**（收紧）：`tool` 带 `:`、空白或别的字符的完整调用块，旧 Schema 收、新 Schema 拒（`malformed`）。全设计树的实例里调用名都已是模型面名字（核过），**消费者实例不受影响**。新立 [G-10](v1/contract.md#八已知缺口)：模型交回一个不合字符集的名字时这次调用怎样落，owner 主线，落点 `capability.stream-assembly`。实例第 9 节加 `b71`～`b74`。
  - **M12（TER 一侧交付后主线点名补的 data 侧）**：S-18 `abnormal_interruption` 一行的说明放宽——工具执行运行时有序撤下（撤除、替换）时在途的执行当场写这个值（`capability.tool-execution-runtime` v1 S-48）。**取值与落格都不变**，表示不变。
  - **M22**：后台收场提醒那一侧的原因取值域归 `capability.tool-execution-runtime` v1 S-10；`$defs/PlaceholderReason` 只描述占位那一侧；不立新词条。S-18 引言改写成「横跨两种位置」三条；第二节对照表、第三节、S-15、「Schema 管得到什么」与 Schema 两处说明同步。**表示不变**。
  - **M2**：互引成环的登记口径已写进 registry README；来路标记对 `data.slash-command` 的定义性引用（CB-6 那一处）照它，不改登记。
  - **措辞**（R1 第二轮 CB2-1、CB2-4、MS2-2）：消费者表 asset-model 行「来源标记」→「来路标记」；删去第二节那句「S-8 标题沿用旧称、已报主线」（L1 早已改名）；Schema `TextBlock` 说明同改；「没有产品行」表 `origin` 一行改链 D-040 §四；「派生表示 ≠ 卸载的占位」、S-15 `offloaded` 一行、S-22 末条与实例 `b88` 的依据改用 `data.messages/v1#S-11` 的说法——卸载之后带摘要的那一块是那次调用的结果，不是占位。**语义与表示不变。**
  - **证据**：V-1 本地自检重跑，162 行 0 处不符（[本地自检](#本地自检)）。
- **[G-4](v1/contract.md#八已知缺口) 被裁决**（词法）：Schema 收紧 ⇒ **出 v2**，V-1 按新形状重跑，旧实例中依赖宽松形状的要重新判。
- **[G-1](v1/contract.md#八已知缺口) 被裁决**（存储）：`AttachmentRef` 的形状多半不变；V-9 的「引用可解引用」一行与 S-23 的落点由那个 topic 给出，届时补进 V-8 走查。
- **跨进程演化启动**：V-9 从「无法演练」转为**必须演练**；[第四节](v1/contract.md#四装配给与协议给)右列八行从「待兑现」转为「须由协议兑现」。
  **本版的全部证据只保留其单机范围，不得外推。**

- **2026-09-25 修复波 3（候选未冻结，原地改）**：见[实现映射反推](#实现映射反推2026-09-25)。**语义改变**：参数串里重复成员名从「未定」变为「解析不了」；读块的文本时重复成员名是 `malformed`；数的读写无损写成义务。**表示不变**：Schema 与拒绝值集合都没动（`malformed` 的举例多一项）。

结果不改写规范。发现语义问题回到来源设计（PF-009／PF-010／PF-013／PF-006／PF-002），不在这里改契约。

## 独立评审

| 评审 | 日期 | 基线 | 发现 | 处置 | 落点 |
|---|---|---|---|---|---|
| spec-reviewer，S25 第一轮批 R1 | 2026-09-24 | HUB `765b01dc` | CB-1 产品依据 rev 过时 | **改**：七个 topic 逐版复核，本契约条款无语义变化，抬头对到当前 rev | 抬头；[变化的影响](#变化的影响)本轮一条 |
| 同上 | 同上 | 同上 | CB-2 `origin` 与词条「来源标记」同名不同义 | **改**：词条第四轮立了 UL-origin-tag「来路标记」，正文、Schema、实例改用它并链接；`source` 才是来源标记。**S-8 标题暂不改**（四份外部契约引用它的锚点），已报主线同轮改 | 第二节对照表、S-8、S-25、Schema `TextBlock` |
| 同上 | 同上 | 同上 | CB-3 `terminated_by_agent` 与占位原因词条字面相反 | **改**：移出 `PlaceholderReason`（十一值），写成后台那段执行收场的提醒上写的原因；块的 `reason.code` 仍收十二个值 | S-15、S-18、第二节；Schema `PlaceholderReason`、`ToolResultBlock`；实例第 13 节 |
| 同上 | 同上 | 同上 | CB-4 「非词条」与 verification 自相矛盾 | **改**：`MediaType`、`PlaceholderReason`、`origin` 移进词条对照表并链接；本页对齐义务改写 | 第二节 |
| 同上 | 同上 | 同上 | CB-5 S-20 括注的词法与 asset-model S-2 不符 | **改**：照 S-2 写「不含空白与 `/`、允许冒号、区分大小写」 | S-20 |
| 同上 | 同上 | 同上 | CB-6 `origin` 两个取值以 slash-command 条款定义，未登 catalog | **改（写明，不登）**：它是定义性引用，登记会成环（slash-command → content-blocks），在 S-8 与包入口写明，并在下方对齐义务登复核 | S-8；[包入口](README.md)准入核对 |
| 同上 | 同上 | 同上 | CB-7 实例统计数错 | **改**：重数并重跑自检，158 行（通过 58、拒绝 100） | 实例第 15 节；[本地自检](#本地自检) |
| 同上 | 同上 | 同上 | CB-8 V-8 仍说 CS-4 停在 G-7 | **改** | V-8 |

### 第二轮（2026-09-25）

reviewer：spec-reviewer，S25 第二轮批 R1；基线 HUB `8ad37c50`。本批总判「可进 F 反向核对」。依据一律是 [D-040 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)（M1～M29）；只剩「待产品负责人追认」的不再登缺口。

| # | 发现（等级） | 处置 | 落点 |
|---|---|---|---|
| CB2-1 | 「来源标记」三处残留（应修） | **改**：三处改「来路标记」，删去第二节那句旧称说明 | 消费者表 asset-model 行；第二节对照表 `origin` 行；Schema `TextBlock` 说明 |
| CB2-2 | 后台收场提醒上的原因与 `PlaceholderReason` 同一组 token、两种含义（应修） | **改**（M22）：那一侧的取值域归 `capability.tool-execution-runtime` v1 S-10；`$defs/PlaceholderReason` 只描述占位；不立新词条。S-18 引言写成「横跨两种位置」 | S-18；第二节、第三节；S-15；「Schema 管得到什么」；Schema `PlaceholderReason`、`ToolResultBlock` |
| CB2-3 | 定义性引用「会成环所以不登」只写在任务区与各契约正文（应修） | **改**（M2）：口径已由主线写进 registry README「互引成环的登记口径」；本契约的来路标记与新的 `ModelToolName` 都照它 | S-12；Schema `ModelToolName` 的 `$comment`；本页对齐义务 |
| CB2-4 | 「没有产品行」表仍写「两处对不上，已报主线」（建议） | **改**：改链 D-040 §四「D-038 Q1」那一行；取值集以 S-8 为准。取值集是否一并被取代留在产品负责人对 D-040 的追认里，不登缺口 | 设计依据后的「没有产品行」表 |
| MS2-2（本契约那一半） | 卸载之后带摘要的那一块在本契约里叫「占位」（应修） | **改**：「派生表示 ≠ 卸载之后带摘要的那份结果」；S-15 `offloaded`、S-22 末条、第九节、实例 `b88` 同改，与 `data.messages/v1#S-11` 一个说法 | 第二节；S-15；S-22；第九节；实例第 10 节 |
| 范围外：G-9（L12 留到本轮之后裁） | — | **改**（M8）：`tool` 取 `ModelToolName`，逐字自定义；G-9 关，新立 G-10（不合字符集的名字怎样落） | S-12、S-13、S-24、S-26；第八节；Schema；实例第 9 节 |
| 范围外：D-038 Q1 取值集 | — | **不改**：产品负责人追认 D-040 时一并确认；本契约不另登缺口 | — |

## 实现映射反推（2026-09-25）

起因：realization-drafter 戊起草 `core/content-blocks`、`core/messages` 节点时报回 SA-1、MSG-3；主线裁定 [D-040 §八 M36](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)，读法由 [§八 N-20](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 补一句（「M36 在 stream-assembly 读作 S-10『解析不了的调用块』，`malformed` 只在读 JSON 文本的接收边界」）。**裁定不代替接受**，本契约仍是 candidate。

| 裁定 | 落点 | 本契约推导的部分（已报主线） |
|---|---|---|
| **M36** JSON 按 RFC 8259 严格解析；重复键 ⇒ 解析失败 | [S-12](v1/contract.md#s-12-完整的工具调用) 加一条：参数串那一次解析里重复成员名即**解析不了**（落 `rawArguments` ＋ `unparseable`）；[S-24](v1/contract.md#s-24-规范表示) 加一条：读块的 JSON 文本时重复成员名即 **`malformed`**；[S-26](v1/contract.md#s-26-表示层拒绝值) `malformed` 举例补一项；Schema 管不到表加一行、「四条」一句；examples §14 三行；新 V-11 | **两处分开落**：M36 原文括注「(`malformed`)」只适用于读文本的边界；参数串的那一次解析按 N-20 读作「解析不了」——否则一次收齐了的调用会因一个重复键变成非法块、连同它的 `callId` 一起消失，与 S-12「解析不了的是一次已登记的调用」相抵 |
| **M36** 超出 2^53 的整数与金额无损保留原文，落盘与回读走无损读写 | [S-12](v1/contract.md#s-12-完整的工具调用) 同一条后半；[S-24](v1/contract.md#s-24-规范表示) 同一条后半；[第四节](v1/contract.md#四装配给与协议给)加一行（每一跳无损；做不到——参数静默变了）；examples §14；V-11 | 写成**性质**（读进来、存下、读出来是同一个十进制数；不折成 double），不写怎样实现无损；`opaque` 那一行原有的「不丢数值精度」保留，新行覆盖全部 JSON 数 |

**对证据的影响**：没有既有证据受影响——V-1 的本地自检只核 Schema 一列，M36 的三件事它测不出（新 V-11 写明）。

**对消费者**：`capability.stream-assembly` S-10（那一次解析的口径，子同批落）；`data.messages`（它的 S-37、S-39 同口径，同批由癸落）；`data.call-accounts` 的金额已在它的 S-5 与 G-9（无损），本轮不动；任何读写块 JSON 文本的接收边界（会话日志、传输适配）按 S-24 读。

**registry**：catalog、covers、formal-tasks、id-namespaces 都不变（没有新消费的条款，也没有新承诺要登 covers）。

## 对齐义务

- **来路标记的两个取值与 `data.slash-command` v1 的 S-21、S-25 对齐**（定义性引用，不登 catalog）：那两条改了展开物或留痕的所指，[S-8](v1/contract.md#s-8-文本块与来路标记) 的 `slash_command_expansion`、`slash_command_record` 同轮复核。
- **`$defs/ModelToolName` 是 `data.tool-definition` v1 同名定义的逐字副本**（[S-12](v1/contract.md#s-12-完整的工具调用)；家在那份契约的 S-6）：`type` 与 `pattern` 两处逐字相同；那份契约改字符集或长度，本契约同轮改、V-1 重跑。本契约不 `$ref` 它、不登依赖——那份契约以 `$ref` 取本契约，反向会成环（registry README「互引成环的登记口径」）。**任何一边改了而另一边没跟，不会报任何错**，这一条只能靠两份 Schema 片段的字面比较兜住。
