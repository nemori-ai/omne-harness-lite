# TG-01 个人租户创建规范场景

本页是 `capability.tenant-governance@1` 的候选验收输入，不是已运行测试。init 与 signup 共用 F→T/C→单目标流状态机；额外的首账号准入归 AI-08。

| 场景 | 必须观察到的 Tenant 结果 |
|---|---|
| TG-P01 首次部署 | Account 与 Tenant 根均权威核实为空；受信 init 取得初始 A、唯一凭据绑定和 F 后，Tenant 重算 target，T 在目标 tenant-scope 流空前态一次提交 personal tenant/唯一 active owner；本代可消费后才可激活。文件缺失或未恢复不算空根。 |
| TG-P02 后续账号 | 首账号 active 且部署建立后，signup F 走同一 T/C 与一条目标流；无需其他 system stream，完整发布后给同绑定可消费证明。 |
| TG-P03 来源互冒 | 客户端 origin/owner/operationKind、旧 session、seed 字符串、仅有 UserRef、未发行 F 的 pending 或凭据冲突均不能获得新逻辑位置。 |
| TG-P04 Account 暂失与换代 | 未完成当代受信 F 读取时保持 pending；本代读完冻结 F 后 Account 实例暂失不撤销准备。host/owner/writer 换代须重读同一 F，旧准备不可提交。 |
| TG-P05 同 T 重入 | 同 T/C 先认回原占位或结果；可核实占位或 outcome 下同 T 异 C、异 F 或异 target 冲突，不重跑首建前态。 |
| TG-P06 两 F 同 UserRef | 两个不同 F 得不同 T 但同 target；第一 T 仅预留时第二 T 查询 `target_occupied_pending`，第一 T 耐久创建后第二 T 查询终局 `personal_target_conflict`，同 T 重试认回阻断，不能以现有 tenant 认作自己的成功。 |
| TG-P07 不同 UserRef | 不同 UserRef 注入式映到不同目标流；两者可独立提交，不因同一 OS 用户或磁盘根争一份全局索引。 |
| TG-P08 F 同 ref 异内容 | 受信服务对相同 sourceRef 返回不同字段，Tenant 封闭创建并报完整性错误；不能换 T 或 target。 |
| TG-P09 逻辑先于耐久 | T 占位封闭目标竞争，但 pending owner、管理资格和 ACR 激活证明不可消费；完整耐久及全 owner publication 后才开放。 |
| TG-P10 sync unknown／回执丢失 | 原 T/C/target 占位保留；暂时 not_seen 不授权第二批。独占完整前缀核实 committed 则认回，否则继续 unknown。 |
| TG-P11 安全未提交 | 旧 writer 完整前缀证明 T 未提交且占位安全解除后，仅同 T/C/target 重备；不虚构永久异输入冲突。 |
| TG-P12 publication blocked | 原 completion 保持 committed_blocked；新代全 owner 基线覆盖原位置后另给可消费证明，不重提批次或改历史结果。 |
| TG-P13 错配恢复 | 单目标流错来源、错 T/C、错 user/target/creator/owner、第二有效 owner、撕裂或坏前缀均拒绝 ready。 |
| TG-P14 历史与当前资格 | 原 T 已提交、租户后来 closing/closed 时，只认回历史结果；当前业务拒绝，旧回执不恢复权限。 |
| TG-P15 owner 管理守卫 | 个人 owner 创建 ready 而账号仍 pending 时 close/管理请求拒绝且不占后来位置；active 后新请求才可排位。异账号、seed/系统标签、缺当前证明、普通成员操作移除唯一 owner 均拒绝。 |
