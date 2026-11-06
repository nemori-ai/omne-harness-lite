# w4-mcp-cordis 关口评审（C-SM-08，一次）

候选：PR #1158，head `f5ead35f4`，基线 `8446c4588`。简报：`mcp-cordis-r1-briefs.md`。证据评论：#1119 评论 6687353835。

## E 交付边界（general-purpose，Opus 5.5 high）

结论：产品物多数达到；未达到 5 项（都是证据或用例缺口，不是产品缺陷）；冲突项 5 条。

未达到：

- E1 「每条用例写一处让它变红的改动」：8 条用例没有记录在案的变红改动（「refuses a configuration that is not an object」、「fails to load with a configuration …」六条中的五条、Cordis 机制探针），契约成员「keeps the root entry free of runtime values」也没有；H19–H21 只有定义文件、没有运行输出；`run.mjs` 解析失败用例名的正则可能漏记（C1–C4 exit 1 但 failed 为空）。
- E2 `format:check`、`check:docs` 没有在 head `f5ead35f4` 上重跑（head 改了一个 JSON）。
- E3 计划 C5-4 的「句柄已释放」没有断言：撤除用例没有断言凭据句柄 `release()` 或进程句柄 `stop()`，旅程没有用到凭据。
- E4 验收第 7 条（写范围）卡上没有读数（E 面复核：50 个文件都在写范围内或是追加 1 放行的共享写合并）。
- E5 卡上把一条配置用例写成「`clientInfo` 内多余字段」，候选里没有这条；验收原文的「`clientInfo.name` 不是文本」有用例，卡上没写。

另：契约成员的 `scan` 早于 head（head 改了它的 `package.json`）；「27 条连跑三次」只有一次运行的原件；IC-2、IC-4 在契约成员的 `scan` 读数里没有条目，「无 deviation」只是字面成立，实际由单元用例承担。

冲突项：

1. 追加 1 第 1 项（`definePlugin`）与第 4 条原句「不引入 kernel-basis」。
2. 追加 1「合并与依赖段的变化不算越界」与写范围、排除项、授权、停止条件、验收第 7 条的原句。
3. 派发者认可探针断言 `AggregateError` 装着的错误，与闭包验收第 4 条、plan C5-4、波包决定 4「日志收到这个错误」。
4. 派发者认可落点缺席 H4 等价，与闭包第 5 条「`ProcessLanding.start` 答 `fail('unknown')`」、验收第 3 条、plan C5-3「依赖它的操作答 `unknown`」。
5. 简报写两项自查在「派发后、13:18 前」，卡与 plan 写「派发前」。

## C 设计与实践（general-purpose，Opus 5.5 high）

结论：非阻断。

- C-1 撤除函数丢掉 `closeAll` 的确认范围报告：契约把报告交给「持有本实例的宿主」，插件就是宿主；进程树没有确认停止（`root-only`、`unconfirmed`）时哪里都没有记录（DP-04、DP-07）。改法：仍是一步收口、不捕获，只是对未确认的条目写 `ctx.logger` 的警告。与决定 4「内容只有一步」的字面有出入，交派发者。
- C-2 `isPlainRecord` 不查原型，`fieldsIssue` 用 `Object.keys` 与 `in`：`Object.create(CONFIG)` 被接受。同 Skill C-F2。
- C-3 装载失败用例只断言 `rejects.toBeDefined()`：六行里五行即使 Schema 不生效也会因 `RangeError`、`TypeError` 失败。改为断言 Cordis 的 `ValidationError` 与消息。
- C-4 数值字段按 `BOUNDS` 的位置解构，次序改动会悄悄交换上界；类型错误消息不点名字段。
- C-5 `McpPluginParts`、`McpPluginConfig` 手抄了 `McpConfig`、`McpPorts`、`LocalTransportOptions` 的字段类型，`FIELDS` 是第二份清单。改为 `Pick`／`Omit` 推出，`FIELD_SET: Record<keyof McpPluginConfig, true>` 让字段清单与类型在编译期相连。
- C-6 定义成员用例只装载七个类中的两个。同 Skill C-F5。
- C-7 `firstLanded` 无上限轮询；采用换代用例用 `toContain` 而不是 `toEqual`。
- Testing Decisions：判据与接缝先写了；逐条反例只在 tmp 的变异记录里。建议把「缺陷 → 变红用例」表收进成员 `docs/cordis.md`「验证义务」或 SPEC 验证表。

