# w4-mcp-cordis 修复轮写者交回原文

交回时刻 2026-11-06T16:18:48.549Z（会话记录），代理 `ad18bdf2ccf66afba`，head `45658242e`。

---

## 1. 结论

追加 2 的第 1–11 项都已做完，并已在本地提交。分支 `PanQiWei/skill-mcp-w4-mcp-cordis`，head `45658242e`，工作树干净。没有推送，没有开 PR，没有跑差分变异、准入或仓库全量测试。没有触发停止条件。有两项待定要交负责人，见第 7 节。

## 2. 提交（共 9 个，作者与提交者都是 `PanQiWei <594557445@qq.com>`）

trailer 都是 `Harness: claude-code` 与 `Agent-Role: developer`，没有 Co-Authored-By。`lint:rules` 核过署名，结果 PASS。

| 提交 | 内容 | 闭合的评审项 |
|---|---|---|
| `a35fcc554` | 定义成员：表格用例，七个类各一个最小子类，核对装载与撤除 | C-6（追加 2 第 7 项） |
| `543c1649d` | Schema 改为查原型和自有键，用 `Reflect.ownKeys` 与 `Object.hasOwn`；上界按名字取值；两个类型用 `Pick`/`Omit` 推出，字段表与类型经 `Record<keyof …, true>` 相连 | C-2、C-4、C-5（第 3 项） |
| `48948ac13` | 撤除函数用上 `closeAll` 的报告：`root-only` 或 `unconfirmed` 时写 `ctx.logger('mcp').warn` | C-1（第 4 项） |
| `85410c6f5` | 用例拆成快层 `cordis-entry.spec.ts` 与慢层 `cordis-journey.spec.ts`；拒绝用例断言 `ValidationError` 与消息；断言句柄已释放；停止范围的警告；`started` promise 取代轮询；`clientInfo` 多余字段一行 | D、C-3、C-7、E3、E5、A-N1（第 3、4、5、6、9 项） |
| `9ccf71b60` | `mcp-host-local` 的 SPEC 新增 `### Cordis 插件` 与 `### Cordis 插件的验证`；`docs/cordis.md`、architecture、object-model、context、public-api、两份 README、`package.json` 的 description、`src/index.md` 都写到 `./cordis` 的现状 | B1、N1、N2、N3、N5、N6、N7、C-1 文档、A-N3（第 1、2、6、8 项） |
| `22fdf3773` | 定义成员的文档：缺席答复改为引用 `../mcp-host-local/SPEC.md#port-absent`；IC 映射写出 scan 读数与人工核对；补「未覆盖」；依据补 IC-8；去掉模板残句 | N1、N4、N6、N7、C-6 文档（第 2、7 项） |
| `3561de559` | 快层补凭据与落点两个端口的换代用例；验证表按实际变红的结果写定 | E1、A-N3（第 5、6 项） |
| `45658242e` | `docs/cordis.md` 的「未覆盖」写全 scan 的 `unknown` 规则（加 ROLE），并写 IC-2 为 `converged` | N4 |

## 3. 改了哪些文件

全部 diff 在 `git diff --name-only 8446c4588..HEAD`，共 55 个文件，列表存在 `tmp/w4-mcp-cordis/r2/gate/diff-names.txt`。

- 所有改动都在追加 2 扩大后的写范围之内。
- 写范围之外只有追加 1 已放行的共享写合并：`packages/skills/skill-host-local/package.json` 与 `pnpm-lock.yaml`。
- `acceptance/` 没有改动，相关文件数为 0。
- `mcp-host-local` 的 `src/` 只改了 `cordis.ts`、`index.md`、`README.md`。fixtures、`verification/` 与 `docs/flows.md` 都没有改。

**SPEC 的改动位置**（供派发者合入切片 01 时解决冲突）：

