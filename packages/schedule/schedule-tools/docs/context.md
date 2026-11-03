# 消费关系

普通程序直接消费 ScheduleCommands 和 ScheduleQueries。Agent 通过 Tool 宿主消费本包工具作者。工具授权只是进入适配层的条件，业务服务仍逐次检查自己的资格和所有权。

可信宿主提供原调用恢复、当前身份投影和披露策略，并把返回的 guard 接入通用结果读取链。工具参数中没有可自报的租户、主体或原会话身份。Session 如何接收 instruction、Agent 如何执行 Job，属于各自领域和后续波段。

本包消费公开 Schedule、Tool、Schema 与 JSON 协议。它不导入 schedule-local，不管理 SQL 生命周期，不创建后台扫描器，也不修改日历事实。M2 前用协议符合性提供者验证消费边界。
