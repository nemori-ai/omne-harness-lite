# 模型调用组的协作入口

档案、执行、转换、保管和费用的公开行为归目标 model-contract，可复用运行协调归 model，单机宿主归 model-host-local，Cordis 定义及定义自有登记表归 model-cordis-contract。当前精确设计仍唯一存放在 model/model，迁移归属见[组架构](architecture.md#文档归属与迁移)。request-context 负责表示选择、组装、预算分配和压缩，Model 负责供应商计量与最终校验；调用方保存选择；发起和消费方负责原用途，Model 不反向导入其私有实现。

精确流程由[成员协调流程](../model/docs/flows.md)拥有。下表只导航，不复制提交、重试、恢复或状态协议。

| 阅读任务 | 唯一流程位置 |
| --- | --- |
| 责任、机制源与图的读法 | [成员流程](../model/docs/flows.md#责任机制源与图的读法) |
| 档案维护与会话选择 | [成员流程](../model/docs/flows.md#档案维护与会话选择) |
| 转换、表示选择与固定输入 | [成员流程](../model/docs/flows.md#转换表示选择与固定输入) |
| 真实发出、首内容重试与流收场 | [成员流程](../model/docs/flows.md#真实发出首内容重试与流收场) |
| 控制、取消与原身份恢复 | [成员流程](../model/docs/flows.md#控制取消与原身份恢复) |
| 双路径 ACK、未知回执与清理 | [成员流程](../model/docs/flows.md#双路径-ack未知回执与清理) |
| 真实费用、资格查询与诊断 | [成员流程](../model/docs/flows.md#真实费用资格查询与诊断) |
| 完整准备、扩展与发送复核 | [成员流程](../model/docs/flows.md#请求准备与发送复核) |
| 两种独立调用 | [成员流程](../model/docs/flows.md#flow-md07) |
| 宿主启动、接续与退出 | [成员流程](../model/docs/flows.md#flow-md08) |
| 模态投影与性能观测 | [成员流程](../model/docs/flows.md#flow-md09) |

凭据的存在性与发送前解析见[成员流程](../model/docs/flows.md#凭据解析)。调用记录只保留引用，存储与 Cordis 的实际接缝是 model-host-local 的本地保管与 model-cordis-contract 的 `./cordis` 凭据服务。
