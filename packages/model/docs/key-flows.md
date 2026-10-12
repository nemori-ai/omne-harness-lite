# 模型调用组的协作入口

档案、执行、转换、保管和费用在目标 model/model 内组织。request-context 负责实际表示、预算和压缩；Session 保存选择；发起和消费方负责原用途，Model 不反向导入其私有实现。

精确流程由[成员协调流程](../model/docs/key-flows.md)拥有。下表只导航，不复制提交、重试、恢复或状态协议。

| 阅读任务 | 唯一流程位置 |
| --- | --- |
| 责任、机制源与图的读法 | [成员流程](../model/docs/key-flows.md#责任机制源与图的读法) |
| 档案维护与会话选择 | [成员流程](../model/docs/key-flows.md#档案维护与会话选择) |
| 转换、表示选择与固定输入 | [成员流程](../model/docs/key-flows.md#转换表示选择与固定输入) |
| 真实发出、首内容重试与流收场 | [成员流程](../model/docs/key-flows.md#真实发出首内容重试与流收场) |
| 控制、取消与原身份恢复 | [成员流程](../model/docs/key-flows.md#控制取消与原身份恢复) |
| 双路径 ACK、未知回执与清理 | [成员流程](../model/docs/key-flows.md#双路径-ack未知回执与清理) |
| 真实费用、资格查询与诊断 | [成员流程](../model/docs/key-flows.md#真实费用资格查询与诊断) |
