# 工具执行组的协作入口

`tool-contract` 定义逻辑调用、真实执行、内部等待、控制、结果及执行账的契约，`tool` 已实现独立执行与部分 runtime 路径，`tool-host-local` 已实现单进程本地启动协调器，范围见[组支持范围](../README.md#支持范围)。发起协调者与身份治理、环境、决策方和原消费方分别承担资格、资源及业务采用；程序消费方和动作桥接方通过公开行为组合，不以方法读取或连接成功代替动作准入。

精确流程由[契约包的协调流程](../tool-contract/docs/flows.md#工具执行的关键协作流程)拥有。下表只导航，不复制提交、重试、恢复或状态协议。

| 阅读任务 | 唯一流程位置 |
| --- | --- |
| 责任、机制源与阅读边界 | [契约包流程](../tool-contract/docs/flows.md#责任机制源与阅读边界) |
| TL-F01 定义及动态可用性 | [契约包流程](../tool-contract/docs/flows.md#tl-f01-定义及动态可用性) |
| TL-F02 发起与普通或不可用逻辑结果 | [契约包流程](../tool-contract/docs/flows.md#tl-f02-发起与普通或不可用逻辑结果) |
| TL-F03 单向转换等待关系 | [契约包流程](../tool-contract/docs/flows.md#tl-f03-单向转换等待关系) |
| TL-F04 内部等待、异步登记与原答复 | [契约包流程](../tool-contract/docs/flows.md#tl-f04-内部等待异步登记与原答复) |
| TL-F05 过程观察、真实收场与采用 | [契约包流程](../tool-contract/docs/flows.md#tl-f05-过程观察真实收场与采用) |
| TL-F06 全文卸载、取回与成本保管 | [契约包流程](../tool-contract/docs/flows.md#tl-f06-全文卸载取回与成本保管) |
| TL-F07 单次控制、逻辑撤回和原调用恢复 | [契约包流程](../tool-contract/docs/flows.md#tl-f07-单次控制逻辑撤回和原调用恢复) |
| 未细化与验证责任 | [契约包流程](../tool-contract/docs/flows.md#未细化与验证责任) |
