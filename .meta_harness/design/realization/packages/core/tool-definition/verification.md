# tool-definition 验证与证据

契约侧的证据义务权威在 [`spec/data/tool-definition/verification.md`](../../../../spec/data/tool-definition/verification.md#证据义务)（V-1～V-12）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～8 节正反实例逐条过表示层校验，反例另核拒绝值与 M 编号；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| S-26 第 13 行 `schema_unsupported` 与 G-16 的登记 | examples 第 5 节新加三行逐字得「拒绝值」一列（`^(a+)+$` 与超长 `pattern` 得 `schema_unsupported`，`"^("` 缺说明时先得 `input_not_schema`）；[登记项](design.md#schema_unsupported-的上限登记g-16) U-1～U-6 各一对正反例（边界两侧：1024 与 1025 码点、`{0,1000}` 与 `{0,1001}`、只在不带 `u` 时合法的写法）；合法简单 `pattern` 通过；命中多行时第 13 行恒在最后 | 未开始 | 本节点 |
| V-2 生成规则逐字核对 | examples 第 9 节三命令实例对 S-7 五条；九条调用按模型面与所选命令各判一次；含一个增补平面字符的命令名，核命令表按码点而非 UTF-16 码元排序 | 未开始 | 本节点 |
| V-9 多命令派发以 `commands[c].input` 判参数 | 过了模型面、判定不过的三条调用都被拒；顶层没写 `additionalProperties` 的 schema 收到未知键被拒；带 `format` 的参数值不合格式时**不被拒**（M37：只作注解） | 未开始 | 本节点（判定）；被拒之后怎样收场归执行运行时 |
| V-12 的本节点那一半 | `format: email` 的参数收到 `"not-an-email"` 判为合格；对 `schema_unsupported` 的 schema，`judgeCallArguments` 返回 `{ unsupported }`、**不返回 `ok`** | 未开始 | 本节点；「作者工具不以全放行运行」「MCP 来源以同形替换件出现」归执行运行时、MCP 桥与注册表的场景 |
| S-18 逆转写唯一 | `__`、`_:`、`:_` 三种相邻各一个反例；转写后长度 ≤ 128 的边界两侧 | 未开始 | 本节点 |
| `ModelToolName` 副本对齐（TD-1） | content-blocks 与本包两处 `$defs/ModelToolName` 逐字相同 | 未开始 | 本节点 |
| V-10 静态检查 | 见 [design](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |
| V-11 消费者走查 CS-1～CS-8 | 结构化走查 | 未开始 | 本节点与执行运行时、注册表、MCP 桥共同走查 |

**不在本节点**：V-3～V-8（`help` 与 `inspect`、声明与实际对得上、裸字符串落消息、卸载、后台许可、坏定义不折叠——执行运行时与注册表）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **`pattern` 的语法树筛查不是完全的回溯保护**：筛不出的那部分（如重叠的多选）没有本节点的证据形式，由执行运行时的调用超时兜底（TD-2）。
- **U-6、U-7 依赖的第三方行为未取证**：ajv 严格模式各子项、正则解析器的语法树形状都是待核对主张；落包时先以包内正反例核，核不过即改登记。owner：本节点。
