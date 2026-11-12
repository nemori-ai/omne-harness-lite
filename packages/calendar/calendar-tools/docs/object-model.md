# 对象模型

## 对象与关系

CalendarToolArguments 是 action 判别输入，CalendarToolResult 保留 Calendar 查询的完整结果。CalendarToolContextResolver 从 CallAccess 产生可信上下文，CalendarToolEnvironment 只持有该次解析结果。module/author 声明执行、codec、output 与 renderer，贡献 token 和代际归 Tool；模型参数不持有可信上下文。

精确类型与 schema 见[定义索引](public-api.md)，本页不复制类型声明。

## 生命周期

插件只拥有自己的贡献，Tool 宿主拥有准备、释放、运行与输出保管。基础环境的资源生命周期仍由原宿主管理，本适配不增加资源租约。撤贡献不删除持久结果或证明旧调用已停止。
