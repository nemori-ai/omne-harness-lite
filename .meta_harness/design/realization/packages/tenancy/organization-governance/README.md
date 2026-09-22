# organization-governance

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-22 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`（[契约](../../../../spec/capabilities/organization-governance/v1/contract.md)，状态 `candidate`，设计依据 PF-001 rev 15）
- 源码位置：`packages/tenancy/organization-governance`——**尚未建包**。第二层 `tenancy` 是租户领域这个限界上下文的候选名，产品负责人未拍板；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个 Cordis 插件、一条 fiber，提供四个服务面（候选名 `organizations`、`memberships`、`offers`、`organization-purge`），兑现契约**全部 25 个操作**。内部三组（隶属、成员、邀约）本版不拆——「创建组织」一次提交同时产生组织行、成员记录与首位超管，接受邀请一次提交写成员记录与邀请终结记录，内核不提供跨 fiber 事务（理由在 [design.md](design.md#实现路径与来源)）。**第四个服务面是本节点新加的**：[S-53](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 没有授权前置，契约把「只由清除链调用」记为装配给（[S-42 第 4 行](../../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)）；把它放在一个**只有 [account-registration](../account-registration/README.md) inject 的服务名**上，是这条装配保证在 Cordis 上能落到的最具体形状，理由在 [design.md](design.md#s-53-单独一个服务名只给清除链)

## 分层状态

- 语义接受范围：**无。**契约 `candidate`，[`record/decisions/`](../../../../record/decisions/README.md) 无接受记录
- 可实施范围：本节点声称兑现 25 个操作的九件事、四条贯穿规矩（S-15～S-18）、S-14 五条（含 ⑤ 残留清扫的**方法**，触发与节奏归装配 G-13）、五个通知事件、S-42 表左列九行里落到本节点或存储要求上的部分，逐条见 [design.md](design.md#能力到-cordis-的投影)。**不兑现**：S-42 右列全部协议给保证；S-38 的「不可达」（资产 owner）；S-49／S-50 的另一半（资产、会话契约尚无）；G-1 会话级层身份；G-2 组织消失的事件源（契约禁止预埋）；G-3 计量；G-6 运行控制
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **三条**，绑到 `formal:organization-governance-v1-membership`（S-17／S-28／S-29 的序列化不变量；S-39 不绑——模型没有在它被违反时会失败的断言）。Alloy 模型**未登记为 formal task**（退出码归 tooling 的缺口），不可绑；规范场景 S-46～S-54 全部「未开始」，见 [verification.md](verification.md)
- 实际验证：**尚无。**源码不存在

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 四个服务面、跨 owner 的「同一提交」为什么落在账号行的事实与引用约束上、序列化落到存储的什么要求、S-53 怎么只给清除链、装卸配对 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml) |
| 实际跑过什么、九条场景各缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
