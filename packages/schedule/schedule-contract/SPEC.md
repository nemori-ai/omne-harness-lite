# @omne-harness/schedule-contract 行为边界

## 范围与依据

本成员实现Schedule公共值、命令、查询、结果、错误和可替换服务端口。公共请求与回执必须可序列化，不携带Context、连接、回调或运行时实例。安装边界归[包组织](../../../docs/package-organization.md#日历与日程的安装和部署边界)，业务目标沿[Schedule SPEC](../schedule/SPEC.md)。本包提供schema和协议，不执行业务。

## 必要约束

公开服务消费不要求与Session或Agent runtime同机、同进程或同数据库。命令接受、业务完成、结果交付分别观察；超时和断连不能推断为未接受。操作定位支持原identity与expectedFingerprint，以及已知operationRef。只有完整否定证明才能声明notCommitted。

严格对象拒绝额外字段。日期、UUID、枚举、长度和safe integer约束由源码schema拥有。human上下文不带来源会话，agent上下文要求可信来源会话，system与tenant归属保持独立。模型字段不能替代可信身份。

fingerprint对完整业务意图作JCS UTF8编码和SHA256，不包含requestId、operationKey或重试次数。同业务地址同指纹可认回，异指纹必须冲突。工具从这些schema派生参数，不另写一套宽松类型。

跨子系统不得以共享事务参加者、内存锁或对象引用作为公共协议前提。本地持久化可以在自己的事务域内使用参加者。外部当前资格或版本的强保证必须由具名协议兑现；不支持时明确拒绝，不能用旧快照放行。

## 验证边界

根入口导出schema、类型、JSON Schema和指纹函数，不提供./cordis。测试覆盖严格联合、编码往返、边界拒绝、指纹golden及操作定位。持久化、授权服务和真实装配由实现包另行验证，不能由DTO校验推断。
