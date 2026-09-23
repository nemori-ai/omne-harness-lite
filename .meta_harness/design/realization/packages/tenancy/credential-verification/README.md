# credential-verification

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-22 首稿，设计同日由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受为实现路径；兑现 `omne-harness-lite-design-2026-09-15 · capability.account-identity · v1`（状态 `accepted`、已冻结）里**凭据形式那一半**——[S-8 凭据材料](../../../../spec/capabilities/account-identity/v1/contract.md#s-8-凭据材料)的派生与比对、[S-26 `credential_policy`](../../../../spec/capabilities/account-identity/v1/contract.md#s-26-credential_policy) 的判定。**它不是那份契约的提供者**：契约的八个操作全在 [account-identity](../account-identity/README.md)，本节点只提供一个被那个节点在调用时解析的服务面（候选名 `credentials`）
- 源码位置：`packages/tenancy/credential-verification`——**骨架已建（2026-09-22）**：`src/index.ts` 只有 `CredentialsService` 四个方法的类型（`PresentedCredential`、不透明的 `CredentialMaterial`、三值 `verify`、三支 `checkPolicy`）；`tests/obligations.spec.ts` 列 5 条 `it.todo`。**没有插件、没有实现**——第二程。第二层 `tenancy` 是租户领域这个限界上下文的名字，产品负责人已拍板（[D-024](../../../../record/decisions/tenancy-domain-name/README.md)）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：[产品正文把「认证提供者的选型」列为技术选择](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#非目标)，契约据此只承诺「有一件事叫验证凭据」而不承诺拿什么验。本节点是 C 装配草图的 P-B，**本域唯一「实现会被整体替换」的地方**；它的独立存在只为一件事：换认证方式时，账号事实与组织治理都不重跑。为什么它不提供 S-15，论证在 [account-identity 的设计](../account-identity/design.md#s-15-归本节点credentials-作可选依赖在调用时解析)

## 分层状态

- 语义接受范围：`capability.account-identity` v1 里本节点兑现的 [S-8](../../../../spec/capabilities/account-identity/v1/contract.md#s-8-凭据材料) 第 1 条与 [S-26](../../../../spec/capabilities/account-identity/v1/contract.md#s-26-credential_policy)，依据 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md)（产品负责人，2026-09-22）；本节点的设计（密码方案、可整体替换的 `credentials` 服务面）随同一决定被接受为实现路径；入口契约 S-19 把凭据解析规则的发布处定在本节点，随 [D-028](../../../../record/decisions/governance-center-design-acceptance/decision.md) 接受（2026-09-23）。接受不提升下面三层
- 可实施范围：本节点声称兑现 S-8 的第 1 条（材料不以可读形式保存——**派生函数**保证）、S-8 的「比对方式属实现选择」、S-26 的判定与形状。**不兑现**：S-8 的第 2、3 条（材料只在两处被读、读面不含它——那是 account-identity 的数据形状）、S-15 的任何一件事、S-13 的任何一层。本版**只有一个候选实现：密码**；OIDC／passkey 是本节点存在的理由但**没有设计**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 空表。证据义务见 [verification.md](verification.md)
- 实际验证：2026-09-22 骨架的构建、类型检查与类型测试通过；契约场景全部 `it.todo`，**没有任何行为被验证**

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 服务面长什么样、密码实现怎么做、换代时谁受影响 | [实现设计](design.md) |
| 证据 | [绑定表](bindings.yaml)（空）、[验证](verification.md) |

状态变化由实际事件驱动；契约语义变化回 [spec](../../../../spec/README.md)。
