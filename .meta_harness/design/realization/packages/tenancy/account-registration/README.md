# account-registration

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-22 首稿，设计同日由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受为实现路径；兑现 `omne-harness-lite-design-2026-09-15 · composition.account-registration · v1`（[契约](../../../../spec/compositions/account-registration/v1/contract.md)，状态 `accepted`、已冻结，设计依据 PF-001 rev 15）
- 源码位置：`packages/tenancy/account-registration`——**尚未建包**。第二层 `tenancy` 是租户领域这个限界上下文的名字，产品负责人已拍板（[D-024](../../../../record/decisions/tenancy-domain-name/README.md)）；布局规则见[实现映射入口](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个 Cordis 插件、一条 fiber、一个服务面（候选名 `registration`），提供**两条动作链**——注册主链（[S-8](../../../../spec/compositions/account-registration/v1/contract.md#s-8-三步次序与责任交接)）与未激活到期清除链（[S-34](../../../../spec/compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)）。**它不拥有任何事实、没有存储**（[S-22](../../../../spec/compositions/account-registration/v1/contract.md#s-22-编排本链的提供者被卸载或换代)）；它拥有的是次序、失败映射与两份[交接凭证](../../../../spec/data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant)里**激活依据的产出**。C 装配草图的「薄组合」

## 分层状态

- 语义接受范围：`composition.account-registration` v1 **全部条款**（含其已知缺口作为显式缺口），依据 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md)（产品负责人，2026-09-22）；本节点的设计随同一决定被接受为实现路径。D-023 点名的 [S-34](../../../../spec/compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)／[S-25](../../../../spec/compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) 两处措辞待 v2，实施按本节点设计。接受不提升下面三层
- 可实施范围：本节点声称兑现 S-8 三步与全部分支、S-34 两步与三分类、激活依据的产出与携带、S-9 三个幂等边界在「插件体重跑」下的安全、S-12 重试规则、S-21 四种交错的收场、S-22、S-23、S-25 表左列，逐条见 [design.md](design.md#能力到-cordis-的投影)。**不兑现**：清扫提供者本身（[G-6](../../../../spec/compositions/account-registration/v1/contract.md#九已知缺口)：发起者与节奏归装配，且**候选记录的枚举没有任何读面**，见 [design.md 缺口](design.md#实施缺口与消费者影响)）、S-25 右列协议给保证、注册入口的表示层校验（归入口）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **六条**，绑到两个已登记 formal task（`account-registration-v1-{crash,progress}`；`basic` 的 `TypeOK` 自指，S-5 改由 lint 承担），前提照 [evidence run-2](../../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md) 的配置写。五条规范场景 S-27～S-31 全部「未开始」，见 [verification.md](verification.md)
- 实际验证：**尚无。**源码不存在；形式任务检查的是契约的模型，不是本节点

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 服务面、两条链在 Cordis 上怎么走、依据在单机怎么产出与核实、插件体重跑为什么安全、清扫为什么建不起来 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml) |
| 实际跑过什么、五条场景各缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
