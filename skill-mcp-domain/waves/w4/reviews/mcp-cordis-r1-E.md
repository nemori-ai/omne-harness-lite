# w4-mcp-cordis 关口评审 E 面原文

交回时刻 2026-11-06T14:43:35.842Z（会话记录），代理 `ae45c8cb0acfaf31a`。原样保存，裁定见 `mcp-cordis-r1.md`。

---

## E 面结论：闭包 w4-mcp-cordis（PR #1158，head f5ead35f4）的交付边界

只读，没有改文件，没有接受，也没有合并。证据只用了两样：卡 #1119 评论 6687353835（作者 PanQiWei，14:36:07Z，在 #1119 上），和它指向的原件。我先核对了原件的哈希，评论引用的 10 份写者日志与 4 份派发者复跑日志，sha256 前 12 位全部对得上。PR #1158 的 head 是 `f5ead35f4d8a6b02967209faa8004cefc09f2406`，base 是 `PanQiWei/skill-mcp`，状态 OPEN。

**一句话：** 产品物多数达到。有 5 项未达到：
- 每条用例都要有一处使它变红的改动：缺了 8 条用例的记录，另有 H19–H21 没有运行输出。
- `format:check` 没有在 head 上重跑，而 head 改的正是一个 JSON 文件。
- 计划 C5-4 的「句柄已释放」没有断言。
- 验收第 7 条（写范围）在卡上没有证据。
- 卡上把配置用例写成「clientInfo 内多余字段」，候选里没有这条用例；验收原文要求的「clientInfo.name 不是文本」那条有用例，卡上却没写。

### 各项证据出自哪个提交

| 证据 | 提交与时刻（UTC） | 是否在 head 上 |
| --- | --- | --- |
| scan `mcp-cordis-contract`（`scan-contract-final.json`） | 13:41，在 `44c8a6dd5` 之后、`cd7d6a5f1` 之前 | 否。head `f5ead35f4` 改了这个成员的 `package.json` |
| scan `mcp-host-local`（`scan-host-local-final.json`） | 13:52，在 `cd7d6a5f1` 上 | 否，但其后只改了另一个成员的 description |
| 四成员 `build typecheck test`、`test:slow` | 14:00 和 14:11，在 `cd7d6a5f1` 上（`gate-start.txt`） | 否 |
| `format:check`、`check:docs` | 13:49 和 13:50，在 `cd7d6a5f1` 上 | 否 |
| typecheck、lint:rules、lint:oxlint、lint:deps | 14:33–14:35，在 `f5ead35f4` 上 | 是 |

### 逐条判据

**W4 MCP plan 切片 02**

- **C5-1 scan：达到。** 有一处出处说明。卡上的读数与原件一致：
  - `mcp-cordis-contract`：`service-contract`，structure `pass`，`findings` 为 `[]`，integration `unknown`，`"deviation"` 出现 0 次。
  - `mcp-host-local`：`service-provider`，structure `pass`，`findings` 为 `[]`，`"deviation"` 出现 0 次，IC-2 `converged`。
  - 出处：契约成员的 scan 早于 head `f5ead35f4`（改了它的 description）。
- **C5-2 键与入口：达到，但 IC-2、IC-4 一半只是字面成立。**
  - 用例在：`mcp-cordis-contract/tests/cordis-entry.spec.ts` 4 条，`public-entry.spec.ts` 2 条。
  - 契约成员的 scan 读数里根本没有 IC-2 和 IC-4 的条目。按规则统计只有 IC-1 和 IC-5 为 unknown、IC-3 为 converged、LAYER-* 与 ROLE 为 unknown。所以「IC-2、IC-4 无 deviation」只是因为没有读数，不是 scan 判了通过。这两条实际由单元测试承担。
- **C5-3 装配旅程、端口缺席、缺一项时加载失败：达到。**
  - 27 条用例都在，慢层日志里 `cordis-entry.spec.ts` 是 27 tests ✓。
  - 断言落在哪一层要说清：用例断言的是服务层的答复，不是适配器层的 `fail('unknown')`。
    - 采用缺席与资格缺席：`{failure:{kind:'unknown'}}`。
    - 凭据缺席：`{failure:{kind:'credential-unavailable',cause:'unknown'}}`。
    - 落点缺席：`{failure:{kind:'landing-unavailable'}}`。
  - 卡上给了每条依据的契约条号。
