# offer-expiry

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-22 首稿；兑现 `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`（[契约](../../../../spec/data/offer-expiry/v1/contract.md)，状态 `candidate`）
- 源码位置：`packages/core/offer-expiry`——**尚未建包**。归 `core`：它兑现一份 `data.*` 契约，消费者跨两个领域（租户领域的邀请与隶属请求、资产领域的复制通知与分享邀请），[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**。契约拥有的是[一条判定式、两个时刻值、一组派生状态与求值时点](../../../../spec/data/offer-expiry/v1/contract.md#s-1-本契约拥有什么)——没有操作、没有提交点、没有自己的存储。它给消费者三样：`OfferTiming` 的构造与校验（[S-4](../../../../spec/data/offer-expiry/v1/contract.md#s-4-offertiming)／[S-14](../../../../spec/data/offer-expiry/v1/contract.md#s-14-offer_ttl)）、派生状态的纯求值函数（[S-7](../../../../spec/data/offer-expiry/v1/contract.md#s-7-派生状态)／[S-8](../../../../spec/data/offer-expiry/v1/contract.md#s-8-判定式)／[S-20](../../../../spec/data/offer-expiry/v1/contract.md#s-20-不可用--不存在)）、时间源接口的**形状**（[S-16](../../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源)）。**求值发生在哪一次提交里（S-10）、存在性读面是谁（S-19）、失败值叫什么（S-13／S-14）——这些都在消费者节点**，本版即 [organization-governance](../../tenancy/organization-governance/README.md)

## 分层状态

- 语义接受范围：**无。**契约 `candidate`，[`record/decisions/`](../../../../record/decisions/README.md) 无接受记录
- 可实施范围：本节点声称兑现的条款逐条见 [design.md「能力到 Cordis 的投影」](design.md#能力到-cordis-的投影)——值与形状（S-4、S-7、S-22）、判定式与求值次序（S-8 的两个方向、S-9 的「读时求值」那一半）、三值存在性与不可用传播（S-20）、`offer_ttl` 的两路校验（S-14）。**不兑现**：S-5 的「同一提交内定死」与 S-10 的「同一提交内重求值」（提交点在消费者）、S-16 的「同源」与 S-17 的五行装配给保证（本节点只定接口形状，选型与兑现归装配）、S-18 后台清理（不在本节点，落点 #9）、S-19 存在性读面（归持有对象的契约）、四条规范场景（消费者跑）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 为**空表**——本契约不建形式工件，也没有已存在的测试。证据义务见 [verification.md](verification.md)，全部「未开始」
- 实际验证：**尚无。**源码不存在

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 公开面是什么、判定函数怎么拿输入、时间源与存在性读面怎么进来 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（当前为空） |
| 实际跑过什么、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
