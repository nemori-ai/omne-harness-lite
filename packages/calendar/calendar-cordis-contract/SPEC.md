# @omne-harness/calendar-cordis-contract 行为边界

## 范围与依据

本成员唯一声明 CalendarQueryService/calendarQueryKey 和 CalendarSupplyService/calendarSupplyKey，供 Cordis 本机装配。业务实现、配置和资源归 provider。根入口不导出运行服务，服务定义从 `./cordis` 消费。业务行为归 [Calendar SPEC](../calendar/SPEC.md)，安装边界归[包组织](../../../docs/package-organization.md#日历与日程的安装和部署边界)。本成员仍为 private 0.0.0，最终独立验收与父合回未完成。

## 结果与不变量

唯一服务键与 Service 定义在 `./cordis`。查询与供应分别实现 calendar-contract 端口，根协议保持无 Cordis。方法不通过 Context 注入身份，也不把本机资源写进 DTO。

## 所有权、失败与生命周期

定义不授执行资格，不创建后台循环。provider 宿主拥有实例、配置与清理，调用者只消费服务。失败和 unknown 原样保留，退出不能撤销已经发生的外部效果或发布。

## 组合与验证

公开服务不要求 Session/Agent 同机、同进程或同库。外域当前资格、有效环境、通知和 Tool 宿主仍是具名前提，M2 前本域夹具不证明真实采用。SQL L-1/L-4 和介质耐久不因同进程消失。持续入口见[测试](tests/README.md)，独立验收不由作者绿测代替。
