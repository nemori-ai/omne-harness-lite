# 注册组合规范场景

下列是候选 AC-R 组合契约的验收输入，尚无实际测试通过证据。

| 场景 | 必须观察到的结果 |
|---|---|
| ACR-S01 正常后续注册 | 同一注册操作得到稳定 `UserRef`；Tenant 耐久发布该账号唯一 personal tenant/owner 成员；账号随后 active；成功回执含可核实同一目标。 |
| ACR-S02 两账号同一现实持有人 | 两个请求均获自助注册准入、没有认证标识冲突且分别完成注册时，不同原操作产生不同 `UserRef` 和个人租户；不以本地 OS 用户、邮箱相似或同一 CLI 目录合并数据、设置、权限、额度。 |
| ACR-S03 账号已 pending、Tenant 未提交时宕机 | 重启认回同一 `UserRef`/target；pending 不可做个人业务；原操作可继续，不能另建账号或租户。 |
| ACR-S04 Tenant 写入/回执 unknown | 保留占位与稳定目标；暂时 `not_seen` 不准换目标；核实 committed 则认回，核实未提交且安全解除占位才同操作重试。 |
| ACR-S05 Tenant durable 但激活回执丢失 | 从权威 claim/成员及账号状态恢复；原操作最终返回同一 active 目标，不生成第二租户。 |
| ACR-S05a Tenant 已 committed 但 owner publication 失败 | 原 completion 长期 blocked，账号仍 pending；只由受信恢复宿主安装全 owner 基线，新代查询确认原位置可消费后才激活，不重发 Tenant 批次。 |
| ACR-S06 相同键异摘要及并发竞争 | 不得把另一输入认作原注册；同用户唯一 claim 不能产生第二个有效个人租户。 |
| ACR-S07 逻辑发布早于 durable | pending 个人成员与正向资格不得供业务准入，注册也不能报告成功。 |
| ACR-S08 切换账号与目标组织 | 新交互按当前受信账号及所选租户/资源范围检查；旧账号缓存、另一账号成员资格和组织额度不跨范围继承。 |
| ACR-S09 已注册后个人租户关闭，再重试原注册操作 | 认回原历史完成事实且不另建个人租户；当前业务准入仍按 Tenant closing/closed 拒绝，历史成功回执不是当前访问许可。 |
