# verification/models

本目录承载本包的形式模型，例如 TLA+、Alloy 或 SMT 模型。

## 允许的内容

模型源文件、配置与说明。

## 边界

说明模型对应的 `SPEC.md` 条款、抽象前提与未覆盖的部分。模型通过不等于实现符合。

## 维护

承诺或实现结构变化时，复核模型的抽象是否仍然成立。改了模型或配置之后，重跑下表的全部配置，并更新表中的数字。

## 本包事实

本包有一个模型：[ReadGate.tla](ReadGate.tla)。它表示 `SkillAccess` 的四个操作（组页「读取」第 1–11 步，字节范围除外）与 `SkillCatalog` 的列出，在三个端口上运行。它检查[性质账本](../README.md#ledger)的 S1、S2、S3、S5、S6 与 S7。S4 不在模型里。

### 模型怎样表示

- 一个观察者主体。两个身份：`h`（被隐藏或被考察的身份）与 `x`（另一个身份）。每个身份有两份材料 0 与 1。材料 1 多一个条目 `new`。条目 `SKILL` 的字节在两份材料里不同，`res` 与 `new` 的字节相同。
- 两个运行 `1` 与 `2` 共用一个请求与一份日程：端口故障、中止点（第几个端口答复时中止）与来源变化点（第几个端口答复之后来源换内容）。这就是自组合。
  - `Mode = "twin"`：两个运行看见两个世界，它们只在 `h` 对观察者怎样不可用上不同：`refused-hides`、`refused-shows`、`checked-only`、`deleted`。不变式 `SameObservation` 是 S1。
  - `Mode = "same"`：两个运行看见同一个世界，只在目录读取判定的完成次序上不同。不变式 `SameObservation` 是 S5。
  - `Mode = "single"`：只有运行 1。
- 端口答复是抽象的。`undecided` 代表实现解析成「没有作答」的全部答复：`unknown`、畸形答复、reject、同步抛出、读取时抛出。来源的故障取 `undecided`、`notFound`、`entryNotFound`。
- 身份的状态 `nodigest` 是没有包的材料：来源在它的定位处没有包。对应端口的引用是否带内容摘要记在 `dig`。带依据时引用总是带回依据的内容摘要（PR3），没有包的材料也一样，所以这时读取走到快照一步，来源答 `notFound`，操作答 `basis-unavailable`。不带依据时，没有包的材料的引用不带内容摘要，操作答 `unsupported`。
- 对应端口可以答错指的引用（动作 `ResolveMisdirected`，故障 `misdirect-identity`、`misdirect-material` 与 `misdirect-digest`）：引用指向另一个身份的当前材料；或者带依据时指向所请求身份的另一份材料；或者带依据时不带内容摘要。成功的结果记下它写明的身份（`out.id`），交出的每一片内容记下 `<<身份, 材料, 条目>>`。条目 `SKILL` 的摘要随身份与材料而变，所以快照摘要也写明身份。边界解析（`Parsed`）把错指的答复变成 `undecided`；`Flaw = "noRefCheck"` 去掉这一核对。不变式 `OwnMaterialOnly` 是 S7。`misdirect-digest` 不能让任何不变式变红：把 `Misnames` 里的 `\/ ~a.dig` 删掉再跑 `ReadGate.cfg`，七个不变式仍成立，可以照此复现。原因是去掉核对之后，这种答复在模型里走「没有可读包」的路径答 `unsupported`，或者 `describe` 成功且身份是所请求的，七个不变式都看不出差别。所以 S7 的「带依据时引用不带内容摘要」这一子情形不由本模型证明，由探索器（`tests/model/` 的 `undigest` 错指）与单元用例承担。
- `Flaw` 选一个故意的缺陷。每条性质有一个负控配置，它必须报告反例。

<a id="mapping"></a>

### 与实现的对应

模型没有精化证明。下表写出对应关系。它由[探索器](../../tests/model/README.md)对真实实现的场景核对支持。

| 模型 | 实现（`src/`） |
| --- | --- |
| `Start` | `access/gate.ts` 第 1 步（依据的能力标识）与第一次 `checkpoint`；目录：`catalog.ts` 空的 `capabilities` 直接作答 |
| `Check` | `gate.ts` 第 2 步：`answered(check, parseVerdict)` 与前后的 `checkpoint` |
| `Resolve`、`ResolveMisdirected`（共用 `Resolved`） | `gate.ts` 第 3 步与 `gatedOf`；`service.ts` 的 `descriptionOf`（第 4 步）、`materialOf`（第 5 步）、`partOf`（第 6 步） |
| `Parsed`、`Misnames` | `port-answer.ts` 的 `parseResolution(request)` 与 `namesRequested`：引用身份一致的核对 |
| `at` | `SkillRef.locator`：快照与 `open` 用引用写明的身份的包定位 |
| `Snapshot` | `access/pin.ts` 第 7 步与 `mapping.ts` 的 `snapshot` 列；`service.ts` 第 8 步（`list`）与第 9 步（`entryAt`） |
| `Open` | `access/bytes.ts` 第 10 步与 `mapping.ts` 的 `open` 列；`export` 的逐条循环 |
| `LawfulSet`、`CompleteCheck` | `catalog.ts` 的 `lawfulEntries` 与 `grantedOf`（`Promise.all`，按条目次序读答复） |
| `undecided` | `port-answer.ts` 的 `answered` 答 `undefined`；`source-answer.ts` 的 `sourceAnswer` 答 `unavailable` |
| `abortAt`、`changeAt`、`smode` | 探索器的 `Schedule.abortAfter`、`Schedule.change.after`、`Schedule.addressing` |

模型把每次端口调用与紧接其后的检查点合成一个动作。模型没有表示：字节范围（S4）、`inspect`、映射表中 `notFound`、`entryNotFound` 与 `undecided` 以外的行、解析的逐字段规则、`describe` 结果的声明内容、不终止的端口。错指的引用只表示成「另一个身份」「另一份材料」与「没有内容摘要」：来源层、资产版本与内容摘要的值三个字段合在材料里，替换件的身份不在模型里。这些由探索器与用例承担，见[性质账本](../README.md#ledger)。

### 配置与结果

工具：TLC 2.19（tla2tools.jar v1.7.4，rev 5a47802），Java 21，`-workers 2`。模型是 w3-skill-fix 第 3 轮的版本（S7、三种错指、带依据时引用带回依据的内容摘要；`ReadGate.tla` 的 SHA-256 前 16 位 `a7cf1233b473196a`）。全部配置关闭死锁检查：`Done` 让结束状态停留，模型不声明活性。正控配置都检查全部七个不变式（含 S7 的 `OwnMaterialOnly`）。用时是 2026-11-05 实测，同机有其他负载。

| 配置 | 常量 | 不变式 | 初始状态 | 生成 / 不同状态 | 深度 | 用时 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [ReadGate.cfg](ReadGate.cfg) | `single`；无故障或 13 种故障之一（含三种错指 `misdirect-identity`、`misdirect-material`、`misdirect-digest`）；不中止；来源不变；两种来源 | 全部 | 580,608 | 2,590,632 / 1,976,328 | 8 | 34 s | 本范围内无反例 |
| [ReadGate_Change.cfg](ReadGate_Change.cfg) | `single`；无故障；来源不变或在第 0–5 个答复之后变化；两种来源 | 全部 | 290,304 | 1,321,620 / 1,013,172 | 8 | 22 s | 本范围内无反例 |
| [ReadGate_Abort.cfg](ReadGate_Abort.cfg) | `single`；无故障或来源 `undecided`；在第 0–6 个答复时中止；来源不变或在第 3 个答复后变化 | 全部 | 1,990,656 | 8,701,440 / 6,586,368 | 8 | 1 min 30 s | 本范围内无反例 |
| [ReadGate_Disclosure.cfg](ReadGate_Disclosure.cfg) | `twin`；6 对隐藏方式；无故障、`x` 的读取判定或合法集合 `undecided`；不中止或预先中止 | 全部 | 909,792 | 9,963,000 / 6,386,040 | 8 | 1 min 20 s | 本范围内无反例 |
| [ReadGate_Order.cfg](ReadGate_Order.cfg) | `same`；只有目录；`h` 被拒或被准许；读取判定或合法集合 `undecided` | 全部 | 2,160 | 83,160 / 47,736 | 9 | 4 s | 本范围内无反例 |
| [ReadGate_FlawNoRefCheck.cfg](ReadGate_FlawNoRefCheck.cfg) | `single`；无故障或三种错指之一；边界解析不核对引用 | `OwnMaterialOnly` | 165,888 | 497,687 / 456,199（中止于反例） | 4 | 9 s | 找到反例：观察者对 `h` 没有读取权（`refused-shows`），对应端口把 `x` 的 `describe` 答成 `h` 的引用，结果写明身份 `h` |
| [ReadGate_FlawRefusedAsBasis.cfg](ReadGate_FlawRefusedAsBasis.cfg) | 同 Disclosure；读取判定拒绝且带依据时答 `basis-unavailable` | `SameObservation` | 909,792 | 8,808,278 / 5,991,410（中止于反例） | 6 | 1 min 6 s | 找到反例：带 `h` 依据的 `describe`，`refused-hides` 答 `basis-unavailable`，`checked-only` 答 `not-available-to-you` |
| [ReadGate_FlawUnknownAsEmpty.cfg](ReadGate_FlawUnknownAsEmpty.cfg) | 同 ReadGate 的旧故障集（不含错指）；目录把 `undecided` 压成空列表 | `WholeUnknown` | 456,192 | 1,311,558 / 1,197,510（中止于反例） | 3 | 19 s | 找到反例：合法集合 `undecided`，目录答空列表 |
| [ReadGate_FlawNoEntryDigest.cfg](ReadGate_FlawNoEntryDigest.cfg) | 同 Change；第 10 步不核对条目摘要 | `NoMixedVersion` | 290,304 | 1,255,013 / 1,009,301（中止于反例） | 6 | 19 s | 找到反例：只按定位取字节的来源在快照之后换成材料 1，钉住材料 0 的 `read` 交出材料 1 的正文 |
| [ReadGate_FlawNoCheckAfterSnapshot.cfg](ReadGate_FlawNoCheckAfterSnapshot.cfg) | 同 Abort；快照之后不查 `signal` | `AbortStops` | 1,990,656 | 7,550,526 / 6,205,272（中止于反例） | 5 | 1 min 22 s | 找到反例：在第 3 个答复（快照）时中止，快照 `undecided`，`read` 答 `source-unavailable` 而不是 `aborted` |
| [ReadGate_FlawCompletionOrder.cfg](ReadGate_FlawCompletionOrder.cfg) | 同 Order；目录按完成次序列出条目 | `SameObservation` | 2,160 | 75,461 / 45,183（中止于反例） | 9 | 3 s | 找到反例：两个身份都被准许，两个运行以不同次序完成判定，条目次序不同 |

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

有限模型未发现反例，不推广到任意规模，也不推广到真实实现。两个身份、两份材料、单一故障与单一主体是本模型的范围。真实端口、端口不终止、引用写明的身份与包定位不符（S7 的前提 R1）、多个并发操作对同一个来源的写入都不在模型里。