## D 差分变异（派发者，head `f5ead35f4`）

命令：`VITEST_MAX_WORKERS=6 pnpm run mutation --base 8446c4588f0e2400f2e905179ec252473f7b1066`，退出 0。范围先 `--plan-only` 核对（`mcp-cordis-contract` 2 个文件、`mcp-host-local` 1 个文件）。日志 `w4-mcp-cordis` 工作树 `tmp/closures/w4-mcp-cordis/gate/mutation.log`（`78a1570c55db`），账本 `tmp/mutation-ledger/f5ead35f4/20261106-143718`（主检出）。

- `mcp-cordis-contract`：变异体 7，被杀 7，分数 100%。
- `mcp-host-local`：变异体 161，被杀 0，存活 161，分数 0%。

判定：测量无效，不是产品缺陷。差分变异只跑快层，`mcp-host-local/tests/cordis-entry.spec.ts` 整份标了 `@module-tag slow`，快层里没有任何用例执行插件。写者在副本上做的 H1–H26 手工变异是这一面现有的替代证据（E 面指出其中 8 条用例与 H19–H21 缺运行记录）。处置：修复轮把不起进程的用例（配置、加载、四个端口缺席、键）移到快层文件，起进程的留在慢层文件，然后在最终 head 上重跑本面。

## B 表达（design-reviewer expression，Opus 5.5 xhigh）

结论：阻断 1 簇，非阻断 7。

- B1（阻断）`mcp-host-local` 的现行正文与新增的 `./cordis` 字面矛盾或缺新入口：`SPEC.md:16`（`@omne-harness/mcp` 是 devDependency、只在 e2e 作调用方）、`:218`（真实组合只由 e2e 覆盖）、验证表缺装配用例；`README.md:9`／`README_ZH.md:9`「不起进程、不停进程、不取凭据」与 `:57`「stops the processes」（后者又与 MC-10、PL1「不声称进程已停」相反）；`docs/object-model.md:34`「没有继承层次」；`docs/architecture.md` 模块图、模块表、依赖、验证表缺 `cordis.ts`；`docs/object-model.md` 缺适配器、子类、撤除函数；`README.md:5`、`package.json` 的 `description`、状态表只写传输。同 Skill B1 的型。
- N1 缺席答复的规范句写在定义成员（性质 9「本成员只规定它」）与 `docs/flows.md`、`docs/cordis.md`。同 Skill N2。
- N2 「端口缺席时答 `unknown`」以全称写出，契约有反例（S1 排除任务操作与 `cancel`；S2 复用连接不问采用与资格；R6 落点缺席答 `landing-unavailable`）。同 Skill N1。
- N3 没有披露 `dispose()` 可能不返回：`mcp/SPEC.md:180` 已知限制「宿主应以自己的期限包住 `closeAll`」。
- N4 IC 映射没有反映 `scan` 的 `unknown`；定义成员页没有「未覆盖」。
- N5 `mcp-host-local` 的 IC 映射缺 IC-3、IC-6、IC-7。
- N6 换代时在途端口调用的归属没有落到拥有者；「下一次端口调用」与「下一次操作」两种说法。
- N7 小处：「五项可序列化的上界」（`clientInfo` 不是上界）；「关停的答复」未定义，改引 S8；`clientInfo` 多余字段的声明没有证据；`SPEC.md:11` 漏 IC-8；`index.md:15`、`src/README.md:3` 模板残句；`docs/cordis.md:75` 验证范围写宽。
- 范围外：撤除期限（决定 4 与 `mcp/SPEC.md:180`）；W4 MCP 规格 `spec.md:118`、`:131` 的全称句；插件行为的规范归属。

