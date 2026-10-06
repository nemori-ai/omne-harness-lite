# 规范实例：走通的路径与每个失败值的反例

属于 `capability.asset-registry` v4 的规范工件。本契约**不附 Schema**，所以这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前七节各走通一条路径，第八节给每个失败值一个反例。

v4 的原完整 fill 来源场景见第 10 节；继承场景里的 reload/refresh 同样须先符合 [S-51](contract.md#s-51-原完整填表来源与本次表头的关联)，不能由 fixture 暗供原根。

**两条读法上的边界：**

- **标识串只是占位**：`ev_1`、`ast_k` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）；能力标识写成「类别:名字」只为好读，规范串归 `data.asset-model/v3#S-3`。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。
- **两个必填判别式照写**：`refreshAvailability` 的 `run`（`start{运行}`／`continue{运行, 报告}`，运行标识写成 `R1`、`R2`……），`lookup`／`list` 的 `within`（`session`／`run{报告}`）（[S-19](contract.md#s-19-缺席时的默认答案)）。
- **`refreshAvailability` 另带必填的 `attempt`**（这一次尝试的 `AttemptId`：运行里的第几次，从 1 起的整数（`data.call-accounts/v2#S-37`），写成 `1`、`2`……；[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ①，M46）：下文不逐次写出的，一律是调用所在那一次尝试自己的尝试标识；每份报告都带着会话、运行与它。

- **每次 `fill`、`reload` 均显式提供 `compositionOrder`**：O1 是第 1 节真实求值 `composition` 的完整排列，含 `trace` 在 `guard` 前；O2 是第 2 节本次求值的完整排列。未具体展开序列的继承场景也必须由 fixture 显式给出，不表示运行时可以补默认值。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `s1` | 一个会话；创建时捕获的租户身份是 `(C, A)`——A 在团队组织 `C` 里的租户身份；挂了工作区 `W` |
| `Tools`、`Ask` | official 的两扇 meta 门（tool 类），求值给出 `resident = true` |
| `grep` | 组织 `C` 的工具，非常驻，依赖声明里有一项外部服务 `search-api` |
| `review` | 租户 `(C, A)` 的技能，依赖 `grep` |
| `/fmt`、`/audit`、`/deploy` | 三条斜杠命令：`/fmt` ① 型（prompt）、`/audit` ② 型（展开技能 `review`）、`/deploy` ③ 型（command，指向服务 `deploy-svc`） |
| `/secret` | 一条 ① 型命令，A **没有**「谁可以用」的权限 |
| `trace`、`guard` | 两件拓展件，装配清单里次序 `trace` 在前 |
| `gh` | 一个 MCP 接入点 |
| `kit` | 一个 plugin，成员是 `review` 与 `/fmt` |

## 1. 创建时填六张

装配以真实输入为 `s1` 求值并给定引用 `ev_1`；成功结果、显式排列与六表构成由 `fill` 在同一次清单追加中落下，调用前不先另记求值。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `fill(s1, evaluation: EffectiveAssembly, ev_1, compositionOrder: O1)` | 恰六份快照，`filledBy = assembly`，`basedOn = ev_1`，六份的 `filledAt` 由同一次提交给出 | [S-5](contract.md#s-5-八类里登记六张表)、[S-22](contract.md#s-22-fill装配时填六张) |
| 2 | 观察 `tool` 表 | `Tools`、`Ask`（`resident = true`）、`grep`（`resident = false`）；**没有** `gh` 的动作条目——它们等第一次尝试才钉 | [S-7](contract.md#s-7-注册表条目)、[S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住) |
| 3 | 观察 `slash_command` 表 | `/fmt`、`/audit`、`/deploy`；**没有 `/secret`** | [S-20](contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) |
| 4 | 观察 `loop_extension` 表 | `trace`、`guard`，**次序与装配清单相同** | [S-6](contract.md#s-6-注册表快照)、`data.loop-extension/v3#S-10` |
| 5 | 观察 `plugin` 表与成员 | `plugin` 表里是 `kit`；`review` 在 `skill` 表、`/fmt` 在 `slash_command` 表——**成员各进各类** | [S-5](contract.md#s-5-八类里登记六张表) |
| 6 | 观察 `connector`、`agent_definition` | 没有这两张表；`list(s1, connector, within: session)` ⇒ `categoryNotRegistered` | [S-5](contract.md#s-5-八类里登记六张表) |
| 7 | 观察装配清单 | 这一次恰一条构成记录，列出每条条目的能力标识、资产记录、被选用的版本、来源格、常驻与次序；**没有可用性** | [S-18](contract.md#s-18-快照不持久装配清单是唯一权威) |
| 8 | `lookup(s1, slash_command, "/secret", within: session)` 与 `lookup(s1, slash_command, "/nosuch", within: session)` | 两者都是「没有」，**逐字相同** | [S-14](contract.md#s-14-会话斜杠命令集是-slash_command-那张表的视图) |
| 9 | 同一个 `ev_1` 再 `fill` 一次（回执丢了的重试） | 原样返回那六份，`filledAt` 不变，**装配清单不多一条** | [S-22](contract.md#s-22-fill装配时填六张) ⑦ ② |
| 10 | 接第 2 节第 2 步之后（`plugin`、`skill`、`slash_command` 已由 reload 换过），再拿 **`ev_1`** `fill` 一次 | **`invalidInput{evaluationSuperseded}`**：`ev_1` 那条记录已落下、六张却已不全是它填出的；表不换、装配清单不多一条——**不当作一次新装配**，会话不退回第 1 节的样子 | [S-22](contract.md#s-22-fill装配时填六张) ⑦ ③；D-060 §八 M34 |

## 2. reload-plugin 连带

接第 1 节。组织 `C` 在 `kit` 里加了技能 `lint`、删掉了 `/fmt`；另给租户 `(C, A)` 直接持有了一个新工具 `fetch`。会话里没人发 reload。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `list(s1, skill, within: session)`、`list(s1, slash_command, within: session)`、`list(s1, tool, within: session)` | **都还是第 1 节的样子**：没有 `lint`、`/fmt` 还在、没有 `fetch` | [S-15](contract.md#s-15-快照只在这几个时刻换) |
| 2 | 人敲 `omne-official:reload-plugin` → `reload(s1, plugin, compositionOrder: O2)` | 求一次此刻的值、建好三张表，再把「这次求值 ＋ 三张表的构成」作为**一条** reload 记录追加进装配清单，得 `ev_2`；返回 `plugin`、`skill`、`slash_command` 三份快照，`filledBy = reload{omne-official:reload-plugin}`，`basedOn = ev_2`，**一次成立** | [S-23](contract.md#s-23-reload按类别重填) |
| 3 | 观察 | `skill` 表有 `lint`；`slash_command` 表**没有 `/fmt`**；`plugin` 表里 `kit` 是新的那份 | [S-23](contract.md#s-23-reload按类别重填) 连带：旧新两份 plugin 的成员所属类别 |
| 4 | 观察 `tool` 表 | **没换**（`filledAt` 不变）：`fetch` 不是 `kit` 的成员，要等 `omne-official:reload-tool` | [S-23](contract.md#s-23-reload按类别重填) |
| 5 | 在第 2 步的提交之前任意时刻读 | 三张表都是旧的；**没有「`kit` 是新的、成员表还是旧的」那一刻** | [S-17](contract.md#s-17-换表同一会话串行多表一次成败同一) |
| 6 | 人再敲一次 `omne-official:reload-plugin` | 又是三份新快照（新的 `filledAt`），条目与第 2 步相同——**不去重** | [S-23](contract.md#s-23-reload按类别重填) ⑦ |
| 7 | 换一种时序：第 2 步的 reload 发生在运行 `R1` 的尝试 1 进行中（尝试 1 的报告在 reload 之前算出）；尝试 1 里 `lookup(s1, skill, "lint", within: run{尝试 1 的报告})`、`list(s1, slash_command, within: run{尝试 1 的报告})` | `lint` 是「**没有**」；`/fmt` **还在**——尝试 1 只在它报告所依的那几份快照里找，reload 换上的快照对它不可见；同一时刻 `within: session` 的读已是新的 | [S-25](contract.md#s-25-lookup查一条) ④、[S-11](contract.md#s-11-一次执行尝试的可用性报告) 第 1 条；D-060 §八 M35 |
| 8 | 接第 7 步；`R1` 的尝试 2 → `refreshAvailability(s1, run: continue{R1, 尝试 1 的报告}, attempt: 2)`，再同样读 | 报告依的是 reload 之后的快照：`lint` 查得到（带这份报告里的可用性），`/fmt` 是「没有」——**同一运行的下一次尝试起看得见** | 同上；[S-34](contract.md#s-34-进行中的运行与撤销) |

## 3. MCP 接入点连不上：动作不可用，同名替换件顶上

接第 1 节。第一次尝试开始时 `gh` 连得上，列出三个动作；第二次尝试开始前对端下线。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | 尝试一开始（运行 `R1` 的第一次尝试，`attempt = 1`）→ `refreshAvailability(s1, run: start{R1}, attempt: 1)` | 报告带 `s1`、`R1` 与 `1`；第一次求值给出 `gh` 此刻生效的那份持有，记进报告的 `endpointHoldings`；报告里 `gh` 那一行 `available`；`tool` 表另有三条 `gh` 的动作条目，`available`、`resident = false`，名字由桥起（定义名如 `gh:create_issue`，模型面名字 `gh__create_issue`）；第二次求值带上这份动作集，报告的 `effectivePermissions` 对三条各有一项 `execute:<对端动作名>`，**另对 `Tools`、`Ask`、`grep` 各有一项**——**每一项以条目的模型面名字为键**（`gh__create_issue`、`grep`……）；`grep` 那一项是它能力标识的 `execute`，与动作的几项取自同一次（第二次）求值，每项带 `tenantAutoWritable`；**`Tools`、`Ask` 是 meta 门，那两项恒为 `{auto}`、`tenantAutoWritable` 为假，不读求值**（本例假定 [G-7](contract.md#十已知缺口) 已给出它们是门） | [S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住) 第一行、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ④、[S-11](contract.md#s-11-一次执行尝试的可用性报告)；D-060 §七 M8、M21 |
| 2 | 尝试一进行中，对端新增第四个动作；组织把其中一个动作的执行权限改成 `forbid` | 这一次尝试里**仍是三条**、那一项权限**仍是尝试一开始时的值**；`list(s1, tool, within: run{尝试一的报告})` 不变；`list(s1, tool, within: session)` **不含**任何 `gh` 的动作条目 | [S-11](contract.md#s-11-一次执行尝试的可用性报告) 第 1 条、[S-25](contract.md#s-25-lookup查一条) ④ |
| 3 | 对端下线；同一运行的尝试二开始 → `refreshAvailability(s1, run: continue{R1, 尝试一的报告})` | `gh` 那一行 `unavailable{reason}`，原因原样取桥给的失败值 `endpointUnreachable`；**动作条目仍在**——按最近一次取到的那份清单（尝试一开始时取到的三个）投影，每条 **`stand_in{for}`**，名字与参数形状和那份清单一样，说明换成「现在用不了、连不上」 | [S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住) 第二行、[S-10](contract.md#s-10-替换件同形只换说明) |
| 4 | agent 在尝试二里调其中一个动作 | 落「不可用」收场（`data.content-blocks/v2#S-17`）——**由工具执行运行时兑现**，本契约只给出「这是替换件」 | [S-10](contract.md#s-10-替换件同形只换说明) |
| 5 | 对端恢复；尝试三开始 | 那几条回到 `available`，**没人发 reload**；动作集按这一次取到的清单；被改成 `forbid` 的那一项在这一次的 `effectivePermissions` 里是新值 | [S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) |
| 6 | 另一个接入点 `db` 从来没连上过 | 报告里 `db` 那一行 `unavailable{reason}`，原因写「从未取得动作清单」；**没有任何 `db` 的动作条目** | [S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住) 第三行 |
| 7 | 观察三次尝试之间的快照与装配清单 | **`tool`、`mcp` 两张快照一次都没换**；装配清单里没有动作条目、接入点持有或逐动作权限 | [S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住)、[S-18](contract.md#s-18-快照不持久装配清单是唯一权威) 第 3 条 |
| 8 | 尝试四开始时第二次求值不可用 | 报告照常交出，`effectivePermissions` 里 `gh` 的动作条目与 `grep` 那几项都是 `unavailable`——**不是作者默认，也不是任何一档**；**`Tools`、`Ask` 两项仍是 `{auto}`**（meta 门不读求值，D-060 §七 M21）；放行判断的调用方在这一轮要取的项里拿到 `unavailable` 即同批全拒（只调 `Tools`、`Ask` 的一轮照常判、自动放行） | [S-11](contract.md#s-11-一次执行尝试的可用性报告)、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ⑧ |
| 9 | 尝试二进行中，组织把 `grep` 的执行权限配成 `forbid`（不锁）；尝试三开始 | 尝试二里 `grep` 那项**仍是尝试二开始时的值**；尝试三的报告里 `grep` 那项是 `{forbid}`（`from = organization`）、`tenantAutoWritable` 为假——**与 MCP 动作同一个口径：按尝试钉、下一次尝试生效**，没人发 reload | [S-11](contract.md#s-11-一次执行尝试的可用性报告) 第 1 条、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ④ 第 5 步；D-060 §六 L13 |
| 10 | 尝试四结束后，组织在组织层禁用 `grep`，**没人发 reload**（`tool` 快照照旧有它）；尝试五开始 | 尝试五的报告里 `grep` 那项是显式值 **`not_in_composition`**——**不是 `unavailable`**，也不是装配那一次的值或任何一档；`Tools`、`Ask` 与 `gh` 的动作条目照常有值。放行判断的调用方把它交成 `effectivePermission = not_in_composition`：调 `grep` 的那一项单独判 `deny{not_held}`，**同批别的调用照常判**；只有求值本身失败（第 8 行）才整批全拒 | [S-11](contract.md#s-11-一次执行尝试的可用性报告) `effectivePermissions`；`capability.tool-admission/v2` 的 S-8 末条；D-060 §六 L15 |
| 11 | 尝试五开始前，租户移除了 `gh` 的持有（没有生效的持有）；尝试五里模型调 `gh__create_issue`，同一批还调了一个从没存在过的 `gh__delete_repo` | 尝试五的报告里 `gh` 那一行 `unavailable{reason}`、**没有 `gh` 的动作条目**，`effectivePermissions` 里**没有**以 `gh__create_issue`、`gh__delete_repo` 为键的项——**不是 `not_in_composition`**（那只指条目仍在快照、能力标识不在组合里）；`lookup(s1, tool, gh__create_issue, within: run{尝试五的报告})` 得「没有」，与 `gh__delete_repo` 同一个回答。这两个调用不进放行判断、同批别的调用照常判，执行运行时收场 `unavailable{no_such_entry}` | [S-11](contract.md#s-11-一次执行尝试的可用性报告)、[S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住) 末行、[S-25](contract.md#s-25-lookup查一条) ⑤；D-060 §七 M10 |

## 4. 命令型服务报错之后，命令不可见

接第 1 节。`deploy-svc` 下线。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | 人敲 `/deploy` | `lookup` 找到它；③ 型派发执行，**明说失败**，那次失败记进会话日志 | [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变) |
| 2 | 派发方 → `markFailed(s1, slash_command:/deploy)` | 新的 `slash_command` 快照，`filledBy = auto_refresh_after_failure`，`basedOn` 沿用；**返回之前**就换好 | [S-27](contract.md#s-27-markfailed命令型服务报错之后去掉那一条) |
| 3 | 人再敲 `/deploy` | 「没有」——与 `/nosuch` 逐字相同；不送进会话 | [S-14](contract.md#s-14-会话斜杠命令集是-slash_command-那张表的视图) |
| 4 | 同一时段组织加了一条 ① 型 `/new` | **没有因为第 2 步进来**：`markFailed` 只去不加 | [S-27](contract.md#s-27-markfailed命令型服务报错之后去掉那一条) ④ |
| 5 | 派发方重试 `markFailed(s1, slash_command:/deploy)` | 原样返回当前那份，**装配清单不多一条** | [S-27](contract.md#s-27-markfailed命令型服务报错之后去掉那一条) ⑦ |
| 6 | 服务恢复；人敲 `omne-official:reload-slash_command` | `/deploy` 回来，`/new` 也进来 | [S-23](contract.md#s-23-reload按类别重填) |

## 5. 依赖缺失：替换件，而不是不装

接第 1 节。

| 步 | 局面 | `refreshAvailability(s1, run: start{Rn})` 的报告里（每一步是一次新运行 `Rn` 的第一次尝试） | 依据 |
|---|---|---|---|
| 1 | `search-api` 在场、自报可用 | `grep` `available`；`review` `available` | [S-8](contract.md#s-8-当下可用性的三个取值) |
| 2 | `search-api` 不在场 | `grep` `stand_in{for}`，原因「缺 `search-api`」；`review` 也是 `stand_in{for}`，原因「缺 `tool:grep`（此刻是替换件）」——**先工具后技能** | [S-8](contract.md#s-8-当下可用性的三个取值) 第 2 条 |
| 3 | `search-api` 的自报**读不到** | 同第 2 步，但 `grep` 的原因写「`search-api` 读不到」，**与「缺」分得开** | [S-8](contract.md#s-8-当下可用性的三个取值) 第 3 条 |
| 4 | 第 2、3 步期间 | `tool`、`skill` 两张表的条目集合与次序**不变**，`Skills()` 搜得到 `review` 并说明缺什么；快照 `filledAt` 不变 | [S-8](contract.md#s-8-当下可用性的三个取值) 第 6 条 |
| 5 | 拓展件 `guard` 的 `needs` 缺一项 | `guard` `unavailable{reason}`（视作卸载，没有替换件）；`trace` 照旧 | `data.loop-extension/v3#S-9` |
| 6 | 恢复 `search-api`，下一次尝试开始 | `grep`、`review` 都回到 `available`，**无人干预** | [S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) |

## 6. 按命令的可用性

会话 `s1` 此刻有效的运行模式是 `never`。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `refreshAvailability(s1, run: start{R1})` | `Ask` 条目 `available`；它的 `commandAvailability` **列全 `Ask` 的每一个命令**，`request_approval` 为 `unavailable{reason}`（原因：运行模式 `never`），其余 `available` | [S-9](contract.md#s-9-按命令的可用性) 第 1、3 条 |
| 2 | 同上，`grep`（单函数工具） | 没有 `commandAvailability` | [S-9](contract.md#s-9-按命令的可用性) 第 2 条 |
| 3 | 有效运行模式此刻读不到 | `request_approval` 为 `unavailable{reason}`，原因「读不到」；`Ask` 这扇门照旧 `available`；**报告照常返回** | [S-9](contract.md#s-9-按命令的可用性) 第 3 条、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ⑧ |
| 4 | 观察 `Ask` 与 `Tools` 的槽位 | 各占一个，多命令不拆 | [S-7](contract.md#s-7-注册表条目) |

## 7. 权限收回：此刻起不存在，再授予要等 reload

接第 1 节。A 对 `/fmt` 的「谁可以用」在会话进行中被收回；资产治理发出 `AssignmentChanged`。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | 通知到达之前（据点副本已读到新值）`lookup(s1, slash_command, "/fmt", within: session)` | 「没有」——**读时现读就挡住了** | [S-20](contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 3 条 |
| 2 | 通知到达 → `onAssetChange(s1, AssignmentChanged)` | 新的 `slash_command` 快照去掉 `/fmt`，`filledBy = asset_change`；**`skill` 表不归它收窄**；其余四张不动 | [S-28](contract.md#s-28-onassetchange权限收回之后收窄) |
| 3 | 同一条通知再到一次 | 什么都不换 | [S-28](contract.md#s-28-onassetchange权限收回之后收窄) ⑦ |
| 4 | 同一时段组织新加了一条 ① 型 `/new` | **没有因为第 2 步进来** | [S-28](contract.md#s-28-onassetchange权限收回之后收窄) ④ |
| 5 | 权限重新授予 | 仍是「没有」，直到人发 `omne-official:reload-slash_command` | [S-20](contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 4 条 |
| 6 | A 对技能 `review` 的权限被收回，人敲 `/audit` | 展开时 `lookup(s1, skill, "review", within: session)` 现读为「没有」，展开不了（失败值归 `data.slash-command`） | [S-20](contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 3 条 |
| 7 | 运行 `R` 以 `refreshAvailability(s1, run: start{R})` 开始时 `review` 用得了；`R` 进行中 A 对 `review` 的权限被收回，`onAssetChange` 到达 | `skill` 快照**不换**；`R` 的尝试二 `refreshAvailability(s1, run: continue{R, R 尝试一的报告})` 仍不把 `review` 算作用不了；`R` 里 `list(s1, skill, within: run{…})` **仍有 `review`**——已开始的运行照样用得上它 | [S-20](contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 3 条、[S-11](contract.md#s-11-一次执行尝试的可用性报告) 第 4 条（R2-13） |
| 8 | 接第 7 步；下一次运行 `R'` → `refreshAvailability(s1, run: start{R'})` | 报告把 `review` 记为用不了；`R'` 里 `list(s1, skill, within: run{R' 的报告})` **没有 `review`**，快照里它还在 | 同上：收窄从下一次运行起 |

## 8. 每个失败值的反例

| 失败值 | 调用 | 为什么是它而不是别的 | 依据 |
|---|---|---|---|
| `invalidInput` | `list(s1, "widgets", within: session)` | 类别不在八类之内——表示层就不成立，先于任何判定 | [S-19](contract.md#s-19-缺席时的默认答案) |
| `invalidInput` | `lookup(s1, slash_command, within: session)`（缺名字） | 身份参数没有默认值 | [S-19](contract.md#s-19-缺席时的默认答案) |
| `invalidInput` | `refreshAvailability(s1)`（缺 `run`） | 必填的判别式没有默认值——**不补成一次新运行**，补了就会让已开始的运行中途被收窄 | [S-19](contract.md#s-19-缺席时的默认答案)、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ⑥ |
| `invalidInput` | `refreshAvailability(s1, run: continue{R2, R1 的报告})` | 报告的运行标识与这次运行不符——上一次运行的门控不得带进新运行 | [S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ②⑥ |
| `invalidInput` | `fill(s1, …, ev_x)`，`ev_x` 是别的会话的求值 | 那次求值不是为这个会话做的 | [S-22](contract.md#s-22-fill装配时填六张) ② |
| `invalidInput{evaluationSuperseded}` | 第 1 节第 10 步：reload 之后拿 `ev_1` 再 `fill` | 那次求值已被此后的换表取代——**不是**回执丢了的重试（那是原样返回），**也不是**一次新装配 | [S-22](contract.md#s-22-fill装配时填六张) ⑦ ③ |
| `invalidInput` | `refreshAvailability(s1, run: start{R1})`（缺 `attempt`） | 身份参数没有默认值——不从「上一次尝试」或进程上下文补 | [S-19](contract.md#s-19-缺席时的默认答案)、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ①⑥ |
| `invalidInput` | `markFailed(s1, slash_command:/fmt)`（① 型）或 `markFailed(s1, slash_command:omne-official:reload-tool)` | 只收 ③ 型，且不收 reload 一族 | [S-27](contract.md#s-27-markfailed命令型服务报错之后去掉那一条) |
| `categoryNotRegistered` | `reload(s1, agent_definition)` | 八类之一，但不建表 | [S-5](contract.md#s-5-八类里登记六张表) |
| `sessionNotFound` | `list(s9, tool, within: session)`，装配清单里没有 `s9` 的装配记录 | 从没为它成功填过表；「会话不存在」与「没装配成功」同一个值 | [S-21](contract.md#s-21-这一节每个操作写全九件事) 总表 |
| `dependencyUnresolved{missing}` | 组织把 `kit` 的成员改成引用一个谁都没有的技能 `ghost`，人发 `omne-official:reload-plugin` | 求值的 `unresolved` 非空；`missing` 列出 `ghost` 与引用它的 `kit`；**三张表都不换**。**不是**依赖声明不满足——那是第 5 节的替换件 | [S-23](contract.md#s-23-reload按类别重填) ⑥ |
| `dependencyUnresolved{missing}` | 定义直接引用技能 `review`（只有租户那一份、没有 official）；A 对它的「谁可以用」被收回之后人发 `omne-official:reload-tool` | 此刻的求值里 `review` 无人可用、没有下一层，进 `unresolved`；**哪一类的 reload 都收这个值**，交付面看得见；装配为下一次运行重新装配时同样失败，收口归装配 | [S-20](contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 末段、[S-23](contract.md#s-23-reload按类别重填) ⑥ |
| `toolNameConflict` | 桥给 `gh` 的某个动作起的名字恰好等于 `grep` → `refreshAvailability(s1, run: start{R1})` | `tool` 表在 agent 面前两条同名；**不静默丢一条** | [S-7](contract.md#s-7-注册表条目)、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) |
| `compositionCycle{cycle}` | **故障注入**：让 `reload(s1, skill)` 那一次此刻的求值以 `compositionCycle` 失败 | 求值判出的结论，原样转交（诊断原样）；**不是** `unavailable`（重试不会变）、也不是 `dependencyUnresolved`；表不换。本版装配成功的会话里到不了，只能注入（[S-44](contract.md#s-44-依赖未解析与同名冲突) ③） | [S-21](contract.md#s-21-这一节每个操作写全九件事) 总表、[S-23](contract.md#s-23-reload按类别重填) ⑥ |
| `categoryUnsupported{category}` | **故障注入**：让 `refreshAvailability(s1, run: start{R1})` 的第一次求值以 `categoryUnsupported{plugin}` 失败 | 同上：原样转交、不交报告；**不是** `unavailable` | [S-21](contract.md#s-21-这一节每个操作写全九件事) 总表、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ⑥⑧ |
| `unavailable` | 「谁可以用」的读面不可用时 `lookup(s1, slash_command, "/fmt", within: session)` | 判不出来——**不是**「没有」 | [S-25](contract.md#s-25-lookup查一条) ⑧ |
| `unavailable` | 第一次求值拿不到（含「谁可以用」的读面不可用）时 `refreshAvailability(s1, run: start{R1})` | 钉不下一份判不出来的技能门控，也没有接入点持有可用——**不是**一份把技能都算作用得了（或都用不了）的报告，**也不拿装配那一次的持有去连** | [S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ⑧ |
| `unavailable` | 工作区 `W` 的承载目录此刻读不到时 `reload(s1, skill)` | 不当作「工作区是空的」；表不换 | [S-23](contract.md#s-23-reload按类别重填) ⑧ |
| `unavailable` | 装配清单追加失败时 `fill(s1, …, ev_1)` | 一张表都没有；装配清单里也没有这一次 | [S-17](contract.md#s-17-换表同一会话串行多表一次成败同一) 第 4 条 |
| `unavailable` | 重启期间 `W` 里 `review` 的内容改了；重启后 `list(s1, skill, within: session)` | 记下的那一版正文无法原样取回——**不是新内容，也不是空表**；直到 `omne-official:reload-skill` | [S-33](contract.md#s-33-本能力重启与重建) 第 3 条 |


## 9. 显式排列与单次追加

以下能力标识用类别加名字作便于阅读的占位；完整词法沿 `data.asset-model` v3。

| 输入或操作 | 必须观察到 | 依据 |
|---|---|---|
| `evaluation.composition` 为 `{tool:t, loop_extension:b, loop_extension:a}`，排列 `[loop_extension:b, tool:t, loop_extension:a]` | 两张非空表为 `[t]` 与 `[b,a]`；调整求值集合编码顺序不改变结果顺序；四张空表仍一起提交 | [S-48](contract.md#s-48-构成顺序与求值记录)、[S-49](contract.md#s-49-顺序缺陷在提交前拒绝) |
| 对该排列分别制造缺席、漏项、重复、额外成员或组合根 | `invalidInput`，零追加，当前表与清单头不变；全排列错误不能靠补项或自动排序修正 | 同上 |
| 空组合，显式 `compositionOrder: []` | 六空表可成立，清单仍保存完整求值及显式空序列；缺席序列则失败 | 同上 |
| `reload(tool)` 显式 `[loop_extension:a, tool:u, loop_extension:b, tool:t]` | 新 tool 表 `[u,t]`，旧 loop_extension 表 `[b,a]` 连同原时刻和引用保持不变；仅一次 mint 追加 | [S-50](contract.md#s-50-求值记录重载与收窄) |
| 读回上述 mint 记录与 tool 快照 | `content` 恰含 `evaluation`、`compositionOrder`、`filledBy`；`basedOn` 从壳的 `evaluationRef` 投影，`filledAt` 从 `tables.tool.filledAt` 投影；无预填引用与原始求值输入副本 | 同上 |
| slash_command 表 `[x,y,z]`，失败去除 y，另跑权限收回 y | 分别得到 `[x,z]`；reuse 记录保留原完整求值、完整排列与原引用，仅 filledBy 和实际表构成体现本次收窄 | 同上 |
| 初始求值 E1；另一类 reload 提交 E2 后，再收窄仍依 E1 的 slash_command 表 | 旧表 `basedOn`、reuse 引用、记录内求值与排列仍是 E1；`readHistory`／该记录引用追溯 E1。全会话的 `readEvaluation` 在固定清单头上界内读取最近已提交 given／mint，返回 E2；不随 reuse 回退，也不声称 E2 是当前层值的实时求值 | 同上 |
| 根 A/1 已真实求值并 fill；当前持有改选 B，或 A 的版本 2，固定 root.source 仍 A/1；合法 reload／refreshAvailability | 真实 evaluate 因 C16 拒绝内部输入为 invalidInput；操作外部返回 unavailable。旧表、清单及原报告不改，不交新报告，不回填旧持有或暗改来源／声明；start、continue 分别验收 | [S-16](contract.md#s-16-会话资产注册表不求值只消费求值结果)、[S-23](contract.md#s-23-reload按类别重填)、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算)、[S-50](contract.md#s-50-求值记录重载与收窄) |
| 同时根漂移，但调用者缺 compositionOrder／attempt 或带错运行报告 | 仍先收调用者 invalidInput，不泛化为 unavailable；根一致时 compositionCycle／categoryUnsupported 照旧原样转交 | 同上 |
| 在提交边界注入追加失败，然后重启重读 | 不出现仅有求值却没有六类构成的半份 fill；已确认提交的记录按同一结果、顺序、壳引用恢复 | 同上；S-18、S-33 |

这些是规范要求。真实提供者演练状态见版本外验证入口，不由示例存在推出通过。

## 10. v4 原完整 fill 的公开认回与固定 H

本节是 [S-51](contract.md#s-51-原完整填表来源与本次表头的关联)／[S-52](contract.md#s-52-来源认回的规范场景与证据边界) 的规范实例，**不是运行记录**。实例须先真实读取已发布 A/v1 正文、真实 evaluate、fill 成功；只有最后给出的预期不构成实现证据。E0/O0 可取空 composition/显式空排列，六张表仍须全部存在；非空组合另跑一支验证完整类别筛选次序与版本。

| 步 | 动作与公共读取 | 预期 |
|---|---|---|
| 1 | fill E0/O0 为 given F0，seq1 | 六表与 E0/O0/assembly 同记录；根在 E0.assets 的唯一项指向 A/v1 |
| 2 | 依次 reload 六类，每次真实当前输入与显式 O，plugin 无成员；至 seq7 | 六类 latest 全为 mint；已有原 F0 仍不可变，但不再出现在 readHead.latest |
| 3 | 重开 registry 与 manifest，readHead(s1)→H=7；readGiven(s1,7)→完整 F0 | 核同会话/ref/上界、assembly、六表、精确 E/O 构成与唯一根后取得 A/v1；此前私有内存/创建源不是输入 |
| 4 | 从实际 A/v1 不可变正文得到受限 fixed-root 输入，reload(tool,O) | 当前角色/持有与 fixed A/v1 同实际输入，实际 evaluate；合法时按 expectedHead7 一次 mint 提交，不能单独先存来源 |
| 5 | 真实重新完整 fill A/v2 为 F1，再六类 reload、重开 | 最新 H 的 readGiven 返回 F1，固定正文为 A/v2；用创建 A/v1 属负控。同 asset/version 值的再次完整 fill 也须认新 given |

**实际 head 后并发追加的两条路径**（每条从独立、真实已填表数据库开始）：

| 路径 | 交错与预期 |
|---|---|
| refresh 的旧观察仍有效 | R 在真实 readHead 固定 H/六表；W 在 H+1 完整 fill（同固定根）或 reload；R 此后 readGiven(s1,H)，真读固定正文与当前输入并求值，根仍相容；R 成功交报告，session/runId/attempt 与 H 时各表 filledAt/basedOn 对应，lookup/list 保留旧表，新条目不出现。没有末尾再核头或自动重做 |
| refresh 的当前根真实失配 | 同上但 W 的完整 fill 改固定根为 A/v2，R 的 fixed-root 仍 A/v1，当前持有真为 A/v2；实际 evaluate 以 C16 拒绝 ⇒ R unavailable、不交报告，不改旧根“修好” |
| reload 的旧观察不能提交 | R 在 H 取表/F0并求值；W 完整 fill H+1；R 用 expectedHead=H ⇒ headMismatch且零新记录。若按原采用策略重做，重取 H+1 的表/given/输入/E/O；公开 O 仍显式且须匹配新 composition，不能只改 expectedHead |
| 混拼负控 | R 以 H 表配 readGiven(s1,H+1)，或以 H given 配第二次 readHead 的新表；不得成功报告/换表。报告以同 H 各表及原 given 为依据，与“返回时必须最新”是两回事 |

**失败反例**：有装配表但 readGiven 返回 none；最新 given 非 assembly；六表少/多类别；表 composition 与完整 E/O 不符；根项缺失/重复；错会话/引用；seq超H；壳或投影损坏；必要读做不到。每支均 unavailable、零后续 fixed-root 调用/求值/追加/报告，不回退旧好源。相反 H=0 可确认无装配仍 sessionNotFound；缺 attempt/坏 O 等原参数错误仍在来源 IO 前 invalidInput。MF 所接收的合法 JSON 不一定满足 AR 的 full fill。

**三种来源并存**：完整 given F0/E0 后 tool reload 得 E2，再收窄旧 slash_command 表为 reuse F0。公共 readEvaluation 得 E2，按旧表 filledAt 的 readHistory 给 E0，readGiven(s1,H) 给原完整 F0；三者各守原用途。取 A/v1 来源不能从 E0.values 合成正文；读到真实固定正文仍不证明当前资格或 C16 成立。shared/workspace/MCP 尚无真实来源的支路依旧 unavailable。
