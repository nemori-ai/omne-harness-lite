# w3-mcp-host-docs2 交回

## 1. 结论
做完了，三个停止条件都没有触发：mutate.ts 12/12 变红，汇总日志哈希 `fabd677df965c026`，与派发者复跑的相同；探索器快层、慢层在基线上都是 0 违例。
没有改代码、用例和模型。四个门禁在最终 head 上退出 0。

工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，分支 `PanQiWei/skill-mcp-w3-mcp-host`，基线 `06b98034d`，最终 head `a31a05ee7`，`git status` 干净，没有推送。

## 2. 提交
作者和提交者都读回为 `PanQiWei <594557445@qq.com>`，每个提交都带 `Harness: claude-code` 与 `Agent-Role: developer`。
- `3ff69c68d`：探索器一侧的证据重写，对应规格第 1、6 条。
  - `verification/README.md`：动作映射的实现一列写了实际名字，状态映射、运行命令、运行记录表、「两种证据能变红」都按最终代码重写。
  - `SPEC.md`：契约修订钉到 `06b98034d`，同一行的裁定范围从 1–9 改为 1–14；证据表探索器一列改成新负控名。
- `6775998d3`：第 2–5 条。
  - `SPEC.md`：锚点、自定 4、H9、H12、MC3-10。
  - 其余文件：两份 README、`docs/` 的 `flows`、`architecture`、`object-model`、`context`，以及 `index.md`、`tests/fixtures/README.md`。
- `a31a05ee7`：收口修订。
  - `SPEC.md`：「本包自定」删去原第 4 条（它已写进契约 T5，留着与该节标题「契约没有写」矛盾），原第 5–10 条改为第 4–9 条。
  - `docs/architecture.md`：其中对「自定」的指引同步改为「自定 9」，并把「只由 `close()` 放开」的出处从契约 T5 改指本成员 SPEC 的「性质与证据」（端口失败模型）。
  - `verification/README.md`：动作映射里工作流入口的描述改准。

## 3. 改动文件
范围内文件共 10 个（`git diff --name-only 06b98034d..HEAD`，范围外 0 个）。
- `SPEC.md`
  - 契约修订钉到基线，裁定范围改为 1–14。
  - T5 与 T4 的链接锚点从 `#t8` 改为 `#port-transport`（共 3 处）。
  - 自定 4 删除并改编号。
  - H9、H12 删去对契约条款的复述，只写本包的兑现方式并指条款。
  - 「未覆盖」里的 MC3-10 换成缺陷描述。
  - 证据表探索器一列：V1 改为手工变异，V2 改为 `mV2-forgets-close`（两处守卫），V4 改为 `mV4-signal-dead`、`mV4-close-settles-after-line`、`mV4-caller-follows-workflow`，V6 加 `mV6-authorizing-abandoned`。
- `verification/README.md`
  - 动作映射：「以 fix2 交回为准」的占位句已删，实现一列写 `begin`、`work`、`sendOut`、`callHandle`、`enterDiscovery`、`refusalOf`、`stop`、`departed`、`wireSignal`、`die`、`close()` 的 `closing` 等。
  - 状态映射跟随新名字（`phasesAtSignal`、`phasesAtClose`、`closeCalled`、`closeReturned`、`op.signalled`）。
  - 模型抽象里补了 `cancelRequest` 当即返回，以及探索器三个端口可答 `hang`、计入 `breaches` 预算。
  - 运行命令：`mutate.ts` 的用法替换了 tmp 里的脚本。
  - 运行记录表：数取自本次运行，上限一列按 `scenarios.ts` 重写，场景名小写，日期 2026-11-06。
  - 「两种证据能变红」：整节重写，列出 12 个负控和 V1、V2 的说明。
- `README.md`、`README_ZH.md`：「读不懂的行」改为「解析不了的行」（英文 `lines that do not parse`）；维护节的一句按我自己的判断改写（见第 7 节）。
- `docs/flows.md`
  - 流程图：`Pending` 的结算与出发点、`work`、调用方只等结算、`callHandle` 与 `inFlight` 核对、`teardown.signal`、连接模式 `legacy`。
  - 失败表：加「条款」一列，每行指向契约或 SPEC 的条款；`cancelRequest` 当即返回，`signal` 与 `close()` 按相当场结算且 `close()` 不等发现，`close()` 重复调用得到同一次关闭的结果。
