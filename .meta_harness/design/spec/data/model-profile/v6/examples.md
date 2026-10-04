# data.model-profile v6 规范实例

本文件与 [examples.json](examples.json) 同为规范工件。全部模型名、供应商名、绑定、时刻与数值均为合成示例，**不是实际模型事实或供给默认值**。`definition` 指向本版 Schema 的 `$defs`；`schemaValid` 是形状预期，`representationResult` 是 S-24/S-25 完整表示层预期（`valid` 为通过的示例标记，不新增协议枚举）。未列后一字段的独立值或快照只判形状，不创造接收拒绝集合。

## 合法值与适用域

`P-image-unknown` 给出完整 image 档案：4096 输入 cap、1024 逐图字节 cap，四项上游事实均显式 unknown，表示合法；上游未知本身不拒绝。`P-text-empty-project-constraints` 是完整非 image 档案，可明确 `inputConstraints: {}`，但输入 token 和请求体事实仍必填。`P-content` 不带在册状态与时间，`P-snapshot` 不带路由名、来源、在册状态，完整保留限制和绑定。

每个公共 `$defs` 都有正反例。`InputConstraints` 与 `UpstreamInputLimits` 独立值只表达形状；image 适用性在 ModelProfile、ModelProfileContent、ModelProfileSnapshot 三种宿主共同检查。三态独立正例分别保留 unknown、unbounded、limited，反例拒绝缺值、伪第四态、0、非整数与多余成员。

## 多处违规与跨字段比较

| 实例组 | Schema | 完整表示层 |
|---|---|---|
| `P-cap-equals-upstream-*` | 通过 | 通过；边界相等允许 |
| `N-cap-exceeds-upstream-*` | 通过 | `malformed`（M16）；四指标分别检查 |
| `N-output-cross-field` | 通过 | `max_output_exceeds_profile` |
| `N-model-name-mismatch` | 通过 | `malformed`（M14） |
| `N-priority-missing-cap-before-empty-providers` | 拒绝 | `malformed` 先于 `providers_empty` |
| `N-priority-cap-conflict-before-output-conflict` | 通过 | `malformed` 先于 `max_output_exceeds_profile` |
| `N-priority-output-before-unknown-constraint` | 拒绝 | `max_output_exceeds_profile` 先于 `constraint_unknown` |

全部十种既有拒绝值都有实例；新输入约束不增加第十一种。`N-snapshot-missing-cap` 拒绝快照形状，不能取当前目录补齐；`N-content-time` 即使给合法时刻，也因建档者无权给它而报 malformed。

## 更新、复制与事实的规范场景

| 场景 | 必须观察到什么 | 条款 / owner |
|---|---|---|
| 只把输入 cap 4096 改为 2048 | 记录本次写入时刻，时间点不后退 | S-11；目录 |
| 只把逐图 cap 改小，或 unknown 改为有依据的 limited | 同样推动 updatedAt | S-11/S-32；目录 |
| 两组模态只换次序、对象只换成员顺序 | 值相等，保留原 updatedAt | S-11/S-28 |
| 只改配置绑定并依法换配置修订 | updatedAt 保留；后续新快照取新绑定 | S-11/S-29 |
| 更新 supplied cap 同时降低同名上游事实，使 cap 大于事实 | 整份表示层拒绝，无部分有效文档 | S-24/S-25/S-33；目录提交 |
| 打开调用后目录 cap 与上游事实更新 | 原快照包含旧完整值、旧 updatedAt；续接重新计量新请求但沿用旧快照 | S-27；runtime |
| 响应体、已出门记录与失败拓展件往返传快照 | 所有输入 cap、事实及适配完整值保持精确相等 | S-27；消费者 codec |
| 收到不兼容的旧快照 | 按当前入口明确拒绝，不提供旧格式读/结算路径、不补当前 cap、不改写原数据 | S-27；runtime / codec |
| 上游只有共享总窗口 | 不把总窗口直接写入只计输入的 cap/limited；换算条件有来源 | S-8；事实写入者 |
| 可靠 token 保守界 ≤ cap | 可作为不超限证据；具体证明归提供者 | S-8；实际发送消费者 |
| 保守界 > cap，但真实 token 未知 | 明确无法证明合规；不得声称测得超限 | S-8/S-33；实际发送消费者 |
| 逐图都合规，但图数/请求体/token 超上界 | 不得发送；逐图合规不代替其它约束 | S-33；runtime |
| 附件 bytes 声明很小，但没有真实字节证据 | 声明不能放行；拒绝不可计量的发送 | S-9；runtime |
| 已知限制实际是媒体合计而非完整请求体 | 不得冒充 maxRequestBytes；显式 G-15 阻断适用发送 | S-9/S-32；事实与发送 owner |
| 同格含已撤回行再建同名、读不到判重事实、两个同格并发建档 | 分别 route_name_taken、明确不可判定失败、最多一个成功；其它格同名不阻挡 | S-3；目录 |
| 撤回及纯恢复 | 同一行与身份不变，不动 updatedAt；已撤回行仍可读 | S-10/S-11；目录 |

这些是证据义务，实例存在不声称场景已执行。无凭据、修订不改义、严格 JSON 无重复键与无损数值的原有义务继续按 S-29/S-30；Schema 通过不证明可用性、授权或真实输入合规。

## token 估算保证的变化

值与纯判定实例仍逐值继承 MP5。发送消费者另须验证：有依据 tokenizer 估算加显式余量可通过；估算过门限是估算拒绝，不能写成已实测超限；缺 tokenizer 适用依据明确失败；bytes/图数仍精确。余量公式与公开原因沿 runtime8 S-74，不在 data 另造一套配置。上游 usage 与估算不同或缺失时，均按实际来源记账，不由估算补齐。