- 本闭包直接写了第 3 行，不再另给「`./cordis` 一行」。
- 首个文档提交里的 diff 段：`-3 +3`；`-7,13 +7,14`（范围表加一行，`@omne-harness/mcp` 一行改成 dependency）；第 19 行「调用方」段的收窄与改写的第 218 行（未覆盖第 6 条，现第 253 行）都在 `-174,0 +176,34` 与 `-218 +253` 这两段里。
- 新增两节：`-174,0 +176,34` 是 `### Cordis 插件`，在 `## 所有权、失败与生命周期` 之前；`-221,0 +257,37` 是 `### Cordis 插件的验证`，在 `<a id="properties">` 之前。
- 之后 `3561de559` 又改了验证表的 275、277–278、283 行，并在 293 行加了一行。
- 新锚点：`cordis-plugin`、`port-absent`、`cordis-plugin-verification`。

## 4. 追加 2 各项的闭合方式

1. **B1 写范围。** 第 1 项列出的各处都写到了现状：
   - SPEC：第 3 行、第 16 行、加了 Cordis 依据行（IC-2/3/6/7/8/9/14/16，决定 1–4）、第 19 行收窄到根入口的传输、第 218 行。
   - `docs/architecture.md`：模块图、模块表、依赖方向、机制、验证表。
   - `docs/object-model.md`：对象图、三张对象表，第 34 行改为「继承只在 Cordis 插件」，生命周期加一条。
   - `context.md`：第 9、13 行，写明经 `closeAll` 请落点停止，不声称已停。
   - README 中英两份：用途句、框定句、状态表加插件一行（已实现；只在脚本化 stdio 对端上验证；HTTP 上的插件旅程未执行；未接受）、「四个上界与 `clientInfo`」、示例注释改为引用 MC-10。
   - `package.json` 的 description 写传输与插件两件事。
2. **N1/N2/N6 规范归属。** SPEC `### Cordis 插件` 是唯一规范正文。
   - 它写了工厂与配置的切分、Schema 的五步判据与确切消息、`ValidationError` 与 `RangeError`、`apply` 做的五件事、现取。
   - `port-absent` 逐个写出四个端口缺席时的答复（AV6、UE5、CU6、PL4），并按 S1、S2、R6、S8 分写各操作的答复，没有写全称句。
   - 换代统一说「下一次端口调用」；撤除写了警告与 S8；已知限制写了不设期限、`dispose()` 可能不返回、期限由宿主承担。
   - 定义成员性质 9、它的 `docs/cordis.md`、`docs/flows.md`、`docs/architecture.md`，以及 host 侧的 `docs/cordis.md`，都改为引用这一节。
3. **配置 Schema。**
   - plain record 的判据：原型是 `Object.prototype` 或 `null`。
   - 用 `Reflect.ownKeys` 找多余键，symbol 键也算；用 `Object.hasOwn` 判缺少的字段。
   - 上界按名字取值，类型错误的消息点名第一个出错的字段；`clientInfo.name` 与 `.version` 的消息也分开点名。
   - 类型用 `Pick`/`Omit` 推出；`LocalTransportOptions` 从 `./options.ts` 取，没有新增公开导出。
   - 拒绝表共 13 行，含 `new Date(0)`、`Object.create(CONFIG)`、symbol 键、`clientInfo` 多余字段。每行有第四列，写明去掉 Schema 时这一行是否仍加载失败、为什么。
   - 加载失败的用例断言 `ValidationError` 与 `invalid config:\n  - <message>`；两条 `RangeError` 照旧。
4. **撤除警告。** 撤除函数仍是一步收口、不捕获：`const report = await …closeAll()`，之后对 `root-only` 与 `unconfirmed` 各写一条 `warn('the stop of the process was not confirmed', ref, scope)`。慢层用例：`root-only` 与 `unconfirmed` 两行各收到一条带端点与范围的警告；`tree-confirmed` 时不收到。用例在本文件里包了夹具交出的句柄，夹具没有改。
5. **快慢分层。**
   - 快层 `cordis-entry.spec.ts` 去掉了 slow 标签，共 41 条，全部不起进程。落点用一个记录启动请求、答 `facility-missing` 的替身。
   - 慢层 `cordis-journey.spec.ts` 带 `@module-tag slow`，共 13 条。
   - 层的归属用 `vitest list` 核过：fast 层 `41 tests/cordis-entry.spec.ts`，slow 层 `13 tests/cordis-journey.spec.ts`（`tmp/w4-mcp-cordis/r2/gate/tier-list.txt`，`f23f356a8118`）。
   - 注意：成员的 `test` 脚本不带 `--mode`，两层都跑，所以 turbo 的 `test` 日志里两个文件都出现；这是脚本的现状，不是分层错误。