- `docs/architecture.md`
  - 模块表按新状态改；新增「调用方等结算，不等工作流」一条。
  - 「再发」「退出窗口」两条改为只写理由并指条款。
  - 原 `:37` 的「等到 `close()` 或 `signal`」改为「只由 `close()` 放开（契约 D14、I05、O04）；`call` 另可由 `signal` 放开（C03）」。
- `docs/object-model.md`：`Pending` 的 `answered`/`departed`、`phase` 判别联合、新增 `Connection` 行、`StdioLine` 的 `writes` 计数与 `closing`、`close()` 可重复调用。
- `docs/context.md`：凭据调用时机那句挂了 T9 与 H4 的指针。
- `index.md`：列出「性质与证据」与「与契约的已知偏离」，verification 一行改写。
- `tests/fixtures/README.md`：补 `settle.ts`。

## 4. 验收逐项

### 验收 1：门禁
四个门禁都在最终 head `a31a05ee7` 上运行，退出 0。日志在 `tmp/closures/w3-mcp-host/docs2/gates/`，哈希是 SHA-256 前 16 位。

| 门禁 | 时刻（UTC，2026-11-06） | 输出尾部 | 日志哈希 |
| --- | --- | --- | --- |
| `check:docs` | 02:15:57 | `PASS: 2738 Markdown files; local links and skill mirrors.` | `13e32caa15bb87fb` |
| `check:design` | 02:15:45 | `PASS: 354 个词条、69 条对象条目、10 项待裁、17 个当前 PD，对账一致。` | `66abdcb4075c92fb` |
| `format:check` | 02:15:16 | `All matched files use the correct format.`（4212 个文件） | `ffa21d9a7638c622` |
| `lint:rules` | 02:15:48 | `PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6046 个提交的署名，无违反。` | `838309a7ff1da847` |

另外 `git ls-files --eol` 中 `w/crlf` 为 0 个。
`SPEC.md` 没有跑 oxfmt，因为它不在格式化维护范围内；其余改过的 md 都跑了 oxfmt。

### 验收 2：写范围
`git diff --name-only 06b98034d..HEAD` 只含第 3 节列的 10 个文件，范围外 0 个。

### 验收 3：grep
命令：`git grep -n "Deferred\|mV2-send-after-close\|mV4-close-after-line\|以 .w3-mcp-host-fix2. 交回为准\|mutate.py" -- packages/mcp/mcp-host-local`
结果：0 行，文档和代码里都没有命中，所以没有需要逐条说明的同名标识符。
`tests/model/properties.ts` 里的 `V4-close-after-line` 签名不在这条模式内（formal2 已提过）。

