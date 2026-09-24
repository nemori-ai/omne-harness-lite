# asset-registry 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/asset-registry/verification.md`](../../../../spec/capabilities/asset-registry/verification.md)：本版**不建形式工件**（[S-35](../../../../spec/capabilities/asset-registry/v1/contract.md#s-35-本版选用哪些形式工件)），证据全部是十二条规范场景与故障注入。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（清单头校验、条件追加、进程内队列不承担正确性）。**本节点尚未建包，一切未开始。**

## 证据义务

### 规范场景（十二条，全部未开始）

契约 verification 列每条的证据形式；本表只写**在本节点上**额外受阻于什么。**共同受阻**：装配清单没有提供者（本插件整批 `PENDING`）、据点读面没有节点（design 缺口 A-2）——可做的最小形态是在验收装配里用标明「非产品行为」的替身顶上这两者，那是本节点的测试，不是契约场景的通过。

| 场景 | 本节点上另外受阻于 | 状态 |
|---|---|---|
| [S-36](../../../../spec/capabilities/asset-registry/v1/contract.md#s-36-创建时填六张) 创建时填六张 | meta 门清单无家（契约 G-7）：「meta 门在 `tool` 表里且 `resident = true`」只能按求值给的常驻值断言；M34 那一支（过时的 `EvaluationRef` ⇒ `invalidInput{evaluationSuperseded}`）要两份六张表都来自同一份清单替身 | 未开始 |
| [S-37](../../../../spec/capabilities/asset-registry/v1/contract.md#s-37-reload-plugin-连带) reload-plugin 连带 | 「尝试中途 reload」一支（M35）：被顶替的那一份在内存里；另加一支——实例重启之后再读同一份报告，按装配清单那条记录现建（design 关键选择四），工作区提供的资产目录已改 ⇒ `unavailable` 而不是当前那一份 | 未开始 |
| [S-38](../../../../spec/capabilities/asset-registry/v1/contract.md#s-38-mcp-接入点连不上动作原位顶替) MCP 连不上，原位顶替 | MCP 桥（`packages/tools/mcp-bridge`，未建包）；另加一支 M37：桥把一个动作标成 `schema_unsupported` ⇒ 条目 `stand_in{for: schema_unsupported}`、同形 | 未开始 |
| [S-39](../../../../spec/capabilities/asset-registry/v1/contract.md#s-39-命令型服务报错之后命令不再可见) 命令型服务报错之后不再可见 | —— | 未开始 |
| [S-40](../../../../spec/capabilities/asset-registry/v1/contract.md#s-40-依赖缺失与恢复) 依赖缺失与恢复 | 提供者自报与有效运行模式没有读面（契约 G-6、G-9）：演练要替身 | 未开始 |
| [S-41](../../../../spec/capabilities/asset-registry/v1/contract.md#s-41-无权即不存在收回此刻起不存在再授予要等-reload) 无权即不存在 | 资产变化没有转发者（A-3）：「`onAssetChange` 之后」那一段要测试直接调 | 未开始 |
| [S-42](../../../../spec/capabilities/asset-registry/v1/contract.md#s-42-没人发-reload增删禁用不进来) 没人发 reload | —— | 未开始 |
| [S-43](../../../../spec/capabilities/asset-registry/v1/contract.md#s-43-重启之后重建) 重启之后重建 | 「逐条与重启之前相同」对断电不成立（design R-M7） | 未开始 |
| [S-44](../../../../spec/capabilities/asset-registry/v1/contract.md#s-44-依赖未解析与同名冲突) 依赖未解析与同名冲突 | —— | 未开始 |
| [S-45](../../../../spec/capabilities/asset-registry/v1/contract.md#s-45-不可用时明确失败) 不可用时明确失败 | 第 ③ 支（M32、M45）：求值替身以 `compositionCycle`／`categoryUnsupported` 失败 ⇒ 原样转交、不收成 `unavailable`；还要加一支：注入**求值模块抛出**，断言它是缺陷（原样上抛），不被收成 `unavailable` | 未开始 |
| [S-46](../../../../spec/capabilities/asset-registry/v1/contract.md#s-46-逐动作执行权限与接入点持有钉进报告) 逐动作执行权限钉进报告 | meta 门一支受阻于 G-7 | 未开始 |
| [S-47](../../../../spec/capabilities/asset-registry/v1/contract.md#s-47-别的运行的报告不能拿来-continue) 别的运行的报告不能拿来 continue | 尝试标识一支（M46）：报告带调用方交来的 `attempt`、缺席 ⇒ `invalidInput`；接收方按三者核对的那一半在 runner 与执行运行时 | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| N-1 | **实例交替时读得到旧实例在途的换表**（[关键选择二](design.md#关键选择)）：旧实例的 `reload` 在新实例建好缓存之后才追加成功；断言新实例的下一次 `lookup` 读到的是 reload 之后的表 | 演练：可控的清单替身让旧实例的追加挂住，期间让插件重跑，再放行 | 未开始 | 本节点 |
| N-2 | **两个写入者撞条件追加**：同一会话 `fill` 与 `reload(plugin)` 并发（两个实例、同一份清单），以及同一实例两次 `reload(skill)` 并发（队列关掉）。断言清单里一条接一条、没有半截、多表那一次整批成立、后到者按清单重做而不是覆盖 | **真并发**演练 | 未开始；受阻于装配清单提供者 | 本节点 ＋ 装配清单提供者（互指 R-M1） |
| N-3 | 条件追加连续两次冲突 ⇒ `unavailable`，缓存与清单都不留这一次 | 故障注入 | 未开始 | 本节点 |
| N-4 | `fill` 回执丢了的重试：同一个 `EvaluationRef` 再 `fill` ⇒ 原样返回、清单不多一条（R-M2）；此后有过 `markFailed`（只改 `slash_command` 一张、`basedOn` 沿用）再拿旧的 `EvaluationRef` `fill` ⇒ `invalidInput{evaluationSuperseded}`——判据取「六份任一 `filledBy ≠ assembly` 或 `basedOn` 已变」的最严一读（N-21） | 演练 | 未开始 | 本节点 |
| N-9 | **被顶替快照的留存**（[关键选择四](design.md#关键选择)）：一次尝试里接连两次 reload（内存只留上一份）⇒ 那一次尝试的读仍按它的报告所依的那一份，按装配清单记录现建；装配清单删了那条历史记录 ⇒ `unavailable`（R-M9 的反例） | 演练（清单替身） | 未开始 | 本节点 ＋ 装配清单提供者（互指 R-M9） |
| N-5 | 同一毫秒里连续两次换表，`filledAt` 严格递增（A-4） | 单元测试，可控时间替身 | 未开始 | 本节点 |
| N-6 | 撤除之后到达的调用答 `unavailable`；在途调用跑完、按它那一次追加收场 | 演练 | 未开始 | 本节点 |
| N-7 | 静态检查：本包不 `emit`、不监听事件；不 inject `storage`；求值只经 `core/asset-evaluation` 的公开入口 import，本包内没有第二份求值 | 结构检查（`tools/ts-checks` 的规则，候选），带「故意违反就失败」的自测 | 未开始 | 本节点 ＋ ts-checks owner |
| N-8 | `provide` 由 effect 纳管（kernel-basis probe `provide-is-effect-managed`）升格为 basis 条目 | basis 升格 | 未开始（**待核对主张**） | `core/kernel-basis` owner |

## 实际执行

**无。**本节点没有源码；契约本版没有形式任务。

## 覆盖缺口

- **全部条款没有任何实现证据**：源码、测试、集成运行都不存在。
- **整批受阻**：装配清单（A-1，对应契约 G-1）与据点读面（A-2）都没有提供者——本插件在它们出现之前不会进入 `ACTIVE`。受阻消费者：执行运行时的 `submit`、agent loop 的尝试开始（无节点）、`Tools()`／`Skills()`、斜杠命令识别、MCP 桥的接入点持有来源。
- **原先契约内部对不上的两处**（A-5、A-6）已随修复波 3 定下（M34、M35），证据义务落在 S-36、S-37 的新支与 N-4、N-9。装配清单与据点读面按 M43 本程不补。
- **契约 G-6 在本批的后果**：凡声明了外部服务、设施、存储或模态项的工具与技能一律是替换件——S-40 只能用替身演练，真实装配里可用的工具只有「没有这些项」的那几件。
- **不绑形式结论**：契约没有形式工件；[bindings](bindings.yaml) 为空。
- **契约 S-31 右列（协议须给）**本节点一条都不兑现；跨进程逐行重开（契约 G-11）。
