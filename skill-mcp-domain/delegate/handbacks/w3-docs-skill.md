# 交回 w3-docs-skill

## 结论

做完。Skill 组页、组内流程、组入口与领域页已写成现行契约与成员 SPEC 的样子。契约「与组页的差异」表已退出，只留三条组页没有写的条款。三份 SPEC 的组设计钉已移到写回后的组页提交。四项门禁在最终提交上退出 0。

## 提交

- 组页提交 `773d9f04c`：组页、组内流程、组入口、两份领域页。
- 钉提交 `8106fed27`：契约差异表、三份组设计钉、资产成员钉。组设计钉指向 `773d9f04c`，契约 l.13 的资产成员钉指向 `3289bee2f`。

作者与提交者都是 `PanQiWei <594557445@qq.com>`（工作树 git 配置里的 user.name 是 `panqiwei`，两次提交用 `-c` 改成规格给的身份）。trailer 是 `Harness: claude-code`、`Agent-Role: developer`，没有 Co-Authored-By。`lint:rules` 退出 0，署名检查通过。

## 改了哪些文件

`3289bee2f..HEAD` 只含以下八个文件，全在写范围内：

- `packages/skills/docs/architecture.md`
- `packages/skills/docs/key-flows.md`
- `packages/skills/README.md`
- `docs/domains/skills/architecture.md`
- `docs/domains/skills/key-flows.md`
- `packages/skills/skill-contract/SPEC.md`
- `packages/skills/skill/SPEC.md`
- `packages/skills/skill-host-local/SPEC.md`

GS-07 的处置不要求改 `skill/index.md`、`skill/tests/index.md`、`skill/documentation.json`：`skill/index.md` 已经指向 `verification/`（性质账本与 `ReadGate.tla`），分类表写明成员侧导航已由 skill-fix 规格第 6 条完成。这三个文件没动。

## 验收 1：逐条位置

位置按小节名给出。「组页」是 `packages/skills/docs/architecture.md`，「流程页」是 `packages/skills/docs/key-flows.md`。每条依据的条款写在括号里（「契约」是 `skill-contract/SPEC.md`，「skill SPEC」是 `skill/SPEC.md`）。

| 编号 | 状态 | 改后的位置 | 依据 |
| --- | --- | --- | --- |
| GS-01（合并 SC-L81） | 已改 | 组页「检查与发现」目录段；「应用服务」表 `SkillCatalog` 行；「检查与发现」决定表第 3 行；「失败种类」`unknown` 行。流程页 F-SK02 的图与说明 1、2、4 | 契约「目录的匹配规则」；skill SPEC「目录」 |
| SC-L82（合并 GS-02） | 已改 | 组页「端口」映射表：新增 `open` 的 `entry-unreadable` 一行；`snapshot` 的 `entry-unreadable` 行保留。`list` 不调用 `open`，按契约写 | 契约「需求端口」映射补充 |
| GS-02（合并 SC-L84） | 已改 | 组页「端口」映射表 `snapshot` 的 `entry-not-found`/`bytes-mismatch` 行（`inspect` 也答 `source-unavailable`）；「检查与发现」第 3 类；「失败种类」`version-changed` 与 `source-unavailable` 两行。流程页组内检查图与说明 4、组内读取说明 | 契约「需求端口」映射补充；skill SPEC「映射」 |
| GS-03 | 已改 | 组页「读取」第 5 步：函数名 `materialOf` 与指向成员「阶段」的链接已删，只留规则 | skill SPEC「依据所指的材料」 |
| GS-04（合并 SC-L85） | 已改 | 组页「读取」第 11 步：没有合法头部定界时，`read` 的正文答 `source-unavailable`，写明只在资产摘要不来自检查通过的包时可达 | 契约「读取的形状规则」；skill SPEC「正文与范围」 |
| GS-05（C 类，候选 A） | 已改 | 组页「读取」`signal` 段加活性前提；「失败种类」`aborted` 行加一句。流程页组内读取说明加同一句 | 契约「读取的形状规则」；skill SPEC「所有权、失败与生命周期」 |
| GS-06（合并 SC-L83） | 已改 | 组页「端口」「各端口的要求」新增一条；「读取」第 3 步加引用一致的一句。流程页组内读取图加一支 | 契约「端口答复的统一处置」（引用身份一致） |
| GS-07 | 已改 | 组页「验证」末段：指向性质账本、`ReadGate.tla`、探索器，写明有限范围、前提 P0、PC3/PR5、真实组合未验证、攻击与资源与耐久未核实 | skill SPEC「性质与证据」 |
| GS-09 | 已改（总括） | 见各 SC 行；契约差异表已按行处置 | — |
| W-1 | 已改 | 组页「读取」开头（第 1 步之前的一句）：范围非法时 `read` 在任何端口之前抛 `TypeError`。没有编成第 12 步，避免「读取的 11 步」的外部引用错位。流程页组内读取图后加一句 | 契约「读取的形状规则」；skill SPEC「正文与范围」 |
| SC-L86 | 已改 | 组页「读取」第 5 步；「失败种类」`unsupported` 行；SK-D02 行；「剩余义务」`SkillRef` 行；「验证」第 10 项；「资产正文与 Skill 包」第 164 行附近与决定表末行。流程页组内读取说明 7、组内导出图（删掉 `unsupported` 分支）与说明 2 | 契约「读取的形状规则」`unsupported` 一条；「需求端口」 |
| SC-L87 | 已改 | 组页「读取」第 4 步与 `describe` 段；SK-D01 行；`SkillRef` 与 `SkillMaterialBasis` 两行。流程页组内读取末段。领域页见下 | 同 SC-L86 |
| SC-L88 | 已改 | 组页「包格式规则」：新增兼容策略一段，`SKILL.md` 文本行、name 与身份行、拒绝次序行改写；「检查与发现」第 2 类；「验证」第 9 项；`SkillName` 行、`SkillDefinition` 行；Q-SK05 方言行。流程页组内检查说明 2 | 契约「`SKILL.md`」「兼容提示」「方言与支持范围」 |
| SC-L89 | 已改 | 组页「模型」`SkillManifest` 行：上限 16384，指向契约「值与守卫」，注明官方规格写 1024 | 契约「值与守卫」 |
| TP-pins-S | 已改 | `skill-host-local/SPEC.md` l.11、`skill/SPEC.md` l.12、`skill-contract/SPEC.md` l.11 改为 `773d9f04c`；`skill-contract/SPEC.md` l.13 改为 `3289bee2f` | 分类表 TP-pins-S |
| W-2 | 已改 | 组页状态句（第 3 行）；「完整行为候选的正式承接缺口」前言与第一行状态。Cordis 两行没动（D 类，归 W4-4） | `skill/README.md`、`skill/src/index.ts` |
| W-3 | 已改 | `packages/skills/README.md`：状态句、成员表 `@omne-harness/skill` 行、「组合验证」段。`docs/domains/skills/architecture.md`：状态句。`docs/domains/skills/key-flows.md`：状态句、l.9（name 与目录名）、第 72 行（缺 digest） | 同上各条 |

