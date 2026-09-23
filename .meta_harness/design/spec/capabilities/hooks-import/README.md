# hooks 导入与方言映射

**把 Claude Code 与 Codex 的 hooks 配置导入成[拓展件](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)**：
每一条 command 成为一件兼容件，挂在按研究推出的位置上、带着按事件定的干预力上限；导入者拿到一份逐条的报告——导进来了什么、哪些没进、导进来的与宿主原来的行为差在哪。
这些兼容件被调到时，怎样把宿主的一次 hook 译成统一的输入与结论，也归这里：**宿主的「允许」不成为放行，挂了不放行，回放不重跑宿主脚本**。

一个位置上多件怎样逐件求值、结论怎样落、回放怎样走，归 [`capability.loop-extension-runner` v1](../loop-extension-runner/README.md)；**兼容件对它与原生件没有区别**。
导入结果落成资产（写哪一层、新资产还是新版本、禁用落在哪一格）归资产治理。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.hooks-import, 1)`
- **状态**：`candidate`（2026-09-23 起草），**未经独立评审、未接受、未冻结**
- **catalog 映射**：已登记为 `candidate`；`family=capabilities`、`topic=hooks-import`、
  `contract_path=spec/capabilities/hooks-import/v1/contract.md`；`resources` 含契约与 `examples.md`；
  依赖六项（`capability.loop-extension-runner`、`data.loop-extension`、`data.asset-model`、`data.messages`、`data.content-blocks`、`data.identity-values`，均为 v1），clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)。
  **另一项依赖尚未登记**：`capability.tool-admission` v1 与本契约并行起草，本分支的 catalog 里还没有它的坐标——**合流对齐时补登**
- **formal-tasks 映射**：无——导入是纯函数、映射是有限查表，理由见[契约 S-28](v1/contract.md#s-28-本版不选用形式工件)
- **提供者/装配映射**：尚无。起点已由 [D-033](../../../record/decisions/hooks-compat-baseline/decision.md) 选定（fork DSH `hook-protocol` 无运行时的一半，其余自写），fork 尚未做

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。两家宿主的方言、映射表、导入报告、兼容件的能力标识怎样导出、定档、工作区来源的处置、兼容件被调到时的输入输出翻译 |
| 为什么是 capability 而不是 data | 有一个操作（`importHostHooks`），有失败集合与缺席默认；兼容件的求值是一套行为规则 |
| 为什么不并进 runner | runner 的失效事件是「求值次序、合成或恢复规则变了」；本契约的失效事件是「**宿主升级了方言**」——两家的 hook 协议都在变（[研究](../../../../research/loop-extension-hooks-compat/research.md)），钉住的版本一动就要出新版本，不该拖着 runner 一起出 |
| 精确依赖 | 见上；**依赖方向单向**：本契约 → runner、数据半边、资产模型、消息、块、身份值 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 某个宿主事件会挂在哪、能做什么 | [Claude Code 映射表](v1/contract.md#s-23-claude-code-映射表) · [Codex 映射表](v1/contract.md#s-24-codex-映射表) |
| 导入报告里有什么、为什么有一条没导入 | [契约 S-12～S-14](v1/contract.md#s-12-导入报告) |
| 为什么挂了会拦、允许不放行 | [契约 S-19](v1/contract.md#s-19-起不来与报错)、[S-20](v1/contract.md#s-20-输出怎样译回) |
| 宿主的 `ask` 落成什么卡、答了之后怎样 | [契约 S-21](v1/contract.md#s-21-ask-与回放) |
| 一份配置导进来是什么样 | [examples](v1/examples.md) |
| 哪些证据义务已触发、现在到哪一步 | [验证与覆盖](verification.md) |
| 哪些事还没人裁 | [契约第十一节](v1/contract.md#十一已知缺口) |

## 版本包

`v1/` 含 `contract.md` 与 `examples.md`。**不建 Schema**：导入报告与兼容件载荷的线上形状归组合契约；兼容件载荷在数据契约里还没有家（[G-1](v1/contract.md#十一已知缺口)）。
**不建 `formal/`**。**钉住的宿主版本一升级就出新版本**，不原地改。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。