## 派发者裁定（14:50）

- **B1：扩大写范围，修复轮一并改。** 教训：给现有成员加入口时，写范围要覆盖该成员所有写到依赖、模块、类与进程职责的正文。Skill 闭包出过同型阻断，派发者只提醒了评审者，没有改写者的写范围，这是派发者的缺陷。
- **`mcp-host-local/SPEC.md` 并入修复轮的写范围。** 切片 01 的产品写者已交回，守护写者的范围不含它，此刻没有并发写者。01 改的是第 92、104、187、201、216、246 行一带，02 改第 3、16、19、218 行一带与新增一节，合入时的冲突由派发者解决。
- **插件行为的规范归属（N1、范围外第 3 条）：** `mcp-host-local/SPEC.md` 新增「Cordis 插件」一节，是插件行为（四个端口缺席时的答复、换代粒度、撤除、配置）的唯一规范正文，与 Skill 的 `skill-host-local/SPEC.md` 同形。`docs/cordis.md`、定义成员的性质 9、`docs/flows.md` 改为引用。
- **撤除期限（范围外第 1 条、N3）：不加。** 已要求的需求是撤除经 `closeAll` 收口；加期限要加配置字段并改决定 4，属于扩张。按 `mcp/SPEC.md` 已知限制在 SPEC 与 `docs/cordis.md` 披露：插件不设期限，`closeAll` 不答复时 `dispose()` 不返回，期限由卸载该 fiber 的宿主承担。
- **C-1：采纳。** 撤除函数仍是一步收口、不捕获；只是用上 `closeAll` 的返回值，对 `process` 为 `root-only` 或 `unconfirmed` 的条目写 `ctx.logger` 警告（DP-04、DP-07）。波包决定 4 的「内容只有一步」不变：这不增加收口步骤。加用例断言警告。
- **C-2～C-7：采纳**，与 Skill 的 C-F2、C-F5 一致。
- **E1～E5：** E1 由修复轮给出逐条用例的变红表与运行输出（含 H19–H21、八条缺记录的用例、契约成员根入口用例；机制探针写明它测的是 Cordis、变红证据是首跑）；E2 派发者已在 `f5ead35f4` 上补跑 `format:check`（`308ac2d60069`）与 `check:docs`（`17f4bf98026c`），都退出 0；E3 修复轮补「句柄已释放」的断言（用带凭据的端点，断言撤除后凭据句柄 `release()` 与进程句柄 `stop()` 被调用）；E4 写范围读数在关口结果评论补上；E5 卡上的配置用例描述在关口结果评论更正，修复轮补「`clientInfo` 内多余字段」的用例。
- **E 冲突项：** 第 1、2 项是追加 1 的裁定，成立。第 3 项：插件外部触发不了 `closeAll` 的 `AggregateError`，探针按 Cordis 4.0.4 的日志器行为断言装着的错误，裁定成立，plan C5-4 的字面以此为准。第 4 项：plan C5-3「依赖它的操作答 `unknown`」与 W4 MCP 规格第 118、131 行同为全称，派发者已更正规格（14:50），落点缺席的服务层答复是 `landing-unavailable`。第 5 项：两项自查在 13:18 派发之前完成，简报「派发后、13:18 前」措辞有误，以卡与 plan 为准。
- **D：** 修复轮把不起进程的用例移到快层文件；修复后在最终 head 重跑差分变异。
- 修复轮：等 A 面交回后一起派，新开写者（developer，Opus 5.5 high，同原档位）。

## A 正确性（implementation-reviewer，Opus 5.5 high；交回 14:57:25，原文 `mcp-cordis-r1-A.md`）

结论：无阻断，非阻断 3。

