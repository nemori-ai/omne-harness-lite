# TG-01 统一个人租户创建规范场景

本页是 `capability.tenant-governance@1` 的候选验收输入，不是已运行的测试或已接受规格。
两个受信入口共用 personal-index claim、提交、操作认回与恢复状态机；它们各自的首次
准入前态不同。[ACR-03～06](../../../compositions/account-registration/v1/contract.md)
仍拥有跨 Account/Tenant 的激活结果。

| 场景 | 必须观察到的 Tenant 结果 |
|---|---|
| TG-P01 首次部署 | Tenant 权威未建立且 seed/独占初始化资格可核实；global personal-index、新 personal tenant/唯一 active owner 与 `tenant-bootstrap` 三流同批耐久，可消费后才开放 owner。 |
| TG-P02 后续账号 | Account 已耐久确认凭据标识唯一绑定、`UserRef`、原操作/摘要和 target 的单操作授权后果，CC-05 已核实并耐久导入；personal-index 与目标 tenant 二流同批，**不**追加 bootstrap，完整发布后给同绑定可消费证明。 |
| TG-P03 来源互冒 | 客户端 origin/owner/operationKind、旧 session、仅有 `UserRef`、较早 pending 分配或凭据碰撞，均不能取得新逻辑位置；init 凭据不能写注册二流，注册后果不能写 init 三流。 |
| TG-P04 来源暂失 | 授权后果未核实或未耐久导入时新创建 unavailable/unknown；已导入后 Account 暂时失联、入口关闭、logout 或账号转 active 不撤销原后果，但本身不授业务访问。旧 provider generation 不取得新代写权。 |
| TG-P05 同操作重入与异输入 | 同键同摘要/user/target/来源先认回同一历史占位或结果，即使部署已初始化或账号 active；可核实占位/耐久 outcome 下同键异摘要/user/target/来源冲突，不换目标。 |
| TG-P06 唯一竞争 | 两个新操作争同一 user personal claim 或目标 tenantId，仅一份占用逻辑位置；不同账号各自获准时获得不同 personal tenant 与 owner，不因同一现实持有人合并。 |
| TG-P07 逻辑先于耐久 | 占位封闭竞争，但 pending owner/member、管理资格和 ACR 激活证明不可消费；仅完整耐久前缀和全部 owner publication 后开放。 |
| TG-P08 sync unknown / 回执丢失 | 原操作/target/claim 占位保留；暂时 `not_seen` 不授权第二批或新 target。独占完整前缀核实 committed 则认回；无法核实继续 unknown。 |
| TG-P09 安全未提交 | 旧 writer 隔离且完整前缀证明未提交、全部占位安全解除后，只允许同操作/输入/target 重备；没有耐久 tombstone 时不声称已释放输入永久冲突。 |
| TG-P10 publication blocked | 原 completion 为 `committed_blocked`，不开放 owner 或激活证明、不重发批次；新代全 owner 基线覆盖原位置后，本代查询另给可消费证明，历史 completion 不改写。 |
| TG-P11 错配恢复 | 二/三流错批、错来源、错 user/target/creator/owner、第二有效 owner、重复 claim、撕裂或坏前缀均拒绝 ready；每条 stream 单独 decoder 成功不够。 |
| TG-P12 历史与当前资格 | 原创建后租户 closing/closed，同操作只认回历史提交；当前业务拒绝，旧回执不恢复权限。关闭后不同新操作再建个人范围首版不开放，未来政策未决。 |
| TG-P13 注册成功时默认范围 | 本创建只产生一份 personal tenant/唯一 owner，不产生组织成员；pending 账号并发组织入会不得生效，ACR 激活时核该账号恰有这份 personal。激活后显式获准加入组织可增加目标租户。 |
