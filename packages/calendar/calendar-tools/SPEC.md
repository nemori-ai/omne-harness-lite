# @omne-harness/calendar-tools 行为边界

## 范围与依据

本成员提供 Calendar A1 的独立 Tool 作者模块、参数/结果 schema、可信上下文环境适配和 Cordis 贡献插件。动作只有 list/get/effective/resolve，能力只有 calendar.read。它不实现 Calendar 规则、存储或 Tool runtime。业务行为归 [Calendar SPEC](../calendar/SPEC.md)，安装边界归[包组织](../../../docs/package-organization.md#日历与日程的安装和部署边界)。本成员仍为 private 0.0.0，最终独立验收与父合回未完成。

## 结果与不变量

普通工具只提供四个查询动作和 calendar.read。公开参数不接受可信身份、权限上下文、供应、发行或任意回调。调用与直接 Calendar 查询保持同一错误、依据和分页含义。完整结果交 Tool 保管/offload，超过 16 MiB 编码上限失败，不以裁剪冒充成功。

## 所有权、失败与生命周期

可信上下文来自每次 CallAccess 的宿主 resolver，Calendar 应用仍检查当前资格。基础环境拥有资源准备/释放，Tool 拥有贡献 token、运行与结果保管。停止只撤自身贡献，不能因删除注册宣称旧调用已排空或效果撤回。

## 组合与验证

公开服务不要求 Session/Agent 同机、同进程或同库。外域当前资格、有效环境、通知和 Tool 宿主仍是具名前提，M2 前本域夹具不证明真实采用。SQL L-1/L-4 和介质耐久不因同进程消失。持续入口见[测试](tests/README.md)，独立验收不由作者绿测代替。
