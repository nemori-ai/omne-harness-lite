# 工具执行组的工程关系

本页维护 Tool 能力组的已接受设计。契约包已导出公开类型与契约函数，Cordis 定义包已导出服务定义。独立执行、runtime、单机宿主与组合验证尚未完成。

## 包分解与邻接协作

四个包按安装闭包划分。`tool-contract` 定义逻辑调用、真实执行、内部等待、控制、结果及执行账的契约，不含 Cordis 与实现。`tool-cordis-contract` 持有唯一的 Cordis 定义。`tool`（[本增量未交付](../README.md#未交付标注)） 是不含 Cordis 的实现，`tool-host-local`（[本增量未交付](../README.md#未交付标注)） 是单机宿主与插件。发起协调者与身份治理、环境、决策方和原消费方分别承担资格、资源及业务采用；程序消费方和动作桥接方通过公开行为组合，不以方法读取或连接成功代替动作准入。

本组不维护第二份状态机、错误集合或精确承接协议。领域级设计见[契约包架构](../tool-contract/docs/architecture.md)，内部机制见实现包架构 `tool/docs/architecture.md#tool-内部实施规格`（[本增量未交付](../README.md#未交付标注)），插件装配见单机宿主的 Cordis 集成 `tool-host-local/docs/cordis.md`（[本增量未交付](../README.md#未交付标注)），责任与事实归属见[领域角色](../../../docs/domains/tool-execution/architecture.md)。