合并写法：先写兼容策略一句，再改各处（SC-L88 与 SC-L89）；读取第 5 步一次改写（GS-03、SC-L86）；映射一个改动、多处同步（GS-02、SC-L82）。

## 验收 2：旧说法已不在目标页

提交后在工作树根运行的命令与输出：

```text
grep -c materialOf packages/skills/docs/architecture.md                  -> 0
grep -n "任一身份" packages/skills/docs/architecture.md                   -> （无输出）
grep -c "整个条目是正文" packages/skills/docs/architecture.md             -> 0
grep -c "一律" packages/skills/docs/key-flows.md docs/domains/skills/key-flows.md -> 0 与 0
grep -n "1 到 1024" packages/skills/docs/architecture.md                  -> （无输出）
grep -n "带不带Skill 材料依据都一样" 组页与流程页                          -> （无输出）
grep -n "对集合中的每个身份\|每个身份先经" 组页与流程页                    -> （无输出）
grep -c "没有选定的机制" 组页                                             -> 0
grep -c "目前没有核实行为" packages/skills/README.md                      -> 0
grep -rn "没有实现\|只有接口" 组页、流程页、领域页                        -> 只剩组页第 583 行「Cordis 插件部分还没有实现」（Cordis 行保留）
```

组页第 254 行的「一律」是 `DirectorySource` 的 `realpath` 处理，与旧说法无关。流程页组内检查图里 `version-changed` 只剩读控制文件的 `open` 一支。

## 验收 3：门禁

在工作树根运行，最终提交 `8106fed27`，日志在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-docs-skill-logs/`：

| 命令 | 退出码 | 输出尾部 | 日志时间（UTC） | 日志哈希（sha256 前 12 位） |
| --- | --- | --- | --- | --- |
| `pnpm run check:docs` | 0 | `PASS: 2751 Markdown files; local links and skill mirrors.` | 2026-11-06T10:11:01Z | 0845dfbbaddb |
| `pnpm run check:design` | 0 | `PASS: 354 个词条、69 条对象条目、10 项待裁、17 个当前 PD，对账一致。` | 2026-11-06T10:10:48Z | ce280b84d2e4 |
| `pnpm run format:check` | 0 | `All matched files use the correct format.` | 2026-11-06T10:10:20Z | 0fa355854abc |
| `pnpm run lint:rules` | 0 | `PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6198 个提交的署名，无违反。` | 2026-11-06T10:10:52Z | 857e957fbef1 |

第一个提交之后另跑过三项（`check:docs`、`check:design`、`format:check`），也是退出 0，日志文件名带 `.pre`。

## 验收 4：改动范围

`git diff --name-only 3289bee2f..HEAD` 的输出就是上面「改了哪些文件」的八个文件，全部在写范围内。

## 验收 5：钉

钉指向 `773d9f04c`（组页提交）。资产成员钉指向 `3289bee2f`。`773d9f04c` 先于 `8106fed27`。改钉时复核了三份 SPEC「采用的范围」格，里面点名的小节（「端口」映射表、「检查与发现」「读取」「失败种类」、模型、包格式规则、验证）在新组页里都还在。

## 没写回而保留在差异表的行与原因

契约差异表（现称「组页没有写的条款」，锚点 `#group-differences` 不变，因为其他页链到它）留下三条：

