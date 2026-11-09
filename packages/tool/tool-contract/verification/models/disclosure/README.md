# Disclosure：首屏的有界披露

本目录的模型检查有界披露：无论正文多大，模型为一个工具结果首次收到的内容都不超过有效阈值 L。性质的含义归领域文档的[性质与守护点](../../../../../../docs/domains/tool-execution/architecture.md#性质与守护点)，阈值、预览预算与描述头的规则归能力组的[部署无关原则](../../../../docs/architecture.md#部署无关原则)。实现尚未开始，第 7 节的代码名称是计划名。

模型只证明列出的有限状态和假设，不证明实现。它不建模按页读回。

## 1. 规则

- 声明带作者阈值 `T`、作者预览上限 `Tp` 和描述头上限 `headerMax`；描述头只含固定字段与 schema 身份，上限按声明算出。系统带阈值 `S`、预览上限 `Sp` 和除数 `k`。
- 声明受理时固定 `L = min(T, S)` 和 `P = min(Tp, Sp, ⌊L / k⌋)`，并检查 `headerMax + P ≤ L`，不满足就拒绝声明。
- 正文 ≤ L 时内联给模型。否则卸载，首屏 = 描述头（元信息，大小在 `1..headerMax`，不计入 P）+ 预览（≤ P）。预览来自机械预览函数，或作者给出的 content 与摘要；作者预览 > P 时明确拒绝，不截断。正文本身不改写。
- 重启可以收紧 `S` 或 `Sp`。声明在新值下重新受理；已经发出的首屏不受影响。

## 2. 变量

| 变量 | 含义 |
| --- | --- |
| `epoch` | 0 为重启前，1 为重启后 |
| `sys` | 系统值 `[S, Sp]` |
| `decl` | 声明 `[T, Tp, headerMax]`，初态非确定地选定，之后不变 |
| `policy` | 受理后固定的 `[L, P, header]`；`NoPolicy` 表示没有受理的声明 |
| `stage` | `declared`、`accepted`、`rejected`、`sent`、`refused` |
| `body`、`original` | 最近一个结果正文的存储大小；历史变量：该正文产生时的大小 |
| `sent` | 历史变量：已给模型的首屏集合。每条记录带产生时的正文大小、是否内联、描述头与预览大小、总大小，以及当时的 `S`、`Sp` |

## 3. 动作

| 动作 | 含义 |
| --- | --- |
| `Accept` | 按当前系统值算出 L、P；`headerMax + P ≤ L` 则受理并固定 `policy`，否则拒绝。`Bug = "max-not-min"` 时 P 取三者的最大值；`Bug = "header-in-budget-mismatch"` 时受理只检查 `P ≤ L`，把描述头算在预算内，而首屏仍把描述头放在预算外 |
| `Restart` | 收紧系统值为 `(S, Sp) ∈ {(4, 1), (2, 1)}`，丢弃已受理的策略，声明回到待受理。`Bug = "stale"` 时保留旧策略 |
| `Commit(b)` | 一个大小为 `b` 的结果到达。`b ≤ L` 内联；否则卸载：描述头取 `1..headerMax`，预览取机械预览 `0..P` 或作者预览 `0..3`，作者预览 > P 时拒绝该结果，不发首屏。`Bug = "bypass"` 时不看 L，一律内联；`Bug = "rewrite"` 时把正文截断到 L 再内联 |

## 4. 假设与有限边界

- `K = 2`；`T ∈ {2, 4}`，`Tp ∈ {1, 2}`，`headerMax ∈ {1, 2}`；初始系统值 `S = 4`、`Sp = 2`；收紧后 `(4, 1)` 或 `(2, 1)`。
- 正文大小 `1..5`，作者预览 `0..3`，最多一次重启、两个结果。大小是抽象单位，不区分 UTF-8 字节与字符。
- 描述头大小只在 `1..headerMax` 中选取，不依赖正文大小；这表达「描述头是元信息」。机械预览函数按格式分派的具体规则、行与记录边界对齐没有建模。
- 没有公平性，不检查进展。`CHECK_DEADLOCK FALSE`。
- 期限 D 与读回不在本模型里，归 [BodyLifecycle](../body-lifecycle/README.md)。

## 5. 性质

性质里的上界从声明和首屏记录里当时的系统值重新算出，不用 `policy`，因此受理或策略缓存的错误不会把上界一起算错。

| 名称 | 含义 |
| --- | --- |
| `FirstScreenWithinL` | 每个首屏的总大小 ≤ `min(T, S)` |
| `PreviewWithinBudget` | 卸载的首屏：描述头在 `1..headerMax`，预览 ≤ `min(Tp, Sp, ⌊min(T, S) / k⌋)`，S 与 Sp 取发出首屏时的系统值 |
| `InlineOnlyWithinL` | 内联的首屏，其正文产生时的大小 ≤ `min(T, S)` |
| `BodyPreserved` | 正文的存储大小等于产生时的大小：不为了放进首屏而改写正文 |
| `AcceptedDeclarationFits` | 已受理的策略满足 `header + P ≤ L` |

## 6. 负控

| 配置 | 去掉的规则 | 必须命中 |
| --- | --- | --- |
| `max-not-min` | P 取 `max(Tp, Sp, ⌊L / k⌋)` | `PreviewWithinBudget` |
| `stale` | 系统值收紧后继续使用旧的受理策略 | `PreviewWithinBudget` |
| `header-in-budget-mismatch` | 受理时把描述头算在 P 内（只检查 `P ≤ L`），首屏却把它放在 P 外 | `FirstScreenWithinL` |
| `bypass` | 不看 L，一律内联 | `FirstScreenWithinL` |
| `rewrite` | 正文超过 L 时截断到 L 再内联 | `BodyPreserved` |

`stale` 的反例：`T = 4`、`Tp = 2`，受理得 `L = 4`、`P = 2`；重启把 `Sp` 收紧到 1；旧策略下卸载一个大小 5 的正文，预览 2 超过当前的 `P = min(2, 1, ⌊L / 2⌋) = 1`。

`header-in-budget-mismatch` 的反例：`T = 2`、`headerMax = 2`，`L = 2`、`P = 1`；受理只检查 `1 ≤ 2`；大小 3 的正文卸载后，首屏 = 描述头 2 + 预览 1 = 3 > L。按契约检查 `headerMax + P = 3 > 2`，这条声明会被拒绝。

`max-not-min` 的反例：`T = 4`、`Tp = 1`，`L = 4`，正确的 `P = min(1, 2, 2) = 1`，取最大值得 2；大小 5 的正文卸载后预览 2 > 1。

负控配置只列目标性质，保证反例确实走到它。

## 7. 代码对应

| 模型 | 代码位置 | 状态 |
| --- | --- | --- |
| `Threshold`、`Budget` | `tool` 包 [result-offloading.ts](../../../../tool/src/result-offloading.ts) 的 `offloadingBounds`（`L = min(T, S)`）与 `previewBudget`（`P = min(Tp, Sp, ⌊L / k⌋)`） | 已实现 |
| `Accept` | 同文件 `offloadingFits`（`headerMax + P ≤ L`）。作者声明由 `callOffloadingFits` 在 [runtime.ts](../../../../tool/src/runtime.ts) 的 `invoke` 受理调用时检查，工具执行前拒绝；系统声明 `SYSTEM_RETURN` 由 [configuration.ts](../../../../tool/src/configuration.ts) 启动时检查 | 已实现 |
| `decl.Tp` | `tool-contract` 返回声明 `returns.offloading.preview: system \| bounded(maxPreviewUtf8Bytes)` | 已实现 |
| `sys.S`、`sys.Sp`、`K` | `ToolOffloadingConfiguration` 的 `maxInlineUtf8Bytes`、`previewUtf8Bytes` 与 `previewDivisor`（缺省 8） | 已实现 |
| `Commit` 的卸载分支、`Screen` | [body-preview.ts](../../../../tool/src/body-preview.ts) 的 `mechanicalPreview` 与 `bodyHeader`，`headerMax` 给出声明下描述头的上限；`planResultBody` 把预览放在描述头前 | 已实现 |
| `Commit` 的作者预览拒绝 | `planResultBody` 对作者 `content` 与 `original.summary` 的 `author-preview-too-large` 拒绝；描述头接在作者内容之后（`withHeader`） | 已实现 |
| `Commit` 的内联分支、`BodyPreserved` | `planResultBody`：`body ≤ L` 内联，否则交给正文写入卸载，不改写正文 | 已实现 |
| `Restart` | 重新装配时 `checkToolConfiguration` 重新检查，每次调用按当前系统值重新受理 | 已实现 |

## 8. 运行与判读

使用 OpenJDK 21 与 TLC 1.7.4。通过 `--jar` 或 `TLA2TOOLS_JAR` 指定 JAR，摘要固定为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`，不匹配时拒绝运行。

```sh
export TLA2TOOLS_JAR=/path/to/tla2tools-1.7.4.jar
python3 packages/tool/tool-contract/verification/models/disclosure/check.py --out tmp/<task>/disclosure
```

可用 `--case positive` 选一个配置。脚本用一个 worker，每配置上限 120 秒，日志与汇总写到 `--out`，不写进本目录。本目录不保存执行结果。正控要求退出 0 且 TLC 明确完成检查；负控要求退出 12 且唯一违反的不变量等于指定名称。超时、解析错误和其他非零退出均失败。
