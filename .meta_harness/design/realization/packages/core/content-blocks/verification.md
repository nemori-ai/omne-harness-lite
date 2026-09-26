# content-blocks 验证与证据

契约侧的证据义务权威在 [`spec/data/content-blocks/verification.md`](../../../../spec/data/content-blocks/verification.md#证据义务)（V-1～V-10、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 带「校验对象」的各节逐行过包内校验；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 拒绝值的具名与次序 | 每个拒绝行逐字相同；第 12 节六行专验次序 | 未开始 | 本节点 |
| V-3 Schema 管不到的形状约束 | 媒体类型两处不逐字相同、派生块与原块同模态、非规范写法不被改写；「一条消息内 `id` 重复」那一条归 messages 节点的接收边界 | 未开始 | 本节点（前三条） |
| V-6 `opaque` 原样回传 ＋ M36 读写口径 | 含 `9007199254740993`、嵌套对象与 `null` 的不透明数据经 `readJsonStrict`／`writeJsonLossless` 往返逐字相同；缺席与 `null` 各自保留；含重复成员名（含经转义写成的同名）的块文本在接收边界得 `malformed`（S-24；examples 新加的「两个 `kind`」那一行），`readJsonStrict` 本身交 `{ failed }`、不交挑过键的值；`12345678901234567890` 解析、写出、回读逐字不变（S-12、S-24）——**一条会在丢位或放过重复键时失败的测试** | 未开始。运行时前提（`context.source`、`JSON.rawJSON`）已由证据 run [`2026-09-25-node24-json-probe`](../../../../record/evidence/2026-09-25-node24-json-probe/README.md) 取证（Node ≥ 24.18.0，M49）；那次只证 API 可用，不证本包的读法 | 本节点做模块内那一半；**每一跳**那一半归各读写边界的节点（CB-2） |
| V-10 中的 SC-2、SC-3 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |
| `ModelToolName` 副本对齐 | 放在 tool-definition 节点 | — | tool-definition |

**不在本节点**：V-4（规范场景，要真实接收边界与落盘）、V-5（合取取用，归组装）、V-7（落盘之后不变，归日志写入方）、V-8（走查，与消费者共同做）、V-9（跨进程，本版装配下无法演练）；SC-1、SC-4。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **精度与重复键的端到端证据缺一半**：模块内往返测试证不了「每一跳都用了严格的无损读写」；那一半要在各读写边界节点各有一条会失败的用例（CB-2；存储那一跳按 M53 归 `infra/storage-sql`）。owner：各读写边界节点。

## 独立评审

2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行）：本节点应修 1、范围外 1，无阻断；主线据此裁定 [D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M49、M53（批的结论见同节 N-28）。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| 应修 1 | 严格无损读写依赖 Node 的 `context.source` 与 `JSON.rawJSON`，节点只标了「假设、须取证」；它是全批 M36 的唯一实现点，取证要在实现路径定稿前做 | 按 M49：探针入证据库（Node v24.18.0，退出 0），改为「已取证（Node ≥ 24.18.0，实施时以 `engines` 钉下限）」；手写解析器退路保留为改选条件；置信度由中升中高 | design.md「严格的无损 JSON 读写」前提一行、改选条件与本方弱点；本页 V-6 状态 |
| 范围外 | 「每一跳无损」对已实现的 `infra/storage-sql` 产生新要求（JSON 列按文本、驱动不自动解析），没有登记处 | 按 M53：定为全库口径，登为 storage-sql 的实施缺口（owner storage-sql），本节点不改自身设计 | design.md CB-2；本页覆盖缺口第二条 |