6. **证据。**
   - SPEC 的验证一节有「判据｜反例｜用例」表与「没有覆盖」；`docs/cordis.md` 的「验证义务」改为引用它。
   - 变红验证全部重做，表见第 6 节。
   - E3：撤除用例用了 `auth: 'static'` 的 stdio 端点，断言 `stops` 为 `['root-only']`、`released` 为 `[MAIN]`。
7. **定义成员。**
   - 七个类的表格用例已加。
   - IC 映射逐行写了 scan 读数：IC-1、IC-5 为 `unknown` 并写了人工核对；IC-3 为 `converged`。
   - 补了「未覆盖」，`:75` 的验证范围按实际写；`SPEC.md:11` 改为「IC-1 至 IC-5、IC-7 至 IC-9」；`index.md` 与 `src/README.md` 的残句改为现状。
8. **host 的 `docs/cordis.md`。**
   - 补了 IC-3、IC-6、IC-7 三行。IC-6 写「未定、未验证，由装配承担只装一次」。
   - IC-5 写了 scan 的 `unknown` 与人工核对的导入清单。
   - IC-14 一行列出 `clientInfo` 多余字段等用例。
9. **用例卫生。** 慢层用 `started` promise 等第一次 `start`，不再轮询。采用换代的断言见第 7 节的自定事项。
10. **A-N2 度量**，见第 5 节，超 warn 为 0。
11. **同名匹配。** 本闭包没有改任何现有符号的定义；`closeAll`、`createLocalTransportFactory`、`createMcp` 只被调用。

**四个缺席用例依据的条号**（快层）：

- 采用缺席：`refresh` 答 `{failure:{kind:'unknown'}}`，`list` 答 `{failure:'unknown'}`。依据 S1，适配器按 AV6 答。
- 资格缺席：`refresh` 与 `inspect` 答 `unknown`。依据 S1，适配器按 UE5 答。
- 凭据缺席：`refresh` 答 `credential-unavailable`（`unknown`）。依据 R6，适配器按 CU6 答；只有 `auth` 不是 `none` 时才问凭据（MC-5）。
- 落点缺席：`refresh` 答 `landing-unavailable`。依据 R6，适配器按 PL4 答。
- 以上四种情形，落点替身都没有被问到。补上端口后，`refresh` 问到落点替身，替身答 `facility-missing`，`refresh` 答 R6 的 `landing-unavailable`。

**「没有连接时」用例的条号**：

- `current`：`not-acquired`。
- `peer`：`not-connected`（S8）。
- `invoke` 与 `continueWithInput`：`not-sent`（`action-unavailable`）（R1）。
- `cancel`：`unknown`（S2，表里没有）。
- 四个任务操作：`unknown`（S2）。
- `inspect` 与 `list`：连接 `lost`（`preparation-failed`）（S7）。

**撤除时在途的调用**：答 `sent`，结局 `unknown`（`abandoned`），依据 S8、O6。

## 5. 门禁（timestamps 来自日志 mtime 与 start 文件，均为 UTC）

日志都在 `tmp/w4-mcp-cordis/r2/gate/`。`3561de559..45658242e` 之间只改了 `docs/cordis.md` 的一行（`1 file changed, 1 insertion(+), 1 deletion(-)`）。所以在 `3561de559` 上跑过的 turbo、`lint:deps` 与 `metrics` 仍然适用。

