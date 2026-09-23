# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：几乎全部未开始。**`data.messages` v1 是 `candidate`，未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> **唯一执行过的是 Alloy 结构模型**（2026-09-23，起草者本机，**未登记为 formal task、未入 `record/evidence/`**，见[形式化工件](#形式化工件)）。
> **Schema 正反实例校验未运行**：起草时只做了手核（[`examples.md` 第 13 节](v1/examples.md#13-起草者逐条自核)），**没有跑过任何校验器**；
> 八条规范场景、七条消费者核对场景、六条静态检查**一条都未执行**——文件存在不代替结果。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v1/examples.md) 第 1～9 节、10.1、11、12 节逐行过 Schema，比对「Schema」一列。10.2 节不参与 | Draft 2020-12 校验器（须支持 `unevaluatedProperties`、`dependentRequired`、`minContains`／`maxContains`，并能按 `$id` 解析到 `data.content-blocks/v1`、`data.offer-expiry/v1` 的 Schema）＋ 该文件按节绑定的 `$defs` | [S-1](v1/contract.md#s-1-七种消息)～[S-27](v1/contract.md#s-27-compactionmessage-与它的名单) 的**形状那一面**、[S-38](v1/contract.md#s-38-判别式与枚举闭合) | **未运行。**起草者手核 110 行（通过 44、拒绝 66），结论与标注一致；**手核不是证据** |
| V-2 | **拒绝值的具名与两段优先级**：对 `examples.md` 每个拒绝行，接收边界给出的拒绝值等于「拒绝值」一列；第 12 节六行专验第一段的次序 | 接收边界的一致性用例（同一份输入跨实现比对） | [S-39](v1/contract.md#s-39-表示层拒绝值)、[S-40](v1/contract.md#s-40-表示层拒绝不是判定也不修补) | **未开始。**需要一个实现了接收边界的提供者。**只验 Schema 通过与否不够**——两个实现可以都拒绝、却报不同的名字 |
| V-3 | **单条消息里 Schema 管不到的约束**：工具消息两个 `callId` 相等；后台收场提醒里工具结果块与 `source` 的 `callId`／`outcome` 相等；名单不点自己；一条消息里块标识唯一（含嵌套） | 接收边界的校验 ＋ [`examples.md` 10.1 节](v1/examples.md#101-单条消息里的跨成员约束) | [S-2](v1/contract.md#s-2-消息底座)、[S-11](v1/contract.md#s-11-toolmessage)、[S-19](v1/contract.md#s-19-后台执行的两种收场提醒)、[S-29](v1/contract.md#s-29-合法名单的判定) ① | **未开始。**块标识唯一这一条是 `data.content-blocks` v1 交过来的义务（它的 V-3），**落点就在本契约的接收边界** |
| V-4 | **日志层的判定**：名单的 ②～⑥、配对与唯一 ①～⑤ | 日志序列检查（给定一份日志前缀，判一次追加合不合法）＋ [`examples.md` 10.2 节](v1/examples.md#102-会话日志层的判定)逐行 | [S-29](v1/contract.md#s-29-合法名单的判定)、[S-30](v1/contract.md#s-30-悬着的占位)、[S-32](v1/contract.md#s-32-会话日志里的配对与唯一) | **未开始。**需要日志写入方的提供者。⑤ 的卡片那一半停在 [G-5](v1/contract.md#九已知缺口)，⑥ 停在 [G-2](v1/contract.md#九已知缺口)——停在缺口如实记为「本版到此为止」 |
| V-5 | **此刻模型可读的规范场景**：[`examples.md` 第 11 节](v1/examples.md#11-规范场景五条消息此刻哪些块模型可读)的五条消息，实现算出的两个可读集合与手算逐块相同；三个变体各跑一次 | 规范场景演练：真实组装，真实日志 | [S-28](v1/contract.md#s-28-此刻模型可读是算出来的)（[S-47](v1/contract.md#s-47-此刻模型可读)） | **未执行。**需要 PF-010 组装的提供者。**手算不是证据** |
| V-6 | **规范场景** [S-41](v1/contract.md#s-41-七种之外即拒)～[S-46](v1/contract.md#s-46-名单的合法性)、[S-48](v1/contract.md#s-48-中断必补) | 规范场景演练：真实接收边界、真实落盘 | [S-1](v1/contract.md#s-1-七种消息)、[S-10](v1/contract.md#s-10-assistantmessage-怎么收的尾)～[S-13](v1/contract.md#s-13-toolinternalmessage)、[S-16](v1/contract.md#s-16-性质与来源定死对应)、[S-17](v1/contract.md#s-17-说状态的带前值与现值)、[S-19](v1/contract.md#s-19-后台执行的两种收场提醒)、[S-21](v1/contract.md#s-21-中断之后必补一条)、[S-29](v1/contract.md#s-29-合法名单的判定) | **未执行。**[S-42](v1/contract.md#s-42-工具消息恰一块) 的两个反例**必须同跑**：只跑块数那一个，一个只信 Schema 的实现也会全过 |
| V-7 | **出门的三条义务**：每接一家，两种我们自己的消息各有落点、不丢；标识由系统加；提醒里的工具结果不译成第二个回答；`ToolInternalMessage` 到不了翻译方 | 传输适配的一致性用例（每家一组） | [S-34](v1/contract.md#s-34-四种直接对应)～[S-36](v1/contract.md#s-36-toolinternalmessage-不进请求) | **未开始。**需要模型请求运行时与传输适配（块 C）的提供者 |
| V-8 | **消费者路径走查**（[CS-1～CS-7](v1/contract.md#消费者核对场景)） | 结构化走查（评审对象）；有提供者之后升级为真实演练 | 见各场景 | **未开始。**走查**不需要提供者**，现在就做得了；**CS-2 停在 G-2／G-5、CS-4 停在 G-12、CS-6 停在 G-8** |
| V-9 | **跨进程**：[第五节](v1/contract.md#五装配给与协议给)右列七行逐行演练 | 规范场景演练 | [S-3](v1/contract.md#s-3-messageid)、[S-29](v1/contract.md#s-29-合法名单的判定)、[S-32](v1/contract.md#s-32-会话日志里的配对与唯一)～[S-36](v1/contract.md#s-36-toolinternalmessage-不进请求)、[S-39](v1/contract.md#s-39-表示层拒绝值) | **未开始，且本版装配下无法演练**——单机同进程不构成接收边界。**这不是免除**：跨进程演化启动时必须补做，登记在[变化的影响](#变化的影响) |
| V-10 | **静态检查**（[SC-1～SC-6](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | **未开始；检查器尚不存在** |
| V-11 | **结构模型**：[`formal/Readable.als`](v1/formal/README.md) 的两条 `run` 找到实例、四条 `check` 找不到反例；五个变异各自找到反例 | Alloy 6.2.0 | [S-28](v1/contract.md#s-28-此刻模型可读是算出来的)、[S-29](v1/contract.md#s-29-合法名单的判定) ①②④⑤、[S-30](v1/contract.md#s-30-悬着的占位) 第 1 类 | **执行过一次，结论与预期一致**，见[形式化工件](#形式化工件)；**未登记为 formal task，原始输出未入 `record/evidence/`** |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。本版全部状态为「未开始」，**不得以「已列出」充当「已通过」**。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 不存在从消息正文推「这条是谁说的」的代码：说话者只读 `type` | [S-1](v1/contract.md#s-1-七种消息) | 未开始 |
| SC-2 | 不存在从提醒正文推来源事实的代码：恢复对账、循环阶梯、呈现只读 `source` | [S-15](v1/contract.md#s-15-systemremindermessage正文给模型读来源给系统认)、[S-19](v1/contract.md#s-19-后台执行的两种收场提醒)、[S-23](v1/contract.md#s-23-循环守卫的干预) | 未开始 |
| SC-3 | 不存在按 `createdAt` 排序或比较先后的代码 | [S-4](v1/contract.md#s-4-createdat-不是次序) | 未开始 |
| SC-4 | 不存在「当前可读集合」这样一份被写下来的状态；也不存在回头改块上 `toModel` 的写路径 | [S-27](v1/contract.md#s-27-compactionmessage-与它的名单)、[S-28](v1/contract.md#s-28-此刻模型可读是算出来的) | 未开始 |
| SC-5 | 翻译方的每一家映射都为 `system_reminder` 与 `compaction` 各有一个落点；不存在「认不出就跳过」的分支；`tool_internal` 不在翻译方的输入类型里 | [S-35](v1/contract.md#s-35-我们自己那两种必须在发出前译掉)、[S-36](v1/contract.md#s-36-toolinternalmessage-不进请求) | 未开始 |
| SC-6 | 不存在「从最后一条压缩记录往后取」的组装实现 | [S-28](v1/contract.md#s-28-此刻模型可读是算出来的) | 未开始 |

## 结果与反例

### 尚无的记录

V-1～V-10 **一条执行记录也没有**。起草时的手核只保证 `examples.md` 的实例与它们的标注在起草者眼里不互相矛盾，
**未登记、无输入快照、未进 [`record/evidence/`](../../../record/evidence/README.md)**，不作为任何一条义务的证据。

首次执行时在此记录工具与版本、环境、配置、输入范围、可复现步骤与原始结果位置；原始产物归 `record/evidence/`。
**必须分开陈述**：Schema 校验的结果、拒绝值一致性的结果、日志序列检查的结果、规范场景演练的结果、真实组合的符合性——**几者不能互相冒充**。

## 形式化工件

**V-11 执行过一次**（2026-09-23，起草者在本 spoke 上执行；**不是 registry 登记的 formal task，通过不提升任何状态**）：

| 项 | 值 |
|---|---|
| 输入 | `v1/formal/Readable.als`，SHA-256 `59f9358476700b3f9770d53ac6db3a86ca73688ca1cc94b50e6b6302ad35b406` |
| 工具 | Alloy 6.2.0（`/opt/alloy/alloy.jar`，JRE 21），命令 `alloy exec -f -o <临时目录> Readable.als`，全部命令、各自带的作用域 |
| 结果 | `run placeholderNamedOnlyAfterItEnded` **SAT**（1/1）；`run aNestedBlockSilencedAlone` **SAT**（1/1）；`check NewBlocksBornReadable`、`check OutstandingPlaceholderStaysReadable`、`check ReadabilityMonotone`、`check NestedReadableImpliesContainersReadable` 均 **UNSAT**（给定作用域内无反例）；退出 0 |
| 变异核对 | 在副本上各改一处（改法见 [formal 入口](v1/formal/README.md#alloy)），只跑对应的 `check`：`legal` 允许自指 → A1 **SAT**；`legal` 允许前向 → A1 **SAT**；「悬着」按整份日志判 → A2 **SAT**；「悬着」只算顶层块 → A2 **SAT**；`path` 只含自己 → A4 **SAT**。**五个变异都找到反例，且每一次退出码仍是 0** |
| 原始输出 | 只在起草者的临时目录；**未入 `record/evidence/`**（起草者对该区无写权限）。需要可复核的证据时，由主线按上面的命令对同一 SHA-256 的文件重跑并入档 |

**这次执行说明的，只是**：在各命令的作用域内（`Msg` 恰 5 或 6 条、其余 sig 至多 5 或 6 个），四条断言无反例，两条一致性 `run` 有实例，五个变异让断言失败——断言不是空的。
**它不说明**：任意规模成立；块的形状合法（归 V-1）；⑥ 与 ③ 成立（模型没有表达）；任何实现满足这些性质（归 V-4、V-5）。

**为什么不登记为 formal task**：上面的变异核对**当场复现了** registry 记下的那件事——`alloy exec` 找到反例时照样退出 0，而 `--formal run` 只看退出码。
登记了会得到一个**永远通过的任务**。起草简报允许「退出 0 且无反例才登记」，但这条前提在这个工具上判不出「无反例」，因此按「拿不准就不登记」处理，**已报主线**。

## 变化的影响

- **起草（2026-09-23）**：首版候选，建在 PF-009 rev 7、PF-010 rev 5、PF-012 rev 10、PF-014 rev 5、PF-015 rev 11、PF-006 rev 17、PF-004 rev 10、PF-008 rev 5 上。
  **依赖 `data.content-blocks` v1（candidate，未冻结）**：它若在评审或对齐中改 `ContentBlock`、`ToolResultBlock`、`BlockId`、`CallId`、`ExecutionOutcome` 的定义或拒绝值，本契约的 Schema 引用、[S-6](v1/contract.md#s-6-每种消息能装哪几类块) 的表与 [S-39](v1/contract.md#s-39-表示层拒绝值) 的六个借来的名字须同轮复核，V-1 重跑。
  `data.offer-expiry` v1 与 `data.identity-values` v1 已接受、已冻结，**这两条引用的目标不会漂移**；它们若出 v2，本契约不自动跟随。
  同轮登记：catalog 一条 `candidate`（三项依赖）；covers 73 条，全部 `reviewed=false`，按[设计依据](v1/contract.md#设计依据)表机械展开、**未逐条复核**；`formal-tasks.json` 与 `id-namespaces.json` 未动（理由见[形式化工件](#形式化工件)；所用编号前缀均已登记）。
  设计依据表的任何一行改动，都要同轮改 covers 的对应条目。
- **对齐波（主线补充裁决已知的几项）**：`ResponseId` 改为 `$ref` `data.model-response` v1（[G-3](v1/contract.md#九已知缺口)），`ModelCallId` 改为 `$ref` `data.call-accounts` v1（[G-4](v1/contract.md#九已知缺口)）——
  **形状不变则语义不变**，但 Schema 的引用改了、catalog 多两条依赖，**未冻结时原地改、在此记一笔**；若对方的形状与本契约的占位不同，V-1 重跑。
- **[G-8](v1/contract.md#九已知缺口) 被裁决**（尝试开始的原因）：`reason` 多出取值 ⇒ **表示改变**；未冻结时原地改，冻结后出 v2。V-1、CS-6 重做。
- **[G-5](v1/contract.md#九已知缺口) 被裁决**（卡片）：`CardId`／`CardAnswer` 换成卡片契约的 `$ref`，[S-30](v1/contract.md#s-30-悬着的占位) 第 2 类有了定义 ⇒ Alloy 模型要加卡片的占位，V-11 重跑。
- **[G-12](v1/contract.md#九已知缺口) 被裁决**（解析不了的调用块）：`data.content-blocks` 出下一版后，[S-31](v1/contract.md#s-31-收齐却解析不了的调用) 有了合法表示，[S-6](v1/contract.md#s-6-每种消息能装哪几类块) 的表多一格 ⇒ V-1、CS-4 重做。
- **[G-6](v1/contract.md#九已知缺口)／[G-11](v1/contract.md#九已知缺口) 被裁决**：若 runtime context 的块可以为 `null`，`previous` 的表示要改（出 v2）；若 `extension` 说状态时要结构化的前后值，`ExtensionSource` 多成员（出 v2）。
- **[G-2](v1/contract.md#九已知缺口) 闭合**（条目壳与日志）：⑥ 的判定有了落点，V-4 从「停在缺口」转为可演练；Alloy 模型可以加上「上一次模型请求」这个对象。
- **[G-13](v1/contract.md#九已知缺口) 闭合**（裁决落进决定）：只改[设计依据](v1/contract.md#设计依据)表的链接，语义与表示不变。
- **跨进程演化启动**：V-9 从「无法演练」转为**必须演练**；[第五节](v1/contract.md#五装配给与协议给)右列七行从「待兑现」转为「须由协议兑现」。
  **本版的全部证据只保留其单机范围，不得外推。**

结果不改写规范。发现语义问题回到来源设计（PF-009／PF-010／PF-012／PF-014／PF-015／PF-006／PF-004／PF-008），不在这里改契约。
