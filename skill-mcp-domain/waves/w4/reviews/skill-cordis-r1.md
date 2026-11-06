# w4-skill-cordis 关口评审（C-SM-08，一次）

候选：PR #1157，head `835d4982e`，基线 F `60acfc28b`。简报：`skill-cordis-r1-briefs.md`。证据评论：#1119 评论 6685796575。

## E 交付边界（general-purpose，Opus 5.5 high；13:25 交回）

结论：验收清单 1–6、S4-1（C5 第 1–3 条的 Skill 部分）、「性质及证据义务」都达到；没有未达到项。冲突项 6 条，证据缺口 2 处。

冲突项与派发者处置：

1. 键常量（追加 1.1 对验收 2 原文）：派发者认定为规格缺陷并更正，依据 IC-2 与 W4 Skill 规格 Testing Decisions（「键常量等于类的 `provide`」）。卡的拥有者是本会话，裁定成立。
2. 端口缺席的答法：两份规格写「答 `Reply` 的 `unknown`」，对 `check`、`resolve` 不准确（它们的 `unknown` 是联合成员 `{ kind: 'unknown' }`）。实现按接口的实际返回类型逐方法给出，追加 1.5 认可。规格措辞的不准确只在任务 tmp，不进正式文档，不另改。
3. 写范围扩大（追加 1.2 加四份本成员文档）：派发者裁定，理由是写者点出的过时句子在本成员内，不改就留下与实现矛盾的正文。
4. `acceptance/` 占位：由派发者在合入时处理（待办，见下）。
5. `lint:deps` 的复核地点：追加 1.3 写「合入后的父分支」，实际在闭包工作树补构建三个别组成员后在候选 head 上复跑（`gate/lint-deps.log`，`cec163306998`，退出 0）。在候选 head 上复跑比合入后更早拦住问题，结论相同；合入后父分支的波末准入还会再跑一次。
6. 卡正文 C5 仍是 W3 版字句：不成立。卡正文第 99 行已是 2026-11-06 写回的改写版（含「MCP 在本地传输与脚本化对端进程上走刷新 → 调用」「W4 报告卡评论」）。过时的是 W4 `plan.md` §3 的改写草稿（写「脚本化传输」「W4 交接报告」），已在该节加注以卡正文为准。

证据缺口与处置：

- 卡评论称 `skill-cordis-contract` 有 6 处变红改动，原件 `mutations-constants.log` 只记了 K1–K3 三处；「键字面值改名、根入口加导入、根入口加运行导出」三处只在写者第一次交回里有结论，没有日志。处置：不改旧评论；D 面差分变异覆盖 `skill-cordis-contract/src/cordis.ts`，关口结果评论里写明更正，以工具读数代替这三处。
- 变红日志没有哈希：`mutations.log` `a80044596e50`，`mutations-constants.log` `55577153f02c`（E 面实测），写进关口结果评论。

合入时派发者待办：

- `skill-cordis-contract/acceptance/README.md` 第 5、23 行的模板占位。

## A 正确性（implementation-reviewer，Opus 5.5 high；13:28 交回）

结论：没有阻断。逐行核对：两个适配器每次从装载时的 `ctx` 现取，缺席答复与 `skill-contract/src/ports.ts` 的类型逐方法一致；三个子类七个方法原样转发；插件三个服务共一条 fiber；键只写在 `static provide`。`lint:deps` 退出 0；`metrics --coverage --base 60acfc28b` 退出 0，改动的 22 个函数没有超过 warn 10，`HostSkillAccess.list`、`export` 覆盖率 0，`validate` 0.75。手工变异（副本 `/tmp/w4rev-A/`）：正对照 2 条变红，N1–N7 存活。

非阻断：

- A1 `adopted` 路径的「不缓存」没有会变红的用例（N1 存活）：换代用例只调用 `describe`。
- A2 `list`、`export` 没有用例（N2、N3 存活，覆盖率 0）。
- A3 `search` 只在端口缺席时调用（N4 把 `search` 转给 `summaries` 存活）。
- A4 配置「接受空对象」没有用例（N5 存活）；`[]` 被接受也没有用例拦（N6）。
- A5 用例 `tests/cordis-entry.spec.ts:112` 在类型位置重写键名字面量。

范围外与未覆盖：IC-3 写「抽象 Service `implements` 根入口里的操作类型」，`PackageInspection`、`SkillReadCheck`、`SkillResolution` 只在 `./provider`（W4 Skill 规格已定，转 B 面判映射措辞）。IC-6 isolate 没有用例（N7 `ctx.root.get` 存活），`docs/cordis.md` 的映射与「未覆盖」没有 IC-6 一行（转 B 面）。

