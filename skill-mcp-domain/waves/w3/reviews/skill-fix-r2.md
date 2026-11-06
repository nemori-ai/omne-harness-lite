# w3-skill-fix 第 2 轮收尾的独立评审（2026-11-05，本机接手会话）

对象：工作树 `.worktrees/w3-skill-fix`，head `777abf7eb`，基线 `f79aab4d4`（整个闭包）。

## 面 1：SPEC 表达（design-reviewer，expression，claude-opus-5-5）

结论：1 阻断，6 非阻断。报告原文要点：

- **B1** S7 的内容摘要条件在契约 SPEC 有三种说法（第 82、469、505 行）。请求带依据、端口答 `adopted` 而引用不带内容摘要时：按裁定 1 与第 82 行答 `unknown`；按第 505 行与实现（`port-answer.ts:67`）答 `unsupported`。不是安全缺口（两种读法都不交内容），是承诺不确定。
- **N1** GS-04（没有合法头部的正文答 `source-unavailable`）改了组页第 11 步，没进契约「与组页的差异」表；契约「读取的形状规则」只写 `bodyOffsetOf` 答 `undefined`，没写 `read` 答什么。
- **N2** 契约第 252 行逐行读取的接受条件写成「非空文本」，没写上限 `DESCRIPTION_LIMIT` 与 `description-over-limit`。
- **N3** 契约第 333 行「头部既不是 YAML 映射、逐行也读不出」可读成 YAML 干净解析为标量时也逐行读，与第 247 行和实现不同。
- **N4** 契约第 427 行「足够的字符串预算」没有下限。
- **N5** host-local SPEC 的契约修订钉 `b0f2ec7fb` 过时，依据表没有 N1，第 118 行把改名的包写进两个合法包的旅程（实际是另一次运行另加的目录）。
- **N6** 模型 README 第 55 行没写最终复跑所在的修订。
- 范围外待裁：B1 的取舍；提示名 `description-over-limit` 在上限已是 16384 时仍指 1024（N2 已定名，不再判）。

## 面 2：L3 实现评审（implementation-reviewer，claude-opus-5-5）

结论：无阻断。复跑：三成员 turbo 0（skill 480 例、host-local 89 例）、慢层 7/7、TLC `ReadGate` 正控与 `FlawNoRefCheck` 负控（v1.7.4）、oxlint、oxfmt；自写 S7 探针 9 种答复、解析放宽探针 16 种头部。写范围无越界。

- 非阻断 1：契约 SPEC `:255`「重复键在整个图中都是 `malformed`」与 `:247`（值内部重复键退到逐行读取，实现按此）矛盾；`malformed-duplicate-key` 夹具改了含义，`parse-manifest.spec.ts` 删了四例拒绝，交付说明要逐条写理由。
- 非阻断 2：门禁日志在 `3225599f7`，head `777abf7eb` 又改了 `by-line.ts` 一行与用例；`lint:rules`、`lint:deps`、`check:docs`、`check:design` 要在最终 head 补跑。
- 非阻断 3：为 S7 改写的三处断言（`describe.spec.ts`、`pin.spec.ts` step-05、内存替身摘要）在交付说明里写理由。
- 范围外 4：逐行读取对 tab 缩进续行、`description: 12`、未闭合引号后的 `name:` 行都按字面接受。符合裁定 5，不过读取关口。
- 范围外 5：同表达评审 B1。
- 范围外 6：16384 字符的说明在真实资产路径上要靠读取方 `readBodyText` 的字符串预算，预算方还不存在。
- 观察：逐行读取只保留 `name`、`description`，其余字段只留一个提示。

## reduce 裁定

- **B1 → 答 `unknown`（按裁定 1）**。依据点名的是一份带内容摘要的材料（`SkillMaterialBasis.digest` 必填）；不带内容摘要的引用不可能是那份材料，答 `unsupported` 等于替端口断言「依据所指的材料没有包」，与依据本身矛盾。改：边界解析要求带依据时引用的内容摘要在场且等于依据的；契约第 469、505 行与 skill SPEC、S7 账本统一为一种说法；内存替身 `answerOf` 对不带包的材料不再在带依据时原样交出引用。
- **N1–N6**：照评审建议改，写者是本会话。
- 提示名不改（N2 已定）。
- **L3-1**：删 `:255` 的遗留句，改成与 `:247` 一致；交付说明列夹具改写与四例删除的理由。**L3-2**：最终 head 上补跑全部收尾门禁。**L3-3**：交付说明写三处 S7 改写的理由。
- **L3-4 不收紧**：逐行读取只在严格 YAML 读不出时才用，是对已经坏掉的头部的尽力读取，宽进是裁定 5 的本意；它不经过读取关口。SPEC 写明逐行读取的规则是字面规则（不按 YAML 语义），只保留 `name`、`description`。
- **L3-6 / N4**：契约写明读取方的字符串预算下限（`maxStringLength` 不小于 `DESCRIPTION_LIMIT` 个字符按 `@omne-harness/json-text` 的计数单位），并在「未封闭项」登记拥有者：资产正文的读取方（资产成员或装配）。
