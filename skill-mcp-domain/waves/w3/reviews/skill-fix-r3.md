# w3-skill-fix 第 3 轮增量评审（PR #1135，head `b02524a66`，范围 `777abf7eb..b02524a66`）

证据：卡 #1119 评论 6655515530。

## 设计与实践（general-purpose，sonnet，2026-11-05 交回）

结论：无阻断；非阻断 2，建议 4。

- **N1** `skill/tests/export.spec.ts:81-88` 只断言 `basis-unavailable` 与 `open` 0 次；`basis-not-lawful` 也映射为 `basis-unavailable` 且 `snapshot`、`open` 都是 0，用例可能因错误的原因通过。改法：加 `snapshot` 为 1。
- **N2** `skill-contract/src/testing-resolution.ts:70-76` 的新分支（无包材料带依据时带回依据摘要）在 skill-contract 内没有直接用例；契约 SPEC `:471`「所指材料没有包时也一样」与 `:573`「此时该例不适用」说法不一致。改法：加直接用例，或让 PR3 摘要用例对无摘要材料也能跑并改 `:573`。
- **S1** `skill/src/access/pin.ts:49-52`：带依据时无摘要的分支到不了；先判 `basis` 再判无摘要，不变量落进代码。
- **S2** `skill/tests/model/world.ts` 的 `Misdirection` 在四处各列一遍：改成 `as const` 数组派生类型。
- **S3** `world.ts:461-464` 的 `undigest` 守卫在模型里到不了；不要求改。
- **S4** `export.spec.ts` 的无包用例改 `it.each` 覆盖 `read`、`list`、`export`，各断言 `snapshot` 1、`open` 0。
- 旁注：中段通配的 pathspec（`'packages/skills/*/src'`）在本树返回空，评审者改用显式路径。

## 交付边界（general-purpose，sonnet，2026-11-05 交回）

达到：验收 1、2（探针输出未单贴）、6；裁定 1–6；trailer；写范围大体。未达到（证据未上卡）：

1. 验收 3：GS-02、GS-04 的改写说明与「恢复旧映射使用例变红」的命令与输出（原件 `logs/red-gs02.log`、`red-gs04.log`，只在 tmp）。
2. 验收 4：最终 head 上的语料加载率（每类包数、加载数、读正文）。
3. 验收 5：每条修复的手工变异与变红证据，含第 3 轮 B1/PR3。
4. 返回内容：落点与用例名对照、命名账本、结构性改动清单、未覆盖项。

冲突项（交卡拥有者）：1 additive 与行为改变（GS-02/GS-04/N2/B1 改了已发布的契约行为）；2 组页与成员 SPEC 在波末写回前不一致；3 reduce 兼写者；4 host-local SPEC 依据表的改动超出 N1 的写范围授权；5 说明超过 16384 仍拒绝与「软约束不拒绝」措辞不同；6 语料口径由云机六类 197 包换成本机十类 190 包；7 裁定 1 的 `adopted()` 条款无可核对对象，被规格修订成空条款；8 TLC 工具位置（次要）。

## 正确性与结构读数（implementation-reviewer，opus@high，2026-11-05 交回）

结论：无阻断。第 2 轮 B1、N1–N6、L3-1–3 全部已修。`lint:deps` 通过；本轮改动函数 `namesRequested` CC 6、`answerOf` CC 4，覆盖 100%。

- **非阻断 1** `ReadGate.tla:178-179` 新加的 `misdirect-digest` 不能证伪任何性质：评审在副本里删掉 `\/ ~a.dig`，七个不变式仍成立，状态数相同。S7 的「不带内容摘要」子情形实际只由探索器与单元用例证明。二选一：加不变式与能找到反例的负控，或 README 写明 TLA 不证这一子情形。
- **非阻断 2** 契约 PR3 的新义务在符合性套件里测不到：`testing-resolution.ts:207-215` 对无摘要材料抛 `NotApplicable`，夹具没有无包材料。按第 2 轮写法回显的真实端口能通过整个套件（与设计与实践 N2 同一问题）。
- **非阻断 3** 两处行为变化没写进交付说明且没有带依据的用例：`describe` 带依据查无包材料由 `no-readable-package` 变为 `pinned`；`read` 带依据、路径坏由 `unsupported` 变为 `bad-path`。`read`/`list` 带依据答 `basis-unavailable`、`describe` 带依据答 `pinned` 都没有用例（与设计与实践 S4 同一缺口）。
- **非阻断 4** 证据没交代一次中间红：`r3/test-skill.log` 里旧 `export.spec` 断言失败，是 B1 的预期改变。
- 范围外：组页第 164、182、349、417、442、457、480 行仍写 `unsupported`（波末写回）；闭包内两个变更函数超 alert（`parseSkillPackage` CC 14、`skillResolutionConformance` CC 12），不是本轮改动，交付说明未交代。

## 表达（design-reviewer，opus@xhigh，2026-11-05 交回）

结论：1 阻断，5 非阻断；第 2 轮 B1、N1–N6 全部闭合。