| 验收 | 命令 | 提交与时间 | 退出码 | 输出尾部 | sha256 |
|---|---|---|---|---|---|
| 5 | `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test` 加四个 `--filter` | `3561de559`，15:42–15:54 | 0 | `Tasks: 26 successful, 26 total`；cordis-contract `12 passed`，host-local `461 passed \| 1 skipped` | `5a5c7b4ec576` |
| 5 | 同一组 `--filter` 的 `pnpm turbo run test:slow` | `3561de559`，至 16:05 | 0 | `Tasks: 15 successful, 15 total`；host-local slow `258 passed \| 9 skipped`，其中 `cordis-journey.spec.ts (13 tests)` | `cf4d520cfcf0` |
| 5 | `pnpm run lint:deps` | `3561de559`，16:07 | 0 | `✔ 没有依赖违规、方向命中、成员之间的环，也没有未放行的组环（85 个成员、356 条成员边；1 个组环按具名例外放行）`；没有 no-unresolvable | `9445de6fec28` |
| 6 | `pnpm run typecheck` | `45658242e`，16:16 | 0 | `Cached: 89 cached, 90 total` | `d9e2f1f82799` |
| 6 | `pnpm run lint:rules` | `45658242e`，16:13 | 0 | `PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6232 个提交的署名，无违反。` | `998f2f96e7ca` |
| 6 | `pnpm run lint:oxlint` | `45658242e`，16:16 | 0 | `oxlint -c .oxlintrc.json --report-unused-disable-directives …` 无输出 | `fc9b5adca5ed` |
| 6 | `pnpm run format:check` | `45658242e`，16:10 | 0 | `All matched files use the correct format. Finished in 651ms on 4392 files` | `ce4f87b01b84` |
| 6 | `pnpm run check:docs` | `45658242e`，16:11 | 0 | `PASS: 2825 Markdown files; local links and skill mirrors.` | `9fe491f03f2a` |
| 7 | `git diff --name-only 8446c4588…..HEAD` | `45658242e` | — | 55 个文件，都在写范围内或属于追加 1 的共享写 | `diff-names.txt` |
| 换行 | `git ls-files --eol <改动文件>` | `45658242e` | — | `w/crlf` 为 0 | — |
| 层归属 | `pnpm exec vitest list --mode fast` 与 `--mode slow` | `3561de559` | — | fast 41 条、slow 13 条 | `f23f356a8118` |

**metrics**（16:08–16:10，`3561de559`；跑之前已确认没有 `packages/.stryker-tmp*`）：

- 命令：`VITEST_MAX_WORKERS=4 pnpm run metrics --coverage --base 8446c4588f0e2400f2e905179ec252473f7b1066`，退出 0，日志 sha `f3f7a71006ef`。
- 读数：`变更函数超 alert 0、超 warn 0`；覆盖率 mcp-cordis-contract 100%、mcp-host-local 98%。
- 改动函数的圈复杂度：`validate` 5，`apply` 6，`boundsOf` 5，`clientInfoOf` 5，`fieldsIssue` 4，`isPlainRecord` 4。
- 覆盖 100%，只有 `credentialsOf.acquire` 是 75%：HTTP 用途的分支没有走到。
- 「测试未通过 1」出在 `skill-host-local` 的覆盖率阶段：`Cannot find package '@omne-harness/skill-contract/testing'`，原因是本工作树没有构建 Skill 组成员。这与 A 面的读法相同，与本闭包无关。
- 审讯页：`/data/qiwei/repos/omne-harness-lite/tmp/metrics/3561de559/review.html`。

**scan**：两个成员都在最终 head `45658242e` 上跑过。`tree` 与 `dependencies` 数组太长，下面没有贴，按规则做了计数；其余顶层字段是原样。

- `mcp-cordis-contract`，文件 `tmp/w4-mcp-cordis/r2/gate/scan-mcp-cordis-contract.json`，sha `7130372b9e76`，退出 0：
  `{"template":"typescript-package@3.0.0","path":"packages/mcp/mcp-cordis-contract","name":"@omne-harness/mcp-cordis-contract","adoption":"unmarked","variant":"service-contract","structure":"pass","acceptance":"none","integration":"unknown","findings":[],"architectureUnknowns":40,"bindingUnknowns":[]}`
  - 规则计数：IC-1 unknown 14；IC-3 converged 14；IC-5 unknown 7（另有 host-local 侧 7）；LAYER-DIP unknown 9（另 7）；LAYER-ENTRY unknown 9（另 7）；ROLE unknown 1。
  - 全文 `deviation` 出现 0 次。
