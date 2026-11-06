# w4-mcp-cordis 关口评审 B 面原文

交回时刻 2026-11-06T14:49:55.426Z（会话记录），代理 `aa8d799cb3f7cf822`。原样保存，裁定见 `mcp-cordis-r1.md`。

---

本次做的是**表达**判断。判据页是 `harness-design-handbook` 的 `references/review/expression.md`，读的是 `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/.meta_harness/.claude/skills/harness-design-handbook/references/review/expression.md`，它是 canonical 页的宿主生成副本。

**结论：有阻断，共 1 簇（B1），另有 7 条非阻断。**

## 对象、范围与完成程度

- **候选**：PR #1158，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis`，head `f5ead35f4`，基线 `8446c4588`。我没有 shell，也就没跑 `git rev-parse` 和 `git diff`。下文全部是对工作树当前文件的直接阅读，**没有核实工作树确实停在 `f5ead35f4`**。
- **范围**：按简报 B 节。`mcp-cordis-contract` 的 SPEC、两份 README、`docs/` 六页、`index.md`、`src/README.md`、`tests/README.md`。`mcp-host-local` 的 `docs/cordis.md`、`context.md`、`public-api.md` 与两份 README。另外读了 `mcp-host-local` 的 `docs/architecture.md`、`docs/object-model.md`、`SPEC.md`、`package.json`、`src/index.md`、`tests/index.md`、`tests/README.md`。
- **为对照读过**：两份 `src/cordis.ts` 与两份测试；`mcp-contract/SPEC.md` 的 R、S、AV、UE、CU、PL 节；`mcp/SPEC.md` 的 MC-5、MC-10 与已知限制段；IC 约定 IC-1～IC-16；闭包规格、W4 MCP 规格第 9–12 条、波包 §4；Skill 组先例和它的评审报告 `skill-cordis-r1.md`。
- **工具输出**：简报没有附。我用的是写者在工作树里留下的 scan 原件：`tmp/w4-mcp-cordis/logs/scan-contract-final.json` 与 `scan-host-local-final.json`。门禁日志和卡上评论没读。我没有运行任何工具。

---

## 阻断

### B1：`mcp-host-local` 的现行正文与新增的 `./cordis` 字面矛盾，或缺新入口

- **类别**：跨契约一致、完整性。与 Skill 组 B1 同型，派发者当时判为阻断。
- **依据**：判据「当前产品依据、采用范围与实现/验证分别陈述」「公共承诺一份现行源」；IC-4（插件从 `./cordis` 发布）；`mcp/SPEC.md:76` MC-10 末句「关闭不声称进程已停」；`mcp-contract/SPEC.md:430` PL1「调用了 `stop()` 不证明进程已停」。

**(a) 字面矛盾**

1. **`SPEC.md:16`**
   - 原句：「`@omne-harness/mcp`（本包的 devDependency）｜只在 `tests/e2e/` 里作调用方」。
   - 反证：`package.json:36` 已把它放进 `dependencies`；`src/cordis.ts:7` 在产品源码里导入 `createMcp`。
   - 同表的 `SPEC.md:218` 写「调用方与本包的真实组合只由 `tests/e2e/` 覆盖」。现在 `tests/cordis-entry.spec.ts` 也在真实组合上走旅程，`:196-207` 的验证表却没有这一行。
2. **`README.md:9` / `README_ZH.md:9`**
   - 原句：「This package starts no process, stops no process … acquires no credential」。
   - 同一文件 `README.md:57` / `README_ZH.md:56` 的示例注释写「`await fiber.dispose() // closes every connection and stops the processes`」。
   - `:57` 本身还与 `docs/cordis.md:65`「`closeAll` 不声称进程已停」、MC-10、PL1 相反。
3. **`docs/object-model.md:34`**
   - 原句：「不适用项：没有继承层次」。
   - 反证：`src/cordis.ts:213/230/259` 的三个子类 `extends` 了 `mcp-cordis-contract` 的抽象 Service。

**(b) 完整性缺口**

