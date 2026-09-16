# Media Content 提供者映射设计

## 能力到 Cordis 的候选投影

候选 `MediaContentPlugin` / `omneMediaContent` 与独立 content host，按 tenant 与逻辑 owner 分区。 生命周期与状态权威独立于另一项 M 能力；模型请求可以消费媒体引用，媒体
保存不因此成为模型 adapter 内部细节。stage/inspect/retain/read/release/collect；保留认回先于引用确认；GC 穿不过有效占用；换代保留旧引用 owner 到收口。

## 精确依赖与所有权

提供者通过已固定的 Run/Work/tenant 引用消费可传输身份，直接固定 S 的 DR/CC/OB、
G 已交付给 M 的 tenant/budget，以及 L 的
Session/Run/Driver/Tools 精确候选快照；动作授权只沿 L 已固定的共同门见证消费，G 尚未向 M
发布 AU 候选接口，不能由本组自行升级为直接依赖。具体资源 hash 见本次 `input-dependencies.json`。
Context 只携带作用域和依赖，不能成为业务状态权威。跨 tenant 默认拒绝；同物理内容摘要不能
披露另一个 tenant 是否已有内容，也不能授予读取权。

## 失败、迟到和撤除

外部请求或保留操作一旦可能发出，timeout/abort 只能记 unknown/partial，并由原 attempt/
operation owner inspect、对账和接收迟到结果。重试产生新 attempt，保留原费用和因果关系。
provider 停止先封闭新准入、排空/隔离在途工作并保存可恢复事实；插件卸载不等于撤回外部效果、
删除媒体、释放预算或取消历史交付。
