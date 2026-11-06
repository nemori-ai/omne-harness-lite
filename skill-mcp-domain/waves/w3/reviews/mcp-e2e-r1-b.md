# PR #1149 B 面：文档表达评审（r1）

对象：分支 `PanQiWei/skill-mcp-w3-mcp-e2e`，head `71b4b02f3`，基线 `3289bee2f`。工作树 `.worktrees/w3-mcp-e2e`，只读。

结论：阻断 2 条，非阻断 10 条。

## 看过的路径与命令

- 改动文档：`packages/mcp/mcp-host-local/SPEC.md`（「组合与验证」一节，以及「范围与依据」「未覆盖」），`tests/README.md`、`tests/index.md`、`tests/fixtures/README.md`、`tests/e2e/README.md`、`tests/e2e/index.md`。
- 代码事实：`tests/e2e/targets.ts`、`assembly.ts`、`command.ts`、`journey.spec.ts`；契约 `mcp-contract/src/services.ts`（`McpPorts`）、`mcp-contract/SPEC.md`（C4、S8、PL1、旧修订的 `clientCapabilities`）。
- 上层与关联：闭包规格 `w3-mcp-e2e.md`；`docs/member-documentation.md`（目录入口）；`mcp-host-local/README.md`、`README_ZH.md`；`packages/mcp/README.md`；`mcp/SPEC.md`；`mcp/verification/README.md`；`compat/README.md` 的 2026-11-06 一节。
- 命令（均在 `.worktrees/w3-mcp-e2e`，结束后 `git status` 干净）：
  - `pnpm run check:docs`：PASS（2753 个 Markdown 文件，本地链接与镜像）。没有断链。
  - `pnpm run lint:rules`：PASS（无违反）。
  - `asd-ste100/scripts/ste-lint.py e2e/README.md e2e/index.md`：0 违反。该脚本按英文规则判，对中文无力，中文表达靠人工读。
  - 没有运行 `docs:inventory`（它写 `tmp/`）。

## 阻断

### B-1 `mcp-host-local` 的两份 README 仍写「真实组合未验证，归 `w3-mcp-e2e`」