- 工具：`lint:deps` 退出 0（`722f79b5a9b2`）；`metrics --coverage --base 8446c4588…` 第一次退出 2（派发者的 Stryker 沙箱仍在，turbo 报重名），沙箱清掉后前台重跑退出 0（`17a98acbc17e`，14:53–14:55）。改动 37 个函数，超 alert 0，超 warn 1：`mcp-host-local/src/cordis.ts:109` `validate` 圈复杂度 11、覆盖 100%、CRAP 11。度量里 `skill-host-local` 覆盖阶段失败是本工作树没有构建 Skill 组成员（读日志的归因）。
- 探针（副本）：撤除函数把 `closeAll` 包成延迟 300 ms 再以 `AggregateError` 拒绝，原样插件 `dispose()` 等它结算，日志收到 `defect-1`、`defect-2`；把 `await` 换成 `void` 后两点都不成立，进程以未处理的拒绝退出 1。闭包规格要求「评审逐行核对」的插件一半由此有了工具输出。
- 逐项核对：四个适配器每次现取、缺席答复与端口类型一致；十二个转发方法都转发、返回原样；键只写在 `provide`；H4 等价成立。
- A-N1 `clientInfo` 内多余字段被拒没有用例，证据评论却写有（同 E5、B 的 N7）。
- A-N2 `validate` 超 warn 线，交回没有交代。
- A-N3 H19–H21 只有输入、没有运行结果文件。

## 派发者裁定（14:58，A 面）

- A-N1：追加 2 第 3 项已含这条用例；证据评论的更正写进关口结果评论。
- A-N2：追加 2 第 3 项的 C-4、C-5 改写后由写者重读圈复杂度；仍超 warn 时交回写处置（拆开或接受并给理由），派发者判。
- A-N3：追加 2 第 6 项重做全部变红验证并留运行输出，H19–H21 一并覆盖。
- 修复轮：新开写者（developer，Opus 5.5 high，同原档位），按追加 2。

## 修复轮交回（16:18:48，head `45658242e`，原文 `mcp-cordis-r1-fix-handback.md`）

九个提交，追加 2 第 1–11 项都闭合。快层 `cordis-entry.spec.ts` 41 条，慢层 `cordis-journey.spec.ts` 13 条（`vitest list` 核过层归属）。变红验证重做 81 次：每条用例至少被一个变异体打红；唯一存活 F05（落点缺席答 `facility-missing`，等价）。`metrics`：改动函数超 warn 0。两个成员 `scan` 结构 `pass`、没有 `deviation`。

## 派发者裁定（16:20，修复轮交回）

- **待定 1（C-1 的警告级别）：保持 `warn`。** 已核 Cordis 4.0.4：`error` 0、`info` 1、`warn` 2、`debug` 3，导出器没有阈值时取 1，所以 `warn` 默认不导出。按轴分：事件的严重度归发出它的插件，导出阈值归装配。为越过默认阈值改成 `info` 或 `error`，就是让阈值这条轴决定严重度这条轴。仓库先例：`model-host-local` 对「没有干净地关闭」一类用 `warn`。发布装配 `apps/harness-server/src/log-exporter.ts` 按 R2-D253 导出到第 2 级，所以真实装配看得到这条警告。写者在 SPEC 里写的「宿主要把级别开到 2」成立。
- **待定 2（`test` 脚本跑两层）：** 追加 2「快层文件在 `pnpm turbo run test`（快层）里执行」是派发者措辞错误。成员的 `test` 脚本本来就两层都跑，层由 `--mode` 区分，差分变异只跑 `--mode fast`。写者用 `vitest list` 核层归属，正确。
- **写者自定的采用换代断言：** 认可。契约 R3 规定合并时保留对端不再列出的动作并标为 `no-longer-offered`，所以派发者 C-7 写的 `toEqual(['other'])` 按契约不能成立；写者的断言同样排除了旧条目以「可用」残留。
- **写者自定的其余三件**（快层补「没有连接时」12 个方法与凭据、落点换代；拒绝消息逐字段点名；警告用例的导出器阈值）：认可。
- 接下来：派发者在 `45658242e` 上复跑四项门禁与差分变异（16:19 起，后台）；B 面窄复核只判 B1 与「插件行为只有一份规范正文」（16:20 派出）。