1. 控制字节与快照不对应时 `parseSkillPackage` 答 `version-changed`。
2. 只做检查的值公开守卫 `isX`，`toPackagePath` 仍规范化并答 `Outcome`。
3. `./testing` 的套件是无框架的用例列表。

原因：组页没有写这三项，也不与它们冲突，成员 SPEC 是唯一源（分类表 SC-L63–L80 的 D 类结论）。其余行都已写回，已删除。分类表称「四行」，SPEC 里 `isX` 与 `toPackagePath` 在同一行，所以是三行。

## 我自己做的决定（能自己定，依据是……）

1. **同一说法的其余出处一并改了**，依据是分类表「同一处被几条来源点到」的合并写法，以及规格「行号只作指引、按文字定位」。组页：`SkillName` 行（目录名一致）、`SkillDefinition` 行（兼容提示）、`SkillRef` 与 `SkillMaterialBasis` 行（带依据时的摘要）、「应用服务」`SkillCatalog` 行与决定表（GS-01）、「失败种类」`unknown` 行、Q-SK05 方言行（四种软偏离）、「资产正文与 Skill 包」第 164 行与决定表。清单列的行号里没有这些，但它们是同一条规则的陈述，不改就会与要求 grep 为空的旧说法矛盾。
2. **`docs/domains/skills/architecture.md` 的第 43 行**（`SkillAccess` 行里缺 digest 的 `describe`）也改了：它是 SC-L87 的同一句，W-3 的处置写「与 SC-L86、SC-L87 同步」。分类表只点了该页第 3 行。
3. **`docs/domains/skills/key-flows.md`**：分类表在写范围里写「状态句」，但 W-3 条目点名了 l.9 与 l.72，我按条目改了。
4. **`skill/SPEC.md` 第 32 行**：原句「这一处取代组页第 5 步……见契约与组页的差异」写回后不再成立，改成「组页第 5 步写同一规则」。规格第 4 条只授权改钉，这是为避免留下假说法的最小改动。
5. **`skill-contract/SPEC.md` 的「目录的匹配规则」第一段**：删掉「这一点与组页不同，见与组页的差异」，改成与组页同一规则的写法。同理。
6. **`skill-contract/SPEC.md` 的「本页封闭的组页未定项」表**：「组页位置」列是 `21175c9f9` 版组页的行号，组页提交后行号已变。我在表前加了一句「行号指组页在 `21175c9f9` 的版本」，没有改行号。
7. **GS-03 的链接**：组页第 5 步删了指向成员「阶段」的链接与 `materialOf`，但保留了指向 skill SPEC「依据所指的材料」的链接（它指向规则，不是函数名）。如果要连这条链接也删，是一处单行改动。
8. **契约差异表改名**为「组页没有写的条款」，因为它不再是差异。`范围与依据` 表里「评审之后的裁定见[与组页的差异]」的那句同步改了。

## 清理候选与没覆盖到的项

- `docs/domains/skills/architecture.md` 第 31 行（`SkillReadCheck` 行写「摘要与检索对每个身份也先问它」）：与 GS-01 同源，严格说不算错（对留下的身份仍然先问），没有改。
- 组页第 65 行与 `packages/skills/README.md` 入口表（第 22–25 行）的入口清单没有列 `isSealedSnapshot`、`MANIFEST_PATH` 等常量、`skillCatalogConformance`，契约的入口表已列。这是公开面清单，不在分类表条目里，没有改。
- 组页「剩余义务与拥有者」表的「摘要与检索（P1）」「导出（P1）」两行仍写「第一波之后」，`SkillCatalog` 已实现，状态不再「待做」。W-2 只点名状态句与第一行状态，没有改。
- 没有运行 `ste-lint`，没有跑测试、admission 与差分变异（按规格不跑，本闭包不改行为）。asd-ste100 按中文规则手工遵守：新增句子拆短、不用分号；周围旧句的「；」没有重写。
- GS-05 与 GS-04 的写回是卡拥有者在 skill-fix 规格里选定的候选 A 与「答 `source-unavailable`」，负责人复核时可收回。组页相应句子在「读取」`signal` 段与第 11 步。
- 没有改 `packages/mcp/`、`docs/domains/mcp/`、`src/`、`tests/`、组页 Cordis 两行。

## 待定项分类

没有「只有负责人能定」的新项。以上第 7 条是能自己定的措辞选择，依据是 GS-03 处置里「删函数名与成员链接，只留规则」读作删指向阶段小节的链接。