- `docs/architecture.md:7-15` 的模块图、`:17-27` 的模块表、`:29` 的依赖方向都没有 `cordis.ts`。也没有它新增的包外依赖：`@omne-harness/mcp`、`mcp-cordis-contract`、`kernel-basis`、`@deepseek-ai/cordis`。`:48-54` 的验证表没有 `tests/cordis-entry.spec.ts`。
- `docs/object-model.md:7-32` 的对象图与表没有四个端口适配器、三个服务子类和撤除函数。
- `README.md:5` / `README_ZH.md:5` 的用途句和 `package.json:6` 的 `description` 只写传输。`README.md:11-19` 的状态表没有插件一行，即已实现、只在脚本化 stdio 上验证、HTTP 旅程未执行、未接受。

**触发与后果**：读者按 `object-model.md` 或 `SPEC.md:16` 理解本包，会得出与源码和 `package.json` 相反的结论。合入后同一成员的正文互相矛盾，接受者无法据此接受。

**需补足**：

- 上面每一处都写到现状。
- `SPEC.md:3` 与 `:19`「本包是…的实现方」「本包不起进程、不停进程、不取凭据」是传输角色的框定句，单看不算假句。派发者补的 `./cordis` 一行必须把这层框定收窄到根入口，否则读者会读成全称。
- **归属**：`object-model.md`、`SPEC.md`、`README.md:9`、`package.json` 在写范围之外；`architecture.md` 的模块表也超出「只改写到 Cordis 绑定或 `module` 变体的句子」。这一簇归派发者：扩大写范围，或与 `SPEC.md` 的 `./cordis` 一行一起改。

---

## 非阻断

### N1：缺席答复的规范权威写在定义成员里

- **类别**：归属越界、引用与归属。
- **位置与原句**：`mcp-cordis-contract/SPEC.md:43` 性质 9 写出四个缺席答复，并写「这条规则由使用方兑现，**本成员只规定它**」。同类规范句还在 `docs/cordis.md:16-19`（「缺席答 `unknown`」）、`:33`、`:52`，以及 `docs/flows.md:42`、`:50`。
- **依据**：同波 Skill 组裁定，缺席答复归提供者成员的 SPEC 或 `docs/cordis.md`，定义成员只引用；先例见 `skill-cordis-contract/SPEC.md:40` 与 `skill-cordis-contract/docs/cordis.md:16`。本切片里规范句已在 `mcp-host-local/docs/cordis.md:40-48`。
- **后果**：两处都写成规范句，而定义成员主张自己是规则拥有者。改一处，另一处仍是现行权威。
- **需补足**：性质 9 和上面几处改为引用 `mcp-host-local/docs/cordis.md#端口的现取`。本切片写不了 `mcp-host-local/SPEC.md`，权威只能落在 `docs/cordis.md`。
- **一并处理**：`mcp-host-local/docs/public-api.md:3`、`README.md:62`、`src/README.md:11` 都写「非类型行为的唯一正文是 SPEC.md」，而插件行为实际在 `docs/cordis.md`。派发者补的 `./cordis` 一行要明确授权 `docs/cordis.md` 拥有插件行为。

### N2：「端口缺席时答 `unknown`」以全称写出，契约里有反例

- **类别**：表达歧义。同 Skill N1。
- **位置与原句**：
  - `mcp-host-local/docs/cordis.md:48`：「采用或资格不可读时答 `unknown`（S1、R1）」。
  - `tests/index.md:14`：「答契约的 `unknown` 一类答复」。
  - `README.md:43` 的「an absent port answers `unknown`」也容易读成「操作答 `unknown`」。
- **依据**：`mcp-contract/SPEC.md:323` 的 S1 把四个任务操作和 `cancel` 排除在外。
  - S2（`:330`）：任务操作复用现有连接时不问采用与资格，所以端口缺席不挡它们。
  - 任务操作要新建连接而资格不是 `granted` 时，答 `effect-unknown`（`no-connection`）。
  - 落点缺席时，`refresh` 答 `landing-unavailable`（R6），不带 `unknown`。用例 `cordis-entry.spec.ts:457` 也是这样断言的。
- **后果**：消费者会以为资格端口缺席时一切操作都被挡住，但复用连接的任务操作仍会执行。
- **需补足**：按操作分写，或改成只引用 S1、S2、S8、R6；`tests/index.md:14` 写出四种实际答复。

### N3：没有披露 `dispose()` 可能不返回