## C 设计与实践（general-purpose，Opus 5.5 high；13:27 交回）

结论：非阻断。

- C-F1 空配置 Schema 是第三份手抄，插件没有经 `definePlugin`（IC-14 写明函数插件经 kernel-basis 的 `definePlugin`）；`docs/cordis.md:56` 的 IC-14 行写符合，先例 `execution-environment-host-local` 在同一情形登记了偏离。
- C-F2 `validate` 不查原型（`new Date()`、`Map` 被接受）；用例只核对 `{ extra: true }` 被拒，断言 `rejects.toBeDefined()` 对任何原因都成立。
- C-F3 `list`、`export`、`search` 的转发没有被区分（同 A2、A3）；SPEC 写「列出、导出答 `unknown`」没有证据；根因在 W4 Skill 规格 Testing Decisions 没有为「子类把每个方法都转过去」写反例。
- C-F4 同 A5。
- C-F5 定义成员自己的用例只装载五个类中的两个，三个服务类的构造写错键不会在本成员变红。

## 派发者裁定（13:30）

- C-F1 采用改法 (a)：不登记偏离，按 IC-14 改。reduce 共享写 `9a1089645`（父分支，已推送）给 `skill-host-local` 与 `mcp-host-local` 的依赖段加 `@omne-harness/kernel-basis`，锁文件随之更新；构建与 `lint:deps`（85 个成员、352 条成员边，退出 0）在 `tmp/closures/w4-shared/`。插件改为 `definePlugin`，`Config` 的类型用 `StandardSchema<object>`，删去本地的 Schema 类型。改法 (b)（kernel-basis 导出共用的空配置 Schema）归 kernel-basis 的拥有者，本波不做，不阻断。MCP 02 同时追加（`w4-mcp-cordis.md` 追加 1）。
- C-F2 与 A4 合并修：判据改为纯记录检查（原型是 `Object.prototype` 或 `null`）；表格用例直接断言 `validate` 的精确答复，接受 `undefined`、`null`、`{}`，拒绝 `{ extra: true }`、`[]`、`'x'`、`0`、`new Date()`；保留真实装载 `{ extra: true }` 失败一条，并加 `{}` 装载成功一条。
- C-F3 与 A1、A2、A3 合并修：旅程补 `list`、带 `basis` 的 `export`、命中与不命中的 `search`；两条缺席用例补 `list`、`export` 答 `unknown`；加一条 `skillResolution` 换代后 `summaries` 用新提供者的用例。SPEC「Cordis 插件的验证」表补一行「子类把每个方法转给对应的服务」。
- C-F4、A5：类型位置改用 `typeof <键常量>`。
- C-F5：定义成员用例改成五个类的表格用例。
- IC-3 与 IC-6 的映射措辞：等 B 面。
- 修复轮：一轮，B 面交回后与 B 的阻断一起派，Sonnet 5.5 high（同原写者档位）。修复后复审只核阻断；本轮 A、C 没有阻断，所以修复后由派发者按每条改法的用例与 D 面差分变异核对，不再派 A、C。

## B 表达（design-reviewer expression，Opus 5.5 xhigh；13:32 交回）

结论：阻断 1，非阻断 9。

- B1（阻断）`skill-host-local` 的现行正文与本次改动矛盾且没有推迟登记：`docs/architecture.md:14`（只依赖契约与 `operation-result`）、`:31`（没有类）、`:7-12` 模块表；`docs/object-model.md:3`（没有类）；`README.md`/`README_ZH.md` 第 9、91 行；`SPEC.md:3` 与依据表；`package.json` 的 `description`。成因在写范围，归派发者。
- N1 「依赖端口的操作都答 `unknown`」以全称断言，有反例（`skill/SPEC.md:94-98`：空能力集合直接答空列表、先过滤再调 `check`）。
- N2 缺席答法在两份 SPEC 与 `docs/cordis.md` 各写一遍规范语气。
- N3 `skill-host-local` 的 IC 映射缺 IC-3、IC-6、IC-7、IC-8；「未覆盖」缺 IC-6 与两条「未执行」。
- N4 IC 映射证据栏没有反映 `scan` 的 `unknown` 读数（人工核对后主张成立）。
- N5 `skill-cordis-contract/SPEC.md` 的五个接口行为出处指错锚点。
- N6 README 示例用字符串键 `ctx.get('skillAccess')`。
- N7 换代粒度「调用」与「操作」两种说法。
- N8 共一条 fiber 的理由与波包决定 3 不同源。
- N9 残句、归因与同页漂移（`skill-cordis-contract/docs/cordis.md:64`、`SPEC.md:3`、`index.md:15`、`SPEC.md:59`、`:11`；`skill-host-local/docs/cordis.md:66`、`:14` 与 `:56`）。
- 范围外：W4 Skill 规格 `spec.md:98` 的失败语义行同样以全称断言。