### 验收 4：B 的 NB6–NB13 与 fix2 第 8 节
| 项 | 状态与位置 |
| --- | --- |
| NB6 钉的契约修订 | 已改，`SPEC.md:9` 与 `:35`；同一行的「1–9」一并改为 1–14，否则与钉住的修订矛盾 |
| NB7 锚点 | 已改，`SPEC.md` 的端口失败模型、V3、V6 三处（`#t8` → `#port-transport`） |
| NB7 探针路径、「契约裁定 2」 | 基线上已正确，我没有改：探针路径在 `SPEC.md:206`（`tests/probes/`）；「裁定 2」在 `SPEC.md:200`，已链到 `#decisions-host` 第 2 条 |
| NB8 偏离受影响的行 | 基线上已正确，`SPEC.md:168` 已含 I06、O06 |
| NB9 H8 首句 | 基线上已正确，`SPEC.md:90` 已写「只有 2xx 正文越界是流断开」 |
| NB10 DELETE 的情态 | 基线上已正确：契约 T5 写「不要求」，成员 SPEC 的 `:30`、`:84`、`:159` 一致 |
| NB11 自定 4、H9、H12 | 已改，见第 3 节；MC3-10 已换成缺陷描述；「第 1 轮阻断」列和「同一时段」记述在基线上已无；`mutate.py` 和 `Deferred` 的残留已清（grep 为 0） |
| NB11 探索器变异做法入库 | 已改，`verification/README.md` 的运行命令一节改指 `node tests/model/mutate.ts` |
| NB12 | 已改，`README.md:13`、`README_ZH.md:13` |
| NB13 `index.md` | 已改，`index.md:8` 起 |
| NB13 `tests/index.md`、`tests/README.md` | 基线上已列 `model/` 与 `probes/`（fix2 的 `c8a78f888`），未改 |
| NB13 `tests/fixtures/README.md` | 已改，补 `settle.ts` |
| NB13 `architecture.md:37` | 已改，见第 3 节 |
| NB13 复述未挂条款指针 | 已改：`context.md` 挂了 T9，`flows.md` 失败表加条款列 |
| NB13 契约 `docs/public-api.md:11` | 未改（范围外），见第 7 节 |
| fix2 第 8 节：`SPEC.md:230` 豁免句、V4、V6 | formal2 已改，基线上已一致，未动 |
| fix2 第 8 节：`verification/README.md` | 已改：映射表（原 `:43`）、挂起（`:56`）、运行记录（`:83-93`）、脚本指引（`:104`）、负控表（`:106-113`） |
| fix2 第 8 节：`flows.md` | 已改：`:18`、`:43`、`:67`、`:69` 对应处 |
| fix2 第 8 节：`architecture.md` | 已改：`:22`、`:37` 对应处 |
| fix2 第 8 节：`object-model.md` | 已改：`:15`、`:24`、`:39` 对应处，会话字段改为 `connection` |
| fix2 第 8 节：`README_ZH.md:65` | 见第 7 节，那条没有给改法，按我自己的读法改了 |

`verification/models/README.md` 没有改：它的链接 `../README.md#动作映射` 与 `#两种证据能变红` 仍然解析，没有句子因本闭包的改动过时。

