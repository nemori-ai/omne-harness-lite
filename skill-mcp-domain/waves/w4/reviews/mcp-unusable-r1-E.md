# w4-mcp-unusable 关口评审 E 面原文

交回时刻 2026-11-06T15:50:47.638Z（会话记录），代理 `ac0254dfcef8c3e27`。原样保存，裁定见 `mcp-unusable-r1.md`。

---

## E 面结论：闭包 w4-mcp-unusable（PR #1159，head 559be1514）的交付边界

本面只读，没有改文件，没有接受，也没有合并。证据只认卡 #1119 评论 6688727559（作者 PanQiWei，2026-11-06T15:38:27Z，晚于 head 的提交时刻 15:36:06Z）。PR #1159 状态 OPEN，head `559be15145be…`，base `PanQiWei/skill-mcp`，工作树 head 与 PR 一致，`git status` 干净。评论引用的哈希我逐个对了原件，sha256 前 12 位全部一致：
- `tmp/closures/w4-mcp-unusable/logs/acc1-test.log`
- `…-guard/logs/accept1.log`、`accept1-slow.log`、`positive-test.log`、`mutated-test.log`、`restored-test.log`、`final-*.log`、`gate-format:check.log`
- `…/gate/` 下四份

**一句话：** 候选里的产品事实基本都成立，未达到的多数是卡上缺证据。有两处是实质缺口：
- 还原后「同一命令退出 0」的那次运行实际退出 1，现在靠裁定代替。
- lost.spec 第 3 条有 4 个用例，没有任何记录在案、能让它们变红的改动。

### 各项证据出自哪个提交

| 证据 | 提交 | 能否覆盖 head |
| --- | --- | --- |
| 产品写者三成员 `build typecheck test`（`6174c3d1e08b`） | `78d850505` | 否，被守护写者的运行取代 |
| 守护写者三成员 `build typecheck test --force`（`3fb7238ccb0f`）与 `test:slow`（`73cbfff7645f`） | `06773cbcb` | 能 |
| 正控、变异、还原后运行（`d7ffc82b07d0`、`b2008c834168`、`79cdbe00dc2e`） | `06773cbcb` | — |
| `check:docs`、`lint:rules`（守护写者） | `11b5d4ff5` | 能（之后只改了 SPEC.md） |
| `format:check` | `06773cbcb` | 能 |
| typecheck、lint:rules、lint:oxlint、lint:deps（派发者） | `559be1514` | 是 |

为什么 `06773cbcb` 上的运行能覆盖 head：
- `06773cbcb..HEAD` 只改了 4 个 `.md`：`mcp/README.md`、`SPEC.md`、`docs/architecture.md`、`verification/README.md`。
- `mcp` 的用例不读这些文件，只在注释里提到 `verification/README.md`。
- `format.sh` 在 `packages/*` 下只查 JS/TS、`package.json` 与 `tsconfig`。

### 逐条判据

**W4 MCP plan 切片 01**

- **M4-1：未达到（卡上缺证据）。**
  - 原文要求「两条输出贴卡」，卡上只有一句结论「偏离一节删空」。
  - 我在 head 上核了，产品事实成立：awk 输出是标题加「没有偏离。」，`grep -c` 输出 `0`。
- **M4-2：未达到（卡上缺证据）。**
  - 要求「输出贴卡」，并记录调用点清单。卡上两个 grep 的输出都没有，调用点清单也没有，只有一句「只经它判断」。
  - head 上的事实：两个 grep 都没有输出。`git grep` 列出三个调用点：`calls.ts:311`、`discovery.ts:154`（判断在 `lostPageOf`，`:106`）、`tasks.ts:152`。
  - 逐一读回调用点之前的判断归 A 面。
- **M4-3：未达到（按原文）。**
  - 正控达到：`d7ffc82b07d0` 退出 0，`marks` 场景没有违例。
  - 负控达到：`b2008c834168` 退出 1，报出 `P15-lost-on-usable-failure` 与 `P15-teardown-on-usable-failure`。
  - 缺「按字节还原后重建，再跑一次退出 0」：还原后同一命令的运行 `79cdbe00dc2e` 退出 1（`wide` 场景超时）。卡上只写了「wide 超时」，没有写退出码。
  - 还原后的重建日志（`restored-build.log`）不在卡上。
  - 派发者用 `3fb7238ccb0f` 代替，那是另一条命令，见冲突项 5。
  - 没有加 TLA+ 配置，所以 TLA+ 那一条不触发。
- **M4-5：达到。**
  - `3fb7238ccb0f` 退出 0，23/23 任务；契约 685、`mcp` 502、`mcp-host-local` 410（1 条跳过，在 e2e journey 里）。
  - `test:slow`（`73cbfff7645f`）退出 0，13/13 任务。
- **七项轻门禁：达到。**
  - head 上四项都有退出码与哈希。
  - `check:docs` 在 head 上退出 0（2825 个文件），但卡上这一次没有哈希；`11b5d4ff5` 上的那次有哈希 `dfc597b573a6`。
  - `format:check` 在 `06773cbcb` 上跑，卡上写了覆盖 head 的理由，理由成立。
  - 成员门禁按 `3fb7238ccb0f` 算。
