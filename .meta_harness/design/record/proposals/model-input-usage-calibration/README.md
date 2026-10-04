# 模型输入按响应 usage 校准

选择对象：已确认采用“稳定历史前缀的总量以响应 usage 校准，只计新增；前缀或计量依据变化时全量回退”之后，**当次模型响应体应承载哪些计量依据，谁解释输出转成下一次输入的贡献**。

- 状态：2026-09-29 U0 revision 3 候选；主线选择 C 作为后继候选规格施工方向；revision 1 已完成独立架构边界评审，后续修订复核独立记录；未发布接受、未实施。
- 范围：最小整体方案、三种数据承载候选、规格施工简报；未来压缩可消费计量结果，压缩能力及策略不在本纵线。
- 输入：用户在本轮明确确认的追加式计量依据及两类失效规则；PF-010 rev6、PF-013 rev15；MR8/RT9（D-104）、MP6（D-101）、MS6（D-100）、CA2、SL3；采用状态与源码修订见 [baseline.json](baseline.json)。
- 方法限制：作者此前已读实现并完成研究，**双盲未达成**；下文领域性质整理不是事前封存的独立读数。装配对象到性质的反查索引尚未建立，按现有正文人工核对。
- 本包不是已接受规格，也不授权实施。主线已依据独立 architecture review 选择 C 进入候选规格施工；这不是发布接受，后续规格与 realization 分别独立起草/评审。

## 准入核对

持续消费者是后继 ModelResponse、模型请求运行时和传输计量规格的作者及审阅者。既有能力拥有请求规划、上游事实、模型响应体、同批结算；剩余责任是把同次计量来源交给后续规划，未发现需要独立能力或新领域对象的理由。A 只存输入前缀、B 在响应收场时合成 post-response 总量、C 保留输入锚与输出组证据而推迟解释，分别改变写入者、计量适配寿命和精度丢失方式，达到三个实质候选的准入要求。

## 阅读入口

| 问题 | 正文 |
|---|---|
| 迭代函数、性质、来源、提交、公开面、Cordis 与影响 | [design.md](design.md) |
| 三种承载方案及改票条件 | [alternatives.md](alternatives.md) |
| 专门规格作者的输入与停止条件 | [spec-construction-brief.md（已外置）](../../evidence/2026-10-01-checks-model-runtime-repository-cleanup/README.md#外置原件) |
| 实际评审及处置状态 | [review.md](review.md) |
| 第一方事实、百万 token 离线结果与局限 | [研究报告](../../../../research/model-request-adaptation/reports/2026-09-29-prefix-usage-calibration.md) |

## 后续消费

当前仅供候选评审；未修改任何已发布规格、registry、产品正文、提供者设计或源码。后继候选版本号由 registry owner 再保留；正文中的 MR9/RT10/MP7 是从输入基线顺推的施工占位，不是登记或接受。基于新形式工件的检查尚未执行，不能复用旧 TLC 结果声称本方案已验证。
- [Google rev4 与 ZAI rev1 联合架构评审](google-zai-visible-reasoning-review.md)（2026-09-30）：Google 修后可采用（G-R1／G-R2 已闭合）、ZAI 可采用；范围外待裁 O-1～O-5 由采用决定处置。
- [Qwen 商业六叶架构评审](qwen-commercial-visible-reasoning-review.md)（2026-09-30）：无阻断，M1～M3 已闭合；O-1～O-8 由采用决定处置。
