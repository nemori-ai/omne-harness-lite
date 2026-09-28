# D-099：六份模型输入限制及失败交接后继契约的技术接受

2026-09-28，主调度在用户持续实施、遵循 spec/realization 及负责技术验收的委托内，接受下表精确版本全部规范资源。来源为[既有模型请求适配提案](../../proposals/model-request-adaptation/design.md)、[D-096 产品裁决](../model-profile-input-limits-product-adoption/decision.md)及 [D-097 MP4](../model-profile-v4-limit-contract-adoption/decision.md)。精确文件与 SHA-256 见 [acceptance.json](acceptance.json)。

| 坐标 | 本次增量 |
|---|---|
| capability.model-profile-directory/v4 | 完整限额/事实写读、六项更新时间、旧行不可用与清单原子性 |
| data.messages/v5 | 完整 MP4 快照及历史不回填 |
| data.model-response/v6 | 同一快照、LC5 失败主体、完整 PendingModelResponse 与处分边界 |
| data.loop-extension/v5 | 失败结论 modelCallId、完整有序 retryConclusions |
| capability.model-request-runtime/v6 | 最终输入检查、同一固定计划、完整响应交接与重试历史生产/重取 |
| capability.loop-extension-runner/v4 | 原失败主体交接、结论关联和提交后重放 |

## 独立复评与处置

独立 spec-reviewer 对集成候选及最终 HUB `9d486b37bbb4cbc780649a0912c45d7f3c233c92` 定点复核，结论为本次表达/规范范围无阻断、无残留非阻断。三个真实发现分别修正：MR6 不重新判断快照写方的 S-33 关系；MR6 完整失败主体从不能承载新快照的 LC3 改为 LC5；RT6 在失败响应已落盘但主体构造暂不可用后，通过原有 readAttempts 重新取得完整主体，不新增第十四操作。

重取必须基于同一完整前缀；不可判则整体 unavailable；不写入、不出网、不取凭据、不消耗重试次数。读取结果不形成持续授权，后续 dispatchAgain 仍检查当时状态和守卫。产品依据与 Schema 自述版本已按实际引用承诺核对修正，未借升级吞并工作区、共享实例或 reload 等未消费范围。

集成 design checker `internal/formal=registered` 通过。独立[形式 run](../../evidence/2026-09-28-formal-model-input-successors/README.md)含五个正配置与十个指定断言负控，保留首轮 exit150 与修复后的新输入；它不覆盖后来新增的 R5～R8 重取行为。输入计量算法、真实来源完整性、codec/SQL、生产 Run 终结认法和回复全部写方仍待实际实施验证。

## 取代与实施边界

旧六版本与 MP3 的规范、冻结摘要及已发生证据保持原样；既有消费者继续明确钉其采用版本，不自动升级。新版本是现有责任扩展，没有新对象、能力或公共操作。不能把 Schema/TLC 通过当作十三操作完整交付，也不能用永久 unavailable 实现冒充其成功路径。

本决定只接受契约。目录、transport、runtime、codec、loop 数据与 runner 的 realization 各自精确采用后再实施。MP4 core 已由 D-098 先行采用；具体模型供给 cap、计量规则和实际认证仍分别由供给/传输/runtime owner完成。
