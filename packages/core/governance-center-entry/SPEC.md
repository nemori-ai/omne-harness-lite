# 治理入口公共集成承诺

本包拥有两张治理网络面共用的准入信号。采用依据为[身份集成设计](../../../.meta_harness/design/architecture/identity-integration/retirement.md#开闸的代际约束)及其链接的接受决定。

- 每个装配代际只有一个实例。`isOpen()` 直接求值为本代确认完成且 lifetime 仍 current，不依赖通知缓存。
- `wait()` 只在全部资源就绪、升级守卫确认完成且仍 current 后兑现。停止时尚未兑现的等待，以及停止后的新等待，以 `EntryOpeningStopped` 拒绝。
- 已兑现的 Promise 不会撤回。两张网络面必须在新请求准入处直接检查 `isOpen()`；运维操作开始前也复验共同开放条件。停止不取消已接纳工作。
- 宿主拥有实现、拒绝观察及代际生命周期。`./cordis` 的 `EntryOpening` 只绑定服务键，不拥有确认或关闭控制权。

## 维护资源和通知

EntryMaintenanceResources 由宿主提供同一次启动的 snapshotChecks 与完成回调。
ops 必需注入 entryMaintenance，已经开始的维护等待真实收场，完成通知不能代替等待责任。
资源对象不得放入序列化配置，宿主保持它们直到整代 closed 后再核对。

四个通知名及 ServingNotice 由本包纯根拥有，Events 增补只在 ./cordis。
入口开放时发 serving-started；运维监听重新就绪时，已开放入口重发。
停止准入时发 serving-stopped；每次缺陷观察发 defect-observed；
运维监听安装完成后发 ops-listening-started。通知是同步 emit，失败只记诊断，
不改变已提交业务结果或丢失清理责任。迁移保留原载荷、次数和时序。

采用依据为[树资源协议](../../../.meta_harness/design/architecture/identity-integration/plugin-tree.md#运行资源的唯一拥有者)
与[宿主接口补充](../../../.meta_harness/design/architecture/identity-integration/host-integration.md)。
本包不接替未迁 EC3/HT3 业务规则、线上协议及存储算法；提供者接入和实际验证仍由 T4 交付承担。
