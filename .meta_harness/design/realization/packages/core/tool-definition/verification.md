# tool-definition 验证与证据

契约侧的证据义务权威在 [`spec/data/tool-definition/verification.md`](../../../../spec/data/tool-definition/verification.md#证据义务)（V-1～V-12）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～8 节正反实例逐条过表示层校验，反例另核拒绝值与 M 编号；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| S-26 第 13 行 `schema_unsupported` 与 G-16 的登记 | examples 第 5 节新加三行逐字得「拒绝值」一列（`^(a+)+$` 与超长 `pattern` 得 `schema_unsupported`，`"^("` 缺说明时先得 `input_not_schema`）；[登记项](design.md#schema_unsupported-的上限登记g-16) U-1～U-6 各一对正反例（边界两侧：1024 与 1025 码点、`{0,1000}` 与 `{0,1001}`；U-1 三种：只在不带 `u` 时合法的写法**被收下且按不带 `u` 判**、只在带 `u` 时合法的写法被收下且按码点判、两种都编不过得 `input_not_schema`）；合法简单 `pattern` 通过；命中多行时第 13 行恒在最后 | 未开始 | 本节点 |
| U-8 判定时限的值 | 本节点只登记值；「到点终止线程、那一项 `failed{schema_unsupported}`」的会失败用例在执行运行时（它的判定工作线程） | — | 执行运行时 |
| 判定对象不跨对象共享状态（M50） | 两只判定对象对同一批 examples 各判一遍得同一结论；丢掉一只后另一只照常判；模块顶层不持有随输入增长的结构（静态检查候选：以输入为键的 `Map`／`Set`、编译作者 schema 的 ajv 实例不得出现在模块顶层；本包自己 Schema 的校验函数是有界常量，不在此列） | 未开始；规则不存在 | 本节点 |
| V-2 生成规则逐字核对 | examples 第 9 节三命令实例对 S-7 五条；九条调用按模型面与所选命令各判一次；含一个增补平面字符的命令名，核命令表按码点而非 UTF-16 码元排序 | 未开始 | 本节点 |
| V-9 多命令派发以 `commands[c].input` 判参数 | 过了模型面、判定不过的三条调用都被拒；顶层没写 `additionalProperties` 的 schema 收到未知键被拒；带 `format` 的参数值不合格式时**不被拒**（M37：只作注解） | 未开始 | 本节点（判定）；被拒之后怎样收场归执行运行时 |
| V-12 的本节点那一半 | `format: email` 的参数收到 `"not-an-email"` 判为合格；对 `schema_unsupported` 的 schema，`judgeCallArguments` 返回 `{ unsupported }`、**不返回 `ok`** | 未开始 | 本节点；「作者工具不以全放行运行」「MCP 来源以同形替换件出现」归执行运行时、MCP 桥与注册表的场景 |
| S-18 逆转写唯一 | `__`、`_:`、`:_` 三种相邻各一个反例；转写后长度 ≤ 128 的边界两侧 | 未开始 | 本节点 |
| `ModelToolName` 副本对齐（TD-1） | content-blocks 与本包两处 `$defs/ModelToolName` 的断言键 `type` 与 `pattern` 逐字相同（依content-blocks冻结 `$comment` 的精确口径；各自title/description/examples/$comment注释保留，不比较为同字节） | 未开始 | 本节点 |
| V-10 静态检查 | 见 [design](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |
| V-11 消费者走查 CS-1～CS-8 | 结构化走查 | 未开始 | 本节点与执行运行时、注册表、MCP 桥共同走查 |

**不在本节点**：V-3～V-8（`help` 与 `inspect`、声明与实际对得上、裸字符串落消息、卸载、后台许可、坏定义不折叠——执行运行时与注册表）。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **`pattern` 的语法树筛查不是完全的回溯保护**：筛不出的那部分（如重叠的多选）没有本节点的证据形式，由 U-8 的判定时限在执行运行时的工作线程里兜底（TD-2）。
- **U-1、U-6、U-7 与 M50 依赖的第三方行为未取证**：ajv `code.regExp` 能否按 pattern 选标志、严格模式各子项、ajv 内部缓存对已编 schema 的引用方式、正则解析器的语法树形状，都是待核对主张；落包时先以包内正反例核，核不过即改登记。owner：本节点。

## 独立评审

2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行）：本节点应修 1、建议 1、转 spec-reviewer 1、范围外 1，无阻断；主线据此裁定 [D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M50、M55、M56（批的结论见同节 N-28）。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| 应修 2 | 参数判定的编译缓存是模块级、以 schema 指纹为键、无上界、无 owner、无释放路径，增长由远端 MCP 对端驱动；ajv 实例是否强引用已编 schema 未取证 | 按 M50：不设模块级缓存，编译产物与 ajv 实例归消费者持有的判定对象 `createParameterJudge()`（候选名），随它撤除；ajv 内部缓存降为实施时核对项 | design.md「Cordis 原语」effect 一行、S-4 投影行、新节「编译产物归判定对象，不设模块级缓存」、「状态、并发与失败映射」、TD-2；本页新加一行 |
| 建议 4 | 「加载时判一次、判参数时用同一份编译结果」与执行运行时的工作线程模型对不上（编译产物不可跨线程） | 按 M50：改为「同一份输入、同一份登记的上限 ⇒ 同一结论」，工作线程各造各的判定对象 | design.md「装配给 vs 协议给」第 3 行 |
| 转 spec-reviewer | S-26 行与 U-1 行对 `u` 标志的两种读法 | 按 M56：两行改成同一句（先不带 `u`、再带 `u` 试编；都编不过 ⇒ `input_not_schema`；任一编得过即按那种语义登记并判），ajv `unicodeRegExp` 按 pattern 逐条对齐；契约 S-26 原话不改 | design.md S-26 投影行、U-1、U-6、U-7；本页 S-26 第 13 行那一行 |
| 范围外 | `@eslint-community/regexpp` 是新第三方依赖，须主线登记 | 按 M55：作候选依赖登在「实现路径」，版本钉定与许可核对在实施程 | design.md「实现路径」、依赖节末段、TD-2 |

另：契约 G-16 随 [N-22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) T-16 加入判定时限，本节点登记为 U-8；G-15 由同一裁定关闭。