- **契约用例（守护写者）：达到。**
  - 漏标的失败清单恰为 S01、S02、S03、S04、S07、X02。
  - 错标的失败清单恰为 D15、D16、I06、O05、O06、O07、C04。
  - 两条用例都用 `toEqual` 比较，两种传输各跑一遍。
  - 正常运行（据 `accept1.log`）：
    - 脚本化传输：`transport-conformance.spec.ts` 219 条全过。
    - 真实传输：stdio 优先 98 条通过、0 失败；HTTP 优先 97 条通过、0 失败。
- **`mcp` 用例（产品写者）：用例达到（`discover` 一项按裁定）；卡上证据未达到。**
  - 候选里有：
    - 调用：`invoke.spec` 第 9、12 步。
    - 任务：`tasks.spec` 的 it.each。
    - 页请求：`refresh.spec` 带标记与不带标记的两组。
    - 第 2 条：`lost.spec` rule 2。
    - HTTP 5xx 与流断开：第 12 步两例。
    - 不带标记的 `not-sent` 答 `page-failed` 并转 `degraded`。
  - 「`refresh` 的 `discover`」没有实现：按追加 1-2 改成了建连中的 `discover` 用例，见冲突项 2。
  - 卡上没有列出这些用例。

**产品闭包验收清单**

1. **达到。** `6174c3d1e08b` 有用例数与哈希。产品写者自己的 `test:slow`（`1f2318520fa2`）不在卡上，由守护写者在更晚字节上的 `73cbfff7645f` 覆盖。
2. **未达到（卡上缺证据）。** 同 M4-2。
3. **未达到（卡上缺证据）。** 同 M4-1。
4. **未达到（变红验证）。**
   - 用例本身在，`discover` 一项见冲突项 2。
   - 卡上只有一句「U1–U14 …（tmp/…/mut/）」和「U1–U5、U12 记进了 README」，没有逐条用例对应变红改动的表。
   - 候选里的 `verification/README.md` U1–U5、U12 行有用例集与哈希。
   - `lost.spec` 的「rule 3」中 `error-answer`、`answer-malformed`、`result`、`error` 四例，在任何记录里都没有能让它们变红的改动：U1–U14 的日志与 N11 都没有让它们变红。
   - `abandoned` 一例只在守护写者的 N11 下变红（`b2008c834168`），卡上没有点名。
5. **用例达到；卡上证据未达到（缺用例名单）。** 候选里四条都在：
   - stdio：`stdio.spec`「a process that exits before it answers … (T1, S02)」与「the SDK server's tool that exits the process … (T1, S04)」。
   - X02：「a process that does not read its stdin any more … (T1, X02)」。
   - S07：`http.spec`「… after DELETE the next request is session-ended, and it and every later request carry the mark (T1, S07)」。
   - 5xx：「a single POST answered 5xx fails that request without the mark, and the next request goes out」。
   - 卡上只有组运行的计数。
6. **未达到（只缺输出尾部）。** 六项在 head 上都退出 0，或有覆盖 head 的理由，退出码与哈希都在卡上。原文要求「输出尾部」，卡上只有 `check:docs` 的文件数。
7. **未达到（卡上缺证据）。** 卡上没有 `git diff --name-only` 的读数。我按文件归了类：
   - `F..78d850505` 共 33 个文件，除下面两个外都在派发时的写范围内：
     - `mcp-contract/src/testing-transport.ts`：追加 1-1 放行。
     - `mcp/tests/model/ports.ts`：追加 1-6 放行。
   - `UnusableCause` 定义移到 `outcomes.ts`：追加 1-3。
   - `F..HEAD` 另含守护写者的文件与派发者的 `559be1514`。

**守护闭包验收清单**

1. **达到。** `3fb7238ccb0f` 里 `marks` 场景 581 个状态、1192 次重放、深度 21，P1–P15 都成立。`73cbfff7645f` 退出 0。
2. **达到。** 同上「契约用例」。
3. **未达到（按原文）。** 同 M4-3：同一命令还原后退出 1，见冲突项 5。
   - 代替证据 `3fb7238ccb0f` 在 `06773cbcb` 上，`mcp` 502 条全过，含 `wide`。
   - 源码按字节还原，依据是 `negative-control.txt` 的「restored byte for byte」，它只在 tmp 里。三次的 turbo 构建哈希不同，但同期包里有文档改动，所以这既不能证明也不能否定按字节还原。
4. **未达到（卡上缺证据）。**
   - 要求逐行核对 T8 每一行与 T1 的「之后每个请求」「`close()` 之后」，写一致或不一致。卡上只有一句结论。
   - 两份违约清单是间接佐证，不是逐行核对表。
   - 追加 1-1 之后，这个核对是独立证据的替代，所以这条缺口比一般的证据缺口要紧，见冲突项 1。
