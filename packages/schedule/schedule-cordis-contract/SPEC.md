# @omne-harness/schedule-cordis-contract 行为边界

## 范围与依据

本成员承担Cordis 服务定义。唯一 Service 定义、服务键与 Context 类型增补。服务方法消费纯契约，不引入业务实现或本地后端。 安装边界归[包组织](../../../docs/package-organization.md#日历与日程的安装和部署边界)，业务目标沿[现有 SPEC](../schedule/SPEC.md)。本文件约束已实现绑定；其余目标接口不因此成为已有实现。

## 必要约束

公开服务消费不要求与 Session 或 Agent runtime 同机、同进程或同数据库。命令接受、业务完成、结果交付分别观察；超时和断连不能推断为未接受。原操作身份、查询、幂等及 unknown 的细化随契约实现交付。

跨子系统不得以共享事务参加者、内存锁或对象引用作为公共协议前提。本地持久化可以在自己的事务域内使用参加者。涉及外部当前资格或版本的强保证必须由具名协议兑现；实现不支持时明确拒绝，不能用旧快照放行。

## 已实现绑定与验证

根入口保持空，`./cordis`定义ScheduleCommandsService和ScheduleQueriesService，分别提供唯一scheduleCommands和scheduleQueries键及Context类型。提供者继承定义，方法签名直接消费纯契约。inject不授予业务权限，也不提供跨进程传输。

本包不启动后台任务、不持有存储或计算资源，也不注册工具。Job及Subscriptions绑定尚未实现。编译与类型检查验证接口一致性；生产提供者与工具的实际装配须另行验证。
