# 关键流程

## 流程

宿主先装载查询或供应 provider。消费者 inject calendarQueryKey 或 calendarSupplyKey，再把可信上下文和公开请求交给服务方法。provider 调用其应用实例并返回完整判别结果。定义层不替调用者核准资格，不拥有发布或恢复记录。

完整业务流程见[Calendar 关键流程](../../calendar/docs/key-flows.md)。

## 失败与生命周期

依赖退出时，宿主和 provider 关闭新准入并按原调用保管未完责任。仅导入 Service 定义没有资源可释放。provider 的失败、unknown 和关闭报告不得被定义层转换为成功。已提交版本不因 Cordis 退出回滚。