- `mcp-host-local`，文件 `scan-mcp-host-local.json`，sha `3c35eedbf0f3`，退出 0：
  `{"template":"typescript-package@3.0.0","path":"packages/mcp/mcp-host-local","name":"@omne-harness/mcp-host-local","adoption":"unmarked","variant":"service-provider","structure":"pass","acceptance":"none","integration":"unknown","findings":[],"architectureUnknowns":408,"bindingUnknowns":[]}`
  - 规则计数：IC-2 converged 6；IC-5 unknown 107；LAYER-DIP unknown 146；LAYER-ENTRY unknown 146；ROLE unknown 9。
  - `deviation` 出现 0 次。

## 6. 变红验证（r2）

**运行器。** 旧的 `run.mjs` 换成了 `tmp/w4-mcp-cordis/mut/r2/run.mjs`，变异定义在 `gen.mjs` 与 `mutants.json`：

- 失败用例名从 vitest 的 JSON 报告读出（`OMNE_TEST_REPORT_DIR`），不再用正则解析输出。所以「退出 1 而失败用例名为空」不会再出现，本轮这种记录为 0。
- 每个变异体都先重新构建成员，再跑用例，最后按字节还原源码。
- 每条变异有一份日志，在 `mut/r2/logs/<id>.log`，含命令、退出码、失败用例名与完整输出。
- 汇总在 `final.json` 与 `final-base.json`，表在 `mut/r2/table.md`。

**覆盖。** 共 81 次运行：4 次基线、43 个快层变异、21 个慢层变异、13 个定义成员变异。

- 4 个用例文件里的每一条用例，都至少被一个变异体打红。这一点按 JSON 报告逐条核过。
- 唯一存活的是 F05：落点缺席时答 `facility-missing` 而不是 `unknown`。它是已知的等价变异：MC-5 把落点的三种失败都收成 `landing-unavailable`，SPEC「没有覆盖」写了这一条。
- F41 改的是用例本身：把探针的撤除函数改成不抛出。机制探针测的是 Cordis 4.0.4，插件不参与；它的证据是基线运行，F41 只说明断言能区分。
- S17、S18 使慢层 13 条全部变红，因为每个用例结束时的 `leftover()` 核对也失败。撤除用例与在途用例也因为各自的断言变红。S18 的在途用例在 120 秒时限处超时，日志记 `seconds 122.4`。
- F/S/K 的运行时间：慢层与定义成员的变异跑在 `85410c6f5` 那时的源码与用例上；这两部分之后没有再改。快层文件在 `3561de559` 加了两条用例，所以全部 F 变异连同基线在最终快层文件上重跑了一遍。

**命令缩写**（都在仓库根执行，每次先 `pnpm run build`）：

- HL-F = `(cd packages/mcp/mcp-host-local && NO_COLOR=1 VITEST_MAX_WORKERS=4 pnpm exec vitest run --mode fast tests/cordis-entry.spec.ts)`
- HL-S = `(cd packages/mcp/mcp-host-local && NO_COLOR=1 VITEST_MAX_WORKERS=4 pnpm exec vitest run --mode slow --typecheck.enabled=false tests/cordis-journey.spec.ts)`
- CC-E = `(cd packages/mcp/mcp-cordis-contract && … --mode fast tests/cordis-entry.spec.ts)`
- CC-R = `(cd packages/mcp/mcp-cordis-contract && … --mode fast tests/public-entry.spec.ts)`