- **类别**：跨契约一致、完整性。
- **位置**：`mcp-host-local/docs/cordis.md:56-60`。原句写「`dispose()` 在 `closeAll` 结算之后才返回」，「未覆盖」（`:111-119`）里也没提。
- **依据**：`mcp/SPEC.md:180` 的已知限制写道：`close()`、`stop()` 或 `release()` 不答复时 `closeAll` 也不答复，「宿主应以自己的期限包住 `closeAll`」。
- **触发与后果**：落点的 `stop()` 或凭据句柄的 `release()` 挂起时，撤除函数不结算，`fiber.dispose()` 永不返回。装配方从插件页既读不到这个后果，也读不到期限归谁。
- **需补足**：在生命周期一节或「未覆盖」写明这条限制，并写明本插件不设期限、谁承担。要不要加期限见「范围外待裁决」第 1 条。

### N4：IC 映射没有反映 scan 的 `unknown`，定义成员页没有「未覆盖」

- **类别**：形式对应、引用与归属。同 Skill N4。
- **依据**：判据「工具 unknown 按其明确范围人工核对」。scan 原件：
  - `mcp-cordis-contract` 的 `integration` 为 `unknown`，IC-1、IC-3、IC-5 共 42 条，状态都是 `unknown`。
  - `mcp-host-local` 的 IC-5 条目为 `unknown`，IC-2 为 `converged`。
- **位置**：
  - `mcp-cordis-contract/docs/cordis.md:44`（IC-1）、`:46`（IC-3）、`:48`（IC-5）的证据栏没有写「scan 读数 unknown，人工核对：…」。全页没有提 scan，也没有「未覆盖」一节。
  - `mcp-host-local/docs/cordis.md:82` 的 IC-5 行同样缺。`:5` 与 `:119` 只泛称 `integration` 为 `unknown`。
- **需补足**：照 `skill-cordis-contract/docs/cordis.md:42`、`:46`、`:77-81` 与 `skill-host-local/docs/cordis.md:49` 的写法，逐行写出 scan 的 `unknown` 和人工核对的内容；定义成员页补「未覆盖」一节。

### N5：`mcp-host-local` 的 IC 映射缺 IC-3、IC-6、IC-7 三行

- **类别**：完整性。同 Skill N3。
- **位置**：`mcp-host-local/docs/cordis.md:77-86` 只有 8 行。`mcp-cordis-contract/docs/cordis.md:49` 的 IC-6 行把证据写成「归 mcp-host-local」，而 host-local 只在 `:117` 写「未验证」，没写同一 isolate 重复装载时怎样处置。
- **需补足**：补齐三行，写明做到、不适用或未验证及理由。IC-3 行写三个子类 `extends` 定义成员的抽象类；IC-7 行写提供者成员的限定名；IC-6 行写处置方式或明确「未定、未验证」。

### N6：换代时在途端口调用的归属没有落到拥有者

- **类别**：完整性（行为问题 8，IC-9 末句）。
- **位置与原句**：
  - `mcp-cordis-contract/SPEC.md:53` 与 `docs/flows.md:51` 写「本成员不规定在途操作的结局」，但没指明谁规定。
  - `mcp-host-local/docs/cordis.md:50-52` 只写已建连接持有的句柄。另外 `:52` 说换代粒度是「下一次端口调用」，`:106` 说「下一次操作」。
- **后果**：同一操作里已转给旧提供者的那次调用，答复是否采用、后续端口调用用哪个实例，读者只能猜。
- **需补足**：在 host-local「换代时旧引用的处置」加一句，照 `skill-host-local/docs/cordis.md:27`：已转给旧提供者的调用照用它的答复，同一操作里换代之后发出的端口调用用新实例；定义成员改为指向这里。

### N7：几处小的不准确与同页漂移

