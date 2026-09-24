# tool-definition 验证与证据

契约侧的证据义务权威在 [`spec/data/tool-definition/verification.md`](../../../../spec/data/tool-definition/verification.md#证据义务)（V-1～V-11）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～8 节正反实例逐条过表示层校验，反例另核拒绝值与 M 编号；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| M37 `schema_unsupported` | 编译不了的 schema、超长 `pattern`、含嵌套量词的 `pattern` 各一例得 `schema_unsupported`；合法简单 `pattern` 通过；次序照修复波 3 落进 S-26 的位置核 | 未开始；次序待契约落条款 | 本节点 |
| V-2 生成规则逐字核对 | examples 第 9 节三命令实例对 S-7 五条；九条调用按模型面与所选命令各判一次；含一个增补平面字符的命令名，核命令表按码点而非 UTF-16 码元排序 | 未开始 | 本节点 |
| V-9 多命令派发以 `commands[c].input` 判参数 | 过了模型面、判定不过的三条调用都被拒；顶层没写 `additionalProperties` 的 schema 收到未知键被拒；带 `format` 的参数值不合格式时**不被拒**（M37：只作注解） | 未开始 | 本节点（判定）；被拒之后怎样收场归执行运行时 |
| S-18 逆转写唯一 | `__`、`_:`、`:_` 三种相邻各一个反例；转写后长度 ≤ 128 的边界两侧 | 未开始 | 本节点 |
| `ModelToolName` 副本对齐（TD-1） | content-blocks 与本包两处 `$defs/ModelToolName` 逐字相同 | 未开始 | 本节点 |
| V-10 静态检查 | 见 [design](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |
| V-11 消费者走查 CS-1～CS-8 | 结构化走查 | 未开始 | 本节点与执行运行时、注册表、MCP 桥共同走查 |

**不在本节点**：V-3～V-8（`help` 与 `inspect`、声明与实际对得上、裸字符串落消息、卸载、后台许可、坏定义不折叠——执行运行时与注册表）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **`pattern` 的静态筛查不是完全的回溯保护**：筛不出的那部分没有本节点的证据形式，由执行运行时的调用超时兜底（TD-2）。