| id | 变异 | 命令 | 退出码 | 变红用例 | 日志 sha |
|---|---|---|---|---|---|
| BASE-HL-FAST | 未变异（41 条全过） | HL-F | 0 | — | beb9dfec5723 |
| BASE-HL-SLOW | 未变异（13 条全过） | HL-S | 0 | — | 5a7cc1e7ed1c |
| BASE-CC-ENTRY | 未变异（10 条全过） | CC-E | 0 | — | e100a1c26282 |
| BASE-CC-ROOT | 未变异（2 条全过） | CC-R | 0 | — | 08204fc06584 |
| F01 | 资格缺席答 granted | HL-F | 1 | …while the use eligibility is absent… | a139d2818b1c |
| F02 | `endpoint` 缺席答 not-adopted | HL-F | 1 | …while the adoption view is absent… | 67dfd63ab84b |
| F03 | `endpoints` 缺席答空列表 | HL-F | 1 | …while the adoption view is absent… | 4065e0f12eb8 |
| F04 | 凭据缺席答 missing | HL-F | 1 | …while the credential use is absent… | 589ba7c2040d |
| F05 | 落点缺席答 facility-missing（等价） | HL-F | 0 | — | 988e40981090 |
| F06 | 资格在 apply 时取 | HL-F | 1 | 资格缺席；资格换代 | ee14653e7f0d |
| F07 | 资格缓存首个引用 | HL-F | 1 | uses the replacement eligibility… | 5996ad017f9a |
| F08 | 采用在 apply 时取 | HL-F | 1 | 采用缺席；采用换代 | 1c4084643684 |
| F09 | 采用缓存首个引用 | HL-F | 1 | reads the replacement adoption view… | 2f408f6f5509 |
| F10 | 凭据在 apply 时取 | HL-F | 1 | 凭据缺席；凭据换代 | 9496de4173c7 |
| F11 | 落点在 apply 时取 | HL-F | 1 | 落点缺席；落点换代 | b8677b15d9fb |
| F42 | 凭据缓存首个引用 | HL-F | 1 | uses the replacement credential use… | 1e221f0f16e8 |
| F43 | 落点缓存首个引用 | HL-F | 1 | uses the replacement process landing… | a8703bb59dd4 |
| F12 | 不 new HostEndpointStatus | HL-F | 1 | provides the three services…；no connection；等 5 条 | 8acfaa373d64 |
| F13 | current 不转发 | HL-F | 1 | answers each operation … while there is no connection | fd6ada81aa20 |
| F14 | refresh 不转发 | HL-F | 1 | no connection；各缺席与换代；共 9 条 | fbc1b4209f82 |
| F15 | peer 不转发 | HL-F | 1 | no connection | 984a8b570c25 |
| F16 | invoke 不转发 | HL-F | 1 | no connection | 20083590a539 |
| F17 | continueWithInput 不转发 | HL-F | 1 | no connection | 19e1526c8938 |
| F18 | cancel 不转发 | HL-F | 1 | no connection | 80eb5b4b6450 |
| F19 | queryTask 不转发 | HL-F | 1 | no connection | 469d4f25d2b8 |
| F20 | taskResult 不转发 | HL-F | 1 | no connection | be9b7e8e4fa7 |
| F21 | provideTaskInput 不转发 | HL-F | 1 | no connection | 1e291b04af5e |
| F22 | cancelTask 不转发 | HL-F | 1 | no connection | b0864021a618 |
| F23 | inspect 不转发 | HL-F | 1 | no connection；资格缺席；资格换代 | 6968f7b58057 |
| F24 | list 不转发 | HL-F | 1 | no connection | ec1687150b6a |
| F25 | 不查原型 | HL-F | 1 | Date 两行；继承全部字段两行 | dde8df24b9de |
| F26 | 拒绝没有原型的对象 | HL-F | 1 | accepts a configuration without a prototype | 8946b0bbe834 |
| F27 | 多余键用 Object.keys 找 | HL-F | 1 | symbol 键两行 | abf6567d10b7 |
| F28 | 不报多余字段 | HL-F | 1 | 多余字段、symbol、clientInfo 多余字段，共 6 条 | 39ad3d9a696d |
| F29 | 不报缺少的字段 | HL-F | 1 | 缺字段两行；clientInfo 缺字段两行 | 49ecc5fcf9c9 |
| F30 | clientInfo 不查多余字段 | HL-F | 1 | clientInfo 多余字段两行 | 6ac49fef0322 |
| F31 | maxListingPages 的消息点错字段 | HL-F | 1 | 上界不是数，两行 | 3bfc1a68faba |
| F32 | probeTimeoutMs 的消息点错字段 | HL-F | 1 | probeTimeoutMs 不是数，两行 | 40c60da87ee0 |
| F33 | 交换两个上界的值 | HL-F | 1 | accepts … as a copy；没有原型 | 7e40a033fa45 |
| F34 | name 用 version 的消息 | HL-F | 1 | clientInfo.name 两行 | af083340e75b |
| F35 | version 用 name 的消息 | HL-F | 1 | clientInfo.version 两行 | d37fe266991d |
| F36 | clientInfo 非对象的消息改动 | HL-F | 1 | clientInfo 非对象两行 | e9a57ae3dbdd |
| F37 | 配置非对象的消息改动 | HL-F | 1 | 非对象、Date、继承，共 6 条 | 2c3d1ac4bdd9 |
| F38 | Schema 接受任何值 | HL-F | 1 | 全部接受与拒绝行，共 27 条 | dbc796e330aa |
| F39 | 0 的 maxActions 被换成合法值 | HL-F | 1 | fails to load when maxActions is 0… | 27321b3ef94b |
| F40 | 0 的 probeTimeoutMs 被换成合法值 | HL-F | 1 | fails to load when probeTimeoutMs is 0… | bdb388494c58 |
| F41 | 用例侧：探针撤除函数不抛出 | HL-F | 1 | Cordis mechanism probe… | dac719ce5e9a |
| S01 | current 不转发 | HL-S | 1 | 13 条 | 0dd9e7f65663 |
| S02 | refresh 不转发 | HL-S | 1 | 13 条 | 45481cafad63 |
| S03 | peer 不转发 | HL-S | 1 | answers each operation … through the plugin | 06f9f4fb0ab9 |
| S04 | invoke 不转发 | HL-S | 1 | 旅程；每个方法；cancel；等 8 条 | a4cdc3e3267e |
| S05 | continueWithInput 不转发 | HL-S | 1 | each operation | 243ee802b5c4 |
| S06 | cancel 不转发 | HL-S | 1 | signals a call in flight that cancel names | 3ab997769a69 |
| S07 | queryTask 不转发 | HL-S | 1 | each operation | 55796472df9e |
| S08 | taskResult 不转发 | HL-S | 1 | each operation | ec64fcca3787 |
| S09 | provideTaskInput 不转发 | HL-S | 1 | each operation | d79cda04207d |
| S10 | cancelTask 不转发 | HL-S | 1 | each operation | 942200834cae |
| S11 | inspect 不转发 | HL-S | 1 | each operation | 36ce7a024674 |
| S12 | list 不转发 | HL-S | 1 | each operation | 4524d48647c1 |
| S13 | 资格在 apply 时取 | HL-S | 1 | publishes … once the absent eligibility port… | 7cd1c5e8fa9b |
| S14 | 采用缓存首个引用 | HL-S | 1 | reads the replacement adoption view… | c71fcca90943 |
| S15 | 凭据在 apply 时取 | HL-S | 1 | publishes … absent credentials port… | 75af8fc1555c |
| S16 | 落点在 apply 时取 | HL-S | 1 | publishes … absent landing port… | 1f2385f7ae56 |
| S17 | 撤除不 await closeAll | HL-S | 1 | 13 条，含撤除与在途 | 53f9dfc38558 |
| S18 | 撤除不调 closeAll | HL-S | 1 | 13 条，在途用例在 122.4 s 超时 | 531118d72c68 |
| S19 | 只对 unconfirmed 警告 | HL-S | 1 | warns … root-only… | 0d7f9e1c9906 |
| S20 | no-process 以外都警告 | HL-S | 1 | does not warn … tree-confirmed… | 5a98bdc79a23 |
| S21 | 警告不带端点 | HL-S | 1 | warns … root-only；warns … unconfirmed | 458b58f4e8d5 |
| K01–K07 | 各类以下一个类的 provide 调 super | CC-E | 1 | 对应类的 `provides a loaded subclass of <类>…` | 96457f442ab9、8ec000bd46b1、db718b974e50、91169f75651b、db083ed07324、6679883d69ec、2b5539bb56fc |
| K08 | 键的字面量改动 | CC-E | 1 | writes each service key once… | 953ee3fafbf6 |
| K09 | 两个类共用一个键 | CC-E | 1 | writes each…；seven different keys | a62a3decbbdd |
| K10 | 多一个运行导出 | CC-E | 1 | exports exactly the seven… | da9817a33af0 |
| K11 | 键常量与 provide 不等 | CC-E | 1 | writes each…；AdoptionViewService 一行 | fb146ffc3b05 |
| K12 | 根入口有运行值 | CC-R | 1 | keeps the root entry free of runtime values | 7b3bb0f334ff |
| K13 | 根入口导入 Cordis | CC-R | 1 | keeps the root entry source and built file free of Cordis | 1e503a2d3d1f |