- **C5-4 撤除：未达到（一部分）。**
  - 已有断言：`dispose()` 后对端进程已退出、三个键为 `undefined`；在途调用答 `sent/unknown(abandoned)`，卡上给了条号链 T5→T8 C03→O6→S8→MC-10。
  - **缺：** 计划原文里有「句柄已释放」，与「进程已停」并列。撤除用例没有断言凭据句柄 `release()` 或进程句柄 `stop()`，旅程里也没有用到凭据。
  - 「日志收到这个错误」由探针改成了收到内部的两个错误，见下文冲突项。
- **M4-5：达到（出处是 `cd7d6a5f1`）。**
  - turbo 26/26 成功，`test:slow` 15/15 成功。
  - lint:deps 在 head 上通过，原文尾句：「没有依赖违规…（85 个成员、356 条成员边…）」。
- **七项轻门禁：未达到。**
  - 有 head 上读数的四项：typecheck、lint:rules、lint:oxlint、lint:deps。
  - `format:check` 只在 `cd7d6a5f1` 上跑过。head 改的是 `mcp-cordis-contract/package.json`，format 的范围包括 JSON，所以 head 上的格式没有被验证。
  - `check:docs` 同样只在 `cd7d6a5f1` 上跑过，不过 head 没有改 Markdown。
  - 第七项「一条成员门禁」卡上没有点名是哪一条。我按 turbo 四成员门禁算它。

**闭包规格验收清单**

1. **scan，两份原样输出：达到。** 卡上是摘要加哈希，没有贴原样输出。原件在 `tmp/w4-mcp-cordis/logs/` 下，但卡上没写这个路径。出处说明同 C5-1。
2. **契约成员用例：达到。**
3. **mcp-host-local 装配用例：用例达到，卡上证据未达到。**
   - 原文要求的五种拒绝（缺一字段、多一字段、`clientInfo.name` 不是文本、`maxActions:0`、`probeTimeoutMs:0`）都有用例。
   - 卡上写的是「多余字段、缺字段、**clientInfo 内多余字段**、maxActions:0、probeTimeoutMs:0 都加载失败」。候选里没有「clientInfo 内多余字段」这条用例；拒绝表只有缺字段、`clientInfo.name` 不是文本等 6 种。卡上缺「clientInfo.name 不是文本」这一项，多了一条不存在的用例，需要更正。
   - 旅程、四个缺席、资格换代都在，夹具 `afterEach` 用 `leftover()` 核对子进程，导入的是 `./testing` 的替身。
4. **撤除用例与「每条用例写一处让它变红的改动」：未达到。**
   - 撤除三条用例在。
   - 按 `logs/mutants.json`、`mutants2.json`、`mutants4.json` 里 `failed` 的用例名合计，下面 8 条没有任何记录在案的变红改动：
     - 「refuses a configuration that is not an object」。
     - 「fails to load with a configuration …」六条中的五条：that is not an object、that lacks a field、whose bound is not a number、whose clientInfo lacks a field、whose clientInfo.name is not a text。只有 that has an extra field 由 H17 变红。
     - Cordis 机制探针。按性质它测的是 Cordis，这一点应当在证据里写明理由。
   - 契约成员的「keeps the root entry free of runtime values」也不在任何 `failed` 列表里。
   - H19–H21 只有定义文件 `mut/mutants3.json`，没有运行输出（`logs/` 下没有 mutants3 的结果）。所以卡上「H19、H20 变红，H21 存活」没有原件支撑。
   - 出处：H7、H8、H9 只在 13:42 的 `mutants.json` 里出现。
   - 注意：`run.mjs` 用 `×\s+(.*?)\s+\d+ms$` 解析失败的用例名，可能漏掉一些。例如 `mutants.json` 里 C1–C4 的 exit 为 1，但 failed 是 0 条。所以按用例的对应关系从原件确立不了，应当由写者给出一张逐条用例的表。
