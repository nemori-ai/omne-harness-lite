# call-accounts

纯数据校验与费用求值包，采用已接受的 [`data.call-accounts` v2](../../../.meta_harness/design/spec/data/call-accounts/v2/contract.md)。责任与消费者边界见 [realization](../../../.meta_harness/design/realization/packages/core/call-accounts/design.md)。

公开入口为 `@omne-harness-lite/call-accounts`；冻结 Schema 从 `@omne-harness-lite/call-accounts/schema` 读取。没有 Cordis 服务或外部状态。

`judgeAccountValue` 返回有序的表示拒绝值；`validate` 仅判断 Schema。`ExactDecimal` 从 content-blocks 的 `JsonNumber` 读取精确十进制，保留输入数字原文，运算结果可通过 `toJsonNumber()` 交回无损 JSON 写入器。

`prepareAccountGroup` 先完整校验模型账、工具账与补账，再生成不可手工构造的 `AccountGroup`。`summarize` 只读取该快照的权威金额。工具的镜像费用、`total_usd` 和工具用量不进入投影。`effectiveCost` 对单个目标和只属于该目标的补账求值；模型分支保持 `Cost` 形状与上游另报的推理费用。

`summarizeUsage` 接收只读的 `ResponseId + Usage` 集合，先校验全部输入，再汇总四项 token；重复响应标识明确失败。工具账、费用和补账不是该辅助函数的输入，完整账组的合法性与归组完整性由消费者另行保证。

会话日志归属由调用方显式传入，只用来比较目标身份；本包不查会话、租户或存储。求值失败名是本包的本地候选，正式读面命名缺口 CA-1/G-10 保留。分组、持久写入、镜像与权威同组以及精度的每一跳仍由相应消费者兑现。

本包可执行 `pnpm build`、`pnpm typecheck`、`pnpm test`。测试直接读取冻结规范实例，分别核 Schema 与具名拒绝；另核手算汇总、精确金额、补账平局、跨会话目标、类型负例和不可变快照。实际运行证据与最终接受由交付调度维护。