### 验收 5：红灯表
路径 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/tmp/closures/w3-mcp-host/docs2/red-table.md`，SHA-256 前 16 位 `a8e2855762056416`。生成脚本是同目录的 `gen-red.mjs`，可重生成。
- **A 节**：12 个负控在本闭包基线 `06b98034d` 上重跑，退出 0，12 个全部变红，源码按字节还原。汇总 `docs2/mutate.log`（`fabd677df965c026`），每个负控的日志是 `docs2/mutants/<名>.log`。每行有变异号、文件与改动、用例全名、变红输出摘录、head、日志哈希。
- **B 节**：V1 的手工变异。
  - 变红：`sendOut` 去掉授权返回后的 `inFlight` 核对，`minimal`、`http-call`、`http-peer` 报 `V1-line.send-after-settle`，日志 `64bc20d3e69a5a8b`。
  - 存活：`settle` 去掉表守卫，探索器全绿，日志 `85ebc2ea65d54836`。
- **C 节**：fix2 的九条红灯用例，引用 `fix2/red/baseline-red.log`（`f5218dc7b283b46c`，被测 `src/` 是 `db06b5b70`），并引用 fix2 最终 head `0695f2ba4` 上的 turbo 日志 `f6d2d227a71f6a10`。
- **D 节**：第 1 轮的 m10、m11，共 55 行。
  - D.1 变红 43 行，D.2 没变红 12 行，照实列出，不判断。
  - 来源是 `w3-mcp-host-strength` 的原日志，最终清单 `final-mutants.tsv`（`62fe49b3555c459e`）。
  - 日志没有记 head，我给的是「不晚于日志写成时刻的该树最新提交」，每行都有；工作树当时可能有未提交改动。
  - 这些变异改的是第 1 轮的 `src/`，不能在本基线上原样复跑。

### 验收 6：探索器重跑
命令 `pnpm exec vitest run --mode fast tests/model` 与 `--mode slow --typecheck.enabled=false tests/model`，在成员目录运行，基线 `06b98034d`，2026-11-06 UTC 01:57。
- 快层：`8 passed | 3 skipped`，退出 0，`explorer-fast.log` 哈希 `4d4461ab35be6fa0`。
- 慢层：`3 passed | 8 skipped`，退出 0，`explorer-slow.log` 哈希 `1392e5cd4fc83875`。

运行记录表里的状态数、重放数、深度、耗时不是从上面两条命令来的，因为 `session-model.spec.ts` 只断言没有违例、不打印这些数。数取自 `docs2/stats.ts`，它对 `scenarios.ts` 的每个场景直接调用一次 `explore()`，输出在 `docs2/explorer-stats.log`（`ec5da5d117d4aa91`），8 个场景都是 0 违例。验收 6 要的是「运行记录表的数取自这次运行」，取数方式与规格点名的命令不同，是否满足由派发者定。
`verification/README.md` 里写的取数做法是「对每个场景调用 `explore(scenario)` 读返回值」，不依赖 tmp 脚本。

这次的数与旧表不同，是因为三个端口可答 `hang` 后场景结构变了：

| 场景 | 状态数 |
| --- | --- |
| `minimal` | 31 |
| `http-call` | 125 |
| `http-peer` | 26 |
| `http-bare` | 442 |
| `stdio-call` | 191 |
| `stdio-discover` | 1905 |
| `http-resend` | 2927 |
| `sse-fallback` | 4786 |

## 5. 门禁日志的时间与提交号
- 第 4 节验收 1 的四份日志，都跑在最终 head `a31a05ee7` 上。
- 代码类运行（mutate、探索器、V1 手工变异）都发生在 `06b98034d` 上。之后三个提交只改文档，`git diff 0695f2ba4 06b98034d -- src tests ../mcp-contract/src` 为空，所以这些结果仍然适用。

## 6. 变异表
没有新增用例，所以没有写者约定里的「新用例变异表」。变异证据全在 `red-table.md` 的 A、B 节。手工变异做完后用 `cmp` 核对 `src/session.ts` 与备份字节相同，`git status` 干净。

## 7. 没覆盖的项与我自己的决定
**V1 的探索器负控。**
- `Deferred` 已不存在，规格允许「说明为什么单点变异不足以变红，或给出能变红的变异」，我两样都做了。
- `settle` 的表守卫加上 `Promise.withResolvers` 的第二次 resolve 是双重保证，单独去掉表守卫探索器不红，因为再结算一次没有端口调用，探索器的 V1 形式看不见。
- 能变红的单点变异是 `sendOut` 去掉授权返回后的 `inFlight` 核对。
- **待派发者处理（能自己定的部分我已定）：这个变异没有入 `mutants.ts`，那属于代码范围。** 文档里已写明它是手工变异、`mutate.ts` 不复跑，建议在后续闭包里补进去。

**我自己读的判断（都是能自己定，依据写在后面）。**
- 自定 4 删除而不是留墓碑：它已写进契约 T5，留着与该节标题「契约没有写」矛盾；删除后编号改了，对「自定 N」的引用只有 `architecture.md` 一处，已同步。
- `README_ZH.md:65` 与 `README.md` 对应句：fix2 第 8 节只列了行号没写改法，所以这条是我自己的读法。我读成「共用规则已移到契约根导出，旧写法『T3、T5、T9 改变发出、取消或关闭方式时 session.ts 随之变』已不准」，据此改写。如果规格另有意图，请指出。
- `docs/flows.md` 失败表加了「条款」列，是对 NB13「复述处挂条款指针」的兑现方式；表宽变化由 oxfmt 整理。

**需要其他拥有者处理（范围外，没改）。**
- 契约 `packages/mcp/mcp-contract/docs/public-api.md:11` 的 `./testing` 运行时导出，比契约 SPEC `:114` 列的少：缺 `TRANSPORT_TABLE`、`transportCells`、`rowsOf`、`cellsOf`、样本构造器、`createScriptedTransportFactory`、`classifyOutcomeCases`、`mergeListingCases`、`CaseVerdict`。我无法确认它是不是 fix2 改的。
- 契约 SPEC 的锚点：T1–T7 在 `#port-transport`，T8 在 `#t8`，T9 在 `#t8-end`。`#t8-end` 这个名字对 T9 不太直观，但在契约里，我没动。

**未验证。**
- 真实组合（`@omne-harness/mcp` 加本包）、真实远程对端都没运行。
- `lint:oxlint`、`lint:deps`、`typecheck`、`metrics` 没跑：没有代码改动，规格也没要求。
- admission、全量测试、差分变异按规格没跑。