## 7. 未覆盖、自己做的决定与待定项

**未覆盖**（与 SPEC「Cordis 插件的验证」的「没有覆盖」一致）：

- 落点缺席时答 `unknown` 还是 `facility-missing`：服务面看不出差别（F05），只能逐行审阅。
- 插件不捕获 `AggregateError` 的那一半：插件外部诱发不了，由评审逐行核对。
- 凭据适配器的 HTTP 分支（覆盖 75%）；Streamable HTTP 上的插件旅程：未执行。
- 真实的端口提供者：只用了内存替身与测试落点。进程树的实际停止范围：未测量。
- IC-6：未定、未验证。插件树装配：未执行。撤除期限挂起：没有用例。
- 装配的导出器是否开到 warn 级别：没有用例。

**能自己定的决定，及依据**：

- 快层另加了三类用例：没有连接时调用全部 12 个方法；凭据端口换代；落点端口换代。依据：这是写者对自身变更的验证义务。没有它们，转发变异与凭据、落点的缓存变异在快层存活，差分变异只跑快层。
- 采用换代的断言没有照第 9 项写成 `toEqual(['other'])`，而是写 `toEqual([['echo', {kind:'unavailable', reason:'no-longer-offered'}], ['other', {kind:'available'}]])`。依据：mcp-contract R3 规定合并时保留对端不再列出的动作，并标为 `no-longer-offered`。所以按契约 `toEqual(['other'])` 不能成立。现在的写法同样排除了旧条目以「可用」残留，原裁定要防的就是这一点。
- 拒绝消息改为逐字段点名：`clientInfo.name must be a text` 与 `clientInfo.version must be a text` 分开。依据：第 3 项「类型错误的消息点名第一个出错的字段」，这里一致地用到 `clientInfo` 上。
- 警告用例的导出器设了 `levels: { default: 2 }`。依据：Cordis 4.0.4 的 `Logger._method` 中，没有设级别的导出器只导出 0 与 1 级，`warn` 是 2 级。这一点我在真实 `Context` 上实测过。

**只有负责人能定的待定项**：

1. **C-1 的警告级别。** 依据：Cordis 4.0.4 没有设级别的导出器（含内置的 buffer）不导出 `warn`，所以宿主不开到 2 级时，停止范围未确认的警告没有人看到。我按裁定实现了 `warn`，并在 SPEC「已知限制」与 `docs/cordis.md` 写明宿主要把 `mcp` 的级别设为 2 或更高。改用 `error` 或 `info`，或者把这条要求写进装配，都改变 C-1 的裁定，不是写者能定的。
2. **成员 `test` 脚本跑两层。** 依据：`turbo run test` 不带 mode，两个文件都会执行。分层本身正确，`vitest list` 已核。追加 2 说「快层文件在 `pnpm turbo run test`（快层）里执行」，验收若要求 `test` 只跑快层，就要改所有成员共用的脚本约定，不在本闭包的写范围内。

清理候选：没有。

