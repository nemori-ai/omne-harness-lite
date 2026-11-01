# @omne-harness/sql-contract 行为规格

本文件拥有 SQL 存储契约在公开类型以外的全部必要行为：身份、摘要、材料、登记、提交、查询、读取、参加者端口、SQL 值、资格边界、关闭协议和验证义务。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。SQLite 提供者怎样兑现这些行为，归 [sqlite-provider 规格](../sqlite-provider/SPEC.md)。

## 范围与依据

依据：SQL r2 规格与公开形状（SHA256 `32f2e168d54854956ab223146d73959de124bc24732d770a41607c08691101f8` 与 `f9dee7d6a175b7938e9afcae12a7a55551078d55a2ccb2e8c679e5152acb7d01`），采用记录为 #687 评论 6554935672。采用是设计采用，不是交付接受 D-A01。接受权仍属 #687 与 PanQiWei。

本文件取代旧的目标文档 `packages/storage/docs/storage-contract/SPEC.md`（下称 S1）。S1 的结果模型由 PanQiWei 于 2026-10-14 认可。[#247](https://github.com/nemori-ai/omne-harness-lite/issues/247) 补入的下列条款由 PanQiWei 在[技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/247#issuecomment-6176738073)中接受，本文件继续有效：

- 幂等认回和 `identity_conflict` 按完整的操作身份比较。
- 登记结果、登记键和登记拒绝原因。
- `commit` 的拒绝原因 `writer_not_current`、`facts_not_json` 和 `participant_repeated`。
- 参加者端口。
- 提供者的启动核对、受理队列、读取路径、两段回滚、未知条件和关闭期限。

SQL r2 在 S1 之上改变或闭合的条款，按 SQL r2 第 19.1 节的提案编号 P-01 至 P-13 标注为【提案 P-nn】。这些编号用于对照替换清单。标注只说明条款来源，不说明它尚未采用。未标注的条款是不改变 S1 的新增行为。

条款号沿用 SQL r2 规格（写作 §n.m），因此本文件的号不连续。缺少的号在 [sqlite-provider 规格](../sqlite-provider/SPEC.md)中。

范围是 M2 单机首条路径。首条路径不需要的能力写成已知限制。已知限制 L-1 至 L-9 及触发条件在 [sqlite-provider 规格](../sqlite-provider/SPEC.md#已知限制)。本文件只在相关条款处引用其编号。

调用方学习四个操作：`registerCombination`、`commit`、`query`、`read`【提案 P-11】。写连接、SQL 和写者代际留在提供者内。

公共结果由本文件拥有。旧的 `write` 回调不迁入本契约。那个回调在应用线程执行，和 Worker 内命令冲突。

## 参加者与操作

调用方出示操作身份。结果未知时，调用方用同一身份调用 `query`。提交协调者登记参加者和组合版本。事实拥有者提供放进同一次 `commit` 的命令。存储提供者把一个事务域绑到一个数据库身份和一条写连接。命令在 Worker 内执行。

一次 `commit` 容纳这些事实拥有者的命令。输入受理协调者写入来源、提交身份和去处责任，并写入内容或有效引用。日程拥有者写入一次定义更新中必须同时成立的事实。HITL 与原等待的拥有者写入有效答复、等待状态和后续责任。各拥有者规定 `facts` 的含义。`facts` 放在命令里。

日历发布、通知送达、模型调用、工具效果和文件发送使用各自的后续操作。原拥有者在观察到已提交回执之后执行这些操作。

回执记录提交结果。回执不新建 Run，也不发送通知。原拥有者在看到已提交回执之后，另行执行这些动作。

## 结果与不变量

### §1.2 不变量与拥有者

1. 默认拒绝跨租户。每个事务域只绑定一个作用域。另一作用域得不到该域的事实，也得不到该域是否存在的信息（§2.5）。
2. SQL 操作不携带主体。注入 `storage` 只是装配范围，不是访问控制（IC-18）。授权与业务资格由调用 SQL 的领域入口与参加者负责，SQL 不判断资格（§11）。
3. 错误不静默变成成功。提供者不能确定结果时返回 `unknown`。
4. 外部输出不声称可逆。effect 撤除、Worker 结束与关闭都不撤销已提交的事实或已发出的外部效果。
5. 连接、Worker、快照、排序与清理归 SQLite 提供者。原业务事实与结果解释归各领域。租户目录归应用装配（§2.4）。

### §2 成员、服务与装配

#### §2.1 成员与入口

| 成员 | 入口 | 内容 |
| --- | --- | --- |
| `packages/storage/sql-contract` | `.` | 词汇类型、`SqlStorage`、材料与清单类型、三个纯函数、关闭控制口与宿主接口、目录形状。不导入 Cordis（IC-4）。 |
| 同上 | `./worker` | Worker 内的模块与端口接口、`SqlValue`、`QueryRows`。不导入 Cordis。 |
| 同上 | `./cordis` | `StorageService`、`StorageHostService`、`TenantDomainsService`（依赖 Context r3）与 `Context` 增补。 |
| 同上 | `./testing` | 内存替身与 `runSqlStorageConformance`（§16）。 |
| `packages/storage/sqlite-provider` | `.`、`./cordis` | 见 [sqlite-provider 规格](../sqlite-provider/SPEC.md)。 |

成员名表达契约种类与后端（IC-7）。根接口名 `SqlStorage` 属于 sql-contract，表达同一契约种类。服务键表达能力，是 `storage`。

#### §2.2 服务定义与承载形式

`StorageService` 按 IC-2 写成：`static readonly provide = 'storage'`，构造函数调用 `super(ctx, StorageService.provide)`，导出 `storageKey`，`implements SqlStorage`。类上的 JSDoc 写 `@owner packages/storage/sql-contract`。消费者 `inject` `storageKey`，不导入 sqlite-provider（IC-5）。服务键 `sqlStorage`、定义名 `SqlStorageService` 与任何别名都不保留。

服务方法转发到提供者宿主持有的函数对象。Worker、队列、结果拥有者与关闭协调器不建在调用方的 `this.ctx` 上（IC-13，basis `service-method-ctx-is-caller`）。提供者插件的承载形式在 [sqlite-provider 规格](../sqlite-provider/SPEC.md)。

#### §2.3 装配交入的运行时对象

运行时对象不进插件树（IC-16）。装配入口以 `StorageHostService`（键 `storageHost`）提供三项。提供者插件只 `inject: [storageHostKey]`。

- `materials`：构建时静态导入后组装的材料目录（§4.2）。
- `closeLeases`：装配关闭协议的租约口（§13.2）。
- `attachControl(control)`：提供者把 `StorageControl` 交给装配关闭适配器。适配器保存每一个交来的控制口，直到装配报告确定。

`StorageControl` 只有两条取得路径：装配关闭适配器与绑定插件。它不作为服务的属性，也不进 `Context`。装配只把 `storageHost` 交给 `storage` 行，这是装配范围，不是访问控制。

#### §2.4 租户域目录（依赖 Context r3）

按 Reduce 依 IC-1 的裁定，目录形状（`TenantDomain`、`TenantDomainAccess`、`TenantDomains<P>` 等）由 sql-contract 根唯一声明。`TenantDomainsService<P>`（键 `tenantDomains`，只有 `enumerate`）放在 sql-contract 的 `./cordis`。目录的实现与目录文件归应用的会话存储组合。SQL 提供者不实现目录，也不读目录文件。Context r3 若把定义移走，本节与公开形状同批修改，SQL 操作语义不变。

#### §2.5 共同规则

1. 结果都经返回值给出，Promise 不以 reject 报告结果。提供者内部错误映射为 `unknown`（`registerCombination`、`commit`、`query`）或 `read_failed`（`read`）。
2. 作用域是请求的显式字段。提供者不从 `ctx`、isolate 标签或安装关系推断作用域（IC-18）。
3. `diagnostic` 是不超过 `maxDiagnosticBytes` 字节的文本，或 `null`。诊断不含 SQL 文本、参数、业务正文，也不含另一作用域的信息。调用方只按 `kind` 与 `reason` 分支。
4. 另一作用域的请求得到与 `absent` 相同的结果（§5.5）。唯一的例外是登记的 `domain_occupied`。
5. 「字节」指 RFC 8785 规范写出后的 UTF-8 字节数。

### §3 身份与摘要

#### §3.1 身份与字段规则

`SqlIdentity` 有五个维度：作用域（`tenant` 或 `system`）、事务域、操作、协议版本和操作键。五项都由调用方传入【提案 P-01】。新提交的协议版本是 `2`。协议 1 只作历史定义（§3.3）。

幂等认回与 `identity_conflict` 都比较完整的五项。五项中任何一项不同，就是另一个操作。`scope` 先比较 `kind`，`kind` 为 `tenant` 时再比较 `tenant`。另一作用域使用相同的操作键，也是另一个操作。那个操作不认回本作用域的回执，也不和本作用域的回执冲突。系统作用域只写作 `{ kind: 'system' }`。空租户不是系统作用域（IC-18）。系统作用域不能取得租户域，租户作用域也不能取得系统域。

【提案 P-02】字段规则：

- 名字类字段（`tenant`、`operation`、`operationKey`、`combinationVersion`、`participant`、`handler`、`protocol`、`requestKey`）是非空、合法 UTF-16、UTF-8 不超过 1024 字节的字符串。
- `transactionDomain` 另限 UTF-8 不超过 120 字节（文件名限制见 [sqlite-provider 规格](../sqlite-provider/SPEC.md) §5.1）。
- 摘要类字段是 64 个字符的小写十六进制。

违反时，`commit` 与 `registerCombination` 返回 `field_missing`，`query` 返回 `unknown`，`read` 返回 `invalid`。

#### 公开类型

类型把不能同时成立的结果拆开。类型文本只在 `src/types.ts` 与 `src/worker.ts`，本文件不复制。形状的要点【提案 P-01、P-02、P-03、P-12】：

- `scope` 代替 `tenant`。请求带 `manifestDigest`。`facts` 的类型是 `JsonValue`。
- `committed` 与 `rolled_back` 带响应证据。`unknown` 与 `rejected_before_accept` 带 `diagnostic`。
- `identity` 只在请求在预解码阶段被拒绝时为 `null`。
- `commit` 的返回值不含未提交。未提交只出现在 `query`。
- `NotCommitted` 的五项证明由提供者构造。调用方代码不组装这个对象。

#### §3.2 协议 2 输入摘要

【提案 P-01】输入摘要按下列步骤计算：

1. 取 `{ scope, combinationVersion, manifestDigest, commands }`。
2. 把 `commands` 按 `participant` 的 UTF-16 码元升序排列。
3. 用 RFC 8785 规范写出，编码为 UTF-8，计算 SHA-256，写成小写十六进制。

sql-contract 根导出 `inputDigestV2` 供复算。规范写出算法是 RFC 8785，见 [RFC-0006](../../../docs/rfcs/RFC-0006-json-canonical-text.md)。对象键按该标准排序，JSON 中间没有空白。写出拒绝非 JSON 值，不自行转换。调用方不传入摘要。`facts` 必须是严格 JSON，否则返回 `facts_not_json`。

提供者先做两项核对，再计算摘要。任一项不成立时，`commit` 返回受理前拒绝，不计算摘要，不写入回执，操作也不进入受理队列。

- 两条命令的 `participant` 相同时，原因是 `participant_repeated`。
- 任一命令的 `facts` 含有非 JSON 值时，原因是 `facts_not_json`。

JSON 值只有 `null`、`true`、`false`、有限数、字符串、数组和普通对象。数组的元素和对象的值也必须是 JSON 值。这条规则对任何嵌套深度都成立。`undefined`、BigInt、NaN、Infinity、-Infinity、Date 和函数都不是 JSON 值。提供者不转换这些值。例如，提供者不把 Date 写成字符串，也不省略值为 `undefined` 的键。

执行顺序由依赖图决定（§7.5），与请求中的顺序无关。改变编码就改变协议版本。本节闭合 S1「尚未决定」第 1 条：协议 2 由提供者排序。

#### §3.3 协议 1

【提案 P-01】协议 2 是新提交的唯一协议。协议 1 的 `commit` 返回 `unsupported_protocol`。

协议 1 的输入摘要是历史定义，只为认回旧回执保留。算法是 SHA-256，写成小写十六进制。输入是命令数组的规范 JSON。调用方先按 `participant` 字典序排列命令。数组顺序保持调用方交给写出的顺序，提供者不重排。规范写出算法是 RFC 8785。

基线没有任何提供者成员，因此不应存在协议 1 回执。实施卡的数据调查须读回确认。调查发现回执时，提供者另发布只读的 `queryProtocol1`：按原算法认回，不产生新的协议 1 提交，不补造响应证据。

### §4 静态材料与清单

#### §4.1 材料描述

材料有三种：参加者、迁移与读 handler，字段见公开形状。规则如下：

- `moduleUrl` 是构建固定的 `file:` URL，不来自请求、插件配置或消息。
- `codeDigest` 与 `checksum` 是模块文件字节的 SHA-256。提供者的工厂在构造期核对一次，Worker 在加载前再核对一次。构造期不符时构造被拒绝。Worker 加载时不符，该域进入 `quarantined`。
- 一张表只有一个拥有者。`readTables` 中的表必须归同一组合中的某个参加者。`_sql_` 前缀的表归提供者。

#### §4.2 材料目录与声明组合

`SqlMaterialCatalog` 是一次构建的全部材料，含 `declaredCombinations`：该构建为租户作用域与系统作用域各自采用的组合，可为 `null`。应用聚合 Session/Journal、Model、Tool 等拥有者各自导出的材料。Session 不导入 Model 或 Tool 的实现。构造期，工厂对每个声明组合调用 `combinationManifest`。结果不是清单时，构造被拒绝（`declared_combination_invalid`）。

#### §4.3 组合有效性

`combinationManifest({ catalog, participants })` 按顺序判断：

1. 任一参加者不在目录中：返回 `material_unavailable`（只报第一个缺失者）。
2. 收集下列全部问题后返回 `combination_invalid`：事实依赖成环；需要的事实没有提供者；同一事实键有两个提供者；同一张表有两个拥有者；读取的表没有拥有者；迁移的 `requires` 缺项或成环。
3. 否则返回清单。依赖图的边从事实的提供者指向需要者。

#### §4.4 清单摘要

调用方用纯函数计算清单摘要，放进请求。提供者在登记时用自己的目录独立计算，再比较。

1. 参加者条目：去掉 `moduleUrl`。字符串数组按 UTF-16 码元升序排列，事实键按 `(key, protocol)` 升序排列。条目按 `participant` 升序排列。
2. 迁移条目：组合参加者拥有的迁移，加上其 `requires` 闭包，去掉 `moduleUrl`。`requires` 与条目都按 `(owner, id)` 升序排列。
3. 组成 `{ manifestProtocol: 'sql-manifest/1', participants, migrations }`，用 RFC 8785 写出，UTF-8 编码，计算 SHA-256，写成小写十六进制。

读 handler 与 `moduleUrl` 不进入清单。测试向量的摘要为 `b8cb9846fa33866cea139ff67980096603ec26d41473dbed29e1a5784329e1dd`，Node 独立复算得到同一结果。向量不含数字，没有覆盖 RFC 8785 的数字写出，数字写出由包内测试另行覆盖。

### §5 事务域状态与结果

事务域的物理绑定、打开流程与迁移由提供者兑现，见 [sqlite-provider 规格](../sqlite-provider/SPEC.md) §5。本节只写调用方可见的状态与结果。

#### §5.2 域状态

域状态按（作用域，事务域）在一个提供者代际内维护。提供者代际是一次成功构造得到的实例。

| 状态 | 含义 |
| --- | --- |
| `absent` | 没有文件，或文件没有绑定行 |
| `unopened` | 有绑定行，本代际还没有打开它 |
| `opening` | 正在执行 DO-1 |
| `ready` | 写准入开放。子状态 `read-paused`、`write-stopped` 见提供者规格 §12.3 |
| `recovering` | 写 Worker 异常退出，退出尚未被观察到 |
| `quarantined` | 持久或静态故障，保持到插件重跑或进程重启 |
| `draining`、`closed` | 提供者正在关闭、已经关闭（§13） |

#### §5.5 域状态 × 操作 → 结果

各操作控制侧的拒绝（§6.2、§7.2、§9.2）先于本表判断。非正常结果都带诊断。

| 域状态 | `registerCombination` | `commit` | `query` | `read` |
| --- | --- | --- | --- | --- |
| `absent` | 路径 B | `combination_unregistered` | `unknown` | `domain_unavailable` |
| 绑定另一作用域 | `domain_occupied` | `combination_unregistered` | `unknown` | `domain_unavailable` |
| `unopened` | 路径 A，成功后按 `ready` | 同左 | 同左 | 同左 |
| `opening` | 排队，按打开结果处理 | 同左，已预留 | 同左 | 同左，计入读等待期限 |
| 打开失败时的等待者 | `domain_unavailable` | `domain_unavailable` | `unknown` | `domain_unavailable` |
| `ready` | 正常 | 正常 | 正常 | 正常 |
| `ready`，`read-paused` | 正常 | 正常 | 正常 | 排队，到期为 `queue_timeout` |
| `ready`，`write-stopped` | `domain_unavailable` | `domain_unavailable` | 正常 | 按 `read-paused` |
| `recovering` | `writer_not_current` | `writer_not_current` | `unknown` | `domain_unavailable` |
| `quarantined` | `domain_unavailable` | `domain_unavailable` | `unknown` | `domain_unavailable` |
| `draining`、`closed` | `closing` | `closing` | `unknown` | `closing` |

「路径 A」「路径 B」指提供者的 DO-1 打开路径（提供者规格 §5.3）。域打开期间到达的操作排队，等待打开结果；打开失败时为 `domain_unavailable`。`writer_not_current` 只用于旧 Worker 退出尚未被观察的 `recovering`【提案 P-08】。它是暂时结果。提供者不发通知，调用方按有界策略重试。Context r3 把这项重试归会话存储组合。

### §6 registerCombination

#### §6.1 输入与比较

`registerCombination` 接收一份登记请求。请求含作用域、事务域、组合版本、清单摘要和参加者列表【提案 P-01、P-03】。

【提案 P-03】登记键是 `(scope, transactionDomain, combinationVersion)`。提供者把参加者按 UTF-16 码元升序排列后比较和保存，列表顺序没有含义。提供者按登记键保存登记。同一事务域可以同时保存多个组合版本的登记。保存新版本不覆盖旧版本。协调者进程重启后，提供者仍返回已保存的登记。提供者接受任何材料齐全、通过 §4.3 判断的组合，不限于声明组合。

事务域以登记中的标识为准。调用方在操作身份中传入这份标识。

已登记的域新增版本时，提供者在一个事务中执行该组合所需的待做迁移，并写入登记。迁移失败时回滚，返回 `domain_unavailable`，已有登记不受影响。迁移会改变模式代次时，先排空读取（提供者规格 §9.5）。登记只在应用并验证了参加者全部待做迁移的同一个事务中保存（DO-1，提供者规格 §5.3）。

#### §6.2 拒绝顺序

【提案 P-03】多个条件同时成立时，返回下列顺序中的第一个原因。第 1 至 8 步在控制侧完成，不发送消息。

1. `closing`：提供者关闭已经开始。
2. `field_missing`：必需字段缺失，或违反 §3.1 的字段规则。
3. `participant_empty`：参加者列表为空。含空字符串的名字违反 §3.1 的名字非空规则，在第 2 步得到 `field_missing`。
4. `participant_repeated`：同一名字出现两次或更多。
5. `material_unavailable`：某参加者不在目录中。
6. `combination_invalid`：组合不满足 §4.3。
7. `manifest_mismatch`：请求的清单摘要不等于提供者的计算值。
8. `queue_full`：控制队列已满。
9. 下列判断在写 Worker 上完成。域为 `absent` 时走路径 B，域为 `unopened` 时先走路径 A。
   1. `writer_not_current`：域为 `recovering`。
   2. `domain_unavailable`：域为 `quarantined` 或 `write-stopped`，打开或创建失败，或新增版本的迁移失败。
   3. `domain_occupied`：绑定行属于另一作用域。
   4. `registration_conflict`：同一登记键已有登记，而排序后的参加者或清单摘要不同。

都不成立时：同一登记键已有相同的登记，返回已保存的登记；否则写入登记，返回 `registered`。

#### §6.3 结果

`registered` 是幂等的。`rejected_before_accept` 不写登记，也不写提交回执。`unknown` 表示消息已经发出，而提供者不能判定登记是否已保存，例如 Worker 退出、COMMIT 结果不确定或关闭期限到达。调用方用完全相同的输入再次调用认回。登记是持久的协议元数据，不是 IC-13 的运行时贡献，调用方卸载不删除它。登记和登记拒绝都不写入提交回执。

### §7 commit

#### §7.1 观察取消

【提案 P-02】

1. 调用时 `signal` 已经中止：返回 `cancelled`，不预留。
2. 预留之后中止：调用方的 Promise 立即以 `unknown`（诊断 `observer_detached`）结算。预留不因此归还。
3. 提供者随即尝试撤下。消息还没有发给写 Worker 时（例如域正在打开），控制侧移出操作并归还预留。消息已经发出时，控制侧请 Worker 撤下，Worker 确认操作尚未开始才撤下，并归还预留。已开始的操作按在途操作收场，不因取消被移出组。撤下不写 `rolled_back`。

断开、超时、Worker 退出或取消观察时，调用方用同一身份调用 `query`（§8）。调用方在 `commit` 返回前失去响应时，也用同一身份调用 `query`。

#### §7.2 拒绝顺序

【提案 P-02】多个条件同时成立时，返回下列顺序中的第一个原因。拒绝不写回执，不执行命令。

控制侧（第 1 至 8 步，不预留，不发送）：

1. `closing`：提供者关闭已经开始。
2. `cancelled`：调用时 `signal` 已经中止。
3. `field_missing`：必需字段缺失，或违反 §3.1 的字段规则。命令数组为空也算缺失。
   请求或命令在 `facts` 之外含非 JSON 值（例如值为 `undefined` 的多余字段、`bigint`、循环引用）时，`commit` 不预留、不抛出，按 §2.5 第 1 条返回 `unknown`，诊断为 `request_not_json`。
4. `unsupported_protocol`：`protocolVersion` 不是 `'2'`。
5. `participant_repeated`：两条命令的参加者相同。
6. `facts_not_json`：某条命令的 `facts` 含非 JSON 值。
7. `command_limit`：命令条数超过 `maxCommandsPerCommit`，单条超过 `maxCommandBytes`，整个请求超过 `maxRequestBytes`，嵌套深度超过 `maxJsonDepth`，或容器成员总数超过 `maxJsonMembers`。提供者先做有界遍历，再规范写出。
8. `queue_full`：该域的预留数等于 `admissionQueueLimit`，全局预留数等于 `globalAdmissionLimit`，或全局在途写字节、全局写响应预留不足。

第 1 至 8 步都通过后，控制侧预留（个数、字节与响应预留各一份）并发送。域还没有到 `ready` 时，操作留在该域的等待列表中，打开成功后按到达顺序发送。

写 Worker 侧（第 9 至 15 步，在建立 savepoint 之前判断。域为 `absent` 时不启动 Worker，直接得到第 11 步）：

9. `writer_not_current`：域为 `recovering`。
10. `domain_unavailable`：域为 `quarantined` 或 `write-stopped`，或打开失败。
11. `combination_unregistered`：没有该登记。域为 `absent` 或绑定另一作用域时，也是这一项。
12. `manifest_mismatch`：请求的清单摘要不等于登记中的摘要。
13. `material_unavailable`：登记中的摘要不等于当前目录的计算值，即本构建已经没有该组合的精确材料。
14. `participant_not_in_combination`：某命令的参加者不在登记中。
15. `participant_dependency_missing`：某命令的参加者需要的事实，其提供者不在 `commands` 中。判断沿依赖图传递。

第 9 至 15 步的拒绝不依赖本组的暂存状态，因为登记与材料只在组边界改变。提供者可以立即交付这些拒绝。结果拥有者收下结果后，预留归还一次。

与 S1 的拒绝顺序相比：`closing` 与 `cancelled` 排在最前；`unsupported_protocol` 移到 `field_missing` 之后，因为提供者须先确定协议版本，才能解码协议 2 的身份；新增第 10、12、13、15 步。S1 中 `queue_full`、`writer_not_current`、`combination_unregistered` 的相对顺序不变。

#### 提交的其余规则

- 同一操作身份和同一输入摘要再次调用 `commit` 时，提供者返回已保存的回执，不再执行命令。同一组中暂存的同身份调用成为等待者，在原结果持久之前不交付（§7.7.3）【提案 P-09】。
- 同一操作身份配到不同输入摘要时，提供者返回 `identity_conflict`，并带上已有回执。
- `commit` 返回 `rolled_back` 时，明确回滚回执已经持久保存。回滚之后提供者没有保存这份回执时，`commit` 返回 `unknown`。`ROLLBACK` 本身失败时，`commit` 也返回 `unknown`。本组有新暂存前缀时，整事务结束为 `unknown`（§7.7.2）。环境类错误为 `unknown`（§7.6）【提案 P-09、P-04】。
- 能确定的受理前失败返回 `rejected_before_accept`。其余不能判定的结果返回 `unknown`。
- 持久回执只有已提交和明确回滚。`commit` 返回 `committed`、`rolled_back`、`unknown`、`identity_conflict` 或 `rejected_before_accept`。

#### §7.4 参加者端口与事实格

【提案 P-12】参加者模块在 Worker 内通过 `ParticipantPort` 执行语句。端口在 S1 的 `execute` 之外增加 `requireFact` 与 `provideFact`，参数允许 64 位 `bigint`（§10）。调用返回 `ParticipantReply`。参加者拿不到数据库句柄。调用是事务内的执行入口，形状见 `src/worker.ts`。行的业务字段由参加者规定。

端口不把语句文本的词法近似当作事务权限。提供者在调用参加者期间设置 SQLite authorizer。authorizer 拒绝下列访问：

- 事务控制与 `SAVEPOINT`（参加者发出的 `BEGIN`、`COMMIT`、`ROLLBACK`，包括前面带注释、`NUL` 或多条语句的文本，都由 SQLite 拒绝执行）；
- `ATTACH`、`DETACH`、全部 PRAGMA 与扩展加载；
- DDL 与临时表；
- 写入 `ownedTables` 以外的表，读取 `ownedTables` 与 `readTables` 以外的表；
- `_sql_` 表；
- 允许清单以外的函数。

触发器与视图的间接访问同样经 authorizer 核对。权限不按语句文本判断。提供者执行自己的事务语句与回执写入之前，先撤下 authorizer。一条语句失败之后，本次端口关闭，参加者捕获错误也不能重新打开它。后面的 `execute` 不再把 SQL 交给 SQLite。

事实格按操作新建、按操作销毁。`provideFact` 只能写本参加者声明的键，每个键写一次，值必须是 JSON。`requireFact` 只能读本参加者声明需要的键。违规时端口关闭，回复记为 `failed`（`fact_violation`）。操作之间只共享数据库中的事实。

#### §7.5 执行顺序与响应证据

执行顺序：提供者只执行 `commands` 中的参加者，按依赖图的拓扑序执行。多个参加者同时就绪时，按名字的 UTF-16 码元升序选第一个。这一顺序在组合版本中固定，请求不能改变它。

响应证据【提案 P-12】：

- `committed` 的 `responses` 按执行顺序列出全部已执行的参加者，全部为 `participated`。
- `rolled_back` 的 `responses` 列出停止点之前的参加者，以及停止该操作的参加者。未执行的参加者不填写。
- 响应与回执在同一事务中保存，不从当前状态重算。
- 一份回复超过 `maxResponseBytes`，或一个操作的回复合计超过 `maxOperationResponseBytes` 时，回复记为 `failed`（`response_limit`）。预留中为这条诊断保留了空间。
- 回滚依据是历史证据，不授予以后的动作许可。

待交接记录【提案 P-06】：S1 要求的待交接记录就是响应证据行。领域的后续动作（outbox）由参加者写在自己拥有的表中，与回执在同一事务。原拥有者看到 `committed` 后读取 outbox 并执行。

执行事务的机制（savepoint、暂存、外层 COMMIT）归提供者，见提供者规格 §7.5。

#### §7.6 失败分类

【提案 P-04】本节闭合 S1「尚未决定」第 2 条。

| 失败来源 | 记录的回复 | 结果 |
| --- | --- | --- |
| 参加者回复 `conflict`、`unsupported` 或 `failed` | 原回复（`failed` 记类别 `participant_reported`） | 明确回滚 |
| authorizer 拒绝、事实格违规、参加者抛错、回复非法、回复超限 | `failed`，类别依次为 `port_violation`、`fact_violation`、`participant_threw`、`invalid_reply`、`response_limit` | 明确回滚 |
| 由语句与数据决定的 SQLite 错误：`SQLITE_CONSTRAINT`（含扩展码）、`SQLITE_MISMATCH`、`SQLITE_RANGE`、`SQLITE_TOOBIG`、语法或模式类的 `SQLITE_ERROR` | 参加者捕获后的回复；参加者未捕获，或仍回复 `participated` 时，记为 `failed`（`sql_error`） | 明确回滚 |
| 其他 SQLite 错误（`BUSY`、`LOCKED`、`IOERR`、`FULL`、`NOMEM`、`CORRUPT`、`NOTADB`、`CANTOPEN`、`READONLY`、`PROTOCOL`、`INTERRUPT` 及未列出的错误码）与提供者内部错误 | 只进诊断 | `unknown`，不写回滚回执 |

理由：前三行的失败只由输入与当时的数据决定，持久的 `rolled_back` 是真实的历史。环境错误可能是暂时的。返回 `unknown` 后，调用方经 `query` 与五项证明确认没有提交，再用同一身份重做。

环境错误发生在 B 时：外层事务仍在，就执行 `ROLLBACK TO op_B`，停止本组，提交前缀，B 为 `unknown`；外层事务已经结束，就按 §7.7.2 的批级行处理。提供者不从异常类名推出业务拒绝，适配器也不把 `failed` 改写成 `conflict`。

SQLite 提供者在下列情况下不能判定结果，`commit` 返回 `unknown`：锁等待超过 `lockWaitMs`；`COMMIT` 的结果不确定；回滚之后，明确回滚回执没有写入；`ROLLBACK` 因其他原因失败。

#### §7.7 局部失败、批级失败与序位

组提交的机制与局部失败的执行步骤（§7.7.1）、序位义务 SQ-1（§7.7.6）归提供者，见提供者规格 §7.3、§7.7。下面是调用方可见的结果。

##### §7.7.2 故障结果表

「新暂存的 A」是本组中 B 之前、已执行但尚未持久的操作。「前缀」是这些操作的集合。

| 事件 | 新暂存的 A | 当前的 B | 后缀 C | 提供者的后续责任 |
| --- | --- | --- | --- | --- |
| B 明确失败，前缀与第二个短事务都成功 | `committed` | `rolled_back` | 排队 | 继续，不把 B 的失败归给 A |
| B 明确失败，前缀成功，第二个短事务失败或不确定 | `committed` | `unknown` | 等连接状态明确 | B 实际有回执时 `query` 认回，否则按五项证明 |
| B 明确失败，前缀 COMMIT 失败或不确定 | `unknown` | `unknown` | 同上 | 不保存 B 的依据 |
| B 遇环境错误，`ROLLBACK TO` 成功 | 按前缀的真实结果 | `unknown` | 排队 | §7.6 |
| B 的语句结束了整个外层事务，有新暂存前缀 | `unknown` | `unknown` | 未执行，等恢复 | 丢弃全部暂存。不把 A 标为 `rolled_back`，不保存依赖 A 的 B 依据 |
| 同上，没有新暂存前缀 | 不适用 | 第二个短事务持久后为 `rolled_back`，否则 `unknown` | 排队 | §7.7.5【提案 P-10】 |
| `ROLLBACK TO` 或 `RELEASE` 失败，事务状态不明 | `unknown` | `unknown` | 未执行 | 停止该代际的准入，收尾并恢复，不在该连接上处理后缀 |
| 外层 COMMIT 确定失败而事务仍在 | `unknown` | `unknown` | 等收尾 | 不自动重执。即使确定没有提交，`commit` 也不返回 `not_committed` |
| COMMIT 完成而响应丢失，或不能判定是否持久 | `unknown` | `unknown` | 等恢复 | 不补写回滚回执，由 `query` 认回 |
| Worker 在外层 COMMIT 之前退出 | `unknown` | `unknown` | 已发送未结算的调用为 `unknown` | 观察到退出后，经 DO-1 路径 A 恢复 |
| Worker 在前缀提交之后、B 的回执之前退出 | `query` 认回 `committed` | `unknown`，恢复后可能为 `not_committed` | 同上 | B 的易失依据已丢失，不重算 |
| Worker 在 B 的回执提交之后、回复之前退出 | `query` 认回 `committed` | `query` 认回 `rolled_back` | 同上 | 响应与回执同在 |

Worker 在操作途中退出时，已发送、尚未结算的 `commit` 调用方得到 `unknown`（诊断 `worker_exited`）【提案 P-13】。批级故障只卷入新暂存的身份，本组之前已持久的回执不受影响。提供者记录一次批诊断，逐个结算原请求，不伪造业务响应。批级故障扩大 `unknown` 的范围，这是可见的可靠性成本，它不扩大业务回滚的范围。

前缀 COMMIT 失败或结果不确定时，A 与 B 都为 `unknown`。提供者不在新事务中保存 B 的依据，因为这份依据可能观察过 A 的暂存写入。

##### §7.7.3 等待者

一个身份在本组的第一次尝试取得解释权。原尝试最终为 `unknown` 时，同摘要与异摘要的等待者都得到 `unknown`，异摘要等待者不成为新的赢家。

##### §7.7.4 逻辑顺序

成功组的逻辑串行顺序是新操作首次执行的 FIFO 顺序。各操作的线性化点都在本组的物理提交处。B 可以读取 A 的暂存写入，B 的依据与 A 一起持久之后才发布。外部快照只能看到组前或组后的完整状态。只含守卫的操作，其响应与回执也按同一规则持久化。

##### §7.7.5 前缀为 0 的整事务结束

【提案 P-10】情形：B 的语句结束了整个外层事务（例如 `OR ROLLBACK` 或 `RAISE(ROLLBACK)`），并且本组没有新暂存前缀，即 B 之前的条目只是认回或在 §7.2 第 9 至 15 步被拒绝。

规则：提供者确认事务已经结束，然后用第二个短事务写入 B 的 `rolled_back` 回执与响应。第二个短事务持久后，B 为 `rolled_back`，否则为 `unknown`。

理由：这与 S1「参加者端口」的现行规则相同。本组没有暂存写入时，B 的依据只依赖持久事实。单独组因此完全保持 S1、S2 的单操作语义。有新暂存前缀时，A 与 B 都为 `unknown`（§7.7.2）。

### §8 query

`query(identity)` 在写路径上按完整身份取得权威结果。它是排序屏障，不进入正在执行的外层事务，不读暂存回执，不使用读池。它有独立的队列 `queryQueuePerDomain` 与 `queryQueueGlobal`。同一身份的并发查询可以共用一次读取。回执记录提交结果，`query` 不新建 Run，也不发送通知。

下列情形返回 `unknown`：提供者关闭已经开始；字段违规，或协议版本不是 `'2'`；队列已满；域为 `absent` 或绑定另一作用域；打开失败；域为 `quarantined` 或 `recovering`。这些结果不透露另一作用域是否有相同操作键的回执【提案 P-01】。域为 `unopened` 时，`query` 触发域打开。

域为 `ready` 时：

1. 持久回执存在：返回该回执与原响应证据。
2. 原身份在待决索引中：返回 `unknown`。待决索引覆盖排队、已封组、执行中、已暂存、第二个短事务中、结果已发出而预留未归还、等待者与旧代际未结算的全部状态。
3. 否则，五项证明全部成立才返回 `not_committed`，缺任何一项返回 `unknown`。

五项证明是：旧写代际已排除；旧事务已终止；数据库恢复已完成；权威读取已成功；该操作未进入受理队列。提供者构造这五项，调用方不组装。读 Worker 不能构造任何一项证明。确认撤下的操作不在待决索引中。每项证明的来源是提供者机制，见提供者规格 §8。

操作结果一览：

| 操作 | 返回 |
| --- | --- |
| `registerCombination` | `registered` 和已保存的登记，或 `rejected_before_accept` 和原因，或 `unknown` |
| `commit` | `committed`、`rolled_back`、`unknown`、`identity_conflict` 和已有回执、`rejected_before_accept` |
| `query` | 已提交回执、明确回滚回执、未知、未提交 |
| `read` | 读结果，或带原因的 `unavailable` |

### §9 read

#### §9.1 请求

【提案 P-11】提供者为每个域增加有限的只读连接，由读 Worker 持有。`read` 只读取，不认回提交，不进入 `commit` 的计数，有自己的队列与字节预算。业务只发送具名 handler 与版本化输入，不能传 SQL。`requestKey` 只用于关联与丢弃迟到响应，不是持久身份。`requestKey` 重复时不复用旧结果。`query` 与写路径读取使用写连接，`read` 使用读 Worker 的只读连接。

#### §9.2 结果与拒绝顺序

多个条件同时成立时，返回下列顺序中的第一个结果。

控制侧（第 1 至 6 步，不排队）：

1. `unavailable`/`closing`：提供者关闭已经开始。
2. `cancelled`：调用时 `signal` 已经中止。
3. `unavailable`/`invalid`：请求不能解码，或违反 §3.1 的字段规则。`requestKey` 无效时，结果中的 `requestKey` 为 `null`。诊断只写字段名。
4. `unavailable`/`read_limit`：输入超过 `maxReadInputBytes`，或嵌套深度、容器成员数超限。
5. `unavailable`/`handler_unavailable`：目录中没有该 `(handler, protocol)`。
6. `unavailable`/`queue_full`：读队列已满，或全局读结果预留不足 handler 的 `maxOutputBytes`。

第 1 至 6 步都通过后，控制侧预留结果字节，把请求放入域读队列。派发与执行（第 7 至 13 步）：

7. `unavailable`/`domain_unavailable`：域为 `absent`、绑定另一作用域、`quarantined` 或 `recovering`，或打开失败。
8. `unavailable`/`schema_unavailable`：该域缺少 handler 需要的迁移标记，或 handler 依赖的索引正在重建。
9. `unavailable`/`queue_timeout`：入队后 `readQueueTimeoutMs` 内没有派发。等待打开、`read-paused`、名额与串行屏障的时间都计入。
10. `unavailable`/`read_timeout`：运行超过 `readObservationMs`。提供者停止观察，SQL 继续执行，连接在清理完成之前不复用。
11. `unavailable`/`read_limit`：输出超过 `maxOutputBytes`，或读出的行数超过 `maxRowsRead`。提供者不交付截断的结果。
12. `unavailable`/`worker_exited`：交付之前读 Worker 退出，已读到的部分丢弃。
13. `unavailable`/`read_failed`：handler 返回 `failed`，语句出错，输出不是 JSON，或提供者内部错误。

取消：请求在队列中时，控制侧移出它，返回 `cancelled`。请求已派发而未开始时，Worker 确认撤下后才释放资源。请求运行中时，只结束观察，返回 `cancelled`，不打断 SQL，不释放连接或屏障。结果结算之后的中止不改写结果。

存储故障不包装成空页或 not-found。handler 输出中的领域结果由领域 codec 解释。提供者不自行发明分页。

#### §9.3 读取次序

| 次序 | 排序与快照 | 消费者 |
| --- | --- | --- |
| `snapshot` | 取空闲、无事务的读连接。`BEGIN` 后的首个读取固定快照，同一事务内完成全部 `SELECT`。快照包含调用之前已返回 `committed` 的提交。 | Session 普通页、模型视图、Agent load、生产者纯读取 |
| `domain-serial` | 先取连接，再申请该域的读屏障。屏障排在此前已准入的写之后。轮到时暂停后继的写与同类读，确认当前组已结束，再建立快照。屏障持有到读事务结束，或读 Worker 的退出被观察到。 | `ToolLedgerStore.read` 等要求与同域 `commit` 串行的读取。第一版屏障覆盖整个物理域 |

每次成功返回之前，提供者确认语句已结束、行已物化、事务已结束。提供者不复用读事务。一次 `read` 提供一个快照。跨多次 `read` 的分页由领域自己的固定读根与不可变记录保持范围，不长期持有 SQLite 事务。不能重建时，领域返回 gap、changed 或 unavailable，不拼接不同修订。领域适配器在交付每一页之前，按原领域要求核对当前资格，不复用建立快照之前缓存的结果。

下列读取留在写路径：事务内守卫、`query`、原回执的幂等读取、Model `beginRead`/`acquireRead`/ACK、可能写入排除记录的 Tool `lookup`/`queryOperation`。系统作用域的 `references` 与 `releasedScopes` 逐个域读取，不宣称跨域一个快照。

#### §9.4 handler 与读端口

handler 同步执行 `read(input, port)`。读连接为 `query_only`，不开共享缓存，不用 `immutable` 模式读 WAL 库，不创建数据库。authorizer 只允许对 `readTables` 执行 `SELECT` 与调用允许清单中的函数。提供者以有界迭代取行，累计行数将超过 `maxRowsRead` 时结束语句并返回 `read_limit`。handler 的每条语句须写 `LIMIT`。读 Worker 与连接的管理归提供者（提供者规格 §9.5）。

### §10 SQL 值

【提案 P-12】形状见 `src/worker.ts`。

- 参数 `bigint` 限有符号 64 位，超出时在执行前失败。布尔参数编码为 0 或 1。参数只能是 `null`、布尔值、有限数、64 位 `bigint`、字符串或 `Uint8Array`。
- 读取时，INTEGER 一律为 `bigint`，REAL 为有限 `number`，TEXT 为 `string`，BLOB 为复制后的 `Uint8Array`。其余值拒绝，不隐式转换。
- 行是位置数组，长度等于列数。没有 INSERT 行身份时，`lastInsertRowid` 为 `null`。
- `facts` 中的领域位置仍是十进制文本，由领域 codec 转为 `bigint`。`facts` 不能含 `bigint`。
- `QueryRows` 只在 Worker 内使用，不直接作为 HTTP JSON。

### §11 资格与外域前提

SQL 不判断资格，也不提供撤权排序。按 Reduce 的范围裁定，资格核验在每次提交尝试内调用一次，撤权在下一次核验时生效。核验与提交之间的窗口是已知限制 L-1。参加者在事务内读取资格事实时，按 §7.5 的依赖顺序先于依赖它的领域写参加者执行。事务事实只运输语义拥有者定义的结果。

Tool 外部启动的排序归 Tool 拥有者。SQL 写代际只排除 SQL 写者，不排除库外的旧进程。

Session 采用响应证据后，删除事务外重算的正常退路。R7 的操作归属辨认仍归 Session 拥有者，缺少时保持 `unknown`。

### §14 Cordis 集成符合性（契约部分）

采用 Cordis `4.0.4`。basis 的 probe 记录见 `.meta_harness/design/basis/README.md`。下表是设计符合，不是运行通过。提供者部分见提供者规格 §14。

| IC | 承载 | 后继须能失败的验证 |
| --- | --- | --- |
| 1、3 | 三个服务定义唯一在 sql-contract；抽象 Service `implements` 根接口；`@owner` 按真实路径核对 | 定义唯一；签名来自同一根接口 |
| 2 | `static readonly provide`；提供者继承，不再 provide | 重复 provide 失败（basis `service-subclass-provides-its-key`） |
| 4、5 | 两个成员的根不导入 Cordis；领域适配只消费 sql-contract | 源码、声明与产物检查 |
| 6、18 | 一个 isolate 一个 `storage` 提供者；作用域显式，空租户不是系统作用域；注入不是授权 | 另一租户的相同操作键不认回也不冲突（basis `isolate-hides-instances-not-data`） |
| 7 | 键 `storage`、`storageHost`、`tenantDomains` 表达能力 | 没有以实现命名的键 |
| 9–12 | 不新增公开事件。结果拥有者先收下持久回执，再做可能失败的通知 | 通知失败不改变提交结果 |

### §17 消费者路由

| 公开入口 | SQL 路由 |
| --- | --- |
| Session `commit` | 写路径，`session` 参加者；响应证据保存原失败依据 |
| Session readWork、readInput、loadRecovery、history、readModelView、pending | `snapshot`，每页一个有界事务 |
| Session references、releasedScopes | 逐个租户域 `snapshot`；目录归 Context r3 与应用 |
| Session queryOperation（R7） | 写路径先查原回执，未命中按原归属 `query` |
| Agent load、inputs、readReplyAdmissions | `snapshot`；准入范围按 D5（Agent 契约拥有者） |
| Agent journal.query、ExecutionRecovery.query、`received` | 写路径；`received` 与 ACK 是两次提交 |
| Model scanPending、loadRecovery、dispatches | 经 Model 提供者分类的 `snapshot` |
| Model admit、retry、发送前裁定、acquireRead、beginRead、ACK、commands.query | 写路径 |
| `ToolLedgerStore.read`、Tool readResult、account、loadRecovery | `domain-serial` |
| `ToolLedgerStore.commit`、Tool lookup、queryOperation | 写路径；call、queue、host 各自提交 |

`_sql_` 表（绑定、写代际、回执、响应证据、迁移标记、登记）归 SQL 提供者。领域表归各自的参加者拥有者。D5 的公开协议归 Agent 契约拥有者。SQL 只承诺 `(作用域, execution, admission_sequence)` 有序唯一索引，读成本 `O(log N + Δ)`，前提是拥有者给出可验证的下界与完整前缀依据。

## 所有权、失败与生命周期

### §13 关闭协议

#### §13.1 发起者与期限

关闭有两个发起者，都调用同一个 `StorageControl.close`：

- `assembly`：装配关闭适配器在装配 `close` 的排空阶段调用。
- `disposal`：绑定插件的受管 effect 在 fiber 撤除时调用。插件行被停用、`storageHost` 换代引起插件重跑（IC-8）、根撤除，都走这条路径。

关闭期限只有一个来源：配置 `closeDeadlineMs`（插件配置字段，初值由装配填写）。第一次调用 `close` 时，提供者用单调时钟算出绝对期限，之后不延长。`close` 是幂等的：每次调用都在「全部资源已结束」与「期限已到」两者中较早的时刻返回当时的结果。effect 的撤除可以并发，异常可能只记日志（basis `effect-disposal-concurrent-not-ordered`），因此 `disposal` 路径的完成不证明业务已收场。

#### §13.2 租约

每个 Worker 启动前，提供者调用 `closeLeases.admit(<租约名>)`，一个租约对应一个 Worker。租约名为 `storage/<提供者代际>/<writer 或 reader>/<域文件名>/<Worker 代际>`。`admit` 抛错表示装配已经停止准入：提供者停止自己的准入，不启动这个 Worker。观察到 Worker 退出后，提供者按 §13.4 决定是否 `release`。

#### 关闭的调用方结果

关闭先停止新的准入。停止之后新到的 `commit` 返回 `closing`，不写入回执，也不进入队列。已经开始的语句跑完。提供者确认在途读取、语句、备份和消息的责任，然后观察连接关闭和 Worker 退出。已经发出的外部效果保持发出时的状态。关闭的步骤归提供者（提供者规格 §13.3）。

结果：全部连接关闭、全部 Worker 退出都已被观察时，返回 `closed`。期限到达时仍有 Worker 未退出，返回 `incomplete`。`residuals` 为每个未退出的 Worker 列出域、角色、Worker 代际、租约名与在途原身份，不含 SQL 或业务正文。

被撤下的 `commit` 与 `registerCombination` 得到 `unknown`（诊断 `withdrawn_before_start`），不写回执。期限到达时尚未收场的 `commit` 得到 `unknown`（诊断 `close_deadline`），其预留由残留 Worker 保留到退出。排队的 `query` 得到 `unknown`，排队的 `read` 得到 `unavailable`/`closing`。已给出的结果不被迟到消息改写。迟到完成的写仍会持久保存，由原身份 `query` 认回。关闭不把在途操作报成回滚，结束 Worker 也不是回滚。Worker 被结束之后，调用方按原身份查询在途操作。

#### §13.4 报告闩锁

- 提供者向 `assembly` 发起的调用返回 `incomplete` 时，设置报告闩锁。闩锁下，残留 Worker 的租约只在两个条件都满足时 `release`：该 Worker 的退出已被观察；装配关闭适配器已调用 `assemblyReportSettled()`。期限到达而语句未结束时给出 `incomplete`，语句之后结束也不提前 `release`，装配报告为 `timed-out`，不是 `failed`。步骤不执行。
- `assemblyReportSettled()` 是幂等的，只解除闩锁，不能使仍在运行的资源变为空闲。报告确定之后的 `release` 不改写报告。
- 只有 `disposal` 调用得到 `incomplete` 时，不设闩锁。残留 Worker 退出后，租约立即 `release`。装配之后开始 `close` 时，会等待仍持有的租约。
- 装配关闭适配器对每个保存的控制口（包括插件重跑之前的旧代际）调用 `close({ initiator: 'assembly' })`。
- `close`、`assemblyReportSettled`、租约与闩锁都是提供者与应用之间的协议，不是 Cordis 的 API。存储关闭不放进排空之后的步骤列表。

### 内存替身

纯函数无状态、无资源。内存替身把全部状态放在一个实例内，操作按到达顺序串行。它的持久性是 `none`，进程结束即丢失。替身只建模 absent、ready 与 closed 三个域状态：另一作用域的请求得到与 absent 相同的结果（含诊断），唯一例外是登记时的 `domain_occupied`。替身中取消只结束观察：调用之后中止，调用方得到 `unknown`（`observer_detached`），操作照常完成，可用原身份 `query` 认回。关闭后新操作得到 `closing`，未开始的操作得到 `unknown`（`withdrawn_before_start`），在途操作完成。替身不产生外部效果。

替身的拒绝顺序：`commit` 先按 §7.2 第 1 至 7 步在控制侧判断（`closing`、`cancelled`、`field_missing`、`unsupported_protocol`、`participant_repeated`、`facts_not_json`、`command_limit`），再判第 11 至 15 步；多个条件同时成立时返回第一个。

### 禁止

服务键 `sqlStorage`、定义名 `SqlStorageService` 与任何别名；`StorageControl` 作为服务属性或进入 `Context`；根与 `./worker` 导入 Cordis。

PostgreSQL 提供者使用独立的 `pg` 与 Kysely 事务租约，返回已提交、明确回滚和未知，并按原身份接受查询。写连接数量、`BEGIN IMMEDIATE`、WAL 读回和文件快照只属于 SQLite 提供者。一次 `commit` 使用一个事务域。第二个库的写入使用另一次提交。本规格把 PostgreSQL 集群留给单独的部署决定。PostgreSQL 提供者尚未建立。

断电耐久以相应故障试验为证据（[SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01)）。当 `synchronous` 为 `FULL` 时，普通进程终止证明进程级持久。

## 组合与验证

### §16.1 场景

下列场景是验证义务，不是已运行的结果。场景 C01 至 C23 都须在相应成员内运行并保存提交、命令、环境、退出码与原始日志。验证单元按顺序为：V1 契约与同源替身；V2 Windows Node Worker 提供者；V3 消费者与索引；V4 LI-A3-5 与 E9 的真实轨迹与测量。

| ID | 性质 | 必须变红的反例 |
| --- | --- | --- |
| C01 | 完整身份认回 | 改动五个维度之一，或同身份改输入 |
| C02 | 两种摘要（含 §4.4 向量） | 命令或对象键顺序改变摘要；非 JSON 值被接受 |
| C03 | 多参加者同提交、依赖顺序与平局规则 | 缺依赖参加者仍执行；执行了 `commands` 以外的参加者 |
| C04 | 两段回滚与组内局部失败（§7.7.1、§7.7.5） | 第二个短事务失败或有前缀的整事务结束时返回 `rolled_back` |
| C05 | 原响应不丢失 | 回滚后改状态再 `query` 得到新理由 |
| C06 | 五项证明与待决索引 | 撤掉任一项证明，或删除暂存与等待者状态后返回 `not_committed` |
| C07 | 端口与事实格边界 | 越权表、事务控制、捕获错误后继续执行、跨操作读事实 |
| C08 | 64 位值 | number 强转、截断、`lastInsertRowid` 泄露 |
| C09 | snapshot 一致，读前提交可见 | 两次 SELECT 看到不同状态；复用旧事务 |
| C10 | `domain-serial` 与整组串行 | 快照建好后提前释放屏障 |
| C11 | 写型读取留在写路径 | 这些读取进入读 Worker |
| C12 | `commit` 与 `read` 的取消 | 取消后立即减计数；运行中的连接交给下一个请求 |
| C13 | Worker 崩溃的逐身份结果（§7.7.2） | 旧 Worker 未退出就启动新写者；旧代际回复被接收 |
| C14 | 关闭期限与报告闩锁 | 迟到结束提前 release；把结束 Worker 当回滚 |
| C15 | 有界资源 | 每域合规而全局无界；先全量读取再计数 |
| C16 | 分区与文件绑定 | 另一作用域结果与 `absent` 不同；文件别名被接受 |
| C17 | DO-1 与原子迁移 | 重启后需要再调用登记才迁移；迁移失败后放行写准入；打开失败返回 `rolled_back` 或 `not_committed` |
| C18 | G1 批写 | 保存前发布；跨 ACK 与 `received` 合并 |
| C19 | WAL 维护 | 降低 FULL；维护饿死 `query` |
| C20 | G2-P：两个真实原操作同一物理提交 | 全部材料标 singleton；把 G1 片段数当身份数 |
| C21 | 分组资格与模块纯度 | FK-1 合组后变为成功；时间函数被允许；模块跨调用缓存状态 |
| C22 | SQ-1 序位 | 模块缓存序位上界；失败后在同一外层事务继续后缀 |
| C23 | Cordis 装配 | 构造失败未使 fiber `FAILED`；Worker 挂在调用方 ctx；重跑后出现两个写者 |

S1 的其他验证要求保留：查询携带的作用域与回执不同时返回 `unknown`；两个参加者的事实同时出现在同一份已提交回执中，任一命令失败时该回执为明确回滚；回执已经写入、响应尚未返回时结束 Worker，用原身份 `query` 得到已提交回执；锁等待超过 `lockWaitMs` 时 `commit` 返回 `unknown`；断电耐久只在记录了相应故障试验时声明。测试通过 `commit` 和 `query` 观察结果，不直接断言 SQL 文本。

### 本包的验证资源与覆盖

验证资源在 `tests/`：每条字段规则、每个拒绝原因各一条只违反它的用例，相邻两步的顺序用例，摘要向量与 RFC 8785 数字用例，`combinationManifest` 每类问题的用例，入口与不含 Cordis 的依赖检查，以及符合性套件对替身和故意违规提供者的用例。

符合性套件只含 C01 至 C07、C12、C14、C16。场景 C08 至 C11、C13、C15、C17 至 C23 由 [sqlite-provider](../sqlite-provider/SPEC.md) 的提供者测试承担，这个套件不覆盖它们（已知限制）；替身通过套件不证明这些性质。提供者在 SQLite 上的行为只由提供者测试证明。仍未执行的项：跨进程排除、真实磁盘的 Windows 故障注入、SQL-T01 断电、E9。
