# session-log-jsonl v2 提供者增量候选

本稿是 `packages/session/session-log-jsonl` 的第二版**提供者设计候选**，不是 `capability.session-log` 的新协议版本。状态：**candidate，未接受，尚未建包**。保留 [已接受设计](design.md)、[现有分层状态](README.md#分层状态)及冻结契约的原字节；本稿被接受前不替代它们。下面的插件、服务、函数及内部字段名均为**候选**，操作名沿契约。没有新增绑定，实际验证尚无。

候选修订 2：按首轮独立评审澄清无损 JSON 载体、写入不可信时的恢复顺序、MR4 头字段表示，并登记 AR-B1-1 的 late 提交组合缺口；这些澄清不构成接受或缺口解决。

范围仅为既有 `append`、`readByKey`、`readSince` 承接当前模型消费者的载荷与恢复要求；归档、分页、推送、通用会话治理和 AgentLoop 不在本增量内。全部契约坐标的 baseline 均为 `omne-harness-lite-design-2026-09-15`。契约与节点的接受以 [catalog](../../../../registry/catalog.json)、对应接受事件为准，冻结正文中的历史 candidate 表述不作当前状态依据。

## 输入、传播与分层状态

| 输入及精确版本 | 当前接受依据 | 本节点取用范围与传播责任 |
|---|---|---|
| [capability.session-log/v2](../../../../spec/capabilities/session-log/v2/contract.md) | D-061，catalog 当前接受记录指向 坐标对账 | 全部三个操作；本稿重点 S-6～S-19、S-21～S-23。协议仍按自身精确依赖使用 messages2 的 SessionRef/壳归属、call-accounts2 的 RunId/AttemptId、content-blocks2 S-24 的无损口径，不把它的依赖表改成新版本 |
| [既有 provider design](design.md) | D-062、D-065 | 保留 JSONL、属主文件锁、每本日志队列、派生索引及其前提、一行一批、每批 datasync、关准入后排空的实现路径 |
| [data.messages/v4](../../../../spec/data/messages/v4/contract.md)、[messages.schema.json](../../../../spec/data/messages/v4/messages.schema.json) | 模型适配首批接受（提交 `19c7ec60d77f5e54ea36702d3b7f0d00cc3b7a0e` 的历史 D-070），catalog 当前由 D-078 接续 | 写入方与读方采用 S-37/S-39 的表示校验及 S-49/S-50 的运行时记录；provider 仅承载完整 JSON。AssistantMessage、SystemReminderMessage、五种 ModelInvocationRecord 都不投影成旧载荷 |
| [data.model-response/v4](../../../../spec/data/model-response/v4/contract.md)、[model-response.schema.json](../../../../spec/data/model-response/v4/model-response.schema.json) | 同上 | 消费者采用 S-6/S-14/S-17～S-23/S-26/S-27/S-35～S-38；完整 route、绑定、实际执行方、usage/cost、timing、reply/delivered 与脱敏后原始事实原样存取 |
| [data.content-blocks/v3](../../../../spec/data/content-blocks/v3/contract.md)、[content-blocks.schema.json](../../../../spec/data/content-blocks/v3/content-blocks.schema.json) | core 规格协调接受 | messages4/response4 中的块取该版本；S-24 的严格无损 JSON 与 SL2 沿用的 CB2 S-24 同义。provider 复用 [core/content-blocks](../../core/content-blocks/design.md) 的公开编解码，不解释工具调用、opaque、附件或派生表示 |
| [data.model-profile/v3](../../../../spec/data/model-profile/v3/contract.md)、[model-profile.schema.json](../../../../spec/data/model-profile/v3/model-profile.schema.json) | 同一首批接受及 D-078 接续 | 间接载荷依赖：S-27/S-29～S-31 的完整快照与 adaptation，尤其 configuration.values；不从当前档案、当前注册实现或 revision 字符串回填历史配置 |
| [data.loop-extension/v4](../../../../spec/data/loop-extension/v4/contract.md) | D-073 | runner 负责结论、完整提醒、模型失败主体的接收和落盘校验；provider 不认识结论种类或业务效果 |
| [capability.model-request-runtime/v3](../../../../spec/capabilities/model-request-runtime/v3/contract.md)、[runtime v3-design](../../model/model-request-runtime/v3-design.md) | D-076 | 本稿逐项投影 L-1～L-7、Q-2/Q-3 的日志一侧；L-4 中 late 在实际写入点的正确性仍受 G2-7 阻断。P-2 的隔离、旧写者生命周期、S-33 时机仍归 runtime 与宿主 |
| [capability.loop-extension-runner/v3](../../../../spec/capabilities/loop-extension-runner/v3/contract.md)、[runner v3-design](../../agent-loop/loop-extension-runner/v3-design.md) | D-076 | 承接沿用 RL-1～RL-6 的原子记录、栅栏、结论/提醒唯一、按锚有序读取及 ask 可见性；不承接卡片唯一性或工具执行 |

Schema 闭包必须按上述精确 `$ref` 取用：messages4 → CB3/profile3/call-accounts2；response4 → messages4/CB3/profile3/call-accounts2，且其 FailureCause **仍引用 loop-extension3**；profile3 的模态与无损口径**仍引用 CB2**。同时出现旧、新版本是显式依赖，不得批量把 `$ref` 改成“最新”。Schema 根为定义登记处时，消费者选择命名 `$defs`，不以根模式通过宣称整条载荷合法。

| 状态层 | 本增量结论 |
|---|---|
| 语义接受 | SL2、上述 data、runtime3/runner3 已接受；**本提供者增量未接受**，不新增协议承诺 |
| 可实施 | 既有文件机制可承载合法 JSON 载荷；本稿补齐候选传播、校验责任及恢复交接。跨写入方键编码、消费者反向采用与真实恢复组合仍见 G2-1～G2-4；TransportFailure 数组到 MR4 的持久表示未定（G2-6），withRun response 的 late／结算组合未闭合（G2-7）。后两项不阻断 SL2 不透明三操作或纯传输 |
| 绑定证据 | [bindings.yaml](bindings.yaml) 仍为 0 条。本稿 V2-1～V2-10 是待执行义务，不登记为已存在测试或形式证明 |
| 实际验证 | 尚无 provider 源码或真实三操作运行。设计检查只核引用、形状及已登记资源，不验证 IO、排空或语义 |

需求基线沿 SL2：PF-012 rev 15、PF-015 rev 11、PF-000 rev 1；新增消费沿 D-076 指认的 runtime3/runner3 需求与适配提案。不是重新定义消息、响应、模型适配绑定或会话日志。

## 实现路径、公开面与 Cordis 投影

复用原节点的必要自建路径：Node ≥ 24 内置文件操作、严格无损 JSON 纯模块、既有身份值表示及 kernel-basis。没有新的数据库选型、业务表或载荷版本注册服务。Cordis 采用 D-025 的 4.0.4；配置错误统一**启动失败**，非法 dir/策略不发布服务。

公开面沿 [既有设计](design.md#公开面)：纯校验/判定/折叠/编解码；不依赖 Cordis 的 `openJsonlSessionLog` 闭包及其生命周期 `close`；一条 provider fiber 提供 `sessionLog` 的三个契约操作。`close` 是既有闭包 owner 的生命周期面，不成为第四个日志业务操作；不新增 `recover`、`drainSession` 或向消费者开放的锁操作。provider **不 inject 服务、不发事件**。时钟、密钥、模型注册表均不是它的依赖。

| 行 | 契约责任 | 插件／服务／操作（候选） | 实现与采用版本 | 符合性依据或缺口 |
|---|---|---|---|---|
| SLJ2-P1 | SL2 S-6/S-11/S-15/S-17：合法壳、合法 JSON、原样留存 | `checkAppendInput` → owned JSON 值 → `encodeCommitLine`；`sessionLog.append` | 既有 lossless 编解码；MS4/MR4/LC4 的业务校验归下节写读边界 | V2-1/2；合法 JSON 的非法消息也必须原样存，不能偷加 data 校验 |
| SLJ2-P2 | SL2 S-8/S-12/S-14/S-17：持久判重与租户判定；RT3 L-2/L-3/L-5 | 每本日志队列内 `judgeAppend`；写同一 entries.jsonl 的完整批 | 属主锁＋已确认判定态；拒绝顺序沿契约；索引继承 SLJ-11 前提 | V2-3/4；G2-2 的共同键编码不能由 provider 猜 |
| SLJ2-P3 | SL2 S-10/S-14/S-17：fenced attempt 判定；runner RL-2；RT3 L-4 仅此部分可承载 | 同一追加判定点比较壳 `(run, attempt)`；unfenced 不执行该判定 | 不读 payload 补序号、不另存尝试行；允许 unfenced 追加不等于它的 late 在提交时已判对 | V2-4；MR4 S-35／CA2 S-39 与 unfenced append 的排序未闭合，G2-7 明确阻断 withRun late／结算组合 |
| SLJ2-P4 | SL2 S-7/S-13/S-17：全批、持久确认；RT3 L-1、runner RL-1/RL-6 | 一行一批写完整、datasync 后确认；首次建目录按原 F-3 同步 | 日志文件的提交与确认点不变；无跨 SQL 原子性 | V2-3/6；kill 不是断电验证 |
| SLJ2-P5 | SL2 S-9/S-18/S-19：一致尾、全量匹配、有序无损读；RT3 L-6、runner RL-5 | `readByKey`／`readSince` 捕获本次确认尾、返回完整壳/位置/payload | 读不跳过不认识的 payload；I/O 失败不返回空或半段 | V2-1/5；业务读方校验版本，不以当前档案改历史 |
| SLJ2-P6 | SL2 S-22/S-23 与 RT3 L-7/Q-2/Q-3：未知回执和权威恢复 | 原 `close`/插件单一 cleanup → 属主交接 → 重新打开 → 既有读面 | owner 排空文件任务，重启后按盘上完整行恢复；不新增日志恢复操作 | V2-6/7/8；旧 confirmed tail 不作缺席证明；G2-3/4 |
| SLJ2-P7 | SL2 S-21/S-23：装配身份、旧引用、配置与清理 | 一条 provider fiber；根作用域一份；旧闭包关准入后拒绝 | Cordis 4.0.4 的 basis 及原装卸次序；身份由装配与写方守 | V2-8/9/10；没有数据权限沙箱或调用自动取消 |

### 依赖与版本生效点

编解码与表示工具只走各 core 包公开入口；SL2 的 SessionRef、RunId/AttemptId 和不透明键的词法仍按它自己的精确契约。当前 core/messages 包若默认导出 v4，必须使用它所保留的精确 v2 面，或核对所复用函数确实兑现 SL2 消费的同一旧形状；包版本升级不能代替契约采用。新载荷 schema 仅供消费者接收校验和组合验收使用，不挂成 provider 的运行期依赖。

provider 实例绑定日志根和策略至生命周期结束；运行期不改 dir。runtime 与 runner required inject 日志，换代时按各自契约停止旧工作并重建；模型贡献热更新不要求重开日志。数据档案撤回、实现版本退役均不改已存载荷，也不影响 provider 读取旧 JSON。旧载荷不会自动成为新版本：MS3 缺少 binding 的记录读回仍是原记录，当前消费者在自己的边界拒绝，不补成 MS4。

### 载荷校验、复制与无损责任

| 边界 | 责任与失败归属 |
|---|---|
| runtime 构造已出门记录 | 以 messages4 `ModelInvocationRecord`／对应分支检查形状，并用其 S-49 纯校验核两处 adaptation 完整相等及 definition.modelId 与 profile.routeName 相等；保持本次已冻结快照。失败沿 runtime 既有边界处理，不能交日志自动修正 |
| runtime／回复调用者构造 ModelResponse | 以 response4 `ModelResponse` 加 S-27 跨字段判定校验；S-36 跨记录绑定与 dispatched 相同、S-17 timing 与 opened 相同、S-21 脱敏及 S-37/S-38 实际 provider/cache 来源均归写入方，Schema 通过不足。回复批中的 AssistantMessage 与 response 配对由写入方守 |
| runner 记录结论与提醒 | 以 LC4／messages4 精确公开面判定；完整提醒含原 id/createdAt/source/blocks 随结论保存。按 MessageId 撞键后读全值比较，由 runner 区分同值认回、输出不合法、replayInconsistent 与 unavailable，不由日志比较 payload 或挑获胜消息 |
| provider 接收 append | 先按 SL2 S-17 检查壳与 core/content-blocks 公开支持的无损 JSON 交换表示；真正的 `LosslessNumber`、经公开入口建立的 `OpaqueJson`（当前内部载体 `OpaqueJsonValue`）可经 `copyJsonValue` 转成自有交换表示，不因其载体是 class 一概拒绝。任意其他非 JSON class、函数、循环引用、undefined、NaN/Infinity 拒绝为 invalidInput，不静默剥掉。任何层重复成员在文本解码时拒绝；调用者后改对象不得改排队中批次 |
| provider 编码、恢复、读回 | 整行及 payload 一直使用 `readJsonStrict`／`writeJsonLossless` 与公开 JsonNumber 表示；不得经过普通 JSON.parse/number/JSON.stringify 的有损中转。保留大整数和长十进制原文；对象成员排列不构成业务差异，数组次序及数字精确值保留。`copyJsonValue` 只保留交换表示，不保留 OpaqueJson 或其他领域品牌；provider 不导入内部 OpaqueJsonValue 构造器。严格解析失败沿原半截／受损规则，不挑重复成员继续 |
| provider 的读结果交付 | 调用方不能经返回对象改掉 provider 的判定态或后续读结果；复制或不可变表示是实现手段，不新加业务字段。配置、合法 JSON 数组、工具 rawArguments、opaque 的交换表示与附件指认原样保留；provider 不据 opaque 内容分支、不改写、不读取附件字节。日志能保存数组不证明数组属于 MR4 的合法头字段 |
| runtime／runner／投影接收历史 | 在接收边界重跑对应精确版本校验和必要跨记录关系，并经各 data 所属的权威表示恢复／判定入口重建领域类型与 opaque 包装；不得把裸 JsonValue 强制断言成带品牌的消息、响应或块。绑定完整比对用 MP3 S-29 的对象无序／数组有序／数字精确规则。非法历史不改写、不忽略、不换最新；失败由各消费者原契约映射，日志服务不新增 malformed 等值 |

SL2 S-11.3 允许合法 JSON 而不合某 data 形状的载荷进入日志；保留这一负面用例，防止实施者把 provider 变成模型 schema registry。相反，重复成员或失真数字不能借“不解释载荷”放过。配置秘密排除和响应脱敏发生在写入之前；provider 的诊断只记录受限位置、阶段及原因，不把整条 payload 或原始错误内容重复写进诊断。

**MR4 的头字段与传输失败事实是两个值面。**[model-response/v4 Schema](../../../../spec/data/model-response/v4/model-response.schema.json) 的 `$defs.RawResponse.properties.headers.additionalProperties` 只允许 `string`。`TransportFailure` 上保留重复头值的数组可以是合法 JSON，但不能因此作为合法 MR4 `raw.headers` 原样追加。V2-1 的合法 MR4 往返使用 string 值；V2-2 另验日志的任意合法 JSON 数组保真，以及含数组头值的对象在 MR4 接收边界被拒绝。数组事实如何进入持久响应由 runtime／response owner 处理（G2-6）；本节点不规定拼接、取首项、丢头、新字段或新 MR 版本。

## 当前消费者与共同存储对象

**共同存储对象是同一会话目录的 `entries.jsonl` 中已提交的条目及其判重键、尝试壳和顺序。**runtime、runner、回复调用者、尝试开始写入方都通过同一 provider 的追加提交点触碰它。`<dir>/.owner-lock` 只保护唯一写者资格；进程内队列只在持锁实例寿命内排序。SQL 会话表、投影缓存、时间谓词、runtime 隔离标记都不是这一提交域。

| 消费者输入／要求 | provider 兑现点 | 消费者仍须做什么 |
|---|---|---|
| [RT3 L-1](../../model/model-request-runtime/v3-design.md#存储要求与共同提交对象) 已出门／已开口／结算批 durable ack | SLJ2-P4；原一行一批、datasync 后确认 | 只在确认后发送或释放首内容；确认未知不等于没写 |
| RT3 L-2/L-3：ResponseId 唯一，AssistantMessage＋response 全批原子 | SLJ2-P2/P4；所有结算者使用相同响应判重键；任何键冲突整批不写 | 回复 MessageId 键、response 键与读取键都由写方给；先来的合法结算为准，日志不修正错误 timing |
| RT3 L-4：尝试栅栏／晚到结算 | SLJ2-P3 可排序新 attempt 与旧 fenced 锚点；**late 与 unfenced response 的实际提交排序未闭合（G2-7）** | 带 run 的锚点仍选 fenced、response 结算仍选 unfenced。MR4 S-35／CA2 S-39 要求按实际写入判 late；写方预读后构造 payload 不能保证它。有效 fence 不隔离旧 unfenced 写者，不能据此声称 L-4 全部承接 |
| RT3 L-5：call/dispatch、opened、intent、ended 唯一 | SLJ2-P2；既有 mrr/ 前缀责任及种类域由 runtime 承接 | 使用同一 codec，记录种类必须分开；以同键重交不能取代发送前守卫；首次 durable 事实的 callId 唯一归 runtime |
| RT3 L-6：读尾／归属／无损 | SLJ2-P1/P5；一本日志不混 tenant，读取只能及指定 session | 第一条 tenant 取真实 holdingTenant；已获授权才调用，快照身份和内容均不丢 |
| RT3 L-7：未知 opened 权威恢复 | SLJ2-P6；原 owner 排空与新 owner 重开，见下节 | Q-1/Q-2 隔离普通结算和全部旧参与者；Q-4/S-33 恢复决策不归 provider |
| [runner3 RL-1/RL-2](../../agent-loop/loop-extension-runner/v3-design.md#对存储提供者的要求)：结论先落后算、尝试栅栏 | SLJ2-P3/P4 | 确认后才推进下一件或交效果；取消不撤销已进入提交口的批次 |
| runner3 RL-3/RL-5：每经过每件一次、按锚读取 | SLJ2-P2/P5；runner/ 经过键不透明，全匹配且按位置返回 | codec 包含原契约要求的会话作用域、位置、维度、锚、件及记录类别；ask 轮次从 durable 历史得，不用内存计数 |
| runner3 RL-4：提醒按 MessageId 唯一并读回完整值 | SLJ2-P2/P5；同一本日志所有消息写者共享同一个消息键规则 | 结论内保存消息不等于消息已占号；后续消息提交冲突要读全值并按 runner3 S-19/S-28 处置，不改 id/createdAt 掩盖冲突 |
| runner3 RL-6：ask 可见／可回放 | SLJ2-P4/P5 | provider 只保证 ask 耐久；卡片恰一份由等待原语 owner 承接，本节点不建卡片表 |

SL2 S-9 规定 dedupeKey 不自动是 readKey；需要认回的 ResponseId、MessageId、dispatch 及经过键，写入方须同时给出对应读取键。共享 ID 跨写入方不能加彼此不同的 owner 前缀后宣称唯一；其他种类要分域且元组编码必须无歧义。具体编码尚需在各写方公开构件里固定并共同采用，见 G2-2；本稿不替它们发布新键协议。

### late 的提交组合缺口（AR-B1-1）

[MR4 S-35](../../../../spec/data/model-response/v4/contract.md#s-35-晚到的那一条) 与 [CA2 S-39](../../../../spec/data/call-accounts/v2/contract.md#s-39-晚到的账) 要求以 response **实际写下时**，该次发出所在的 attempt 是否已被取代或 Run 是否已终结，决定 late。SL2 只在 fenced 追加时比较壳上的 attempt；unfenced 追加不做该比较，也不解释 response 载荷。

具体反例：写入方 A 读取 attempt n 仍有效、Run 未终结，构造不带 late 的 response；写入方 B 的 attempt n+1 开始记录先提交；A 再以 unfenced 追加，SL2 合法接受该批，却把实际已晚到的 response 留成“不晚”。Run 终结事实插在预读和 response 追加之间有相同窗口。共同日志能排序两次**写入**，并不能把 A 的先前**读取和 payload 构造**并入提交点；MessageId／ResponseId 判重也不会修正已写错的标记。

这是尚未闭合的消费者组合保证，不是 SL2 不透明三操作自身的新增失败。owner 为 runtime／response／call-accounts 规格与提供者 owner、session-log owner 及主线；在它们明确可评审的承载机制并被采用前，**withRun response 的 late／结算组合保持受阻**。SL2 三操作、无 run 的既有路径和纯传输不因本缺口被阻断，但仍须满足各自原有前提。不得临时添加提交回调、新协议、默认锁或预设 late 值来声称闭合；反例义务保留在 V2-4。

### 对存储提供者的要求清单

本节点仍只使用原设计 F-1～F-8 的本地文件系统要求，不新增数据库或跨表事务。

| 要求 | 契约坐标／原要求 | 在本增量的消费者与限制 |
|---|---|---|
| 唯一属主下整批追加、同会话判定写入串行 | SL2 S-8/S-10/S-13/S-14；F-1/F-6 | RT3 L-2/L-3/L-5 及 L-4 的 fenced 部分、runner RL-1～RL-4；不覆盖 G2-7 的 late 构造窗口。两个实例不得分别以自己的内存锁承接同一本日志 |
| 数据与必要目录元数据同步后才成功确认 | SL2 S-13/S-17；F-2/F-3 | RT3 L-1；原每批刷盘政策保留，承诺前提为本地 Linux 文件系统如实执行同步；未升级为跨 SQL/JSONL 断电原子承诺 |
| 读到的字节稳定且本次返回范围对应捕获尾 | SL2 S-11/S-18/S-19；F-5 | RT3 L-6、runner RL-5；不可用不得伪造空，未确认尾不能当恢复权威尾 |
| 失败可辨、根身份稳定、索引原子替换 | SL2 S-5/S-15/S-22/S-23；F-4/F-7/F-8 | 每次核根；索引缺、半截、落后可重建，内容错但结构正确仍受原 SLJ-11 前提限制 |
| 恢复读取前已无旧文件写者并取得唯一写权 | SL2 S-14/S-21/S-23；F-6；RT3 L-7 | 锁交接晚于在途文件任务和句柄收口；重开按完整行折叠，读得权威尾后才能向 runtime 提供恢复输入 |

SQL 中的派生缓存可以重算，不能与 JSONL 追加合称同一事务。会话归属与 manifest 在 SQL 一侧的断电边界仍按原 SLJ-2；本增量不把 accepted 的已知限制写成闭合。

## unknown opened、排空与权威恢复

正常读仍按原设计捕获当前确认尾。若写错误且截回失败，原实例进入“写入不可信”，读到旧确认尾可能暂时不含盘上已完整写下的 opened；SL2 的 unavailable 本身只表示未确认。**这一空读不得成为 runtime 的“没有 opened”断言。**

恢复责任沿 D-076、runtime3 Q-1～Q-4 与 SL2 S-22/S-23 分配：

1. runtime 持有真实 opened append 任务，在回执未知或取消先结束门等待时先隔离该调用。函数 outcome、AbortSignal 或 Promise.race 完成都不解除追加所有权；零可见内容不证明未提交。普通 response/失败主体/再发均沿 Q-1 保持关闭。
2. 宿主停止旧会话推进，确认可能写 opened、response 的全部旧参与者已实际静止或完成受保护交接；不是只等模型函数，也不是只更换日志 fiber。带 run 时，在允许步骤 5 的权威恢复消费前，还须在**同一本日志**确认新 attempt 的 fence 生效；若旧日志写入不可信，则先完成步骤 3～4 的关闭／重启恢复，再由宿主追加并确认新尝试，不能要求不可写的旧实例先写成功。fence 仅挡 fenced 写，旧 unfenced 结算者仍须静止，也不替代 G2-7 的 late 提交保证。无 run 时同样要求旧承载者静止和独占交接。
3. 日志 owner 按原生命周期关闭准入：拒绝新调用；排队尚未开始的追加 unavailable；正在做的追加与在途读按自身结果跑完；最后关闭文件句柄、释放属主锁。没有超时政策，不因等待很久而假称排空。关闭失败或未能核实实际停止时，恢复前提未满足。
4. 对原 SLJ-9 的“写入不可信”分支，使用**原已定的进程重启恢复路径**，不新增在原活实例上清除标记或逐会话重开 API。重启前旧进程实际退出，或故障演练确认被杀后退出；新 owner 取得同一根的锁，按原“打开一本日志”流程校验根、日志、索引及尾。完整行纳入折叠；半截尾处理后不可见；受损则 unavailable，不跳过坏行。新实例不得继承旧内存判定态或尾。
5. 宿主在既有新尝试／会话重新承载入口完成交接，且带 run 时已在恢复后的日志确认新 attempt fence，runtime 才经 `readByKey`／`readSince` 消费本 call/dispatch 的完整恢复事实与新尾；不同次读取的 tail 不能随意混成一个快照，需要同次全量事实时使用一次读取结果。看不到完整范围或尾仍不可信时保持 unavailable、未结算、零再发。读取确认无 opened 也不是自动重发许可。
6. 后续结算的语义仍沿 runtime3 S-33：耐久中断意图优先；有 opened 时取其原时刻并按原规则终结且不重发；确无 opened 才进入已有无首 token 分支。无耐久意图的系统停止不补意图，恢复 initiator 依原规则为 runtime_lost。**这些规则不使 G2-7 的 withRun late／结算组合成为可实施**；该缺口仍须闭合。provider 不生成 response、补 opened 或保存 runtime 隔离标记。

通常关闭／重开可恢复已丢回执的完整行；本稿不承诺原 SLJ-9 尚未设计的同进程写入不可信恢复。若要避开整个进程重启而给活装配增加其他恢复入口，必须先回到 provider/装配设计，不能在实施时添加第四操作。

### 真实交错与反证义务

| 交错 | 应观察的结果；不能替代它的东西 |
|---|---|
| 回复调用者提交 AssistantMessage＋R，与 runtime 停止结算 R 同时到达 | 同 ResponseId 键只有一批成功；输家整批不写，不能只落助手消息。交换先后各跑一次；删判重或拆两批的负控必须失败 |
| 新 attempt 开始与旧 fenced dispatched／runner 结论竞争 | 新者先提交则旧者 attemptSuperseded 且零 send/零新结论；旧者先则新读方能读旧事实。不以 wall clock 或内存停止位证明 |
| response 写方先读当前 attempt／Run 状态并构造不带 late 的值；新 attempt 或 Run 终结先提交，随后 response unfenced 追加 | 这是 G2-7 的具体反例，当前设计未排除；必须能观察到实际写入点与 late 不符，而不能把 SL2 接收成功判为组合通过。关闭该缺口后的设计须在相同交错下守住实际提交语义；本稿不预定解决机制 |
| 无 run 的旧、新实例竞争同一个 dispatch 序号或 runner 最终结论 | 同一 durable 键只有一个获胜；旧实例锁／缓存不影响重开后判定。日志通过不足以证明输家零 send，须接真实 runtime |
| runner 结论已存完整提醒，另一消息写者在提醒追加前抢占 MessageId | 同值按完整值认回，异值由 runner 回 replayInconsistent；无第二条消息、不换新 id。读源不可用为 unavailable |
| opened 完整提交后 ack 丢失，函数返回零内容 failed | 普通结算隔离；重启读回 opened；response 的 firstTokenAt 与其一致且无第二次发送。去掉隔离的负控应露出 timing 不一致 |
| 门等待取消先返回，旧 append 随后提交 opened | 恢复必须等旧 append／结算写者静止，再看权威尾；若旧确认尾读空即结算，负控应失败。另跑半行恢复分支，不能把它等同完整行已提交 |

## 成对装载与撤除、归装配事项

| 取得的资源／贡献 | owner、可见时点 | 部分失败 | 撤除与保留 |
|---|---|---|---|
| 配置与根目录 | provider；配置通过后准备，完成初始化才 provide | 配置非法启动失败；建目录失败不得发布半服务 | 不删除根目录或历史事实；运行期核根不放松 |
| 根属主锁与强引用句柄 | provider；访问日志之前取得 | 取不到即启动失败；后续初始化失败由本实例清理已取得资源 | 每次取得立即具备清理归属；最后放锁，句柄不能提前被 GC 回收。释放失败不宣称交接成功 |
| 懒打开表、判定态、文件句柄、追加队列、读计数 | provider；每本日志打开完成后供调用 | 单本日志失败仅影响该本；索引处理及常驻上界沿原政策 | 先关准入，再拒未开始项，等在途写读，关句柄，放锁；后端借用者不可提前关闭它 |
| 三操作 service 及单一组合 cleanup | provider fiber；初始化及 cleanup 登记完成后提供 | effect 登记失败由初始化路径自行清理再抛；provide 失败仍清理本次已取资源 | 旧引用也检查关准入；持久条目保留。多个 effect 并发不提供跨资源次序，不能把 dispose resolve 当全部文件任务成功停止的证据 |
| 已开始的 runtime／runner 调用与其追加 Promise | 由各消费者／宿主持有，provider 只拥有实际文件任务 | 取消或日志 unavailable 不丢失原任务所有权 | 宿主停止消费者的推进并等待全部潜在写者；日志不自动取消它们，日志重新 ACTIVE 也不授权旧调用恢复推进 |

上游主张只引既有 basis：配置/插件异常沿 [plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)；required 日志变化触发消费者重跑沿 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)；清理并发且异常仅记录沿 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)。三者版本为 4.0.4 且有 probe；这里不把它们扩张成“在途调用被取消”“所有 disposer 成功”或“必定先放旧锁再跑新体”。原 SLJ-4 与 provide-is-effect-managed 的精确时序仍是**待核对主张**，见 G2-4，未补 probe 前不作为恢复正确性的依据。

本纵线的具体装配 owner 是已由 D-076 采用的 [apps/model-request-acceptance](../../../retired/model-request-acceptance/design.md)，其已有日志锁/句柄生命周期和未知 opened 场景应显式采用本候选后互指。它负责：固定实际数据根与本地文件系统；只装一份 provider；根的 owner 权限及禁止外部改写；入口身份核实；写方获取真实 holdingTenant；真实尝试开始、取消及会话重新承载时机；旧业务参与者静止；日志重启和新锁取得的实际证据；恢复完成后才允许继续场景；受限诊断 sink。时间/发号由 runtime、runner 的装配端口提供，日志不生成这些值。存储升级确认后才开闸，沿原 [cli 前提](../../../apps/cli/design.md#升级确认在第一次受理之前)，验收应用同样必须执行；不增产品 CLI。

### 关键取舍

| 候选选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| 沿原单 provider fiber、三操作，更新消费载荷，不拆模型日志节点 | 专用模型日志节点可在入口强制 MS4/MR4 校验 | 当前方案依赖写读双方守校验；合法 JSON 的非法业务记录会永久保存 | 高；SL2 S-2/S-11 明定这条职责边界，分拆会丢共同提交域 |
| provider 保留严格 JSON 值，消费者采用精确 schema 和纯判定 | 日志直接校验所有 payload 可集中拦错 | 每个接收者仍须做自己的版本校验，迁移必须显式传播 | 高；不以 schema 便利改变 SL2 的失败集合与载荷开放性 |
| 继承属主锁＋队列＋durable 折叠，不改 SQL | SQL 唯一约束和事务能直接表达冲突 | 原索引假设、文件锁、故障恢复与真实并发验证成本仍在 | 高；沿 D-026/D-062，不新选存储；跨 owner 共同对象已存在 |
| L-7 复用既有关闭与重启恢复；不在活实例清除不可信标记 | 增加在线恢复操作能减少停机影响 | 写入不可信时影响同一进程的模型服务，排空无超时；宿主必须承担实际重启 | 中高；符合原 SLJ-9 与 D-076 Q-3，性能和可用性收益不构成自行扩协议理由 |

## 验证义务与覆盖缺口

下列均是**尚未执行的新增组合义务**，承接原 [verification S-26～S-31、V-1～V-13](verification.md#证据义务)。没有任何一项用文件存在、mock 调用次数或有限模型替代真实提供者结果；名称只作本文局部定位，不是已登记测试 ID。

| ID | 实际验收输入、结果与反控 | owner／受阻条款 |
|---|---|---|
| V2-1 | 合法 MS4 dispatched、MR4 response、完整 reminder/LC4 记录均走 append→两读面→close/重启→两读面；比对全部值/壳/位置。配置含大整数、长小数、嵌套数组、明确空对象；MR4 response 的 raw.headers 仅用 string 值，另含合法 usage/cost unknown 与零的差别、opaque/rawArguments。真正 LosslessNumber 与公开入口产生的 OpaqueJson 经交换表示存取后，由消费者的权威入口恢复领域类型再校验；同修订不同 values 不能判相等。此为载荷往返，不代证 withRun late 的实际提交语义 | provider＋runtime/runner；SL2 S-11/S-18/S-19，MS4 S-37/S-49，MR4 S-36，MP3 S-29；G2-7 仍开放 |
| V2-2 | 单独以任意合法 JSON 数组验证 provider 保留元素次序和完整值；它不声称数组合法于 MR4 raw.headers。含数组头值的 MR4 对象、合法 JSON 但非法 MS4、旧 MS3 缺 binding 的记录由 provider 原样读回，精确 data 接收边界拒绝；重复成员及其他非 JSON class／值由 provider invalidInput。调用后修改原对象、读后修改返回值不能改变持久批或未来读取。去掉 lossless 中转的负控应暴露精度损失 | provider＋接收者；SL2 S-11/S-17，MS4 S-39，MR4 S-26/S-27；G2-6 的实际 TransportFailure 持久化另待 owner |
| V2-3 | 真并发回复批与 response 单条竞争；撞任一键全批拒绝；进程在写完整行、datasync、回执之间被杀后以原键认回，位置不变不重复。无新数据时读为空与存储不可读 unavailable 分开 | provider＋runtime；SL2 S-8/S-13/S-14/S-22/S-28，RT3 S-17/S-38 |
| V2-4 | 新 attempt 与旧 dispatched/runner 结论两种顺序；旧 fenced 拒绝、unfenced JSON 条目仍可写，但后者不证明 late 正确。另保留 G2-7 反例：预读有效并构造不带 late → 新 attempt／Run 终结提交 → response unfenced 追加，验收必须能暴露实际提交语义失守，不得报完整 L-4 通过；关闭后的机制须重验同一交错。无 run 双写实例/重启、跨 tenant 拒绝和混租户批 invalidInput 继续独立验；真实运行时输家必须零 HTTP | provider＋runtime/response/call-accounts owner＋装配；SL2 S-10/S-12/S-27/S-29，MR4 S-35、CA2 S-39、RT3 L-4/L-5；withRun late／结算组合受 G2-7 阻断 |
| V2-5 | 读与追加并发，捕获一个真实 tail 上界，返回不越界、不跳号、不半批；按 readKey 精确匹配，不把 dedupeKey 自动当读取键。runner 消息抢号同值／异值／读失败三支均实际执行 | provider＋runner；SL2 S-9/S-18/S-19，runner3 S-19/S-22/S-28 |
| V2-6 | 写半行、完整行 ack 丢、datasync 错、截回错各自注入；保留旧确认尾的分支不得被 runtime 当无 opened。真实子进程退出及同根新锁取得后重开，区分完整／半截／受损；旧清理不能删新事实 | provider＋验收应用；SL2 S-13/S-22/S-23，RT3 L-7 |
| V2-7 | 已提交 opened ack 丢失、取消先完成门而旧 append 晚到：真实 runtime 隔离，旧任务及结算写者实际停止后恢复；有无 durable intent、带 run/无 run、opened 有/无分支逐项核 S-33；无错误 timing、无第二次发送。移除隔离或提前用旧 tail 的负控必须失败 | runtime＋provider＋验收应用；RT3 S-15/S-16/S-17/S-29/S-33/S-51/S-55，SL2 S-14/S-19/S-22/S-23 |
| V2-8 | 关闭时在途批/读实际结束、未开始批拒绝、旧引用拒绝；持锁实例 idle/GC/部分初始化失败、并发第二实例/第二进程、原进程退出后重取。卡住文件任务时不得提前放锁；真实 Cordis 下验证，不只断言 disposer 调用 | provider＋kernel-basis＋装配；SL2 S-21/S-23；原 V-4/V-9 |
| V2-9 | 不安装 Cordis 的外部包消费者调用纯函数/闭包并负责 close；实际 Cordis 装配配置非法 FAILED/服务不可见、依赖更换真实重跑。静态核 provider 仅三服务操作、无事件/注入、无 SQL 业务依赖 | provider；SL2 S-20/S-21，SYS-OPEN；精确时序 G2-4 |
| V2-10 | 真实同一本日志完成 runtime 首内容/响应与 runner 结论/提醒链，记录每批刷盘及首内容门耗时；错误诊断不含合成秘密哨兵/正文。运行输入、输出、源码/配置修订及故障注入点完整归档 | provider＋runtime/runner＋验收应用；无未经确认的性能阈值；SYS-OBSERVABILITY |

| Gap | 条款及实际缺口 | owner／受阻消费者／闭合条件 |
|---|---|---|
| G2-1 | MS4 S-37/S-49、MR4 S-36、RT3 L-1～L-7、runner3 RL 要求：本增量未接受，消费者反向引用仍指旧 design | 主线组织独立 architecture/spec 评审及技术采用；采用后更新本节点 README/verification 与 runtime/runner/验收应用互指，保留冻结正文。当前不据候选解除真实新载荷接线门 |
| G2-2 | SL2 S-2/S-8/S-9/G-5、MS4 S-32、RT3 L-2/L-3/L-5、runner3 RL-3/RL-4：mrr/、runner/ 责任已定，跨写入方共享 MessageId/ResponseId 与元组键的精确编码尚无共同实现证据 | runtime/runner/调用方及主线；固定并共用已决定语义的无歧义 codec，所有写方使用同一 ID 键，补读取键和竞争负例。provider 可独立实施不透明键机制；跨 owner 唯一性验收在此前受阻 |
| G2-3 | SL2 S-22/S-23、RT3 L-7/Q-2/Q-3：没有实际排空、锁交接、权威恢复尾及旧结算写者静止的组合证据 | provider/runtime/宿主与 model-request-acceptance；执行 V2-6～V2-8，关闭失败／旧参与者未停保持恢复不可用。不能用单个 outcome 或 dispose resolve 关闭缺口 |
| G2-4 | 原 SLJ-4/provide-is-effect-managed 精确时序待核对；SL2 S-21/S-23 不能从已有 basis 泛化出全部清理完成 | kernel-basis／provider 实施者；对采用 4.0.4 做 source-check 与会失败的实际 probe；此前只沿明确排空、实际退出与新锁取得，不假定 HMR 自动完成交接 |
| G2-5 | provider 尚未建包，SL2 全部 IO 义务未实证；原 SLJ-2/5/6/7/9/10/11 的跨存储断电、无超时、无分页、本地 FS、重启恢复、无修复工具和索引前提仍在 | 各原 owner 不变；本增量只承担本纵线三操作与新载荷组合，V2-1～V2-10 通过也不证明完整会话产品、任意文件系统或断电无条件保证 |
| G2-6 | MR4 S-20/S-26 及 RawResponse Schema 的 headers map 值只允许 string；TransportFailure 数组属于另一值面，日志的 JSON 数组保真不能填平两者 | runtime／response owner 与主线；明确该事实的持久表示及精确采用后才能接入该响应路径，不由本节点选择拼接、丢头或新增字段。仅阻断此表示转换／持久响应组合，不阻断合法 MR4 往返、SL2 三操作或纯传输 |
| G2-7（AR-B1-1） | MR4 S-35／CA2 S-39 要求 late 按 response 实际写下时判断；SL2 S-10/S-14/S-17 不为 unfenced append 执行 attempt 判定或在提交时构造 payload。先读有效状态、再构造 late、再追加之间可插入新 attempt／Run 终结，已有 L-4 承接描述不足 | runtime／response／call-accounts 规格与提供者 owner、session-log owner、主线；明确并采用保护实际提交点语义的组合设计，执行 V2-4 反例及其修复验证。**只阻断 withRun response 的 late／结算组合**，不阻断 SL2 不透明三操作、无 run 既有路径或纯传输；不在此新增协议、提交回调或锁默认 |

SL2 的不透明三操作可以承载合法 JSON；这不等于 TransportFailure 已有合法 MR4 持久表示，也不等于 withRun late 已与实际追加提交排序，G2-6/G2-7 仍待所属 owner 闭合。新模型 data 的校验若被移入日志、在线恢复若被做成新业务操作，都会越过本稿边界，应返回相应 spec/provider owner，而不是把实现偏好写成 SL2 的新含义。
