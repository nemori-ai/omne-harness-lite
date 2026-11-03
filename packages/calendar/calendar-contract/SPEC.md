# @omne-harness/calendar-contract 行为边界

## 范围与依据

本成员拥有 Calendar 的不可变日期值、查询与供应服务端口、请求/结果及 Standard Schema。根入口导出 calculation、queries、supply；不依赖 Cordis，不创建运行服务。业务行为归 [Calendar SPEC](../calendar/SPEC.md)，安装边界归[包组织](../../../docs/package-organization.md#日历与日程的安装和部署边界)。本成员仍为 private 0.0.0，最终独立验收与父合回未完成。

## 结果与不变量

请求、结果、错误及不可变快照是跨部署值，不包含运行时对象。结构校验与业务资格分开，latest/pinned、合法 empty、覆盖不足、预算耗尽、提供者故障与发布 unknown 不互换。公开 schema 为形状唯一源，业务规则归 [Calendar SPEC](../calendar/SPEC.md)。

## 所有权、失败与生命周期

本包只拥有定义，不拥有业务库、授权服务、网络或后台生命周期。schema 成功不授执行资格。运行实现负责当前资格、完整结果和持久责任，消费者必须穷尽判别结果。

## 组合与验证

公开服务不要求 Session/Agent 同机、同进程或同库。外域当前资格、有效环境、通知和 Tool 宿主仍是具名前提，M2 前本域夹具不证明真实采用。SQL L-1/L-4 和介质耐久不因同进程消失。持续入口见[测试](tests/README.md)，独立验收不由作者绿测代替。
