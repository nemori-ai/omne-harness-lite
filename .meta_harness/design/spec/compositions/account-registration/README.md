# 账号注册的组合责任

一次注册从入口走到稳定点的**整体责任**：账号这一半与个人组织那一半分属两个不同的 owner，
而产品把「注册成功」定义成两者同时成立。本契约拥有把它们接起来的那条动作链——
三步的次序与幂等边界、唯一提交点的位置、终结结果集合，以及**中途停在任何位置时系统里留下什么**。

**以及那条链没走完时留下的东西最后怎么办。**
[未激活的记录有留存期限](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)，
到期要清除记录并释放登录标识——**这件事同样跨两个 owner**，因此是本契约的
[第二条动作链](v1/contract.md#s-34-第二条动作链未激活到期清除)。

**为什么它不能归任一单项能力**：账号的事实归
[`capability.account-identity`](../../capabilities/README.md)，个人组织与首个租户归
[`capability.organization-governance`](../../capabilities/README.md)，两者各有自己的提交边界；
而内核不提供跨边界的原子提交。没有任何一个单项能力能在自己的提交边界里同时兑现两者。

本契约的做法不是去造一个跨边界事务，而是**把要求改写掉**：让
[激活成为唯一提交点](v1/contract.md#s-10-激活是唯一提交点)、让它之前的每一步都可以安全重跑。
于是「有账号但没有个人空间」这种状态在可观察面上不存在。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, composition.account-registration, 1)`
- **状态**：`accepted`，资源已冻结——D-023（产品负责人，2026-09-22）接受 v1 全部条款，含[已知缺口](v1/contract.md#九已知缺口)作为显式缺口；**此后语义改动发布 v2，不原地改 v1**（D-023 已点名的措辞张力：[S-34](v1/contract.md#s-34-第二条动作链未激活到期清除) 崩溃后回来的两步、[S-25](v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) 第 1 行，都等 v2）。接受不表示已实现或已验证
- **catalog 映射**：**已登记并接受**（2026-09-22，状态 `accepted`，`acceptance` 指向 D-023 的 `acceptance.json`）。`family=compositions`、`topic=account-registration`、
  `contract_path=spec/compositions/account-registration/v1/contract.md`；
  `resources` 另含 `v1/formal/Registration.tla`、`v1/formal/basic.cfg`、`v1/formal/crash.cfg`、`v1/formal/progress.cfg` 与 `v1/formal/README.md`
  （导航页随接受一并登记为资源，版本目录整体冻结）；
  依赖三项——`omne-harness-lite-design-2026-09-15 · capability.account-identity · v1`
  （clauses `S-13`／`S-14`／`S-18`／`S-19`／`S-30`／`S-38`／`S-39`／`S-41`／`S-42`／`S-43`——`S-30` 是评审轮四按「实质消费」补登，
  **后三条是评审轮三按「引用即消费」补上的**：[formal 包](v1/formal/README.md#本版本选用什么)与[验证入口](verification.md#证据义务)以坐标引用那三条场景作本契约证据的落点；catalog 由主线同步）、
  `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`
  （clauses `S-20`／`S-53`）与
  `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`
  （clauses `S-1`／`S-2`／`S-33`／`S-35`，`S-33` 评审轮四补登），三份都取自 [S-2](v1/contract.md#s-2-参与方与精确承诺)与抬头的「精确语义依赖」。
  **[缺口 G-4](v1/contract.md#九已知缺口) 关的就是这一条登记，它已经闭合**（契约正文那一格也已改过）。
  **第三条依赖项与 `#S-19`／`#S-39` 两个 clause 是评审轮二补齐的，[G-7](v1/contract.md#九已知缺口) 就此闭合**；
  `#S-41`／`#S-42`／`#S-43` 三个 clause 是评审轮三补上的（catalog 那一侧由主线同步）；
  `covers.json` 的 `acceptance.md#三判据` 那一行曾缺 `S-12`／`S-34`，评审轮二后已由主线补登记。
  六项资源的 SHA-256 已登记在 [`frozen.json`](../../../registry/README.md)；两份参与方契约与本契约同批接受（D-023）。
  **本包入口原先写的 `family=composition` 是笔误**：检查器只接受
  `data` / `capabilities` / `compositions` 三个值，且 `family` 要与路径段一致
- **formal-tasks 映射**：**三项已全部登记**（2026-09-22）——
  `account-registration-v1-basic`、`account-registration-v1-crash`、`account-registration-v1-progress`，
  模型入口 `v1/formal/Registration.tla`，配置分别为 `basic.cfg` / `crash.cfg` / `progress.cfg`。
  三项已实际执行过两次，
  **当前模型的结论以第二次为准，三个配置全部无反例**；
  第一次跑的是评审轮一改写之前的模型
  （`Activate` 的守卫、`warrant` 变量与 `progress.cfg` 的 `Expiring` 取值都变了），
  **那次的结论不再适用**。**变异与有效性核对仍未登记**，见[验证入口](verification.md)
- **提供者/装配映射**：[`realization/packages/tenancy/account-registration`](../../../realization/packages/tenancy/account-registration/README.md)（薄插件、两条动作链；清扫提供者因缺枚举读面本版建不起来）；设计已随 D-023 接受，源码尚未建包

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。它拥有的是**跨两个能力的整体性质与责任交接**，不是任一方的操作语义 |
| 为什么进 compositions 而不是 capabilities | 「注册成功 = 账号可用 ∧ 个人组织存在」这条整体性质，两个参与方**各自都不可能**承诺；而它也不只是把依赖汇总起来——次序、幂等边界与提交点位置是本契约自己的条款 |
| 稳定身份 | `composition.account-registration`，版本 1 |
| 适用范围 | 一次注册尝试，从发起者提交标识与凭据起，到他收到[四个终结结果](v1/contract.md#s-5-终结结果集合)之一为止。**登录不在范围内**；**准入判定与限流不在范围内** |
| 参与方与版本 | 见 [S-2](v1/contract.md#s-2-参与方与精确承诺)。两份参与方契约**已成稿，消费条款号已填**，catalog 也已登记；三份都还是 `candidate`。**对 `data.identity-values` v1 的依赖登记已于评审轮二补上**（[缺口 G-7](v1/contract.md#九已知缺口) 闭合） |
| 保护者是否明确 | 是。每一步的保护点逐条写在[完整动作链](v1/contract.md#s-8-三步次序与责任交接)里，唯一提交点在 ③ |
| 失败后的接续责任是否明确 | 是。[S-11](v1/contract.md#s-11-失败停在哪) 给三个稳定状态，[S-12](v1/contract.md#s-12-重试规则) 给重试规则 |
| 接受状态 | 已接受：D-023，2026-09-22；catalog `acceptance` 指向该包的 `acceptance.json` |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 动作链怎么走、失败停在哪、谁接续 | [S-8 完整动作链](v1/contract.md#s-8-三步次序与责任交接) |
| 中途中断后用同一个名字重来会怎样 | [S-12 重试规则](v1/contract.md#s-12-重试规则) |
| 哪些保证是单机装配给的，跨进程后谁重新兑现 | [S-25](v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) |
| 条款怎么映射到形式模型，三个配置各检查什么 | [formal 包](v1/formal/README.md) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |
| 哪些东西还没定，谁来定 | [已知缺口](v1/contract.md#九已知缺口) |

## 版本包

`v1/` 是本契约的候选版本目录，包含 [`contract.md`](v1/contract.md) 与 [`formal/`](v1/formal/README.md)。

**本包建 `formal/`，理由是义务被触发了，不是因为模板里有这一格。**
本契约以「唯一提交点 + 幂等重试」这条自定义协议为依据**省略了跨边界的原子提交**，
按组合性质的门槛，依赖某性质省略或放宽控制必须给出行为模型与关键性质检查。
模型、三个检查配置与条款映射都在 `formal/`，**执行结果不在那里**——它在[验证入口](verification.md)。

**本包不建 Schema。**本契约不拥有任何交换或存储的数据形状；它拥有的是次序与责任。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[组合契约](../README.md)。

## v2 候选

[v2](v2/contract.md)对齐AI3/OG2普通注册清除面及提交未确认语义，保持独立链；未接受，旧采用不自动升级。

2026-09-25，D043接受[v2](v2/contract.md)，旧消费者不自动升级。
