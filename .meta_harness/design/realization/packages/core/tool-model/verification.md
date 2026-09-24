# tool-model 验证与证据

契约侧的证据义务权威在六份契约的验证入口：[`data.tool-definition`](../../../../spec/data/tool-definition/verification.md#证据义务)（V-1～V-11）、
[`data.loop-extension`](../../../../spec/data/loop-extension/verification.md#证据义务)（V-1～V-11）、[`data.skill-package`](../../../../spec/data/skill-package/verification.md#证据义务)（V-1～V-9、SC-1～SC-4）、
[`data.slash-command`](../../../../spec/data/slash-command/verification.md#证据义务)（V-1～V-6、SC-1～SC-6）、[`data.mcp-endpoint`](../../../../spec/data/mcp-endpoint/verification.md#证据义务)（V-1～V-6、SC-1～SC-4）、
[`data.connector`](../../../../spec/data/connector/verification.md#证据义务)（V-1～V-6、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| TD V-1、LE V-1、SP V-1、SLC V-1、ME V-1、CN V-1 形状校验 | 各契约 `examples.md` 参与机检的正反实例逐条过包内校验；TD、ME 的反例另核 M 编号；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| SP V-2、SLC V-3、ME V-2、CN V-2 拒绝值的具名与次序 | 每个拒绝行逐字相同；各契约的优先级专节逐行 | 未开始 | 本节点 |
| TD V-2 生成规则逐字核对 | examples 第 9 节三命令实例对 S-7 五条；九条调用按模型面与所选命令各判一次；含一个增补平面字符的命令名，核命令表按码点而非 UTF-16 码元排序 | 未开始 | 本节点 |
| TD V-9 多命令派发以 `commands[c].input` 判参数 | 过了模型面、判定不过的三条调用都被拒；顶层没写 `additionalProperties` 的 schema 收到未知键被拒 | 未开始；`format` 那一半受阻于 TM-2 | 本节点（判定）；「被拒之后怎样收场」归执行运行时 |
| TD S-18 逆转写唯一 | `__`、`_:`、`:_` 三种相邻各一个反例；转写后长度 ≤ 128 的边界两侧 | 未开始 | 本节点 |
| TD V-10 静态检查 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |
| LE V-2 两张合法组合表机检 | 13 个位置（含维度）× 8 种结论 × 3 档逐一构造，比对 Schema 与 S-20、S-21 的 ✓／✗ 及拒绝值 | 未开始 | 本节点 |
| SP V-3 Schema 管不到的约束（examples 第 9 节） | 资源路径重复与前缀冲突、设置项名重复、`default` 不合取值域、名字与能力标识不一致等 | 未开始 | 本节点 |
| SP V-4 文本形式的读法（examples 第 6 节十五行） | 比对读出的 `manifest`、`body` 与拒绝值本身 | 未开始；受阻于 YAML 库的采用（TM-5） | 本节点 |
| SP V-5 目录形式的读法（examples 第 10 节八行） | 纯函数那一半本节点可用构造好的条目跑；「真实文件系统、执行位、成环链接」那一半归读目录的一方 | 未开始 | 本节点与读目录的节点 |
| SLC V-2 判定用例集（examples 第 4 节五十行） | 本语言这一份实现逐行跑通（交付面人读、机读、受理面三种调用形态） | 未开始 | 本节点；另一种语言的实现另跑 |
| SLC V-6、ME V-6、SP V-9、CN V-6 的静态检查 | 见 design | 未开始；规则不存在 | 本节点承载的几条见 design；其余归消费者 |
| ME V-3 Schema 管不到的约束（examples 第 9 节） | 接收边界那一半 | 未开始 | 本节点；写入方（治理写面、MCP 桥）那一半归它们 |
| `ModelToolName` 副本对齐（TM-4） | message-model 的 CB Schema 与本包 TD Schema 的 `$defs/ModelToolName` 逐字相同 | 未开始 | 本节点 |
| TD V-11、LE、SP V-7、SLC V-4、ME V-5、CN V-4 消费者走查 | 结构化走查 | 未开始 | 本节点与各消费者节点共同走查 |

**不在本节点**：TD V-3～V-8（`help` 与 `inspect`、声明与实际对得上、裸字符串落消息、卸载、后台许可、坏定义不折叠——执行运行时与注册表）；LE V-3～V-11（派发器与兼容层）；SP V-6、V-8；SLC V-5；ME V-4 的真实求值那一半；CN V-3 的受理那一半、V-5。
跨进程各行**本版装配下无法演练**。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **六份契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **包建不起来**：TM-1（包级依赖成环）不解，上表所有「本节点」行都无从开始。owner：主线。
- **两处契约语义未定**：`format` 的判定（TM-2）与远端正则的执行安全（TM-3）；前者没有可测的规范，后者没有可测的拒绝值。owner：主线。
- **SP V-4 受阻于第三方依赖的采用**（TM-5）。owner：主线。