## D 面（修复后，派发者，head `45658242e`）

命令同前，16:20:40–16:21:57，退出 0，日志 `gate-r2/mutation.log`（`9f20c7253589`）。四项门禁复跑都退出 0（`gate-r2/summary.log`）。

- `mcp-cordis-contract`：7/7，100%。
- `mcp-host-local`：197 个，被杀 145，存活 47，无覆盖 5，73.6%。

派发者逐行分类：
- 组合层面等价（不补测）：四个适配器缺席分支改成「调用 undefined」或「答空串」——`mcp` 把端口违约与不合法的答复读成 `unknown`，服务一侧看不出差别（Skill 组同型）；`credentialsOf` 两个相同分支（`:208`，C 面预言）；`FIELD_SET` 的 `true`；`fieldsIssue` 的符号键判断（`:100`）；Schema 的 `vendor`（`:141`，没有消费者）。
- 只在慢层可测（不补测）：撤除函数与停止范围的警告（`:322–328`）、日志器名（`:320`）。慢层由修复轮的 S17–S21 证明。要让快层测到，就得给插件加注入传输的接缝，不是应然。
- 真缺口（追加 3 第 1–4 项补测）：配置 `null` 行与 `maxActions`、`instructionsByteLimit` 的类型行；插件名；`fetch` 与 `clock` 两个工厂参数确实被用上；凭据适配器的 HTTP 分支。

## B 面窄复核（16:26:48，原文 `mcp-cordis-r2-B.md`）

插件行为只有一份规范正文：闭合。B1 原列各处：全部闭合。另有两条阻断：`README.md:71`／`README_ZH.md:70`「配置只有 `LocalTransportOptions`」（上一轮漏列）；`SPEC.md:117`（H13）与 README「本包不写日志」（采纳 C-1 后不成立）。非阻断：插件入口在内容清单、维护条件、消费者、验证命令等几处没写到。

## 派发者裁定（16:28，D 面与 B 面窄复核）

- 同一类阻断第二次出现（成员级全称句被新入口证伪）。按 `review-code`「连续两轮同一类阻断」：不再逐句补洞，改为系统清查。追加 3 第 8 项要求写者列出成员正文里每一句以整个成员为主语的话，逐句判定范围，交回清查表；第 7 项改两条阻断。
- 教训（记进 W4 报告）：给现有成员加入口时，成员级全称句都要重新判定范围。派发者两次都只列了具体行，写范围与评审都跟着具体行走，所以同类问题反复出现。下次在闭包规格里直接要求系统清查。
- D 面真缺口与两条阻断由同一写者做（developer，Sonnet 5.5 high，16:28 派出）。合入前：派发者读 diff 与清查表；两条阻断用 grep 核对；在最终 head 上重跑差分变异。

## 追加 3 交回（16:45:01，head `014bf7af1`，原文 `mcp-cordis-r2-fix-handback.md`）

六个提交，第 1–8 项都闭合，`src/` 没有改。快层 51 条、慢层 14 条；新用例的变红验证 M01–M08 都是退出 1 且失败名非空（M08 `clock` 在慢层，靠手工变异）。清查表列了成员正文里每一句以整个成员为主语的话与判定。成员 `build typecheck test`、`test:slow`、`typecheck`、`lint:rules`、`lint:oxlint`、`format:check`、`check:docs` 都退出 0。

## 派发者核对与收尾（16:47）

- 两条阻断用 grep 核对已闭合：`SPEC.md:117`（H13）改为「根入口的传输不写日志……凭据值不进任何日志」；`README.md:71`、`README_ZH.md:70` 收窄到根入口并写明插件配置 `McpPluginConfig` 与撤除警告。全成员 grep「本包不写日志｜writes no log｜The only configuration｜配置只有」只剩已收窄的句子。
- 写者报的范围外一处（包根 `index.md` 三处）由派发者改，`8f0a7c54f`（`check:docs` 退出 0）。
- 最终 head `8f0a7c54f` 上复跑门禁与差分变异（16:46 起，`gate-r3/`）。
