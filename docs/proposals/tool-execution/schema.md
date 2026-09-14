# 工具 Schema：定义面的维度

[提案索引](README.md) · [生命周期](lifecycle.md) · [帧](frames.md) · [Cordis 视角](cordis.md)

本文件只定**维度、词表与消费者**；JSON Schema 本身按
[U-35](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户) 实现前再写。
基线是 [TL-01/03/05/10/12](../../../spec/capabilities/tools/v1/contract.md)、
[AU-03](../../../spec/capabilities/action-authorization/v1/contract.md) 与
[CD-03/04](../../../spec/data/core-work/v1/contract.md) 的 `ToolDefinition / Command /
BackgroundDeclaration / ContentBlock / MediaRef / Action`；校验 profile 沿
[tools 设计的 Ajv 子集](../../../packages/tools/tools/design.md#定义声明handler-与-skill-的同一发布单位)
（draft 2020-12、禁远程 `$ref`/`$async`/自定义关键字、输入根 object 且
`additionalProperties=false`、禁 coerce/defaults/removeAdditional），本文件不另开校验器。
按裁决 [i～n](README.md#作者裁决用户按建议拍板)，凡已有权威定义的字段一律沿用，不改名、
不复制；新增维度只在没有现成落点时出现。

## 维度总表

| 字段 | 层级 | 消费者 | 现状 | 本提案 |
|---|---|---|---|---|
| `definition/version`、`toolKey`、`implementationArtifact`、`configurationRevision`、`Binding` | 工具 | 装配、TG 引用、准入绑定 | CD-03 已定 | 不动 |
| `commands[].commandKey`、`inputSchema`、`outputSchema`、摘要与披露 | 命令 | 投影、门、执行 owner、discover | TL-01/03、[definitions 草案](../tool-system/v1/definitions.md#工具与操作) | 不动 |
| `authorization`（AU-03 六项：权限、解析器、确认类型、授予者、影响、暂行合同） | 命令 | AU 门、HD | CD `AuthorizationDeclaration` 已定 | 不动；候选 g 的"效果与暂行"全部由它和 `effect` 承担，不加字段 |
| `effect: read \| write \| external` | 命令 | AU/HD 门、级联表的 `possible_effect` | CD `Command` 已定 | 不动 |
| `requiredSkills` | 工具/命令 | 装配（MC-07） | TL-05 已定 | 不动 |
| `environmentCapabilities: string[]` | 命令 | 门、discover 的 available/unavailable 原因 | CD 已定；词表归 PF-012 设计 | 不动；门把它与 `Binding.environment` 资源公布的能力求交 |
| `background: BackgroundDeclaration` | 命令 | 准入、驱动器视图、执行 owner | TL-10 已定 | 在 `mode=supported` 时加 `startModes`；`automatic` 由 `foreground` 取代（下文） |
| `foreground: {limitMs, stopMarginMs, onLimit}` | 命令 | 调用运行时计时（裁决 n） | 新 | [前台上限](#前台上限与调用级启动方式) |
| 调用级参数 `detach` | 调用 | 准入、关系维度 | 新 | 同上 |
| `cancellation` → `stop: {capability}` | 命令 | 执行 owner 声明核实、用户停止预期 | CD 为 `supported \| unsupported` | [停止能力](#停止能力) |
| `concurrency` | 命令 | 驱动器 proposeCalls 批 | 新（裁决 k） | [并发](#并发) |
| `media: {inputs[], outputs[]}` | 命令 | 参数校验、CT、模型投影 | 新（裁决 l）；值形状用 CD `MediaRef` | [多模态](#多模态) |
| `frames[]` | 命令 | 执行 owner、帧读面、出站流 | 新（裁决 d） | [帧声明](#帧声明) |
| manifest 投影模式 | 工具 | manifest | TL-01 默认 `{command, params}` | [投影](#单操作与多命令投影) 加 `single`（裁决 i） |
| 结果形状 | 调用 | Session 保存、模型投影、HD 答复 | TL-12 末段有义务、CD 无形状 | [结果](#结果形状) |

发布时点：新增或改动的字段随[缺口表](lifecycle.md#契约措辞缺口表)一次进入 CD 与 tools
的下一版；不单独发 CD v2（裁决 g）。

## 单操作与多命令投影

| 范式 | 定义侧 | manifest 投影 | 发布时检查 |
|---|---|---|---|
| 单操作工具 | 命令表恰一条；`commandKey` 与 `toolKey` 同名或为 `default` | `projection: single`：顶层 Schema 就是该命令的 `inputSchema`，没有 `command` 层，也没有 `help` | 命令数 ≠ 1 时拒绝 `single`；`inputSchema` 不得声明保留参数名（见调用级参数） |
| 多命令工具 | 命令表多条 | `projection: compact`（默认）：`{command: string, params: object}`；`projection: oneOf`：`oneOf [{command: const, params: 该命令 inputSchema}]`；都只占一个槽位，`help` 为保留元命令 | `help` 不能注册业务 handler；`oneOf` 的分支数受 manifest 预算约束，超出回落 compact |

两种范式共用同一定义模型；投影只是 manifest 的派生，调用、过程、费用、审计仍定位到具体
`commandKey`（PF-024.C1/C2）。参数在解析 Action 前先按具体命令的 `inputSchema` 完整校验
（TL-01）；投影层剥掉的 `command` 与保留参数不进入 `Action.params`。批处理、管道与 shell
词法不纳入（[未决项](README.md#未决项)）。

## 多模态

| 位置 | 声明 | 值与检查 | 依据 |
|---|---|---|---|
| 输入参数 | `media.inputs: [{param: JSON Pointer, kinds: [image \| audio \| video \| file], formats?, maxBytes?}]` | 被指参数的值形状是 CD `MediaRef{tenantId, mediaId}`；门核对 `tenantId` 等于调用租户、引用可读且属 `kinds/formats/maxBytes`（与 [CT-01](../../../spec/capabilities/media-content/v1/contract.md) 可查询限额一致）；`agent_attachment` 类文件只给名称/MIME/长度与受限访问 | CT-01/03、PF-009.C3/C4 |
| 输出结果 | `media.outputs: [{kinds}]` 声明可能产生的模态 | 工具生成媒体经 CT `retainReference` 取得耐久引用后，才能作为结果 `content` 里的块；未耐久的引用不能进入 terminal 结果 | CT-02/04、PF-022.C2/C5/C6 |
| 模型投影 | 无声明字段 | 下一 Step 的 tool_result 按 [MC-11](../../../spec/capabilities/model-execution/v1/contract.md) 的"模型工具能力 × 部署/权限交集"选择：模型能读该模态 → 引用作 `model_native` 块进入；不能 → 文本描述加 `agent_attachment` 引用；用户展开全部帧不等于向模型注入（TL-12） | MC-09/11 |

工具返回的媒体再成为后续工具输入，由 `MediaRef` 双向使用天然满足，不建第二个图片库；
派生来源（裁剪自哪张）归 CT-03 的来源记录，不是工具 Schema 的事。

## 前台上限与调用级启动方式

```text
background.startModes: [foreground, background_from_start]   // supported 时必填，非空子集
foreground: { limitMs, stopMarginMs, onLimit: detach | stop | keep_waiting }   // 可选
```

| 规则 | 内容 | 依据 |
|---|---|---|
| `foreground` 取代 `automatic` | TL-10 的 `automatic{thresholdMs, stopMarginMs}` ≡ `foreground{limitMs: thresholdMs, stopMarginMs, onLimit: detach}`；发布下一版时删 `automatic` | 裁决 m、n |
| `onLimit` 约束 | `detach` 只在 `background.mode = supported` 且 `startModes ∋ foreground` 时合法；`stop` 只在 `stop.capability ≠ unsupported` 时合法；缺席 = `keep_waiting`，Run 执行预算是最终刹车 | TL-08/10 |
| 有效阈值 | `min(limitMs, 系统上限, Run 剩余预算 − stopMarginMs)`；三值与计时来源在准入时记录到调用；算不出正数时启动前不承诺自动转换 | TL-10 |
| 调用级 `detach` | 投影时由 tools 包注入保留参数 `detach: on_start \| auto`（单操作投影在顶层，多命令投影与 `command` 同级），只在 `startModes` 含两种方式时出现；`on_start` → `background_from_start`；`auto`（缺省）→ 前台并按定义的 `onLimit` 处理；模型不能否决定义或运维声明的自动离场（裁决 ab 取代裁决 j 的 `never`）；越出 `startModes` → 参数校验失败，走 TL-01 的 `invalid_proposal` | 裁决 j、ab |
| 不可变 | `detach` 剥离后记为调用的 `requestedRelation`，不进 `Action.params`；准入后不改 | [T-6](invariants.md#调用)、[T-13](invariants.md#调用) |

用户手动 `detachCall` 与系统 interrupt_then_run 的转换不经此参数（[转移表](lifecycle.md#转移表)）。

## 停止能力

```text
stop: { capability: cooperative_fence | forced_isolation | unsupported }
```

| 值 | 含义 | 约束 |
|---|---|---|
| `cooperative_fence` | 封闭新动作并等待真实收口，不承诺时限（local-execution 现状） | `stop_progressed{quiescent}` 才算停 |
| `forced_isolation` | owner 能在时限内隔离工作（杀进程、撤沙箱） | `stop_progressed{isolated}` 后外部效果仍可能已发生，结果按 `possible_effect` 处理 |
| `unsupported` | 不能停 | 不能声明 `background.mode = supported`（TL-08"无法兑现不可声明"）；不能声明 `onLimit: stop` |

取代 CD `cancellation: supported | unsupported`；执行 owner 在装载核实时必须能兑现声明值，
否则该命令 unavailable。

## 并发

`concurrency: serial | parallel_safe`（缺省 `serial`）。同一 proposeCalls 批内连续的
`parallel_safe` 调用可同批准入并同时 start；`serial` 调用沿 [RD-09](../../../spec/capabilities/run-driver/v2/contract.md)
的缺省串行：停在 `proposed_pending_gate`，直到批内更早的调用的视图都不再阻止收束（已
结算、已转后台、waiting_approval 或 waiting_human）才过门，不要求它们全部结算。写回下一
Step 的顺序按模型发出顺序；批内某调用被拒或 Run 被中断时，未 dispatch 的调用结算为
`cancelled_before_execution` 并写合成结果。首版驱动器可以仍然串行执行，声明词表先进定义
（裁决 k）；并行 start 的观察与费用仍按每调用记录。

## 帧声明

```text
frames: [{ kind, payloadSchema, recordLevel: critical | durable | transient, media: bool, render: {kind, version} | null, maxBytes }]
```

| 规则 | 内容 |
|---|---|
| 无声明 = 无帧 | 读面返回 `unsupported`；owner 产的未声明 kind 被拒并记诊断 |
| `kind` | 落到 `tools.frame.<kind>` 命名空间；同一命令内唯一 |
| `payloadSchema` | 同一 Ajv profile；`media: true` 时 payload 必含 `MediaRef`，帧的耐久性等待 CT 引用 |
| `recordLevel` | 缺省 `durable`（与 Session 日志同域 append-only，可回放，[U-42](README.md#裁决记录2026-09-14用户)）；语义与失败处置见 [frames.md](frames.md#记录等级)；部署策略只能关闭 `transient`，不能把 `critical` / `durable` 降级 |
| `render` | 呈现标识，UI 据此选择组件与版本；语义不依赖它；词表以 omne-next 工具帧设计为起点核对（帧线波 0） |
| `maxBytes` | 单帧 payload 上限，超出截断并标 `trimmed` |

合并（`mergeable`）没有当前消费者，留到出站流阶段按需引入。

条数、字节与保留期数值归实现阶段（[未决项](README.md#未决项)）。

## 结果形状

```text
Result = {
  outcome: succeeded | failed | denied_before_execution | cancelled_before_execution | unavailable | interrupted | unknown,
  output: JsonValue | null,        // 按 outputSchema 校验；unknown / 拒绝时为 null
  content: ContentBlock[],         // text / image / audio / video / file，每块带 delivery
  error: { code, message, retryable } | null,
  possibleEffect: bool             // dispatch_intent 已耐久而终态不明
}
```

| 层 | 内容 | 落点 |
|---|---|---|
| 真实执行结论 | `outcome`、`error`、`possibleEffect` | journal `tools.call.settled`；恰一次（T-2） |
| 规范输出数据 | `output`（`outputSchema`）、`content` 中的耐久引用 | Session 保存结果或经选择的引用（TL-12） |
| 模型投影 | 由驱动器按 MC-11 与 S7 投影选择器从上两层派生；hooks `PostToolUse` block 只影响这一层 | 未占位：该 tool_use 的 tool_result；已占位（deferred_receipt）：到达 Step 的 `system_reminder{late_result}`（[占位与迟到结果](lifecycle.md#占位与迟到结果的投影)） |

`human` 工具的答复走同一形状：`succeeded{output: Answer}`，`content` 空
（[内建人类请求工具](lifecycle.md#内建人类请求工具)）；`unavailable` 只在执行前出现，
`output` 与 `content` 为空。

## 发布时检查清单

| 检查 | 失败反馈 |
|---|---|
| 完整 Schema 在 profile 内 | `unsupported_schema`，不部分校验 |
| `single` 只用于单命令；`help` 无业务 handler；`oneOf` 预算 | 发布拒绝 |
| `inputSchema` 不含保留参数名 `detach`、`command`、`params` | 发布拒绝 |
| `onLimit` / `startModes` / `stop.capability` / `background.mode` 互相一致 | 发布拒绝 |
| `media.inputs[].param` 指向存在的参数且其形状为 `MediaRef` | 发布拒绝 |
| `frames[].kind` 唯一 | 发布拒绝 |
| 执行 owner 核实能兑现 `stop.capability` 与 `background` 协议版本 | 命令 unavailable，不发布半项 |
