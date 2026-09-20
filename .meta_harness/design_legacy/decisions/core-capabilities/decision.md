# D-008：首批核心能力与共同准入

- 状态：旧谱系设计已接受；本包保留其仍有效范围。目标新谱系 v1 的 catalog 接受、冻结与提供者符合性均由各自证据决定。
- 来源：`e3573ca72d18bfe7ddd002df5025551b51eede46:docs/decisions/D-008-core-capabilities.md`，SHA-256 `c88fc9a6bc5ad006930bad9eb63fda4a43c2f73f19a60e140d0ba9c36645c94f`；来源提案为同修订 `docs/proposals/core-capabilities/README.md#接受记录`。
- 接受依据：2026-09-13，任务作者在用户授权完成本批设计、正式化并继续 fork 的范围内，结合独立评审接受受审修订 `c966da10f1822542a69e0665c41fb4265bfc3989` 的 13 个旧 v1；评审并未代为接受。产品用户后来明确确认迁移来源 `spec/` 正文均为已验收正式设计。需求消费基线为 `dae2df36491c0ab4b8b9a3d16db639dab5ea88b0` 加用户明确的声明登记和系统审批要求。

## 保留的选择

1. 业务状态各有能力 owner；共同有序提交域只负责短准入、逻辑位置和原子提交。受控效果须等耐久确认；跨域后果靠耐久意图、目标去重与回执交接，外部效果不承诺恰好一次。目标分别见[共同协调 CC-01～07](../../spec/compositions/core-work-coordination/v1/contract.md)与[耐久记录 DR-01～05](../../spec/capabilities/durable-records/v1/contract.md)。
2. 工具声明与可调用贡献共同发布；每次调用依据 tenant、定义、绑定、授权、确认和预算作当前判定。系统审批是耐久等待与冻结 Action 的唯一合法批准消费，撤权、精确取消、强停及外部效果未知各有不同边界。目标见[工具 TL](../../spec/capabilities/tools/v1/contract.md)、[人类决定 HD](../../spec/capabilities/human-decisions/v1/contract.md)、[授权 AU](../../spec/capabilities/action-authorization/v1/contract.md)及[预算 BG](../../spec/capabilities/budget-accounting/v1/contract.md)。
3. 长期 Session 与 Run/continuation、模型 attempt、媒体原件、预算暴露和供应方账务分属各自权威；所有模型请求统一经 OpenRouter。目标见[Session](../../spec/capabilities/session/v1/contract.md)、[Run](../../spec/capabilities/run/v1/contract.md)、[Model](../../spec/capabilities/model-execution/v1/contract.md)、[Media](../../spec/capabilities/media-content/v1/contract.md)及[工程观测](../../spec/capabilities/engineering-observation/v1/contract.md)。

## 源身份与局部取代

| D-008 接受的旧身份 | 当前设计入口与取代范围 |
|---|---|
| `data.core-work@1`、`durable-records@1`、`human-decisions@1`、`tools@1`、`model-execution@1`、`media-content@1` | 当前分别为同名新 v1 候选，源当前版先经[D-015](../tool-execution-message-stream-hooks/decision.md)扩展或修改；D-008 只保留未变的早期选择。 |
| `core-work-coordination@1` | 当前新 v1 候选重基自旧 v2；[D-014](../session-run-agent-lifecycles/decision.md)增加同域组合契约的声明规则。 |
| `tenant-governance@1`、`action-authorization@1`、`budget-accounting@1`、`engineering-observation@1`、`command-input@1` | 同名新 v1 候选承接未变条款；个人创建受[D-016](../account-identity/decision.md)与[D-017](../personal-tenant-creation/decision.md)约束；键盘触发的新增 typed-target 语义另有用户接受。 |
| `session-run@1` | 已退役；[D-012](../run-driver-and-inbound/decision.md)先修订，D-014 最终拆至 Session、Run 与生命周期组合，不恢复单一 owner。 |

D-019 只把 D-008 中“自有标准 HTTP/SSE adapter”这一**传输实施选型**改为[定向 fork pi-ai](../pi-ai-openrouter-transport/decision.md)；OpenRouter 唯一出口和 ModelHost 的状态、准入及账务边界仍有效。D-017 的统一个人租户方向只覆盖旧 bootstrap 专属路径与后续注册分叉的冲突范围，不自动接受 DR/CC/TG 的新格式。

旧有限模型和结构样例支持原受审设计，不证明新坐标的联合验证或实现。DR 个人创建和通用 v3 编码仍在候选审阅中；其批内 caller-frozen append 顺序应与旧 DR-01 核对，不能借 D-008 接受新编码。
