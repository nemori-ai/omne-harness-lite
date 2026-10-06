# PF-002-assets-settings-and-permissions · 设计投影 v3

- 当前需求修订：rev 20，2026-09-26 已正式接受。
- 状态：**accepted，post-review，未表示已实现或已验证**。G4／G5／G6 由 D-065 闭合。
- 来源：当前产品、精确契约与节点；[provenance.json](../../design.md) 逐文件记录 SHA-256。只有 registry/frozen 的规格资源标 frozen；其他 hash 为快照校验。
- 本页按当前来源重建导航，不沿用 v1 的旧缺口计数或替身表。各操作的九项承诺与节点实现判断只在下列精确来源中定义；阅读本页时按链接展开完整条目，不从标题推导默认值。

## 1. 需求与确认范围
[产品定义、模型、不变量与规则](../../design.md)；[正常路径与失败路径](../../flows.md)；[可观察验收标准](../../acceptance.md)。当前正文以及已写出的推导已接受，未写出答案的事项继续是显式缺口。

## 2. 领域对象
[领域对象及其宿主、身份、生灭与依据](../../../../domain_objects/objects.md) 是当前输入。PR #9 未涉及的 topic（例如 PF-015）不因本版提升接受状态。

## 3. 契约坐标与性质
| 精确契约 | 状态 | 规范资源 |
|---|---|---|
| `capability.account-identity` v1 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/account-identity/v1/contract.md) |
| `capability.account-identity` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/account-identity/v2/contract.md) |
| `capability.assembly-manifest` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/assembly-manifest/v2/contract.md) |
| `capability.asset-evaluation` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/asset-evaluation/v2/contract.md) |
| `capability.asset-governance` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/asset-governance/v2/contract.md) |
| `capability.asset-registry` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/asset-registry/v2/contract.md) |
| `capability.asset-transfer` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/asset-transfer/v2/contract.md) |
| `capability.center-connection` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/center-connection/v2/contract.md) |
| `capability.credential-custodian` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/credential-custodian/v2/contract.md) |
| `capability.execution-environments` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/execution-environments/v2/contract.md) |
| `capability.hooks-import` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/hooks-import/v2/contract.md) |
| `capability.loop-extension-runner` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/loop-extension-runner/v2/contract.md) |
| `capability.mcp-bridge` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/mcp-bridge/v2/contract.md) |
| `capability.modality-projection` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/modality-projection/v2/contract.md) |
| `capability.model-profile-directory` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/model-profile-directory/v2/contract.md) |
| `capability.model-request-runtime` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/model-request-runtime/v2/contract.md) |
| `capability.organization-governance` v1 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/organization-governance/v1/contract.md) |
| `capability.organization-governance` v3 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/organization-governance/v3/contract.md) |
| `capability.run-attempt-facts` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/run-attempt-facts/v2/contract.md) |
| `capability.session-log` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/session-log/v2/contract.md) |
| `capability.session-tenancy` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/session-tenancy/v2/contract.md) |
| `capability.stream-assembly` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/stream-assembly/v2/contract.md) |
| `capability.tool-admission` v2 | accepted／frozen | [契约全部条款](../../../../spec/capabilities/tool-admission/v2/contract.md) |
| `composition.account-registration` v1 | accepted／frozen | [契约全部条款](../../../../spec/compositions/account-registration/v1/contract.md) |
| `composition.governance-center-entry` v1 | accepted／frozen | [契约全部条款](../../../../spec/compositions/governance-center-entry/v1/contract.md) |
| `composition.governance-center-entry-https-json` v1 | accepted／frozen | [契约全部条款](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md) |
| `data.arrival-events` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/arrival-events/v2/contract.md) |
| `data.asset-model` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/asset-model/v2/contract.md) |
| `data.call-accounts` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/call-accounts/v2/contract.md) |
| `data.connector` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/connector/v2/contract.md) |
| `data.content-blocks` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/content-blocks/v2/contract.md) |
| `data.identity-values` v1 | accepted／frozen | [契约全部条款](../../../../spec/data/identity-values/v1/contract.md) |
| `data.loop-extension` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/loop-extension/v2/contract.md) |
| `data.mcp-endpoint` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/mcp-endpoint/v2/contract.md) |
| `data.messages` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/messages/v2/contract.md) |
| `data.model-profile` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/model-profile/v2/contract.md) |
| `data.model-response` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/model-response/v2/contract.md) |
| `data.offer-expiry` v1 | accepted／frozen | [契约全部条款](../../../../spec/data/offer-expiry/v1/contract.md) |
| `data.skill-package` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/skill-package/v2/contract.md) |
| `data.slash-command` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/slash-command/v2/contract.md) |
| `data.tool-definition` v2 | accepted／frozen | [契约全部条款](../../../../spec/data/tool-definition/v2/contract.md) |

不变量、安全性质、进展及其前提以每份契约的相应条款为准；形式任务运行状态不能由 accepted 倒推。

