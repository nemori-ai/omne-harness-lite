# Cordis 集成

`./cordis` 唯一拥有 CalendarQueryService/calendarQueryKey 和 CalendarSupplyService/calendarSupplyKey。两个键分别为 calendarQuery 与 calendarSupply，static provide 与导出键同源。Service 方法实现 calendar-contract 的纯端口，Context 类型增补只用于本机调用。

provider 继承对应 Service，通过 super(ctx) 取得同一服务归属，不重复声明 provide。资源建在 provider 宿主，不能建在 caller ctx。查询和供应分别装载，查询注入不取得供应权限。定义包不创建实例、连接、timer 或后台循环，根入口无运行服务定义。

遵守[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。注入不代替可信上下文或当前授权。Cordis 不提供跨进程传输、发布原子性、耐久交付或外部效果撤销。真实实现与释放责任见 [calendar-local](../../calendar-local/docs/cordis.md)。