## 派发者裁定（13:33，续）

- B1：扩大写范围，修复轮一并改（追加 2 第 7 条）。不登记推迟：这些句子在本次改动之后才变假，留到切片 02 会让成员正文在合入时自相矛盾。
- N1、N3–N9：修复轮照改（追加 2 第 8、10–16 条）。
- N2：缺席时的答复由 `skill-host-local` 的 `SPEC.md` 拥有。依据：W4 Skill 规格跨域五问第 4 条把「缺席不放行」定给插件的适配器，定义成员没有行为。`skill-cordis-contract` 性质 8 改为引用（追加 2 第 9 条）。
- `null` 是否被接受（B 转 A）：接受。插件树的行可能写成 `null` 表示无配置，先例同样接受；判据与文档统一为「缺席、`null` 或没有字段的普通对象」（追加 2 第 2、16 条）。
- `spec.md:98` 由派发者更正（已改，带更正标注）。
- 修复轮：13:33 新开写者（developer，Sonnet 5.5 high），规格追加 2 汇总全部十六项。修复后复审只核阻断：B1 由派发者对照第 7 条逐文件核对，再派一次窄范围的表达复审（只看 B1 与 N1、N2 的改动）。

并发说明：修复轮派出时 MCP 01 产品写者在跑最后的门禁、MCP 02 写者在实施，同时有三个写者，超过方案的上限 2。MCP 01 已在收尾，修复轮以文档为主，接受这次短时超出。

## 修复轮交回（13:49 前后，head `af00fe8aa`）

追加 2 的十六项都已做完。提交 `e0d2be00c`（代码与用例）、`f603fb44c`、`af00fe8aa`（文档）。写者门禁全部退出 0，日志带 `-r2`；变红验证 R1–R15 在 `logs/mutations-r2.log`（`0c4d777f4fa7`）。派发者核对：`git diff --name-only 9817e28d9..af00fe8aa` 共 17 个文件，都在追加 2 的写范围内；`package.json` 只改 `description`；B1 的五处原句已不在（`grep` 无输出），`docs/architecture.md`、`docs/object-model.md` 写到 `./cordis` 的三个子类与依赖。写者自定：类型化调用方现在写 `ctx.plugin(skillPlugin, {})`（`definePlugin<object>` 的重载要求配置），README 与 `docs/cordis.md` 已写明。认可。

## D 差分变异（派发者，head `af00fe8aa`）

命令：`VITEST_MAX_WORKERS=6 pnpm run mutation --base 60acfc28b640a1535585df1ebccd22bdc87e4d7c`，退出 0。范围先 `--plan-only` 核对：`skill-cordis-contract` 2 个文件、`skill-host-local` 1 个文件（只有两个 `src/cordis.ts` 与根入口）。日志 `w4-skill-cordis` 工作树 `tmp/closures/w4-skill-cordis/gate/mutation.log`（`4d3549796676`），账本 `tmp/mutation-ledger/af00fe8aa/20261106-135001`（主检出）。

- `skill-cordis-contract`：变异体 5，被杀 5，存活 0，分数 100%。`src/index.ts:1`（`export {}`）没有变异体。
- `skill-host-local`：变异体 72，被杀 61，存活 11，无覆盖 0，分数 84.7%。

存活逐个判定：

- `src/cordis.ts:95`、`:106`、`:111` 的 9 个（缺席分支的条件改为 `false`、答复改为 `{}` 或空字符串）：组合后等价。变异后适配器在缺席时抛出或交回畸形答复，`skill` 的 `answered` 把 reject、同步抛出与解析不收都当作没有作答，答 `unknown`（`packages/skills/skill/SPEC.md` 第 55–57 行，契约「端口答复的统一处置」）。适配器只有 `skill` 一个消费者，所以组合答复不变。能否让它可判定：只有把适配器单独导出给用例才能直接观察它的答复，这会为测试增加公开面，不做。适配器按端口类型答 `unknown` 仍是实现的义务（它是端口实现），由评审 A 逐行核对过。
- `:27` `typeof value !== 'object'` → `false`：等价。其后的原型检查对原始值同样拒绝（原始值的原型是 `String.prototype` 等）。可以删去这一条件使变异消失；不在关口之后为一处冗余条件改代码，记为可选简化。
- `:37` `vendor` 字符串、`:123` 插件 `name` 字符串（static）：不在任何契约里，用例不观察它们。IC-16 按包名与 `./cordis` 导出名标识插件，不按 `name`。

结论：没有缺陷类的存活。
