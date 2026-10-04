# R1-T1b：Storage/Clock 公共集成与提供者迁移

产品候选为 `a18ed435bcc244b50ffd4070e805a560e0912044`，实施 BASE 为 `e22311713b1a94d2e54e9976483d2f94f9a12ea6`。本次交付将 Storage/Clock 的正式 Service、服务键和 Context 类型归于公共定义，保留独立调用的 SQL 与租约时钟提供者。消费者同步改接，旧 clock 产品包与原根插件入口删除。52 个保护文件字节相同。

## 实际验证

| 范围 | 观察及限制 |
|---|---|
| 独立 L3 QA | B1～B8 的 76 个观察均完成。适用套件去重 1345 passed、0 failed、17 skipped。判决 Pass with issues。原所有失败、设施修订、有限范围及跳过项保留。 |
| 事务与数据身份 | raw/正式 Service 的 NORMAL/FULL 符合性；冻结 23 个 AT 观察、原 P13、通知、两向引用错误恢复及不同同文件实例拒绝通过。私有局部身份投影不成为租户授权或跨进程事务。 |
| 生命周期 | 拥有/借用、在途撤除、重复键、启动失败、Clock 缺席/换代及实际新清理路径通过。L1 新设施 5/5、C7 单次通过；原失败设施不改写。 |
| 公开边界 | 四目标包加两个前置依赖的 6 个实际 tarball；严格类型正例、17 私有入口和 5 旧符号负例；四纯根的源码/声明/运行闭包及独立调用、正式服务换代通过。 |
| 实际消费者 | entry 526 passed/2 skipped，host 独立必需五文件 100 passed。真实 SQLite、TLS、Unix、CLI 与离线模型路径完成。cold 两文件共 17 passed，原 45 秒阈值不变；旧失败原因未关闭。 |
| 主会话回归 | 原 48 成员 13512 passed/2 failed/35 skipped。两迁移遗漏修正后 3 成员完整快慢层 1728 passed/13 skipped；两修订合成覆盖为 13514 passed/35 skipped，不能称候选单次全跑。examples 另测，不混入 48 成员。 |
| 形式与工具 | OfferSettlement 有效配置 exit 0，113 个生成状态、82 个不同状态；两个负控 exit 12。既有有限配置不证明真实数据库或全部生命周期。构建、类型、Python 527 项、规则、文档、设计登记、生成一致性和格式完成。 |
| 共同硬线 | 同候选真实 CLI 5/5；正确发现原账本后 STRICT exit 0。原发现路径失败保留。方向、环、验收锁及删卡硬线通过，其他读数逐项处置。 |
| 架构与复杂度 | 四共享成员偏离 0；全局 124→148，移除 14/新增 38 条路径、没有新违规成员。未迁纯根路径仍待整改。14 对重复块的 28 个片段均在 BASE；模型示例 CC 47 未变。不宣称全局架构已改善或领域达标。 |
| 变异 | 13 报告共 177 killed、5 timeout、70 survived、64 no-coverage；原命令因 asset-registry 无快层用例 exit 1。限定复验 70 项仍存活。SQL 一项有具体等效边界，其他存活/无覆盖分别处置，没有满分或全绿结论。 |

原 QA B5.protected 的 clock.ts 注释差分描述为文字误差。原机读 SHA 与双方独立读回均表明 52 个保护文件字节相同。原报告及清单保持冻结，另附勘误。

## 保留范围

本批两个真实迁移遗漏（治理固定属性访问与宿主 clock-lease 日志筛选）已修复并复验。原 IR-CC-1 凭据判据由 R1-T2 对齐、R1-T5 复验；完整 W6 的 QA-FAC-1 归 N6。EIS 原超时及 A5/QA-N4-I1 冷恢复原因仍未确定；17 个冷恢复通过不能关闭根因，R2-T5 须取得阶段因果证据。PostgreSQL 完整恢复未纳入，17 个 skip 也不全是 PG。

QA 早期驱动没有逐次保存全部修订字节，原输出、执行记录和最终成功输入完整保留。最终 L1 的独立前置探针、正负控、两行差分及唯一产品运行可恢复；不把旧设施失败伪报为产品通过。

旧 Storage/Clock 行为契约及模型义务继续有效。本批只迁移四包集成承诺；身份、ActionIntent、插件树、十五模型操作及 Session 机制仍须后继设计和验收。全局 38 条新增 IC-4 路径和旧映射读数的处置是责任登记，不能用来关闭领域整改。未执行 make check、队列、付费模型或完整基准。

## 接受与原件

主会话在负责人的实施委托内作出[限定技术接受](../../decisions/shared-storage-clock-delivery/decision.md)。独立评审与 QA 是接受证据，不自行提升状态。

- [QA 报告](qa-report.txt)、[机读逐项结果](qa-report.json)、[冻结清单](qa-manifest.json)、[根读回](qa-root-readback.json)与[文字勘误](qa-erratum.txt)。
- [首轮实施评审](implementation-review.txt)、[修正补审](implementation-fix.txt)、[最终补审](implementation-final.txt)及[只读核对](implementation-readback.json)。
- [原回归](regression-first.json)、[修正及继承范围](regression-fix.txt)、[修正执行账本](fix-checks.jsonl)、[最终检查账本](final-checks.jsonl)及[运行事件](verification-incidents.txt)。
- [架构摘要](architecture-summary.txt)、[差分](architecture-comparison.json)、[处置](architecture-dispositions.txt)、[度量](metrics-summary.txt)、[STRICT](strict-status.txt)、[回路处置](loop-dispositions.txt)与[变异处置](mutation-dispositions.txt)。
- [形式运行](formal/runs.json)及其输入、实际模型/配置和原日志；[保护字节](protected-readback.json)、[消费者接续](consumer-dispositions.json)及[业务体差分](consumer-semantic-diff.json)。

原件共 3843 项已从归档逐项读回，压缩归档 95,303,209 字节；源码 bundle 101,074 字节并已验证。精确 SHA、恢复路径和排除项见[输入及保全收据](inputs-and-preservation.json)。保全地点在当前工作树外，只承诺本机留存。产品 bundle 依赖明确 BASE。可重建 clone/node_modules 未归档，实际 tarball、解析记录、输入锁及失败原件保留。

逐字报告副本中的相对路径按归档内 `r1-t1b/` 原布局恢复；绝对路径是来源记录，不承诺搬移后直接运行。环境须按冻结版本与锁恢复。上述有限证据只在 Node 24.21.0、SQLite 3.53.4、Cordis 4.0.4 和所列受控输入范围成立，不宣称无条件证明。
