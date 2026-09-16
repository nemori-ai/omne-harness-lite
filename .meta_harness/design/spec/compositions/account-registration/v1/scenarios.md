# 账号建立组合规范场景

这些是候选 ACR 的验收输入，不是已运行测试。

| 场景 | 必须观察到的结果 |
|---|---|
| ACR-S01 受信 init | 已核实空 Account/Tenant 根与本代独占 init 资格；A pending、凭据唯一绑定、F、T 单目标流提交、本代 owner publication、Account active、部署建立依序可核实；这之前 signup 不开放。 |
| ACR-S02 后续 signup | 已建立部署内的自助请求经校验，Account 形成 F；Tenant 从受信服务读 F，T/C 单流创建 owner；Account active 可再读后才报成功。注册自身不建组织成员。 |
| ACR-S03 init unknown | init A/pending 已耐久但凭据或 T unknown；同 A/F/T 核实恢复，不释放首账号位置，不另建 UserRef 或 target。 |
| ACR-S04 未发行 F | pending 已建但唯一凭据绑定未确认、标识冲突或来源服务不可达；Tenant 不准入，不从 DTO、seed、账号字符串或缓存补 F。 |
| ACR-S05 当前代读取 | Tenant 在当前代读完整 F 后 Account 暂离线，原准备可继续；host/owner/writer 换代使旧准备失效，新代重读同 F。F 同 ref 异内容封闭。 |
| ACR-S06 两 F 同 UserRef | 第二 F 的 T 不同但 target 相同；第二 T 明确冲突，不能把第一 T 结果认作自身成功。 |
| ACR-S07 不同 UserRef | 两个获准账号各得独立目标租户流和 owner；物理目录、OS 用户或同一现实持有人不合并身份、设置、额度。 |
| ACR-S08 T unknown | 保留原 T/C/target，暂时 not_seen 不证明未提交；完整前缀核实后认回或在安全释放占位后同 T/C 重备。 |
| ACR-S09 committed blocked | Tenant 已持久但 owner publication 失败，Account 仍 pending；新代全 owner 基线使原位置可消费后再激活，不重发 T。 |
| ACR-S10 激活 unknown | Tenant ready、Account 激活回执丢失；沿原 A/F/T 和账号状态认回，不能生成第二租户或提前报成功。 |
| ACR-S11 历史与当前 | 注册完成后个人租户关闭，原 A 只认回历史成功；当前业务按 Tenant closing/closed 拒绝。 |
| ACR-S12 范围隔离 | 切换账号/组织后，新交互重核当前会话、目标成员和资源 owner；旧账号缓存、组织额度不继承。 |