## 4. 操作与完整条目入口
每个操作的前置、后置、失败集合、缺席默认、原子性／提交点、所有权及撤除责任均从下列条目展开；条款号保留原契约坐标。数据契约的纯计算与结构判定同样按原条款读取。
| 契约 | 条款 | 完整条目 |
|---|---|---|
| `capability.account-identity` v1 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/account-identity/v1/contract.md#s-1-本契约拥有什么) |
| `capability.account-identity` v1 | S-2 | [S-2 消费者与依赖方向](../../../../spec/capabilities/account-identity/v1/contract.md#s-2-消费者与依赖方向) |
| `capability.account-identity` v1 | S-3 | [S-3 明确不承诺什么](../../../../spec/capabilities/account-identity/v1/contract.md#s-3-明确不承诺什么) |
| `capability.account-identity` v1 | S-4 | [S-4 账号记录](../../../../spec/capabilities/account-identity/v1/contract.md#s-4-账号记录) |
| `capability.account-identity` v1 | S-5 | [S-5 激活状态](../../../../spec/capabilities/account-identity/v1/contract.md#s-5-激活状态) |
| `capability.account-identity` v1 | S-6 | [S-6 登录标识](../../../../spec/capabilities/account-identity/v1/contract.md#s-6-登录标识) |
| `capability.account-identity` v1 | S-7 | [S-7 AccountId 与登录标识各管什么](../../../../spec/capabilities/account-identity/v1/contract.md#s-7-accountid-与登录标识各管什么) |
| `capability.account-identity` v1 | S-8 | [S-8 凭据材料](../../../../spec/capabilities/account-identity/v1/contract.md#s-8-凭据材料) |
| `capability.account-identity` v1 | S-9 | [S-9 登录状态记录](../../../../spec/capabilities/account-identity/v1/contract.md#s-9-登录状态记录) |
| `capability.account-identity` v1 | S-10 | [S-10 撤销是持久记录，不是内存生命周期](../../../../spec/capabilities/account-identity/v1/contract.md#s-10-撤销是持久记录不是内存生命周期) |
| `capability.account-identity` v1 | S-11 | [S-11 账号记录不含跨账号关联字段](../../../../spec/capabilities/account-identity/v1/contract.md#s-11-账号记录不含跨账号关联字段) |
| `capability.account-identity` v1 | S-12 | [S-12 账号身份事实不是范围化对象](../../../../spec/capabilities/account-identity/v1/contract.md#s-12-账号身份事实不是范围化对象) |
| `capability.account-identity` v1 | S-13 | [S-13 产生账号（未激活）](../../../../spec/capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) |
| `capability.account-identity` v1 | S-14 | [S-14 激活账号](../../../../spec/capabilities/account-identity/v1/contract.md#s-14-激活账号) |
| `capability.account-identity` v1 | S-15 | [S-15 验证凭据并签发登录状态](../../../../spec/capabilities/account-identity/v1/contract.md#s-15-验证凭据并签发登录状态) |
| `capability.account-identity` v1 | S-16 | [S-16 撤销登录状态](../../../../spec/capabilities/account-identity/v1/contract.md#s-16-撤销登录状态) |
| `capability.account-identity` v1 | S-17 | [S-17 校验登录状态](../../../../spec/capabilities/account-identity/v1/contract.md#s-17-校验登录状态) |
| `capability.account-identity` v1 | S-18 | [S-18 读账号](../../../../spec/capabilities/account-identity/v1/contract.md#s-18-读账号) |
| `capability.account-identity` v1 | S-37 | [S-37 列出本账号有效登录状态](../../../../spec/capabilities/account-identity/v1/contract.md#s-37-列出本账号有效登录状态) |
| `capability.account-identity` v1 | S-38 | [S-38 清除到期的未激活账号记录](../../../../spec/capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) |
| `capability.account-identity` v1 | S-19 | [S-19 登录标识部署内唯一](../../../../spec/capabilities/account-identity/v1/contract.md#s-19-登录标识部署内唯一) |
| `capability.account-identity` v1 | S-20 | [S-20 已激活不回退、不消失](../../../../spec/capabilities/account-identity/v1/contract.md#s-20-已激活不回退不消失) |
| `capability.account-identity` v1 | S-21 | [S-21 未激活账号不能用于任何交互](../../../../spec/capabilities/account-identity/v1/contract.md#s-21-未激活账号不能用于任何交互) |
| `capability.account-identity` v1 | S-22 | [S-22 账号存在性不从登录路径泄漏](../../../../spec/capabilities/account-identity/v1/contract.md#s-22-账号存在性不从登录路径泄漏) |
| `capability.account-identity` v1 | S-23 | [S-23 登录状态失效持久且只及被指定的那一个](../../../../spec/capabilities/account-identity/v1/contract.md#s-23-登录状态失效持久且只及被指定的那一个) |
| `capability.account-identity` v1 | S-24 | [S-24 失败不显示成功，不接错账号](../../../../spec/capabilities/account-identity/v1/contract.md#s-24-失败不显示成功不接错账号) |
| `capability.account-identity` v1 | S-25 | [S-25 两个账号之间没有通路](../../../../spec/capabilities/account-identity/v1/contract.md#s-25-两个账号之间没有通路) |
| `capability.account-identity` v1 | S-26 | [S-26 credential_policy](../../../../spec/capabilities/account-identity/v1/contract.md#s-26-credential_policy) |
| `capability.account-identity` v1 | S-39 | [S-39 unactivated_retention](../../../../spec/capabilities/account-identity/v1/contract.md#s-39-unactivated_retention) |
| `capability.account-identity` v1 | S-27 | [S-27 缺席时的默认答案](../../../../spec/capabilities/account-identity/v1/contract.md#s-27-缺席时的默认答案) |
| `capability.account-identity` v1 | S-28 | [S-28 依赖不可用、撤除与重启时的在途归属](../../../../spec/capabilities/account-identity/v1/contract.md#s-28-依赖不可用撤除与重启时的在途归属) |
| `capability.account-identity` v1 | S-29 | [S-29 撤销不等于强制停止](../../../../spec/capabilities/account-identity/v1/contract.md#s-29-撤销不等于强制停止) |
| `capability.account-identity` v1 | S-30 | [S-30 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) |
| `capability.account-identity` v1 | S-31 | [S-31 三种登录失败反馈完全一致](../../../../spec/capabilities/account-identity/v1/contract.md#s-31-三种登录失败反馈完全一致) |
| `capability.account-identity` v1 | S-32 | [S-32 退出的持久性](../../../../spec/capabilities/account-identity/v1/contract.md#s-32-退出的持久性) |
| `capability.account-identity` v1 | S-33 | [S-33 退出的作用范围](../../../../spec/capabilities/account-identity/v1/contract.md#s-33-退出的作用范围) |
| `capability.account-identity` v1 | S-34 | [S-34 同标识两路对比](../../../../spec/capabilities/account-identity/v1/contract.md#s-34-同标识两路对比) |
| `capability.account-identity` v1 | S-40 | [S-40 有效登录状态列得全](../../../../spec/capabilities/account-identity/v1/contract.md#s-40-有效登录状态列得全) |
| `capability.account-identity` v1 | S-41 | [S-41 未激活记录到期释放标识](../../../../spec/capabilities/account-identity/v1/contract.md#s-41-未激活记录到期释放标识) |
| `capability.account-identity` v1 | S-42 | [S-42 伪造的依据两侧都被拒](../../../../spec/capabilities/account-identity/v1/contract.md#s-42-伪造的依据两侧都被拒) |
| `capability.account-identity` v1 | S-43 | [S-43 依据产出之后记录才过期](../../../../spec/capabilities/account-identity/v1/contract.md#s-43-依据产出之后记录才过期) |
| `capability.account-identity` v1 | S-35 | [S-35 静态检查：账号记录无跨账号关联字段](../../../../spec/capabilities/account-identity/v1/contract.md#s-35-静态检查账号记录无跨账号关联字段) |
| `capability.account-identity` v1 | S-36 | [S-36 静态检查：失败集合闭合](../../../../spec/capabilities/account-identity/v1/contract.md#s-36-静态检查失败集合闭合) |
| `capability.account-identity` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/account-identity/v2/contract.md#s-1-本契约拥有什么) |
| `capability.account-identity` v2 | S-2 | [S-2 消费者与依赖方向](../../../../spec/capabilities/account-identity/v2/contract.md#s-2-消费者与依赖方向) |
| `capability.account-identity` v2 | S-3 | [S-3 明确不承诺什么](../../../../spec/capabilities/account-identity/v2/contract.md#s-3-明确不承诺什么) |
| `capability.account-identity` v2 | S-4 | [S-4 账号记录](../../../../spec/capabilities/account-identity/v2/contract.md#s-4-账号记录) |
| `capability.account-identity` v2 | S-5 | [S-5 激活状态](../../../../spec/capabilities/account-identity/v2/contract.md#s-5-激活状态) |
| `capability.account-identity` v2 | S-6 | [S-6 登录标识](../../../../spec/capabilities/account-identity/v2/contract.md#s-6-登录标识) |
| `capability.account-identity` v2 | S-7 | [S-7 AccountId 与登录标识各管什么](../../../../spec/capabilities/account-identity/v2/contract.md#s-7-accountid-与登录标识各管什么) |
| `capability.account-identity` v2 | S-8 | [S-8 凭据材料](../../../../spec/capabilities/account-identity/v2/contract.md#s-8-凭据材料) |
| `capability.account-identity` v2 | S-9 | [S-9 登录状态记录](../../../../spec/capabilities/account-identity/v2/contract.md#s-9-登录状态记录) |
| `capability.account-identity` v2 | S-45 | [S-45 登录状态出示物](../../../../spec/capabilities/account-identity/v2/contract.md#s-45-登录状态出示物) |
| `capability.account-identity` v2 | S-10 | [S-10 撤销是持久记录，不是内存生命周期](../../../../spec/capabilities/account-identity/v2/contract.md#s-10-撤销是持久记录不是内存生命周期) |
| `capability.account-identity` v2 | S-11 | [S-11 账号记录不含跨账号关联字段](../../../../spec/capabilities/account-identity/v2/contract.md#s-11-账号记录不含跨账号关联字段) |
| `capability.account-identity` v2 | S-12 | [S-12 账号身份事实不是范围化对象](../../../../spec/capabilities/account-identity/v2/contract.md#s-12-账号身份事实不是范围化对象) |
| `capability.account-identity` v2 | S-13 | [S-13 产生账号（未激活）](../../../../spec/capabilities/account-identity/v2/contract.md#s-13-产生账号未激活) |
| `capability.account-identity` v2 | S-14 | [S-14 激活账号](../../../../spec/capabilities/account-identity/v2/contract.md#s-14-激活账号) |
| `capability.account-identity` v2 | S-15 | [S-15 验证凭据并签发登录状态](../../../../spec/capabilities/account-identity/v2/contract.md#s-15-验证凭据并签发登录状态) |
| `capability.account-identity` v2 | S-16 | [S-16 撤销登录状态](../../../../spec/capabilities/account-identity/v2/contract.md#s-16-撤销登录状态) |
| `capability.account-identity` v2 | S-17 | [S-17 校验登录状态](../../../../spec/capabilities/account-identity/v2/contract.md#s-17-校验登录状态) |
| `capability.account-identity` v2 | S-44 | [S-44 按出示物换取身份](../../../../spec/capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份) |
| `capability.account-identity` v2 | S-18 | [S-18 读账号](../../../../spec/capabilities/account-identity/v2/contract.md#s-18-读账号) |
| `capability.account-identity` v2 | S-37 | [S-37 列出本账号有效登录状态](../../../../spec/capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态) |
| `capability.account-identity` v2 | S-38 | [S-38 清除到期的未激活账号记录](../../../../spec/capabilities/account-identity/v2/contract.md#s-38-清除到期的未激活账号记录) |
| `capability.account-identity` v2 | S-19 | [S-19 登录标识部署内唯一](../../../../spec/capabilities/account-identity/v2/contract.md#s-19-登录标识部署内唯一) |
| `capability.account-identity` v2 | S-20 | [S-20 已激活不回退、不消失](../../../../spec/capabilities/account-identity/v2/contract.md#s-20-已激活不回退不消失) |
| `capability.account-identity` v2 | S-21 | [S-21 未激活账号不能用于任何交互](../../../../spec/capabilities/account-identity/v2/contract.md#s-21-未激活账号不能用于任何交互) |
| `capability.account-identity` v2 | S-22 | [S-22 账号存在性不从登录路径泄漏](../../../../spec/capabilities/account-identity/v2/contract.md#s-22-账号存在性不从登录路径泄漏) |
| `capability.account-identity` v2 | S-23 | [S-23 登录状态失效持久且只及被指定的那一个](../../../../spec/capabilities/account-identity/v2/contract.md#s-23-登录状态失效持久且只及被指定的那一个) |
| `capability.account-identity` v2 | S-24 | [S-24 失败不显示成功，不接错账号](../../../../spec/capabilities/account-identity/v2/contract.md#s-24-失败不显示成功不接错账号) |
| `capability.account-identity` v2 | S-25 | [S-25 两个账号之间没有通路](../../../../spec/capabilities/account-identity/v2/contract.md#s-25-两个账号之间没有通路) |
| `capability.account-identity` v2 | S-26 | [S-26 credential_policy](../../../../spec/capabilities/account-identity/v2/contract.md#s-26-credential_policy) |
| `capability.account-identity` v2 | S-39 | [S-39 unactivated_retention](../../../../spec/capabilities/account-identity/v2/contract.md#s-39-unactivated_retention) |
| `capability.account-identity` v2 | S-27 | [S-27 缺席时的默认答案](../../../../spec/capabilities/account-identity/v2/contract.md#s-27-缺席时的默认答案) |
| `capability.account-identity` v2 | S-28 | [S-28 依赖不可用、撤除与重启时的在途归属](../../../../spec/capabilities/account-identity/v2/contract.md#s-28-依赖不可用撤除与重启时的在途归属) |
| `capability.account-identity` v2 | S-29 | [S-29 撤销不等于强制停止](../../../../spec/capabilities/account-identity/v2/contract.md#s-29-撤销不等于强制停止) |
| `capability.account-identity` v2 | S-30 | [S-30 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证) |
| `capability.account-identity` v2 | S-31 | [S-31 三种登录失败反馈完全一致](../../../../spec/capabilities/account-identity/v2/contract.md#s-31-三种登录失败反馈完全一致) |
| `capability.account-identity` v2 | S-32 | [S-32 退出的持久性](../../../../spec/capabilities/account-identity/v2/contract.md#s-32-退出的持久性) |
| `capability.account-identity` v2 | S-33 | [S-33 退出的作用范围](../../../../spec/capabilities/account-identity/v2/contract.md#s-33-退出的作用范围) |
| `capability.account-identity` v2 | S-34 | [S-34 同标识两路对比](../../../../spec/capabilities/account-identity/v2/contract.md#s-34-同标识两路对比) |
| `capability.account-identity` v2 | S-40 | [S-40 有效登录状态列得全](../../../../spec/capabilities/account-identity/v2/contract.md#s-40-有效登录状态列得全) |
| `capability.account-identity` v2 | S-41 | [S-41 未激活记录到期释放标识](../../../../spec/capabilities/account-identity/v2/contract.md#s-41-未激活记录到期释放标识) |
| `capability.account-identity` v2 | S-42 | [S-42 伪造的依据两侧都被拒](../../../../spec/capabilities/account-identity/v2/contract.md#s-42-伪造的依据两侧都被拒) |
| `capability.account-identity` v2 | S-43 | [S-43 依据产出之后记录才过期](../../../../spec/capabilities/account-identity/v2/contract.md#s-43-依据产出之后记录才过期) |
| `capability.account-identity` v2 | S-46 | [S-46 存储里翻不出能用的出示物](../../../../spec/capabilities/account-identity/v2/contract.md#s-46-存储里翻不出能用的出示物) |
| `capability.account-identity` v2 | S-47 | [S-47 出示物的不可逆形式恒等于它的 LoginStateId](../../../../spec/capabilities/account-identity/v2/contract.md#s-47-出示物的不可逆形式恒等于它的-loginstateid) |
| `capability.account-identity` v2 | S-35 | [S-35 静态检查：账号记录无跨账号关联字段](../../../../spec/capabilities/account-identity/v2/contract.md#s-35-静态检查账号记录无跨账号关联字段) |
| `capability.account-identity` v2 | S-36 | [S-36 静态检查：失败集合闭合](../../../../spec/capabilities/account-identity/v2/contract.md#s-36-静态检查失败集合闭合) |
| `capability.assembly-manifest` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-1-本契约拥有什么) |
| `capability.assembly-manifest` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.assembly-manifest` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.assembly-manifest` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.assembly-manifest` v2 | S-5 | [S-5 一个会话一列换表记录](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-5-一个会话一列换表记录) |
| `capability.assembly-manifest` v2 | S-6 | [S-6 记录与它的壳](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-6-记录与它的壳) |
| `capability.assembly-manifest` v2 | S-7 | [S-7 序号与头](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-7-序号与头) |
| `capability.assembly-manifest` v2 | S-8 | [S-8 求值引用 EvaluationRef](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-8-求值引用-evaluationref) |
| `capability.assembly-manifest` v2 | S-9 | [S-9 表时刻：同一类别上严格递增](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-9-表时刻同一类别上严格递增) |
| `capability.assembly-manifest` v2 | S-10 | [S-10 在场事实](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-10-在场事实) |
| `capability.assembly-manifest` v2 | S-11 | [S-11 只增不改；原样存、原样交回](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-11-只增不改原样存原样交回) |
| `capability.assembly-manifest` v2 | S-12 | [S-12 条件追加：判定与写入是同一步](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-12-条件追加判定与写入是同一步) |
| `capability.assembly-manifest` v2 | S-13 | [S-13 提交与持久](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-13-提交与持久) |
| `capability.assembly-manifest` v2 | S-14 | [S-14 缺席时的默认答案](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-14-缺席时的默认答案) |
| `capability.assembly-manifest` v2 | S-15 | [S-15 九件事与失败值总表](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-15-九件事与失败值总表) |
| `capability.assembly-manifest` v2 | S-16 | [S-16 readHead：读头与每一类最后一条](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-16-readhead读头与每一类最后一条) |
| `capability.assembly-manifest` v2 | S-17 | [S-17 append：条件追加一条换表记录](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-17-append条件追加一条换表记录) |
| `capability.assembly-manifest` v2 | S-18 | [S-18 readHistory：按表时刻读回一条](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-18-readhistory按表时刻读回一条) |
| `capability.assembly-manifest` v2 | S-19 | [S-19 dependencyPresence：依赖名此刻在不在场](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-19-dependencypresence依赖名此刻在不在场) |
| `capability.assembly-manifest` v2 | S-20 | [S-20 本版不发事件](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-20-本版不发事件) |
| `capability.assembly-manifest` v2 | S-21 | [S-21 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-21-装配给的保证-vs-协议须给的保证) |
| `capability.assembly-manifest` v2 | S-22 | [S-22 回执丢失与结果未知](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-22-回执丢失与结果未知) |
| `capability.assembly-manifest` v2 | S-23 | [S-23 提供者撤除、换代与重启](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-23-提供者撤除换代与重启) |
| `capability.assembly-manifest` v2 | S-24 | [S-24 留存：本版不删](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-24-留存本版不删) |
| `capability.assembly-manifest` v2 | S-25 | [S-25 本版选用哪些形式工件](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-25-本版选用哪些形式工件) |
| `capability.assembly-manifest` v2 | S-26 | [S-26 条件追加：两路并发恰一路成](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-26-条件追加两路并发恰一路成) |
| `capability.assembly-manifest` v2 | S-27 | [S-27 装配那一次的回执丢了](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-27-装配那一次的回执丢了) |
| `capability.assembly-manifest` v2 | S-28 | [S-28 按表时刻读回历史](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-28-按表时刻读回历史) |
| `capability.assembly-manifest` v2 | S-29 | [S-29 头与各类最后一条出自同一刻](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-29-头与各类最后一条出自同一刻) |
| `capability.assembly-manifest` v2 | S-30 | [S-30 读不到不是没有](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-30-读不到不是没有) |
| `capability.assembly-manifest` v2 | S-31 | [S-31 在场判定三种答](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-31-在场判定三种答) |
| `capability.asset-evaluation` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-1-本契约拥有什么) |
| `capability.asset-evaluation` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.asset-evaluation` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.asset-evaluation` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.asset-evaluation` v2 | S-5 | [S-5 层与三条层序](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-5-层与三条层序) |
| `capability.asset-evaluation` v2 | S-6 | [S-6 求值输入 EvaluationInput](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-6-求值输入-evaluationinput) |
| `capability.asset-evaluation` v2 | S-7 | [S-7 输入的一致性条件](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-7-输入的一致性条件) |
| `capability.asset-evaluation` v2 | S-8 | [S-8 求值结果 EffectiveAssembly](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-8-求值结果-effectiveassembly) |
| `capability.asset-evaluation` v2 | S-9 | [S-9 工作区提供的资产](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-9-工作区提供的资产) |
| `capability.asset-evaluation` v2 | S-10 | [S-10 各类正文契约须供的两条规则](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-10-各类正文契约须供的两条规则) |
| `capability.asset-evaluation` v2 | S-11 | [S-11 纯计算](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-11-纯计算) |
| `capability.asset-evaluation` v2 | S-12 | [S-12 缺席时的默认答案](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-12-缺席时的默认答案) |
| `capability.asset-evaluation` v2 | S-13 | [S-13 invalidInput 是没开始判，filteredOut 与 unresolved 是判出来的结果](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) |
| `capability.asset-evaluation` v2 | S-14 | [S-14 这一节每个操作写全九件事](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-14-这一节每个操作写全九件事) |
| `capability.asset-evaluation` v2 | S-15 | [S-15 evaluate](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-15-evaluate) |
| `capability.asset-evaluation` v2 | S-16 | [S-16 readWorkspaceCarrier](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-16-readworkspacecarrier) |
| `capability.asset-evaluation` v2 | S-17 | [S-17 第一步之一：先按禁用滤](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-17-第一步之一先按禁用滤) |
| `capability.asset-evaluation` v2 | S-18 | [S-18 第一步之三：最后取最具体的一份，锁在最外那一把处截断](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-18-第一步之三最后取最具体的一份锁在最外那一把处截断) |
| `capability.asset-evaluation` v2 | S-19 | [S-19 官方件是下界](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-19-官方件是下界) |
| `capability.asset-evaluation` v2 | S-20 | [S-20 第二步：组装](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-20-第二步组装) |
| `capability.asset-evaluation` v2 | S-21 | [S-21 第三步：投影](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-21-第三步投影) |
| `capability.asset-evaluation` v2 | S-22 | [S-22 第四步：设置](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-22-第四步设置) |
| `capability.asset-evaluation` v2 | S-23 | [S-23 第四步：权限](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-23-第四步权限) |
| `capability.asset-evaluation` v2 | S-24 | [S-24 工作区那一格在第四步只贡献设置](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-24-工作区那一格在第四步只贡献设置) |
| `capability.asset-evaluation` v2 | S-25 | [S-25 工作区提供的资产的权限项一律取最严值](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-25-工作区提供的资产的权限项一律取最严值) |
| `capability.asset-evaluation` v2 | S-26 | [S-26 每份持有都有去处](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-26-每份持有都有去处) |
| `capability.asset-evaluation` v2 | S-38 | [S-38 常驻值](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-38-常驻值) |
| `capability.asset-evaluation` v2 | S-39 | [S-39 「谁可以使用它」：值与判定](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-39-谁可以使用它值与判定) |
| `capability.asset-evaluation` v2 | S-40 | [S-40 落点与身份类设置的来处](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-40-落点与身份类设置的来处) |
| `capability.asset-evaluation` v2 | S-42 | [S-42 执行权限项另带「租户那一层写得进『自动』吗」](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-42-执行权限项另带租户那一层写得进自动吗) |
| `capability.asset-evaluation` v2 | S-27 | [S-27 清单列的资产变成工作区那一格的持有](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-27-清单列的资产变成工作区那一格的持有) |
| `capability.asset-evaluation` v2 | S-28 | [S-28 配值与禁用：只对工作区提供的资产生效，丢掉的留痕](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-28-配值与禁用只对工作区提供的资产生效丢掉的留痕) |
| `capability.asset-evaluation` v2 | S-29 | [S-29 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-29-装配给的保证-vs-协议须给的保证) |
| `capability.asset-evaluation` v2 | S-30 | [S-30 本能力没有在途工作](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-30-本能力没有在途工作) |
| `capability.asset-evaluation` v2 | S-31 | [S-31 unresolved 交到装配手上怎么收场](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-31-unresolved-交到装配手上怎么收场) |
| `capability.asset-evaluation` v2 | S-32 | [S-32 本版选用哪些形式工件](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-32-本版选用哪些形式工件) |
| `capability.asset-evaluation` v2 | S-33 | [S-33 四格齐全的一次求值](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-33-四格齐全的一次求值) |
| `capability.asset-evaluation` v2 | S-34 | [S-34 先禁用后替换](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-34-先禁用后替换) |
| `capability.asset-evaluation` v2 | S-35 | [S-35 清单读入的留痕](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-35-清单读入的留痕) |
| `capability.asset-evaluation` v2 | S-36 | [S-36 换了实现，设置不跟过去，权限的约束跟过去](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-36-换了实现设置不跟过去权限的约束跟过去) |
| `capability.asset-evaluation` v2 | S-37 | [S-37 输入不合法时整体拒绝](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-37-输入不合法时整体拒绝) |
| `capability.asset-evaluation` v2 | S-41 | [S-41 判下来用不了的退回下一层](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-41-判下来用不了的退回下一层) |
| `capability.asset-evaluation` v2 | S-43 | [S-43 成环即拒，并指出环在哪](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-43-成环即拒并指出环在哪) |
| `capability.asset-evaluation` v2 | S-44 | [S-44 读不了正文的一类即拒](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-44-读不了正文的一类即拒) |
| `capability.asset-governance` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/asset-governance/v2/contract.md#s-1-本契约拥有什么) |
| `capability.asset-governance` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/asset-governance/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.asset-governance` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/asset-governance/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.asset-governance` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/asset-governance/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.asset-governance` v2 | S-5 | [S-5 资产记录与它的两个标识](../../../../spec/capabilities/asset-governance/v2/contract.md#s-5-资产记录与它的两个标识) |
| `capability.asset-governance` v2 | S-6 | [S-6 草稿与版本线](../../../../spec/capabilities/asset-governance/v2/contract.md#s-6-草稿与版本线) |
| `capability.asset-governance` v2 | S-7 | [S-7 所有者与作者](../../../../spec/capabilities/asset-governance/v2/contract.md#s-7-所有者与作者) |
| `capability.asset-governance` v2 | S-8 | [S-8 official 记录与出厂默认层的持有](../../../../spec/capabilities/asset-governance/v2/contract.md#s-8-official-记录与出厂默认层的持有) |
| `capability.asset-governance` v2 | S-9 | [S-9 持有：本契约写得到的两层与写不到的两层](../../../../spec/capabilities/asset-governance/v2/contract.md#s-9-持有本契约写得到的两层与写不到的两层) |
| `capability.asset-governance` v2 | S-10 | [S-10 属性配值与两把锁](../../../../spec/capabilities/asset-governance/v2/contract.md#s-10-属性配值与两把锁) |
| `capability.asset-governance` v2 | S-11 | [S-11 禁用](../../../../spec/capabilities/asset-governance/v2/contract.md#s-11-禁用) |
| `capability.asset-governance` v2 | S-12 | [S-12 「组织的设置」是视图，不是对象](../../../../spec/capabilities/asset-governance/v2/contract.md#s-12-组织的设置是视图不是对象) |
| `capability.asset-governance` v2 | S-13 | [S-13 引用方](../../../../spec/capabilities/asset-governance/v2/contract.md#s-13-引用方) |
| `capability.asset-governance` v2 | S-14 | [S-14 可见与不泄漏存在性](../../../../spec/capabilities/asset-governance/v2/contract.md#s-14-可见与不泄漏存在性) |
| `capability.asset-governance` v2 | S-15 | [S-15 结构性禁止不是权限判定](../../../../spec/capabilities/asset-governance/v2/contract.md#s-15-结构性禁止不是权限判定) |
| `capability.asset-governance` v2 | S-16 | [S-16 谁能做：角色矩阵落成的四种资格](../../../../spec/capabilities/asset-governance/v2/contract.md#s-16-谁能做角色矩阵落成的四种资格) |
| `capability.asset-governance` v2 | S-17 | [S-17 缺席时的默认答案](../../../../spec/capabilities/asset-governance/v2/contract.md#s-17-缺席时的默认答案) |
| `capability.asset-governance` v2 | S-18 | [S-18 失败值（闭合）](../../../../spec/capabilities/asset-governance/v2/contract.md#s-18-失败值闭合) |
| `capability.asset-governance` v2 | S-19 | [S-19 判定次序](../../../../spec/capabilities/asset-governance/v2/contract.md#s-19-判定次序) |
| `capability.asset-governance` v2 | S-20 | [S-20 每道准入现读](../../../../spec/capabilities/asset-governance/v2/contract.md#s-20-每道准入现读) |
| `capability.asset-governance` v2 | S-21 | [S-21 读到的依据与写入落在同一次可串行化的提交里](../../../../spec/capabilities/asset-governance/v2/contract.md#s-21-读到的依据与写入落在同一次可串行化的提交里) |
| `capability.asset-governance` v2 | S-22 | [S-22 先告知，再移除或删除](../../../../spec/capabilities/asset-governance/v2/contract.md#s-22-先告知再移除或删除) |
| `capability.asset-governance` v2 | S-23 | [S-23 这一节每个操作写全九件事](../../../../spec/capabilities/asset-governance/v2/contract.md#s-23-这一节每个操作写全九件事) |
| `capability.asset-governance` v2 | S-24 | [S-24 createDraft 创建草稿](../../../../spec/capabilities/asset-governance/v2/contract.md#s-24-createdraft-创建草稿) |
| `capability.asset-governance` v2 | S-25 | [S-25 updateDraft 修订草稿](../../../../spec/capabilities/asset-governance/v2/contract.md#s-25-updatedraft-修订草稿) |
| `capability.asset-governance` v2 | S-26 | [S-26 publish 发布](../../../../spec/capabilities/asset-governance/v2/contract.md#s-26-publish-发布) |
| `capability.asset-governance` v2 | S-27 | [S-27 promoteToOrganization 提升到组织](../../../../spec/capabilities/asset-governance/v2/contract.md#s-27-promotetoorganization-提升到组织) |
| `capability.asset-governance` v2 | S-28 | [S-28 delete 删除一份资产记录](../../../../spec/capabilities/asset-governance/v2/contract.md#s-28-delete-删除一份资产记录) |
| `capability.asset-governance` v2 | S-29 | [S-29 registerOfficial 登记官方件](../../../../spec/capabilities/asset-governance/v2/contract.md#s-29-registerofficial-登记官方件) |
| `capability.asset-governance` v2 | S-30 | [S-30 hold 加入持有](../../../../spec/capabilities/asset-governance/v2/contract.md#s-30-hold-加入持有) |
| `capability.asset-governance` v2 | S-31 | [S-31 unhold 移除持有](../../../../spec/capabilities/asset-governance/v2/contract.md#s-31-unhold-移除持有) |
| `capability.asset-governance` v2 | S-32 | [S-32 disable 禁用](../../../../spec/capabilities/asset-governance/v2/contract.md#s-32-disable-禁用) |
| `capability.asset-governance` v2 | S-33 | [S-33 enable 启用](../../../../spec/capabilities/asset-governance/v2/contract.md#s-33-enable-启用) |
| `capability.asset-governance` v2 | S-34 | [S-34 lockReplacement 加替换锁](../../../../spec/capabilities/asset-governance/v2/contract.md#s-34-lockreplacement-加替换锁) |
| `capability.asset-governance` v2 | S-35 | [S-35 unlockReplacement 解除替换锁](../../../../spec/capabilities/asset-governance/v2/contract.md#s-35-unlockreplacement-解除替换锁) |
| `capability.asset-governance` v2 | S-36 | [S-36 pinVersion 钉住一个版本](../../../../spec/capabilities/asset-governance/v2/contract.md#s-36-pinversion-钉住一个版本) |
| `capability.asset-governance` v2 | S-37 | [S-37 unpinVersion 回到追随当前版本](../../../../spec/capabilities/asset-governance/v2/contract.md#s-37-unpinversion-回到追随当前版本) |
| `capability.asset-governance` v2 | S-38 | [S-38 assign 配值](../../../../spec/capabilities/asset-governance/v2/contract.md#s-38-assign-配值) |
| `capability.asset-governance` v2 | S-39 | [S-39 clearAssignment 清除配值](../../../../spec/capabilities/asset-governance/v2/contract.md#s-39-clearassignment-清除配值) |
| `capability.asset-governance` v2 | S-40 | [S-40 lockAssignment 锁住该项](../../../../spec/capabilities/asset-governance/v2/contract.md#s-40-lockassignment-锁住该项) |
| `capability.asset-governance` v2 | S-41 | [S-41 unlockAssignment 解除该项的锁](../../../../spec/capabilities/asset-governance/v2/contract.md#s-41-unlockassignment-解除该项的锁) |
| `capability.asset-governance` v2 | S-42 | [S-42 listHoldings 列出某范围的持有](../../../../spec/capabilities/asset-governance/v2/contract.md#s-42-listholdings-列出某范围的持有) |
| `capability.asset-governance` v2 | S-43 | [S-43 readHolding 读一份持有](../../../../spec/capabilities/asset-governance/v2/contract.md#s-43-readholding-读一份持有) |
| `capability.asset-governance` v2 | S-44 | [S-44 organizationSettingsView 组织的设置视图](../../../../spec/capabilities/asset-governance/v2/contract.md#s-44-organizationsettingsview-组织的设置视图) |
| `capability.asset-governance` v2 | S-45 | [S-45 listReferrers 列出一份记录的引用方](../../../../spec/capabilities/asset-governance/v2/contract.md#s-45-listreferrers-列出一份记录的引用方) |
| `capability.asset-governance` v2 | S-64 | [S-64 readAsset 读一份资产记录](../../../../spec/capabilities/asset-governance/v2/contract.md#s-64-readasset-读一份资产记录) |
| `capability.asset-governance` v2 | S-65 | [S-65 readVersion 读一个已发布版本](../../../../spec/capabilities/asset-governance/v2/contract.md#s-65-readversion-读一个已发布版本) |
| `capability.asset-governance` v2 | S-46 | [S-46 组合入口：资产流转的确认步骤](../../../../spec/capabilities/asset-governance/v2/contract.md#s-46-组合入口资产流转的确认步骤) |
| `capability.asset-governance` v2 | S-47 | [S-47 解除成员不动任何持有](../../../../spec/capabilities/asset-governance/v2/contract.md#s-47-解除成员不动任何持有) |
| `capability.asset-governance` v2 | S-48 | [S-48 事件都是通知](../../../../spec/capabilities/asset-governance/v2/contract.md#s-48-事件都是通知) |
| `capability.asset-governance` v2 | S-49 | [S-49 本版不开控制类事件](../../../../spec/capabilities/asset-governance/v2/contract.md#s-49-本版不开控制类事件) |
| `capability.asset-governance` v2 | S-50 | [S-50 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/asset-governance/v2/contract.md#s-50-装配给的保证-vs-协议须给的保证) |
| `capability.asset-governance` v2 | S-51 | [S-51 依赖的提供者不可用](../../../../spec/capabilities/asset-governance/v2/contract.md#s-51-依赖的提供者不可用) |
| `capability.asset-governance` v2 | S-52 | [S-52 撤销不发出停止信号](../../../../spec/capabilities/asset-governance/v2/contract.md#s-52-撤销不发出停止信号) |
| `capability.asset-governance` v2 | S-53 | [S-53 本版选用哪些形式工件](../../../../spec/capabilities/asset-governance/v2/contract.md#s-53-本版选用哪些形式工件) |
| `capability.asset-governance` v2 | S-54 | [S-54 结构性禁止与权限判定分得开](../../../../spec/capabilities/asset-governance/v2/contract.md#s-54-结构性禁止与权限判定分得开) |
| `capability.asset-governance` v2 | S-55 | [S-55 上层锁住的，下层写不进去；解锁不回溯](../../../../spec/capabilities/asset-governance/v2/contract.md#s-55-上层锁住的下层写不进去解锁不回溯) |
| `capability.asset-governance` v2 | S-56 | [S-56 移除与禁用可分辨](../../../../spec/capabilities/asset-governance/v2/contract.md#s-56-移除与禁用可分辨) |
| `capability.asset-governance` v2 | S-57 | [S-57 official 动不了，但可以不持有](../../../../spec/capabilities/asset-governance/v2/contract.md#s-57-official-动不了但可以不持有) |
| `capability.asset-governance` v2 | S-58 | [S-58 先告知再移除](../../../../spec/capabilities/asset-governance/v2/contract.md#s-58-先告知再移除) |
| `capability.asset-governance` v2 | S-59 | [S-59 版本号连续与认回](../../../../spec/capabilities/asset-governance/v2/contract.md#s-59-版本号连续与认回) |
| `capability.asset-governance` v2 | S-60 | [S-60 提升不可逆](../../../../spec/capabilities/asset-governance/v2/contract.md#s-60-提升不可逆) |
| `capability.asset-governance` v2 | S-61 | [S-61 判不出来与判为拒绝分得开](../../../../spec/capabilities/asset-governance/v2/contract.md#s-61-判不出来与判为拒绝分得开) |
| `capability.asset-governance` v2 | S-62 | [S-62 不泄漏存在性](../../../../spec/capabilities/asset-governance/v2/contract.md#s-62-不泄漏存在性) |
| `capability.asset-governance` v2 | S-63 | [S-63 钉住的不随发布走，分享来的钉不住](../../../../spec/capabilities/asset-governance/v2/contract.md#s-63-钉住的不随发布走分享来的钉不住) |
| `capability.asset-registry` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/asset-registry/v2/contract.md#s-1-本契约拥有什么) |
| `capability.asset-registry` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/asset-registry/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.asset-registry` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/asset-registry/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.asset-registry` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/asset-registry/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.asset-registry` v2 | S-5 | [S-5 八类里登记六张表](../../../../spec/capabilities/asset-registry/v2/contract.md#s-5-八类里登记六张表) |
| `capability.asset-registry` v2 | S-6 | [S-6 注册表快照](../../../../spec/capabilities/asset-registry/v2/contract.md#s-6-注册表快照) |
| `capability.asset-registry` v2 | S-7 | [S-7 注册表条目](../../../../spec/capabilities/asset-registry/v2/contract.md#s-7-注册表条目) |
| `capability.asset-registry` v2 | S-8 | [S-8 当下可用性的三个取值](../../../../spec/capabilities/asset-registry/v2/contract.md#s-8-当下可用性的三个取值) |
| `capability.asset-registry` v2 | S-9 | [S-9 按命令的可用性](../../../../spec/capabilities/asset-registry/v2/contract.md#s-9-按命令的可用性) |
| `capability.asset-registry` v2 | S-10 | [S-10 替换件同形，只换说明](../../../../spec/capabilities/asset-registry/v2/contract.md#s-10-替换件同形只换说明) |
| `capability.asset-registry` v2 | S-11 | [S-11 一次执行尝试的可用性报告](../../../../spec/capabilities/asset-registry/v2/contract.md#s-11-一次执行尝试的可用性报告) |
| `capability.asset-registry` v2 | S-12 | [S-12 MCP 动作条目：在一次尝试内钉住](../../../../spec/capabilities/asset-registry/v2/contract.md#s-12-mcp-动作条目在一次尝试内钉住) |
| `capability.asset-registry` v2 | S-13 | [S-13 EvaluationRef](../../../../spec/capabilities/asset-registry/v2/contract.md#s-13-evaluationref) |
| `capability.asset-registry` v2 | S-14 | [S-14 会话斜杠命令集是 slash_command 那张表的视图](../../../../spec/capabilities/asset-registry/v2/contract.md#s-14-会话斜杠命令集是-slash_command-那张表的视图) |
| `capability.asset-registry` v2 | S-15 | [S-15 快照只在这几个时刻换](../../../../spec/capabilities/asset-registry/v2/contract.md#s-15-快照只在这几个时刻换) |
| `capability.asset-registry` v2 | S-16 | [S-16 会话资产注册表不求值，只消费求值结果](../../../../spec/capabilities/asset-registry/v2/contract.md#s-16-会话资产注册表不求值只消费求值结果) |
| `capability.asset-registry` v2 | S-17 | [S-17 换表：同一会话串行，多表一次，成败同一](../../../../spec/capabilities/asset-registry/v2/contract.md#s-17-换表同一会话串行多表一次成败同一) |
| `capability.asset-registry` v2 | S-18 | [S-18 快照不持久，装配清单是唯一权威](../../../../spec/capabilities/asset-registry/v2/contract.md#s-18-快照不持久装配清单是唯一权威) |
| `capability.asset-registry` v2 | S-19 | [S-19 缺席时的默认答案](../../../../spec/capabilities/asset-registry/v2/contract.md#s-19-缺席时的默认答案) |
| `capability.asset-registry` v2 | S-20 | [S-20 「谁可以用」门控：哪两类、按哪个租户身份、什么时候判](../../../../spec/capabilities/asset-registry/v2/contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) |
| `capability.asset-registry` v2 | S-21 | [S-21 这一节每个操作写全九件事](../../../../spec/capabilities/asset-registry/v2/contract.md#s-21-这一节每个操作写全九件事) |
| `capability.asset-registry` v2 | S-22 | [S-22 fill：装配时填六张](../../../../spec/capabilities/asset-registry/v2/contract.md#s-22-fill装配时填六张) |
| `capability.asset-registry` v2 | S-23 | [S-23 reload：按类别重填](../../../../spec/capabilities/asset-registry/v2/contract.md#s-23-reload按类别重填) |
| `capability.asset-registry` v2 | S-24 | [S-24 refreshAvailability：每次执行尝试开始时现算](../../../../spec/capabilities/asset-registry/v2/contract.md#s-24-refreshavailability每次执行尝试开始时现算) |
| `capability.asset-registry` v2 | S-25 | [S-25 lookup：查一条](../../../../spec/capabilities/asset-registry/v2/contract.md#s-25-lookup查一条) |
| `capability.asset-registry` v2 | S-26 | [S-26 list：列一类](../../../../spec/capabilities/asset-registry/v2/contract.md#s-26-list列一类) |
| `capability.asset-registry` v2 | S-27 | [S-27 markFailed：命令型服务报错之后，去掉那一条](../../../../spec/capabilities/asset-registry/v2/contract.md#s-27-markfailed命令型服务报错之后去掉那一条) |
| `capability.asset-registry` v2 | S-28 | [S-28 onAssetChange：权限收回之后收窄](../../../../spec/capabilities/asset-registry/v2/contract.md#s-28-onassetchange权限收回之后收窄) |
| `capability.asset-registry` v2 | S-29 | [S-29 本版不发本契约自己的事件](../../../../spec/capabilities/asset-registry/v2/contract.md#s-29-本版不发本契约自己的事件) |
| `capability.asset-registry` v2 | S-30 | [S-30 可用性变化不出提醒](../../../../spec/capabilities/asset-registry/v2/contract.md#s-30-可用性变化不出提醒) |
| `capability.asset-registry` v2 | S-31 | [S-31 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/asset-registry/v2/contract.md#s-31-装配给的保证-vs-协议须给的保证) |
| `capability.asset-registry` v2 | S-32 | [S-32 依赖的提供者不可用](../../../../spec/capabilities/asset-registry/v2/contract.md#s-32-依赖的提供者不可用) |
| `capability.asset-registry` v2 | S-33 | [S-33 本能力重启与重建](../../../../spec/capabilities/asset-registry/v2/contract.md#s-33-本能力重启与重建) |
| `capability.asset-registry` v2 | S-34 | [S-34 进行中的运行与撤销](../../../../spec/capabilities/asset-registry/v2/contract.md#s-34-进行中的运行与撤销) |
| `capability.asset-registry` v2 | S-35 | [S-35 本版选用哪些形式工件](../../../../spec/capabilities/asset-registry/v2/contract.md#s-35-本版选用哪些形式工件) |
| `capability.asset-registry` v2 | S-36 | [S-36 创建时填六张](../../../../spec/capabilities/asset-registry/v2/contract.md#s-36-创建时填六张) |
| `capability.asset-registry` v2 | S-37 | [S-37 reload-plugin 连带](../../../../spec/capabilities/asset-registry/v2/contract.md#s-37-reload-plugin-连带) |
| `capability.asset-registry` v2 | S-38 | [S-38 MCP 接入点连不上，动作原位顶替](../../../../spec/capabilities/asset-registry/v2/contract.md#s-38-mcp-接入点连不上动作原位顶替) |
| `capability.asset-registry` v2 | S-39 | [S-39 命令型服务报错之后，命令不再可见](../../../../spec/capabilities/asset-registry/v2/contract.md#s-39-命令型服务报错之后命令不再可见) |
| `capability.asset-registry` v2 | S-40 | [S-40 依赖缺失与恢复](../../../../spec/capabilities/asset-registry/v2/contract.md#s-40-依赖缺失与恢复) |
| `capability.asset-registry` v2 | S-41 | [S-41 无权即不存在；收回此刻起不存在；再授予要等 reload](../../../../spec/capabilities/asset-registry/v2/contract.md#s-41-无权即不存在收回此刻起不存在再授予要等-reload) |
| `capability.asset-registry` v2 | S-42 | [S-42 没人发 reload，增删禁用不进来](../../../../spec/capabilities/asset-registry/v2/contract.md#s-42-没人发-reload增删禁用不进来) |
| `capability.asset-registry` v2 | S-43 | [S-43 重启之后重建](../../../../spec/capabilities/asset-registry/v2/contract.md#s-43-重启之后重建) |
| `capability.asset-registry` v2 | S-44 | [S-44 依赖未解析与同名冲突](../../../../spec/capabilities/asset-registry/v2/contract.md#s-44-依赖未解析与同名冲突) |
| `capability.asset-registry` v2 | S-45 | [S-45 不可用时明确失败](../../../../spec/capabilities/asset-registry/v2/contract.md#s-45-不可用时明确失败) |
| `capability.asset-registry` v2 | S-46 | [S-46 逐动作执行权限与接入点持有钉进报告](../../../../spec/capabilities/asset-registry/v2/contract.md#s-46-逐动作执行权限与接入点持有钉进报告) |
| `capability.asset-registry` v2 | S-47 | [S-47 别的运行的报告不能拿来 continue](../../../../spec/capabilities/asset-registry/v2/contract.md#s-47-别的运行的报告不能拿来-continue) |
| `capability.asset-transfer` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-1-本契约拥有什么) |
| `capability.asset-transfer` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.asset-transfer` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.asset-transfer` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.asset-transfer` v2 | S-5 | [S-5 复制通知](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-5-复制通知) |
| `capability.asset-transfer` v2 | S-6 | [S-6 分享邀请](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-6-分享邀请) |
| `capability.asset-transfer` v2 | S-7 | [S-7 两类待确认件共用的过期语义](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-7-两类待确认件共用的过期语义) |
| `capability.asset-transfer` v2 | S-8 | [S-8 分享](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-8-分享) |
| `capability.asset-transfer` v2 | S-9 | [S-9 分享此刻是否生效](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-9-分享此刻是否生效) |
| `capability.asset-transfer` v2 | S-10 | [S-10 复制血缘怎么判、怎么记](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-10-复制血缘怎么判怎么记) |
| `capability.asset-transfer` v2 | S-11 | [S-11 复制的收场](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-11-复制的收场) |
| `capability.asset-transfer` v2 | S-12 | [S-12 流转边界：团队资产不出那棵树](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-12-流转边界团队资产不出那棵树) |
| `capability.asset-transfer` v2 | S-13 | [S-13 发起者一侧的资产](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-13-发起者一侧的资产) |
| `capability.asset-transfer` v2 | S-14 | [S-14 plugin 的复制与分享](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-14-plugin-的复制与分享) |
| `capability.asset-transfer` v2 | S-49 | [S-49 方向与落点：矩阵逐格](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-49-方向与落点矩阵逐格) |
| `capability.asset-transfer` v2 | S-15 | [S-15 结构性禁止不是权限判定](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-15-结构性禁止不是权限判定) |
| `capability.asset-transfer` v2 | S-16 | [S-16 缺席时的默认答案](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-16-缺席时的默认答案) |
| `capability.asset-transfer` v2 | S-17 | [S-17 每道准入现读，确认时再判一遍](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-17-每道准入现读确认时再判一遍) |
| `capability.asset-transfer` v2 | S-18 | [S-18 确认是一次提交；同一落点的确认序列化](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-18-确认是一次提交同一落点的确认序列化) |
| `capability.asset-transfer` v2 | S-19 | [S-19 这一节每个操作写全九件事](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-19-这一节每个操作写全九件事) |
| `capability.asset-transfer` v2 | S-20 | [S-20 发起复制](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-20-发起复制) |
| `capability.asset-transfer` v2 | S-21 | [S-21 撤回复制通知](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-21-撤回复制通知) |
| `capability.asset-transfer` v2 | S-22 | [S-22 确认复制](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-22-确认复制) |
| `capability.asset-transfer` v2 | S-23 | [S-23 读复制通知](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-23-读复制通知) |
| `capability.asset-transfer` v2 | S-24 | [S-24 发起分享](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-24-发起分享) |
| `capability.asset-transfer` v2 | S-25 | [S-25 撤回分享邀请](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-25-撤回分享邀请) |
| `capability.asset-transfer` v2 | S-26 | [S-26 确认分享](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-26-确认分享) |
| `capability.asset-transfer` v2 | S-27 | [S-27 读分享邀请](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-27-读分享邀请) |
| `capability.asset-transfer` v2 | S-28 | [S-28 撤销分享](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-28-撤销分享) |
| `capability.asset-transfer` v2 | S-29 | [S-29 移除收到的分享](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-29-移除收到的分享) |
| `capability.asset-transfer` v2 | S-30 | [S-30 列出组织的分享](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-30-列出组织的分享) |
| `capability.asset-transfer` v2 | S-48 | [S-48 列出组织收到的待确认件](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-48-列出组织收到的待确认件) |
| `capability.asset-transfer` v2 | S-31 | [S-31 隶属解除：分享在使用时失效，不靠事件](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-31-隶属解除分享在使用时失效不靠事件) |
| `capability.asset-transfer` v2 | S-32 | [S-32 成员关系解除：复制执行不了，已确认的不动](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-32-成员关系解除复制执行不了已确认的不动) |
| `capability.asset-transfer` v2 | S-52 | [S-52 分享方删除资产、或所有权易手：分享随之结束](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-52-分享方删除资产或所有权易手分享随之结束) |
| `capability.asset-transfer` v2 | S-33 | [S-33 本版不发本契约自己的事件](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-33-本版不发本契约自己的事件) |
| `capability.asset-transfer` v2 | S-34 | [S-34 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-34-装配给的保证-vs-协议须给的保证) |
| `capability.asset-transfer` v2 | S-35 | [S-35 依赖的提供者不可用](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-35-依赖的提供者不可用) |
| `capability.asset-transfer` v2 | S-36 | [S-36 撤销不发出停止信号](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-36-撤销不发出停止信号) |
| `capability.asset-transfer` v2 | S-37 | [S-37 本能力自己被撤除、替换或重启](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-37-本能力自己被撤除替换或重启) |
| `capability.asset-transfer` v2 | S-38 | [S-38 本版选用哪些形式工件](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-38-本版选用哪些形式工件) |
| `capability.asset-transfer` v2 | S-39 | [S-39 两类待确认件的三种收场](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-39-两类待确认件的三种收场) |
| `capability.asset-transfer` v2 | S-40 | [S-40 首次、重复、撞标识无血缘、按层找](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-40-首次重复撞标识无血缘按层找) |
| `capability.asset-transfer` v2 | S-41 | [S-41 覆盖不碰配值](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-41-覆盖不碰配值) |
| `capability.asset-transfer` v2 | S-42 | [S-42 边界在每条路径上都挡住](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-42-边界在每条路径上都挡住) |
| `capability.asset-transfer` v2 | S-43 | [S-43 分享的建立、跟随与结束](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-43-分享的建立跟随与结束) |
| `capability.asset-transfer` v2 | S-44 | [S-44 隶属解除之后：分享失效，复制留着，不复活](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-44-隶属解除之后分享失效复制留着不复活) |
| `capability.asset-transfer` v2 | S-45 | [S-45 资产被移除即过期](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-45-资产被移除即过期) |
| `capability.asset-transfer` v2 | S-46 | [S-46 plugin 随行与引用告知](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-46-plugin-随行与引用告知) |
| `capability.asset-transfer` v2 | S-47 | [S-47 不可用时明确失败](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-47-不可用时明确失败) |
| `capability.asset-transfer` v2 | S-50 | [S-50 组织内分享与成员关系](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-50-组织内分享与成员关系) |
| `capability.asset-transfer` v2 | S-51 | [S-51 方向矩阵逐格](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-51-方向矩阵逐格) |
| `capability.asset-transfer` v2 | S-53 | [S-53 分享方删除与提升：分享随之结束](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-53-分享方删除与提升分享随之结束) |
| `capability.center-connection` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/center-connection/v2/contract.md#s-1-本契约拥有什么) |
| `capability.center-connection` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/center-connection/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.center-connection` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/center-connection/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.center-connection` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/center-connection/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.center-connection` v2 | S-5 | [S-5 可达性：三态](../../../../spec/capabilities/center-connection/v2/contract.md#s-5-可达性三态) |
| `capability.center-connection` v2 | S-6 | [S-6 自己探、自己重连](../../../../spec/capabilities/center-connection/v2/contract.md#s-6-自己探自己重连) |
| `capability.center-connection` v2 | S-7 | [S-7 在场不随可达性变](../../../../spec/capabilities/center-connection/v2/contract.md#s-7-在场不随可达性变) |
| `capability.center-connection` v2 | S-8 | [S-8 这一节每个操作写全九件事](../../../../spec/capabilities/center-connection/v2/contract.md#s-8-这一节每个操作写全九件事) |
| `capability.center-connection` v2 | S-9 | [S-9 reachability](../../../../spec/capabilities/center-connection/v2/contract.md#s-9-reachability) |
| `capability.center-connection` v2 | S-10 | [S-10 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/center-connection/v2/contract.md#s-10-装配给的保证-vs-协议须给的保证) |
| `capability.center-connection` v2 | S-11 | [S-11 撤除、重启与在途](../../../../spec/capabilities/center-connection/v2/contract.md#s-11-撤除重启与在途) |
| `capability.center-connection` v2 | S-12 | [S-12 本版选用哪些形式工件](../../../../spec/capabilities/center-connection/v2/contract.md#s-12-本版选用哪些形式工件) |
| `capability.center-connection` v2 | S-13 | [S-13 断线与重连](../../../../spec/capabilities/center-connection/v2/contract.md#s-13-断线与重连) |
| `capability.center-connection` v2 | S-14 | [S-14 在应答就是可达，判不了也算](../../../../spec/capabilities/center-connection/v2/contract.md#s-14-在应答就是可达判不了也算) |
| `capability.center-connection` v2 | S-15 | [S-15 确认不了对端就是问不到](../../../../spec/capabilities/center-connection/v2/contract.md#s-15-确认不了对端就是问不到) |
| `capability.credential-custodian` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-1-本契约拥有什么) |
| `capability.credential-custodian` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.credential-custodian` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.credential-custodian` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.credential-custodian` v2 | S-5 | [S-5 保管条目](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-5-保管条目) |
| `capability.credential-custodian` v2 | S-6 | [S-6 据点隔离与按登录状态归属](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-6-据点隔离与按登录状态归属) |
| `capability.credential-custodian` v2 | S-7 | [S-7 加密落地](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-7-加密落地) |
| `capability.credential-custodian` v2 | S-8 | [S-8 秘密与引用只在各自那一个问法里出现](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-8-秘密与引用只在各自那一个问法里出现) |
| `capability.credential-custodian` v2 | S-9 | [S-9 缺席时的默认答案](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-9-缺席时的默认答案) |
| `capability.credential-custodian` v2 | S-10 | [S-10 失败值](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-10-失败值) |
| `capability.credential-custodian` v2 | S-11 | [S-11 这一节每个操作写全九件事](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-11-这一节每个操作写全九件事) |
| `capability.credential-custodian` v2 | S-12 | [S-12 storeReplica](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-12-storereplica) |
| `capability.credential-custodian` v2 | S-13 | [S-13 readReplica](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-13-readreplica) |
| `capability.credential-custodian` v2 | S-14 | [S-14 discardReplica](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-14-discardreplica) |
| `capability.credential-custodian` v2 | S-15 | [S-15 discardLoginState](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-15-discardloginstate) |
| `capability.credential-custodian` v2 | S-16 | [S-16 depositOAuth](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-16-depositoauth) |
| `capability.credential-custodian` v2 | S-17 | [S-17 resolve](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-17-resolve) |
| `capability.credential-custodian` v2 | S-18 | [S-18 清扫](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-18-清扫) |
| `capability.credential-custodian` v2 | S-19 | [S-19 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) |
| `capability.credential-custodian` v2 | S-20 | [S-20 撤除、重启与在途](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-20-撤除重启与在途) |
| `capability.credential-custodian` v2 | S-21 | [S-21 本版选用哪些形式工件](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-21-本版选用哪些形式工件) |
| `capability.credential-custodian` v2 | S-22 | [S-22 离线用副本](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-22-离线用副本) |
| `capability.credential-custodian` v2 | S-23 | [S-23 另一个账号的据点读不到](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-23-另一个账号的据点读不到) |
| `capability.credential-custodian` v2 | S-24 | [S-24 登录状态结束，副本随之清除](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-24-登录状态结束副本随之清除) |
| `capability.credential-custodian` v2 | S-25 | [S-25 OAuth 条目：待生效时不交出，`granted` 才交出](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-25-oauth-条目待生效时不交出granted-才交出) |
| `capability.credential-custodian` v2 | S-26 | [S-26 加密落地](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-26-加密落地) |
| `capability.credential-custodian` v2 | S-27 | [S-27 秘密不出本契约](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-27-秘密不出本契约) |
| `capability.credential-custodian` v2 | S-28 | [S-28 清扫与完成交错](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-28-清扫与完成交错) |
| `capability.execution-environments` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/execution-environments/v2/contract.md#s-1-本契约拥有什么) |
| `capability.execution-environments` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/execution-environments/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.execution-environments` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/execution-environments/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.execution-environments` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/execution-environments/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.execution-environments` v2 | S-5 | [S-5 执行环境引用](../../../../spec/capabilities/execution-environments/v2/contract.md#s-5-执行环境引用) |
| `capability.execution-environments` v2 | S-6 | [S-6 落点判断：本版只有宿主机](../../../../spec/capabilities/execution-environments/v2/contract.md#s-6-落点判断本版只有宿主机) |
| `capability.execution-environments` v2 | S-7 | [S-7 进程组](../../../../spec/capabilities/execution-environments/v2/contract.md#s-7-进程组) |
| `capability.execution-environments` v2 | S-8 | [S-8 缺席时的默认答案](../../../../spec/capabilities/execution-environments/v2/contract.md#s-8-缺席时的默认答案) |
| `capability.execution-environments` v2 | S-9 | [S-9 失败值](../../../../spec/capabilities/execution-environments/v2/contract.md#s-9-失败值) |
| `capability.execution-environments` v2 | S-10 | [S-10 这一节每个操作写全九件事](../../../../spec/capabilities/execution-environments/v2/contract.md#s-10-这一节每个操作写全九件事) |
| `capability.execution-environments` v2 | S-11 | [S-11 resolveSessionEnvironment](../../../../spec/capabilities/execution-environments/v2/contract.md#s-11-resolvesessionenvironment) |
| `capability.execution-environments` v2 | S-12 | [S-12 placeExecution](../../../../spec/capabilities/execution-environments/v2/contract.md#s-12-placeexecution) |
| `capability.execution-environments` v2 | S-13 | [S-13 startProcess](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess) |
| `capability.execution-environments` v2 | S-14 | [S-14 processOutcome](../../../../spec/capabilities/execution-environments/v2/contract.md#s-14-processoutcome) |
| `capability.execution-environments` v2 | S-15 | [S-15 stopProcessGroup](../../../../spec/capabilities/execution-environments/v2/contract.md#s-15-stopprocessgroup) |
| `capability.execution-environments` v2 | S-16 | [S-16 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/execution-environments/v2/contract.md#s-16-装配给的保证-vs-协议须给的保证) |
| `capability.execution-environments` v2 | S-17 | [S-17 撤除、重启与在途](../../../../spec/capabilities/execution-environments/v2/contract.md#s-17-撤除重启与在途) |
| `capability.execution-environments` v2 | S-18 | [S-18 本版选用哪些形式工件](../../../../spec/capabilities/execution-environments/v2/contract.md#s-18-本版选用哪些形式工件) |
| `capability.execution-environments` v2 | S-19 | [S-19 落点的四种答案](../../../../spec/capabilities/execution-environments/v2/contract.md#s-19-落点的四种答案) |
| `capability.execution-environments` v2 | S-20 | [S-20 拓展件子进程没有允许就不起](../../../../spec/capabilities/execution-environments/v2/contract.md#s-20-拓展件子进程没有允许就不起) |
| `capability.execution-environments` v2 | S-21 | [S-21 孙进程随组停下](../../../../spec/capabilities/execution-environments/v2/contract.md#s-21-孙进程随组停下) |
| `capability.execution-environments` v2 | S-22 | [S-22 停不下来：有界答复之后继续停](../../../../spec/capabilities/execution-environments/v2/contract.md#s-22-停不下来有界答复之后继续停) |
| `capability.execution-environments` v2 | S-23 | [S-23 环境变量不继承](../../../../spec/capabilities/execution-environments/v2/contract.md#s-23-环境变量不继承) |
| `capability.execution-environments` v2 | S-24 | [S-24 别人的引用，旧的引用](../../../../spec/capabilities/execution-environments/v2/contract.md#s-24-别人的引用旧的引用) |
| `capability.hooks-import` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/hooks-import/v2/contract.md#s-1-本契约拥有什么) |
| `capability.hooks-import` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/hooks-import/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.hooks-import` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/hooks-import/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.hooks-import` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/hooks-import/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.hooks-import` v2 | S-5 | [S-5 来源产品、方言版本与配置来源](../../../../spec/capabilities/hooks-import/v2/contract.md#s-5-来源产品方言版本与配置来源) |
| `capability.hooks-import` v2 | S-6 | [S-6 一条 command 一件兼容件](../../../../spec/capabilities/hooks-import/v2/contract.md#s-6-一条-command-一件兼容件) |
| `capability.hooks-import` v2 | S-7 | [S-7 能力标识怎样导出](../../../../spec/capabilities/hooks-import/v2/contract.md#s-7-能力标识怎样导出) |
| `capability.hooks-import` v2 | S-8 | [S-8 干预力：声明与上限](../../../../spec/capabilities/hooks-import/v2/contract.md#s-8-干预力声明与上限) |
| `capability.hooks-import` v2 | S-9 | [S-9 工作区来源的 hook：导入即禁用](../../../../spec/capabilities/hooks-import/v2/contract.md#s-9-工作区来源的-hook导入即禁用) |
| `capability.hooks-import` v2 | S-10 | [S-10 兼容件要带的东西](../../../../spec/capabilities/hooks-import/v2/contract.md#s-10-兼容件要带的东西) |
| `capability.hooks-import` v2 | S-11 | [S-11 importHostHooks](../../../../spec/capabilities/hooks-import/v2/contract.md#s-11-importhosthooks) |
| `capability.hooks-import` v2 | S-12 | [S-12 导入报告](../../../../spec/capabilities/hooks-import/v2/contract.md#s-12-导入报告) |
| `capability.hooks-import` v2 | S-13 | [S-13 降级说明](../../../../spec/capabilities/hooks-import/v2/contract.md#s-13-降级说明) |
| `capability.hooks-import` v2 | S-14 | [S-14 不导入的理由](../../../../spec/capabilities/hooks-import/v2/contract.md#s-14-不导入的理由) |
| `capability.hooks-import` v2 | S-15 | [S-15 报告里的次序](../../../../spec/capabilities/hooks-import/v2/contract.md#s-15-报告里的次序) |
| `capability.hooks-import` v2 | S-16 | [S-16 情形筛选](../../../../spec/capabilities/hooks-import/v2/contract.md#s-16-情形筛选) |
| `capability.hooks-import` v2 | S-17 | [S-17 输入怎样译成来源产品的原生输入](../../../../spec/capabilities/hooks-import/v2/contract.md#s-17-输入怎样译成来源产品的原生输入) |
| `capability.hooks-import` v2 | S-18 | [S-18 子进程在哪跑，钱记在哪](../../../../spec/capabilities/hooks-import/v2/contract.md#s-18-子进程在哪跑钱记在哪) |
| `capability.hooks-import` v2 | S-19 | [S-19 起不来与报错](../../../../spec/capabilities/hooks-import/v2/contract.md#s-19-起不来与报错) |
| `capability.hooks-import` v2 | S-20 | [S-20 输出怎样译回](../../../../spec/capabilities/hooks-import/v2/contract.md#s-20-输出怎样译回) |
| `capability.hooks-import` v2 | S-21 | [S-21 ask 与回放](../../../../spec/capabilities/hooks-import/v2/contract.md#s-21-ask-与回放) |
| `capability.hooks-import` v2 | S-22 | [S-22 越档的输出](../../../../spec/capabilities/hooks-import/v2/contract.md#s-22-越档的输出) |
| `capability.hooks-import` v2 | S-23 | [S-23 Claude Code 映射表](../../../../spec/capabilities/hooks-import/v2/contract.md#s-23-claude-code-映射表) |
| `capability.hooks-import` v2 | S-24 | [S-24 Codex 映射表](../../../../spec/capabilities/hooks-import/v2/contract.md#s-24-codex-映射表) |
| `capability.hooks-import` v2 | S-25 | [S-25 本契约不开事件](../../../../spec/capabilities/hooks-import/v2/contract.md#s-25-本契约不开事件) |
| `capability.hooks-import` v2 | S-26 | [S-26 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/hooks-import/v2/contract.md#s-26-装配给的保证-vs-协议须给的保证) |
| `capability.hooks-import` v2 | S-27 | [S-27 缺席、撤下与重新导入](../../../../spec/capabilities/hooks-import/v2/contract.md#s-27-缺席撤下与重新导入) |
| `capability.hooks-import` v2 | S-28 | [S-28 本版不选用形式工件](../../../../spec/capabilities/hooks-import/v2/contract.md#s-28-本版不选用形式工件) |
| `capability.hooks-import` v2 | S-29 | [S-29 一条都不丢](../../../../spec/capabilities/hooks-import/v2/contract.md#s-29-一条都不丢) |
| `capability.hooks-import` v2 | S-30 | [S-30 写坏的 matcher 让整份失败](../../../../spec/capabilities/hooks-import/v2/contract.md#s-30-写坏的-matcher-让整份失败) |
| `capability.hooks-import` v2 | S-31 | [S-31 允许不是放行](../../../../spec/capabilities/hooks-import/v2/contract.md#s-31-允许不是放行) |
| `capability.hooks-import` v2 | S-32 | [S-32 挂了看得见，不静默](../../../../spec/capabilities/hooks-import/v2/contract.md#s-32-挂了看得见不静默) |
| `capability.hooks-import` v2 | S-33 | [S-33 来源产品的 ask，四档卡不带授权，回放不重跑](../../../../spec/capabilities/hooks-import/v2/contract.md#s-33-来源产品的-ask四档卡不带授权回放不重跑) |
| `capability.hooks-import` v2 | S-34 | [S-34 工作区来源导入即禁用](../../../../spec/capabilities/hooks-import/v2/contract.md#s-34-工作区来源导入即禁用) |
| `capability.hooks-import` v2 | S-35 | [S-35 重新导入是新版本](../../../../spec/capabilities/hooks-import/v2/contract.md#s-35-重新导入是新版本) |
| `capability.hooks-import` v2 | S-36 | [S-36 Stop 的续跑状态从日志数](../../../../spec/capabilities/hooks-import/v2/contract.md#s-36-stop-的续跑状态从日志数) |
| `capability.loop-extension-runner` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-1-本契约拥有什么) |
| `capability.loop-extension-runner` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.loop-extension-runner` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.loop-extension-runner` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.loop-extension-runner` v2 | S-5 | [S-5 一次经过](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-5-一次经过) |
| `capability.loop-extension-runner` v2 | S-6 | [S-6 拓展件链：从装配清单来](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-6-拓展件链从装配清单来) |
| `capability.loop-extension-runner` v2 | S-7 | [S-7 系统自带件怎样挂上](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-7-系统自带件怎样挂上) |
| `capability.loop-extension-runner` v2 | S-8 | [S-8 本契约不持有运行实例里的状态](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-8-本契约不持有运行实例里的状态) |
| `capability.loop-extension-runner` v2 | S-9 | [S-9 日志只读句柄的读面](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-9-日志只读句柄的读面) |
| `capability.loop-extension-runner` v2 | S-50 | [S-50 执行环境句柄的读面](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-50-执行环境句柄的读面) |
| `capability.loop-extension-runner` v2 | S-10 | [S-10 逐件顺序求值，先落后算](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-10-逐件顺序求值先落后算) |
| `capability.loop-extension-runner` v2 | S-11 | [S-11 每件恰一条最终结论，落进会话日志](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-11-每件恰一条最终结论落进会话日志) |
| `capability.loop-extension-runner` v2 | S-12 | [S-12 不可用与报错：runner 怎么分](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-12-不可用与报错runner-怎么分) |
| `capability.loop-extension-runner` v2 | S-13 | [S-13 报错处置策略的执行](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-13-报错处置策略的执行) |
| `capability.loop-extension-runner` v2 | S-14 | [S-14 结论合不合法：两类判断](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-14-结论合不合法两类判断) |
| `capability.loop-extension-runner` v2 | S-15 | [S-15 效果怎么合成](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-15-效果怎么合成) |
| `capability.loop-extension-runner` v2 | S-16 | [S-16 缺席时的默认答案](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-16-缺席时的默认答案) |
| `capability.loop-extension-runner` v2 | S-17 | [S-17 系统自带件不可用时一律关门](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-17-系统自带件不可用时一律关门) |
| `capability.loop-extension-runner` v2 | S-18 | [S-18 同一位置同一次经过只跑一轮](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-18-同一位置同一次经过只跑一轮) |
| `capability.loop-extension-runner` v2 | S-19 | [S-19 注入的提醒怎样追加](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-19-注入的提醒怎样追加) |
| `capability.loop-extension-runner` v2 | S-20 | [S-20 这一节每个操作写全九件事](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-20-这一节每个操作写全九件事) |
| `capability.loop-extension-runner` v2 | S-21 | [S-21 dispatch：一次经过](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-21-dispatch一次经过) |
| `capability.loop-extension-runner` v2 | S-22 | [S-22 replay：从日志重建一次经过](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-22-replay从日志重建一次经过) |
| `capability.loop-extension-runner` v2 | S-23 | [S-23 效果之后的事由谁做](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-23-效果之后的事由谁做) |
| `capability.loop-extension-runner` v2 | S-24 | [S-24 before_action 上的改写与生效参数](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-24-before_action-上的改写与生效参数) |
| `capability.loop-extension-runner` v2 | S-25 | [S-25 before_model_call 上的换模型与重新组装](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-25-before_model_call-上的换模型与重新组装) |
| `capability.loop-extension-runner` v2 | S-26 | [S-26 retry 与它被拒](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-26-retry-与它被拒) |
| `capability.loop-extension-runner` v2 | S-27 | [S-27 ask：交出卡片并停在这一位置](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-27-ask交出卡片并停在这一位置) |
| `capability.loop-extension-runner` v2 | S-28 | [S-28 回放](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-28-回放) |
| `capability.loop-extension-runner` v2 | S-29 | [S-29 一批动作：每个动作一次经过](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-29-一批动作每个动作一次经过) |
| `capability.loop-extension-runner` v2 | S-30 | [S-30 连续被否决的回复](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-30-连续被否决的回复) |
| `capability.loop-extension-runner` v2 | S-31 | [S-31 本契约不开事件](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-31-本契约不开事件) |
| `capability.loop-extension-runner` v2 | S-32 | [S-32 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-32-装配给的保证-vs-协议须给的保证) |
| `capability.loop-extension-runner` v2 | S-33 | [S-33 依赖的提供者不可用](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-33-依赖的提供者不可用) |
| `capability.loop-extension-runner` v2 | S-34 | [S-34 撤下、回收与取消时在途的经过](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-34-撤下回收与取消时在途的经过) |
| `capability.loop-extension-runner` v2 | S-35 | [S-35 形式工件：回放的行为模型已触发、尚未闭合](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合) |
| `capability.loop-extension-runner` v2 | S-36 | [S-36 逐件顺序与改写叠加，放行判断看到最后那一份](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-36-逐件顺序与改写叠加放行判断看到最后那一份) |
| `capability.loop-extension-runner` v2 | S-37 | [S-37 回放不出第二张卡、不再问第二遍模型](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-37-回放不出第二张卡不再问第二遍模型) |
| `capability.loop-extension-runner` v2 | S-38 | [S-38 停机不产生第二条结论](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-38-停机不产生第二条结论) |
| `capability.loop-extension-runner` v2 | S-39 | [S-39 装配清单变了，回放报不一致](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-39-装配清单变了回放报不一致) |
| `capability.loop-extension-runner` v2 | S-40 | [S-40 注入链只有一层](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-40-注入链只有一层) |
| `capability.loop-extension-runner` v2 | S-41 | [S-41 不可用、报错、否决三者分得开](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-41-不可用报错否决三者分得开) |
| `capability.loop-extension-runner` v2 | S-42 | [S-42 系统自带件不可用时由指定挂件顶上](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-42-系统自带件不可用时由指定挂件顶上) |
| `capability.loop-extension-runner` v2 | S-43 | [S-43 找不到清单不是空链](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-43-找不到清单不是空链) |
| `capability.loop-extension-runner` v2 | S-44 | [S-44 连续被否决的回复被收住](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-44-连续被否决的回复被收住) |
| `capability.loop-extension-runner` v2 | S-45 | [S-45 模型的回复落盘之前改不了](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-45-模型的回复落盘之前改不了) |
| `capability.loop-extension-runner` v2 | S-46 | [S-46 retry 被拒，按上交继续](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-46-retry-被拒按上交继续) |
| `capability.loop-extension-runner` v2 | S-47 | [S-47 过期的协程写不进](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-47-过期的协程写不进) |
| `capability.loop-extension-runner` v2 | S-48 | [S-48 放行判断一轮汇合、凭据扣住、答复只认自己的卡](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-48-放行判断一轮汇合凭据扣住答复只认自己的卡) |
| `capability.loop-extension-runner` v2 | S-49 | [S-49 声明了「不可用即否决」的租户件](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-49-声明了不可用即否决的租户件) |
| `capability.loop-extension-runner` v2 | S-51 | [S-51 运行被取消，这一次 `dispatch` 以 `cancelled` 收场](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-51-运行被取消这一次-dispatch-以-cancelled-收场) |
| `capability.loop-extension-runner` v2 | S-52 | [S-52 执行环境句柄只及本会话、调用返回即失效](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-52-执行环境句柄只及本会话调用返回即失效) |
| `capability.mcp-bridge` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-1-本契约拥有什么) |
| `capability.mcp-bridge` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.mcp-bridge` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.mcp-bridge` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.mcp-bridge` v2 | S-5 | [S-5 接入点持有的寻址](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-5-接入点持有的寻址) |
| `capability.mcp-bridge` v2 | S-6 | [S-6 连接：归桥，不上签名，不跨租户](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-6-连接归桥不上签名不跨租户) |
| `capability.mcp-bridge` v2 | S-7 | [S-7 动作清单持久副本](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-7-动作清单持久副本) |
| `capability.mcp-bridge` v2 | S-8 | [S-8 OAuth 绑定：状态与迁移](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-8-oauth-绑定状态与迁移) |
| `capability.mcp-bridge` v2 | S-9 | [S-9 凭据的出示与取用](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-9-凭据的出示与取用) |
| `capability.mcp-bridge` v2 | S-10 | [S-10 对端可用性不由本系统掌握](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-10-对端可用性不由本系统掌握) |
| `capability.mcp-bridge` v2 | S-11 | [S-11 缺席时的默认答案](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-11-缺席时的默认答案) |
| `capability.mcp-bridge` v2 | S-12 | [S-12 每次执行尝试重新列举，尝试内不变](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-12-每次执行尝试重新列举尝试内不变) |
| `capability.mcp-bridge` v2 | S-13 | [S-13 凭据与引用不进任何呈现](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-13-凭据与引用不进任何呈现) |
| `capability.mcp-bridge` v2 | S-14 | [S-14 桥不做放行判断](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-14-桥不做放行判断) |
| `capability.mcp-bridge` v2 | S-15 | [S-15 这一节每个操作写全九件事](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-15-这一节每个操作写全九件事) |
| `capability.mcp-bridge` v2 | S-16 | [S-16 refreshActions](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-16-refreshactions) |
| `capability.mcp-bridge` v2 | S-17 | [S-17 projectActions](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-17-projectactions) |
| `capability.mcp-bridge` v2 | S-18 | [S-18 availability](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-18-availability) |
| `capability.mcp-bridge` v2 | S-19 | [S-19 invoke](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-19-invoke) |
| `capability.mcp-bridge` v2 | S-20 | [S-20 对端结果怎样成为 ToolResult](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-20-对端结果怎样成为-toolresult) |
| `capability.mcp-bridge` v2 | S-21 | [S-21 失败值与收场的对应](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-21-失败值与收场的对应) |
| `capability.mcp-bridge` v2 | S-22 | [S-22 beginOAuth](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-22-beginoauth) |
| `capability.mcp-bridge` v2 | S-23 | [S-23 completeOAuth](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-23-completeoauth) |
| `capability.mcp-bridge` v2 | S-24 | [S-24 续期、清值与作废](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-24-续期清值与作废) |
| `capability.mcp-bridge` v2 | S-25 | [S-25 对端来的通知与请求](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-25-对端来的通知与请求) |
| `capability.mcp-bridge` v2 | S-26 | [S-26 连接的收口次序](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-26-连接的收口次序) |
| `capability.mcp-bridge` v2 | S-27 | [S-27 桥被替换或卸载](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-27-桥被替换或卸载) |
| `capability.mcp-bridge` v2 | S-28 | [S-28 据点停机与重启](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-28-据点停机与重启) |
| `capability.mcp-bridge` v2 | S-29 | [S-29 依赖的提供者不可用](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-29-依赖的提供者不可用) |
| `capability.mcp-bridge` v2 | S-30 | [S-30 装配给与协议给](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-30-装配给与协议给) |
| `capability.mcp-bridge` v2 | S-31 | [S-31 本版选用哪些形式工件](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-31-本版选用哪些形式工件) |
| `capability.mcp-bridge` v2 | S-32 | [S-32 连不上时照上一份清单装替换件](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-32-连不上时照上一份清单装替换件) |
| `capability.mcp-bridge` v2 | S-33 | [S-33 从没连上过的接入点没有条目](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-33-从没连上过的接入点没有条目) |
| `capability.mcp-bridge` v2 | S-34 | [S-34 仓库的同名接入点拿不到租户的凭据](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-34-仓库的同名接入点拿不到租户的凭据) |
| `capability.mcp-bridge` v2 | S-35 | [S-35 调用途中断线不重发](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-35-调用途中断线不重发) |
| `capability.mcp-bridge` v2 | S-36 | [S-36 续期不打扰任何人](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-36-续期不打扰任何人) |
| `capability.mcp-bridge` v2 | S-37 | [S-37 OAuth 取到的引用配不上就作废](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-37-oauth-取到的引用配不上就作废) |
| `capability.mcp-bridge` v2 | S-38 | [S-38 桥换代时在途调用落异常中断](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-38-桥换代时在途调用落异常中断) |
| `capability.modality-projection` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/modality-projection/v2/contract.md#s-1-本契约拥有什么) |
| `capability.modality-projection` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/modality-projection/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.modality-projection` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/modality-projection/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.modality-projection` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/modality-projection/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.modality-projection` v2 | S-5 | [S-5 模态投影是对会话日志的一次折叠](../../../../spec/capabilities/modality-projection/v2/contract.md#s-5-模态投影是对会话日志的一次折叠) |
| `capability.modality-projection` v2 | S-6 | [S-6 只增不减，可以逐条并进去，重算必得同一答案](../../../../spec/capabilities/modality-projection/v2/contract.md#s-6-只增不减可以逐条并进去重算必得同一答案) |
| `capability.modality-projection` v2 | S-7 | [S-7 模态兼容](../../../../spec/capabilities/modality-projection/v2/contract.md#s-7-模态兼容) |
| `capability.modality-projection` v2 | S-8 | [S-8 转换件的键](../../../../spec/capabilities/modality-projection/v2/contract.md#s-8-转换件的键) |
| `capability.modality-projection` v2 | S-9 | [S-9 登记表：同键一件，登记是系统装配层的声明](../../../../spec/capabilities/modality-projection/v2/contract.md#s-9-登记表同键一件登记是系统装配层的声明) |
| `capability.modality-projection` v2 | S-10 | [S-10 一个块落在哪个键上](../../../../spec/capabilities/modality-projection/v2/contract.md#s-10-一个块落在哪个键上) |
| `capability.modality-projection` v2 | S-11 | [S-11 一次合法的转换产出](../../../../spec/capabilities/modality-projection/v2/contract.md#s-11-一次合法的转换产出) |
| `capability.modality-projection` v2 | S-12 | [S-12 缺席时的默认答案](../../../../spec/capabilities/modality-projection/v2/contract.md#s-12-缺席时的默认答案) |
| `capability.modality-projection` v2 | S-13 | [S-13 输入不合形状收成 `invalidInput`](../../../../spec/capabilities/modality-projection/v2/contract.md#s-13-输入不合形状收成-invalidinput) |
| `capability.modality-projection` v2 | S-14 | [S-14 每个操作写全九件事](../../../../spec/capabilities/modality-projection/v2/contract.md#s-14-每个操作写全九件事) |
| `capability.modality-projection` v2 | S-15 | [S-15 读投影 `project`](../../../../spec/capabilities/modality-projection/v2/contract.md#s-15-读投影-project) |
| `capability.modality-projection` v2 | S-16 | [S-16 兼容判定 `compatible`](../../../../spec/capabilities/modality-projection/v2/contract.md#s-16-兼容判定-compatible) |
| `capability.modality-projection` v2 | S-17 | [S-17 声明转换件 `declareConverters`](../../../../spec/capabilities/modality-projection/v2/contract.md#s-17-声明转换件-declareconverters) |
| `capability.modality-projection` v2 | S-18 | [S-18 转换一个块 `convert`](../../../../spec/capabilities/modality-projection/v2/contract.md#s-18-转换一个块-convert) |
| `capability.modality-projection` v2 | S-19 | [S-19 查登记 `lookupConverter`](../../../../spec/capabilities/modality-projection/v2/contract.md#s-19-查登记-lookupconverter) |
| `capability.modality-projection` v2 | S-20 | [S-20 一条消息在落盘之前的转换：全有或全无](../../../../spec/capabilities/modality-projection/v2/contract.md#s-20-一条消息在落盘之前的转换全有或全无) |
| `capability.modality-projection` v2 | S-21 | [S-21 转换件不可用即转换失败](../../../../spec/capabilities/modality-projection/v2/contract.md#s-21-转换件不可用即转换失败) |
| `capability.modality-projection` v2 | S-22 | [S-22 没有转换件输入的消息不依赖转换这一侧](../../../../spec/capabilities/modality-projection/v2/contract.md#s-22-没有转换件输入的消息不依赖转换这一侧) |
| `capability.modality-projection` v2 | S-23 | [S-23 同一位置上，转换之后不再动块](../../../../spec/capabilities/modality-projection/v2/contract.md#s-23-同一位置上转换之后不再动块) |
| `capability.modality-projection` v2 | S-24 | [S-24 转换件不发起模型调用](../../../../spec/capabilities/modality-projection/v2/contract.md#s-24-转换件不发起模型调用) |
| `capability.modality-projection` v2 | S-25 | [S-25 本契约不发事件](../../../../spec/capabilities/modality-projection/v2/contract.md#s-25-本契约不发事件) |
| `capability.modality-projection` v2 | S-26 | [S-26 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/modality-projection/v2/contract.md#s-26-装配给的保证-vs-协议须给的保证) |
| `capability.modality-projection` v2 | S-27 | [S-27 依赖不可用，本能力重启](../../../../spec/capabilities/modality-projection/v2/contract.md#s-27-依赖不可用本能力重启) |
| `capability.modality-projection` v2 | S-28 | [S-28 替换与撤除时在途的转换](../../../../spec/capabilities/modality-projection/v2/contract.md#s-28-替换与撤除时在途的转换) |
| `capability.modality-projection` v2 | S-29 | [S-29 本版选用哪些形式工件](../../../../spec/capabilities/modality-projection/v2/contract.md#s-29-本版选用哪些形式工件) |
| `capability.modality-projection` v2 | S-30 | [S-30 没登记就挡、登记了就不挡、事后登记不回头](../../../../spec/capabilities/modality-projection/v2/contract.md#s-30-没登记就挡登记了就不挡事后登记不回头) |
| `capability.modality-projection` v2 | S-31 | [S-31 文件块两键命中取媒体类型键](../../../../spec/capabilities/modality-projection/v2/contract.md#s-31-文件块两键命中取媒体类型键) |
| `capability.modality-projection` v2 | S-32 | [S-32 只给人看的块不改变合法目标](../../../../spec/capabilities/modality-projection/v2/contract.md#s-32-只给人看的块不改变合法目标) |
| `capability.modality-projection` v2 | S-33 | [S-33 转换件不可用时不落原样](../../../../spec/capabilities/modality-projection/v2/contract.md#s-33-转换件不可用时不落原样) |
| `capability.modality-projection` v2 | S-34 | [S-34 一块转不成，整条不落盘](../../../../spec/capabilities/modality-projection/v2/contract.md#s-34-一块转不成整条不落盘) |
| `capability.modality-projection` v2 | S-35 | [S-35 转换件违约的五种样子](../../../../spec/capabilities/modality-projection/v2/contract.md#s-35-转换件违约的五种样子) |
| `capability.modality-projection` v2 | S-36 | [S-36 替换不经过「没登记」](../../../../spec/capabilities/modality-projection/v2/contract.md#s-36-替换不经过没登记) |
| `capability.modality-projection` v2 | S-37 | [S-37 投影逐条并入与整份重算相同](../../../../spec/capabilities/modality-projection/v2/contract.md#s-37-投影逐条并入与整份重算相同) |
| `capability.model-profile-directory` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-1-本契约拥有什么) |
| `capability.model-profile-directory` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.model-profile-directory` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.model-profile-directory` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.model-profile-directory` v2 | S-5 | [S-5 档案行：一条档案在目录里的存储事实](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-5-档案行一条档案在目录里的存储事实) |
| `capability.model-profile-directory` v2 | S-6 | [S-6 范围链](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-6-范围链) |
| `capability.model-profile-directory` v2 | S-7 | [S-7 凭据绑定](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-7-凭据绑定) |
| `capability.model-profile-directory` v2 | S-8 | [S-8 官方档案清单与发布序号](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-8-官方档案清单与发布序号) |
| `capability.model-profile-directory` v2 | S-9 | [S-9 缺席时的默认答案](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-9-缺席时的默认答案) |
| `capability.model-profile-directory` v2 | S-10 | [S-10 配置资格：谁能在哪一格写](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-10-配置资格谁能在哪一格写) |
| `capability.model-profile-directory` v2 | S-11 | [S-11 每道准入现读](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-11-每道准入现读) |
| `capability.model-profile-directory` v2 | S-12 | [S-12 秘密只在一个问法里出现](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-12-秘密只在一个问法里出现) |
| `capability.model-profile-directory` v2 | S-13 | [S-13 这一节每个操作写全九件事](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-13-这一节每个操作写全九件事) |
| `capability.model-profile-directory` v2 | S-14 | [S-14 registerProfile](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-14-registerprofile) |
| `capability.model-profile-directory` v2 | S-15 | [S-15 withdrawProfile](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-15-withdrawprofile) |
| `capability.model-profile-directory` v2 | S-16 | [S-16 readProfile](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-16-readprofile) |
| `capability.model-profile-directory` v2 | S-17 | [S-17 listProfiles](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-17-listprofiles) |
| `capability.model-profile-directory` v2 | S-18 | [S-18 loadManifest](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-18-loadmanifest) |
| `capability.model-profile-directory` v2 | S-19 | [S-19 bindCredential](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-19-bindcredential) |
| `capability.model-profile-directory` v2 | S-20 | [S-20 resolveCredential](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-20-resolvecredential) |
| `capability.model-profile-directory` v2 | S-31 | [S-31 updateProfile](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-31-updateprofile) |
| `capability.model-profile-directory` v2 | S-32 | [S-32 unbindCredential](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-32-unbindcredential) |
| `capability.model-profile-directory` v2 | S-33 | [S-33 relistProfile](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-33-relistprofile) |
| `capability.model-profile-directory` v2 | S-21 | [S-21 profile.withdrawn 是通知](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-21-profilewithdrawn-是通知) |
| `capability.model-profile-directory` v2 | S-22 | [S-22 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-22-装配给的保证-vs-协议须给的保证) |
| `capability.model-profile-directory` v2 | S-23 | [S-23 依赖不可用、撤除与重启](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-23-依赖不可用撤除与重启) |
| `capability.model-profile-directory` v2 | S-24 | [S-24 本版选用哪些形式工件](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-24-本版选用哪些形式工件) |
| `capability.model-profile-directory` v2 | S-25 | [S-25 建档、撤回、再读：已撤回仍读得出](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-25-建档撤回再读已撤回仍读得出) |
| `capability.model-profile-directory` v2 | S-26 | [S-26 同名两条只有先成的一条成立](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-26-同名两条只有先成的一条成立) |
| `capability.model-profile-directory` v2 | S-27 | [S-27 清单的五种处置与旧清单被拒](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-27-清单的五种处置与旧清单被拒) |
| `capability.model-profile-directory` v2 | S-28 | [S-28 取最具体的一把，读不到不回落](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-28-取最具体的一把读不到不回落) |
| `capability.model-profile-directory` v2 | S-29 | [S-29 秘密不出本契约](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-29-秘密不出本契约) |
| `capability.model-profile-directory` v2 | S-30 | [S-30 无权者探不到名字](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-30-无权者探不到名字) |
| `capability.model-request-runtime` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-1-本契约拥有什么) |
| `capability.model-request-runtime` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.model-request-runtime` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.model-request-runtime` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.model-request-runtime` v2 | S-5 | [S-5 一次调用、一次发出](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-5-一次调用一次发出) |
| `capability.model-request-runtime` v2 | S-6 | [S-6 调用的状态](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-6-调用的状态) |
| `capability.model-request-runtime` v2 | S-7 | [S-7 一次调用绑定了什么](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-7-一次调用绑定了什么) |
| `capability.model-request-runtime` v2 | S-8 | [S-8 调用在会话日志里留下的六种记录](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-8-调用在会话日志里留下的六种记录) |
| `capability.model-request-runtime` v2 | S-9 | [S-9 选中模型](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-9-选中模型) |
| `capability.model-request-runtime` v2 | S-10 | [S-10 有效模型：四步，每步来源可查](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-10-有效模型四步每步来源可查) |
| `capability.model-request-runtime` v2 | S-11 | [S-11 合法目标集合](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-11-合法目标集合) |
| `capability.model-request-runtime` v2 | S-12 | [S-12 展示列表](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-12-展示列表) |
| `capability.model-request-runtime` v2 | S-13 | [S-13 模态投影：读到的必须追到日志尾](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-13-模态投影读到的必须追到日志尾) |
| `capability.model-request-runtime` v2 | S-14 | [S-14 缺席时的默认答案与失败集合](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-14-缺席时的默认答案与失败集合) |
| `capability.model-request-runtime` v2 | S-15 | [S-15 两个锚点：先写后行](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-15-两个锚点先写后行) |
| `capability.model-request-runtime` v2 | S-16 | [S-16 首 token 判据](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-16-首-token-判据) |
| `capability.model-request-runtime` v2 | S-17 | [S-17 结算：一处、按序、幂等、先到者赢](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-17-结算一处按序幂等先到者赢) |
| `capability.model-request-runtime` v2 | S-18 | [S-18 成因按来源分类；三类事实由守卫兑现](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-18-成因按来源分类三类事实由守卫兑现) |
| `capability.model-request-runtime` v2 | S-19 | [S-19 凭据每次发出现取，取值只交给传输适配](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-19-凭据每次发出现取取值只交给传输适配) |
| `capability.model-request-runtime` v2 | S-20 | [S-20 写入之前脱敏](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-20-写入之前脱敏) |
| `capability.model-request-runtime` v2 | S-21 | [S-21 两个时限是运行时设置项](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-21-两个时限是运行时设置项) |
| `capability.model-request-runtime` v2 | S-22 | [S-22 同一次调用的发出序列](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-22-同一次调用的发出序列) |
| `capability.model-request-runtime` v2 | S-51 | [S-51 模型侧到达装配前提的承诺](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-51-模型侧到达装配前提的承诺) |
| `capability.model-request-runtime` v2 | S-23 | [S-23 这一节每个操作写全九件事](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-23-这一节每个操作写全九件事) |
| `capability.model-request-runtime` v2 | S-24 | [S-24 legalTargets](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-24-legaltargets) |
| `capability.model-request-runtime` v2 | S-25 | [S-25 displayList](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-25-displaylist) |
| `capability.model-request-runtime` v2 | S-26 | [S-26 effectiveModel](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-26-effectivemodel) |
| `capability.model-request-runtime` v2 | S-27 | [S-27 selectModel](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-27-selectmodel) |
| `capability.model-request-runtime` v2 | S-28 | [S-28 openCall](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-28-opencall) |
| `capability.model-request-runtime` v2 | S-29 | [S-29 dispatch](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-29-dispatch) |
| `capability.model-request-runtime` v2 | S-30 | [S-30 dispatchAgain](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-30-dispatchagain) |
| `capability.model-request-runtime` v2 | S-31 | [S-31 interrupt](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-31-interrupt) |
| `capability.model-request-runtime` v2 | S-32 | [S-32 releaseCall](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-32-releasecall) |
| `capability.model-request-runtime` v2 | S-33 | [S-33 reconcile](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-33-reconcile) |
| `capability.model-request-runtime` v2 | S-34 | [S-34 readAttempts](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-34-readattempts) |
| `capability.model-request-runtime` v2 | S-49 | [S-49 settleReply](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-49-settlereply) |
| `capability.model-request-runtime` v2 | S-50 | [S-50 canDispatchAgain](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-50-candispatchagain) |
| `capability.model-request-runtime` v2 | S-35 | [S-35 默认重试件（可替换）](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-35-默认重试件可替换) |
| `capability.model-request-runtime` v2 | S-36 | [S-36 宿主停止与撤除](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-36-宿主停止与撤除) |
| `capability.model-request-runtime` v2 | S-37 | [S-37 本契约不发事件](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-37-本契约不发事件) |
| `capability.model-request-runtime` v2 | S-38 | [S-38 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) |
| `capability.model-request-runtime` v2 | S-39 | [S-39 依赖不可用、撤除与重启](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-39-依赖不可用撤除与重启) |
| `capability.model-request-runtime` v2 | S-40 | [S-40 本版选用哪些形式工件](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-40-本版选用哪些形式工件) |
| `capability.model-request-runtime` v2 | S-41 | [S-41 两家发出：第一家 429 未开口，第二家完成](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-41-两家发出第一家-429-未开口第二家完成) |
| `capability.model-request-runtime` v2 | S-42 | [S-42 开口之后断流，不重发](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-42-开口之后断流不重发) |
| `capability.model-request-runtime` v2 | S-43 | [S-43 切换先落事实后生效](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-43-切换先落事实后生效) |
| `capability.model-request-runtime` v2 | S-44 | [S-44 已下架的档案](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-44-已下架的档案) |
| `capability.model-request-runtime` v2 | S-45 | [S-45 模态不兼容挡在算合法目标那一刻](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-45-模态不兼容挡在算合法目标那一刻) |
| `capability.model-request-runtime` v2 | S-46 | [S-46 成因按来源分类与脱敏](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-46-成因按来源分类与脱敏) |
| `capability.model-request-runtime` v2 | S-47 | [S-47 用户叫停之后停机，不再发出](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-47-用户叫停之后停机不再发出) |
| `capability.model-request-runtime` v2 | S-48 | [S-48 同路由名按层覆盖：一个名字一条，落到胜出行](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行) |
| `capability.model-request-runtime` v2 | S-52 | [S-52 模型侧的装配宿主：被拒的增量报一次，收场之后的事件不进](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进) |
| `capability.organization-governance` v1 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/organization-governance/v1/contract.md#s-1-本契约拥有什么) |
| `capability.organization-governance` v1 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/organization-governance/v1/contract.md#s-2-本契约不拥有什么) |
| `capability.organization-governance` v1 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/organization-governance/v1/contract.md#s-3-本契约明确不承诺什么) |
| `capability.organization-governance` v1 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/organization-governance/v1/contract.md#s-4-依赖方向与被消费的面) |
| `capability.organization-governance` v1 | S-5 | [S-5 组织](../../../../spec/capabilities/organization-governance/v1/contract.md#s-5-组织) |
| `capability.organization-governance` v1 | S-6 | [S-6 两个变体与四条结构性禁止](../../../../spec/capabilities/organization-governance/v1/contract.md#s-6-两个变体与四条结构性禁止) |
| `capability.organization-governance` v1 | S-7 | [S-7 上级组织属性](../../../../spec/capabilities/organization-governance/v1/contract.md#s-7-上级组织属性) |
| `capability.organization-governance` v1 | S-8 | [S-8 成员关系记录](../../../../spec/capabilities/organization-governance/v1/contract.md#s-8-成员关系记录) |
| `capability.organization-governance` v1 | S-9 | [S-9 成员资格判定结果两值，不可用是读面失败](../../../../spec/capabilities/organization-governance/v1/contract.md#s-9-成员资格判定结果两值不可用是读面失败) |
| `capability.organization-governance` v1 | S-10 | [S-10 邀请](../../../../spec/capabilities/organization-governance/v1/contract.md#s-10-邀请) |
| `capability.organization-governance` v1 | S-11 | [S-11 隶属请求](../../../../spec/capabilities/organization-governance/v1/contract.md#s-11-隶属请求) |
| `capability.organization-governance` v1 | S-12 | [S-12 上级链与有共同上级](../../../../spec/capabilities/organization-governance/v1/contract.md#s-12-上级链与有共同上级) |
| `capability.organization-governance` v1 | S-13 | [S-13 层身份读面](../../../../spec/capabilities/organization-governance/v1/contract.md#s-13-层身份读面) |
| `capability.organization-governance` v1 | S-14 | [S-14 当前租户身份是登录状态上的一项选择](../../../../spec/capabilities/organization-governance/v1/contract.md#s-14-当前租户身份是登录状态上的一项选择) |
| `capability.organization-governance` v1 | S-15 | [S-15 结构性禁止不是权限判定](../../../../spec/capabilities/organization-governance/v1/contract.md#s-15-结构性禁止不是权限判定) |
| `capability.organization-governance` v1 | S-16 | [S-16 缺席时的默认答案](../../../../spec/capabilities/organization-governance/v1/contract.md#s-16-缺席时的默认答案) |
| `capability.organization-governance` v1 | S-17 | [S-17 同一组织的成员写入序列化](../../../../spec/capabilities/organization-governance/v1/contract.md#s-17-同一组织的成员写入序列化) |
| `capability.organization-governance` v1 | S-18 | [S-18 每道准入现读](../../../../spec/capabilities/organization-governance/v1/contract.md#s-18-每道准入现读) |
| `capability.organization-governance` v1 | S-19 | [S-19 这一节每个操作写全九件事](../../../../spec/capabilities/organization-governance/v1/contract.md#s-19-这一节每个操作写全九件事) |
| `capability.organization-governance` v1 | S-20 | [S-20 创建个人组织](../../../../spec/capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) |
| `capability.organization-governance` v1 | S-21 | [S-21 创建团队组织](../../../../spec/capabilities/organization-governance/v1/contract.md#s-21-创建团队组织) |
| `capability.organization-governance` v1 | S-22 | [S-22 读组织](../../../../spec/capabilities/organization-governance/v1/contract.md#s-22-读组织) |
| `capability.organization-governance` v1 | S-23 | [S-23 发出邀请](../../../../spec/capabilities/organization-governance/v1/contract.md#s-23-发出邀请) |
| `capability.organization-governance` v1 | S-24 | [S-24 撤回邀请](../../../../spec/capabilities/organization-governance/v1/contract.md#s-24-撤回邀请) |
| `capability.organization-governance` v1 | S-25 | [S-25 接受邀请](../../../../spec/capabilities/organization-governance/v1/contract.md#s-25-接受邀请) |
| `capability.organization-governance` v1 | S-26 | [S-26 成员资格判定](../../../../spec/capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) |
| `capability.organization-governance` v1 | S-27 | [S-27 我的租户](../../../../spec/capabilities/organization-governance/v1/contract.md#s-27-我的租户) |
| `capability.organization-governance` v1 | S-28 | [S-28 调整角色](../../../../spec/capabilities/organization-governance/v1/contract.md#s-28-调整角色) |
| `capability.organization-governance` v1 | S-29 | [S-29 解除成员](../../../../spec/capabilities/organization-governance/v1/contract.md#s-29-解除成员) |
| `capability.organization-governance` v1 | S-30 | [S-30 发出隶属请求](../../../../spec/capabilities/organization-governance/v1/contract.md#s-30-发出隶属请求) |
| `capability.organization-governance` v1 | S-31 | [S-31 撤回隶属请求](../../../../spec/capabilities/organization-governance/v1/contract.md#s-31-撤回隶属请求) |
| `capability.organization-governance` v1 | S-32 | [S-32 接受隶属请求](../../../../spec/capabilities/organization-governance/v1/contract.md#s-32-接受隶属请求) |
| `capability.organization-governance` v1 | S-33 | [S-33 解除隶属](../../../../spec/capabilities/organization-governance/v1/contract.md#s-33-解除隶属) |
| `capability.organization-governance` v1 | S-53 | [S-53 清除未激活账号的个人组织](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) |
| `capability.organization-governance` v1 | S-34 | [S-34 上级链与有共同上级](../../../../spec/capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级) |
| `capability.organization-governance` v1 | S-35 | [S-35 层身份](../../../../spec/capabilities/organization-governance/v1/contract.md#s-35-层身份) |
| `capability.organization-governance` v1 | S-36 | [S-36 当前租户身份查询](../../../../spec/capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) |
| `capability.organization-governance` v1 | S-37 | [S-37 切换当前租户身份](../../../../spec/capabilities/organization-governance/v1/contract.md#s-37-切换当前租户身份) |
| `capability.organization-governance` v1 | S-55 | [S-55 读邀请](../../../../spec/capabilities/organization-governance/v1/contract.md#s-55-读邀请) |
| `capability.organization-governance` v1 | S-56 | [S-56 读隶属请求](../../../../spec/capabilities/organization-governance/v1/contract.md#s-56-读隶属请求) |
| `capability.organization-governance` v1 | S-57 | [S-57 列出账号收到的待接受邀请](../../../../spec/capabilities/organization-governance/v1/contract.md#s-57-列出账号收到的待接受邀请) |
| `capability.organization-governance` v1 | S-58 | [S-58 列出组织发出的邀请与隶属请求](../../../../spec/capabilities/organization-governance/v1/contract.md#s-58-列出组织发出的邀请与隶属请求) |
| `capability.organization-governance` v1 | S-59 | [S-59 列出组织成员](../../../../spec/capabilities/organization-governance/v1/contract.md#s-59-列出组织成员) |
| `capability.organization-governance` v1 | S-60 | [S-60 列出组织收到的隶属请求](../../../../spec/capabilities/organization-governance/v1/contract.md#s-60-列出组织收到的隶属请求) |
| `capability.organization-governance` v1 | S-38 | [S-38 解除只改成员关系的有效性](../../../../spec/capabilities/organization-governance/v1/contract.md#s-38-解除只改成员关系的有效性) |
| `capability.organization-governance` v1 | S-39 | [S-39 回来的是同一个租户](../../../../spec/capabilities/organization-governance/v1/contract.md#s-39-回来的是同一个租户) |
| `capability.organization-governance` v1 | S-40 | [S-40 事件都是通知](../../../../spec/capabilities/organization-governance/v1/contract.md#s-40-事件都是通知) |
| `capability.organization-governance` v1 | S-41 | [S-41 本版不开控制类事件](../../../../spec/capabilities/organization-governance/v1/contract.md#s-41-本版不开控制类事件) |
| `capability.organization-governance` v1 | S-42 | [S-42 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) |
| `capability.organization-governance` v1 | S-43 | [S-43 依赖的提供者不可用](../../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用) |
| `capability.organization-governance` v1 | S-44 | [S-44 撤销不发出停止信号](../../../../spec/capabilities/organization-governance/v1/contract.md#s-44-撤销不发出停止信号) |
| `capability.organization-governance` v1 | S-45 | [S-45 本版选用哪些形式工件](../../../../spec/capabilities/organization-governance/v1/contract.md#s-45-本版选用哪些形式工件) |
| `capability.organization-governance` v1 | S-46 | [S-46 邀约的三种收场](../../../../spec/capabilities/organization-governance/v1/contract.md#s-46-邀约的三种收场) |
| `capability.organization-governance` v1 | S-47 | [S-47 过期之后接受被拒，且没有中间状态](../../../../spec/capabilities/organization-governance/v1/contract.md#s-47-过期之后接受被拒且没有中间状态) |
| `capability.organization-governance` v1 | S-48 | [S-48 并发移除对方只有先成的一方成立](../../../../spec/capabilities/organization-governance/v1/contract.md#s-48-并发移除对方只有先成的一方成立) |
| `capability.organization-governance` v1 | S-49 | [S-49 解除之后再加入，回来的是同一个租户](../../../../spec/capabilities/organization-governance/v1/contract.md#s-49-解除之后再加入回来的是同一个租户) |
| `capability.organization-governance` v1 | S-50 | [S-50 切换只影响此后新建的东西](../../../../spec/capabilities/organization-governance/v1/contract.md#s-50-切换只影响此后新建的东西) |
| `capability.organization-governance` v1 | S-51 | [S-51 个人组织里没有这个动作](../../../../spec/capabilities/organization-governance/v1/contract.md#s-51-个人组织里没有这个动作) |
| `capability.organization-governance` v1 | S-54 | [S-54 清除只对未激活账号成立](../../../../spec/capabilities/organization-governance/v1/contract.md#s-54-清除只对未激活账号成立) |
| `capability.organization-governance` v1 | S-52 | [S-52 成员资格不可用时明确失败](../../../../spec/capabilities/organization-governance/v1/contract.md#s-52-成员资格不可用时明确失败) |
| `capability.organization-governance` v3 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/organization-governance/v3/contract.md#s-1-本契约拥有什么) |
| `capability.organization-governance` v3 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/organization-governance/v3/contract.md#s-2-本契约不拥有什么) |
| `capability.organization-governance` v3 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/organization-governance/v3/contract.md#s-3-本契约明确不承诺什么) |
| `capability.organization-governance` v3 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/organization-governance/v3/contract.md#s-4-依赖方向与被消费的面) |
| `capability.organization-governance` v3 | S-5 | [S-5 组织](../../../../spec/capabilities/organization-governance/v3/contract.md#s-5-组织) |
| `capability.organization-governance` v3 | S-6 | [S-6 两个变体与四条结构性禁止](../../../../spec/capabilities/organization-governance/v3/contract.md#s-6-两个变体与四条结构性禁止) |
| `capability.organization-governance` v3 | S-7 | [S-7 上级组织属性](../../../../spec/capabilities/organization-governance/v3/contract.md#s-7-上级组织属性) |
| `capability.organization-governance` v3 | S-8 | [S-8 成员关系记录](../../../../spec/capabilities/organization-governance/v3/contract.md#s-8-成员关系记录) |
| `capability.organization-governance` v3 | S-9 | [S-9 成员资格判定结果两值，不可用是读面失败](../../../../spec/capabilities/organization-governance/v3/contract.md#s-9-成员资格判定结果两值不可用是读面失败) |
| `capability.organization-governance` v3 | S-10 | [S-10 邀请](../../../../spec/capabilities/organization-governance/v3/contract.md#s-10-邀请) |
| `capability.organization-governance` v3 | S-11 | [S-11 隶属请求](../../../../spec/capabilities/organization-governance/v3/contract.md#s-11-隶属请求) |
| `capability.organization-governance` v3 | S-12 | [S-12 上级链与有共同上级](../../../../spec/capabilities/organization-governance/v3/contract.md#s-12-上级链与有共同上级) |
| `capability.organization-governance` v3 | S-13 | [S-13 层身份读面](../../../../spec/capabilities/organization-governance/v3/contract.md#s-13-层身份读面) |
| `capability.organization-governance` v3 | S-14 | [S-14 当前租户身份是登录状态上的一项选择](../../../../spec/capabilities/organization-governance/v3/contract.md#s-14-当前租户身份是登录状态上的一项选择) |
| `capability.organization-governance` v3 | S-15 | [S-15 结构性禁止不是权限判定](../../../../spec/capabilities/organization-governance/v3/contract.md#s-15-结构性禁止不是权限判定) |
| `capability.organization-governance` v3 | S-16 | [S-16 缺席时的默认答案](../../../../spec/capabilities/organization-governance/v3/contract.md#s-16-缺席时的默认答案) |
| `capability.organization-governance` v3 | S-17 | [S-17 同一组织的成员写入序列化](../../../../spec/capabilities/organization-governance/v3/contract.md#s-17-同一组织的成员写入序列化) |
| `capability.organization-governance` v3 | S-18 | [S-18 每道准入现读](../../../../spec/capabilities/organization-governance/v3/contract.md#s-18-每道准入现读) |
| `capability.organization-governance` v3 | S-19 | [S-19 这一节每个操作写全九件事](../../../../spec/capabilities/organization-governance/v3/contract.md#s-19-这一节每个操作写全九件事) |
| `capability.organization-governance` v3 | S-20 | [S-20 创建个人组织](../../../../spec/capabilities/organization-governance/v3/contract.md#s-20-创建个人组织) |
| `capability.organization-governance` v3 | S-21 | [S-21 创建团队组织](../../../../spec/capabilities/organization-governance/v3/contract.md#s-21-创建团队组织) |
| `capability.organization-governance` v3 | S-22 | [S-22 读组织](../../../../spec/capabilities/organization-governance/v3/contract.md#s-22-读组织) |
| `capability.organization-governance` v3 | S-23 | [S-23 发出邀请](../../../../spec/capabilities/organization-governance/v3/contract.md#s-23-发出邀请) |
| `capability.organization-governance` v3 | S-24 | [S-24 撤回邀请](../../../../spec/capabilities/organization-governance/v3/contract.md#s-24-撤回邀请) |
| `capability.organization-governance` v3 | S-25 | [S-25 接受邀请](../../../../spec/capabilities/organization-governance/v3/contract.md#s-25-接受邀请) |
| `capability.organization-governance` v3 | S-26 | [S-26 成员资格判定](../../../../spec/capabilities/organization-governance/v3/contract.md#s-26-成员资格判定) |
| `capability.organization-governance` v3 | S-27 | [S-27 我的租户](../../../../spec/capabilities/organization-governance/v3/contract.md#s-27-我的租户) |
| `capability.organization-governance` v3 | S-28 | [S-28 调整角色](../../../../spec/capabilities/organization-governance/v3/contract.md#s-28-调整角色) |
| `capability.organization-governance` v3 | S-29 | [S-29 解除成员](../../../../spec/capabilities/organization-governance/v3/contract.md#s-29-解除成员) |
| `capability.organization-governance` v3 | S-30 | [S-30 发出隶属请求](../../../../spec/capabilities/organization-governance/v3/contract.md#s-30-发出隶属请求) |
| `capability.organization-governance` v3 | S-31 | [S-31 撤回隶属请求](../../../../spec/capabilities/organization-governance/v3/contract.md#s-31-撤回隶属请求) |
| `capability.organization-governance` v3 | S-32 | [S-32 接受隶属请求](../../../../spec/capabilities/organization-governance/v3/contract.md#s-32-接受隶属请求) |
| `capability.organization-governance` v3 | S-33 | [S-33 解除隶属](../../../../spec/capabilities/organization-governance/v3/contract.md#s-33-解除隶属) |
| `capability.organization-governance` v3 | S-53 | [S-53 清除未激活账号的个人组织](../../../../spec/capabilities/organization-governance/v3/contract.md#s-53-清除未激活账号的个人组织) |
| `capability.organization-governance` v3 | S-34 | [S-34 上级链与有共同上级](../../../../spec/capabilities/organization-governance/v3/contract.md#s-34-上级链与有共同上级) |
| `capability.organization-governance` v3 | S-35 | [S-35 层身份](../../../../spec/capabilities/organization-governance/v3/contract.md#s-35-层身份) |
| `capability.organization-governance` v3 | S-36 | [S-36 当前租户身份查询](../../../../spec/capabilities/organization-governance/v3/contract.md#s-36-当前租户身份查询) |
| `capability.organization-governance` v3 | S-37 | [S-37 切换当前租户身份](../../../../spec/capabilities/organization-governance/v3/contract.md#s-37-切换当前租户身份) |
| `capability.organization-governance` v3 | S-55 | [S-55 读邀请](../../../../spec/capabilities/organization-governance/v3/contract.md#s-55-读邀请) |
| `capability.organization-governance` v3 | S-56 | [S-56 读隶属请求](../../../../spec/capabilities/organization-governance/v3/contract.md#s-56-读隶属请求) |
| `capability.organization-governance` v3 | S-57 | [S-57 列出账号收到的待接受邀请](../../../../spec/capabilities/organization-governance/v3/contract.md#s-57-列出账号收到的待接受邀请) |
| `capability.organization-governance` v3 | S-58 | [S-58 列出组织发出的邀请与隶属请求](../../../../spec/capabilities/organization-governance/v3/contract.md#s-58-列出组织发出的邀请与隶属请求) |
| `capability.organization-governance` v3 | S-59 | [S-59 列出组织成员](../../../../spec/capabilities/organization-governance/v3/contract.md#s-59-列出组织成员) |
| `capability.organization-governance` v3 | S-60 | [S-60 列出组织收到的隶属请求](../../../../spec/capabilities/organization-governance/v3/contract.md#s-60-列出组织收到的隶属请求) |
| `capability.organization-governance` v3 | S-38 | [S-38 解除只改成员关系的有效性](../../../../spec/capabilities/organization-governance/v3/contract.md#s-38-解除只改成员关系的有效性) |
| `capability.organization-governance` v3 | S-39 | [S-39 回来的是同一个租户](../../../../spec/capabilities/organization-governance/v3/contract.md#s-39-回来的是同一个租户) |
| `capability.organization-governance` v3 | S-40 | [S-40 事件都是通知](../../../../spec/capabilities/organization-governance/v3/contract.md#s-40-事件都是通知) |
| `capability.organization-governance` v3 | S-41 | [S-41 本版不开控制类事件](../../../../spec/capabilities/organization-governance/v3/contract.md#s-41-本版不开控制类事件) |
| `capability.organization-governance` v3 | S-42 | [S-42 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/organization-governance/v3/contract.md#s-42-装配给的保证-vs-协议须给的保证) |
| `capability.organization-governance` v3 | S-43 | [S-43 依赖的提供者不可用](../../../../spec/capabilities/organization-governance/v3/contract.md#s-43-依赖的提供者不可用) |
| `capability.organization-governance` v3 | S-44 | [S-44 撤销不发出停止信号](../../../../spec/capabilities/organization-governance/v3/contract.md#s-44-撤销不发出停止信号) |
| `capability.organization-governance` v3 | S-45 | [S-45 本版选用哪些形式工件](../../../../spec/capabilities/organization-governance/v3/contract.md#s-45-本版选用哪些形式工件) |
| `capability.organization-governance` v3 | S-46 | [S-46 邀约的三种收场](../../../../spec/capabilities/organization-governance/v3/contract.md#s-46-邀约的三种收场) |
| `capability.organization-governance` v3 | S-47 | [S-47 过期之后接受被拒，且没有中间状态](../../../../spec/capabilities/organization-governance/v3/contract.md#s-47-过期之后接受被拒且没有中间状态) |
| `capability.organization-governance` v3 | S-48 | [S-48 并发移除对方只有先成的一方成立](../../../../spec/capabilities/organization-governance/v3/contract.md#s-48-并发移除对方只有先成的一方成立) |
| `capability.organization-governance` v3 | S-49 | [S-49 解除之后再加入，回来的是同一个租户](../../../../spec/capabilities/organization-governance/v3/contract.md#s-49-解除之后再加入回来的是同一个租户) |
| `capability.organization-governance` v3 | S-50 | [S-50 切换只影响此后新建的东西](../../../../spec/capabilities/organization-governance/v3/contract.md#s-50-切换只影响此后新建的东西) |
| `capability.organization-governance` v3 | S-51 | [S-51 个人组织里没有这个动作](../../../../spec/capabilities/organization-governance/v3/contract.md#s-51-个人组织里没有这个动作) |
| `capability.organization-governance` v3 | S-54 | [S-54 清除只对未激活账号成立](../../../../spec/capabilities/organization-governance/v3/contract.md#s-54-清除只对未激活账号成立) |
| `capability.organization-governance` v3 | S-52 | [S-52 成员资格不可用时明确失败](../../../../spec/capabilities/organization-governance/v3/contract.md#s-52-成员资格不可用时明确失败) |
| `capability.organization-governance` v3 | S-61 | [S-61 两个时刻随写入写下、按规则改写、由三个读面带出](../../../../spec/capabilities/organization-governance/v3/contract.md#s-61-两个时刻随写入写下按规则改写由三个读面带出) |
| `capability.run-attempt-facts` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-1-本契约拥有什么) |
| `capability.run-attempt-facts` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.run-attempt-facts` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.run-attempt-facts` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.run-attempt-facts` v2 | S-5 | [S-5 两件事实](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-5-两件事实) |
| `capability.run-attempt-facts` v2 | S-6 | [S-6 只从假变真](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-6-只从假变真) |
| `capability.run-attempt-facts` v2 | S-7 | [S-7 读的是哪一刻](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-7-读的是哪一刻) |
| `capability.run-attempt-facts` v2 | S-8 | [S-8 缺席时的默认答案与失败值](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-8-缺席时的默认答案与失败值) |
| `capability.run-attempt-facts` v2 | S-9 | [S-9 attemptFacts：读一次尝试的两件事实](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-9-attemptfacts读一次尝试的两件事实) |
| `capability.run-attempt-facts` v2 | S-10 | [S-10 本版不发事件](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-10-本版不发事件) |
| `capability.run-attempt-facts` v2 | S-11 | [S-11 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-11-装配给的保证-vs-协议须给的保证) |
| `capability.run-attempt-facts` v2 | S-12 | [S-12 提供者撤除、换代与重启](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-12-提供者撤除换代与重启) |
| `capability.run-attempt-facts` v2 | S-13 | [S-13 本版选用哪些形式工件](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-13-本版选用哪些形式工件) |
| `capability.run-attempt-facts` v2 | S-14 | [S-14 取代之后读得「已被取代」](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-14-取代之后读得已被取代) |
| `capability.run-attempt-facts` v2 | S-15 | [S-15 终结之后读得「已终结」](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-15-终结之后读得已终结) |
| `capability.run-attempt-facts` v2 | S-16 | [S-16 没有这次尝试不是「仍是当前」](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-16-没有这次尝试不是仍是当前) |
| `capability.run-attempt-facts` v2 | S-17 | [S-17 读不到就是读不到](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-17-读不到就是读不到) |
| `capability.run-attempt-facts` v2 | S-18 | [S-18 只从假变真](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#s-18-只从假变真) |
| `capability.session-log` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/session-log/v2/contract.md#s-1-本契约拥有什么) |
| `capability.session-log` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/session-log/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.session-log` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/session-log/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.session-log` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/session-log/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.session-log` v2 | S-5 | [S-5 一个会话一本会话日志](../../../../spec/capabilities/session-log/v2/contract.md#s-5-一个会话一本会话日志) |
| `capability.session-log` v2 | S-6 | [S-6 条目与它的壳](../../../../spec/capabilities/session-log/v2/contract.md#s-6-条目与它的壳) |
| `capability.session-log` v2 | S-7 | [S-7 日志位置与尾位置](../../../../spec/capabilities/session-log/v2/contract.md#s-7-日志位置与尾位置) |
| `capability.session-log` v2 | S-8 | [S-8 判重键](../../../../spec/capabilities/session-log/v2/contract.md#s-8-判重键) |
| `capability.session-log` v2 | S-9 | [S-9 读取键](../../../../spec/capabilities/session-log/v2/contract.md#s-9-读取键) |
| `capability.session-log` v2 | S-10 | [S-10 尝试栅栏](../../../../spec/capabilities/session-log/v2/contract.md#s-10-尝试栅栏) |
| `capability.session-log` v2 | S-11 | [S-11 只增不改，载荷原样](../../../../spec/capabilities/session-log/v2/contract.md#s-11-只增不改载荷原样) |
| `capability.session-log` v2 | S-12 | [S-12 一本日志一个租户身份](../../../../spec/capabilities/session-log/v2/contract.md#s-12-一本日志一个租户身份) |
| `capability.session-log` v2 | S-13 | [S-13 提交与持久](../../../../spec/capabilities/session-log/v2/contract.md#s-13-提交与持久) |
| `capability.session-log` v2 | S-14 | [S-14 同一会话的追加一条接一条；判定与写入是同一步](../../../../spec/capabilities/session-log/v2/contract.md#s-14-同一会话的追加一条接一条判定与写入是同一步) |
| `capability.session-log` v2 | S-15 | [S-15 缺席时的默认答案](../../../../spec/capabilities/session-log/v2/contract.md#s-15-缺席时的默认答案) |
| `capability.session-log` v2 | S-16 | [S-16 九件事与失败值总表](../../../../spec/capabilities/session-log/v2/contract.md#s-16-九件事与失败值总表) |
| `capability.session-log` v2 | S-17 | [S-17 append：追加一批条目](../../../../spec/capabilities/session-log/v2/contract.md#s-17-append追加一批条目) |
| `capability.session-log` v2 | S-18 | [S-18 readByKey：按读取键读](../../../../spec/capabilities/session-log/v2/contract.md#s-18-readbykey按读取键读) |
| `capability.session-log` v2 | S-19 | [S-19 readSince：从某个位置往后读](../../../../spec/capabilities/session-log/v2/contract.md#s-19-readsince从某个位置往后读) |
| `capability.session-log` v2 | S-20 | [S-20 本版不发事件](../../../../spec/capabilities/session-log/v2/contract.md#s-20-本版不发事件) |
| `capability.session-log` v2 | S-21 | [S-21 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/session-log/v2/contract.md#s-21-装配给的保证-vs-协议须给的保证) |
| `capability.session-log` v2 | S-22 | [S-22 回执丢失与结果未知](../../../../spec/capabilities/session-log/v2/contract.md#s-22-回执丢失与结果未知) |
| `capability.session-log` v2 | S-23 | [S-23 提供者撤除、换代与重启](../../../../spec/capabilities/session-log/v2/contract.md#s-23-提供者撤除换代与重启) |
| `capability.session-log` v2 | S-24 | [S-24 会话归档之后](../../../../spec/capabilities/session-log/v2/contract.md#s-24-会话归档之后) |
| `capability.session-log` v2 | S-25 | [S-25 本版选用哪些形式工件](../../../../spec/capabilities/session-log/v2/contract.md#s-25-本版选用哪些形式工件) |
| `capability.session-log` v2 | S-26 | [S-26 判重：停机重排不多一条](../../../../spec/capabilities/session-log/v2/contract.md#s-26-判重停机重排不多一条) |
| `capability.session-log` v2 | S-27 | [S-27 栅栏：旧协程写不进](../../../../spec/capabilities/session-log/v2/contract.md#s-27-栅栏旧协程写不进) |
| `capability.session-log` v2 | S-28 | [S-28 回复与响应体：撞键整批不写](../../../../spec/capabilities/session-log/v2/contract.md#s-28-回复与响应体撞键整批不写) |
| `capability.session-log` v2 | S-29 | [S-29 一本日志一个租户身份](../../../../spec/capabilities/session-log/v2/contract.md#s-29-一本日志一个租户身份) |
| `capability.session-log` v2 | S-30 | [S-30 位置与读](../../../../spec/capabilities/session-log/v2/contract.md#s-30-位置与读) |
| `capability.session-log` v2 | S-31 | [S-31 读不到不是没有](../../../../spec/capabilities/session-log/v2/contract.md#s-31-读不到不是没有) |
| `capability.session-tenancy` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-1-本契约拥有什么) |
| `capability.session-tenancy` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.session-tenancy` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.session-tenancy` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.session-tenancy` v2 | S-5 | [S-5 会话持有的租户身份](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-5-会话持有的租户身份) |
| `capability.session-tenancy` v2 | S-6 | [S-6 答案不变](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-6-答案不变) |
| `capability.session-tenancy` v2 | S-7 | [S-7 缺席时的默认答案与失败值](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-7-缺席时的默认答案与失败值) |
| `capability.session-tenancy` v2 | S-8 | [S-8 holdingTenant：读会话持有的租户身份](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-8-holdingtenant读会话持有的租户身份) |
| `capability.session-tenancy` v2 | S-9 | [S-9 本版不发事件](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-9-本版不发事件) |
| `capability.session-tenancy` v2 | S-10 | [S-10 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-10-装配给的保证-vs-协议须给的保证) |
| `capability.session-tenancy` v2 | S-11 | [S-11 提供者撤除、换代与重启](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-11-提供者撤除换代与重启) |
| `capability.session-tenancy` v2 | S-12 | [S-12 本版选用哪些形式工件](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-12-本版选用哪些形式工件) |
| `capability.session-tenancy` v2 | S-13 | [S-13 答出的就是记下的那一个，而且不变](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-13-答出的就是记下的那一个而且不变) |
| `capability.session-tenancy` v2 | S-14 | [S-14 没有记录不是没有租户](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-14-没有记录不是没有租户) |
| `capability.session-tenancy` v2 | S-15 | [S-15 读不到就是读不到](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-15-读不到就是读不到) |
| `capability.stream-assembly` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-1-本契约拥有什么) |
| `capability.stream-assembly` v2 | S-2 | [S-2 消费者](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-2-消费者) |
| `capability.stream-assembly` v2 | S-3 | [S-3 本契约不拥有什么](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-3-本契约不拥有什么) |
| `capability.stream-assembly` v2 | S-4 | [S-4 装配状态是调用方持有的一个值](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-4-装配状态是调用方持有的一个值) |
| `capability.stream-assembly` v2 | S-5 | [S-5 位置](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-5-位置) |
| `capability.stream-assembly` v2 | S-6 | [S-6 一块在状态里是什么](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-6-一块在状态里是什么) |
| `capability.stream-assembly` v2 | S-7 | [S-7 快照交出什么](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-7-快照交出什么) |
| `capability.stream-assembly` v2 | S-8 | [S-8 收尾结算交出什么](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-8-收尾结算交出什么) |
| `capability.stream-assembly` v2 | S-9 | [S-9 一块怎样落](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-9-一块怎样落) |
| `capability.stream-assembly` v2 | S-10 | [S-10 工具调用在封口那一下解析，且只解析这一次](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-10-工具调用在封口那一下解析且只解析这一次) |
| `capability.stream-assembly` v2 | S-11 | [S-11 参数收齐却解析不了：只标记](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-11-参数收齐却解析不了只标记) |
| `capability.stream-assembly` v2 | S-12 | [S-12 被砍过内容的调用落成半截](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-12-被砍过内容的调用落成半截) |
| `capability.stream-assembly` v2 | S-13 | [S-13 账](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-13-账) |
| `capability.stream-assembly` v2 | S-14 | [S-14 砍的汇总](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-14-砍的汇总) |
| `capability.stream-assembly` v2 | S-15 | [S-15 节流在到达装配之前，投递一侧的节流不进账](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-15-节流在到达装配之前投递一侧的节流不进账) |
| `capability.stream-assembly` v2 | S-16 | [S-16 首个内容的位置](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-16-首个内容的位置) |
| `capability.stream-assembly` v2 | S-17 | [S-17 每个操作写全九件事](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-17-每个操作写全九件事) |
| `capability.stream-assembly` v2 | S-18 | [S-18 `start`：开一份状态](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-18-start开一份状态) |
| `capability.stream-assembly` v2 | S-19 | [S-19 `accept`：接一个事件](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-19-accept接一个事件) |
| `capability.stream-assembly` v2 | S-20 | [S-20 `snapshot`：读快照](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-20-snapshot读快照) |
| `capability.stream-assembly` v2 | S-21 | [S-21 `closeOut`：收尾结算](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-21-closeout收尾结算) |
| `capability.stream-assembly` v2 | S-22 | [S-22 `abandon`：放弃](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-22-abandon放弃) |
| `capability.stream-assembly` v2 | S-23 | [S-23 本能力自己的失败值](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-23-本能力自己的失败值) |
| `capability.stream-assembly` v2 | S-24 | [S-24 表示层拒绝值原名引用](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-24-表示层拒绝值原名引用) |
| `capability.stream-assembly` v2 | S-25 | [S-25 判定次序](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-25-判定次序) |
| `capability.stream-assembly` v2 | S-26 | [S-26 被拒不改状态，后果归宿主](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-26-被拒不改状态后果归宿主) |
| `capability.stream-assembly` v2 | S-27 | [S-27 一次到达装配等于一次性到达](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-27-一次到达装配等于一次性到达) |
| `capability.stream-assembly` v2 | S-28 | [S-28 宿主要兑现的前提](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-28-宿主要兑现的前提) |
| `capability.stream-assembly` v2 | S-29 | [S-29 部署装配给与协议给](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-29-部署装配给与协议给) |
| `capability.stream-assembly` v2 | S-30 | [S-30 本版选用的形式工件](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-30-本版选用的形式工件) |
| `capability.stream-assembly` v2 | S-31 | [S-31 并开两块、一次砍、一次整体替换](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-31-并开两块一次砍一次整体替换) |
| `capability.stream-assembly` v2 | S-32 | [S-32 参数收齐却解析不了](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-32-参数收齐却解析不了) |
| `capability.stream-assembly` v2 | S-33 | [S-33 被砍过内容的调用落成半截](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-33-被砍过内容的调用落成半截) |
| `capability.stream-assembly` v2 | S-34 | [S-34 收尾之后的事件被拒，状态不变](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-34-收尾之后的事件被拒状态不变) |
| `capability.stream-assembly` v2 | S-35 | [S-35 没收尾不能结算；放弃交出 `lost`](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-35-没收尾不能结算放弃交出-lost) |
| `capability.stream-assembly` v2 | S-36 | [S-36 快照含开着的追加块的片段，快照是值](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-36-快照含开着的追加块的片段快照是值) |
| `capability.stream-assembly` v2 | S-37 | [S-37 一帧没发](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-37-一帧没发) |
| `capability.stream-assembly` v2 | S-38 | [S-38 失败值逐个](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-38-失败值逐个) |
| `capability.stream-assembly` v2 | S-39 | [S-39 先截短、后拒收只计一次](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-39-先截短后拒收只计一次) |
| `capability.tool-admission` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/capabilities/tool-admission/v2/contract.md#s-1-本契约拥有什么) |
| `capability.tool-admission` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/capabilities/tool-admission/v2/contract.md#s-2-本契约不拥有什么) |
| `capability.tool-admission` v2 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/capabilities/tool-admission/v2/contract.md#s-3-本契约明确不承诺什么) |
| `capability.tool-admission` v2 | S-4 | [S-4 依赖方向与被消费的面](../../../../spec/capabilities/tool-admission/v2/contract.md#s-4-依赖方向与被消费的面) |
| `capability.tool-admission` v2 | S-5 | [S-5 消费者](../../../../spec/capabilities/tool-admission/v2/contract.md#s-5-消费者) |
| `capability.tool-admission` v2 | S-6 | [S-6 放行判断是一个函数：无状态、无提交](../../../../spec/capabilities/tool-admission/v2/contract.md#s-6-放行判断是一个函数无状态无提交) |
| `capability.tool-admission` v2 | S-7 | [S-7 AdmissionInput](../../../../spec/capabilities/tool-admission/v2/contract.md#s-7-admissioninput) |
| `capability.tool-admission` v2 | S-8 | [S-8 有效执行权限](../../../../spec/capabilities/tool-admission/v2/contract.md#s-8-有效执行权限) |
| `capability.tool-admission` v2 | S-9 | [S-9 授权上下文与求值](../../../../spec/capabilities/tool-admission/v2/contract.md#s-9-授权上下文与求值) |
| `capability.tool-admission` v2 | S-10 | [S-10 会话运行模式](../../../../spec/capabilities/tool-admission/v2/contract.md#s-10-会话运行模式) |
| `capability.tool-admission` v2 | S-11 | [S-11 父会话摘要与「宽」的次序](../../../../spec/capabilities/tool-admission/v2/contract.md#s-11-父会话摘要与宽的次序) |
| `capability.tool-admission` v2 | S-12 | [S-12 答复](../../../../spec/capabilities/tool-admission/v2/contract.md#s-12-答复) |
| `capability.tool-admission` v2 | S-13 | [S-13 AdmissionResult](../../../../spec/capabilities/tool-admission/v2/contract.md#s-13-admissionresult) |
| `capability.tool-admission` v2 | S-14 | [S-14 拒绝原因](../../../../spec/capabilities/tool-admission/v2/contract.md#s-14-拒绝原因) |
| `capability.tool-admission` v2 | S-15 | [S-15 定死的四档选项与卡片草稿](../../../../spec/capabilities/tool-admission/v2/contract.md#s-15-定死的四档选项与卡片草稿) |
| `capability.tool-admission` v2 | S-16 | [S-16 AdmissionToken 与参数相等](../../../../spec/capabilities/tool-admission/v2/contract.md#s-16-admissiontoken-与参数相等) |
| `capability.tool-admission` v2 | S-17 | [S-17 缺席时的默认答案](../../../../spec/capabilities/tool-admission/v2/contract.md#s-17-缺席时的默认答案) |
| `capability.tool-admission` v2 | S-18 | [S-18 判不出来不是拒绝，也不是算不出](../../../../spec/capabilities/tool-admission/v2/contract.md#s-18-判不出来不是拒绝也不是算不出) |
| `capability.tool-admission` v2 | S-19 | [S-19 每道准入现读，结论不存](../../../../spec/capabilities/tool-admission/v2/contract.md#s-19-每道准入现读结论不存) |
| `capability.tool-admission` v2 | S-20 | [S-20 每个操作写全九件事](../../../../spec/capabilities/tool-admission/v2/contract.md#s-20-每个操作写全九件事) |
| `capability.tool-admission` v2 | S-21 | [S-21 admit](../../../../spec/capabilities/tool-admission/v2/contract.md#s-21-admit) |
| `capability.tool-admission` v2 | S-22 | [S-22 判定次序](../../../../spec/capabilities/tool-admission/v2/contract.md#s-22-判定次序) |
| `capability.tool-admission` v2 | S-23 | [S-23 一批的含义](../../../../spec/capabilities/tool-admission/v2/contract.md#s-23-一批的含义) |
| `capability.tool-admission` v2 | S-24 | [S-24 失败值与它们的次序](../../../../spec/capabilities/tool-admission/v2/contract.md#s-24-失败值与它们的次序) |
| `capability.tool-admission` v2 | S-25 | [S-25 verifyToken](../../../../spec/capabilities/tool-admission/v2/contract.md#s-25-verifytoken) |
| `capability.tool-admission` v2 | S-26 | [S-26 令牌有效的条件](../../../../spec/capabilities/tool-admission/v2/contract.md#s-26-令牌有效的条件) |
| `capability.tool-admission` v2 | S-27 | [S-27 四档答复各落在哪](../../../../spec/capabilities/tool-admission/v2/contract.md#s-27-四档答复各落在哪) |
| `capability.tool-admission` v2 | S-28 | [S-28 四档选项只在本能力出的卡上带授权含义](../../../../spec/capabilities/tool-admission/v2/contract.md#s-28-四档选项只在本能力出的卡上带授权含义) |
| `capability.tool-admission` v2 | S-29 | [S-29 位置、干预力与结论投影](../../../../spec/capabilities/tool-admission/v2/contract.md#s-29-位置干预力与结论投影) |
| `capability.tool-admission` v2 | S-30 | [S-30 放行之后参数不再变](../../../../spec/capabilities/tool-admission/v2/contract.md#s-30-放行之后参数不再变) |
| `capability.tool-admission` v2 | S-31 | [S-31 一批里还有一条在等，谁都不执行](../../../../spec/capabilities/tool-admission/v2/contract.md#s-31-一批里还有一条在等谁都不执行) |
| `capability.tool-admission` v2 | S-32 | [S-32 这一件不得被替换、禁用或收窄](../../../../spec/capabilities/tool-admission/v2/contract.md#s-32-这一件不得被替换禁用或收窄) |
| `capability.tool-admission` v2 | S-33 | [S-33 装配给的保证 vs 协议须给的保证](../../../../spec/capabilities/tool-admission/v2/contract.md#s-33-装配给的保证-vs-协议须给的保证) |
| `capability.tool-admission` v2 | S-34 | [S-34 本能力缺席、报错或判不出来](../../../../spec/capabilities/tool-admission/v2/contract.md#s-34-本能力缺席报错或判不出来) |
| `capability.tool-admission` v2 | S-35 | [S-35 重启、回放与在途](../../../../spec/capabilities/tool-admission/v2/contract.md#s-35-重启回放与在途) |
| `capability.tool-admission` v2 | S-36 | [S-36 撤销、取消与归档](../../../../spec/capabilities/tool-admission/v2/contract.md#s-36-撤销取消与归档) |
| `capability.tool-admission` v2 | S-37 | [S-37 本版不建形式工件](../../../../spec/capabilities/tool-admission/v2/contract.md#s-37-本版不建形式工件) |
| `capability.tool-admission` v2 | S-38 | [S-38 三档各一](../../../../spec/capabilities/tool-admission/v2/contract.md#s-38-三档各一) |
| `capability.tool-admission` v2 | S-39 | [S-39 算不出 × 三种运行模式](../../../../spec/capabilities/tool-admission/v2/contract.md#s-39-算不出--三种运行模式) |
| `capability.tool-admission` v2 | S-40 | [S-40 子宽于父整批失败](../../../../spec/capabilities/tool-admission/v2/contract.md#s-40-子宽于父整批失败) |
| `capability.tool-admission` v2 | S-41 | [S-41 一批里一条 ask，整批不执行](../../../../spec/capabilities/tool-admission/v2/contract.md#s-41-一批里一条-ask整批不执行) |
| `capability.tool-admission` v2 | S-42 | [S-42 答复收成结论，禁止翻案](../../../../spec/capabilities/tool-admission/v2/contract.md#s-42-答复收成结论禁止翻案) |
| `capability.tool-admission` v2 | S-43 | [S-43 放行之后参数变了，令牌作废](../../../../spec/capabilities/tool-admission/v2/contract.md#s-43-放行之后参数变了令牌作废) |
| `capability.tool-admission` v2 | S-44 | [S-44 判不出来不放行](../../../../spec/capabilities/tool-admission/v2/contract.md#s-44-判不出来不放行) |
| `capability.tool-admission` v2 | S-45 | [S-45 工作区来的工具不提权](../../../../spec/capabilities/tool-admission/v2/contract.md#s-45-工作区来的工具不提权) |
| `capability.tool-admission` v2 | S-46 | [S-46 第四档写不进去就不出现](../../../../spec/capabilities/tool-admission/v2/contract.md#s-46-第四档写不进去就不出现) |
| `capability.tool-admission` v2 | S-47 | [S-47 模型面名字逐码点比，解析不了的调用不进来](../../../../spec/capabilities/tool-admission/v2/contract.md#s-47-模型面名字逐码点比解析不了的调用不进来) |
| `capability.tool-admission` v2 | S-48 | [S-48 本能力不可用时由全拒件顶上](../../../../spec/capabilities/tool-admission/v2/contract.md#s-48-本能力不可用时由全拒件顶上) |
| `composition.account-registration` v1 | S-1 | [S-1 本契约拥有什么](../../../../spec/compositions/account-registration/v1/contract.md#s-1-本契约拥有什么) |
| `composition.account-registration` v1 | S-2 | [S-2 参与方与精确承诺](../../../../spec/compositions/account-registration/v1/contract.md#s-2-参与方与精确承诺) |
| `composition.account-registration` v1 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/compositions/account-registration/v1/contract.md#s-3-本契约明确不承诺什么) |
| `composition.account-registration` v1 | S-4 | [S-4 注册成功](../../../../spec/compositions/account-registration/v1/contract.md#s-4-注册成功) |
| `composition.account-registration` v1 | S-5 | [S-5 终结结果集合](../../../../spec/compositions/account-registration/v1/contract.md#s-5-终结结果集合) |
| `composition.account-registration` v1 | S-6 | [S-6 每个终结结果的含义与对应的存储状态](../../../../spec/compositions/account-registration/v1/contract.md#s-6-每个终结结果的含义与对应的存储状态) |
| `composition.account-registration` v1 | S-7 | [S-7 回执不可撤销](../../../../spec/compositions/account-registration/v1/contract.md#s-7-回执不可撤销) |
| `composition.account-registration` v1 | S-8 | [S-8 三步、次序与责任交接](../../../../spec/compositions/account-registration/v1/contract.md#s-8-三步次序与责任交接) |
| `composition.account-registration` v1 | S-34 | [S-34 第二条动作链：未激活到期清除](../../../../spec/compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除) |
| `composition.account-registration` v1 | S-9 | [S-9 幂等边界](../../../../spec/compositions/account-registration/v1/contract.md#s-9-幂等边界) |
| `composition.account-registration` v1 | S-10 | [S-10 激活是唯一提交点](../../../../spec/compositions/account-registration/v1/contract.md#s-10-激活是唯一提交点) |
| `composition.account-registration` v1 | S-11 | [S-11 失败停在哪](../../../../spec/compositions/account-registration/v1/contract.md#s-11-失败停在哪) |
| `composition.account-registration` v1 | S-12 | [S-12 重试规则](../../../../spec/compositions/account-registration/v1/contract.md#s-12-重试规则) |
| `composition.account-registration` v1 | S-13 | [S-13 一个可用账号有且仅有一个个人组织](../../../../spec/compositions/account-registration/v1/contract.md#s-13-一个可用账号有且仅有一个个人组织) |
| `composition.account-registration` v1 | S-35 | [S-35 个人组织不会变成孤儿](../../../../spec/compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿) |
| `composition.account-registration` v1 | S-14 | [S-14 一个登录标识上至多一个账号](../../../../spec/compositions/account-registration/v1/contract.md#s-14-一个登录标识上至多一个账号) |
| `composition.account-registration` v1 | S-15 | [S-15 激活不回退](../../../../spec/compositions/account-registration/v1/contract.md#s-15-激活不回退) |
| `composition.account-registration` v1 | S-16 | [S-16 中断绝不被呈现为成功](../../../../spec/compositions/account-registration/v1/contract.md#s-16-中断绝不被呈现为成功) |
| `composition.account-registration` v1 | S-17 | [S-17 已发出的成功回执不被撤回](../../../../spec/compositions/account-registration/v1/contract.md#s-17-已发出的成功回执不被撤回) |
| `composition.account-registration` v1 | S-18 | [S-18 回执侧不承诺唯一](../../../../spec/compositions/account-registration/v1/contract.md#s-18-回执侧不承诺唯一) |
| `composition.account-registration` v1 | S-19 | [S-19 有前提的进展](../../../../spec/compositions/account-registration/v1/contract.md#s-19-有前提的进展) |
| `composition.account-registration` v1 | S-20 | [S-20 收敛](../../../../spec/compositions/account-registration/v1/contract.md#s-20-收敛) |
| `composition.account-registration` v1 | S-21 | [S-21 两个同标识的注册并发发生](../../../../spec/compositions/account-registration/v1/contract.md#s-21-两个同标识的注册并发发生) |
| `composition.account-registration` v1 | S-22 | [S-22 编排本链的提供者被卸载或换代](../../../../spec/compositions/account-registration/v1/contract.md#s-22-编排本链的提供者被卸载或换代) |
| `composition.account-registration` v1 | S-23 | [S-23 参与方缺席时哪项保证暂停、哪项继续](../../../../spec/compositions/account-registration/v1/contract.md#s-23-参与方缺席时哪项保证暂停哪项继续) |
| `composition.account-registration` v1 | S-24 | [S-24 内核不提供、由本契约兑现的表](../../../../spec/compositions/account-registration/v1/contract.md#s-24-内核不提供由本契约兑现的表) |
| `composition.account-registration` v1 | S-25 | [S-25 装配给的保证 vs 协议须给的保证](../../../../spec/compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) |
| `composition.account-registration` v1 | S-26 | [S-26 本版选用的形式工件](../../../../spec/compositions/account-registration/v1/contract.md#s-26-本版选用的形式工件) |
| `composition.account-registration` v1 | S-27 | [S-27 规范场景：中途失败后用同一标识重来](../../../../spec/compositions/account-registration/v1/contract.md#s-27-规范场景中途失败后用同一标识重来) |
| `composition.account-registration` v1 | S-28 | [S-28 规范场景：在任意位置中断没有第三种形态](../../../../spec/compositions/account-registration/v1/contract.md#s-28-规范场景在任意位置中断没有第三种形态) |
| `composition.account-registration` v1 | S-29 | [S-29 规范场景：参与方缺席时不放行](../../../../spec/compositions/account-registration/v1/contract.md#s-29-规范场景参与方缺席时不放行) |
| `composition.account-registration` v1 | S-30 | [S-30 规范场景：编排者被卸载在途尝试等同崩溃](../../../../spec/compositions/account-registration/v1/contract.md#s-30-规范场景编排者被卸载在途尝试等同崩溃) |
| `composition.account-registration` v1 | S-31 | [S-31 规范场景：两个同标识并发注册](../../../../spec/compositions/account-registration/v1/contract.md#s-31-规范场景两个同标识并发注册) |
| `composition.account-registration` v1 | S-32 | [S-32 本版是首版](../../../../spec/compositions/account-registration/v1/contract.md#s-32-本版是首版) |
| `composition.account-registration` v1 | S-33 | [S-33 本版的规范工件](../../../../spec/compositions/account-registration/v1/contract.md#s-33-本版的规范工件) |
| `composition.governance-center-entry` v1 | S-1 | [S-1 本契约拥有什么](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-1-本契约拥有什么) |
| `composition.governance-center-entry` v1 | S-2 | [S-2 参与方与精确承诺](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-2-参与方与精确承诺) |
| `composition.governance-center-entry` v1 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-3-本契约明确不承诺什么) |
| `composition.governance-center-entry` v1 | S-4 | [S-4 请求信封](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-4-请求信封) |
| `composition.governance-center-entry` v1 | S-5 | [S-5 出示物](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-5-出示物) |
| `composition.governance-center-entry` v1 | S-6 | [S-6 四种入口答复](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-6-四种入口答复) |
| `composition.governance-center-entry` v1 | S-7 | [S-7 答复集合闭合](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-7-答复集合闭合) |
| `composition.governance-center-entry` v1 | S-8 | [S-8 协议版本与跨版本不变的两样](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-8-协议版本与跨版本不变的两样) |
| `composition.governance-center-entry` v1 | S-9 | [S-9 列表句柄](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-9-列表句柄) |
| `composition.governance-center-entry` v1 | S-10 | [S-10 判定次序](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-10-判定次序) |
| `composition.governance-center-entry` v1 | S-11 | [S-11 认人](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-11-认人) |
| `composition.governance-center-entry` v1 | S-12 | [S-12 身份推导](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-12-身份推导) |
| `composition.governance-center-entry` v1 | S-13 | [S-13 补授权](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-13-补授权) |
| `composition.governance-center-entry` v1 | S-14 | [S-14 失败映射](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-14-失败映射) |
| `composition.governance-center-entry` v1 | S-15 | [S-15 δ = 0：每个请求现读，入口不跨请求缓存](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-15-δ--0每个请求现读入口不跨请求缓存) |
| `composition.governance-center-entry` v1 | S-16 | [S-16 不记住来访，不区别对待来者](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-16-不记住来访不区别对待来者) |
| `composition.governance-center-entry` v1 | S-17 | [S-17 路由表封闭；每条路由的九件事从哪读](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读) |
| `composition.governance-center-entry` v1 | S-18 | [S-18 公开体检](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-18-公开体检) |
| `composition.governance-center-entry` v1 | S-19 | [S-19 免认人的两条路由：注册、登录](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-19-免认人的两条路由注册登录) |
| `composition.governance-center-entry` v1 | S-20 | [S-20 登录状态的两条路由：撤销、列出](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-20-登录状态的两条路由撤销列出) |
| `composition.governance-center-entry` v1 | S-21 | [S-21 组织治理：写路由](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-21-组织治理写路由) |
| `composition.governance-center-entry` v1 | S-22 | [S-22 组织治理：读路由与补授权](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-22-组织治理读路由与补授权) |
| `composition.governance-center-entry` v1 | S-23 | [S-23 当前租户身份的两条路由](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-23-当前租户身份的两条路由) |
| `composition.governance-center-entry` v1 | S-24 | [S-24 有意不投影](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-24-有意不投影) |
| `composition.governance-center-entry` v1 | S-25 | [S-25 运维面只在中心所在的机器上，且没有治理路由](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由) |
| `composition.governance-center-entry` v1 | S-26 | [S-26 完整体检](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-26-完整体检) |
| `composition.governance-center-entry` v1 | S-27 | [S-27 GovernanceCenterId 的形状与相等](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-27-governancecenterid-的形状与相等) |
| `composition.governance-center-entry` v1 | S-28 | [S-28 铸造、存放与不变](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变) |
| `composition.governance-center-entry` v1 | S-29 | [S-29 秘密不进任何输出](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-29-秘密不进任何输出) |
| `composition.governance-center-entry` v1 | S-30 | [S-30 工程记录](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-30-工程记录) |
| `composition.governance-center-entry` v1 | S-31 | [S-31 不变量与安全性质](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-31-不变量与安全性质) |
| `composition.governance-center-entry` v1 | S-32 | [S-32 进展性质与前提](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-32-进展性质与前提) |
| `composition.governance-center-entry` v1 | S-33 | [S-33 认出人之后登录状态被撤销](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-33-认出人之后登录状态被撤销) |
| `composition.governance-center-entry` v1 | S-34 | [S-34 起来即整体；停机时在途请求归谁](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁) |
| `composition.governance-center-entry` v1 | S-35 | [S-35 内核不提供、由本契约兑现的表](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-35-内核不提供由本契约兑现的表) |
| `composition.governance-center-entry` v1 | S-36 | [S-36 装配给的保证 vs 协议须给的保证](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) |
| `composition.governance-center-entry` v1 | S-37 | [S-37 本版选用的形式工件](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-37-本版选用的形式工件) |
| `composition.governance-center-entry` v1 | S-38 | [S-38 规范场景：答复的先后](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-38-规范场景答复的先后) |
| `composition.governance-center-entry` v1 | S-39 | [S-39 规范场景：拒绝逐字相同](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-39-规范场景拒绝逐字相同) |
| `composition.governance-center-entry` v1 | S-40 | [S-40 规范场景：三个出口不合并](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-40-规范场景三个出口不合并) |
| `composition.governance-center-entry` v1 | S-41 | [S-41 规范场景：列表不给能直接用的东西](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-41-规范场景列表不给能直接用的东西) |
| `composition.governance-center-entry` v1 | S-42 | [S-42 规范场景：只认登录状态，不认客户端](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-42-规范场景只认登录状态不认客户端) |
| `composition.governance-center-entry` v1 | S-43 | [S-43 规范场景：身份推导与补授权](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-43-规范场景身份推导与补授权) |
| `composition.governance-center-entry` v1 | S-44 | [S-44 规范场景：中心标识](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-44-规范场景中心标识) |
| `composition.governance-center-entry` v1 | S-45 | [S-45 规范场景：两张面没有第三张](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-45-规范场景两张面没有第三张) |
| `composition.governance-center-entry` v1 | S-46 | [S-46 规范场景：输出里搜不到秘密](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-46-规范场景输出里搜不到秘密) |
| `composition.governance-center-entry` v1 | S-47 | [S-47 本版是首版](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-47-本版是首版) |
| `composition.governance-center-entry` v1 | S-48 | [S-48 本版的规范工件](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-48-本版的规范工件) |
| `composition.governance-center-entry-https-json` v1 | S-1 | [S-1 本契约拥有什么](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-1-本契约拥有什么) |
| `composition.governance-center-entry-https-json` v1 | S-2 | [S-2 依赖与精确承诺](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-2-依赖与精确承诺) |
| `composition.governance-center-entry-https-json` v1 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-3-本契约明确不承诺什么) |
| `composition.governance-center-entry-https-json` v1 | S-4 | [S-4 客户端一面的连接：只有 TLS，服务端认证](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-4-客户端一面的连接只有-tls服务端认证) |
| `composition.governance-center-entry-https-json` v1 | S-5 | [S-5 一条连接恰承载一个请求—答复](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-5-一条连接恰承载一个请求答复) |
| `composition.governance-center-entry-https-json` v1 | S-6 | [S-6 只看请求体](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-6-只看请求体) |
| `composition.governance-center-entry-https-json` v1 | S-7 | [S-7 请求体怎样读成信封](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-7-请求体怎样读成信封) |
| `composition.governance-center-entry-https-json` v1 | S-8 | [S-8 重复成员](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-8-重复成员) |
| `composition.governance-center-entry-https-json` v1 | S-9 | [S-9 公开体检的请求在本传输上的形状](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-9-公开体检的请求在本传输上的形状) |
| `composition.governance-center-entry-https-json` v1 | S-10 | [S-10 只答完整收到、能成帧的请求报文](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-10-只答完整收到能成帧的请求报文) |
| `composition.governance-center-entry-https-json` v1 | S-11 | [S-11 答复的外形](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-11-答复的外形) |
| `composition.governance-center-entry-https-json` v1 | S-12 | [S-12 体的写出规则](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-12-体的写出规则) |
| `composition.governance-center-entry-https-json` v1 | S-13 | [S-13 四种入口答复的固定字节](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-13-四种入口答复的固定字节) |
| `composition.governance-center-entry-https-json` v1 | S-14 | [S-14 路由结果答复](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-14-路由结果答复) |
| `composition.governance-center-entry-https-json` v1 | S-15 | [S-15 公开体检答复](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-15-公开体检答复) |
| `composition.governance-center-entry-https-json` v1 | S-16 | [S-16 问不到：不写任何答复字节](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-16-问不到不写任何答复字节) |
| `composition.governance-center-entry-https-json` v1 | S-17 | [S-17 客户端怎样读答复](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-17-客户端怎样读答复) |
| `composition.governance-center-entry-https-json` v1 | S-33 | [S-33 与 HTTP 规范的有意偏离](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-33-与-http-规范的有意偏离) |
| `composition.governance-center-entry-https-json` v1 | S-18 | [S-18 跨协议版本不改的两样，在本传输上](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-18-跨协议版本不改的两样在本传输上) |
| `composition.governance-center-entry-https-json` v1 | S-19 | [S-19 随协议版本演化的部分；换传输](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-19-随协议版本演化的部分换传输) |
| `composition.governance-center-entry-https-json` v1 | S-20 | [S-20 运维面的承载](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-20-运维面的承载) |
| `composition.governance-center-entry-https-json` v1 | S-21 | [S-21 运维面的答复](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-21-运维面的答复) |
| `composition.governance-center-entry-https-json` v1 | S-22 | [S-22 经传输的秘密](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-22-经传输的秘密) |
| `composition.governance-center-entry-https-json` v1 | S-23 | [S-23 两张面上一次来往的九件事](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-23-两张面上一次来往的九件事) |
| `composition.governance-center-entry-https-json` v1 | S-24 | [S-24 装配给 vs 协议给](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-24-装配给-vs-协议给) |
| `composition.governance-center-entry-https-json` v1 | S-25 | [S-25 形式工件：不触发](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-25-形式工件不触发) |
| `composition.governance-center-entry-https-json` v1 | S-26 | [S-26 规范场景：固定字节，只看请求体](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-26-规范场景固定字节只看请求体) |
| `composition.governance-center-entry-https-json` v1 | S-27 | [S-27 规范场景：跨协议版本](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-27-规范场景跨协议版本) |
| `composition.governance-center-entry-https-json` v1 | S-28 | [S-28 规范场景：请求体的读法与重复成员](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-28-规范场景请求体的读法与重复成员) |
| `composition.governance-center-entry-https-json` v1 | S-29 | [S-29 规范场景：问不到与运维面](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-29-规范场景问不到与运维面) |
| `composition.governance-center-entry-https-json` v1 | S-30 | [S-30 规范场景：只有 TLS，服务端认证](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-30-规范场景只有-tls服务端认证) |
| `composition.governance-center-entry-https-json` v1 | S-31 | [S-31 本版是首版](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-31-本版是首版) |
| `composition.governance-center-entry-https-json` v1 | S-32 | [S-32 本版的规范工件](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-32-本版的规范工件) |
| `data.arrival-events` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/data/arrival-events/v2/contract.md#s-1-本契约拥有什么) |
| `data.arrival-events` v2 | S-2 | [S-2 消费者](../../../../spec/data/arrival-events/v2/contract.md#s-2-消费者) |
| `data.arrival-events` v2 | S-3 | [S-3 本契约不拥有什么](../../../../spec/data/arrival-events/v2/contract.md#s-3-本契约不拥有什么) |
| `data.arrival-events` v2 | S-4 | [S-4 到达事件不是记录条目](../../../../spec/data/arrival-events/v2/contract.md#s-4-到达事件不是记录条目) |
| `data.arrival-events` v2 | S-5 | [S-5 信封与目标](../../../../spec/data/arrival-events/v2/contract.md#s-5-信封与目标) |
| `data.arrival-events` v2 | S-6 | [S-6 六种事件](../../../../spec/data/arrival-events/v2/contract.md#s-6-六种事件) |
| `data.arrival-events` v2 | S-7 | [S-7 块索引](../../../../spec/data/arrival-events/v2/contract.md#s-7-块索引) |
| `data.arrival-events` v2 | S-8 | [S-8 开块](../../../../spec/data/arrival-events/v2/contract.md#s-8-开块) |
| `data.arrival-events` v2 | S-9 | [S-9 块头](../../../../spec/data/arrival-events/v2/contract.md#s-9-块头) |
| `data.arrival-events` v2 | S-10 | [S-10 呈现提示](../../../../spec/data/arrival-events/v2/contract.md#s-10-呈现提示) |
| `data.arrival-events` v2 | S-11 | [S-11 填：追加片段](../../../../spec/data/arrival-events/v2/contract.md#s-11-填追加片段) |
| `data.arrival-events` v2 | S-12 | [S-12 填：整体替换](../../../../spec/data/arrival-events/v2/contract.md#s-12-填整体替换) |
| `data.arrival-events` v2 | S-13 | [S-13 封口](../../../../spec/data/arrival-events/v2/contract.md#s-13-封口) |
| `data.arrival-events` v2 | S-14 | [S-14 砍](../../../../spec/data/arrival-events/v2/contract.md#s-14-砍) |
| `data.arrival-events` v2 | S-15 | [S-15 记账](../../../../spec/data/arrival-events/v2/contract.md#s-15-记账) |
| `data.arrival-events` v2 | S-16 | [S-16 收尾](../../../../spec/data/arrival-events/v2/contract.md#s-16-收尾) |
| `data.arrival-events` v2 | S-17 | [S-17 一条流的形状](../../../../spec/data/arrival-events/v2/contract.md#s-17-一条流的形状) |
| `data.arrival-events` v2 | S-18 | [S-18 块的一生](../../../../spec/data/arrival-events/v2/contract.md#s-18-块的一生) |
| `data.arrival-events` v2 | S-19 | [S-19 归约：一块此刻是什么](../../../../spec/data/arrival-events/v2/contract.md#s-19-归约一块此刻是什么) |
| `data.arrival-events` v2 | S-20 | [S-20 封口块等于归约](../../../../spec/data/arrival-events/v2/contract.md#s-20-封口块等于归约) |
| `data.arrival-events` v2 | S-21 | [S-21 第一个内容步骤](../../../../spec/data/arrival-events/v2/contract.md#s-21-第一个内容步骤) |
| `data.arrival-events` v2 | S-22 | [S-22 节流只动填，合并不改结果，砍了要说](../../../../spec/data/arrival-events/v2/contract.md#s-22-节流只动填合并不改结果砍了要说) |
| `data.arrival-events` v2 | S-23 | [S-23 执行帧的另外四条](../../../../spec/data/arrival-events/v2/contract.md#s-23-执行帧的另外四条) |
| `data.arrival-events` v2 | S-24 | [S-24 违反语法由消费一方判定并命名](../../../../spec/data/arrival-events/v2/contract.md#s-24-违反语法由消费一方判定并命名) |
| `data.arrival-events` v2 | S-25 | [S-25 装配给与协议给](../../../../spec/data/arrival-events/v2/contract.md#s-25-装配给与协议给) |
| `data.arrival-events` v2 | S-26 | [S-26 规范表示](../../../../spec/data/arrival-events/v2/contract.md#s-26-规范表示) |
| `data.arrival-events` v2 | S-27 | [S-27 判别式与枚举闭合](../../../../spec/data/arrival-events/v2/contract.md#s-27-判别式与枚举闭合) |
| `data.arrival-events` v2 | S-28 | [S-28 表示层拒绝值](../../../../spec/data/arrival-events/v2/contract.md#s-28-表示层拒绝值) |
| `data.arrival-events` v2 | S-29 | [S-29 表示层拒绝不是判定，也不修补](../../../../spec/data/arrival-events/v2/contract.md#s-29-表示层拒绝不是判定也不修补) |
| `data.arrival-events` v2 | S-30 | [S-30 帧只许引用](../../../../spec/data/arrival-events/v2/contract.md#s-30-帧只许引用) |
| `data.arrival-events` v2 | S-31 | [S-31 工具调用的封口不带块](../../../../spec/data/arrival-events/v2/contract.md#s-31-工具调用的封口不带块) |
| `data.arrival-events` v2 | S-32 | [S-32 以追加开图](../../../../spec/data/arrival-events/v2/contract.md#s-32-以追加开图) |
| `data.arrival-events` v2 | S-33 | [S-33 呈现提示本版一律拒](../../../../spec/data/arrival-events/v2/contract.md#s-33-呈现提示本版一律拒) |
| `data.arrival-events` v2 | S-34 | [S-34 工具侧没有账](../../../../spec/data/arrival-events/v2/contract.md#s-34-工具侧没有账) |
| `data.arrival-events` v2 | S-35 | [S-35 拒绝值逐个](../../../../spec/data/arrival-events/v2/contract.md#s-35-拒绝值逐个) |
| `data.asset-model` v2 | S-1 | [S-1 资产类别恰八类](../../../../spec/data/asset-model/v2/contract.md#s-1-资产类别恰八类) |
| `data.asset-model` v2 | S-2 | [S-2 能力标识名的词法](../../../../spec/data/asset-model/v2/contract.md#s-2-能力标识名的词法) |
| `data.asset-model` v2 | S-3 | [S-3 能力标识与它的规范串](../../../../spec/data/asset-model/v2/contract.md#s-3-能力标识与它的规范串) |
| `data.asset-model` v2 | S-4 | [S-4 资产记录号](../../../../spec/data/asset-model/v2/contract.md#s-4-资产记录号) |
| `data.asset-model` v2 | S-5 | [S-5 资产来源](../../../../spec/data/asset-model/v2/contract.md#s-5-资产来源) |
| `data.asset-model` v2 | S-6 | [S-6 所有者与作者分记](../../../../spec/data/asset-model/v2/contract.md#s-6-所有者与作者分记) |
| `data.asset-model` v2 | S-7 | [S-7 所有者至多变一次](../../../../spec/data/asset-model/v2/contract.md#s-7-所有者至多变一次) |
| `data.asset-model` v2 | S-8 | [S-8 资产记录](../../../../spec/data/asset-model/v2/contract.md#s-8-资产记录) |
| `data.asset-model` v2 | S-9 | [S-9 版本线](../../../../spec/data/asset-model/v2/contract.md#s-9-版本线) |
| `data.asset-model` v2 | S-10 | [S-10 八类正文的外壳](../../../../spec/data/asset-model/v2/contract.md#s-10-八类正文的外壳) |
| `data.asset-model` v2 | S-11 | [S-11 plugin 的成员](../../../../spec/data/asset-model/v2/contract.md#s-11-plugin-的成员) |
| `data.asset-model` v2 | S-12 | [S-12 属性声明由正文推出](../../../../spec/data/asset-model/v2/contract.md#s-12-属性声明由正文推出) |
| `data.asset-model` v2 | S-13 | [S-13 设置项类别](../../../../spec/data/asset-model/v2/contract.md#s-13-设置项类别) |
| `data.asset-model` v2 | S-14 | [S-14 属性配值](../../../../spec/data/asset-model/v2/contract.md#s-14-属性配值) |
| `data.asset-model` v2 | S-15 | [S-15 `disabled` 是保留项名](../../../../spec/data/asset-model/v2/contract.md#s-15-disabled-是保留项名) |
| `data.asset-model` v2 | S-36 | [S-36 `usableBy` 是保留项名](../../../../spec/data/asset-model/v2/contract.md#s-36-usableby-是保留项名) |
| `data.asset-model` v2 | S-16 | [S-16 持有范围](../../../../spec/data/asset-model/v2/contract.md#s-16-持有范围) |
| `data.asset-model` v2 | S-17 | [S-17 工作区键](../../../../spec/data/asset-model/v2/contract.md#s-17-工作区键) |
| `data.asset-model` v2 | S-18 | [S-18 资产持有](../../../../spec/data/asset-model/v2/contract.md#s-18-资产持有) |
| `data.asset-model` v2 | S-19 | [S-19 使用权来路](../../../../spec/data/asset-model/v2/contract.md#s-19-使用权来路) |
| `data.asset-model` v2 | S-20 | [S-20 出厂格与工作区格的持有](../../../../spec/data/asset-model/v2/contract.md#s-20-出厂格与工作区格的持有) |
| `data.asset-model` v2 | S-21 | [S-21 复制血缘](../../../../spec/data/asset-model/v2/contract.md#s-21-复制血缘) |
| `data.asset-model` v2 | S-22 | [S-22 血缘号与分享号](../../../../spec/data/asset-model/v2/contract.md#s-22-血缘号与分享号) |
| `data.asset-model` v2 | S-23 | [S-23 凭据引用](../../../../spec/data/asset-model/v2/contract.md#s-23-凭据引用) |
| `data.asset-model` v2 | S-24 | [S-24 工作区承载清单](../../../../spec/data/asset-model/v2/contract.md#s-24-工作区承载清单) |
| `data.asset-model` v2 | S-25 | [S-25 规范表示](../../../../spec/data/asset-model/v2/contract.md#s-25-规范表示) |
| `data.asset-model` v2 | S-26 | [S-26 判别式与枚举闭合](../../../../spec/data/asset-model/v2/contract.md#s-26-判别式与枚举闭合) |
| `data.asset-model` v2 | S-27 | [S-27 表示层拒绝值](../../../../spec/data/asset-model/v2/contract.md#s-27-表示层拒绝值) |
| `data.asset-model` v2 | S-28 | [S-28 表示层拒绝不是判定，也不修补](../../../../spec/data/asset-model/v2/contract.md#s-28-表示层拒绝不是判定也不修补) |
| `data.asset-model` v2 | S-29 | [S-29 名字里的斜杠](../../../../spec/data/asset-model/v2/contract.md#s-29-名字里的斜杠) |
| `data.asset-model` v2 | S-30 | [S-30 official 没有所有者与作者](../../../../spec/data/asset-model/v2/contract.md#s-30-official-没有所有者与作者) |
| `data.asset-model` v2 | S-31 | [S-31 版本编号断了即拒](../../../../spec/data/asset-model/v2/contract.md#s-31-版本编号断了即拒) |
| `data.asset-model` v2 | S-32 | [S-32 禁用只是一个布尔](../../../../spec/data/asset-model/v2/contract.md#s-32-禁用只是一个布尔) |
| `data.asset-model` v2 | S-33 | [S-33 一格一个能力标识一份持有](../../../../spec/data/asset-model/v2/contract.md#s-33-一格一个能力标识一份持有) |
| `data.asset-model` v2 | S-34 | [S-34 清单里的来路不出目录](../../../../spec/data/asset-model/v2/contract.md#s-34-清单里的来路不出目录) |
| `data.asset-model` v2 | S-35 | [S-35 重复复制只改最近一次那四项](../../../../spec/data/asset-model/v2/contract.md#s-35-重复复制只改最近一次那四项) |
| `data.call-accounts` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/data/call-accounts/v2/contract.md#s-1-本契约拥有什么) |
| `data.call-accounts` v2 | S-2 | [S-2 消费者](../../../../spec/data/call-accounts/v2/contract.md#s-2-消费者) |
| `data.call-accounts` v2 | S-3 | [S-3 本契约明确不拥有什么](../../../../spec/data/call-accounts/v2/contract.md#s-3-本契约明确不拥有什么) |
| `data.call-accounts` v2 | S-4 | [S-4 未知是一个值，不是零，也不是缺席](../../../../spec/data/call-accounts/v2/contract.md#s-4-未知是一个值不是零也不是缺席) |
| `data.call-accounts` v2 | S-5 | [S-5 金额：美元、十进制、不截断](../../../../spec/data/call-accounts/v2/contract.md#s-5-金额美元十进制不截断) |
| `data.call-accounts` v2 | S-6 | [S-6 `Usage`：四项 token 与来源](../../../../spec/data/call-accounts/v2/contract.md#s-6-usage四项-token-与来源) |
| `data.call-accounts` v2 | S-7 | [S-7 派生量：`cache_tokens` 与 `total_tokens`](../../../../spec/data/call-accounts/v2/contract.md#s-7-派生量cache_tokens-与-total_tokens) |
| `data.call-accounts` v2 | S-8 | [S-8 `Cost`：一次发出的费用](../../../../spec/data/call-accounts/v2/contract.md#s-8-cost一次发出的费用) |
| `data.call-accounts` v2 | S-9 | [S-9 `CostItem`：一次工具执行里的一笔](../../../../spec/data/call-accounts/v2/contract.md#s-9-costitem一次工具执行里的一笔) |
| `data.call-accounts` v2 | S-10 | [S-10 `model_call` 那一笔是镜像，权威在那份 `ModelResponse`](../../../../spec/data/call-accounts/v2/contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse) |
| `data.call-accounts` v2 | S-11 | [S-11 `ToolCallAccount`：一次工具执行的账](../../../../spec/data/call-accounts/v2/contract.md#s-11-toolcallaccount一次工具执行的账) |
| `data.call-accounts` v2 | S-12 | [S-12 总额：未知不当零加](../../../../spec/data/call-accounts/v2/contract.md#s-12-总额未知不当零加) |
| `data.call-accounts` v2 | S-13 | [S-13 经本系统调模型的用量汇总](../../../../spec/data/call-accounts/v2/contract.md#s-13-经本系统调模型的用量汇总) |
| `data.call-accounts` v2 | S-14 | [S-14 `wallClock`](../../../../spec/data/call-accounts/v2/contract.md#s-14-wallclock) |
| `data.call-accounts` v2 | S-15 | [S-15 `TrimReason` 与 `TrimSummary`：砍了要说](../../../../spec/data/call-accounts/v2/contract.md#s-15-trimreason-与-trimsummary砍了要说) |
| `data.call-accounts` v2 | S-16 | [S-16 `ResponseId`](../../../../spec/data/call-accounts/v2/contract.md#s-16-responseid) |
| `data.call-accounts` v2 | S-17 | [S-17 `CostCorrection`：事后补账](../../../../spec/data/call-accounts/v2/contract.md#s-17-costcorrection事后补账) |
| `data.call-accounts` v2 | S-18 | [S-18 原账不改](../../../../spec/data/call-accounts/v2/contract.md#s-18-原账不改) |
| `data.call-accounts` v2 | S-19 | [S-19 每条到达流恰一份账；两次发出两份](../../../../spec/data/call-accounts/v2/contract.md#s-19-每条到达流恰一份账两次发出两份) |
| `data.call-accounts` v2 | S-20 | [S-20 缺账或被拒收：记未知，不伪造](../../../../spec/data/call-accounts/v2/contract.md#s-20-缺账或被拒收记未知不伪造) |
| `data.call-accounts` v2 | S-21 | [S-21 账进日志，不进给模型看的上下文](../../../../spec/data/call-accounts/v2/contract.md#s-21-账进日志不进给模型看的上下文) |
| `data.call-accounts` v2 | S-22 | [S-22 有效费用](../../../../spec/data/call-accounts/v2/contract.md#s-22-有效费用) |
| `data.call-accounts` v2 | S-23 | [S-23 汇总：已知之和与未知笔数](../../../../spec/data/call-accounts/v2/contract.md#s-23-汇总已知之和与未知笔数) |
| `data.call-accounts` v2 | S-24 | [S-24 汇总不重复计](../../../../spec/data/call-accounts/v2/contract.md#s-24-汇总不重复计) |
| `data.call-accounts` v2 | S-25 | [S-25 按尝试记明细，按 Run 汇总](../../../../spec/data/call-accounts/v2/contract.md#s-25-按尝试记明细按-run-汇总) |
| `data.call-accounts` v2 | S-26 | [S-26 装配给的保证 vs 协议须给的保证](../../../../spec/data/call-accounts/v2/contract.md#s-26-装配给的保证-vs-协议须给的保证) |
| `data.call-accounts` v2 | S-27 | [S-27 表示层拒绝值（闭合）](../../../../spec/data/call-accounts/v2/contract.md#s-27-表示层拒绝值闭合) |
| `data.call-accounts` v2 | S-28 | [S-28 表示层校验与判定分开](../../../../spec/data/call-accounts/v2/contract.md#s-28-表示层校验与判定分开) |
| `data.call-accounts` v2 | S-29 | [S-29 判别式与枚举闭合](../../../../spec/data/call-accounts/v2/contract.md#s-29-判别式与枚举闭合) |
| `data.call-accounts` v2 | S-30 | [S-30 缺账记未知](../../../../spec/data/call-accounts/v2/contract.md#s-30-缺账记未知) |
| `data.call-accounts` v2 | S-31 | [S-31 首 token 之前重发，两笔都记](../../../../spec/data/call-accounts/v2/contract.md#s-31-首-token-之前重发两笔都记) |
| `data.call-accounts` v2 | S-32 | [S-32 补账改读数，不改原账](../../../../spec/data/call-accounts/v2/contract.md#s-32-补账改读数不改原账) |
| `data.call-accounts` v2 | S-33 | [S-33 工具执行三笔、一笔未知、一笔镜像](../../../../spec/data/call-accounts/v2/contract.md#s-33-工具执行三笔一笔未知一笔镜像) |
| `data.call-accounts` v2 | S-34 | [S-34 账不进给模型看的上下文](../../../../spec/data/call-accounts/v2/contract.md#s-34-账不进给模型看的上下文) |
| `data.call-accounts` v2 | S-35 | [S-35 砍了要说](../../../../spec/data/call-accounts/v2/contract.md#s-35-砍了要说) |
| `data.call-accounts` v2 | S-36 | [S-36 拒绝值逐个](../../../../spec/data/call-accounts/v2/contract.md#s-36-拒绝值逐个) |
| `data.call-accounts` v2 | S-37 | [S-37 三个归属标识的家：RunId、AttemptId、ModelCallId](../../../../spec/data/call-accounts/v2/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) |
| `data.call-accounts` v2 | S-38 | [S-38 两种归属：用量归凭据那一格，成本归发起者](../../../../spec/data/call-accounts/v2/contract.md#s-38-两种归属用量归凭据那一格成本归发起者) |
| `data.call-accounts` v2 | S-39 | [S-39 晚到的账](../../../../spec/data/call-accounts/v2/contract.md#s-39-晚到的账) |
| `data.connector` v2 | S-1 | [S-1 连接件正文](../../../../spec/data/connector/v2/contract.md#s-1-连接件正文) |
| `data.connector` v2 | S-2 | [S-2 鉴权绑定与投递目标不在正文里](../../../../spec/data/connector/v2/contract.md#s-2-鉴权绑定与投递目标不在正文里) |
| `data.connector` v2 | S-3 | [S-3 来源标识](../../../../spec/data/connector/v2/contract.md#s-3-来源标识) |
| `data.connector` v2 | S-4 | [S-4 投递目标](../../../../spec/data/connector/v2/contract.md#s-4-投递目标) |
| `data.connector` v2 | S-5 | [S-5 入站信封](../../../../spec/data/connector/v2/contract.md#s-5-入站信封) |
| `data.connector` v2 | S-6 | [S-6 externalId 是「同一件事」的说法](../../../../spec/data/connector/v2/contract.md#s-6-externalid-是同一件事的说法) |
| `data.connector` v2 | S-7 | [S-7 receivedAt 不是次序，也不是身份](../../../../spec/data/connector/v2/contract.md#s-7-receivedat-不是次序也不是身份) |
| `data.connector` v2 | S-8 | [S-8 信封不带归属](../../../../spec/data/connector/v2/contract.md#s-8-信封不带归属) |
| `data.connector` v2 | S-9 | [S-9 信封落成一条用户消息](../../../../spec/data/connector/v2/contract.md#s-9-信封落成一条用户消息) |
| `data.connector` v2 | S-10 | [S-10 信封里的文本不是命令](../../../../spec/data/connector/v2/contract.md#s-10-信封里的文本不是命令) |
| `data.connector` v2 | S-11 | [S-11 推出规则](../../../../spec/data/connector/v2/contract.md#s-11-推出规则) |
| `data.connector` v2 | S-12 | [S-12 鉴权绑定那一项](../../../../spec/data/connector/v2/contract.md#s-12-鉴权绑定那一项) |
| `data.connector` v2 | S-13 | [S-13 两项权限](../../../../spec/data/connector/v2/contract.md#s-13-两项权限) |
| `data.connector` v2 | S-14 | [S-14 没有读取面，也没有管理面](../../../../spec/data/connector/v2/contract.md#s-14-没有读取面也没有管理面) |
| `data.connector` v2 | S-15 | [S-15 送进来的就要被处理](../../../../spec/data/connector/v2/contract.md#s-15-送进来的就要被处理) |
| `data.connector` v2 | S-16 | [S-16 规范表示](../../../../spec/data/connector/v2/contract.md#s-16-规范表示) |
| `data.connector` v2 | S-17 | [S-17 判别式闭合](../../../../spec/data/connector/v2/contract.md#s-17-判别式闭合) |
| `data.connector` v2 | S-18 | [S-18 表示层拒绝值](../../../../spec/data/connector/v2/contract.md#s-18-表示层拒绝值) |
| `data.connector` v2 | S-19 | [S-19 表示层拒绝不是判定，也不修补](../../../../spec/data/connector/v2/contract.md#s-19-表示层拒绝不是判定也不修补) |
| `data.connector` v2 | S-20 | [S-20 空的渠道与空的信封](../../../../spec/data/connector/v2/contract.md#s-20-空的渠道与空的信封) |
| `data.connector` v2 | S-21 | [S-21 投递目标认不出，与投递目标进不去](../../../../spec/data/connector/v2/contract.md#s-21-投递目标认不出与投递目标进不去) |
| `data.connector` v2 | S-22 | [S-22 外面送来的斜杠开头的话](../../../../spec/data/connector/v2/contract.md#s-22-外面送来的斜杠开头的话) |
| `data.connector` v2 | S-23 | [S-23 正文里写了凭据](../../../../spec/data/connector/v2/contract.md#s-23-正文里写了凭据) |
| `data.content-blocks` v2 | S-1 | [S-1 七类块](../../../../spec/data/content-blocks/v2/contract.md#s-1-七类块) |
| `data.content-blocks` v2 | S-2 | [S-2 块底座](../../../../spec/data/content-blocks/v2/contract.md#s-2-块底座) |
| `data.content-blocks` v2 | S-3 | [S-3 BlockId](../../../../spec/data/content-blocks/v2/contract.md#s-3-blockid) |
| `data.content-blocks` v2 | S-4 | [S-4 两个标注](../../../../spec/data/content-blocks/v2/contract.md#s-4-两个标注) |
| `data.content-blocks` v2 | S-5 | [S-5 嵌套的块按合取取用](../../../../spec/data/content-blocks/v2/contract.md#s-5-嵌套的块按合取取用) |
| `data.content-blocks` v2 | S-6 | [S-6 模态由媒体类型判定](../../../../spec/data/content-blocks/v2/contract.md#s-6-模态由媒体类型判定) |
| `data.content-blocks` v2 | S-7 | [S-7 媒体类型的规范形式](../../../../spec/data/content-blocks/v2/contract.md#s-7-媒体类型的规范形式) |
| `data.content-blocks` v2 | S-8 | [S-8 文本块与来路标记](../../../../spec/data/content-blocks/v2/contract.md#s-8-文本块与来路标记) |
| `data.content-blocks` v2 | S-9 | [S-9 思考块与不透明数据](../../../../spec/data/content-blocks/v2/contract.md#s-9-思考块与不透明数据) |
| `data.content-blocks` v2 | S-10 | [S-10 语音块与图块](../../../../spec/data/content-blocks/v2/contract.md#s-10-语音块与图块) |
| `data.content-blocks` v2 | S-11 | [S-11 文件块](../../../../spec/data/content-blocks/v2/contract.md#s-11-文件块) |
| `data.content-blocks` v2 | S-12 | [S-12 完整的工具调用](../../../../spec/data/content-blocks/v2/contract.md#s-12-完整的工具调用) |
| `data.content-blocks` v2 | S-13 | [S-13 半截的工具调用](../../../../spec/data/content-blocks/v2/contract.md#s-13-半截的工具调用) |
| `data.content-blocks` v2 | S-14 | [S-14 CallId](../../../../spec/data/content-blocks/v2/contract.md#s-14-callid) |
| `data.content-blocks` v2 | S-15 | [S-15 工具结果块](../../../../spec/data/content-blocks/v2/contract.md#s-15-工具结果块) |
| `data.content-blocks` v2 | S-16 | [S-16 结果里不发起调用](../../../../spec/data/content-blocks/v2/contract.md#s-16-结果里不发起调用) |
| `data.content-blocks` v2 | S-17 | [S-17 六种收场](../../../../spec/data/content-blocks/v2/contract.md#s-17-六种收场) |
| `data.content-blocks` v2 | S-18 | [S-18 占位原因与它落在哪一格](../../../../spec/data/content-blocks/v2/contract.md#s-18-占位原因与它落在哪一格) |
| `data.content-blocks` v2 | S-19 | [S-19 派生表示与 transcript](../../../../spec/data/content-blocks/v2/contract.md#s-19-派生表示与-transcript) |
| `data.content-blocks` v2 | S-20 | [S-20 派生表示的产出者与能力标识](../../../../spec/data/content-blocks/v2/contract.md#s-20-派生表示的产出者与能力标识) |
| `data.content-blocks` v2 | S-21 | [S-21 AttachmentRef](../../../../spec/data/content-blocks/v2/contract.md#s-21-attachmentref) |
| `data.content-blocks` v2 | S-22 | [S-22 落盘之后整块不变](../../../../spec/data/content-blocks/v2/contract.md#s-22-落盘之后整块不变) |
| `data.content-blocks` v2 | S-34 | [S-34 只给了引用的附件落成哪一类块](../../../../spec/data/content-blocks/v2/contract.md#s-34-只给了引用的附件落成哪一类块) |
| `data.content-blocks` v2 | S-23 | [S-23 块不携带租户身份](../../../../spec/data/content-blocks/v2/contract.md#s-23-块不携带租户身份) |
| `data.content-blocks` v2 | S-24 | [S-24 规范表示](../../../../spec/data/content-blocks/v2/contract.md#s-24-规范表示) |
| `data.content-blocks` v2 | S-25 | [S-25 判别式与枚举闭合](../../../../spec/data/content-blocks/v2/contract.md#s-25-判别式与枚举闭合) |
| `data.content-blocks` v2 | S-26 | [S-26 表示层拒绝值](../../../../spec/data/content-blocks/v2/contract.md#s-26-表示层拒绝值) |
| `data.content-blocks` v2 | S-27 | [S-27 表示层拒绝不是判定，也不修补](../../../../spec/data/content-blocks/v2/contract.md#s-27-表示层拒绝不是判定也不修补) |
| `data.content-blocks` v2 | S-28 | [S-28 标注缺一即拒](../../../../spec/data/content-blocks/v2/contract.md#s-28-标注缺一即拒) |
| `data.content-blocks` v2 | S-29 | [S-29 半截调用两边都不给](../../../../spec/data/content-blocks/v2/contract.md#s-29-半截调用两边都不给) |
| `data.content-blocks` v2 | S-30 | [S-30 结果里不发起调用](../../../../spec/data/content-blocks/v2/contract.md#s-30-结果里不发起调用) |
| `data.content-blocks` v2 | S-31 | [S-31 语音与图的模态要对](../../../../spec/data/content-blocks/v2/contract.md#s-31-语音与图的模态要对) |
| `data.content-blocks` v2 | S-32 | [S-32 占位原因落在对的收场](../../../../spec/data/content-blocks/v2/contract.md#s-32-占位原因落在对的收场) |
| `data.content-blocks` v2 | S-33 | [S-33 派生表示不含文件块](../../../../spec/data/content-blocks/v2/contract.md#s-33-派生表示不含文件块) |
| `data.identity-values` v1 | S-1 | [S-1 AccountId](../../../../spec/data/identity-values/v1/contract.md#s-1-accountid) |
| `data.identity-values` v1 | S-2 | [S-2 登录标识不是 AccountId](../../../../spec/data/identity-values/v1/contract.md#s-2-登录标识不是-accountid) |
| `data.identity-values` v1 | S-3 | [S-3 OrganizationId](../../../../spec/data/identity-values/v1/contract.md#s-3-organizationid) |
| `data.identity-values` v1 | S-4 | [S-4 OrganizationKind](../../../../spec/data/identity-values/v1/contract.md#s-4-organizationkind) |
| `data.identity-values` v1 | S-5 | [S-5 TenantId 的构成与相等](../../../../spec/data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等) |
| `data.identity-values` v1 | S-6 | [S-6 TenantId 无生灭路径](../../../../spec/data/identity-values/v1/contract.md#s-6-tenantid-无生灭路径) |
| `data.identity-values` v1 | S-7 | [S-7 TenantId 的规范序列化形式](../../../../spec/data/identity-values/v1/contract.md#s-7-tenantid-的规范序列化形式) |
| `data.identity-values` v1 | S-8 | [S-8 TenantRole](../../../../spec/data/identity-values/v1/contract.md#s-8-tenantrole) |
| `data.identity-values` v1 | S-9 | [S-9 LoginStateId](../../../../spec/data/identity-values/v1/contract.md#s-9-loginstateid) |
| `data.identity-values` v1 | S-10 | [S-10 MembershipStanding](../../../../spec/data/identity-values/v1/contract.md#s-10-membershipstanding) |
| `data.identity-values` v1 | S-11 | [S-11 ScopeLayerIdentity](../../../../spec/data/identity-values/v1/contract.md#s-11-scopelayeridentity) |
| `data.identity-values` v1 | S-12 | [S-12 缺席与空值都不是身份值](../../../../spec/data/identity-values/v1/contract.md#s-12-缺席与空值都不是身份值) |
| `data.identity-values` v1 | S-35 | [S-35 交接凭证 Handoff Warrant](../../../../spec/data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant) |
| `data.identity-values` v1 | S-35 | [S-35 为什么不立统一语言词条](../../../../spec/data/identity-values/v1/contract.md#s-35-为什么不立统一语言词条) |
| `data.identity-values` v1 | S-13 | [S-13 sameAccountDistinctTenants](../../../../spec/data/identity-values/v1/contract.md#s-13-sameaccountdistincttenants) |
| `data.identity-values` v1 | S-14 | [S-14 上级组织与上级链](../../../../spec/data/identity-values/v1/contract.md#s-14-上级组织与上级链) |
| `data.identity-values` v1 | S-15 | [S-15 shareAncestor](../../../../spec/data/identity-values/v1/contract.md#s-15-shareancestor) |
| `data.identity-values` v1 | S-16 | [S-16 按归属层显式携带身份值](../../../../spec/data/identity-values/v1/contract.md#s-16-按归属层显式携带身份值) |
| `data.identity-values` v1 | S-17 | [S-17 身份参数没有默认值](../../../../spec/data/identity-values/v1/contract.md#s-17-身份参数没有默认值) |
| `data.identity-values` v1 | S-18 | [S-18 缺席即拒绝](../../../../spec/data/identity-values/v1/contract.md#s-18-缺席即拒绝) |
| `data.identity-values` v1 | S-19 | [S-19 不可用即明确失败](../../../../spec/data/identity-values/v1/contract.md#s-19-不可用即明确失败) |
| `data.identity-values` v1 | S-20 | [S-20 六条路径同一判定](../../../../spec/data/identity-values/v1/contract.md#s-20-六条路径同一判定) |
| `data.identity-values` v1 | S-21 | [S-21 判定依据的构成封闭](../../../../spec/data/identity-values/v1/contract.md#s-21-判定依据的构成封闭) |
| `data.identity-values` v1 | S-22 | [S-22 路径是地址不是钥匙](../../../../spec/data/identity-values/v1/contract.md#s-22-路径是地址不是钥匙) |
| `data.identity-values` v1 | S-23 | [S-23 不得冒充隔离](../../../../spec/data/identity-values/v1/contract.md#s-23-不得冒充隔离) |
| `data.identity-values` v1 | S-24 | [S-24 账号记录不含跨账号关联字段](../../../../spec/data/identity-values/v1/contract.md#s-24-账号记录不含跨账号关联字段) |
| `data.identity-values` v1 | S-25 | [S-25 个人 context 不进任何层](../../../../spec/data/identity-values/v1/contract.md#s-25-个人-context-不进任何层) |
| `data.identity-values` v1 | S-26 | [S-26 成员无效使租户级持有不可达但不销毁](../../../../spec/data/identity-values/v1/contract.md#s-26-成员无效使租户级持有不可达但不销毁) |
| `data.identity-values` v1 | S-27 | [S-27 每道准入现读](../../../../spec/data/identity-values/v1/contract.md#s-27-每道准入现读) |
| `data.identity-values` v1 | S-28 | [S-28 当前租户身份在创建那一刻捕获](../../../../spec/data/identity-values/v1/contract.md#s-28-当前租户身份在创建那一刻捕获) |
| `data.identity-values` v1 | S-29 | [S-29 层事实只以显式身份值为键](../../../../spec/data/identity-values/v1/contract.md#s-29-层事实只以显式身份值为键) |
| `data.identity-values` v1 | S-30 | [S-30 跨边界须重新验证](../../../../spec/data/identity-values/v1/contract.md#s-30-跨边界须重新验证) |
| `data.identity-values` v1 | S-31 | [S-31 不透明标识的交换表示](../../../../spec/data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) |
| `data.identity-values` v1 | S-32 | [S-32 判别式集合闭合](../../../../spec/data/identity-values/v1/contract.md#s-32-判别式集合闭合) |
| `data.identity-values` v1 | S-33 | [S-33 表示层校验与判定分开](../../../../spec/data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) |
| `data.identity-values` v1 | S-34 | [S-34 语义身份与实现地址分开](../../../../spec/data/identity-values/v1/contract.md#s-34-语义身份与实现地址分开) |
| `data.loop-extension` v2 | S-1 | [S-1 十一个位置](../../../../spec/data/loop-extension/v2/contract.md#s-1-十一个位置) |
| `data.loop-extension` v2 | S-2 | [S-2 两个维度](../../../../spec/data/loop-extension/v2/contract.md#s-2-两个维度) |
| `data.loop-extension` v2 | S-3 | [S-3 「管哪些情形」本版只有维度](../../../../spec/data/loop-extension/v2/contract.md#s-3-管哪些情形本版只有维度) |
| `data.loop-extension` v2 | S-4 | [S-4 干预力三档](../../../../spec/data/loop-extension/v2/contract.md#s-4-干预力三档) |
| `data.loop-extension` v2 | S-5 | [S-5 报错处置策略](../../../../spec/data/loop-extension/v2/contract.md#s-5-报错处置策略) |
| `data.loop-extension` v2 | S-6 | [S-6 声明的成员与类别](../../../../spec/data/loop-extension/v2/contract.md#s-6-声明的成员与类别) |
| `data.loop-extension` v2 | S-7 | [S-7 name 是身份](../../../../spec/data/loop-extension/v2/contract.md#s-7-name-是身份) |
| `data.loop-extension` v2 | S-8 | [S-8 装配进来的实现与外部命令](../../../../spec/data/loop-extension/v2/contract.md#s-8-装配进来的实现与外部命令) |
| `data.loop-extension` v2 | S-9 | [S-9 依赖声明与不可用](../../../../spec/data/loop-extension/v2/contract.md#s-9-依赖声明与不可用) |
| `data.loop-extension` v2 | S-10 | [S-10 本版没有 order](../../../../spec/data/loop-extension/v2/contract.md#s-10-本版没有-order) |
| `data.loop-extension` v2 | S-40 | [S-40 属性项的推出规则](../../../../spec/data/loop-extension/v2/contract.md#s-40-属性项的推出规则) |
| `data.loop-extension` v2 | S-11 | [S-11 输入的成员](../../../../spec/data/loop-extension/v2/contract.md#s-11-输入的成员) |
| `data.loop-extension` v2 | S-12 | [S-12 三个引用](../../../../spec/data/loop-extension/v2/contract.md#s-12-三个引用) |
| `data.loop-extension` v2 | S-41 | [S-41 执行环境句柄](../../../../spec/data/loop-extension/v2/contract.md#s-41-执行环境句柄) |
| `data.loop-extension` v2 | S-13 | [S-13 瀑布里的 subject 与 earlier](../../../../spec/data/loop-extension/v2/contract.md#s-13-瀑布里的-subject-与-earlier) |
| `data.loop-extension` v2 | S-14 | [S-14 按位置的 Subject](../../../../spec/data/loop-extension/v2/contract.md#s-14-按位置的-subject) |
| `data.loop-extension` v2 | S-15 | [S-15 ModelRequest](../../../../spec/data/loop-extension/v2/contract.md#s-15-modelrequest) |
| `data.loop-extension` v2 | S-16 | [S-16 CompactionPlan](../../../../spec/data/loop-extension/v2/contract.md#s-16-compactionplan) |
| `data.loop-extension` v2 | S-17 | [S-17 FailureCause](../../../../spec/data/loop-extension/v2/contract.md#s-17-failurecause) |
| `data.loop-extension` v2 | S-18 | [S-18 TerminalFact](../../../../spec/data/loop-extension/v2/contract.md#s-18-terminalfact) |
| `data.loop-extension` v2 | S-19 | [S-19 结论封闭八种](../../../../spec/data/loop-extension/v2/contract.md#s-19-结论封闭八种) |
| `data.loop-extension` v2 | S-20 | [S-20 档与结论的合法组合](../../../../spec/data/loop-extension/v2/contract.md#s-20-档与结论的合法组合) |
| `data.loop-extension` v2 | S-21 | [S-21 位置与结论的合法组合](../../../../spec/data/loop-extension/v2/contract.md#s-21-位置与结论的合法组合) |
| `data.loop-extension` v2 | S-22 | [S-22 inject](../../../../spec/data/loop-extension/v2/contract.md#s-22-inject) |
| `data.loop-extension` v2 | S-23 | [S-23 rewrite](../../../../spec/data/loop-extension/v2/contract.md#s-23-rewrite) |
| `data.loop-extension` v2 | S-24 | [S-24 select_model](../../../../spec/data/loop-extension/v2/contract.md#s-24-select_model) |
| `data.loop-extension` v2 | S-25 | [S-25 veto](../../../../spec/data/loop-extension/v2/contract.md#s-25-veto) |
| `data.loop-extension` v2 | S-26 | [S-26 stop](../../../../spec/data/loop-extension/v2/contract.md#s-26-stop) |
| `data.loop-extension` v2 | S-27 | [S-27 retry](../../../../spec/data/loop-extension/v2/contract.md#s-27-retry) |
| `data.loop-extension` v2 | S-28 | [S-28 ask](../../../../spec/data/loop-extension/v2/contract.md#s-28-ask) |
| `data.loop-extension` v2 | S-29 | [S-29 没有放宽](../../../../spec/data/loop-extension/v2/contract.md#s-29-没有放宽) |
| `data.loop-extension` v2 | S-30 | [S-30 每件的结论必留](../../../../spec/data/loop-extension/v2/contract.md#s-30-每件的结论必留) |
| `data.loop-extension` v2 | S-31 | [S-31 三种记录形状](../../../../spec/data/loop-extension/v2/contract.md#s-31-三种记录形状) |
| `data.loop-extension` v2 | S-32 | [S-32 结论即走向](../../../../spec/data/loop-extension/v2/contract.md#s-32-结论即走向) |
| `data.loop-extension` v2 | S-33 | [S-33 不可用与报错两分](../../../../spec/data/loop-extension/v2/contract.md#s-33-不可用与报错两分) |
| `data.loop-extension` v2 | S-34 | [S-34 不合法的结论按报错处置](../../../../spec/data/loop-extension/v2/contract.md#s-34-不合法的结论按报错处置) |
| `data.loop-extension` v2 | S-35 | [S-35 跨过一次等待，只能带已落日志的东西](../../../../spec/data/loop-extension/v2/contract.md#s-35-跨过一次等待只能带已落日志的东西) |
| `data.loop-extension` v2 | S-36 | [S-36 规范表示与定义项](../../../../spec/data/loop-extension/v2/contract.md#s-36-规范表示与定义项) |
| `data.loop-extension` v2 | S-37 | [S-37 表示层拒绝值](../../../../spec/data/loop-extension/v2/contract.md#s-37-表示层拒绝值) |
| `data.loop-extension` v2 | S-38 | [S-38 表示层拒绝不是判定](../../../../spec/data/loop-extension/v2/contract.md#s-38-表示层拒绝不是判定) |
| `data.loop-extension` v2 | S-39 | [S-39 判别式与枚举闭合](../../../../spec/data/loop-extension/v2/contract.md#s-39-判别式与枚举闭合) |
| `data.mcp-endpoint` v2 | S-1 | [S-1 接入点正文](../../../../spec/data/mcp-endpoint/v2/contract.md#s-1-接入点正文) |
| `data.mcp-endpoint` v2 | S-2 | [S-2 身份只在能力标识上](../../../../spec/data/mcp-endpoint/v2/contract.md#s-2-身份只在能力标识上) |
| `data.mcp-endpoint` v2 | S-3 | [S-3 连接目标两种，闭合](../../../../spec/data/mcp-endpoint/v2/contract.md#s-3-连接目标两种闭合) |
| `data.mcp-endpoint` v2 | S-4 | [S-4 stdio](../../../../spec/data/mcp-endpoint/v2/contract.md#s-4-stdio) |
| `data.mcp-endpoint` v2 | S-5 | [S-5 streamable_http](../../../../spec/data/mcp-endpoint/v2/contract.md#s-5-streamable_http) |
| `data.mcp-endpoint` v2 | S-6 | [S-6 正文不收凭据](../../../../spec/data/mcp-endpoint/v2/contract.md#s-6-正文不收凭据) |
| `data.mcp-endpoint` v2 | S-7 | [S-7 两项超时的作者默认](../../../../spec/data/mcp-endpoint/v2/contract.md#s-7-两项超时的作者默认) |
| `data.mcp-endpoint` v2 | S-8 | [S-8 执行权限的作者默认](../../../../spec/data/mcp-endpoint/v2/contract.md#s-8-执行权限的作者默认) |
| `data.mcp-endpoint` v2 | S-9 | [S-9 动作清单副本](../../../../spec/data/mcp-endpoint/v2/contract.md#s-9-动作清单副本) |
| `data.mcp-endpoint` v2 | S-10 | [S-10 对端动作描述](../../../../spec/data/mcp-endpoint/v2/contract.md#s-10-对端动作描述) |
| `data.mcp-endpoint` v2 | S-11 | [S-11 动作条目名](../../../../spec/data/mcp-endpoint/v2/contract.md#s-11-动作条目名) |
| `data.mcp-endpoint` v2 | S-26 | [S-26 接入点 name 登记时收窄](../../../../spec/data/mcp-endpoint/v2/contract.md#s-26-接入点-name-登记时收窄) |
| `data.mcp-endpoint` v2 | S-12 | [S-12 OAuth 绑定](../../../../spec/data/mcp-endpoint/v2/contract.md#s-12-oauth-绑定) |
| `data.mcp-endpoint` v2 | S-13 | [S-13 凭据配值的取值域](../../../../spec/data/mcp-endpoint/v2/contract.md#s-13-凭据配值的取值域) |
| `data.mcp-endpoint` v2 | S-14 | [S-14 推出规则：五类项](../../../../spec/data/mcp-endpoint/v2/contract.md#s-14-推出规则五类项) |
| `data.mcp-endpoint` v2 | S-15 | [S-15 推出规则的输入：正文与动作集](../../../../spec/data/mcp-endpoint/v2/contract.md#s-15-推出规则的输入正文与动作集) |
| `data.mcp-endpoint` v2 | S-16 | [S-16 逐动作项按动作名键](../../../../spec/data/mcp-endpoint/v2/contract.md#s-16-逐动作项按动作名键) |
| `data.mcp-endpoint` v2 | S-17 | [S-17 工作区格上的这些项](../../../../spec/data/mcp-endpoint/v2/contract.md#s-17-工作区格上的这些项) |
| `data.mcp-endpoint` v2 | S-18 | [S-18 规范表示](../../../../spec/data/mcp-endpoint/v2/contract.md#s-18-规范表示) |
| `data.mcp-endpoint` v2 | S-19 | [S-19 判别式与枚举闭合](../../../../spec/data/mcp-endpoint/v2/contract.md#s-19-判别式与枚举闭合) |
| `data.mcp-endpoint` v2 | S-20 | [S-20 表示层拒绝值与判定次序](../../../../spec/data/mcp-endpoint/v2/contract.md#s-20-表示层拒绝值与判定次序) |
| `data.mcp-endpoint` v2 | S-21 | [S-21 表示层拒绝不是判定，也不修补](../../../../spec/data/mcp-endpoint/v2/contract.md#s-21-表示层拒绝不是判定也不修补) |
| `data.mcp-endpoint` v2 | S-22 | [S-22 正文里写凭据被拒](../../../../spec/data/mcp-endpoint/v2/contract.md#s-22-正文里写凭据被拒) |
| `data.mcp-endpoint` v2 | S-23 | [S-23 还没取过与空清单不是一回事](../../../../spec/data/mcp-endpoint/v2/contract.md#s-23-还没取过与空清单不是一回事) |
| `data.mcp-endpoint` v2 | S-24 | [S-24 动作消失再出现](../../../../spec/data/mcp-endpoint/v2/contract.md#s-24-动作消失再出现) |
| `data.mcp-endpoint` v2 | S-25 | [S-25 仓库带来的接入点没有凭据](../../../../spec/data/mcp-endpoint/v2/contract.md#s-25-仓库带来的接入点没有凭据) |
| `data.messages` v2 | S-1 | [S-1 七种消息](../../../../spec/data/messages/v2/contract.md#s-1-七种消息) |
| `data.messages` v2 | S-2 | [S-2 消息底座](../../../../spec/data/messages/v2/contract.md#s-2-消息底座) |
| `data.messages` v2 | S-3 | [S-3 MessageId](../../../../spec/data/messages/v2/contract.md#s-3-messageid) |
| `data.messages` v2 | S-4 | [S-4 createdAt 不是次序](../../../../spec/data/messages/v2/contract.md#s-4-createdat-不是次序) |
| `data.messages` v2 | S-5 | [S-5 给谁看在块上](../../../../spec/data/messages/v2/contract.md#s-5-给谁看在块上) |
| `data.messages` v2 | S-6 | [S-6 每种消息能装哪几类块](../../../../spec/data/messages/v2/contract.md#s-6-每种消息能装哪几类块) |
| `data.messages` v2 | S-7 | [S-7 SystemMessage](../../../../spec/data/messages/v2/contract.md#s-7-systemmessage) |
| `data.messages` v2 | S-8 | [S-8 UserMessage](../../../../spec/data/messages/v2/contract.md#s-8-usermessage) |
| `data.messages` v2 | S-9 | [S-9 AssistantMessage：一次回复只有一份](../../../../spec/data/messages/v2/contract.md#s-9-assistantmessage一次回复只有一份) |
| `data.messages` v2 | S-10 | [S-10 AssistantMessage 怎么收的尾](../../../../spec/data/messages/v2/contract.md#s-10-assistantmessage-怎么收的尾) |
| `data.messages` v2 | S-11 | [S-11 ToolMessage](../../../../spec/data/messages/v2/contract.md#s-11-toolmessage) |
| `data.messages` v2 | S-12 | [S-12 真实结果落哪种消息，只看有没有占位](../../../../spec/data/messages/v2/contract.md#s-12-真实结果落哪种消息只看有没有占位) |
| `data.messages` v2 | S-13 | [S-13 ToolInternalMessage](../../../../spec/data/messages/v2/contract.md#s-13-toolinternalmessage) |
| `data.messages` v2 | S-14 | [S-14 ToolInternalMessage 怎么收的尾](../../../../spec/data/messages/v2/contract.md#s-14-toolinternalmessage-怎么收的尾) |
| `data.messages` v2 | S-15 | [S-15 SystemReminderMessage：正文给模型读，来源给系统认](../../../../spec/data/messages/v2/contract.md#s-15-systemremindermessage正文给模型读来源给系统认) |
| `data.messages` v2 | S-16 | [S-16 性质与来源定死对应](../../../../spec/data/messages/v2/contract.md#s-16-性质与来源定死对应) |
| `data.messages` v2 | S-17 | [S-17 说状态的带前值与现值](../../../../spec/data/messages/v2/contract.md#s-17-说状态的带前值与现值) |
| `data.messages` v2 | S-18 | [S-18 来源闭合，拓展件走兜底](../../../../spec/data/messages/v2/contract.md#s-18-来源闭合拓展件走兜底) |
| `data.messages` v2 | S-19 | [S-19 后台执行的两种收场提醒](../../../../spec/data/messages/v2/contract.md#s-19-后台执行的两种收场提醒) |
| `data.messages` v2 | S-20 | [S-20 尝试开始](../../../../spec/data/messages/v2/contract.md#s-20-尝试开始) |
| `data.messages` v2 | S-21 | [S-21 中断之后必补一条](../../../../spec/data/messages/v2/contract.md#s-21-中断之后必补一条) |
| `data.messages` v2 | S-22 | [S-22 系统发起的等待答复回来](../../../../spec/data/messages/v2/contract.md#s-22-系统发起的等待答复回来) |
| `data.messages` v2 | S-23 | [S-23 循环守卫的干预](../../../../spec/data/messages/v2/contract.md#s-23-循环守卫的干预) |
| `data.messages` v2 | S-24 | [S-24 别的会话捎话与到点了](../../../../spec/data/messages/v2/contract.md#s-24-别的会话捎话与到点了) |
| `data.messages` v2 | S-25 | [S-25 runtime context 的变更与全量](../../../../spec/data/messages/v2/contract.md#s-25-runtime-context-的变更与全量) |
| `data.messages` v2 | S-26 | [S-26 拓展件追加的提醒](../../../../spec/data/messages/v2/contract.md#s-26-拓展件追加的提醒) |
| `data.messages` v2 | S-27 | [S-27 CompactionMessage 与它的名单](../../../../spec/data/messages/v2/contract.md#s-27-compactionmessage-与它的名单) |
| `data.messages` v2 | S-28 | [S-28 此刻模型可读是算出来的](../../../../spec/data/messages/v2/contract.md#s-28-此刻模型可读是算出来的) |
| `data.messages` v2 | S-29 | [S-29 合法名单的判定](../../../../spec/data/messages/v2/contract.md#s-29-合法名单的判定) |
| `data.messages` v2 | S-30 | [S-30 悬着的占位](../../../../spec/data/messages/v2/contract.md#s-30-悬着的占位) |
| `data.messages` v2 | S-31 | [S-31 收齐却解析不了的调用](../../../../spec/data/messages/v2/contract.md#s-31-收齐却解析不了的调用) |
| `data.messages` v2 | S-32 | [S-32 会话日志里的配对与唯一](../../../../spec/data/messages/v2/contract.md#s-32-会话日志里的配对与唯一) |
| `data.messages` v2 | S-33 | [S-33 消息不携带租户身份](../../../../spec/data/messages/v2/contract.md#s-33-消息不携带租户身份) |
| `data.messages` v2 | S-49 | [S-49 模型请求运行时写的五种记录：不是消息](../../../../spec/data/messages/v2/contract.md#s-49-模型请求运行时写的五种记录不是消息) |
| `data.messages` v2 | S-50 | [S-50 调用终结的三支](../../../../spec/data/messages/v2/contract.md#s-50-调用终结的三支) |
| `data.messages` v2 | S-34 | [S-34 四种直接对应](../../../../spec/data/messages/v2/contract.md#s-34-四种直接对应) |
| `data.messages` v2 | S-35 | [S-35 我们自己那两种必须在发出前译掉](../../../../spec/data/messages/v2/contract.md#s-35-我们自己那两种必须在发出前译掉) |
| `data.messages` v2 | S-36 | [S-36 ToolInternalMessage 不进请求](../../../../spec/data/messages/v2/contract.md#s-36-toolinternalmessage-不进请求) |
| `data.messages` v2 | S-37 | [S-37 规范表示](../../../../spec/data/messages/v2/contract.md#s-37-规范表示) |
| `data.messages` v2 | S-38 | [S-38 判别式与枚举闭合](../../../../spec/data/messages/v2/contract.md#s-38-判别式与枚举闭合) |
| `data.messages` v2 | S-39 | [S-39 表示层拒绝值](../../../../spec/data/messages/v2/contract.md#s-39-表示层拒绝值) |
| `data.messages` v2 | S-40 | [S-40 表示层拒绝不是判定，也不修补](../../../../spec/data/messages/v2/contract.md#s-40-表示层拒绝不是判定也不修补) |
| `data.messages` v2 | S-41 | [S-41 七种之外即拒](../../../../spec/data/messages/v2/contract.md#s-41-七种之外即拒) |
| `data.messages` v2 | S-42 | [S-42 工具消息恰一块](../../../../spec/data/messages/v2/contract.md#s-42-工具消息恰一块) |
| `data.messages` v2 | S-43 | [S-43 工具帧不给模型](../../../../spec/data/messages/v2/contract.md#s-43-工具帧不给模型) |
| `data.messages` v2 | S-44 | [S-44 提醒的性质与来源](../../../../spec/data/messages/v2/contract.md#s-44-提醒的性质与来源) |
| `data.messages` v2 | S-45 | [S-45 真实结果落哪种消息](../../../../spec/data/messages/v2/contract.md#s-45-真实结果落哪种消息) |
| `data.messages` v2 | S-46 | [S-46 名单的合法性](../../../../spec/data/messages/v2/contract.md#s-46-名单的合法性) |
| `data.messages` v2 | S-47 | [S-47 此刻模型可读](../../../../spec/data/messages/v2/contract.md#s-47-此刻模型可读) |
| `data.messages` v2 | S-48 | [S-48 中断必补](../../../../spec/data/messages/v2/contract.md#s-48-中断必补) |
| `data.model-profile` v2 | S-1 | [S-1 档案的身份：所在范围与路由名](../../../../spec/data/model-profile/v2/contract.md#s-1-档案的身份所在范围与路由名) |
| `data.model-profile` v2 | S-2 | [S-2 RouteName](../../../../spec/data/model-profile/v2/contract.md#s-2-routename) |
| `data.model-profile` v2 | S-3 | [S-3 撞名判定：同一范围内唯一](../../../../spec/data/model-profile/v2/contract.md#s-3-撞名判定同一范围内唯一) |
| `data.model-profile` v2 | S-3 | [S-3 路由名在全部档案里唯一？](../../../../spec/data/model-profile/v2/contract.md#s-3-路由名在全部档案里唯一) |
| `data.model-profile` v2 | S-4 | [S-4 ProfileOrigin](../../../../spec/data/model-profile/v2/contract.md#s-4-profileorigin) |
| `data.model-profile` v2 | S-5 | [S-5 ProviderName 与允许的供应商](../../../../spec/data/model-profile/v2/contract.md#s-5-providername-与允许的供应商) |
| `data.model-profile` v2 | S-6 | [S-6 允不允许回退](../../../../spec/data/model-profile/v2/contract.md#s-6-允不允许回退) |
| `data.model-profile` v2 | S-7 | [S-7 Modality 与两组模态](../../../../spec/data/model-profile/v2/contract.md#s-7-modality-与两组模态) |
| `data.model-profile` v2 | S-8 | [S-8 两个上限](../../../../spec/data/model-profile/v2/contract.md#s-8-两个上限) |
| `data.model-profile` v2 | S-9 | [S-9 InputConstraints](../../../../spec/data/model-profile/v2/contract.md#s-9-inputconstraints) |
| `data.model-profile` v2 | S-10 | [S-10 Registration](../../../../spec/data/model-profile/v2/contract.md#s-10-registration) |
| `data.model-profile` v2 | S-11 | [S-11 updatedAt](../../../../spec/data/model-profile/v2/contract.md#s-11-updatedat) |
| `data.model-profile` v2 | S-12 | [S-12 各属性何时定、能不能改](../../../../spec/data/model-profile/v2/contract.md#s-12-各属性何时定能不能改) |
| `data.model-profile` v2 | S-13 | [S-13 ModelProfileRef](../../../../spec/data/model-profile/v2/contract.md#s-13-modelprofileref) |
| `data.model-profile` v2 | S-14 | [S-14 引用只精确解析，不跨层](../../../../spec/data/model-profile/v2/contract.md#s-14-引用只精确解析不跨层) |
| `data.model-profile` v2 | S-27 | [S-27 ModelProfileSnapshot：档案在某一刻的副本](../../../../spec/data/model-profile/v2/contract.md#s-27-modelprofilesnapshot档案在某一刻的副本) |
| `data.model-profile` v2 | S-28 | [S-28 建档内容：产生一条档案时给的那一份](../../../../spec/data/model-profile/v2/contract.md#s-28-建档内容产生一条档案时给的那一份) |
| `data.model-profile` v2 | S-15 | [S-15 ModelRequestParameters 是一份词表](../../../../spec/data/model-profile/v2/contract.md#s-15-modelrequestparameters-是一份词表) |
| `data.model-profile` v2 | S-16 | [S-16 各项的取值域](../../../../spec/data/model-profile/v2/contract.md#s-16-各项的取值域) |
| `data.model-profile` v2 | S-17 | [S-17 缺席即不带，没有人补值](../../../../spec/data/model-profile/v2/contract.md#s-17-缺席即不带没有人补值) |
| `data.model-profile` v2 | S-18 | [S-18 档案参数的输出上限](../../../../spec/data/model-profile/v2/contract.md#s-18-档案参数的输出上限) |
| `data.model-profile` v2 | S-19 | [S-19 extra](../../../../spec/data/model-profile/v2/contract.md#s-19-extra) |
| `data.model-profile` v2 | S-20 | [S-20 项与项名](../../../../spec/data/model-profile/v2/contract.md#s-20-项与项名) |
| `data.model-profile` v2 | S-21 | [S-21 不静默丢，也不静默改](../../../../spec/data/model-profile/v2/contract.md#s-21-不静默丢也不静默改) |
| `data.model-profile` v2 | S-22 | [S-22 凭据、价格与实际用了哪条都不在档案上](../../../../spec/data/model-profile/v2/contract.md#s-22-凭据价格与实际用了哪条都不在档案上) |
| `data.model-profile` v2 | S-23 | [S-23 跨部署形态会变的判定](../../../../spec/data/model-profile/v2/contract.md#s-23-跨部署形态会变的判定) |
| `data.model-profile` v2 | S-24 | [S-24 表示层校验是一次纯计算](../../../../spec/data/model-profile/v2/contract.md#s-24-表示层校验是一次纯计算) |
| `data.model-profile` v2 | S-25 | [S-25 拒绝值闭合，一次恰一个](../../../../spec/data/model-profile/v2/contract.md#s-25-拒绝值闭合一次恰一个) |
| `data.model-profile` v2 | S-26 | [S-26 表示层拒绝与判定分开](../../../../spec/data/model-profile/v2/contract.md#s-26-表示层拒绝与判定分开) |
| `data.model-response` v2 | S-1 | [S-1 本契约拥有什么](../../../../spec/data/model-response/v2/contract.md#s-1-本契约拥有什么) |
| `data.model-response` v2 | S-2 | [S-2 本契约不拥有什么](../../../../spec/data/model-response/v2/contract.md#s-2-本契约不拥有什么) |
| `data.model-response` v2 | S-3 | [S-3 消费者](../../../../spec/data/model-response/v2/contract.md#s-3-消费者) |
| `data.model-response` v2 | S-4 | [S-4 一次调用、一次发出、一条响应体](../../../../spec/data/model-response/v2/contract.md#s-4-一次调用一次发出一条响应体) |
| `data.model-response` v2 | S-5 | [S-5 与别的形状的关系](../../../../spec/data/model-response/v2/contract.md#s-5-与别的形状的关系) |
| `data.model-response` v2 | S-6 | [S-6 ResponseId](../../../../spec/data/model-response/v2/contract.md#s-6-responseid) |
| `data.model-response` v2 | S-7 | [S-7 所属的那次调用](../../../../spec/data/model-response/v2/contract.md#s-7-所属的那次调用) |
| `data.model-response` v2 | S-8 | [S-8 第几次发出](../../../../spec/data/model-response/v2/contract.md#s-8-第几次发出) |
| `data.model-response` v2 | S-35 | [S-35 晚到的那一条](../../../../spec/data/model-response/v2/contract.md#s-35-晚到的那一条) |
| `data.model-response` v2 | S-9 | [S-9 路由留痕](../../../../spec/data/model-response/v2/contract.md#s-9-路由留痕) |
| `data.model-response` v2 | S-10 | [S-10 有效模型怎么来的](../../../../spec/data/model-response/v2/contract.md#s-10-有效模型怎么来的) |
| `data.model-response` v2 | S-11 | [S-11 实际发出的参数、改过的值与没发出去的项](../../../../spec/data/model-response/v2/contract.md#s-11-实际发出的参数改过的值与没发出去的项) |
| `data.model-response` v2 | S-12 | [S-12 收场](../../../../spec/data/model-response/v2/contract.md#s-12-收场) |
| `data.model-response` v2 | S-13 | [S-13 收场与其余成员的条件关系](../../../../spec/data/model-response/v2/contract.md#s-13-收场与其余成员的条件关系) |
| `data.model-response` v2 | S-14 | [S-14 回复与已交付部分](../../../../spec/data/model-response/v2/contract.md#s-14-回复与已交付部分) |
| `data.model-response` v2 | S-15 | [S-15 故障的成因与原样状态码](../../../../spec/data/model-response/v2/contract.md#s-15-故障的成因与原样状态码) |
| `data.model-response` v2 | S-16 | [S-16 发出了的才有响应体](../../../../spec/data/model-response/v2/contract.md#s-16-发出了的才有响应体) |
| `data.model-response` v2 | S-17 | [S-17 首 token 与时序](../../../../spec/data/model-response/v2/contract.md#s-17-首-token-与时序) |
| `data.model-response` v2 | S-18 | [S-18 首 token 缺席是一条断言](../../../../spec/data/model-response/v2/contract.md#s-18-首-token-缺席是一条断言) |
| `data.model-response` v2 | S-19 | [S-19 用量与费用](../../../../spec/data/model-response/v2/contract.md#s-19-用量与费用) |
| `data.model-response` v2 | S-20 | [S-20 上游原始响应留存](../../../../spec/data/model-response/v2/contract.md#s-20-上游原始响应留存) |
| `data.model-response` v2 | S-21 | [S-21 写入之前脱敏](../../../../spec/data/model-response/v2/contract.md#s-21-写入之前脱敏) |
| `data.model-response` v2 | S-22 | [S-22 写下即不变](../../../../spec/data/model-response/v2/contract.md#s-22-写下即不变) |
| `data.model-response` v2 | S-23 | [S-23 同一次调用的响应体序列](../../../../spec/data/model-response/v2/contract.md#s-23-同一次调用的响应体序列) |
| `data.model-response` v2 | S-24 | [S-24 一条响应体对应上游的一次请求](../../../../spec/data/model-response/v2/contract.md#s-24-一条响应体对应上游的一次请求) |
| `data.model-response` v2 | S-25 | [S-25 装配给的保证与协议须给的保证](../../../../spec/data/model-response/v2/contract.md#s-25-装配给的保证与协议须给的保证) |
| `data.model-response` v2 | S-26 | [S-26 Schema 的范围](../../../../spec/data/model-response/v2/contract.md#s-26-schema-的范围) |
| `data.model-response` v2 | S-27 | [S-27 表示层拒绝值](../../../../spec/data/model-response/v2/contract.md#s-27-表示层拒绝值) |
| `data.model-response` v2 | S-28 | [S-28 表示层拒绝与判定分开](../../../../spec/data/model-response/v2/contract.md#s-28-表示层拒绝与判定分开) |
| `data.model-response` v2 | S-29 | [S-29 两次发出，两条响应体，两笔钱](../../../../spec/data/model-response/v2/contract.md#s-29-两次发出两条响应体两笔钱) |
| `data.model-response` v2 | S-30 | [S-30 首 token 之后的故障](../../../../spec/data/model-response/v2/contract.md#s-30-首-token-之后的故障) |
| `data.model-response` v2 | S-31 | [S-31 用户中断的两支](../../../../spec/data/model-response/v2/contract.md#s-31-用户中断的两支) |
| `data.model-response` v2 | S-32 | [S-32 没发出去的调用没有响应体](../../../../spec/data/model-response/v2/contract.md#s-32-没发出去的调用没有响应体) |
| `data.model-response` v2 | S-33 | [S-33 参数不静默丢、不静默改](../../../../spec/data/model-response/v2/contract.md#s-33-参数不静默丢不静默改) |
| `data.model-response` v2 | S-34 | [S-34 凭据不进响应体](../../../../spec/data/model-response/v2/contract.md#s-34-凭据不进响应体) |
| `data.offer-expiry` v1 | S-1 | [S-1 本契约拥有什么](../../../../spec/data/offer-expiry/v1/contract.md#s-1-本契约拥有什么) |
| `data.offer-expiry` v1 | S-2 | [S-2 四类消费者](../../../../spec/data/offer-expiry/v1/contract.md#s-2-四类消费者) |
| `data.offer-expiry` v1 | S-3 | [S-3 本契约明确不承诺什么](../../../../spec/data/offer-expiry/v1/contract.md#s-3-本契约明确不承诺什么) |
| `data.offer-expiry` v1 | S-4 | [S-4 OfferTiming](../../../../spec/data/offer-expiry/v1/contract.md#s-4-offertiming) |
| `data.offer-expiry` v1 | S-5 | [S-5 时刻在发出的同一提交内定死](../../../../spec/data/offer-expiry/v1/contract.md#s-5-时刻在发出的同一提交内定死) |
| `data.offer-expiry` v1 | S-6 | [S-6 指向的对象](../../../../spec/data/offer-expiry/v1/contract.md#s-6-指向的对象) |
| `data.offer-expiry` v1 | S-7 | [S-7 派生状态](../../../../spec/data/offer-expiry/v1/contract.md#s-7-派生状态) |
| `data.offer-expiry` v1 | S-8 | [S-8 判定式](../../../../spec/data/offer-expiry/v1/contract.md#s-8-判定式) |
| `data.offer-expiry` v1 | S-9 | [S-9 读时派生，且派生状态不回退](../../../../spec/data/offer-expiry/v1/contract.md#s-9-读时派生且派生状态不回退) |
| `data.offer-expiry` v1 | S-10 | [S-10 接受操作在同一提交内重新求值](../../../../spec/data/offer-expiry/v1/contract.md#s-10-接受操作在同一提交内重新求值) |
| `data.offer-expiry` v1 | S-11 | [S-11 到期之后不可接受](../../../../spec/data/offer-expiry/v1/contract.md#s-11-到期之后不可接受) |
| `data.offer-expiry` v1 | S-12 | [S-12 过期与撤回收场相同](../../../../spec/data/offer-expiry/v1/contract.md#s-12-过期与撤回收场相同) |
| `data.offer-expiry` v1 | S-13 | [S-13 接受路径上，三种来路给同一个拒绝值](../../../../spec/data/offer-expiry/v1/contract.md#s-13-接受路径上三种来路给同一个拒绝值) |
| `data.offer-expiry` v1 | S-14 | [S-14 `offer_ttl`](../../../../spec/data/offer-expiry/v1/contract.md#s-14-offer_ttl) |
| `data.offer-expiry` v1 | S-15 | [S-15 改参数不动已发出的](../../../../spec/data/offer-expiry/v1/contract.md#s-15-改参数不动已发出的) |
| `data.offer-expiry` v1 | S-16 | [S-16 同一时间源](../../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源) |
| `data.offer-expiry` v1 | S-17 | [S-17 装配给的保证 vs 协议须给的保证](../../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) |
| `data.offer-expiry` v1 | S-18 | [S-18 后台清理不担正确性](../../../../spec/data/offer-expiry/v1/contract.md#s-18-后台清理不担正确性) |
| `data.offer-expiry` v1 | S-19 | [S-19 规则与读面归属](../../../../spec/data/offer-expiry/v1/contract.md#s-19-规则与读面归属) |
| `data.offer-expiry` v1 | S-20 | [S-20 不可用 ≠ 不存在](../../../../spec/data/offer-expiry/v1/contract.md#s-20-不可用--不存在) |
| `data.offer-expiry` v1 | S-21 | [S-21 本版的触发源](../../../../spec/data/offer-expiry/v1/contract.md#s-21-本版的触发源) |
| `data.offer-expiry` v1 | S-22 | [S-22 Schema 的范围](../../../../spec/data/offer-expiry/v1/contract.md#s-22-schema-的范围) |
| `data.offer-expiry` v1 | S-23 | [S-23 过期之后接受被拒](../../../../spec/data/offer-expiry/v1/contract.md#s-23-过期之后接受被拒) |
| `data.offer-expiry` v1 | S-24 | [S-24 撤回之后接受被拒，以及再次接受一份已接受的](../../../../spec/data/offer-expiry/v1/contract.md#s-24-撤回之后接受被拒以及再次接受一份已接受的) |
| `data.offer-expiry` v1 | S-25 | [S-25 上界为 `offer_ttl`](../../../../spec/data/offer-expiry/v1/contract.md#s-25-上界为-offer_ttl) |
| `data.offer-expiry` v1 | S-26 | [S-26 指向的对象消失即过期](../../../../spec/data/offer-expiry/v1/contract.md#s-26-指向的对象消失即过期) |
| `data.skill-package` v2 | S-1 | [S-1 技能包是什么](../../../../spec/data/skill-package/v2/contract.md#s-1-技能包是什么) |
| `data.skill-package` v2 | S-2 | [S-2 技能名的词法](../../../../spec/data/skill-package/v2/contract.md#s-2-技能名的词法) |
| `data.skill-package` v2 | S-3 | [S-3 技能包的四个部分](../../../../spec/data/skill-package/v2/contract.md#s-3-技能包的四个部分) |
| `data.skill-package` v2 | S-4 | [S-4 清单头：开放格式的六个键](../../../../spec/data/skill-package/v2/contract.md#s-4-清单头开放格式的六个键) |
| `data.skill-package` v2 | S-5 | [S-5 键的四类处置](../../../../spec/data/skill-package/v2/contract.md#s-5-键的四类处置) |
| `data.skill-package` v2 | S-6 | [S-6 名字与所属能力标识一致](../../../../spec/data/skill-package/v2/contract.md#s-6-名字与所属能力标识一致) |
| `data.skill-package` v2 | S-7 | [S-7 说明](../../../../spec/data/skill-package/v2/contract.md#s-7-说明) |
| `data.skill-package` v2 | S-8 | [S-8 正文：逐字、不展开、不执行](../../../../spec/data/skill-package/v2/contract.md#s-8-正文逐字不展开不执行) |
| `data.skill-package` v2 | S-9 | [S-9 资源条目与包内路径](../../../../spec/data/skill-package/v2/contract.md#s-9-资源条目与包内路径) |
| `data.skill-package` v2 | S-10 | [S-10 资源只被读取，不因读取而运行](../../../../spec/data/skill-package/v2/contract.md#s-10-资源只被读取不因读取而运行) |
| `data.skill-package` v2 | S-11 | [S-11 脚本集合](../../../../spec/data/skill-package/v2/contract.md#s-11-脚本集合) |
| `data.skill-package` v2 | S-12 | [S-12 定义记录](../../../../spec/data/skill-package/v2/contract.md#s-12-定义记录) |
| `data.skill-package` v2 | S-13 | [S-13 组合的工具清单](../../../../spec/data/skill-package/v2/contract.md#s-13-组合的工具清单) |
| `data.skill-package` v2 | S-14 | [S-14 外部服务依赖](../../../../spec/data/skill-package/v2/contract.md#s-14-外部服务依赖) |
| `data.skill-package` v2 | S-15 | [S-15 设置项声明](../../../../spec/data/skill-package/v2/contract.md#s-15-设置项声明) |
| `data.skill-package` v2 | S-32 | [S-32 执行环境要求](../../../../spec/data/skill-package/v2/contract.md#s-32-执行环境要求) |
| `data.skill-package` v2 | S-16 | [S-16 由包得出的依赖声明](../../../../spec/data/skill-package/v2/contract.md#s-16-由包得出的依赖声明) |
| `data.skill-package` v2 | S-17 | [S-17 属性项投影规则](../../../../spec/data/skill-package/v2/contract.md#s-17-属性项投影规则) |
| `data.skill-package` v2 | S-18 | [S-18 常驻不在包里](../../../../spec/data/skill-package/v2/contract.md#s-18-常驻不在包里) |
| `data.skill-package` v2 | S-19 | [S-19 包是版本内容的一个整体](../../../../spec/data/skill-package/v2/contract.md#s-19-包是版本内容的一个整体) |
| `data.skill-package` v2 | S-20 | [S-20 SKILL.md 的文本形式与定界](../../../../spec/data/skill-package/v2/contract.md#s-20-skillmd-的文本形式与定界) |
| `data.skill-package` v2 | S-21 | [S-21 包的目录形式](../../../../spec/data/skill-package/v2/contract.md#s-21-包的目录形式) |
| `data.skill-package` v2 | S-22 | [S-22 规范表示](../../../../spec/data/skill-package/v2/contract.md#s-22-规范表示) |
| `data.skill-package` v2 | S-23 | [S-23 判别式与枚举闭合](../../../../spec/data/skill-package/v2/contract.md#s-23-判别式与枚举闭合) |
| `data.skill-package` v2 | S-24 | [S-24 表示层拒绝值与判定次序](../../../../spec/data/skill-package/v2/contract.md#s-24-表示层拒绝值与判定次序) |
| `data.skill-package` v2 | S-25 | [S-25 表示层拒绝不是判定，也不修补](../../../../spec/data/skill-package/v2/contract.md#s-25-表示层拒绝不是判定也不修补) |
| `data.skill-package` v2 | S-26 | [S-26 名字对不上即拒](../../../../spec/data/skill-package/v2/contract.md#s-26-名字对不上即拒) |
| `data.skill-package` v2 | S-27 | [S-27 正文逐字](../../../../spec/data/skill-package/v2/contract.md#s-27-正文逐字) |
| `data.skill-package` v2 | S-28 | [S-28 资源路径不出包](../../../../spec/data/skill-package/v2/contract.md#s-28-资源路径不出包) |
| `data.skill-package` v2 | S-29 | [S-29 组合清单只收工具](../../../../spec/data/skill-package/v2/contract.md#s-29-组合清单只收工具) |
| `data.skill-package` v2 | S-30 | [S-30 定义记录的格式不认得即拒，且先于其余](../../../../spec/data/skill-package/v2/contract.md#s-30-定义记录的格式不认得即拒且先于其余) |
| `data.skill-package` v2 | S-31 | [S-31 常驻与预批准不从内容生效](../../../../spec/data/skill-package/v2/contract.md#s-31-常驻与预批准不从内容生效) |
| `data.slash-command` v2 | S-1 | [S-1 斜杠命令定义是资产的正文](../../../../spec/data/slash-command/v2/contract.md#s-1-斜杠命令定义是资产的正文) |
| `data.slash-command` v2 | S-2 | [S-2 命令名的词法](../../../../spec/data/slash-command/v2/contract.md#s-2-命令名的词法) |
| `data.slash-command` v2 | S-3 | [S-3 保留区与它唯一的拼法](../../../../spec/data/slash-command/v2/contract.md#s-3-保留区与它唯一的拼法) |
| `data.slash-command` v2 | S-4 | [S-4 保留区只归系统提供的命令型](../../../../spec/data/slash-command/v2/contract.md#s-4-保留区只归系统提供的命令型) |
| `data.slash-command` v2 | S-5 | [S-5 保留名在系统内唯一，没有优先级](../../../../spec/data/slash-command/v2/contract.md#s-5-保留名在系统内唯一没有优先级) |
| `data.slash-command` v2 | S-6 | [S-6 三种绑定目标](../../../../spec/data/slash-command/v2/contract.md#s-6-三种绑定目标) |
| `data.slash-command` v2 | S-7 | [S-7 ServiceName](../../../../spec/data/slash-command/v2/contract.md#s-7-servicename) |
| `data.slash-command` v2 | S-8 | [S-8 参数声明](../../../../spec/data/slash-command/v2/contract.md#s-8-参数声明) |
| `data.slash-command` v2 | S-9 | [S-9 参数声明的结构约束](../../../../spec/data/slash-command/v2/contract.md#s-9-参数声明的结构约束) |
| `data.slash-command` v2 | S-10 | [S-10 提示词模板与占位符](../../../../spec/data/slash-command/v2/contract.md#s-10-提示词模板与占位符) |
| `data.slash-command` v2 | S-11 | [S-11 属性项的推出规则](../../../../spec/data/slash-command/v2/contract.md#s-11-属性项的推出规则) |
| `data.slash-command` v2 | S-12 | [S-12 只识别经交付面的输入](../../../../spec/data/slash-command/v2/contract.md#s-12-只识别经交付面的输入) |
| `data.slash-command` v2 | S-13 | [S-13 识别的三种结果](../../../../spec/data/slash-command/v2/contract.md#s-13-识别的三种结果) |
| `data.slash-command` v2 | S-14 | [S-14 CommandInvocation 与位置](../../../../spec/data/slash-command/v2/contract.md#s-14-commandinvocation-与位置) |
| `data.slash-command` v2 | S-15 | [S-15 一条输入至多一条命令](../../../../spec/data/slash-command/v2/contract.md#s-15-一条输入至多一条命令) |
| `data.slash-command` v2 | S-16 | [S-16 名字只按会话斜杠命令集认](../../../../spec/data/slash-command/v2/contract.md#s-16-名字只按会话斜杠命令集认) |
| `data.slash-command` v2 | S-17 | [S-17 参数文字的切分](../../../../spec/data/slash-command/v2/contract.md#s-17-参数文字的切分) |
| `data.slash-command` v2 | S-18 | [S-18 参数的绑定与取值](../../../../spec/data/slash-command/v2/contract.md#s-18-参数的绑定与取值) |
| `data.slash-command` v2 | S-19 | [S-19 解析失败取第一处](../../../../spec/data/slash-command/v2/contract.md#s-19-解析失败取第一处) |
| `data.slash-command` v2 | S-20 | [S-20 ParseResult 四支](../../../../spec/data/slash-command/v2/contract.md#s-20-parseresult-四支) |
| `data.slash-command` v2 | S-21 | [S-21 提示词型的展开](../../../../spec/data/slash-command/v2/contract.md#s-21-提示词型的展开) |
| `data.slash-command` v2 | S-22 | [S-22 技能型的引用与两块展开物](../../../../spec/data/slash-command/v2/contract.md#s-22-技能型的引用与两块展开物) |
| `data.slash-command` v2 | S-23 | [S-23 命令型的参数](../../../../spec/data/slash-command/v2/contract.md#s-23-命令型的参数) |
| `data.slash-command` v2 | S-24 | [S-24 解析失败即什么都不发](../../../../spec/data/slash-command/v2/contract.md#s-24-解析失败即什么都不发) |
| `data.slash-command` v2 | S-25 | [S-25 留痕](../../../../spec/data/slash-command/v2/contract.md#s-25-留痕) |
| `data.slash-command` v2 | S-26 | [S-26 规范表示](../../../../spec/data/slash-command/v2/contract.md#s-26-规范表示) |
| `data.slash-command` v2 | S-27 | [S-27 判别式与枚举闭合](../../../../spec/data/slash-command/v2/contract.md#s-27-判别式与枚举闭合) |
| `data.slash-command` v2 | S-28 | [S-28 表示层拒绝值](../../../../spec/data/slash-command/v2/contract.md#s-28-表示层拒绝值) |
| `data.slash-command` v2 | S-29 | [S-29 表示层拒绝与解析失败分开，都不修补](../../../../spec/data/slash-command/v2/contract.md#s-29-表示层拒绝与解析失败分开都不修补) |
| `data.tool-definition` v2 | S-1 | [S-1 工具定义是什么](../../../../spec/data/tool-definition/v2/contract.md#s-1-工具定义是什么) |
| `data.tool-definition` v2 | S-2 | [S-2 身份是 name](../../../../spec/data/tool-definition/v2/contract.md#s-2-身份是-name) |
| `data.tool-definition` v2 | S-3 | [S-3 两种范式](../../../../spec/data/tool-definition/v2/contract.md#s-3-两种范式) |
| `data.tool-definition` v2 | S-4 | [S-4 单函数工具](../../../../spec/data/tool-definition/v2/contract.md#s-4-单函数工具) |
| `data.tool-definition` v2 | S-5 | [S-5 多命令工具](../../../../spec/data/tool-definition/v2/contract.md#s-5-多命令工具) |
| `data.tool-definition` v2 | S-6 | [S-6 模型面只有一个条目](../../../../spec/data/tool-definition/v2/contract.md#s-6-模型面只有一个条目) |
| `data.tool-definition` v2 | S-7 | [S-7 多命令 input 的生成规则](../../../../spec/data/tool-definition/v2/contract.md#s-7-多命令-input-的生成规则) |
| `data.tool-definition` v2 | S-8 | [S-8 说明与用法](../../../../spec/data/tool-definition/v2/contract.md#s-8-说明与用法) |
| `data.tool-definition` v2 | S-9 | [S-9 四项依赖名](../../../../spec/data/tool-definition/v2/contract.md#s-9-四项依赖名) |
| `data.tool-definition` v2 | S-10 | [S-10 设置项声明](../../../../spec/data/tool-definition/v2/contract.md#s-10-设置项声明) |
| `data.tool-definition` v2 | S-11 | [S-11 目标环境](../../../../spec/data/tool-definition/v2/contract.md#s-11-目标环境) |
| `data.tool-definition` v2 | S-12 | [S-12 后台许可与转后台阈值](../../../../spec/data/tool-definition/v2/contract.md#s-12-后台许可与转后台阈值) |
| `data.tool-definition` v2 | S-13 | [S-13 超时与并发](../../../../spec/data/tool-definition/v2/contract.md#s-13-超时与并发) |
| `data.tool-definition` v2 | S-14 | [S-14 时长的表示](../../../../spec/data/tool-definition/v2/contract.md#s-14-时长的表示) |
| `data.tool-definition` v2 | S-15 | [S-15 执行权限](../../../../spec/data/tool-definition/v2/contract.md#s-15-执行权限) |
| `data.tool-definition` v2 | S-16 | [S-16 组合](../../../../spec/data/tool-definition/v2/contract.md#s-16-组合) |
| `data.tool-definition` v2 | S-17 | [S-17 来源](../../../../spec/data/tool-definition/v2/contract.md#s-17-来源) |
| `data.tool-definition` v2 | S-18 | [S-18 名字的表示与相等](../../../../spec/data/tool-definition/v2/contract.md#s-18-名字的表示与相等) |
| `data.tool-definition` v2 | S-19 | [S-19 由定义得出的依赖声明](../../../../spec/data/tool-definition/v2/contract.md#s-19-由定义得出的依赖声明) |
| `data.tool-definition` v2 | S-31 | [S-31 属性项的推出规则](../../../../spec/data/tool-definition/v2/contract.md#s-31-属性项的推出规则) |
| `data.tool-definition` v2 | S-20 | [S-20 两种写法与等价规则](../../../../spec/data/tool-definition/v2/contract.md#s-20-两种写法与等价规则) |
| `data.tool-definition` v2 | S-21 | [S-21 ToolResult 的三样](../../../../spec/data/tool-definition/v2/contract.md#s-21-toolresult-的三样) |
| `data.tool-definition` v2 | S-22 | [S-22 结果内容里没有工具调用](../../../../spec/data/tool-definition/v2/contract.md#s-22-结果内容里没有工具调用) |
| `data.tool-definition` v2 | S-23 | [S-23 卸载](../../../../spec/data/tool-definition/v2/contract.md#s-23-卸载) |
| `data.tool-definition` v2 | S-24 | [S-24 结果与声明对得上](../../../../spec/data/tool-definition/v2/contract.md#s-24-结果与声明对得上) |
| `data.tool-definition` v2 | S-25 | [S-25 ToolResult 不是收场](../../../../spec/data/tool-definition/v2/contract.md#s-25-toolresult-不是收场) |
| `data.tool-definition` v2 | S-26 | [S-26 表示层拒绝值与判定次序](../../../../spec/data/tool-definition/v2/contract.md#s-26-表示层拒绝值与判定次序) |
| `data.tool-definition` v2 | S-27 | [S-27 表示层拒绝不是判定](../../../../spec/data/tool-definition/v2/contract.md#s-27-表示层拒绝不是判定) |
| `data.tool-definition` v2 | S-28 | [S-28 判别式与枚举闭合](../../../../spec/data/tool-definition/v2/contract.md#s-28-判别式与枚举闭合) |
| `data.tool-definition` v2 | S-29 | [S-29 不在定义里的三样](../../../../spec/data/tool-definition/v2/contract.md#s-29-不在定义里的三样) |
| `data.tool-definition` v2 | S-30 | [S-30 实现不在定义里](../../../../spec/data/tool-definition/v2/contract.md#s-30-实现不在定义里) |

## 5. Cordis 建模、存储与装卸
| 节点 | 当前设计与公开面 | 应用拓扑 |
|---|---|---|
| `apps/cli` | [四层状态与可实施范围](../../../../realization/apps/cli/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/apps/cli/design.md) | [进程、跨应用边与配置](../../../../realization/apps/cli/architecture.md) |
| `apps/tenancy-host` | [四层状态与可实施范围](../../../../realization/apps/tenancy-host/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/apps/tenancy-host/design.md) | [进程、跨应用边与配置](../../../../realization/apps/tenancy-host/architecture.md) |
| `packages/agent-loop/hooks-import` | [四层状态与可实施范围](../../../../realization/packages/agent-loop/hooks-import/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/agent-loop/hooks-import/design.md) | 提供者节点 |
| `packages/agent-loop/loop-extension-runner` | [四层状态与可实施范围](../../../../realization/packages/agent-loop/loop-extension-runner/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/agent-loop/loop-extension-runner/design.md) | 提供者节点 |
| `packages/assets/assembly-manifest-store` | [四层状态与可实施范围](../../../../realization/packages/assets/assembly-manifest-store/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/assets/assembly-manifest-store/design.md) | 提供者节点 |
| `packages/assets/asset-governance` | [四层状态与可实施范围](../../../../realization/packages/assets/asset-governance/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/assets/asset-governance/design.md) | 提供者节点 |
| `packages/core/arrival-events` | [四层状态与可实施范围](../../../../realization/packages/core/arrival-events/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/arrival-events/design.md) | 提供者节点 |
| `packages/core/asset-evaluation` | [四层状态与可实施范围](../../../../realization/packages/core/asset-evaluation/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/asset-evaluation/design.md) | 提供者节点 |
| `packages/core/asset-model` | [四层状态与可实施范围](../../../../realization/packages/core/asset-model/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/asset-model/design.md) | 提供者节点 |
| `packages/core/call-accounts` | [四层状态与可实施范围](../../../../realization/packages/core/call-accounts/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/call-accounts/design.md) | 提供者节点 |
| `packages/core/connector` | [四层状态与可实施范围](../../../../realization/packages/core/connector/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/connector/design.md) | 提供者节点 |
| `packages/core/content-blocks` | [四层状态与可实施范围](../../../../realization/packages/core/content-blocks/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/content-blocks/design.md) | 提供者节点 |
| `packages/core/loop-extension` | [四层状态与可实施范围](../../../../realization/packages/core/loop-extension/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/loop-extension/design.md) | 提供者节点 |
| `packages/core/mcp-endpoint` | [四层状态与可实施范围](../../../../realization/packages/core/mcp-endpoint/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/mcp-endpoint/design.md) | 提供者节点 |
| `packages/core/messages` | [四层状态与可实施范围](../../../../realization/packages/core/messages/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/messages/design.md) | 提供者节点 |
| `packages/core/model-profile` | [四层状态与可实施范围](../../../../realization/packages/core/model-profile/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/model-profile/design.md) | 提供者节点 |
| `packages/core/model-response` | [四层状态与可实施范围](../../../../realization/packages/core/model-response/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/model-response/design.md) | 提供者节点 |
| `packages/core/skill-package` | [四层状态与可实施范围](../../../../realization/packages/core/skill-package/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/skill-package/design.md) | 提供者节点 |
| `packages/core/slash-command` | [四层状态与可实施范围](../../../../realization/packages/core/slash-command/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/slash-command/design.md) | 提供者节点 |
| `packages/core/stream-assembly` | [四层状态与可实施范围](../../../../realization/packages/core/stream-assembly/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/stream-assembly/design.md) | 提供者节点 |
| `packages/core/tool-definition` | [四层状态与可实施范围](../../../../realization/packages/core/tool-definition/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/core/tool-definition/design.md) | 提供者节点 |
| `packages/infra/center-connection-probe` | [四层状态与可实施范围](../../../../realization/packages/infra/center-connection-probe/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/infra/center-connection-probe/design.md) | 提供者节点 |
| `packages/infra/credential-custodian-local` | [四层状态与可实施范围](../../../../realization/packages/infra/credential-custodian-local/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/infra/credential-custodian-local/design.md) | 提供者节点 |
| `packages/infra/execution-environments-host` | [四层状态与可实施范围](../../../../realization/packages/infra/execution-environments-host/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/infra/execution-environments-host/design.md) | 提供者节点 |
| `packages/model/modality-projection` | [四层状态与可实施范围](../../../../realization/packages/model/modality-projection/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/model/modality-projection/design.md) | 提供者节点 |
| `packages/model/model-profile-directory` | [四层状态与可实施范围](../../../../realization/packages/model/model-profile-directory/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/model/model-profile-directory/design.md) | 提供者节点 |
| `packages/model/model-request-runtime` | [四层状态与可实施范围](../../../../realization/packages/model/model-request-runtime/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/model/model-request-runtime/design.md) | 提供者节点 |
| `packages/model/pi-ai-transport` | [四层状态与可实施范围](../../../../realization/packages/model/pi-ai-transport/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/model/pi-ai-transport/design.md) | 提供者节点 |
| `packages/session/run-attempt-facts-derived` | [四层状态与可实施范围](../../../../realization/packages/session/run-attempt-facts-derived/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/session/run-attempt-facts-derived/design.md) | 提供者节点 |
| `packages/session/session-log-jsonl` | [四层状态与可实施范围](../../../../realization/packages/session/session-log-jsonl/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/session/session-log-jsonl/design.md) | 提供者节点 |
| `packages/session/session-tenancy-table` | [四层状态与可实施范围](../../../../realization/packages/session/session-tenancy-table/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/session/session-tenancy-table/design.md) | 提供者节点 |
| `packages/tenancy/organization-governance` | [四层状态与可实施范围](../../../../realization/packages/tenancy/organization-governance/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/tenancy/organization-governance/design.md) | 提供者节点 |
| `packages/tools/asset-registry` | [四层状态与可实施范围](../../../../realization/packages/tools/asset-registry/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/tools/asset-registry/design.md) | 提供者节点 |
| `packages/tools/mcp-bridge` | [四层状态与可实施范围](../../../../realization/packages/tools/mcp-bridge/README.md)；[插件／纯模块边界、公开函数与服务面、inject、存储共同对象、effect 装卸与失败责任](../../../../realization/packages/tools/mcp-bridge/design.md) | 提供者节点 |

公开函数面与 Cordis 服务登记分别按节点展开。可替换提供者、生命周期与调用期解析规则保持当前设计；跨 owner 同一提交必须使用节点点名的共享存储对象。

## 6. 绑定与证据
| 节点 | 绑定 | 运行／验证与前提 |
|---|---|---|
| `apps/cli` | [条款、会失败的证据与 assumptions](../../../../realization/apps/cli/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/apps/cli/verification.md) |
| `apps/tenancy-host` | [条款、会失败的证据与 assumptions](../../../../realization/apps/tenancy-host/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/apps/tenancy-host/verification.md) |
| `packages/agent-loop/hooks-import` | [条款、会失败的证据与 assumptions](../../../../realization/packages/agent-loop/hooks-import/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/agent-loop/hooks-import/verification.md) |
| `packages/agent-loop/loop-extension-runner` | [条款、会失败的证据与 assumptions](../../../../realization/packages/agent-loop/loop-extension-runner/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/agent-loop/loop-extension-runner/verification.md) |
| `packages/assets/assembly-manifest-store` | [条款、会失败的证据与 assumptions](../../../../realization/packages/assets/assembly-manifest-store/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/assets/assembly-manifest-store/verification.md) |
| `packages/assets/asset-governance` | [条款、会失败的证据与 assumptions](../../../../realization/packages/assets/asset-governance/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/assets/asset-governance/verification.md) |
| `packages/core/arrival-events` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/arrival-events/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/arrival-events/verification.md) |
| `packages/core/asset-evaluation` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/asset-evaluation/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/asset-evaluation/verification.md) |
| `packages/core/asset-model` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/asset-model/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/asset-model/verification.md) |
| `packages/core/call-accounts` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/call-accounts/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/call-accounts/verification.md) |
| `packages/core/connector` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/connector/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/connector/verification.md) |
| `packages/core/content-blocks` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/content-blocks/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/content-blocks/verification.md) |
| `packages/core/loop-extension` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/loop-extension/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/loop-extension/verification.md) |
| `packages/core/mcp-endpoint` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/mcp-endpoint/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/mcp-endpoint/verification.md) |
| `packages/core/messages` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/messages/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/messages/verification.md) |
| `packages/core/model-profile` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/model-profile/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/model-profile/verification.md) |
| `packages/core/model-response` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/model-response/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/model-response/verification.md) |
| `packages/core/skill-package` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/skill-package/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/skill-package/verification.md) |
| `packages/core/slash-command` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/slash-command/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/slash-command/verification.md) |
| `packages/core/stream-assembly` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/stream-assembly/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/stream-assembly/verification.md) |
| `packages/core/tool-definition` | [条款、会失败的证据与 assumptions](../../../../realization/packages/core/tool-definition/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/core/tool-definition/verification.md) |
| `packages/infra/center-connection-probe` | [条款、会失败的证据与 assumptions](../../../../realization/packages/infra/center-connection-probe/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/infra/center-connection-probe/verification.md) |
| `packages/infra/credential-custodian-local` | [条款、会失败的证据与 assumptions](../../../../realization/packages/infra/credential-custodian-local/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/infra/credential-custodian-local/verification.md) |
| `packages/infra/execution-environments-host` | [条款、会失败的证据与 assumptions](../../../../realization/packages/infra/execution-environments-host/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/infra/execution-environments-host/verification.md) |
| `packages/model/modality-projection` | [条款、会失败的证据与 assumptions](../../../../realization/packages/model/modality-projection/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/model/modality-projection/verification.md) |
| `packages/model/model-profile-directory` | [条款、会失败的证据与 assumptions](../../../../realization/packages/model/model-profile-directory/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/model/model-profile-directory/verification.md) |
| `packages/model/model-request-runtime` | [条款、会失败的证据与 assumptions](../../../../realization/packages/model/model-request-runtime/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/model/model-request-runtime/verification.md) |
| `packages/model/pi-ai-transport` | [条款、会失败的证据与 assumptions](../../../../realization/packages/model/pi-ai-transport/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/model/pi-ai-transport/verification.md) |
| `packages/session/run-attempt-facts-derived` | [条款、会失败的证据与 assumptions](../../../../realization/packages/session/run-attempt-facts-derived/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/session/run-attempt-facts-derived/verification.md) |
| `packages/session/session-log-jsonl` | [条款、会失败的证据与 assumptions](../../../../realization/packages/session/session-log-jsonl/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/session/session-log-jsonl/verification.md) |
| `packages/session/session-tenancy-table` | [条款、会失败的证据与 assumptions](../../../../realization/packages/session/session-tenancy-table/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/session/session-tenancy-table/verification.md) |
| `packages/tenancy/organization-governance` | [条款、会失败的证据与 assumptions](../../../../realization/packages/tenancy/organization-governance/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/tenancy/organization-governance/verification.md) |
| `packages/tools/asset-registry` | [条款、会失败的证据与 assumptions](../../../../realization/packages/tools/asset-registry/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/tools/asset-registry/verification.md) |
| `packages/tools/mcp-bridge` | [条款、会失败的证据与 assumptions](../../../../realization/packages/tools/mcp-bridge/bindings.yaml) | [已跑范围、未跑义务、评审处置与已知缺口](../../../../realization/packages/tools/mcp-bridge/verification.md) |

形式工具只在有限模型与其登记前提内提供证据。本次接受没有执行新测试、形式任务或真实供应商调用；此前实际运行查 record/evidence，不把本次状态登记当作运行证据。

## 7. 未决缺口与受阻消费
下表逐份指向当前契约与节点中的完整缺口清单，owner、闭合条件和缺席答复均以这些清单为准。已在后续裁决闭合的产品确认项不再列作待签；未实现的读面、输入接线、loop、比较门等仍保留。
| 拥有者 | 当前缺口、owner 与闭合条件 |
|---|---|---|
| `capability.account-identity` v1 | [九、已知缺口](../../../../spec/capabilities/account-identity/v1/contract.md#九已知缺口) |
| `capability.account-identity` v2 | [九、已知缺口](../../../../spec/capabilities/account-identity/v2/contract.md#九已知缺口) |
| `capability.assembly-manifest` v2 | [十、已知缺口](../../../../spec/capabilities/assembly-manifest/v2/contract.md#十已知缺口) |
| `capability.asset-evaluation` v2 | [十一、已知缺口](../../../../spec/capabilities/asset-evaluation/v2/contract.md#十一已知缺口) |
| `capability.asset-governance` v2 | [十二、已知缺口](../../../../spec/capabilities/asset-governance/v2/contract.md#十二已知缺口) |
| `capability.asset-registry` v2 | [十、已知缺口](../../../../spec/capabilities/asset-registry/v2/contract.md#十已知缺口) |
| `capability.asset-transfer` v2 | [十一、已知缺口](../../../../spec/capabilities/asset-transfer/v2/contract.md#十一已知缺口) |
| `capability.center-connection` v2 | [八、已知缺口](../../../../spec/capabilities/center-connection/v2/contract.md#八已知缺口) |
| `capability.credential-custodian` v2 | [十一、已知缺口](../../../../spec/capabilities/credential-custodian/v2/contract.md#十一已知缺口) |
| `capability.execution-environments` v2 | [十、已知缺口](../../../../spec/capabilities/execution-environments/v2/contract.md#十已知缺口) |
| `capability.hooks-import` v2 | [十一、已知缺口](../../../../spec/capabilities/hooks-import/v2/contract.md#十一已知缺口) |
| `capability.loop-extension-runner` v2 | [十三、已知缺口](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#十三已知缺口) |
| `capability.mcp-bridge` v2 | [十、已知缺口](../../../../spec/capabilities/mcp-bridge/v2/contract.md#十已知缺口) |
| `capability.modality-projection` v2 | [十一、已知缺口](../../../../spec/capabilities/modality-projection/v2/contract.md#十一已知缺口) |
| `capability.model-profile-directory` v2 | [十、已知缺口](../../../../spec/capabilities/model-profile-directory/v2/contract.md#十已知缺口) |
| `capability.model-request-runtime` v2 | [十二、已知缺口](../../../../spec/capabilities/model-request-runtime/v2/contract.md#十二已知缺口) |
| `capability.organization-governance` v1 | [十一、已知缺口](../../../../spec/capabilities/organization-governance/v1/contract.md#十一已知缺口) |
| `capability.organization-governance` v3 | [十一、已知缺口](../../../../spec/capabilities/organization-governance/v3/contract.md#十一已知缺口) |
| `capability.run-attempt-facts` v2 | [十、已知缺口](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#十已知缺口) |
| `capability.session-log` v2 | [十、已知缺口](../../../../spec/capabilities/session-log/v2/contract.md#十已知缺口) |
| `capability.session-tenancy` v2 | [十、已知缺口](../../../../spec/capabilities/session-tenancy/v2/contract.md#十已知缺口) |
| `capability.stream-assembly` v2 | [十、已知缺口](../../../../spec/capabilities/stream-assembly/v2/contract.md#十已知缺口) |
| `capability.tool-admission` v2 | [十一、已知缺口](../../../../spec/capabilities/tool-admission/v2/contract.md#十一已知缺口) |
| `composition.account-registration` v1 | [九、已知缺口](../../../../spec/compositions/account-registration/v1/contract.md#九已知缺口) |
| `composition.governance-center-entry` v1 | [十三、已知缺口](../../../../spec/compositions/governance-center-entry/v1/contract.md#十三已知缺口) |
| `composition.governance-center-entry-https-json` v1 | [十一、已知缺口](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#十一已知缺口) |
| `data.arrival-events` v2 | [九、已知缺口](../../../../spec/data/arrival-events/v2/contract.md#九已知缺口) |
| `data.asset-model` v2 | [八、已知缺口](../../../../spec/data/asset-model/v2/contract.md#八已知缺口) |
| `data.call-accounts` v2 | [十、已知缺口](../../../../spec/data/call-accounts/v2/contract.md#十已知缺口) |
| `data.connector` v2 | [十、已知缺口](../../../../spec/data/connector/v2/contract.md#十已知缺口) |
| `data.content-blocks` v2 | [八、已知缺口](../../../../spec/data/content-blocks/v2/contract.md#八已知缺口) |
| `data.identity-values` v1 | [十、已知缺口](../../../../spec/data/identity-values/v1/contract.md#十已知缺口) |
| `data.loop-extension` v2 | [十四、已知缺口](../../../../spec/data/loop-extension/v2/contract.md#十四已知缺口) |
| `data.mcp-endpoint` v2 | [八、已知缺口](../../../../spec/data/mcp-endpoint/v2/contract.md#八已知缺口) |
| `data.messages` v2 | [九、已知缺口](../../../../spec/data/messages/v2/contract.md#九已知缺口) |
| `data.model-profile` v2 | [十、已知缺口](../../../../spec/data/model-profile/v2/contract.md#十已知缺口) |
| `data.model-response` v2 | [七、已知缺口](../../../../spec/data/model-response/v2/contract.md#七已知缺口) |
| `data.offer-expiry` v1 | [八、已知缺口](../../../../spec/data/offer-expiry/v1/contract.md#八已知缺口) |
| `data.skill-package` v2 | [九、已知缺口](../../../../spec/data/skill-package/v2/contract.md#九已知缺口) |
| `data.slash-command` v2 | [十、已知缺口](../../../../spec/data/slash-command/v2/contract.md#十已知缺口) |
| `data.tool-definition` v2 | [十、已知缺口](../../../../spec/data/tool-definition/v2/contract.md#十已知缺口) |
| `apps/cli` | [实施缺口及消费者影响](../../../../realization/apps/cli/design.md)；[未满足验证义务](../../../../realization/apps/cli/verification.md) |
| `apps/tenancy-host` | [实施缺口及消费者影响](../../../../realization/apps/tenancy-host/design.md)；[未满足验证义务](../../../../realization/apps/tenancy-host/verification.md) |
| `packages/agent-loop/hooks-import` | [实施缺口及消费者影响](../../../../realization/packages/agent-loop/hooks-import/design.md)；[未满足验证义务](../../../../realization/packages/agent-loop/hooks-import/verification.md) |
| `packages/agent-loop/loop-extension-runner` | [实施缺口及消费者影响](../../../../realization/packages/agent-loop/loop-extension-runner/design.md)；[未满足验证义务](../../../../realization/packages/agent-loop/loop-extension-runner/verification.md) |
| `packages/assets/assembly-manifest-store` | [实施缺口及消费者影响](../../../../realization/packages/assets/assembly-manifest-store/design.md)；[未满足验证义务](../../../../realization/packages/assets/assembly-manifest-store/verification.md) |
| `packages/assets/asset-governance` | [实施缺口及消费者影响](../../../../realization/packages/assets/asset-governance/design.md)；[未满足验证义务](../../../../realization/packages/assets/asset-governance/verification.md) |
| `packages/core/arrival-events` | [实施缺口及消费者影响](../../../../realization/packages/core/arrival-events/design.md)；[未满足验证义务](../../../../realization/packages/core/arrival-events/verification.md) |
| `packages/core/asset-evaluation` | [实施缺口及消费者影响](../../../../realization/packages/core/asset-evaluation/design.md)；[未满足验证义务](../../../../realization/packages/core/asset-evaluation/verification.md) |
| `packages/core/asset-model` | [实施缺口及消费者影响](../../../../realization/packages/core/asset-model/design.md)；[未满足验证义务](../../../../realization/packages/core/asset-model/verification.md) |
| `packages/core/call-accounts` | [实施缺口及消费者影响](../../../../realization/packages/core/call-accounts/design.md)；[未满足验证义务](../../../../realization/packages/core/call-accounts/verification.md) |
| `packages/core/connector` | [实施缺口及消费者影响](../../../../realization/packages/core/connector/design.md)；[未满足验证义务](../../../../realization/packages/core/connector/verification.md) |
| `packages/core/content-blocks` | [实施缺口及消费者影响](../../../../realization/packages/core/content-blocks/design.md)；[未满足验证义务](../../../../realization/packages/core/content-blocks/verification.md) |
| `packages/core/loop-extension` | [实施缺口及消费者影响](../../../../realization/packages/core/loop-extension/design.md)；[未满足验证义务](../../../../realization/packages/core/loop-extension/verification.md) |
| `packages/core/mcp-endpoint` | [实施缺口及消费者影响](../../../../realization/packages/core/mcp-endpoint/design.md)；[未满足验证义务](../../../../realization/packages/core/mcp-endpoint/verification.md) |
| `packages/core/messages` | [实施缺口及消费者影响](../../../../realization/packages/core/messages/design.md)；[未满足验证义务](../../../../realization/packages/core/messages/verification.md) |
| `packages/core/model-profile` | [实施缺口及消费者影响](../../../../realization/packages/core/model-profile/design.md)；[未满足验证义务](../../../../realization/packages/core/model-profile/verification.md) |
| `packages/core/model-response` | [实施缺口及消费者影响](../../../../realization/packages/core/model-response/design.md)；[未满足验证义务](../../../../realization/packages/core/model-response/verification.md) |
| `packages/core/skill-package` | [实施缺口及消费者影响](../../../../realization/packages/core/skill-package/design.md)；[未满足验证义务](../../../../realization/packages/core/skill-package/verification.md) |
| `packages/core/slash-command` | [实施缺口及消费者影响](../../../../realization/packages/core/slash-command/design.md)；[未满足验证义务](../../../../realization/packages/core/slash-command/verification.md) |
| `packages/core/stream-assembly` | [实施缺口及消费者影响](../../../../realization/packages/core/stream-assembly/design.md)；[未满足验证义务](../../../../realization/packages/core/stream-assembly/verification.md) |
| `packages/core/tool-definition` | [实施缺口及消费者影响](../../../../realization/packages/core/tool-definition/design.md)；[未满足验证义务](../../../../realization/packages/core/tool-definition/verification.md) |
| `packages/infra/center-connection-probe` | [实施缺口及消费者影响](../../../../realization/packages/infra/center-connection-probe/design.md)；[未满足验证义务](../../../../realization/packages/infra/center-connection-probe/verification.md) |
| `packages/infra/credential-custodian-local` | [实施缺口及消费者影响](../../../../realization/packages/infra/credential-custodian-local/design.md)；[未满足验证义务](../../../../realization/packages/infra/credential-custodian-local/verification.md) |
| `packages/infra/execution-environments-host` | [实施缺口及消费者影响](../../../../realization/packages/infra/execution-environments-host/design.md)；[未满足验证义务](../../../../realization/packages/infra/execution-environments-host/verification.md) |
| `packages/model/modality-projection` | [实施缺口及消费者影响](../../../../realization/packages/model/modality-projection/design.md)；[未满足验证义务](../../../../realization/packages/model/modality-projection/verification.md) |
| `packages/model/model-profile-directory` | [实施缺口及消费者影响](../../../../realization/packages/model/model-profile-directory/design.md)；[未满足验证义务](../../../../realization/packages/model/model-profile-directory/verification.md) |
| `packages/model/model-request-runtime` | [实施缺口及消费者影响](../../../../realization/packages/model/model-request-runtime/design.md)；[未满足验证义务](../../../../realization/packages/model/model-request-runtime/verification.md) |
| `packages/model/pi-ai-transport` | [实施缺口及消费者影响](../../../../realization/packages/model/pi-ai-transport/design.md)；[未满足验证义务](../../../../realization/packages/model/pi-ai-transport/verification.md) |
| `packages/session/run-attempt-facts-derived` | [实施缺口及消费者影响](../../../../realization/packages/session/run-attempt-facts-derived/design.md)；[未满足验证义务](../../../../realization/packages/session/run-attempt-facts-derived/verification.md) |
| `packages/session/session-log-jsonl` | [实施缺口及消费者影响](../../../../realization/packages/session/session-log-jsonl/design.md)；[未满足验证义务](../../../../realization/packages/session/session-log-jsonl/verification.md) |
| `packages/session/session-tenancy-table` | [实施缺口及消费者影响](../../../../realization/packages/session/session-tenancy-table/design.md)；[未满足验证义务](../../../../realization/packages/session/session-tenancy-table/verification.md) |
| `packages/tenancy/organization-governance` | [实施缺口及消费者影响](../../../../realization/packages/tenancy/organization-governance/design.md)；[未满足验证义务](../../../../realization/packages/tenancy/organization-governance/verification.md) |
| `packages/tools/asset-registry` | [实施缺口及消费者影响](../../../../realization/packages/tools/asset-registry/design.md)；[未满足验证义务](../../../../realization/packages/tools/asset-registry/verification.md) |
| `packages/tools/mcp-bridge` | [实施缺口及消费者影响](../../../../realization/packages/tools/mcp-bridge/design.md)；[未满足验证义务](../../../../realization/packages/tools/mcp-bridge/verification.md) |

## 8. 实施次序与完成判据
实施的前置与承接顺序来自上表依赖；只有对应可实施范围内的行为进入实现，缺口路径继续受阻。
| 顺序 | 工作 | 完成判据 |
|---|---|---|
| 0 | 核对 provenance 与当前来源，定位每条要实施的路径及前提 | 规格 hash 与 frozen 一致；产品／节点快照仍匹配，或先发布新投影；待 probe 与缺口保持可见 |
| 1 | 按 catalog 依赖次序建立 core 数据与纯计算模块 | 对应 Schema、契约 verification 场景与节点类型／纯计算义务通过；不以实现替代规格 |
| 2 | 落实所需存储、时钟与窄口最小提供者 | 节点公开面、存储与装卸义务通过；只供验收的提供者按现行装配边界加载；未接入输入按契约默认失败 |
| 3 | 实现各领域能力与贡献者登记 | 每个节点 verification 列出的场景与故障注入通过；调用期解析、取消与撤除责任实测；真实与替身证据分开登记 |
| 4 | 按 apps 节点装配当前可运行子集 | 对应应用 verification 的清单结构、升级守卫、启动／撤除与跨边界场景通过；缺口路径不声称已交付 |
| 5 | 回到产品验收并登记实际证据 | 产品场景只有在真实依赖与对应前提满足时才报通过；无实现或仅替身可跑的场景保持原范围声明 |

已知实施缺口不因 G6 签署而关闭；这些步骤不发布新的产品规则、替身默认值或并行调度承诺。


本快照的行政坐标迁移依据：D-066。原投影与原输入完整保存在该决定指向的 main 快照，不提升既有验证范围。
