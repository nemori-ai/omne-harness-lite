# D-090：多值响应头与同次事实交接的精确技术采用

2026-09-27，主线依用户“Implement the plan”、先有明确 spec／realization 再实施及主调度／验收职责授权，接受 [header-handoff rev1](../../proposals/model-request-adaptation/header-handoff.md) 的两轴 A／A，并技术接受 `data.model-response/v5` 全38条／3资源与 `capability.model-request-runtime/v5` 全73条／27资源。精确资源见 [acceptance.json](acceptance.json)，规范正文保留起草时的 candidate 标签，当前状态归 registry。本次不重采纳旧基线之外的产品修订。

MR5 接收采得且沿原凭据规则处理的 string／ordered string[] map；保留原形、数组次序、重复、空值及缺席，不承诺 HTTP 原始头行次序。RT5 S-58 的同次公共事实 `rawHeaders` 经 S-54 保留到 S-17 完整响应；取消、读体／解析故障、门失败或 reader 未进入不得擦掉已交事实。四 outcome、最多一次发送、内容门、秘密边界、费用、重试和未发出拒绝保持；不创建新失败代码、服务操作或默认值。S-33/S-36/S-64 不要求恢复从未持久且随进程丢失的头值，已提交原完整批次仍优先。

同步技术采用 [core/model-response v5-design rev1](../../../realization/packages/core/model-response/v5-design.md)，SHA256 `5c2e633b771e5d262d4d5240310f7d8bf9cd735a36259d4a6e70b749bf41eb94`。选择显式 `./v5`、`./schema/v5`，原根与 schema 仍 MR4，保留 v3 与 schema/v2。共享固定有序纯内核须守住完整类型联合、S-27 次序、S-36 绑定相等和独立完整 Schema；judge 不交 owned 值。该包无 plugin、fiber、服务、存储或后台任务；新增 bindings 0。此精确采用允许本 core 源码实施，PV1～9仍待实际执行。

独立架构评审分别核两轴选择和 core 窄投影，独立表达评审分别核完整 MR5／RT5 批和 core 投影，均未发现本次范围内阻断。根当前导航补足 runtime 的 D087 采用及 core 旧候选状态滞后；原历史记录和验证范围保留。共享内核旧行为回归、完整21资源闭包、两个实际公开制品与双语 literal 示例仍是实施成本。评审未运行产品或形式工具，不当实现通过。归因摘要、168输入与39候选及投影原字节封存于 [评审归档](../../proposals/model-request-adaptation/reviews/model-headers-v5-2026-09-27.tar.gz)，SHA256 `53a1c0fc4076998cf4db91c8edf9bb0dbc317fa42fb3be7cc9c3d0b8bcc89777`，全部212成员已由 root 读回；摘要明确不是 reviewer 原始逐字工件或人的签收。

中央登记先有本决定再翻 accepted，追加30项冻结资源；原79条登记、2015覆盖、54形式任务和472冻结 hash 保留。候选新增83 covers 一律 reviewed:false；六v5形式任务只登记不声称执行，四TLA与十九cfg沿未变模型，不承载新增头性质。推荐／接受不自动升级既有消费者。

transport、runtime 与共同 codec 的 MR5／RT5 提供者投影及显式采用仍待；本决定不暗改 `mrr/1` 历史解释、wrapper／业务键或混用政策。实际 TLS→send→invoke→全部写方→append/reopen、秘密哨兵与真实停止须各原 owner 交证。G6/G28/G29-P/H/G30/G31、TL-G1、完整十三操作、真实租户链、恢复／观测及37认证保持未完成；不得以 pure Schema/judge 成功提升生产门。人的总体交付接受未发生。
