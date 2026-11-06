# w3-mcp-host-docs3 交回

## 1. 结论
闭包的十条已定的事全部落地，门禁在最终 head `f022dfb98` 上全部退出 0，只改了写范围内的文件。证据表里的读数都在本闭包基线 `72f977c81` 上重跑过。没有推送，没有开 PR。有三处过时句子在排除文件里，没有动，见第 7 节。

## 2. 提交
- `a40260339` docs(mcp-host-local)：性质陈述覆盖断开与 stdio 关闭，证据映射与最终 head 一致。
- `f022dfb98` docs(mcp-host-local)：证据表补不变式名，读数的出处不指向不入库的路径。
- 作者与提交者读回都是 `PanQiWei <594557445@qq.com>`。trailer 只有 `Harness` 与 `Agent-Role` 两行。

## 3. 改了哪些文件
`git diff --name-only 72f977c81..HEAD` 共 11 个，全在写范围内：
- 契约 `SPEC.md`、契约 `docs/public-api.md`。
- 成员 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/architecture.md`、`docs/flows.md`、`docs/object-model.md`、`tests/index.md`、`tests/fixtures/README.md`、`verification/README.md`。
- `index.md` 与 `tests/README.md` 核过，没有过时句子，没改。
- 过程材料在 `tmp/closures/w3-mcp-host/docs3/`。该目录被 gitignore，不入库：
  - `red-table.md`（`4aa66513a8830421`）与 `correspondence.md`（`97243322b1ae098a`）。
  - `gates/`、`model/`、`tlc/`、`mutants/`、`mutants-run-72f977c81.log`。
  - 生成脚本 `gen-red.mjs`、`correspondence.py`、`names.py`、`run-evidence.sh`。

## 4. 验收逐项
**验收 1**：门禁都在 `f022dfb98` 上运行，开始时间 `gates/final-time.txt`，日志在 `docs3/gates/`。

| 命令 | 退出码 | 输出尾部 | 日志 SHA-256 前 16 位 |
| --- | --- | --- | --- |
| `pnpm run check:docs` | 0 | `PASS: 2738 Markdown files; local links and skill mirrors.` | `32895c498b157729` |
| `pnpm run check:design` | 0 | `PASS: 354 个词条、69 条对象条目、10 项待裁、17 个当前 PD，对账一致。` | `f2650458e6041b72` |
| `pnpm run format:check` | 0 | `All matched files use the correct format.` | `17cf5ad9aae42bc6` |
| `pnpm run lint:rules` | 0 | `PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6064 个提交的署名，无违反。` | `6d0df98183044454` |
| `pnpm run lint:oxlint` | 0 | 无输出 | `66e497d11f63682a` |
| `git ls-files --eol`，改过的文件 | — | `w/crlf` 为 0 | `05877f6d4aea7647` |

**验收 2**：见第 3 节。

**验收 3**：
- NB-3
  - 承诺句：成员 SPEC「性质与证据」端口失败模型一段。`close()` 单列为只等线路的 `close()`，「线路的 `close()` 会答复」是线路端口对会话的义务。
  - V4 前提：同一份 SPEC 的 V4 一条。
  - 自定 9 补了 `discover` 的两处例外。所有权一节「调用方只等结算」把「到期即收场」改为「关闭时收场」。
- NB-4：契约 SPEC 裁定表闭合句（第 11 条）。第 12、13、15 条列为行为改动，并写明各自改了什么。
- NB-5：契约 SPEC「三个入口」`.` 行只留一份清单，指向 `tests/public-entry.spec.ts` 与 `docs/public-api.md`。`./testing` 行与 `public-api.md` 的套件数改为「六个（五个需求端口各一个，另有传输的一个）」。
- NB-6：契约 SPEC「未覆盖」。
  - 授权中 `signal` 与 `close()` 由套件覆盖，用例名以「a call still being authorized when」开头，在 `src/testing-transport.ts`。
  - 授权发现中的结局、`close()` 不等挂起的 `reportRejection` 与元数据取回、元数据取回不带凭据头，列进「没有手写用例」，指向成员的用例。
- 小项
  - 成员 SPEC 的 `V1–V6`：「组合与验证」的负控行。
  - 成员 SPEC 的「不要求」：契约条款表的 T5 行。
  - `verification/README.md` 引成员 SPEC：`cancelRequest` 一处。
  - 成员一侧的按相结局表：所有权一节的取消、关闭、线路断开只写怎样兑现，结局指向 V6 与契约 T5。
  - README 的性质链接与目录图：`README.md`、`README_ZH.md`。
- NB-1 的文档部分：`docs/flows.md` 的 GET 流断开、进程退出、404、`close()` 四处。
- 性质陈述
  - V2 改名为「关闭、断开之后不碰凭据与线路」，并写明 `reportRejection` 在会话结束后仍可按 T4 报告一次。
  - V4 加断开子句。V6 加断开的按相结局。
  - V1 的可观察形式补上元数据取回，与 `properties.ts` 一致。
  - 证据表的探索器与 TLA+ 两列补齐负控与变异名。TLA+ 列每行开头写它核的不变式。
- `verification/README.md`
  - 动作映射加 `LineGone`、`SessionEnded(r)`，`Broken(r)` 按 formal3 改。
  - 状态映射加 `gone`、`ended`、`deadAt`、`deadBy`、`deadOut`、`sendsAtDead`、`authAtDead`。
  - 「两种证据能变红」同步，抽象里加两种断开的上近似。
  - 探索器与 TLC 的读数换成基线读数。
  - 23 个负控已进表，其中 `http-line.ts` 的 7 个负控全部列入。
  - 「本包事实」改为 13 份配置、22 个变异、23 个负控。
- fix3、formal3 交回的过时句子
  - `verification/README.md` 原 `:36`、`:129` 已改。
  - `docs/flows.md` 原 `:52`、`:59` 已改。
  - 成员 SPEC 原 `:206`、V6 行已改。
  - 追加：`flows.md` 的 `close()` 行写「先结束 stdin 写端」，已改为「先中止 stdin 写端……从不等缓冲排空」。
  - 追加：`docs/architecture.md` 与 `docs/object-model.md` 里 `writes`、授权标记的旧字段，已改。
  - 追加：`tests/index.md`、`tests/fixtures/README.md` 补 fix3 新增的用例与夹具选项。

**验收 4**：名字对照在 `docs3/correspondence.md`（脚本 `correspondence.py`）。五处是成员 SPEC、`verification/README.md`、`verification/models/README.md`、`tests/model/mutants.ts`、`verification/models/run.py`。结果：
- 23 个探索器与用例负控：`mutants.ts` 有，SPEC 与 VR 有，MR 不写（TLC 一侧的文件，是设计）。
- 10 个 TLC 负控配置、22 个 TLC 变异、9 个不变式：`run.py`、MR、VR 都有，SPEC 的负控与变异两列有。
- 不变式名在 SPEC 只出现在证据表的 TLA+ 列。性质编号与标题在 SPEC 和 VR 一致。
- `names.py` 报的 MR 里 `bad-caller-waits-workflow` 是 `Bugs` 名，是表头的前缀写法，不是缺口。

**验收 5**：证据表里的读数都在基线 `72f977c81` 上运行，日志哈希是 SHA-256 前 16 位。

| 读数 | 结果 | 日志哈希 |
| --- | --- | --- |
| 探索器快层 | 8 passed、3 skipped | `bae289f9f65055f0` |
| 探索器慢层 | 3 passed、8 skipped | `7e49b8c6d7edb23b` |
| 探索器计数 | 8 个场景零违例，`stdio-discover` 2677/4205/深度 10，`stdio-call` 247/347/8，`sse-fallback` 5190/7448/17 | `3e577b54f24e131a` |
| TLC 13 份配置 | 全部符合判读，退出 0 | `e472fec0f6fab6ed` |
| TLC 22 个变异 | 全部符合判读，退出 0 | `aadf75fc4f21c4dd` |
| 23 个负控（`mutate.ts`） | 全部变红，退出 0 | `ac51935251bd09c8` |
| 成员快层全量 | 159 passed、201 skipped，退出 0 | `a1464c94062edafe` |
| 成员慢层全量 | 240 passed、8 skipped，退出 0 | `944fa1e70f6afb22` |

- TLC 的运行环境：模型 SHA 前缀 `3915573bc0e87f8a`，`run.py` 前缀 `2f1fc35ee9f1c89b`，TLC2 2.19，4 个工作线程。
- 23 个负控的汇总日志与 fix3 在 `3a79454d0` 上的日志逐字节相同，哈希也是 `ac51935251bd09c8`。
- 没有在基线上运行的写「未验证」：红灯表 B 节存活项、D 节里文件已改的行。

## 5. 门禁日志
五项门禁与 eol 检查的日志都跑在 `f022dfb98`，时间见 `docs3/gates/final-time.txt`。基线读数的日志跑在 `72f977c81`（UTC 05:01–05:08）。基线与最终 head 之间只改了文档。

## 6. 变异表
本闭包没有新增测试，也没有改代码，没有新变异。负控与变异的重跑结果见 `red-table.md` A 节（23 行）与上面验收 5 的读数。

红灯表 `tmp/closures/w3-mcp-host/docs3/red-table.md` 的结构：
- A 节：23 个负控在基线上的重跑表。
- B、C、E 节：历史，标明基线与日志。
- D 节：第 1 轮的变异，每行带「对现行代码」一列。判据是该文件自 `f04851ce4` 起有没有提交。
  - `http-line.ts` 的 4 行（`m11-06c`、`m11-06d`、`m11-06e`、`m11-09e`）标「仍成立」，并引负控名 `mHttp-reset-is-unsent`、`mHttp-refused-is-broken`、`mHttp-follows-redirect`、`mHttp-sse-endpoint-forgotten`。
  - `session.ts`、`stdio-line.ts`、`factory.ts` 等改过的文件的行标「历史」。
  - `body.ts` 等没改的文件的行标「文件没改，没有重跑：未验证」。
- F 节：基线全量读数。

## 7. 没覆盖到的项与自定的决定
**排除文件里的过时句子（只报告，没动）**
- `packages/mcp/mcp-host-local/src/index.md:13`：「在途写的计数」。`writes` 已删。
- `packages/mcp/mcp-host-local/verification/models/README.md:36`：「按目标结构写」「实现里的名字以 `w3-mcp-host-fix3` 的交回为准」。代码已经是目标结构，闭包名是过程引用。
- 同一份文件的运行记录里，负控的不同状态数与我在基线上重跑的读数不同，例如 `bad-ended-sends-authorizing` 是 451 对 495。文件自己写明负控计数随线程调度变化。正控 9922、315、315 与深度相同。

**自定的决定（能自己定，依据是规格「不写评审轮次与过程」与仓库的 tmp 规则）**
- 契约 SPEC 删掉了裁定 10–15 的「（第 N 轮评审后）」，把裁定表导语的「在两轮评审修复里作出」改为「兑现之后补充」。这超出第 5、6、7 条的字面，按实施规格「只写现状与依据，不写评审轮次与过程」办。因为是文字清理，与同一提交里的其他文字改动一起提交，没有单列。
- 成员 SPEC 依据表里契约 SPEC 的修订列从 `06b98034d` 改成「同一分支同批交付」，裁定范围写成 1–15。理由：契约与成员在同一 PR 里同批改，钉哈希会反复过时，这就是第 3 轮 B 面 NB6 的来源。
- `verification/README.md` 的读数只写日志名、哈希与基线提交，不写 `tmp/` 路径，因为 `tmp/` 不入库。
- 把 `mB1-session-ended-skips-authorizing` 与 `mV6-lineend-settles-discovery` 放在 V6 行的探索器一列，并标「用例负控，不经探索器」。这是按 fix3 交回第 2 条与闭包规格第 1 条。`mutants.ts` 里 `mB1` 的 `breaks` 写「T8 S07, T1」，我没有改（范围外），文档里按它所属的断开结局放进 V6。
- 运行证据时，为让红灯表有基线读数，额外跑了成员快层与慢层全量各一次。这是成员测试，不是准入、仓库全量测试或差分变异。

**没有覆盖**
- 契约慢层（262 条全部 skipped）与 `@omne-harness/mcp` 的慢层（没有用例文件）不执行用例，文档里没有把它们写成慢层覆盖。
- 红灯表 B 节存活的 `settle` 表守卫变异没有在现行代码上重跑：未验证。
- 没有重跑契约包与 `@omne-harness/mcp` 的测试，因为本闭包没有改代码。
- 评审 NB-2（元数据取回收 `signal`）与 NB-7（`交给线路` 的定义）不在本闭包的第 3–10 条里。核对结果：成员 SPEC 与契约 SPEC 的现文已有对应句子（fix3 已改），我只补了 V1 的可观察形式，没有再改其他位置。
