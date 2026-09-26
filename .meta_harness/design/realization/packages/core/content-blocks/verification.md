# content-blocks 验证与证据

契约侧的证据义务权威在 [`spec/data/content-blocks/verification.md`](../../../../spec/data/content-blocks/verification.md#证据义务)（V-1～V-11、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 带「校验对象」的各节逐行过包内校验；包内 Schema 副本与 spec 逐字节相同 | **已通过**：本 run `schema.spec.ts` 的162行（60合法／102拒绝）、22定义与副本相同；[原 log](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/content-blocks/test.log)，[输入核对](../../../../record/evidence/2026-09-26-tests-core-foundation/audit.json) | 本节点 |
| V-2 拒绝值的具名与次序 | 每个拒绝行逐字相同；第 12 节六行专验次序 | **已通过**：全部 ContentBlock 行具名判定、第12节六行、反转兄弟顺序、原输入不改；[306/306](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-content-hub.log) 的 `schema.spec.ts` | 本节点；这是模块接收函数，真实接收／落盘仍另证 |
| V-3 Schema 管不到的形状约束 | 媒体类型两处不逐字相同、派生块与原块同模态、非规范写法不被改写；「一条消息内 `id` 重复」那一条归 messages 节点的接收边界 | **模块部分已通过**：`content.spec.ts`，含文本文件与无模态文件；[逐项对应](../../../../record/evidence/2026-09-26-tests-core-foundation/coverage.md#packagescorecontent-blocks) | 本节点（前三条）；消息内唯一性归 messages |
| V-6 `opaque` 模块内原样往返 | 大整数、嵌套对象／数组、null、缺席各自保留；原输入不改，返回自有冻结值 | **模块部分已通过**：`json.spec.ts` 的原文相等断言与 built public consumer；[原 log](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/content-blocks/test.log) | 每一处日志／传输／存储读写边界仍属 CB-2 |
| V-11 模块内严格读、数无损 | 解码后重复成员名（转义／嵌套）交中性 failed，不挑键；块文本测试映射 malformed；大数原文字面往返；只证模块部分 | **已通过**：`json.spec.ts`；Node24.18.0 六原文 API／公开函数[探针源码](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/content-blocks/node-probe.mjs)与[原结果](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/content-blocks/node-probe.json)；深度128／长输入100000字符为有限测试 | stream-assembly 负责唯一参数解析及 unparseable 映射；各外部 JSON 跳点负责实际应用严格读写 |
| V-10 中的 SC-2、SC-3 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | **部分**：模块不提供 rawArguments 解析器且测试观察不解析；`types.spec-d.ts` 由 built exports 核 opaque 字段读取／索引负例。尚未核真实 stream 模块的参数调用白名单，也未核所有外部 opaque 消费者 | SC-2 的产品准入在 stream 实现后由 W6 关闭；SC-3 的公开品牌形状已验证，外部传输例外／消费者仍属各 owner |
| `ModelToolName` 副本对齐 | 放在 tool-definition 节点 | — | tool-definition |

**不在本节点**：V-4（规范场景，要真实接收边界与落盘）、V-5（合取取用，归组装）、V-7（落盘之后不变，归日志写入方）、V-8（走查，与消费者共同做）、V-9（跨进程，本版装配下无法演练）；SC-1、SC-4。

**公开面静态前提**：`core-pure-imports` 已有正反例与本包真实源码扫描。首次 HUB 对本包公开 `./schema` 导入误报而退出1；工具补齐本包 Schema 许可、保留运行时禁止依赖后，101/101 自测与24-rule scan通过，原失败未覆盖。spoke仅20条旧规则，不作为最终纯性gate。范围见[逐项覆盖](../../../../record/evidence/2026-09-26-tests-core-foundation/coverage.md#packagescorecontent-blocks)。

## 实际执行

采用 `data.content-blocks` v1（D-041／D-042／D-045），实现 `44b84525e998113b45e3b0b351caf1041f23cd75`，HUB merge `be07910a2fc3f84f5d9909675b3736c5acba7b74`。
spoke 与 HUB 包构建／类型检查／测试均退出0，**306/306**、5文件、零跳过／失败；HUB先 `pnpm install --ignore-scripts` 加入新包，实际未提交lock字节由47c4990a恢复，be079只表示提交起点；
[spoke build](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/content-blocks/build.log)、[typecheck](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/content-blocks/typecheck.log)、[test](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/content-blocks/test.log)、[HUB原log](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-content-hub.log)。
Node24.18.0／Vitest4.1.11／TypeScript6.0.3／Ajv8.20.0；包 engines 固定 `>=24.18.0 <25`；严格无损读写依赖实际 `context.source` 与 `JSON.rawJSON`。
内嵌 public-consumer 测试另启真实Node、消费 built root／Schema exports及完整调用大参数；declaration消费者由公开入口核负向类型。
原 Schema 副本 SHA `c3d6361a…` 与冻结原件同字节；六份采用输入逐hash核对。

首个 HUB 外层退出1由随后纯性scan误报导致，包三命令各为0。修正自测时 HEAD仍be07910a，两个工具文件与新增content importer的lock未提交，
之后逐字节由47c4990a保存；不能说运行起点已包含那个提交。边界build／scan／format通过后同shell提交至47c4990a，
[101/101原log](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-own-schema-check.log)、[最终边界log](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-content-boundary-hub.log)与精确输入快照独立保留。
主调度另有公开函数[独立JSON结果](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-content-independent.json)：6数字／3重复键／完整调用往返／精确bytes；
第一次代码仅在工具heredoc，这份JSON只登记观察结果，不声称单凭它可重放原执行。
随后在HEAD a213f590保存[同代码脚本](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/content-independent-probe.mjs)，
主调度从 `packages/core/content-blocks` cwd实际重放退出0，[另存新JSON](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-content-independent-replay.json)，
从公开self exports解析built dist；源码仍44b84525、配置／锁与47c4990a同字节，旧JSON未覆盖。
完整来源与责任边界见[run README](../../../../record/evidence/2026-09-26-tests-core-foundation/README.md)。测试通过不提升最终接受状态。

## 覆盖缺口

- **模块内已取得证据**：V-1／V-2／V-3前三项、V-6／V-11模块部分及公开opaque负向类型已验证；空绑定表是无formal task，并非无实现。
- **SC-2真实消费者准入尚待实施后检查**：模块内不解析rawArguments不替代stream-assembly唯一参数解析、失败映射与调用白名单；完整外部SC-3仍需消费者核对。
- **精度与重复键的端到端证据缺一半**：模块内往返测试证不了「每一跳都用了严格的无损读写」；那一半要在各读写边界节点各有一条会失败的用例（CB-2；存储那一跳按 M53 归 `infra/storage-sql`）。owner：各读写边界节点。

## 独立评审

2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行）：本节点应修 1、范围外 1，无阻断；主线据此裁定 [D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M49、M53（批的结论见同节 N-28）。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| 应修 1 | 严格无损读写依赖 Node 的 `context.source` 与 `JSON.rawJSON`，节点只标了「假设、须取证」；它是全批 M36 的唯一实现点，取证要在实现路径定稿前做 | 按 M49：探针入证据库（Node v24.18.0，退出 0），改为「已取证（Node ≥ 24.18.0，实施时以 `engines` 钉下限）」；手写解析器退路保留为改选条件；置信度由中升中高 | design.md「严格的无损 JSON 读写」前提一行、改选条件与本方弱点；本页 V-6 状态 |
| 范围外 | 「每一跳无损」对已实现的 `infra/storage-sql` 产生新要求（JSON 列按文本、驱动不自动解析），没有登记处 | 按 M53：定为全库口径，登为 storage-sql 的实施缺口（owner storage-sql），本节点不改自身设计 | design.md CB-2；本页覆盖缺口第二条 |