- 文件：`packages/mcp/mcp-host-local/README.md:17`、`README_ZH.md:17`。
- 原文：「远程对端、TLS、代理、真实网络失败；与 `@omne-harness/mcp` 的真实组合 | 未验证；归 `w3-mcp-e2e` 与集成任务」（英文版同义）。
- 问题：本 PR 已加 `tests/e2e/`，SPEC 的「未覆盖」也已改成「真实组合只由 `tests/e2e/` 覆盖」。包 README 的状态表与 SPEC 现在互相矛盾。表里还把任务闭包名 `w3-mcp-e2e` 写成正式文档的归属，那是任务材料名，读者查不到。这属于落盘遗漏：SPEC 的同一事实没有同步到随包 README。
- 闭包写范围没有列这两份文件（闭包只列了 SPEC、tests 下的五份文档）。所以需要派发者扩写范围，或另开小闭包。
- 建议改法：把该行拆成两行。一行写「远程对端、TLS、代理、真实网络失败：未验证」。另一行写「与 `@omne-harness/mcp` 的真实组合：在本机五个目标上验证，范围与未覆盖项见 [SPEC](SPEC.md#组合与验证)」。去掉 `w3-mcp-e2e`。英文版同改。

### B-2 SPEC 条款列的「C4」与契约的 C4 是两件事

- 文件：`packages/mcp/mcp-host-local/SPEC.md:201`（新行的第一格「真实组合（调用方加本传输），C4、MC3-12」）。
- 问题：这一列在本页其余各行里放的是契约与本页的条款代号（H1、T2、S07 等）。本包读者读到 `C4`，会按 [契约 SPEC 的 C4](../mcp-contract/SPEC.md)（`mergeListing` 只接受 `completeListing` 构造的清单，抛 `TypeError`）理解。新行验证的不是那一条。这里的 `C4` 是卡 #1119 的判据编号，只存在于任务材料。该陈述按上下文读与契约相反。
- 说明：闭包规格第 74 行字面要求「表里加 `tests/e2e/` 一行（C4、MC3-12）」。所以这是闭包文字的缺陷，不只是写者的问题。
- 建议改法：条款格改成它真正验证的东西，不用任务编号。例如「调用方与本传输的组合（`createMcp` 加 `createLocalTransportFactory`）」。若要指契约条款，只列真正被走到的、可链接的条款（例如 [T8](../mcp-contract/SPEC.md#t8) 的结局与 [S8](../mcp-contract/SPEC.md) 的释放），并加链接。

## 非阻断

### N-1 `MC3-12` 是任务材料里的编号，正式文档里无处可查

- 文件：`SPEC.md:201`、`tests/index.md:18`、`tests/e2e/index.md:8`、`tests/e2e/README.md:31`；代码注释 `journey.spec.ts:3`。
- 问题：`MC3-12` 出自波段规格（`tmp/`）。读者无法解析，也没有链接。按本项目对条款编号要带链接的要求，裸代号没有信息。
- 建议改法：删去编号，保留陈述「两个现代传输（stdio 与 Streamable HTTP）上，七步各自的结局种类相等」。这句已经在各处写了。

### N-2 用「任务材料」作依据，且「对照过一次」是过程描述

- 文件：`SPEC.md:210`（「只在任务材料的兼容矩阵里与官方 SDK 客户端对照过一次」）；`tests/e2e/README.md:35`（「兼容读数见任务材料」）。
- 问题：任务 `tmp/` 不是正式落点，后来者读不到。「对照过一次」没有日期、版本与结论。事实本身有据：`compat/README.md` 2026-11-06 一节记 SDK `@modelcontextprotocol/client` 2.4.0、实现提交 `3289bee2f`、八行两边一致，三个远程目标各带 `date -u`。但正式文档没有把它写成现状。`SPEC.md:11` 已有同类先例（「闭包 `w3-mcp-host` ……任务材料」），所以不阻断。
- 建议改法：写成现状加范围。例如「真实远程对端（DeepWiki、Context7、Microsoft Learn）不在本包的持续测试里；它们只在 2026-11-06 与官方 SDK 客户端 2.4.0 做过一次三步对照（发现、列工具、只读调用），两边一致」。README 的「当前缺口」只写「远程服务端不在本目录」，去掉「见任务材料」。

### N-3 旧 HTTP+SSE 的 S4、S5「由脚本化传输上的契约用例覆盖」没有指向，也与「不适用」不同义

- 文件：`SPEC.md:201`。
- 问题：S4 与 S5 在 2025-11-25 上不存在（契约规定旧修订的 `clientCapabilities` 是空对象，没有任务扩展），所以「不适用」是对的。被脚本化传输覆盖的是现代修订上的这两步，不是旧修订上的这两步。「它们」指代错位。句子也没有给出文件。核对：`packages/mcp/mcp/tests/continue.spec.ts`、`tasks.spec.ts` 用 `doubles/scripted-transport.ts`，存在。
- 建议改法：「旧 HTTP+SSE 没有任务扩展，也不声明表单输入，输入与任务两步不适用。这两步的调用方逻辑在 `@omne-harness/mcp` 的 `tests/continue.spec.ts` 与 `tests/tasks.spec.ts` 里由脚本化传输覆盖。」

### N-4 「五个需求端口」后面列了七个

- 文件：`tests/e2e/README.md:11`。
- 问题：契约的五个需求端口是 `adoption`、`eligibility`、`credentials`、`landing`、`store`（`services.ts` 的 `McpPorts`，契约 SPEC 第 128 行）。`transports` 与 `checkOutput` 另算。该段以「五个需求端口里」开头，却依次列出 `checkOutput` 与 `transports`。这是闭包规格的原句。
- 建议改法：改为「`createMcp` 的端口里，`adoption`、……」，或把前五个与后两个分成两句。

### N-5 「范围是五个本机目标与七步」说大了

- 文件：`SPEC.md:215`。
- 问题：七步只在 E-stdio 与 E-http 上全走。E-sse 走 S1、S2、S3、S6、S7，F 与 P 只走 S1、S2、S3、S7（`journey.spec.ts` 的 `applies`）。「与七步」读成每个目标七步。同行的「没有 OAuth 目标，也没有多租户或并发交错的组合用例」与代码相符。
- 建议改法：「范围是上表所列的五个本机目标，每个目标走适用的步」。

### N-6 `tests/index.md` 写「五个真实服务端」

- 文件：`tests/index.md:18`。
- 问题：真实服务端是三个（`server-everything`、`server-filesystem`、`mcp-server-fetch`），目标是五个（`server-everything` 占三种传输）。同行的 `tests/e2e/index.md` 与 `SPEC.md` 写「五个目标」「五个本机目标」，是对的。
- 建议改法：改成「五个目标」。

### N-7 `tests/README.md` 的「每个用例结束时核对没有遗留的子进程与监听端口」不适用于 e2e，慢层列表也漏了 `journey.spec.ts`

- 文件：`tests/README.md:11`。
- 问题：e2e 的 `afterEach` 只核对子进程（`leftover()`），不核对监听端口；HTTP 目标靠 `started.close()` 关。`e2e/README.md` 的维护节只写「子进程」，与代码相符。`tests/README.md` 的通句放在新增的 e2e 句之前，读成对所有用例成立。慢层的文件枚举（`conformance`、`stdio`、`http`）也没有 `journey.spec.ts`。这条通句本来就对快层不成立，是旧毛病，所以只列非阻断。
- 建议改法：在 e2e 句里写明「每个用例结束时核对没有遗留的子进程」，并把「子进程与监听端口」限定在 A、B 层三个文件上。

### N-8 SPEC 的「范围与依据」没有登记新增的测试对端

- 文件：`SPEC.md:13`。
- 问题：该行写 `server-everything` 等「只在测试里作对端（B 层夹具）」。`tests/e2e/` 新增了 `server-filesystem`（`package.json` 的 catalog 版本）与 `mcp-server-fetch 2026.10.28`（`pyproject.toml` 的 `mcp-fixtures` 组），也把 `@omne-harness/mcp` 当作测试里的调用方。表里都没有。
- 建议改法：在该行补上这两个对端与版本，并注明 `mcp-server-fetch` 不在默认的 `uv sync --locked` 里。

### N-9 `tests/e2e/README.md` 对 S7 与目标适用性的写法不够直接

- 文件：`tests/e2e/README.md:23`（S7 行）与 `:25`。
- 问题：S7 期望写「停止范围与目标一致」。代码里是 stdio 目标期望 `root-only`（测试的落点只停根进程，`command.ts` 与 `spawnHandle` 都答 `root-only`），HTTP 目标期望 `no-process`。契约 PL1 允许 `tree-confirmed`、`root-only`、`unconfirmed` 三种，读者看到「一致」不知道是哪个值。「目标与适用的步见 `targets.ts` 和 `journey.spec.ts`」让读者去翻代码才知道哪个目标跑哪些步。
- 建议改法：S7 行写「`released`；stdio 目标的 `process` 是 `root-only`，HTTP 目标是 `no-process`；没有遗留进程」。在「边界」节补一张「目标 × 适用步」的小表（见后文的图一节）。

### N-10 `tests/fixtures/README.md` 用代码样式指向 `../e2e/`，不是链接

- 文件：`tests/fixtures/README.md:19`（「由 `../e2e/` 的旅程步 S5 验证」）。
- 建议改法：改成 [../e2e/README.md](../e2e/README.md) 的链接。链接目标存在，`check:docs` 通过。

## 落盘遗漏

- 闭包要求的五份文档与 SPEC 一节都已落盘，E-sse 的 S4、S5 不适用理由、P 的跳过、`fixtures/README.md` 的「当前缺口」一句都已写。`tests/README.md`、`tests/index.md` 与 `tests/e2e/index.md` 互相索引，`e2e/index.md` 列了目录里全部四个代码文件与 README。
- 遗漏只有 B-1：随包 README 的状态表（含中文版）。另见 N-11。
- `documentation.json` 没有登记 `tests/e2e/README.md` 与 `index.md`。`check:docs` 与 `lint:rules` 都通过，仓库里也没有其他 `tests/` 子目录登记的先例（`tests/model/`、`tests/probes/` 都没有登记）。闭包只在检查要求时才登记。判为不需要，只作记录。

### N-11 组入口 `packages/mcp/README.md:55` 的「组合行为……都没有证据」部分过时

- 问题：该句说「组合行为、攻击、资源与耐久都没有证据」。现在 `mcp-host-local/tests/e2e/` 给出了组合行为在五个本机目标上的证据。「攻击、资源与耐久」仍无证据。`mcp/SPEC.md:214` 与 `mcp/verification/README.md:287` 的「真实组合未验证」是在说 `mcp` 包自己的测试，仍成立。
- 建议改法：不在本闭包范围。交给集成与 reduce：把该句改成「组合行为只在 `mcp-host-local` 的 `tests/e2e/` 有本机五个目标上的证据；攻击、资源与耐久没有证据」。

## 下层与上层

- 没有发现下层违背契约 SPEC 的陈述：S6 的「`cancel` 答 `signalled`，`invoke` 答 `unknown`（`abandoned`）」、S7 的 `released`、旧修订上没有任务与表单输入（契约：旧修订的 `clientCapabilities` 是空对象），都与契约和代码相符。
- 所见矛盾见 B-1（包 README 对 SPEC）与 B-2（代号对契约）。
- 没有持久化形态，持久化一项不适用。

## 表达

- 没有把过程或会话状态写成规范的整段。过程性的句子有：「任务材料」「对照过一次」（N-2）。
- SPEC 新行是一个很长的单元格，含三个句子。邻行同样长，格式一致，不单列。

## 图

- 没有必要补的图。
- 建议补一张「目标 × 适用步」的表（不是图），放在 `tests/e2e/README.md`「边界」节旅程表之后。它说明五个目标各自走哪些步、预期修订和 S7 的停止范围。内容来自 `targets.ts` 与 `JOURNEY` 的 `applies`，可以替掉 `目标与适用的步见 targets.ts` 那句。
- 不建议加 UML 或流程图。旅程是线性的七步，表已经足够。
