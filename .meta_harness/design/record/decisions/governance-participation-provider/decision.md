# D-042 · 组织治理参与与邀约拒绝

2026-09-25，主线按用户已授权治理CLI/TUI全闭环作技术采用。依据[D040](../governance-identity-offer-contracts/decision.md)、[事务精化](../../proposals/governance-production-mechanisms/sql-transaction-refinement.md)及[独立评审](../../proposals/governance-production-mechanisms/review.md)。

接受capability.organization-governance v2 S1～64及登记的规范资源；采用[OG2提供者增量](../../../realization/packages/tenancy/organization-governance/v2-design.md)和[OE2映射](../../../realization/packages/core/offer-expiry/design.md#oe2-候选映射)。精确冻结字节在registry/frozen.json。契约表达已独立复审，提供者局部架构评审无阻断；作者补明普通直接调用方和清扫触发者各自拥有完整Promise及停止新调用的责任。

沿用四个治理服务与纯OE值模块，不新建领域能力。普通方法独立atomic，参与方法显式复用StorageUnit，AI事实通过同域参与面访问；异常只在唯一事务结束处映射，通知在确认提交后释放。同一SQLite文件BEGIN IMMEDIATE保护共同事实。S20/S53只保留普通调用，注册仍三次独立提交；更强边界可排除旧快照窗口，不削弱无孤儿、无误激活等性质。纯值模块增加declined及可区分的计算不可用，授权与写入归OG。

Membership/Alloy可执行工件与v1逐字相同，复用原有限范围的形式分析；新增终结语义消费已接受OE2有限模型。真实授权矩阵、拒绝/接受/撤回竞争、当前选择清扫/活动竞争、业务回滚与通知、跨存储误用均为实施验收义务，不能从形式复用推导实现已通过。

本决定只准入局部实施。注册AR2、entry2、HTTPS绑定和CLI仍须各自采用；旧消费者不自动升级，旧bindings不整批抬升。entry完整业务排空、普通调用拥有者及host依赖关闭次序未验证前不开放生产新版；PG/跨库/跨进程不在本次可实施组合内。
