# @omne-harness/calendar-local 行为边界

## 范围与依据

本成员提供 Calendar A1 的 SQL 发布持久化、供应材料与运行记录、受限来源获取、发行种子读取、供应运行器和查询/供应 Cordis provider。领域规则复用 calendar，存储仅消费 sql-contract。业务行为归 [Calendar SPEC](../calendar/SPEC.md)，安装边界归[包组织](../../../docs/package-organization.md#日历与日程的安装和部署边界)。本成员仍为 private 0.0.0。

## 结果与不变量

版本、出处、pointer/generation、receipt 与 outbox 形成同一发布业务单元。结果未知按原地址和指纹查询。反应确认的 acknowledgementKey 表示一次确认意图，首次发出前保存；同 key 同 payload 认回旧结果，异 payload 拒绝。未知不能自动换 key，重新获准的新确认用新 key，最多更新同一记录一次，不重做发布。

snapshot.provenanceRefs 是来源 authority，本机 rawReference 独立保管。version 精确关联原发布 candidate；材料缺失、不匹配或资格不足明确失败。seed 导入跨合法 scope 不以原材料 SQL reference 绑定快照身份。来源事实与知识时点见[资源说明](resources/README.md)。

## 所有权、失败与生命周期

owned provider 负责停止其供应应用或 runner；borrowed 不停止借入应用。关闭先拒绝新调用，再有界排空并报告未完调用/失败。未完成持久操作继续保管，退出不撤回已发布内容或外部反应。来源获取与纯解析分离，下载成功不等于发布通过。

## 组合与验证

公开服务不要求 Session/Agent 同机、同进程或同库。外域当前资格、有效环境、通知和 Tool 宿主仍是具名前提，M2 前本域夹具不证明真实采用。SQL L-1/L-4 和介质耐久不因同进程消失。持续入口见[测试](tests/README.md)，独立验收不由作者绿测代替。

## 设置环境投影

`createCalendarSettingsEnvironment` 消费公开 Settings 读取与求值协议。宿主从原调用恢复受信主体及已采用的目标/定义映射；模型参数不能提供这份绑定。适配器核对 owner、唯一目标和定义身份，一次读取同时取得时区与日历，并保留 Settings basis 的修订。缺值保持 missing，partial、错配、非法值和依赖异常返回 unavailable。显式 null 日历不被默认日历替代。

Settings 仍验证读取资格；Calendar 的 authority 仍独立判断日历使用权。环境映射不发行主体、不修改偏好、不提供后续 Schedule 写入的原子当前性保证。宿主不得将普通 context DTO 当成真实主体，或将可读设置解释成可用日历。
