# 采用协调契约设计

状态：已采用（Reduce，R1-D34，[#978 评论](https://github.com/nemori-ai/omne-harness-lite/issues/978#issuecomment-6564997466)）。本页是实施输入。[#688](https://github.com/nemori-ai/omne-harness-lite/issues/688) 的 D-SPEC 条件是「公开承诺、包名及采用范围已确认」，本次采用满足它：AC-01 至 AC-17、AC-19、AC-22、AC-23 给出公开承诺，AC-18 给出包名，AC-20 给出采用范围，AC-24 至 AC-26 给出调用方适配。

本页是领域角色「采用协调」的契约设计唯一源。[领域页](README.md#模块角色与事实归属)只定义这个角色。[assembly 规格](../../../packages/assembly/assembly/SPEC.md#adoption)继续拥有求值、发布、入口与失败记录的行为。本页不重述那些行为，只引用它们。

本页的编号 `AC-nn` 也是候选结论编号 DP6-Cnn。同一条规则只在本页定义一次。

采用与迁移：

- 成员 `adoption-contract` 建成时，#688 把 AC-01 至 AC-17、AC-19、AC-22、AC-23 迁入该成员的 SPEC。本页删除这些条款，改为指向成员 SPEC。
- AC-18、AC-20、AC-21 是领域层的分工与 M2 采用范围。AC-24、AC-25、AC-26 是调用方的适配，它们点名 Session、Agent 与 `server-entry`，并依赖 Session 的候选节。这六条迁移后仍留在本页，不进契约成员的 SPEC。
- #688 与应用成员的采用提供者都交付之后，删除第 7 节。

## 1. 问题与范围

本页回答 #978 的 R10：

- 采用协调者校验什么，产出什么，失败时怎样表达。
- 它与 Tool 的 `planAdoption`、Session 的推进协调器 C2、Agent 的 `AgentAdoptions` 怎样分工。
- 租户公平（J43）对契约有什么约束。
- 成员放在哪里，叫什么，怎样进入线归属表。
- M2 内谁采用它，哪些部分需要持久化，以及 #688 是否保留对 [#687](https://github.com/nemori-ai/omne-harness-lite/issues/687) 的开工条件。

本页不回答：

- 契约成员的类型、替身与契约测试。它们归 #688。
- 应用成员的实现。它归 app-access 交付线（[#978](https://github.com/nemori-ai/omne-harness-lite/issues/978)）。
- Tool、Session、Agent 已接受契约的任何改动。
- 新的产品规则。

### 依据与采用状态

| 依据                                                                                      | 位置                                                                                                                                                            | 采用状态                  |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| assembly 规格「采用与重装」的记录、发布、入口、定义到消费者                               | [assembly 规格](../../../packages/assembly/assembly/SPEC.md#adoption)                                                                                           | 已技术接受，现行行为      |
| Session 规格 PM-03、PM-06、PM-09，「初始化来源与提交」，「身份桥、证据桥与 Context 输入」 | [Session 规格「运行契约候选」](../../../packages/session/session-contract/SPEC.md#运行契约候选)                                                                 | 候选，尚未技术接受        |
| `SessionAdoptionSource`、`SessionCommand`                                                 | [Session 端口](../../../packages/session/session-contract/src/ports.ts)                                                                                         | F 上已发布的类型          |
| 服务键 `sessionAdoptionSource`                                                            | [Session 的 Cordis 契约](../../../packages/session/session-cordis-contract/src/cordis.ts) 的 `SessionAdoptionSourceService`                                     | F 上已发布                |
| `AgentAdoptions`                                                                          | [Agent 执行契约](../../../packages/agent/agent-contract/src/execution.ts)                                                                                       | F 上已发布的类型          |
| Tool「采用点判定」与 `known-unavailable`                                                  | [Tool 规格](../../../packages/tool/tool-contract/SPEC.md#采用点判定)                                                                                            | 已接受                    |
| `Adoption`、`DurableEvidence`                                                             | [exchange-refs](../../../packages/common/exchange-refs/src/index.ts)                                                                                            | F 上已发布的类型          |
| `Adoption` 的值由被采用物的发布者解释                                                     | [exchange-refs 规格「所有权、失败与生命周期」](../../../packages/common/exchange-refs/SPEC.md#ownership)                                                        | F 上已发布的成员规格      |
| Session 的创建校验与 reload 的定义身份检查                                                | [初始化校验](../../../packages/session/session-contract/src/initialization-validation.ts)、[命令判定](../../../packages/session/session-contract/src/decide.ts) | F 上已发布的实现          |
| 服务端接入的会话判断次序                                                                  | [公开契约「会话判断次序」](../../../packages/access/public-contract/SPEC.md#会话判断次序)                                                                       | F 上的公开契约规格        |
| `Access`、`TenantId`                                                                      | [legal-identity](../../../packages/common/legal-identity/src/index.ts)                                                                                          | F 上已发布的类型          |
| 定义名映射、内容身份、采用点冻结判定                                                      | [应用装配页「桥接责任」](../../architecture/runtime/application-assembly.md#桥接责任)                                                                           | #677 的装配设计，尚未实现 |
| 跨租户访问默认拒绝                                                                        | [项目要求 SYS-TENANT](../../requirements.md#从第一天支持隔离sys-tenant)                                                                                         | 项目要求                  |
| J21（采用协调契约）、J43（按租户分串行区）                                                | [决定台账](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6357861225)，以 #688 卡上的引文为准                                           | 已决定                    |

依赖候选状态的条款：AC-02、AC-07、AC-16、AC-20、AC-24、AC-25、AC-26。Session 的候选节改变时，这些条款随之复核。

## 2. 候选结论

### 责任界线

**AC-01** 采用协调契约只回答一个问题：对同一次使用，在调用的这一刻，哪个精确的定义与能力选择是合法的，它凭什么合法，之后怎样原样读回。依据：[领域页](README.md#模块角色与事实归属)的「采用协调」行，assembly 规格「记录」一节。

契约不拥有这些事：

- 来源层序、版本选择与锁定，归 assembly 规格的「发布」一节与资产成员。
- 主体资格，归 identity 与 authorization。
- attempt、claim、resume 与取消排序，归 Session。
- 执行接续的交接证明，归 Agent。
- 常驻 Tool 的冻结判定，归 Tool。
- 一组租约的关闭，归 assembly 的关闭协议。

### 公开操作

**AC-02** 契约有三个操作：`prepare`、`validate`、`read`。契约没有第四个操作。契约没有写 Session 或 Agent 状态的操作，也没有 `close`、`release` 或 `commit`。依据：Session 规格 [PM-03](../../../packages/session/session-contract/SPEC.md#pm-03)（本阶段不写 Session 条目）与 assembly 规格「入口」（候选失败不调用旧实例的 `close`）。

**AC-03** 三个操作的输入如下：

- `prepare` 与 `validate` 带 `Access<P>`，即主体与行事租户。主体只用于资格判断（AC-10）。
- `read` 带行事租户（`TenantId`）与一个精确 `Adoption`，不带主体。`read` 不判断主体资格，因为它只读回已记下的内容，不授予任何资格（AC-15）。
- `prepare` 的请求只含五项：定义身份（类别 AgentDefinition 加 name）、必需能力身份、范围（工作区或空）、入口（`create`、`new-run`、`reload`）、当前采用（`Adoption` 或空）。能力身份是类别加 name，类型里没有 version 字段。
- 请求带 version 或未知字段时，`prepare` 在求值之前答 `malformed`，不形成求值记录。

依据：assembly 规格「记录」，`Access` 取自 legal-identity。

**AC-04** `prepare` 有两种答案：候选，或求值记录。

- 合法定义与必要绑定齐备时，`prepare` 答候选。某项能力的实现暂不可用时，候选仍成立，该能力身份列入候选的 `knownUnavailable`。这个词与 Tool 规格的 `known-unavailable` 同义。
- 其余情形答求值记录。求值记录有四种：缺合法定义、候选被拒绝、来源未知、无类别拥有者。
- 候选被拒绝：合法定义存在，但类别拥有者对候选的判断拒绝它，例如 Agent 的 `judgeAgentDefinition`（assembly 规格「验证」）。
- 发布前胜出者与所选候选项不一致时，答来源未知。依据：assembly 规格「定义到消费者」的选择漂移走查把这种情形算作收集不完整。
- 求值记录有四项：种类、身份、原因、旧采用是否保持。输入的当前采用非空时填「保持」，否则填「不适用」。

依据：assembly 规格「记录」一节的失败记录表。

这是对该表的解释，不是修订，assembly 规格不改。该表五行中，「实现暂不可用」一行的结果是形成采用依据，表内写明它不是装配失败。契约把这一行表达为候选里的 `knownUnavailable`。表中其余四行是求值记录。所以表里的五种种类，在契约里是四种求值记录加一个候选字段。

**AC-05** 一次收集在重试后仍有来源变化，或能力、设置、权限任一路不完整，`prepare` 答「来源未知」，原因列出不完整的路。这时不发布候选，不缓存结果，不替换上一份完整目录。重试一次与整份发布的规则归 assembly 规格「发布」一节，本契约不重述。

**AC-06** 候选含六项：

- `ref`：精确的 `Adoption`。四个字段的取值：
  - `owner` 是 `@omne-harness/adoption-contract`。该成员定义清单的规范编码与摘要函数。
  - `name` 是 `manifest.definition` 的定义名。
  - `revision` 是摘要编码的版本，本页定为 `1`。编码改变时加一。
  - `digest` 的覆盖范围见 AC-10。
  - 这些取值是 exchange-refs 规格允许的发布者解释：`Adoption` 的值由被采用物的发布者解释（[exchange-refs 规格](../../../packages/common/exchange-refs/SPEC.md#ownership)）。`ref` 的发布者是 `adoption-contract`，所以 `revision` 是编码版本，不是清单内容的版本。同名而内容不同的两份清单，只有 `digest` 不同。
  - 消费者比较两个 `ref` 时，四个字段一起比较。只比较 `owner`、`name`、`revision` 的消费者，会把同名而内容不同的清单当成同一份。
- `manifest`：本次采用的内容，字段见下表。
- `knownUnavailable`：实现暂不可用的能力身份列表，可以为空。
- `basis`：本次收集读到的各路来源修订与收集修订号。
- `eligibility`：指向本次资格依据的 `DurableEvidence`。
- `basedOn`：`prepare` 时输入的当前采用。

`manifest` 有六个字段：

| 字段            | 内容                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `definition`    | 定义名与定义的精确版本（`Adoption`）                                                                                             |
| `execution`     | 执行类型的精确采用                                                                                                               |
| `entryContract` | 入口契约的精确采用                                                                                                               |
| `capabilities`  | 必需能力的有序列表。每项是能力身份与精确版本。版本为 `null` 时，本清单不固定该能力的版本，由能力拥有者在采用点决定（KL-9，偏离） |
| `extensions`    | 定义声明的扩展顺序                                                                                                               |
| `conditions`    | 适用的执行条件                                                                                                                   |

`manifest` 不含主体、范围、入口、当前采用与 `knownUnavailable`。这些项随每次调用或每个时刻变化，内容却不变。它们进入清单，会让同一内容得到不同的 `ref`（AC-12）。`manifest` 也不含活体句柄、推进权、Tool 冻结判定与常驻登记键。依据：assembly 规格「记录」（清单不是可持久化的活体句柄），[Tool 采用点判定](../../../packages/tool/tool-contract/SPEC.md#采用点判定)。

**AC-07** 候选与 `ref` 都没有推进效力。`prepare` 成功不等于已采用。Session 提交 `ref` 之后，该清单才是本次执行的采用依据。依据：Session 规格 [PM-06](../../../packages/session/session-contract/SPEC.md#pm-06)。

采用依据由两部分组成：

- Session 提交的采用事实：`ref`（它进入 Session 的哪些字段，见 AC-24），以及 Session 自己记下的租户、会话、工作区与操作身份。主体由 Session 身份桥的材料绑定。常驻登记键由 Tool 的采用点判定产生，随 Session 的采用材料保存。
- `read(ref)` 返回的 `manifest`。

这是对 assembly 规格「记录」与「定义到消费者」的解释，不是修订，assembly 规格不改。那两节说固定的请求输入记下主体、行事租户和范围。本契约中，这些输入由 Session 的事实记下，清单不重复它们。

**AC-08** `validate` 有两种核验，调用方在输入里选一种：

- 候选核验：输入是一份候选的 `ref`、`basis`、`basedOn`，与 Session 现在的当前采用。
- 已采用核验：输入是 Session 现在的当前采用 `ref`。

`validate` 重读各路来源，并按调用者的 `Access` 复核资格。它不复用 `prepare` 时的主体，因为候选与 `ref` 都不记主体。调用者没有资格时答 `denied`（AC-11）。资格成立时，`validate` 答 `valid` 或 `stale`。`stale` 带原因列表。原因分两类：

| 原因              | 类       | 成立条件                                                                             | 适用的核验 |
| ----------------- | -------- | ------------------------------------------------------------------------------------ | ---------- |
| `revoked`         | 已不合法 | `manifest` 中某个精确版本现在不合法，例如被撤权或被锁定排除（assembly 规格「记录」） | 两种都适用 |
| `source-changed`  | 有更新   | 现在的来源修订与候选的 `basis` 不同                                                  | 只候选核验 |
| `current-changed` | 有更新   | 候选的 `basedOn` 与现在的当前采用不同                                                | 只候选核验 |

没有原因成立时答 `valid`。所以已采用核验只在 `manifest` 中某个精确版本不合法时答 `stale`。胜出者的变化归入 `source-changed`，因为胜出者由来源求出。

两类原因的含义：

- 含 `revoked`：被核验的内容已不合法。
- 只含「有更新」类原因：被核验的候选仍合法，但它所依据的来源或当前采用已经变了。候选已过时。

已采用核验不产生「有更新」类原因。所以发布新版本不使在途执行停下。新选择留到下一次入口：新 Run 或显式 reload。依据：assembly 规格「记录」（同一次执行从采用依据读取已记下的正文）与「入口」（正在运行的组合保持不变）。

`validate` 不写任何状态。

**AC-09** `read` 的输入是行事租户与一个精确 `Adoption`。`read` 只返回 `manifest`。它的结果只由输入决定，与来源的当前状态无关。`read` 不读 `basis` 所记的来源，不重新求值，不选新版本。同一 `ref` 多次 `read` 得到相同内容。依据：assembly 规格「记录」（同一次执行从采用依据读取已记下的正文）。

`read` 不返回 `basis`。候选核验所需的 `basis` 取自候选本身。已采用核验不需要 `basis`。复现型提供者怎样满足本条，见 AC-13。

### 租户边界与失败

**AC-10** `ref.digest` 是行事租户与整份 `manifest` 的规范编码的摘要。两类提供者的覆盖范围相同：

- 存储型：`ref.digest` 覆盖它保存的 `manifest` 的全部六个字段，加行事租户。
- 复现型：`ref.digest` 覆盖由映射条目得到的 `manifest` 的全部六个字段（AC-13），加行事租户。

两类提供者都调用 `adoption-contract` 导出的同一个摘要函数，不各自实现。算法与规范编码归成员 SPEC。

所以 `ref` 只由行事租户与 `manifest` 决定。同一租户的同一内容得到同一个 `ref`。同一内容在两个租户得到两个不同的 `ref`。主体、入口与当前采用都不影响 `ref`。

`ref.digest` 不是应用装配页 `agent-adoptions` 行所说的「内容身份」。内容身份标识整份解析表，与租户无关。`ref.digest` 标识一个租户的一份清单。两者不互相代替。

另一租户的 `ref` 与未铸出的 `ref`，在 `validate` 与 `read` 里得到同一个答案：`unavailable`，`owner` 为 `provider`。两种情形的答案逐字段相同，不带诊断文本。所以答案不披露该 `ref` 是否存在。

`denied` 只用于主体对该租户没有资格，只由 `prepare` 与 `validate` 返回。资格读口不可答时答 `unavailable`，`owner` 为 `eligibility`，不改写成 `denied`。依据：[项目要求 SYS-TENANT](../../requirements.md#从第一天支持隔离sys-tenant)（跨租户访问默认拒绝），[#978](https://github.com/nemori-ai/omne-harness-lite/issues/978) 线包整线验收第 4 条（不确定时答 `unavailable`）。

**AC-11** 失败分两类，两类不混用：

- 操作失败：问题没有得到回答。种类只有 `denied`、`malformed`、`unavailable`。
- 求值记录：问题得到了回答，答案是「不行」。它是 `prepare` 的答案，见 AC-04。

`unavailable` 只有一个字段 `owner`，取值是 `provider`、`source`、`eligibility` 三者之一。`prepare` 或 `validate` 被取消后答 `unavailable`，`owner` 为 `provider`，不抛出异常。`read` 不带取消信号，也没有时限（AC-17）。

各操作的全部结果：

| 操作       | 回答                       | 操作失败                                                                                                                                                                                                        |
| ---------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare`  | 候选，或四种求值记录之一   | `denied`：主体无资格。`malformed`：请求带 version 或未知字段。`unavailable`：资格读口不可答（`eligibility`），超限、超时或已取消（`provider`）                                                                  |
| `validate` | `valid`，或 `stale` 加原因 | `denied`：调用者无资格。`malformed`：输入不是两种核验之一。`unavailable`：另一租户或未铸出的 `ref`（`provider`），重读来源不完整（`source`），资格读口不可答（`eligibility`），超限、超时或已取消（`provider`） |
| `read`     | `manifest`                 | `malformed`：`ref` 的编码非法。`unavailable`：另一租户、未铸出或不可复现的 `ref`（都是 `provider`）                                                                                                             |

### 耐久

**AC-12** 提供者在 `prepare` 返回候选之前，必须使 `read(ref)` 对同一租户可答。`ref` 一旦出现，`read` 就可答。清单按摘要内容寻址，不可变。同一租户的同一内容重复准备得到同一个 `ref`（AC-10）。Session 提交 `ref` 之后，`read` 对该租户继续可答，不依赖来源的当前状态。这条保证的界是记录保留。M2 不回收（AC-14），所以 M2 里没有上界。两类提供者的差别见 AC-13。

**AC-13** 契约允许两类提供者。AC-12 的保证对存储型无条件成立，对复现型带前提。

存储型：提供者持久保存清单。AC-12 无条件成立。

复现型：提供者从发行数据复现清单。M2 的首条路径是复现型，见 AC-20。`manifest` 的每个字段都由一个映射条目决定，来源见下表。映射条目的字段以[应用装配页「桥接责任」](../../architecture/runtime/application-assembly.md#桥接责任)的定义名映射行为准。

| `manifest` 字段 | 复现型的来源                                                                    |
| --------------- | ------------------------------------------------------------------------------- |
| `definition`    | 映射的定义名，与条目的定义候选                                                  |
| `execution`     | 条目中执行类型的采用                                                            |
| `entryContract` | 条目中入口契约的采用                                                            |
| `capabilities`  | 条目的 `requiredIdentities`，每项的版本为 `null`                                |
| `extensions`    | 条目的定义候选所指的定义正文声明的扩展顺序。`agentAdoptions` 的投影已依赖该正文 |
| `conditions`    | 条目的 `modes` 默认值                                                           |

复现型的 `basis` 是映射表的内容身份。

复现型的 `read` 读的是进程启动时只解析一次的只读映射表（装配页「桥接责任」）。该表在进程内不变，所以 `read` 的结果只由输入决定，满足 AC-09。`read` 对每个条目求出 `manifest`，用调用者的租户求摘要。摘要与 `ref.digest` 相等时才答。没有相等的条目时答 `unavailable`（AC-10）。

AC-12 对复现型的前提是：发行数据保留该条目，以及该条目的定义候选所指的定义正文。前提不成立时，`read` 答 `unavailable`，不求值替代（KL-3）。

发行数据是受信的发行层数据，所以复现型的已采用核验不答 `revoked`。条目不在时，`validate` 答 `unavailable`，`owner` 为 `provider`。

契约不规定存储方式，不导入存储契约。依据：assembly 规格「发布」（不把某种数据库写成产品要求）。

**AC-14** M2 不回收清单。清单按摘要去重，数量随不同采用增长，不随会话数增长。回收需要读 Session 的引用，留给后继（KL-2）。

### 提交边界与缓存

**AC-15** 采用不授予任何动作资格。撤权由各动作的拥有者在动作边界再核。因此，`validate` 之后到 Session 提交之前来源或资格再变化，只造成一份「已采用但已过时」的依据，不造成越权。下一次新 Run 或显式 reload 重新 `prepare`，比较新 `ref` 与当前采用，不同时才重新采用。这个窗口是已知限制 KL-1。依据：assembly 规格「记录」（层值固定的版本不豁免合法性、资格、锁定或撤权），Tool 契约的授权消费点再核。

**AC-16** `prepare` 可以缓存候选。契约不要求缓存。缓存时遵守下面的规则：

- 缓存键是整份 `prepare` 输入（主体、行事租户与请求的五项）加 `basis`。
- 查缓存之前，提供者先读各路来源的当前修订，并复核资格。
- 来源修订与键中的 `basis` 不同，或资格不成立，都不命中。

命中时，候选中随时刻变化的两项重新取得，不复用缓存里的旧值：

- `eligibility` 用本次复核取得的资格证据。
- `knownUnavailable` 用本次读到的可用性（AC-06 把它排除在清单之外，理由相同）。

候选的其余各项取自缓存。命中是否正确，靠查缓存之前的重读与复核，不靠键的粒度。缓存省下的是合并与选胜出者，不省来源修订的读取与资格复核。缓存的候选不是采用依据，进入新 Run 或 reload 时必须再经 `validate`。

Session 规格「身份桥、证据桥与 Context 输入」说已校验候选「按采用变更计数」缓存。本页的键含当前采用，不含计数。采用经过 A→B→A 之后，本页的键回到原值，按计数的键却不同。所以本页的键比按计数的键粗。命中仍然正确，理由见上一段。R1-D34 采用本页的键，并把它与 Session 规格的说法记为已知分歧，见第 6 节 R-3。

`prepare` 返回的 `ref` 等于输入的当前采用时，内容没有变化。契约不跳过任何步骤。调用方照常提交，Session 按 PM-06 不写 SE08，仍可以写新 attempt。新 Run 入口按 assembly 规格「入口」保持当前组合。

### 租户公平

**AC-17** 提供者按租户分串行区（[J43](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6357861225)）。契约对它有三条约束：

1. 串行区的键是租户，不是会话、主体或全局。
2. 一个租户的来源读取挂起，不阻塞另一个租户的 `prepare` 与 `validate` 在时限内完成。时限是提供者声明的单次调用时限。
3. `prepare` 与 `validate` 的输入带 `AbortSignal`。取消后，排队中的调用不执行，执行中的调用不缓存结果。

`read` 按精确 `ref` 读不可变清单，不进串行区。`read` 不带取消信号，也没有时限。`prepare` 与 `validate` 超过时限或超过队列容量时答 `unavailable`，`owner` 为 `provider`。队列容量、租户间调度算法与时限的取值归提供者规格（KL-4）。符合性套件从被测提供者取时限作参数。内存替身的时限由成员 SPEC 定。

### 位置与采用范围

**AC-18** 新成员位于 `packages/assembly/adoption-contract`，包名 `@omne-harness/adoption-contract`。成员含纯类型、校验、摘要函数、Cordis 服务定义、内存替身与符合性套件，结构沿 `sql-contract`：入口 `.`、`./cordis`、`./testing`。它依赖 `exchange-refs`、`legal-identity`、`operation-result`、`json-text` 与 Cordis。它不依赖 `assembly`、Session、Agent、Tool 的任何成员，也不被它们依赖。只有应用成员与具名提供者导入它。依据：[线归属表](../../engineering/delivery-lines.json)已预登记 `packages/assembly/adoption-contract`，[产品包组织](../../package-organization.md)规定业务成员不读取 `assembly` 取得全局服务。

**AC-19** 契约只有一个 Cordis 服务键 `adoptionCoordinator`，由 `adoption-contract` 的 `./cordis` 定义。`sessionAdoptionSource` 与 `agentAdoptions` 仍由 Session 与 Agent 的 Cordis 契约拥有。它们是消费口，不是第二个来源。同一来源只保留一个键拥有位置。依据：Session 的 Cordis 契约用 `SessionAdoptionSourceService` 定义 `sessionAdoptionSource`。Session 端口把采用、生产、保管三个证据桥消费口标为 XC-ADOPTSRC，三者的键都由 Session 的 Cordis 契约定义。

**AC-20** M2 的采用范围如下：

- 第一个提供者是复现型。清单来自与 `definitionMappings` 同一份只读表，字段来源见 AC-13。`ref` 按 AC-10 计算，不是该表的内容身份。
- `server-entry` 是 `create` 路径的消费者。它在 `create` 时以调用者的 `Access` 调 `prepare`，把 `ref` 交给 Session（AC-24）。它仍注入 `definitionMappings`，判定定义名是否在映射内。
- `agentAdoptions` 是消费者，经 `read` 为 `resolve` 取原清单。
- `sessionAdoptionSource` 是消费者。`create` 经 `read` 取 `server-entry` 交来的 `ref` 的清单。`startRun`、`reload` 经 `prepare` 与候选核验取材料。`reload` 候选失败时，经已采用核验判断原采用是否仍合法（PM-09）。`completeInitialization` 经 `read` 读回原采用。`change` 与 `freeze` 不需要新求值，不调用契约。这条路径的 `prepare` 与 `validate` 要等 R-1 的 Session 改动交付（第 6 节 R-1，AC-24）。
- `session-conditions`（session-adapters 的 J06 插件，提供 `agentConditions`）是 `read` 的第三个消费者。它用 run 的采用 `ref` 调 `read` 读已采用配置。清单格式由本契约解释，Session 不解释证据里的 `capabilities`（第 6 节 R-2）。
- `server-entry`、`agent-adoptions` 与 `sessionAdoptionSource` 三个消费者在同一波一起从定义名映射换到本契约，换之前都沿用定义名映射（KL-10）。
- 适配器由应用成员持有。适配器在采用点调用 Tool 的 `planAdoption`，把结果写进 Session 的材料。契约不调用它。
- 首条路径的 `modes` 默认值来自映射条目，进入清单的 `conditions`。
- 多层资产来源进入契约不属于 M2。

**AC-21** 契约成员不依赖存储契约。存储型提供者建立时，才依赖存储契约。所以 #688 的交付不以 #687 为前提。依据：AC-12、AC-13 只规定性质，不规定存储。

### 跨进程后的保证

**AC-22** 本页的保证分两类。

- 协议给的保证：AC-02 至 AC-11、AC-12 与 AC-13 的存储型、AC-15。提供者拆到另一个进程或起多个实例后，这些保证仍成立。
- 单进程装配给的保证：AC-16 的缓存、AC-17 的串行区、AC-13 复现型的前提。多实例时它们失效或需要重新定义。缓存在实例间可以不一致。串行区每进程一份，租户间公平不再是全局的。复现型要求每个实例读到同一份发行数据。

串行区只保护租户间公平，不保护数据正确性。清单按内容寻址且不可变，并发写同一摘要得到同一内容。所以串行区失效时，丢的是公平，不是正确性。

### 验证义务

**AC-23** 内存替身须支持：脚本化来源变化、挂起的来源、跨租户 `ref`、对 `read` 的来源读取计数。符合性套件对内存替身运行，至少覆盖下面的用例。具名提供者也运行该套件。它无法构造某个用例的前提时（例如复现型的 `revoked`），在自己的规格里写明跳过的用例与理由。

| 条款         | 用例                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------- |
| AC-03        | 请求带 version 时答 `malformed`，没有求值记录，没有清单写入                                     |
| AC-04        | 缺定义时答求值记录。只有远端 Tool 不可用时答候选，该身份在 `knownUnavailable` 里                |
| AC-05        | 某一路来源不完整时答「来源未知」，缓存不变                                                      |
| AC-08        | 撤掉清单中的一个版本后，两种核验都答 `stale`（含 `revoked`）                                    |
| AC-08        | 来源变化后，候选核验答 `source-changed`。当前采用变化后，候选核验答 `current-changed`           |
| AC-08        | 发布新胜出者后，已采用核验答 `valid`                                                            |
| AC-09、AC-12 | 发布新胜出者后，`read(旧 ref)` 内容不变。内存替身的来源读取计数为 0                             |
| AC-10        | 同一租户的同一内容两次准备得到同一个 `ref`。同一内容在两个租户得到不同的 `ref`                  |
| AC-10        | 租户 B 用租户 A 的 `ref` 调 `validate` 与 `read`，答案与未铸出 `ref` 的答案逐字段相同，没有写入 |
| AC-17        | 租户 A 的来源挂起时，租户 B 的 `prepare` 在时限内完成。取消后答 `unavailable`，结果不进缓存     |

下面的证据不归符合性套件：

- 复现型在进程重启后 `read` 仍可答，归应用成员的提供者测试。存储型的崩溃用例随该提供者。内存替身不证明耐久。
- 收集中重试一次，归 assembly 规格的测试。
- attempt、接续、取消排序与冻结判定，归 Session、Agent、Tool 各自的套件。契约没有推进操作。

### 调用方适配

AC-24 至 AC-26 留在本页，不迁入契约成员的 SPEC。

**AC-24** `ref` 由 Session 的调用方取得。Session 契约不改。`ref` 按下面的路径进入 Session：

- `create`：`server-entry` 以调用者的 `Access` 调 `prepare`，把候选的 `ref` 作为 `creation.definition.candidate` 交给 Session。Session 的创建校验要求 `initialAdoption.candidate` 与 `adopted` 都等于这个值（[初始化校验](../../../packages/session/session-contract/src/initialization-validation.ts)）。所以 `initialAdoption.candidate`、`initialAdoption.adopted` 与之后的 `run.adoption` 都是 `ref`。`completeInitialization` 用原采用调 `read`，Agent 的 `resolve` 用 `run.adoption` 调 `read`，两者都能答。
- `create` 上的 `adoption-sources` 适配器只经 `read` 取该 `ref` 的清单，形成初始化材料。它不调用 `prepare` 与 `validate`。
- `startRun`、`reload`：候选由 `adoption-sources` 适配器经 `prepare` 铸出 `ref`。这条路径的主体由 R-1 给出：Session 给 `SessionAdoptionSource.prepare` 加 `SessionAccess`，适配器按真实调用者复核资格（第 6 节 R-1）。F 上 `SessionAdoptionSource.prepare` 只收一个命令，命令的输入不带主体。这项 Session 改动交付之前，适配器不得自选主体，也不在这条路径上调用 `prepare` 与 `validate`。所以这条路径上不出现 `denied`。
- `ref.name` 是定义名（AC-06）。所以 reload 交上的 `ref` 与已采用的 `ref` 名字相同，满足 Session 对 reload「保持定义身份」的检查（[命令判定](../../../packages/session/session-contract/src/decide.ts)）。
- `read` 不需要主体，不受 R-1 限制。

`server-entry` 把 `prepare` 的答案映射到公开结果的规则，归 `server-entry` 的规格，对照[会话判断次序](../../../packages/access/public-contract/SPEC.md#会话判断次序)核对。本页不定。

本条的证据归应用成员的提供者测试，在换件的那一波：经 `server-entry` 建一个会话，Session 的 `definition.adopted` 与 `run.adoption` 都等于 `prepare` 给出的 `ref`，`agentAdoptions.resolve` 经 `read` 答出清单。负控：`server-entry` 改交映射里的定义候选时，`create` 上的 `read` 答 `unavailable`，会话没有建成。

**AC-25** Session 路径的适配器按 `validate` 原因的类处理（AC-08）：

- 含 `revoked`：已采用核验得到它时，Session 按 [PM-09](../../../packages/session/session-contract/SPEC.md#pm-09) 的「原采用自身已经不合法」处理。
- 只含「有更新」类原因：适配器按 AC-26 重新准备一次。

**AC-26** 适配器按下表把契约答案映射到消费者的失败词汇。映射由应用成员的适配器对照 Session 与 Agent 各自规格核对。冲突时停下，不改它们的契约。

| 契约答案                                       | Session 证据桥                                                         | Agent `resolve` |
| ---------------------------------------------- | ---------------------------------------------------------------------- | --------------- |
| `denied`                                       | `denied`。R-1 裁定之前不出现（AC-24）                                  | 不适用          |
| `malformed`                                    | `invalid`                                                              | `invalid`       |
| `unavailable`                                  | `unavailable`                                                          | `unavailable`   |
| 求值记录：缺合法定义、候选被拒绝、无类别拥有者 | `invalid`（候选）                                                      | 不适用          |
| 求值记录：来源未知                             | `unavailable`                                                          | 不适用          |
| 候选核验答 `stale`                             | 重新 `prepare` 并核验一次。再答 `stale` 时答 `unavailable`，旧采用保持 | 不适用          |
| 已采用核验答 `stale`（含 `revoked`）           | 按 PM-09 的「原采用自身已经不合法」处理                                | 不适用          |
| 已采用核验答 `valid`                           | 原采用继续有效                                                         | 不适用          |

「重新准备一次」只用于 `startRun` 与 `reload`。上界是一次。第二次仍过时说明来源在持续变化，与「来源未知」同类，所以答 `unavailable`。`create` 的候选由 `server-entry` 准备，适配器在 `create` 上不做候选核验（AC-24）。

## 3. 形状

下面是语义字段，不是可导入的 TypeScript。#688 从真实公开类型复用 `Adoption`、`DurableEvidence`、`Access`、`TenantId`，不复制它们。

| 名字                     | 字段与说明                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `AdoptionRequest`        | `definition`（类别加 name）、`capabilities`（身份列表）、`scope`、`intent`、`current`            |
| `AdoptionManifest`       | `definition`、`execution`、`entryContract`、`capabilities`、`extensions`、`conditions`，见 AC-06 |
| `AdoptionCandidate`      | `ref`、`manifest`、`knownUnavailable`、`basis`、`eligibility`、`basedOn`，见 AC-06               |
| `AdoptionRecord`         | `kind`（四种）、`identity`、`reason`、`previous`                                                 |
| `AdoptionCheckInput`     | `candidate`（`ref`、`basis`、`basedOn`、`current`），或 `adopted`（`ref`）                       |
| `AdoptionCheck`          | `valid`，或 `stale` 加原因列表（`revoked`、`source-changed`、`current-changed`）                 |
| `AdoptionCoordinator<P>` | `prepare(access, request, signal)`、`validate(access, input, signal)`、`read(tenant, ref)`       |
| 操作失败                 | `denied`、`malformed`、`unavailable`（带 `owner`：`provider`、`source`、`eligibility`）          |
| 摘要函数                 | 输入行事租户与 `AdoptionManifest`，输出 `ref.digest`，见 AC-10                                   |

登记点：

- 成员目录：`packages/assembly/adoption-contract`，含 `SPEC.md`、双语 README、`documentation.json`、`api/`。
- 线归属表：`contracts` 增加该目录。
- 产品包组织：「装配组有两个目标成员」改为三个，并登记该成员。
- Cordis 键：`adoptionCoordinator`，进入装配页的服务键清单。

后三项属于公共登记文件，由 Reduce 写。

与相邻契约的分工：

| 相邻契约               | 本契约提供                                             | 本契约不做                                                        |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Session 推进协调器 C2  | 候选与有效性材料，经适配器进入 `sessionAdoptionSource` | 不分配 attempt，不提交 `startRun`、`reload`、`freeze`，不生成接续 |
| Agent `AgentAdoptions` | `read` 给 `resolve` 取原清单                           | 不实现 `handover`，不核对当前胜出者                               |
| Tool `planAdoption`    | 每项 Tool 能力的合法胜出者，作为判定输入               | 不调用它，不携带判定与常驻登记键                                  |

## 4. 备选与取舍

- 继续扩大发行映射。放弃。映射不能表达来源变化、当前资格与稳定的采用记录。M2 仍用它做第一个提供者的数据。
- 把全部流程放进 Session。放弃。Session 会同时解释资产与执行恢复。
- 把契约放进 `assembly` 成员。放弃。`assembly` 是已有运行成员，业务成员不读取它取得服务。契约放进去会让适配器依赖关闭协议。
- 清单与 Session 引用同事务提交。放弃。来源在事务域之外，事务不能覆盖它们。它还把 #688 绑到 #687。AC-12 的「先写后引用」加内容寻址达到同样的性质，不需要共同事务域。
- 清单只存在 Session 的 SE08 里。放弃作唯一副本。Agent 没有读 Session 日志的路径。SE08 里的 `capabilities` 保留为次要证据，契约不依赖它。
- 可用标记放进清单。放弃。可用性随时刻变化。放进清单会让同一内容得到不同的 `ref`，使 Session 在可用性抖动时换代。Tool 在每次调用前按 R3 处理不可用的常驻工具。
- 入口与当前采用放进清单。放弃。新 `ref` 会覆盖旧 `ref`，永远不等于当前采用。于是 PM-06 的「不写 SE08」分支不会出现，assembly 规格「入口」的「未变化则保持」也无法用 `ref` 判断。
- `validate` 复用 `prepare` 时的主体。放弃。候选与 `ref` 都不记主体。复核的对象应是将要提交的调用者。

## 5. 已知限制与剩余

- KL-1：`validate` 到 Session 提交之间有时间窗口。F 上 `SessionAdoptionSource` 只有 `prepare`，没有提交边界回调 `validate` 的端口。依据 AC-15，窗口内的变化不越权。`create` 上也有同样的窗口：`server-entry` 的 `prepare` 到 Session 提交之间，适配器只 `read`，不 `validate`（AC-24）。Session 的 `create` 要求在提交边界证明材料仍有效，并要求 `source` 与 `boundary` 证据。本契约只给 `basis` 与 `eligibility`。适配器怎样构成这两项证据，由它对照 Session 规格核对，不足时停下交 Session 的拥有者。若 Session 的拥有者要求同提交核验，另立新增契约改动。
- KL-2：M2 不回收清单。
- KL-3：发行数据改动并丢掉旧条目后，复现型对旧 `ref` 的 `read` 答 `unavailable`，这是 AC-13 的前提不成立。发行数据改动时保留旧条目的义务，归应用成员的采用提供者与发行数据的拥有者，不在本契约内。不保留时，旧会话须重新采用。
- KL-4：公平参数、调度算法与时限的取值留给提供者规格。
- KL-5：契约不使用同值 reload 的跳过路径。[重装与不重装的情形](../../architecture/runtime/assembly-and-change.md#重装与不重装的情形)与「比对代替求值」仍是候选，本页不依赖它们。
- KL-6：`session-conditions` 经 `read` 读已采用配置（R-2）。字段由清单的 `conditions` 承载，契约只保证它可读。哪些字段进入 Agent 的当前条件，由 `session-conditions` 对照 Agent 契约确定。
- KL-7：多层资产来源与跨进程提供者不在 M2。跨进程后哪些保证失效，见 AC-22。
- KL-8：初始化接续时新增能力的采用不在 M2。Session 规格允许该分支，契约没有对应入口，`prepare` 的三个入口不借用它。M2 的接续只读回原采用。
- KL-9：M2 的复现型清单不固定能力的版本，`capabilities` 每项的版本为 `null`。Tool 能力的胜出者由适配器在采用点经 `planAdoption` 决定，写进 Session 的材料。非 Tool 能力（例如 Skill）的版本，M2 不记录。这是对 [assembly 规格「定义到消费者」](../../../packages/assembly/assembly/SPEC.md#definition-to-consumer)的偏离：该节写明依赖的身份和版本记在装配清单里，装配清单记下锁定的依赖身份与版本。偏离列入第 6 节 R-4。
- KL-10：`server-entry` 的 `create`、`adoption-sources`、`agent-adoptions` 三处在 R-1 的 Session 改动交付之后的同一波，一起从定义名映射换到本契约。R-1 已裁定（R1-D34），Session 改动由 session-run 交付线在波 2 交付；换件的波次由 Reduce 安排。换之前，三处都沿用定义名映射，线包 R2 的「同一内容身份」由同一份映射保证。只换一部分时，Session 记下的采用与 Agent 收到的采用不是同一种值：`read` 对定义候选答 `unavailable`，reload 也可能因定义名不同被 Session 拒绝。所以三处不分开换。

交给其他交付线或后续波：

- Session 的提交边界核验端口，若需要，归 session-run 交付线（[#502](https://github.com/nemori-ai/omne-harness-lite/issues/502)）。
- 存储型提供者与清单回收，归后继，依赖存储契约。
- 真实的反序、崩溃、跨租户组合场景，归应用成员的提供者测试与联调。

## 6. 待交付与已知分歧

R1-D34（[#978 评论](https://github.com/nemori-ai/omne-harness-lite/issues/978#issuecomment-6564997466)）裁定了下面四条。本节只留尚未交付的条目与已知分歧。

- R-1 Session 采用路径上 `startRun` 与 `reload` 的主体。已裁定：Session 给 `SessionAdoptionSource.prepare` 加 `SessionAccess`，适配器按真实调用者复核资格。这是 Session 契约的可加改动，归 session-run 交付线，经 [#996](https://github.com/nemori-ai/omne-harness-lite/issues/996)，在波 2 交付。交付之前按 KL-10 处理：`create` 经 `server-entry` 取得 `ref`（AC-24），`startRun` 与 `reload` 沿用定义名映射。
- R-2 已采用配置的来源。已裁定：`agentConditions` 仍由 `session-conditions`（J06）提供，不改装配页的分工。它用 run 的采用 `ref` 调 `adoptionCoordinator.read` 读已采用配置，清单格式由本契约解释。Session 不解释证据里的 `capabilities`，第 4 节「次要证据，契约不依赖」不变。装配页 `session-conditions` 行的注入列加 `adoptionCoordinator`，由 Reduce 在 J06 交付时写（波 2）。
- R-3 缓存键。已知分歧：本页采用 AC-16 的键，比 Session 规格「按采用变更计数」的键粗。命中靠重读与复核成立，两种说法在正确性上不冲突，不另裁。
- R-4 对 assembly 规格的两处解释（AC-04 的失败种类、AC-07 的固定请求输入记在 Session 的事实里）与一处偏离（KL-9）。Reduce 代 assembly 规格的拥有者确认。

## 7. 给实现闭包的接入点

#688（契约成员）：

- 新建 `packages/assembly/adoption-contract`，按第 3 节登记点与 AC-18 的依赖清单。
- 写 SPEC：按本页开头「采用与迁移」迁入条款，本页留指向成员 SPEC 的链接。
- 导出唯一的摘要函数（AC-10）。
- 内存替身与符合性套件按 AC-23。
- 不碰：Session、Agent、Tool 的任何文件，存储契约。

应用成员的采用提供者（app-access 交付线）：

- 新增复现型提供者行，提供 `adoptionCoordinator` 与 `definitionMappings`。
- R-1 的 Session 改动交付之后的同一波，三处一起换（KL-10）。换之前三处都沿用定义名映射。
  - `server-entry` 的 `create` 改为以调用者的 `Access` 调 `prepare`，把 `ref` 交给 Session（AC-24）。`server-entry` 的规格在同一波写明 `prepare` 的答案到公开结果的映射。
  - `adoption-sources` 行改为从 `adoptionCoordinator` 取材料。适配器在采用点调用 `planAdoption`，并按 AC-26 映射失败。
  - `agent-adoptions` 行改为从 `adoptionCoordinator` 经 `read` 投影，删除运行时的定义名映射直读。
- 提供者测试覆盖 AC-23 中不归符合性套件的复现型用例，以及 AC-24 的交接用例。
- 不碰：`packages/tool/**`、`packages/session/**`。
