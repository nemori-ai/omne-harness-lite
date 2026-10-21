# 执行环境组的协作入口

本页只放跨成员流程与按读者的阅读路径。单成员流程归各成员 `docs/flows.md`：契约成员写协议级流程，机制成员与 Service 实现成员写机制级流程。本页不复制许可、释放、恢复或状态协议。

## 跨成员流程

| 编号 | 流程 | 参与成员 | 唯一流程位置 |
| --- | --- | --- | --- |
| F-EX01 | 集成方取落点、获取租约、按键取设施 | execution-environment-contract、execution-environment、execution-environment-host-local | 见[成员流程 F-EE01、F-EE02](../execution-environment-contract/docs/flows.md) |
| F-EX02 | 设施操作先过守卫与账本再发出外部效果 | execution-environment-contract、execution-environment | 见[成员流程 F-EE03](../execution-environment-contract/docs/flows.md) |
| F-EX03 | 释放、失效与作用域恢复 | execution-environment-contract、execution-environment、execution-environment-host-local | 见[成员流程 F-EE04、F-EE05](../execution-environment-contract/docs/flows.md) |
| F-EX04 | 落点与宿主事实经 Runtime Context 到达观察者 | execution-environment-contract、execution-environment-host-local | 见[成员流程 F-EE06](../execution-environment-contract/docs/flows.md) |

## 按读者选择阅读路径

| 读者 | 起点 | 接着读 | 读到这里就够 |
| --- | --- | --- | --- |
| 集成方：工具宿主或独立调用者 | [execution-environment-contract 消费说明](../execution-environment-contract/docs/context.md) | [契约 SPEC](../execution-environment-contract/SPEC.md)、[公开定义](../execution-environment-contract/docs/public-api.md) | 知道要翻译成什么要求、要提供哪两个端口、拿回什么 |
| 工具作者：声明工具需要的环境 | [execution-environment-contract 公开定义](../execution-environment-contract/docs/public-api.md) | [契约 SPEC](../execution-environment-contract/SPEC.md) | 知道声明的形状、采用身份与规范实例 |
| 提供者作者：宿主或沙箱 | [execution-environment-contract 对象模型](../execution-environment-contract/docs/object-model.md) | [execution-environment-host-local 架构](../execution-environment-host-local/docs/architecture.md) | 知道登记条件、租约原件与撤除协议 |
| 维护者：恢复与结算作用域资源 | [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md) | [成员流程](../execution-environment-contract/docs/flows.md) | 知道恢复两操作做什么、不做什么 |
| 实现者 | [execution-environment 架构](../execution-environment/docs/architecture.md) | [execution-environment SPEC](../execution-environment/SPEC.md)、[成员流程](../execution-environment/docs/flows.md) | 知道表、匹配顺序、幂等键与状态转移 |
| 装配者 | [execution-environment-cordis-contract Cordis 说明](../execution-environment-cordis-contract/docs/cordis.md)、[execution-environment-host-local Cordis 说明](../execution-environment-host-local/docs/cordis.md) | [IC 约定](../../../docs/architecture/cordis-integration-conventions.md) | 知道服务键、调用方类、依赖与撤除方式 |
| 图像消费者 | [image 阅读入口](../image/README.md) | [image SPEC](../image/SPEC.md) | 知道预算怎样传入、句柄怎样关闭 |
