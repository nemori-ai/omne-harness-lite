# Model Execution 提供者映射设计

## 能力到 Cordis 的候选投影

候选 `ModelExecutionPlugin` / `omneModelExecution` 与独立 host，按 tenant/profile/attempt 分区。 生命周期与状态权威独立于另一项 M 能力；模型请求可以消费媒体引用，媒体
保存不因此成为模型 adapter 内部细节。prepare 不发网；admit 与预算/授权/epoch 同门；dispatch 只经 OpenRouter；inspect/settle 认回迟到事实；换代排空原 attempt。

## 精确依赖与所有权

S/G/L 的 outgoing manifest 是 M 可用输入上界，不等于这个 provider 全部直接消费。候选 catalog
为本 provider 登记的实际直接依赖只有：

- S：`data.core-work` 的 CD-01～CD-05、`composition.core-work-coordination` 的 CC-01～CC-07、`capability.durable-records` 的 DR-01/DR-02/DR-03/DR-05；
- L：`capability.session` 的 SE-01/SE-03/SE-06/SE-10/SE-11/SE-13/SE-14/SE-16/SE-18/SE-19/SE-20，`capability.run` 的 RN-01/RN-02/RN-03/RN-05/RN-07/RN-08/RN-09，`capability.run-driver` 的 RD-01/RD-02/RD-04/RD-06/RD-07/RD-08/RD-10/RD-13/RD-16，以及 `capability.tools` 的 TL-01/TL-02/TL-07/TL-08/TL-11/TL-12/TL-19/TL-20；
- G：`capability.tenant-governance` 的 TG-01/TG-02/TG-05 和 `capability.budget-accounting` 的 BG-01～BG-04；
- M：独立 `capability.media-content` 的 CT-01～CT-04。

动作授权只沿 L 已固定的共同门见证消费；G 尚未向 M 发布 AU 候选接口，不能由本组自行升级为
直接依赖。上界资源 hash 见本次 `input-dependencies.json`，实际依赖条款以 `catalog-delta.json`
对应候选坐标为准；未列出的上界输入不是隐含依赖。
Context 只携带作用域和依赖，不能成为业务状态权威。跨 tenant 默认拒绝；同物理内容摘要不能
披露另一个 tenant 是否已有内容，也不能授予读取权。

## 失败、迟到和撤除

外部请求或保留操作一旦可能发出，timeout/abort 只能记 unknown/partial，并由原 attempt/
operation owner inspect、对账和接收迟到结果。重试产生新 attempt，保留原费用和因果关系。
provider 停止先封闭新准入、排空/隔离在途工作并保存可恢复事实；插件卸载不等于撤回外部效果、
删除媒体、释放预算或取消历史交付。
