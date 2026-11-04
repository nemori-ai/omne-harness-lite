# verification/models

本目录承载本包的形式模型，例如 TLA+、Alloy 或 SMT 模型。

## 允许的内容

模型源文件、配置与说明。

## 边界

说明模型对应的 `SPEC.md` 条款、抽象前提与未覆盖的部分。模型通过不等于实现符合。

## 维护

承诺或实现结构变化时，复核模型的抽象是否仍然成立。改了模型或配置之后，重跑下表的全部配置，并更新表中的数字。

## 本包事实

本包有一个模型：[ReadGate.tla](ReadGate.tla)。它表示 `SkillAccess` 的四个操作（组页「读取」第 1–11 步，字节范围除外）与 `SkillCatalog` 的列出，在三个端口上运行。它检查[性质账本](../README.md#ledger)的 S1、S2、S3、S5 与 S6。S4 不在模型里。

### 模型怎样表示

- 一个观察者主体。两个身份：`h`（被隐藏或被考察的身份）与 `x`（另一个身份）。每个身份有两份材料 0 与 1。材料 1 多一个条目 `new`。条目 `SKILL` 的字节在两份材料里不同，`res` 与 `new` 的字节相同。
- 两个运行 `1` 与 `2` 共用一个请求与一份日程：端口故障、中止点（第几个端口答复时中止）与来源变化点（第几个端口答复之后来源换内容）。这就是自组合。
  - `Mode = "twin"`：两个运行看见两个世界，它们只在 `h` 对观察者怎样不可用上不同：`refused-hides`、`refused-shows`、`checked-only`、`deleted`。不变式 `SameObservation` 是 S1。
  - `Mode = "same"`：两个运行看见同一个世界，只在目录读取判定的完成次序上不同。不变式 `SameObservation` 是 S5。
  - `Mode = "single"`：只有运行 1。
- 端口答复是抽象的。`undecided` 代表实现解析成「没有作答」的全部答复：`unknown`、畸形答复、reject、同步抛出、读取时抛出。来源的故障取 `undecided`、`notFound`、`entryNotFound`。
- `Flaw` 选一个故意的缺陷。每条性质有一个负控配置，它必须报告反例。

<a id="mapping"></a>

### 与实现的对应

模型没有精化证明。下表写出对应关系。它由[探索器](../../tests/model/README.md)对真实实现的场景核对支持。

| 模型 | 实现（`src/`） |
| --- | --- |
| `Start` | `access/gate.ts` 第 1 步（依据的能力标识）与第一次 `checkpoint`；目录：`catalog.ts` 空的 `capabilities` 直接作答 |
| `Check` | `gate.ts` 第 2 步：`answered(check, parseVerdict)` 与前后的 `checkpoint` |
| `Resolve` | `gate.ts` 第 3 步与 `gatedOf`；`service.ts` 的 `descriptionOf`（第 4 步）、`materialOf`（第 5 步）、`partOf`（第 6 步） |
| `Snapshot` | `access/pin.ts` 第 7 步与 `mapping.ts` 的 `snapshot` 列；`service.ts` 第 8 步（`list`）与第 9 步（`entryAt`） |
| `Open` | `access/bytes.ts` 第 10 步与 `mapping.ts` 的 `open` 列；`export` 的逐条循环 |
| `LawfulSet`、`CompleteCheck` | `catalog.ts` 的 `lawfulEntries` 与 `grantedOf`（`Promise.all`，按条目次序读答复） |
| `undecided` | `port-answer.ts` 的 `answered` 答 `undefined`；`source-answer.ts` 的 `sourceAnswer` 答 `unavailable` |
| `abortAt`、`changeAt`、`smode` | 探索器的 `Schedule.abortAfter`、`Schedule.change.after`、`Schedule.addressing` |

模型把每次端口调用与紧接其后的检查点合成一个动作。模型没有表示：字节范围（S4）、`inspect`、映射表中 `notFound`、`entryNotFound` 与 `undecided` 以外的行、解析的逐字段规则、`describe` 结果的声明内容、不终止的端口。这些由探索器与用例承担，见[性质账本](../README.md#ledger)。

### 配置与结果

工具：TLC 2.19（tla2tools.jar v1.7.4，rev 5a47802），Java 21，`-workers 2`。源码基线 `e0b68a7c3`。全部配置关闭死锁检查：`Done` 让结束状态停留，模型不声明活性。

| 配置 | 常量 | 不变式 | 初始状态 | 生成 / 不同状态 | 深度 | 用时 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [ReadGate.cfg](ReadGate.cfg) | `single`；无故障或 10 种故障之一；不中止；来源不变；两种来源 | 全部 | 456,192 | 2,021,868 / 1,539,756 | 8 | 20 s | 本范围内无反例 |
| [ReadGate_Change.cfg](ReadGate_Change.cfg) | `single`；无故障；来源不变或在第 0–5 个答复之后变化；两种来源 | 全部 | 290,304 | 1,310,280 / 1,001,832 | 8 | 14 s | 本范围内无反例 |
| [ReadGate_Abort.cfg](ReadGate_Abort.cfg) | `single`；无故障或来源 `undecided`；在第 0–6 个答复时中止；来源不变或在第 3 个答复后变化 | 全部 | 1,990,656 | 8,652,840 / 6,537,768 | 8 | 68 s | 本范围内无反例 |
| [ReadGate_Disclosure.cfg](ReadGate_Disclosure.cfg) | `twin`；6 对隐藏方式；无故障、`x` 的读取判定或合法集合 `undecided`；不中止或预先中止 | 全部 | 909,792 | 9,963,000 / 6,386,040 | 8 | 66 s | 本范围内无反例 |
| [ReadGate_Order.cfg](ReadGate_Order.cfg) | `same`；只有目录；`h` 被拒或被准许；读取判定或合法集合 `undecided` | 全部 | 2,160 | 83,160 / 47,736 | 9 | 3 s | 本范围内无反例 |
| [ReadGate_FlawRefusedAsBasis.cfg](ReadGate_FlawRefusedAsBasis.cfg) | 同 Disclosure；读取判定拒绝且带依据时答 `basis-unavailable` | `SameObservation` | 909,792 | 8,808,278 / 5,991,410（中止于反例） | 6 | 48 s | 找到反例：带 `h` 依据的 `describe`，`refused-hides` 答 `basis-unavailable`，`checked-only` 答 `not-available-to-you` |
| [ReadGate_FlawUnknownAsEmpty.cfg](ReadGate_FlawUnknownAsEmpty.cfg) | 同 ReadGate；目录把 `undecided` 压成空列表 | `WholeUnknown` | 456,192 | 1,311,558 / 1,197,510（中止于反例） | 3 | 14 s | 找到反例：合法集合 `undecided`，目录答空列表 |
| [ReadGate_FlawNoEntryDigest.cfg](ReadGate_FlawNoEntryDigest.cfg) | 同 Change；第 10 步不核对条目摘要 | `NoMixedVersion` | 290,304 | 1,255,013 / 997,961（中止于反例） | 6 | 12 s | 找到反例：只按定位取字节的来源在快照之后换成材料 1，钉住材料 0 的 `read` 交出材料 1 的正文 |
| [ReadGate_FlawNoCheckAfterSnapshot.cfg](ReadGate_FlawNoCheckAfterSnapshot.cfg) | 同 Abort；快照之后不查 `signal` | `AbortStops` | 1,990,656 | 7,550,523 / 6,205,269（中止于反例） | 5 | 57 s | 找到反例：在第 3 个答复（快照）时中止，快照 `undecided`，`read` 答 `source-unavailable` 而不是 `aborted` |
| [ReadGate_FlawCompletionOrder.cfg](ReadGate_FlawCompletionOrder.cfg) | 同 Order；目录按完成次序列出条目 | `SameObservation` | 2,160 | 75,461 / 45,183（中止于反例） | 9 | 2 s | 找到反例：两个身份都被准许，两个运行以不同次序完成判定，条目次序不同 |

负控配置的非零退出本身不算通过：每个负控都必须报告指定的不变式被违反，上表记录了实际的反例。

### 运行

在本目录运行。非登录 shell 先加载环境：

```sh
. /etc/profile.d/tlaplus.sh
tla2sany ReadGate.tla
tlc -workers 2 -metadir "$TMPDIR/readgate-meta" -config ReadGate.cfg ReadGate.tla
```

对上表每个 `.cfg` 运行一次。`-metadir` 指向任务 tmp，状态文件不进本目录。不缩小范围，也不改不变式来取得通过。

### 未覆盖

有限模型未发现反例，不推广到任意规模，也不推广到真实实现。两个身份、两份材料、单一故障与单一主体是本模型的范围。真实端口、端口不终止、端口违反 PR1 与 PR3、多个并发操作对同一个来源的写入都不在模型里。