- **类别**：表达歧义、引用与归属。
- **配置字段的叫法**：`README.md:43` / `README_ZH.md:42` 写「five serializable bounds」「五项可序列化的上界」，但 `clientInfo` 不是上界。按闭包规格写作「四个上界与 `clientInfo`」。
- **关停后的答复**：`mcp-host-local/docs/cordis.md:59`「之后到达的操作答关停的答复」。「关停的答复」没有定义，也漏了 S8 规定的、关停时在途且尚未发出的操作。改为直接引用 S8。
- **没有证据的声明**：`mcp-host-local/docs/cordis.md:30` 声明 `clientInfo` 里有多余字段也拒绝，`:109` 的验证清单没有这一项，「未覆盖」也没写。二选一补上。要不要加用例转 A、C 面。
- **依据表漏条款**：`mcp-cordis-contract/SPEC.md:11` 的依据范围写「IC-1 至 IC-4、IC-5、IC-7、IC-9」，漏了性质 2 引用的 IC-8，写法也冗余。
- **模板残句**：`mcp-cordis-contract/index.md:15` 与 `src/README.md:3`「公开定义、运行时校验与内部实现」，与 `SPEC.md:3`「本包没有运行逻辑」矛盾。
- **验证范围写宽**：`mcp-cordis-contract/docs/cordis.md:75` 的「子类作为插件装载后在键上提供服务」读作七个类都验证了，实际本成员只装两个（`tests/README.md:22`、`SPEC.md:62`）。

---

## 范围外待裁决

只列出来，不据此否决方案。

1. **撤除期限**：波包决定 4 规定撤除函数只有一步 `await closeAll()`，`mcp/SPEC.md:180` 则说「宿主应以自己的期限包住 `closeAll`」。插件是否加期限归决定 4 的拥有者（派发者或负责人）。不加时按 N3 披露；加则要改决定 4。
2. **W4 MCP 规格的全称句**：`spec.md:118`「不建连、不发出，答 `unknown`」与 `:131`「依赖它的操作按 `mcp` 现行规则答 `unknown`」与 N2 同病。由派发者更正，先例是 `spec.md:98` 的处理。
3. **插件行为的规范归属**：`mcp-host-local` 插件行为的规范正文落在 `SPEC.md`，还是由 `SPEC.md` 授权给 `docs/cordis.md`，由派发者写 `./cordis` 一行时定（见 N1）。

## 未覆盖

- **没有运行工具**：没跑 `git diff` 核对文件清单，没核实 head；没跑 `check:docs` 与 scan，只读了写者留的 JSON；没读门禁日志、卡 #1119 的证据评论和 `documentation.json` 的登记。
- **没有逐页读**：`mcp-cordis-contract` 的 `docs/index.md`、`src/index.md`、`tests/index.md`，以及 `schema/`、`verification/`、`adr/`、`examples/`、`resources/` 的 README 与 index；`mcp-host-local/docs/flows.md` 只看了 grep 命中的部分。`acceptance/` 的占位按简报归派发者。
- **转交 A 面（正确性）**：Cordis 4.0.4 的机制断言没有对源码核对（`docs/cordis.md:60`、`:63`，`_unload` 的 `Promise.all`、`Logger` 逐个写出 `AggregateError`）。
- **转交 C 面**：凭据适配器的 `http-authorization` 分支运行时没有被任何用例走到，只靠「Streamable HTTP 旅程未执行」间接涵盖；`clientInfo` 多余字段没有用例（见 N7）。
- **不在本切片**：组页与领域页（切片 03）。

## Owner

- **派发者**：B1 的写范围扩大，以及 `SPEC.md:16`、`:19`、`:218` 和 `./cordis` 一行的措辞；范围外第 2、3 条。
- **决定 4 的拥有者**：范围外第 1 条。
- **修复轮写者**：N1–N7，都在写范围内的文档。N1 后半句涉及的 `SPEC.md` 由派发者处理。

## 相关文件（绝对路径）

- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-cordis-contract/SPEC.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-cordis-contract/docs/cordis.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-cordis-contract/docs/flows.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-cordis-contract/index.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-cordis-contract/src/README.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/docs/cordis.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/docs/architecture.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/docs/object-model.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/docs/public-api.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/README.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/README_ZH.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/SPEC.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/package.json`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/tests/index.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp/SPEC.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-contract/SPEC.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/tmp/w4-mcp-cordis/logs/scan-contract-final.json`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/tmp/w4-mcp-cordis/logs/scan-host-local-final.json`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/mcp/spec.md`

接受不是本次评审的动作。评审完成不表示规格已接受或实现已验证。