- **B1** 带依据时无包材料不再答 `unsupported`，没登记进契约「与组页的差异」表；skill SPEC `:32`「没有可读的包加坏路径答 `unsupported`」没限定；skill SPEC `:78` 写了第 11 步被取代，没写第 5 步。改：`:32` 加「不带依据时」并写带依据答 `bad-path`；差异表新加一行（不改 `:82`）；`:33` 或 `:71` 注明第 5 步被取代。
- **N1** 契约 `:114` 与 `values.ts:140`「引用不带内容摘要表示没有包」要加「不带依据时」，并补「带依据时引用总带依据的内容摘要（PR3）」。
- **N2** `:471`「所指材料没有包时也一样」没有符合性用例，也没登记为未覆盖（与 L3 非阻断 2、设计与实践 N2 同）。
- **N3** 「来源在引用的定位处没有包」被当成事实写，没人负责；改成带条件的说法（结果由第 7 步决定），或写成端口义务。
- **N4** 契约 `:254`「读取关口」没定义。
- **N5** host-local `:15` 与契约 `:16-17` 对同一裁定的日期不同。

## reduce 裁定（2026-11-05，第 4 轮由本会话修）

- 表达 B1、N1、N3（取带条件的说法）、N4、N5 照改。
- 套件缺口（L3 非阻断 2、设计与实践 N2、表达 N2）：补，不登记为未覆盖。`skillResolutionConformance` 的夹具加可选的无包材料，PR3 对它核对回显的内容摘要；没有时不适用。内存解析的套件世界给出它。`:573` 同步改。
- 用例缺口（L3 非阻断 3、设计与实践 N1、S4）：无包材料带依据的 `read`、`list`、`export` 各断言 `basis-unavailable`、`snapshot` 1 次、`open` 0 次；`describe` 带依据答 `pinned`；`read` 带依据、路径坏答 `bad-path`。交付说明补这两处行为变化。
- 设计与实践 S1（`materialOf` 先判依据）、S2（`Misdirection` 由 `as const` 数组派生）照改；S3 不改。
- L3 非阻断 1：模型 README 与 `verification/README.md` 写明 TLA 不证「引用不带内容摘要」这一子情形，由探索器与单元用例承担；不另加不变式（模型里 `adopted` 的引用身份已由 `misdirect-identity` 的负控覆盖，摘要子情形的反例在模型的观察里不可见）。
- L3 非阻断 4 与交付边界缺的证据：证据评论写明中间那次红；GS-02、GS-04 的变红记录、最终 head 上的本机语料、第 3、4 轮手工变异、命名账本、结构性改动清单、未覆盖项一起贴卡。闭包内两个超 alert 的函数在交付说明交代。
- 交付边界冲突项 1–8 交卡的拥有者（负责人），收尾汇报时列出。

## 第 4 轮复审（head `592d5b567`）

### 差分变异（general-purpose，sonnet，2026-11-05 10:48Z 交回）

命令 `pnpm run mutation --base f79aab4d4 --since 777abf7eb^`，6 个进程。skill 5/5 被杀；skill-contract 28 个里 21 被杀、6 存活、1 无覆盖，全在 `testing-resolution.ts` 新的无包 PR3 用例（:222 `clause`、:225 夹具名、:227 守卫与说明、:228、:233、:237 断言说明）。改动段里没有变异体的 7 段都是注释。

处置（本会话）：不判等价。`conformance.spec.ts` 补元测试——四个替身各带这个用例守的一种缺陷，各自只让它失败并核对失败说明的第一行；缺 `noPackage` 的夹具答不适用并点名句柄；解析套件的条款都在 PR1 到 PR7。7 处手工变异 H1–H7 全部变红（H3 按 Stryker 的做法加 `// @ts-nocheck` 才能构建，变红为 `TypeError` 被重新抛出）。提交 `1cacac78f`；记录 `tmp/closures/w3-skill-fix/r4-mut/`。

### 表达（design-reviewer，opus@xhigh，2026-11-05 11:00Z 交回）

阻断 0。第 3 轮 B1、N1–N5 全部闭合。非阻断 6 条，本会话全部改（`67373f3b1`）：

1. 契约差异表加一行：带依据的 `describe` 对无包材料交出依据所指的材料，与组页「描述」五处不同（波末写回组页时一起改）。
2. S7 的 TLA+ 结论在 verification README `:81` 与 skill SPEC `:152` 注明不含「带依据时引用不带内容摘要」子情形。
3. 契约 `unsupported` 一条写明 `read` 先做第 6 步路径校验；PR3 一条改为指向它。
4. 契约依据表补第 2 轮裁定 B1。
5. skill SPEC `:128` 标明 R3-2 变异的是契约的内存替身 `createMemoryResolution`；`:136` 补 R3 记录位置。
6. 模型 README `:30` 改为可复现的做法；本会话在 TLC v1.7.4 上复跑（删掉 `Misnames` 的 `\/ ~a.dig`，`ReadGate.cfg`，1976328 个不同状态，无违例），记录 `tmp/closures/w3-skill-fix/r4-tlc/`。

按「够了就收口」：核心保证已有证据守住，不再派第 5 轮。
