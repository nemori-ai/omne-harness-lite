# 治理验证义务

当前治理行为归 [SPEC](../SPEC.md)，真实提供者为 organization-governance-sql；未实现的资产时刻增量不得借当前测试标已实现。

| 重点 | 真实输入／拒绝边界 |
| --- | --- |
| 成员串行化 | 真实末位superadmin双向race；只保各自tx而不保共同组织排序为负控，幂等也现核授权 |
| 隶属 | 直接构造self-cycle／新parent祖先链，不借issue guard；不可读不放行；personal／双parent拒绝 |
| offer | pending／期限等号／已终结、accept与withdraw／decline竞争、foreign隐匿和授权先后；通知不代替可查询 |
| 清除 | Account/org存在八支对照；Account缺而org在是defect；restricted入口未授权负控；依据绑定及共同rollback |
| 租户／选择／名单 | current selection不可读不能默认personal；失权不自动改选；includeIneffective拒绝不得降普通名单；同pair重加入身份不变；资产另一半由资产owner验证 |
| 生命周期 | 四Service同fiber，替换／撤除／事务参与；通知仅真实commit后，监听失败不改facts |

现有 provider tests/offers、memberships、participation、faults、scenarios、service-replacement 与 inputs 为真实入口。有限资源归 [models](models/README.md)，不证明跨进程、资产timestamp交错、AI最终活动或SQL约束。