5. **四成员 turbo 与 lint:deps：达到。** 出处同 M4-5。
6. **六项门禁：未达到。** 原因同七项轻门禁：`format:check` 和 `check:docs` 没有在 head 上重跑。另外卡上只给了退出码和哈希，除 lint:deps 外没有输出尾部，写者日志也没写位置。
7. **diff 只含写范围：卡上没有证据，未达到。**
   - 我在 head 上复核，`git diff --name-only 8446c4588..HEAD` 共 50 个文件。全部落在写范围内，或者是追加 1 放行的共享写合并：`packages/skills/skill-host-local/package.json`、`pnpm-lock.yaml`，以及 `mcp-host-local/package.json` 依赖段新加的 `kernel-basis`。
   - `acceptance/` 没有改动。产品事实成立，卡上缺这条读数。

**性质及证据义务**
- 「缺席不放行」：达到。四条缺席用例在，变红改动 H1–H3、H2b、H4b 都变红。H4 存活，派发者认可为等价，见冲突项。
- 「撤除后进程不留」：达到。
- 「AggregateError 不被吞掉」：机制一半由探针用例证明。插件一半交 A 面逐行核对，未判。

### 冲突项（只列出，不下结论）

1. **追加 1 第 1 项：改用 `definePlugin`，`Config` 的类型为 `StandardSchema<McpPluginConfig>`。**
   - 与第 4 条原句冲突：「写法同先例 `execution-environment-host-local/src/cordis.ts` 的插件对象与手写 Standard Schema。不引入 `@omne-harness/kernel-basis`（依赖段不改）。」
2. **追加 1：「这一次合并与依赖段的变化不算越界」。**
   - 与写范围冲突：「`packages/mcp/mcp-host-local/package.json` — 只加 `exports` 的 `./cordis` 一项；依赖段不改」。
   - 与排除项冲突：「两个成员 `package.json` 的依赖段与锁文件：reduce 已写」。
   - 与授权冲突：「不允许：…改依赖段与锁文件」。
   - 与停止条件冲突：「需要改写范围外的文件（含夹具）、依赖段或锁文件」。
   - 与验收第 7 条冲突：「只含写范围内的文件」。
   - 实际落在 diff 里的文件：`packages/skills/skill-host-local/package.json`、`pnpm-lock.yaml`，以及 `mcp-host-local/package.json` 的依赖段。
3. **派发者认可「探针断言 `AggregateError` 装着的错误」（plan 进度总览 02 关口）。**
   - 与闭包验收第 4 条冲突：「断言 `dispose()` 照常返回、`ctx.logger` 收到这个错误」。
   - 与 plan C5-4 冲突：「`closeAll` 以 `AggregateError` 拒绝时 `dispose()` 照常返回、日志收到这个错误」。
   - 与波包决定 4 冲突：「W4-3 的用例直接断言…以及日志收到这个错误」。
   - plan 写的是 `closeAll` 拒绝，闭包从派发起就改成了探针插件，这一层差异也在这里。
4. **派发者认可「落点缺席 H4 等价」。**
   - 与闭包第 5 条冲突：「`ProcessLanding.start` 答 `fail('unknown')`」，现在没有任何用例能区分这一点。
   - 与验收第 3 条冲突：「依赖它的操作按契约对该端口 `unknown` 的规定答复」。
   - 与 plan C5-3 冲突：「四个端口键逐个缺席时，依赖它的操作答 `unknown`」。用例在服务层断言 `landing-unavailable`。
5. **13:18 的两项自查。** 卡与 plan 都记为派发前写进规格，简报说是「派发后、13:18 前」，两处说法不一致。我拿不到 13:18 之前的规格稿：records 分支没有 `w4-mcp-cordis.md`，tmp 也没有派发时的副本。所以推不出冲突，没有编造。从内容看，它们与 plan C5-4、波包决定 4 一致。

### 未覆盖与不归本面

- 「返回与恢复」要求的几样，卡上都没有：
  - `mcp-host-local/SPEC.md` 的 `./cordis` 一行原文。卡上只说归切片 03。
  - 完整的提交列表。写者有 7 个提交，卡上只点名 `cd7d6a5f1`，另外提了派发者的 `f5ead35f4`。
  - 原件路径。只有 `mut/` 写了路径，`logs/` 和 `tmp/closures/w4-mcp-cordis/gate/` 都没写。
- 卡上「27 条连跑三次都是 27/27」：原件只看到一次慢层运行，三次没有原件。
- 插件撤除函数不捕获 `AggregateError` 的那一半，以及 `CredentialUse` 缺席路径的逐行核对：归 A 面。
- D 面差分变异：派发者还没跑。
- 措辞、设计与实践、结构读数：归 B、C 面，本面不判。
