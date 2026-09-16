# 三个真实候选与取舍

## 共同约束

三个路径都保留 [D-016](../../decisions/account-identity/decision.md) 的 Account/Tenant 权威分离，兑现 [PF-026.C1/C3/C5](../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、[AI-02](../../spec/capabilities/account-identity/v1/contract.md)、[ACR-03～06](../../spec/compositions/account-registration/v1/contract.md) 的唯一个人范围、可辨结果和激活屏障。Tenant 新租户流属于目标租户；DR/CC 的跨 system/tenant 写入必须是受限同批，不能改记 system owner，也不能先写索引再补成员。

## 候选 A：双入口、双窄许可

沿当前 HUB 的 [TG-01](../../spec/capabilities/tenant-governance/v1/contract.md) bootstrap 三流规则，另接待整合增量 `b47cd0e` 的 TG-01a 后续二流候选；分别颁发 DR/CC 精确许可并定义 target/conflict 与恢复关系。实现可复用同一个 codec 或测试夹具，不能断言必然有两套；但两种许可与结果协议若独立演进，同一 claim、target、unknown、publication 性质会增加分歧和重复维护风险。后续许可未发布时明确拒绝。Account 历史 pending 事实与当前推进许可的门内关系、ACR 跨 owner 恢复仍必须解决。证据状态：只有候选文字，无真实后续 provider 或故障实验。

## 候选 B：统一 global personal-index（推荐）

Tenant 使用一套 personal creation 状态机，沿现有 system `tenant-personal-index` CAS 与目标 tenant 流同批；`init` 同批追加 bootstrap 流。一个封闭的 DR/CC 许可按受信来源限定二/三流，一套 target/conflict outcome、lookup 和 CC-06 恢复规则。它最大限度复用现有索引/租户流语义，减少协议分歧。代价是不同账号共用 global index CAS，且来源凭据、注册原操作耐久事实、当前推进许可和严格 codec 必须正确实现。单机 writer 本已串行，目前没有索引成为瓶颈的测量。证据状态：结构建议，未接受、未实现；**当前推进许可在 CC 排位门内的语义未闭合，阻断实施。**

## 候选 C：按 `UserRef` 分区的 claim stream

Tenant 对每个可信 `UserRef` 使用确定 system `personal-claim:<userId>`，与目标 tenant 流同批；`init` 另带 bootstrap 流。不同账号在 claim 上独立 CAS，未来分区 writer 更易扩展，同时可共用创建状态机。然而它改变现有唯一索引结构，增加 stream/head/replay 资源；所有入口和恢复必须证明按可信 `UserRef` 推导同一个 claim stream，且目标 tenantId 冲突另由目标流 CAS 保证。当前单机无吞吐证据，复杂度没有对应收益。Account 当前推进许可门内语义和 CC-06 全 owner 恢复仍需实现。证据状态：可实施的结构候选，未做性能/故障验证。

## 推荐和改变选择的证据

推荐 B：它满足同一唯一性/耐久/恢复性质，保留已有 global index 与 tenant stream 归属，所需新机制集中于来源证明、统一受限许可和统一 outcome。若真实测量证明 global index 是瓶颈或出现明确分区部署要求，再比较 C。若统一严格 codec/来源凭据无法可靠实现而双窄许可可验证，重新考虑 A；不能以“已有 bootstrap 代码”本身当作正确性证据。

用户授权重构旧候选，不代表已接受 B；[评审记录](review.md)和后续接受决定必须分开。任何选择均不得绕过 Account 原操作耐久事实、待定义的当前推进许可、CC-06 恢复基线或 ACR 激活证明。