5. **达到。** `lint:deps` 在 head 上退出 0（先构建了组外三个成员）。
6. **未达到。**
   - 卡上没有读数。
   - 按字面在 head 上不成立：`78d850505..HEAD` 含 `packages/mcp/mcp/SPEC.md`，它来自派发者的 `559be1514`，见冲突项 6。
   - 守护写者自己的范围 `78d850505..11b5d4ff5` 是 9 个文件，都在写范围内。子限制也守住了：
     - `architecture.md` 只改了第 25 行，`README.md` 只改了第 82 行。
     - `ports.ts` 原有的 `NOT_SENT`、`STREAM_BROKEN` 没有改。
     - `explore.ts` 只改了 P15 的接线。

### 冲突项（只列出，不下结论）

1. **产品追加 1-1：产品写者改套件的三处比较点，从 T8 表推出标记的期望。** 与下面这些原句冲突：
   - 产品「排除的调用方」：「`testing-transport.ts`…归守护写者…只做让它们编译通过的最小改动（字段透传）…条款本身不加。」
   - plan 切片 01：「符合性条款与违约实现不由产品写者写，使它们成为对传输实现的独立证据。」
   - W4 规格 §1 第 3 条：「符合性套件加条款：带『传输不再可用』的行，答复带标记。」实现把它并进了现有的比较，没有新增条款。
   - 产品验收 7（写范围）。
   - 替代的独立证据是守护验收 4 的逐行核对，而它不在卡上。
2. **产品追加 1-2：「`refresh` 的 `discover`」改为建连中的 `discover`，带不带标记建连都失败。** 与下面这些原句冲突：
   - 产品验收 4：「`refresh` 的 `discover` 各有『带标记转 `lost`、不带不转』」。
   - plan：「调用、任务、`refresh` 的页请求与 `discover` 各有…」。
   - W4 规格 §1 第 4 条：「适用范围是就绪连接上的请求：`refresh` 的 `discover` 与 `listActions`」。
   - 另外，W4 规格 Testing Decisions 的「`mcp` 的调用、任务、建连各有用例：带标记转 `lost`，不带不转」，本身就与 §1 第 4 条末段「建连不在此列」矛盾。
3. **产品追加 1-3 的一部分。**
   - `answer-readings.ts` 透传标记，与写范围冲突：「仅限随 `UnusableCause` 收窄必需的改动」。
   - `UnusableCause` 定义移到 `outcomes.ts`，与写范围冲突：`outcomes.ts` 写的是「第 1 条：`PeerAnswer` 的字段」，`UnusableCause` 列在 `decisions.ts` 下。
4. **产品追加 1-6：产品写者改 `tests/model/ports.ts`。** 与下面这些原句冲突：
   - 写范围：「不含 `tests/model/`，归守护写者」。
   - 排除：「`tests/model/`、探索器：归守护写者」。
   - 停止条件第 2 条。
5. **守护 15:36 裁定 1：用 `3fb7238ccb0f`（三成员 `build typecheck test --force`）代替还原后的运行。** 与下面这些原句冲突：
   - 守护验收 3：「按字节还原、重建后同一命令退出 0。三次运行的退出码与日志哈希写进交回。」
   - plan M4-3：「按字节还原后重建，再跑一次退出 0。三次的退出码与日志哈希贴卡。」
   - 实际情况：同一命令还原后退出 1（`79cdbe00dc2e`），代替的那次是另一条命令。
6. **守护 15:36 裁定 2：派发者在 `559be1514` 把 P15 写进成员 SPEC。** 与下面这些原句冲突：
   - 守护「排除的调用方」：「三个成员的 `SPEC.md`：产品写者已改，本闭包不碰。」
   - 守护验收 6：「`git diff --name-only 78d850505..HEAD` 只含写范围内的文件」。

下面这些核对过，不构成冲突：
- 追加 1-4：删跳过分支，已定第 4 条预先写了。
- 追加 1-5：`session.ts` 逐字节约束，收窄了第 9 条。
- 守护追加 1（15:00）：计时指令。
- 15:36 裁定 3：`Calls.tla` 注释记为待清理，已定第 6 条只要求写明能不能表达。
- 15:36 裁定 4：交给 A 面。
- 卡上派发者认可的两件：
  - 就绪 `discover` 的错误答复转 `degraded`，由已定第 7 条末项与全函数第 3 条要求。
  - `streamGoneAnswerOf` 收窄：写范围列了它。

### 未覆盖与不归本面

- 守护已定第 2 条要求把没选的错标写法（换原因）写进「未覆盖」并说明理由。卡上的「未覆盖」没有这一项。它不是验收条目，只提一下。
- PR 正文写「两种真实传输 410 条（1 条跳过）」，这是 `mcp-host-local` 的总用例数。真实传输上的符合性用例是 198 条。卡上的写法是对的。
- `ports.ts` 给六个端口都加了 `fail-usable` 答复，与已定第 4 条「不放大探索空间」是否一致，以及 `wide` 的状态数与耗时，归 A 面。
- P15 的见证质量、`lostOf` 与调用点的逐行判读归 A 面。SPEC 措辞归 B 面。`unusable?` 的形状归 C 面。差分变异由派发者跑。
