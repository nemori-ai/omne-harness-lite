# account-identity

- kind：`provider`
- 对象与设计修订：候选节点。2026-09-22 首稿按 `capability.account-identity` v1 写（[契约](../../../../spec/capabilities/account-identity/v1/contract.md)，`accepted`、已冻结，设计依据 PF-001 rev 15），设计同日由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受为实现路径；**2026-09-23 按 v2 修订**（`omne-harness-lite-design-2026-09-15 · capability.account-identity · v2`，[契约](../../../../spec/capabilities/account-identity/v2/contract.md)，`candidate`、已登 catalog，主责产品依据 [PF-017](../../../../product/PF-017-governance-center-as-deployable-application/README.md)（rev 1）已接受，2026-09-23）。本修订只动 v2 带来的部分：出示物、S-44、S-15 的返回、S-16／S-17／S-37 的参数类型（用来认人的品牌化，S-16 的目标不）、存储形状说明，外加把已由 basis 钉住的三条待核对主张与 Cordis 采用版本（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)，4.0.4）写实。同日按架构评审意见再改三处，**均无接受依据**：S-13／S-15 的凭据比对与派生挪到写事务之前（对快照做、提交内按同一行确认，存储要求 R-8）；「不导出派生函数」只保证派生规则只此一份、不作访问控制；出示物不作诊断输出实参的静态规则（候选）
- 源码位置：`packages/tenancy/account-identity`——**骨架已建（2026-09-22），钉 v1**：`src/index.ts` 只有服务面类型：`AccountsService`／`LoginsService` 八个方法的输入、返回与**逐字对 v1 的失败联合**、config 与事件类型；`tests/types.spec-d.ts` 守 S-36 失败集合闭合，`tests/scenarios.spec.ts` 按 v1 §八列 10 条 `it.todo`。**没有插件、没有实现、没有迁移片段**。按本修订要改：`logins` 加 `exchange`、`issue` 返回 `{ presentation, loginStateId }`、导出出示物的表示层解析（候选 `parseLoginStatePresentation`，入口层用同一个）、S-16 的发起方与 S-17、S-37 的参数改为 `LoginStateId`（S-16 的目标仍是 `unknown`）、类型测试从八个方法改为九个、场景清单补 S-44、S-46、S-47——第二程。第二层 `tenancy` 是租户领域这个限界上下文的名字（[D-024](../../../../record/decisions/tenancy-domain-name/README.md)）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个 Cordis 插件、一条 fiber，提供两个服务面（候选名 `accounts`、`logins`），兑现 v2 的**全部九个操作**——含 [S-15 验证凭据并签发登录状态](../../../../spec/capabilities/account-identity/v2/contract.md#s-15-验证凭据并签发登录状态)与 v2 新增的 [S-44 按出示物换取身份](../../../../spec/capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)（候选 `logins.exchange`）。**v2 不改插件边界**：S-44 是 `logins` 上的一个方法，出示物的产生与派生是方法体内的纯计算加 Node 内置随机源。**凭据怎么派生、怎么比对、政策怎么判，本节点不拥有**：它在调用时解析 [credential-verification](../credential-verification/README.md) 的 `credentials` 服务，**但不把它列为必需依赖**——那是本节点最要紧的一处选择，理由在 [design.md](design.md#s-15-归本节点credentials-作可选依赖在调用时解析)。它是 C 装配草图的 P-A `account-facts`

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**v1 已接受，v2 无。**v1 **全部条款**（含其已知缺口作为显式缺口）依据 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md)（产品负责人，2026-09-22）；本节点 v1 的设计——S-15 归属、`credentials` 可选依赖、`expiredAt` 落盘机制——随同一决定被接受为实现路径。
  **v2 是 `candidate`**。主责需求 PF-017 rev 1 已接受（2026-09-23），v2 抬头那道「PF-017 被接受之前本版不进入接受」的门因此已开，但 v2 自己还没有接受记录；本修订里 v2 独有的部分（出示物的产生与派生、S-44、S-16 发起方与 S-17、S-37 的参数收窄、[四处选择](design.md#v2-的四处选择)）**没有任何接受依据**。
  D-023 点名的三处措辞张力（[S-39](../../../../spec/capabilities/account-identity/v1/contract.md#s-39-unactivated_retention) 两种读法、S-4「由存储生成」、S-30 第 7 行左列）v2 没有收口，本节点仍按「此后产生的记录」（定死）实现。接受不提升下面三层
- 可实施范围：本节点声称兑现 v2 全部九个操作（S-13、S-14、S-15、S-44、S-16、S-17、S-18、S-37、S-38）的九件事、[S-45](../../../../spec/capabilities/account-identity/v2/contract.md#s-45-登录状态出示物) 的产生与派生规则、S-9 的记录形状、两条静态检查（S-35、S-36）与登录状态记录的结构检查、两个政策参数（S-26 的持有与下发、S-39）、三个通知事件，以及 S-30 表十四行「装配给」里落到本节点或存储要求上的部分，逐条见 [design.md](design.md#能力到-cordis-的投影)（标「v2 差异」的是 v2 改写或新增的行）。
  钉 v1 的 organization-governance 与 account-registration 消费的条款在 v2 里判定逐字相同，同一份实现对它们也兑现 v1；**v1 S-15 的返回形状与 v1 S-17「持有即被认」的位置本节点不再兑现**，唯一受影响的消费者是入口，它已改按 v2 写。
  **不兑现**：S-21 的前提（一切交互经 S-17 或 S-44，归各入口 owner）、S-25 的另一半（其他 owner 的数据）、S-22 与 S-44 的时序侧信道（契约明列不承诺）、S-29 的另一半（运行控制，G-4）、G-1 个人 context、S-30 右列的全部协议给保证；S-30「进程外来的身份一律先过 S-44」在接收边界一侧的兑现（归入口节点，本节点只收窄签名并提出检查形式）；出示物在途与客户端一侧的保存。
  **受阻**：S-15 的返回形状 v1、v2 不兼容，按本页开包即在候选语义上实施，何时开包归主线
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **三条**，全部绑到 `composition.account-registration` 的形式任务，钉的是 **v1** 坐标 S-13／S-14／S-38——那份模型把这三条建成抽象动作；三条在 v2 里逐字相同，对 v2 的适用性写在各条前提的最后一项，**不另登 v2 坐标**（v2 未接受，组合 v1 钉 AI v1）。本契约自己不建形式工件（v1、v2 同）。
  v2 新增或改写的 S-15、S-17、S-44、S-45 没有任何已存在的证据，不绑。十条规范场景、两条静态检查、记录结构检查、熵审阅与两处故障注入全部「未开始」，见 [verification.md](verification.md)
- 实际验证：2026-09-22 骨架（钉 v1）的构建、类型检查与类型测试通过；契约场景全部 `it.todo`，**没有任何行为被验证**；v2 的部分连骨架都没有

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 插件边界、两个服务面、S-15 归谁、出示物怎么产生与派生、S-44 怎么判、S-17「只对进程内开放」怎么守、存储要什么、表长什么样、「已过留存期限」为什么是落盘的事实、装卸配对 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么、对 v2 适不适用 | [绑定表](bindings.yaml) |
| 实际跑过什么、v1 与 v2 各要什么证据、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
