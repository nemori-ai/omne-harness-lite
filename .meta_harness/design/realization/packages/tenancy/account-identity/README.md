# account-identity

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-22 首稿，设计同日由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受为实现路径；兑现 `omne-harness-lite-design-2026-09-15 · capability.account-identity · v1`（[契约](../../../../spec/capabilities/account-identity/v1/contract.md)，状态 `accepted`、已冻结，设计依据 PF-001 rev 15）
- 源码位置：`packages/tenancy/account-identity`——**尚未建包**。第二层 `tenancy` 是租户领域这个限界上下文的候选名，产品负责人未拍板；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个 Cordis 插件、一条 fiber，提供两个服务面（候选名 `accounts`、`logins`），兑现契约的**全部八个操作**——含 [S-15 验证凭据并签发登录状态](../../../../spec/capabilities/account-identity/v1/contract.md#s-15-验证凭据并签发登录状态)。**凭据怎么派生、怎么比对、政策怎么判，本节点不拥有**：它在调用时解析 [credential-verification](../credential-verification/README.md) 的 `credentials` 服务，**但不把它列为必需依赖**——那是本节点最要紧的一处选择，理由在 [design.md](design.md#s-15-归本节点credentials-作可选依赖在调用时解析)。它是 C 装配草图的 P-A `account-facts`

## 分层状态

- 语义接受范围：`capability.account-identity` v1 **全部条款**（含其已知缺口作为显式缺口），依据 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md)（产品负责人，2026-09-22）；本节点的设计——含 S-15 归属、`credentials` 可选依赖、`expiredAt` 落盘机制——随同一决定被接受为实现路径。D-023 点名的 [S-39](../../../../spec/capabilities/account-identity/v1/contract.md#s-39-unactivated_retention) 两种读法待 v2 收口，本节点按「此后产生的记录」实现。接受不提升下面三层
- 可实施范围：本节点声称兑现契约全部八个操作（S-13、S-14、S-15、S-16、S-17、S-18、S-37、S-38）的九件事、两条静态检查（S-35、S-36）、两个政策参数（S-26 的持有与下发、S-39）、三个通知事件，以及 S-30 表左列九行「装配给」里落到本节点或存储要求上的部分，逐条见 [design.md](design.md#能力到-cordis-的投影)。**不兑现**：S-21 的前提（一切交互经 S-17，归各入口 owner）、S-25 的另一半（其他 owner 的数据）、S-22 的时序侧信道（契约明列不承诺）、S-29 的另一半（运行控制，G-4）、G-1 个人 context、S-30 右列的全部协议给保证
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **三条**，全部绑到 `composition.account-registration` 的形式任务——那份模型把本契约的 S-13／S-14／S-38 建成抽象动作，绑定的前提逐条写明；**本契约自己不建形式工件**。八条规范场景与两条静态检查全部「未开始」，见 [verification.md](verification.md)
- 实际验证：**尚无。**源码不存在

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 插件边界、两个服务面、S-15 归谁、存储要什么、「已过留存期限」为什么是落盘的事实、装卸配对 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml) |
| 实际跑过什么、八条场景各缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
