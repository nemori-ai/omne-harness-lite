# 采用协调契约设计

状态：候选（#978 DP-6，闭包 DSN-6）。本页尚未经 design-reviewer 的 choice 与 expression 评审，Reduce 尚未采用它。采用之前，本页不是实施输入，也不改变 [#688](https://github.com/nemori-ai/omne-harness-lite/issues/688) 的开工条件。

本页是领域角色「采用协调」的契约设计唯一源。[领域页](README.md#模块角色与事实归属)只定义这个角色。[assembly 规格](../../../packages/assembly/assembly/SPEC.md#adoption)继续拥有求值、发布、入口与失败记录的行为。本页不重述那些行为，只引用它们。成员 `adoption-contract` 建成后，下面的 `AC-nn` 条款由 #688 迁入该成员的 SPEC。迁移之后，本页只留领域层的分工与迁移说明。

本页的编号 `AC-nn` 也是候选结论编号 DP6-Cnn。同一条规则只在本页定义一次。

## 1. 问题与范围

本页回答 #978 的 R10：

- 采用协调者校验什么，产出什么，失败时怎样表达。
- 它与 Tool 的 `planAdoption`、Session 的推进协调器 C2、Agent 的 `AgentAdoptions` 怎样分工。
- 租户公平（J43）对契约有什么约束。
- 成员放在哪里，叫什么，怎样进入线归属表。
- M2 内谁采用它，哪些部分需要持久化，以及 #688 是否保留对 [#687](https://github.com/nemori-ai/omne-harness-lite/issues/687) 的开工条件。

本页不回答：

- 契约成员的类型、替身与契约测试。它们归 #688。
- 应用成员的实现。它归 D-APP 的 AS-05。
- Tool、Session、Agent 已接受契约的任何改动。
- 新的产品规则。

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

**AC-03** 每个操作都带 `Access<P>`，即主体与行事租户。`prepare` 的请求只含五项：定义身份（类别 AgentDefinition 加 name）、必需能力身份、范围（工作区或空）、入口（`create`、`new-run`、`reload`）、当前采用（`Adoption` 或空）。能力身份是类别加 name，类型里没有 version 字段。请求带 version，或带未知字段，`prepare` 在求值之前答 `malformed`，不形成失败记录。依据：assembly 规格「记录」，`Access` 取自 [legal-identity](../../../packages/common/legal-identity/src/index.ts)。

**AC-04** `prepare` 有两种答案：候选，或求值记录。

- 合法定义与必要绑定齐备时，`prepare` 答候选。某项能力的实现暂不可用时，候选仍成立，该项标 `unavailable`。
- 其余情形答求值记录。求值记录有四种：缺合法定义、候选被拒绝、来源未知、无类别拥有者。
- 求值记录有四项：种类、身份、原因、旧采用是否保持。输入的当前采用非空时填「保持」，否则填「不适用」。

依据：assembly 规格「记录」一节的失败记录表。「实现暂不可用」不是求值记录，它是候选里的标记。

**AC-05** 一次收集在重试后仍有来源变化，或能力、设置、权限任一路不完整，`prepare` 答「来源未知」，原因列出不完整的路。这时不发布候选，不缓存结果，不替换上一份完整目录。重试一次与整份发布的规则归 assembly 规格「发布」一节，本契约不重述。

**AC-06** 候选含五项内容：

- `ref`：精确的 `Adoption`（owner、name、revision、digest）。
- `manifest`：定义的精确版本，每项能力的身份、精确版本与可用标记，扩展声明的顺序，固定的请求输入，适用的执行条件。
- `basis`：本次收集读到的各路来源修订与收集修订号。
- `eligibility`：指向本次资格依据的 `DurableEvidence`。
- `basedOn`：`prepare` 时的当前采用。

`manifest` 不含活体句柄、推进权、Tool 冻结判定与常驻登记键。依据：assembly 规格「记录」（清单不是可持久化的活体句柄），[Tool 采用点判定](../../../packages/tool/tool-contract/SPEC.md#采用点判定)。

**AC-07** 候选与 `ref` 都没有推进效力。`prepare` 成功不等于已采用。只有 Session 提交 `ref`，该清单才是本次执行的采用依据。依据：Session 规格 [PM-06](../../../packages/session/session-contract/SPEC.md#pm-06)。

**AC-08** `validate` 的输入是一个精确 `Adoption`（候选的 `ref` 或已采用的 `ref`）与现在的当前采用。`validate` 重读各路来源与资格，答两种结果：

- `valid`：`basis` 与现在的来源相同，资格仍成立，`basedOn` 等于现在的当前采用。
- `stale`：列出变化的原因，取自 `source-changed`、`eligibility-changed`、`winner-changed`、`current-changed`。

`stale` 要求调用方重新准备，或按 Session 规格 [PM-09](../../../packages/session/session-contract/SPEC.md#pm-09) 处理已采用依据失效。`validate` 不写任何状态。

**AC-09** `read` 的输入是一个精确 `Adoption`。`read` 返回当时记下的 `manifest` 与 `basis`。`read` 不读来源，不重新求值，不选新版本。同一 `ref` 多次 `read` 得到相同内容。依据：assembly 规格「记录」（同一次执行从采用依据读取已记下的正文）。

### 租户边界与失败

**AC-10** 每个 `ref` 的摘要绑定其租户。另一租户的 `ref`、未铸出的 `ref`，在 `validate` 与 `read` 里得到同一个答案 `unavailable`，不披露它是否存在。`denied` 只用于主体对该租户没有资格。资格读口不可答时答 `unavailable`，不改写成 `denied`。依据：[线包整线验收第 4 条](https://github.com/nemori-ai/omne-harness-lite/issues/978)的「不确定时答 unavailable」。

**AC-11** 失败分两类，两类不混用：

- 操作失败：问题没有得到回答。种类只有 `denied`、`malformed`、`unavailable`。`unavailable` 带 `owner` 字段。
- 求值记录：问题得到了回答，答案是「不行」。它是 `prepare` 的答案，见 AC-04。

适配器按下表映射到消费者的失败词汇。映射由 AS-05 对照 Session 与 Agent 各自规格核对。冲突时停下，不改它们的契约。

| 契约答案 | Session 证据桥 | Agent `resolve` |
| --- | --- | --- |
| `denied` | `denied` | `denied` |
| `malformed` | `invalid` | `invalid` |
| `unavailable` | `unavailable` | `unavailable` |
| 求值记录：缺合法定义、候选被拒绝、无类别拥有者 | `invalid`（候选） | 不适用 |
| 求值记录：来源未知 | `unavailable` | 不适用 |
| `validate` 答 `stale` | `invalid`（候选），新 Run 路径重新 `prepare` 一次 | 不适用 |

### 耐久

**AC-12** 提供者在 `prepare` 返回候选之前，必须使 `read(ref)` 对同一租户可答。`ref` 一旦出现，`read` 就可答。清单按摘要内容寻址，不可变。同一内容重复准备得到同一个 `ref`。Session 提交 `ref` 之后，`read` 在该租户和该提供者存续期间继续可答，不依赖来源的当前状态。

**AC-13** 契约允许两类提供者，对外保证相同：

- 存储型：提供者持久保存清单。
- 复现型：提供者能按摘要从发行数据复现清单。M2 的首条路径是复现型，见 AC-20。复现型提供者的发行数据里没有该摘要对应的条目时，`read` 答 `unavailable`，不求值替代。

契约不规定存储方式，不导入存储契约。依据：assembly 规格「发布」（不把某种数据库写成产品要求）。

**AC-14** M2 不回收清单。清单按摘要去重，数量随不同采用增长，不随会话数增长。回收需要读 Session 的引用，留给后继（KL-2）。

### 提交边界与缓存

**AC-15** 采用不授予任何动作资格。撤权由各动作的拥有者在动作边界再核。因此，`validate` 之后到 Session 提交之前来源或资格再变化，只造成一份「已采用但已过时」的依据，不造成越权。下一次新 Run 或显式 reload 比对 `basis`，发现变化时重新采用。这个窗口是已知限制 KL-1。依据：assembly 规格「记录」（层值固定的版本不豁免合法性、资格、锁定或撤权），Tool 契约的授权消费点再核。

**AC-16** `prepare` 可以按 `basis` 缓存候选。缓存命中的结果必须与新鲜求值的结果相同。缓存的候选不是采用依据，进入新 Run 或 reload 时必须再经 `validate`。契约不要求缓存。`prepare` 返回的 `ref` 等于输入的当前采用时，契约不跳过任何步骤。Session 仍按 PM-06 决定是否写新 attempt。

### 租户公平

**AC-17** 提供者按租户分串行区（J43）。契约对它有三条约束：

1. 串行区的键是租户，不是会话、主体或全局。
2. 一个租户的来源读取挂起，不阻塞另一个租户的 `prepare` 与 `validate` 在界内完成。
3. `prepare` 与 `validate` 的输入带 `AbortSignal`。取消后，排队中的调用不执行，执行中的调用不缓存结果。

`read` 按精确 `ref` 读不可变清单，不进串行区。队列容量、租户间调度算法与超限应答的参数归提供者规格（KL-4）。超限与超时答 `unavailable`。

### 位置与采用范围

**AC-18** 新成员位于 `packages/assembly/adoption-contract`，包名 `@omne-harness/adoption-contract`。成员含纯类型、校验、Cordis 服务定义、内存替身与符合性套件，结构沿 `sql-contract`：入口 `.`、`./cordis`、`./testing`。它依赖 `exchange-refs`、`legal-identity`、`operation-result`、`json-text` 与 Cordis。它不依赖 `assembly`、Session、Agent、Tool 的任何成员，也不被它们依赖。只有应用成员与具名提供者导入它。依据：[线归属表](../../engineering/delivery-lines.json)已预登记 `packages/assembly/adoption-contract`，[产品包组织](../../package-organization.md)规定业务成员不读取 `assembly` 取得全局服务。

**AC-19** 契约只有一个 Cordis 服务键 `adoptionCoordinator`，由 `adoption-contract` 的 `./cordis` 定义。`sessionAdoptionSource` 与 `agentAdoptions` 仍由 Session 与 Agent 的 Cordis 契约拥有，它们是消费口，不是第二个来源。同一来源只保留一个键拥有位置。依据：XC-ADOPTSRC 把采用来源三口的键放在 Session 的 Cordis 契约。

**AC-20** M2 的采用范围如下：

- 第一个提供者是复现型，清单来自 `definitionMappings` 的同一份只读表。`ref.digest` 是映射条目内容的摘要。
- 消费者有四个：`server-entry`（定义名是否在映射内）、`agentAdoptions`（经 `read` 解析）、`sessionAdoptionSource`（经 `prepare` 与 `validate` 取材料）、`agentConditions`（经 `read` 取已采用配置）。
- 适配器由应用成员持有。适配器在采用点调用 Tool 的 `planAdoption`，把结果写进 Session 的材料。契约不调用它。
- 首条路径的 `modes` 默认值仍来自映射条目。
- 多层资产来源进入契约不属于 M2。

**AC-21** #688 不需要导入存储契约，因此可以去掉对 #687 的开工条件 D-S02。存储型提供者建立时，才依赖存储契约。依据：AC-12、AC-13 只规定性质，不规定存储。

## 3. 形状

下面是语义字段，不是可导入的 TypeScript。#688 从真实公开类型复用 `Adoption`、`DurableEvidence`、`Access`，不复制它们。

| 名字 | 字段与说明 |
| --- | --- |
| `AdoptionRequest` | `definition`（类别加 name）、`capabilities`（身份列表）、`scope`、`intent`、`current` |
| `AdoptionCandidate` | `ref`、`manifest`、`basis`、`eligibility`、`basedOn`，见 AC-06 |
| `AdoptionRecord` | `kind`（四种）、`identity`、`reason`、`previous` |
| `AdoptionCheck` | `valid`，或 `stale` 加原因列表 |
| `AdoptionCoordinator<P>` | `prepare`、`validate`、`read`。`prepare` 与 `validate` 带 `signal` |
| 操作失败 | `denied`、`malformed`、`unavailable`（带 `owner`） |

登记点：

- 成员目录：`packages/assembly/adoption-contract`，含 `SPEC.md`、双语 README、`documentation.json`、`api/`。
- 线归属表：`contracts` 增加该目录。
- 产品包组织：「装配组有两个目标成员」改为三个，并登记该成员。
- Cordis 键：`adoptionCoordinator`，进入装配页的服务键清单。

上面四项中，后三项属于公共登记文件，由 Reduce 写，见第 8 节。

与相邻契约的分工：

| 相邻契约 | 本契约提供 | 本契约不做 |
| --- | --- | --- |
| Session 推进协调器 C2 | 候选与有效性材料，经适配器进入 `sessionAdoptionSource` | 不分配 attempt，不提交 `startRun`、`reload`、`freeze`，不生成接续 |
| Agent `AgentAdoptions` | `read` 给 `resolve` 取原清单 | 不实现 `handover`，不核对当前胜出者 |
| Tool `planAdoption` | 每项 Tool 能力的合法胜出者，作为判定输入 | 不调用它，不携带判定与常驻登记键 |

## 4. 对判据的覆盖

线包 R10 要求：未决项全部闭合或写成已知限制，两类评审无未决阻断，Reduce 具名采用。本闭包完成第一项。后两项在本页之后由线负责人与 Reduce 执行。

W1-APP-11 的判据：

| 判据 | 满足方式 | 证据位置 |
| --- | --- | --- |
| C1 对账 | 固定树与 F 的差额逐项处置 | 过程目录 `C1-reconciliation.md` |
| C2 未决项与反例 | 候选第 3、7 节与 14 条反例逐项处置 | 过程目录 `C2-closure.md` |
| C3 条款 | 公开承诺、失败、租户公平、位置与包名、采用范围各有条款 | 过程目录 `C3-clauses.md` |
| C4 唯一源 | 本页是唯一源，其余文件只引用 | 过程目录 `check-c4.py` |
| C5 评审与采用 | 本闭包不做 | 线负责人之后派发 |
| C6 文档检查 | `check:docs` 与登记 | 交回里的退出码 |

#688 的 D-SPEC 条件是「公开承诺、包名及采用范围已确认」。AC-01 至 AC-17 给出公开承诺，AC-18 给出包名，AC-20 给出采用范围。Reduce 采用本页之后，该条件可判定满足。

## 5. 备选与取舍

- 继续扩大发行映射。放弃。映射不能表达来源变化、当前资格与稳定的采用记录。M2 仍用它做第一个提供者的数据。
- 把全部流程放进 Session。放弃。Session 会同时解释资产与执行恢复。
- 把契约放进 `assembly` 成员。放弃。`assembly` 是已有运行成员，业务成员不读取它取得服务。契约放进去会让适配器依赖关闭协议。
- 清单与 Session 引用同事务提交。放弃。来源在事务域之外，事务不能覆盖它们。它还把 #688 绑到 #687。AC-12 的「先写后引用」加内容寻址达到同样的性质，不需要共同事务域。
- 清单只存在 Session 的 SE08 里。放弃作唯一副本。Agent 没有读 Session 日志的路径。SE08 里的 `capabilities` 保留为次要证据，契约不依赖它。

## 6. 已知限制与剩余

- KL-1：`validate` 到 Session 提交之间有时间窗口。F 上 `SessionAdoptionSource` 只有 `prepare`，没有提交边界回调 `validate` 的端口。依据 AC-15，窗口内的变化不越权。若 Session 的负责人要同提交核验，另立新增契约改动。
- KL-2：M2 不回收清单。
- KL-3：复现型提供者在发行数据改动并丢掉旧摘要后，旧 `ref` 的 `read` 答 `unavailable`。发行数据改动时，须保留旧条目或接受旧会话需要重新采用。
- KL-4：公平参数与调度算法留给提供者规格。
- KL-5：契约不使用同值 reload 的跳过路径。[重装与不重装的情形](../../architecture/runtime/assembly-and-change.md#重装与不重装的情形)与「比对代替求值」仍是候选，本页不依赖它们。
- KL-6：`agentConditions` 需要哪些已采用配置字段，由 AS-05 对照 Agent 契约逐项确定。契约只保证 `manifest` 的「适用执行条件」可读。
- KL-7：多层资产来源与跨进程提供者不在 M2。

交给其他线或后续波：

- Session 的提交边界核验端口（L-RUN，若需要）。
- 存储型提供者与清单回收（后继，依赖存储契约）。
- 真实的反序、崩溃、跨租户组合场景（AS-05 与联调）。

## 7. 待定项

能自己定：

- 来源不完整答求值记录「来源未知」，不答操作失败。依据：assembly 规格「发布」的时序图只说「返回失败记录」，失败记录表里只有「来源未知」符合「不用猜测补齐定义」。
- 候选与已采用依据共用一个 `ref` 与 `validate` 入口。依据：两者都是精确 `Adoption`，Session 规格 PM-09 需要问「已采用依据是否仍合法」。
- 采用来源的 `create`、`new-run`、`reload` 三个入口。`completeInitialization` 用 `read` 取原采用，`change` 与 `freeze` 不需要新求值。依据：Session 规格「身份桥、证据桥与 Context 输入」。
- 服务键名 `adoptionCoordinator`。依据：同类键 `agentAdoptions`、`tenantDomains` 用名词。
- 去掉 #688 的 D-S02。依据：AC-21。这是卡条件的改动，由 Reduce 执行。

只有负责人能定：无。三问都能去掉：本页没有新增产品规则，没有改已接受契约，也没有破坏性形状。

需单独具名的部分，供评审与采用时核对：

- 新增成员与服务键，改动「装配组有两个目标成员」一句。它是已接受正文的修订，由 Reduce 经产品包组织的拥有者写。
- 失败映射表（AC-11）。它约束 AS-05 的适配器，不改 Session 与 Agent 的词汇。
- KL-1 的取舍。它接受一个有界过时窗口，理由是采用不授予资格。

## 8. 给实现闭包的接入点

#688（契约成员）：

- 新建 `packages/assembly/adoption-contract`，按第 3 节登记点与 AC-18 的依赖清单。
- 写 SPEC：把 AC-01 至 AC-17 迁入成员 SPEC，本页留迁移说明。
- 内存替身须支持：脚本化来源变化、挂起的来源、跨租户 `ref`、对 `read` 的来源读取计数。符合性套件覆盖 C2 逐项表里归「契约套件」的反例。
- 不碰：Session、Agent、Tool 的任何文件，存储契约。

D-APP AS-05（应用成员）：

- 新增复现型提供者行，提供 `adoptionCoordinator` 与 `definitionMappings`。
- `adoption-sources` 与 `agent-adoptions` 两行改为从 `adoptionCoordinator` 投影，同波删除运行时的定义名映射直读。
- `adoption-sources` 的适配器在采用点调用 `planAdoption`，并按 AC-11 映射失败。
- 不碰：`packages/tool/**`、`packages/session/**`。

Reduce 单写的公共文件条目（本闭包不改）：

- `docs/architecture/runtime/application-assembly.md`：新增服务键 `adoptionCoordinator` 与提供者行，改 `adoption-sources` 与 `agent-adoptions` 行的注入列，改「不在本页」里 #688 的条目。改后重新生成 `apps/harness-server/src/s0/aa-rows.json`。
- `docs/package-organization.md`：装配组成员由两个改为三个，登记 `adoption-contract`。
- `docs/engineering/delivery-lines.json`：`contracts` 增加 `packages/assembly/adoption-contract`。
- `docs/documentation.json`：无需改。本页登记在领域目录自己的 `documentation.json`。
- #688 卡正文：去掉 D-S02，把 N-1 的设计指向本页。
