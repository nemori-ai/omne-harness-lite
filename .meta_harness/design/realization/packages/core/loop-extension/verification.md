# loop-extension 验证与证据

契约侧的证据义务权威在 [`spec/data/loop-extension/verification.md`](../../../../spec/data/loop-extension/verification.md#证据义务)（V-1～V-11）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～5、7 节正反实例逐条过包内校验；第 6 节四个走查里的 JSON 过对应的 `$defs`；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 两张合法组合表机检 | 13 个位置（含维度）× 8 种结论 × 3 档逐一构造 `Conclusion`，比对 Schema 与 S-20、S-21 的 ✓／✗ 及拒绝值 | 未开始 | 本节点 |
| S-40 推出规则 | 三档声明各推一次，`power` 的取值域是声明档及其以下；不产出 `disabled`、`usableBy` | 未开始 | 本节点 |
| S-11、S-41 执行环境句柄（M38） | 十一个位置的输入都带 `environment`，缺了即 `malformed`；句柄是不透明串、合 identity-values S-31 的交换表示；本包公开面里没有解析它的函数 | 未开始 | 本节点（形状与公开面）；解析与「解析不出不回退」归 runner |

**不在本节点**：V-3～V-11（回放一致、不可用与报错两分、每件必留、不合法结论按报错处置、没有放宽、`select_model` 与 `retry` 的判定、被拦的内容不进日志、跨进程、落终态之后不复活——派发器、兼容层与模型请求运行时）。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；`judgeConclusion` 的第二个参数由 `ctx` 改名 `inputs`（候选名，免与 Cordis Context 混读）。这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
