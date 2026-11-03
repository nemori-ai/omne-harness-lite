# @omne-harness/schedule-local 行为边界

## 范围与依据

本成员实现可终止规则计算、日程管理SQL后端及本地应用/Cordis装配。领域决定复用schedule核心，跨域交接只消费公开协议。安装边界归[包组织](../../../docs/package-organization.md#日历与日程的安装和部署边界)，业务目标归[Schedule SPEC](../schedule/SPEC.md)。恢复扫描和Job执行尚未实现。

## 应用组合与生命周期

本地应用组合管理、预测和查询，共用同一SQL后端及具名依赖。history、当前授权、配额、环境与日历必须显式提供，缺失不能伪装为空事实。工厂拥有计算worker，借用SqlStorage，宿主负责材料登记和存储退出。

close先同步拒绝新调用，再等待已接受调用真实结束及worker退出。旧命令引用返回rejected，旧查询引用返回error，错误码为dependency_blocked。重复close返回同一Promise。未结束调用使close保持待定，不能据卸载推断写入未发生或工作已取消。初始化失败须等待已分配worker清理；两个失败同时发生时保留原错误与清理错误。

Cordis插件显式inject存储和日历服务，并继承唯一Schedule服务定义。依赖换代撤除本实例服务及worker，不删除持久事实或关闭借用依赖。恢复后建立新实例，原操作身份保持。

## 必要约束

公开服务消费不要求与 Session 或 Agent runtime 同机、同进程或同数据库。命令接受、业务完成、结果交付分别观察；超时和断连不能推断为未接受。原操作身份、查询、幂等及 unknown 的细化随契约实现交付。

跨子系统不得以共享事务参加者、内存锁或对象引用作为公共协议前提。本地持久化可以在自己的事务域内使用参加者。涉及外部当前资格或版本的强保证必须由具名协议兑现；实现不支持时明确拒绝，不能用旧快照放行。

## 计算资源与退出

计算工厂只运行本包固定的编译入口。调用者显式配置并发及排队容量；同时接纳数不得超过两者之和。每次deadline包含排队与运行。到期或取消必须中止实际任务，不能只丢弃仍运行的Promise。

completed包含纯枚举结果；unavailable保留deadline、aborted、capacity、disposed或workerFailure原因。返回unavailable不等于物理线程已退出。dispose停止新接纳并等待当前及先前取消的线程退出，重复调用返回同一完成Promise。销毁计算资源不改变已保存日程。

## 本地管理事务

后端只服务构造时固定的StorageScope。租户owner.tenantId须匹配scope.tenant；system owner只能使用system scope。调用字段不能改变固定落点。业务读权由应用服务验证，本地store不是对模型开放的授权入口。

装配在同一SQL组合中登记外部守卫与本域参加者。守卫完整绑定原操作、主体、当前同意、采用依据及额度，返回事务decisionAt。成功事实还须进入参加者的耐久response，供恢复逐项核验。只有allowed布尔或事前缓存不满足协议。拒绝使用结构化binding/error，不能解析diagnostic推测业务结果。

本域参加者锁内读取current并以decisionAt重新执行纯决定。记录、不可变定义、revision、replace双向lineage、额度效果、outbox、操作索引及结果须同提交成立。后续失败回滚守卫的临时额度变化。noChange只保留原操作回执与索引，不增记录、revision、outbox或owner观察代。outbox保存事件，不负责发送。

本地参加者是提供者装配协议，不进入Schedule公共wire协议。远程提供者须用自己的机制兑现同一公开承诺，不能要求消费者取得本地事务对象。

## 原操作恢复与读取

同业务地址先查原SQL回执。新的requestId、时间或候选ID不能制造第二次业务操作。同键异业务返回operation_key_conflict。回执必须匹配SQL身份、组合版本、材料摘要、参加者及完整业务绑定。损坏、缺失或无法确认时保留unknown。

只有真实SQL权威查询给出完整五项否定证明，才能返回notCommitted。operationRef索引缺失不是否定证明。原业务地址仍可用于恢复；不设置默认TTL删除去重事实。

列表在一次SQL快照内先求owner、授权可见集合与筛选的交集，再分页并计算exact total。cursor绑定查询、权限、owner数据观察及最后排序键，变化返回changed。存储错误、预算不足或坏JSON返回unavailable，不假报空页。修订记录不可变。

## 验证与边界

持续测试覆盖真实worker退出与替换、真实SQLite管理、重开、回执损坏和事务内/提交后SIGKILL。权威守卫使用具名符合性夹具。它们不证明生产授权、Calendar或quota联调，也不证明物理断电、跨进程多writer或分布式事务。底层耐久与排除前提沿sql-contract及采用提供者。`./cordis`仍为空，无后台调度循环。
