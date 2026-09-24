# 规范实例：走通的路径与每个失败值的反例

属于 `capability.asset-registry` v1 的规范工件。本契约**不附 Schema**，所以这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前七节各走通一条路径，第八节给每个失败值一个反例。

**两条读法上的边界：**

- **标识串只是占位**：`ev_1`、`ast_k` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）；能力标识写成「类别:名字」只为好读，规范串归 `data.asset-model/v1#S-3`。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。
- **两个必填判别式照写**：`refreshAvailability` 的 `run`（`start{运行}`／`continue{运行, 报告}`，运行标识写成 `R1`、`R2`……），`lookup`／`list` 的 `within`（`session`／`run{报告}`）（[S-19](contract.md#s-19-缺席时的默认答案)）。

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

装配为 `s1` 求值，结果记进装配清单，得 `ev_1`。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `fill(s1, EffectiveAssembly, ev_1)` | 恰六份快照，`filledBy = assembly`，`basedOn = ev_1`，六份的 `filledAt` 由同一次提交给出 | [S-5](contract.md#s-5-八类里登记六张表)、[S-22](contract.md#s-22-fill装配时填六张) |
| 2 | 观察 `tool` 表 | `Tools`、`Ask`（`resident = true`）、`grep`（`resident = false`）；**没有** `gh` 的动作条目——它们等第一次尝试才钉 | [S-7](contract.md#s-7-注册表条目)、[S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住) |
| 3 | 观察 `slash_command` 表 | `/fmt`、`/audit`、`/deploy`；**没有 `/secret`** | [S-20](contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) |
| 4 | 观察 `loop_extension` 表 | `trace`、`guard`，**次序与装配清单相同** | [S-6](contract.md#s-6-注册表快照)、`data.loop-extension/v1#S-10` |
| 5 | 观察 `plugin` 表与成员 | `plugin` 表里是 `kit`；`review` 在 `skill` 表、`/fmt` 在 `slash_command` 表——**成员各进各类** | [S-5](contract.md#s-5-八类里登记六张表) |
| 6 | 观察 `connector`、`agent_definition` | 没有这两张表；`list(s1, connector, within: session)` ⇒ `categoryNotRegistered` | [S-5](contract.md#s-5-八类里登记六张表) |
| 7 | 观察装配清单 | 这一次恰一条构成记录，列出每条条目的能力标识、资产记录、被选用的版本、来源格、常驻与次序；**没有可用性** | [S-18](contract.md#s-18-快照不持久装配清单是唯一权威) |
| 8 | `lookup(s1, slash_command, "/secret", within: session)` 与 `lookup(s1, slash_command, "/nosuch", within: session)` | 两者都是「没有」，**逐字相同** | [S-14](contract.md#s-14-会话斜杠命令集是-slash_command-那张表的视图) |
| 9 | 同一个 `ev_1` 再 `fill` 一次（回执丢了的重试） | 原样返回那六份，`filledAt` 不变，**装配清单不多一条** | [S-22](contract.md#s-22-fill装配时填六张) ⑦ |

## 2. reload-plugin 连带

接第 1 节。组织 `C` 在 `kit` 里加了技能 `lint`、删掉了 `/fmt`；另给租户 `(C, A)` 直接持有了一个新工具 `fetch`。会话里没人发 reload。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `list(s1, skill, within: session)`、`list(s1, slash_command, within: session)`、`list(s1, tool, within: session)` | **都还是第 1 节的样子**：没有 `lint`、`/fmt` 还在、没有 `fetch` | [S-15](contract.md#s-15-快照只在这几个时刻换) |
| 2 | 人敲 `omne-official:reload-plugin` → `reload(s1, plugin)` | 求一次此刻的值、建好三张表，再把「这次求值 ＋ 三张表的构成」作为**一条** reload 记录追加进装配清单，得 `ev_2`；返回 `plugin`、`skill`、`slash_command` 三份快照，`filledBy = reload{omne-official:reload-plugin}`，`basedOn = ev_2`，**一次成立** | [S-23](contract.md#s-23-reload按类别重填) |
| 3 | 观察 | `skill` 表有 `lint`；`slash_command` 表**没有 `/fmt`**；`plugin` 表里 `kit` 是新的那份 | [S-23](contract.md#s-23-reload按类别重填) 连带：旧新两份 plugin 的成员所属类别 |
| 4 | 观察 `tool` 表 | **没换**（`filledAt` 不变）：`fetch` 不是 `kit` 的成员，要等 `omne-official:reload-tool` | [S-23](contract.md#s-23-reload按类别重填) |
| 5 | 在第 2 步的提交之前任意时刻读 | 三张表都是旧的；**没有「`kit` 是新的、成员表还是旧的」那一刻** | [S-17](contract.md#s-17-换表同一会话串行多表一次成败同一) |
| 6 | 人再敲一次 `omne-official:reload-plugin` | 又是三份新快照（新的 `filledAt`），条目与第 2 步相同——**不去重** | [S-23](contract.md#s-23-reload按类别重填) ⑦ |

## 3. MCP 接入点连不上：动作不可用，同名替换件顶上

接第 1 节。第一次尝试开始时 `gh` 连得上，列出三个动作；第二次尝试开始前对端下线。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | 尝试一开始（运行 `R1` 的第一次尝试）→ `refreshAvailability(s1, run: start{R1})` | 第一次求值给出 `gh` 此刻生效的那份持有，记进报告的 `endpointHoldings`；报告里 `gh` 那一行 `available`；`tool` 表另有三条 `gh` 的动作条目，`available`、`resident = false`，名字由桥起；第二次求值带上这份动作集，报告的 `effectivePermissions` 对三条各有一项 `execute:<对端动作名>` | [S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住) 第一行、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ④ |
| 2 | 尝试一进行中，对端新增第四个动作；组织把其中一个动作的执行权限改成 `forbid` | 这一次尝试里**仍是三条**、那一项权限**仍是尝试一开始时的值**；`list(s1, tool, within: run{尝试一的报告})` 不变；`list(s1, tool, within: session)` **不含**任何 `gh` 的动作条目 | [S-11](contract.md#s-11-一次执行尝试的可用性报告) 第 1 条、[S-25](contract.md#s-25-lookup查一条) ④ |
| 3 | 对端下线；同一运行的尝试二开始 → `refreshAvailability(s1, run: continue{R1, 尝试一的报告})` | `gh` 那一行 `unavailable{reason}`，原因原样取桥给的失败值 `endpointUnreachable`；**动作条目仍在**——按最近一次取到的那份清单（尝试一开始时取到的三个）投影，每条 **`stand_in{for}`**，名字与参数形状和那份清单一样，说明换成「现在用不了、连不上」 | [S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住) 第二行、[S-10](contract.md#s-10-替换件同形只换说明) |
| 4 | agent 在尝试二里调其中一个动作 | 落「不可用」收场（`data.content-blocks/v1#S-17`）——**由工具执行运行时兑现**，本契约只给出「这是替换件」 | [S-10](contract.md#s-10-替换件同形只换说明) |
| 5 | 对端恢复；尝试三开始 | 那几条回到 `available`，**没人发 reload**；动作集按这一次取到的清单；被改成 `forbid` 的那一项在这一次的 `effectivePermissions` 里是新值 | [S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) |
| 6 | 另一个接入点 `db` 从来没连上过 | 报告里 `db` 那一行 `unavailable{reason}`，原因写「从未取得动作清单」；**没有任何 `db` 的动作条目** | [S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住) 第三行 |
| 7 | 观察三次尝试之间的快照与装配清单 | **`tool`、`mcp` 两张快照一次都没换**；装配清单里没有动作条目、接入点持有或逐动作权限 | [S-12](contract.md#s-12-mcp-动作条目在一次尝试内钉住)、[S-18](contract.md#s-18-快照不持久装配清单是唯一权威) 第 3 条 |
| 8 | 尝试四开始时第二次求值不可用 | 报告照常交出，`effectivePermissions` 里 `gh` 的每一项是 `unavailable`——**不是作者默认，也不是任何一档**；放行判断的调用方据此同批全拒 | [S-11](contract.md#s-11-一次执行尝试的可用性报告)、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ⑧ |

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
| 5 | 拓展件 `guard` 的 `needs` 缺一项 | `guard` `unavailable{reason}`（视作卸载，没有替换件）；`trace` 照旧 | `data.loop-extension/v1#S-9` |
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
| `invalidInput` | `markFailed(s1, slash_command:/fmt)`（① 型）或 `markFailed(s1, slash_command:omne-official:reload-tool)` | 只收 ③ 型，且不收 reload 一族 | [S-27](contract.md#s-27-markfailed命令型服务报错之后去掉那一条) |
| `categoryNotRegistered` | `reload(s1, agent_definition)` | 八类之一，但不建表 | [S-5](contract.md#s-5-八类里登记六张表) |
| `sessionNotFound` | `list(s9, tool, within: session)`，装配清单里没有 `s9` 的装配记录 | 从没为它成功填过表；「会话不存在」与「没装配成功」同一个值 | [S-21](contract.md#s-21-这一节每个操作写全九件事) 总表 |
| `dependencyUnresolved{missing}` | 组织把 `kit` 的成员改成引用一个谁都没有的技能 `ghost`，人发 `omne-official:reload-plugin` | 求值的 `unresolved` 非空；`missing` 列出 `ghost` 与引用它的 `kit`；**三张表都不换**。**不是**依赖声明不满足——那是第 5 节的替换件 | [S-23](contract.md#s-23-reload按类别重填) ⑥ |
| `dependencyUnresolved{missing}` | 定义直接引用技能 `review`（只有租户那一份、没有 official）；A 对它的「谁可以用」被收回之后人发 `omne-official:reload-tool` | 此刻的求值里 `review` 无人可用、没有下一层，进 `unresolved`；**哪一类的 reload 都收这个值**，交付面看得见；装配为下一次运行重新装配时同样失败，收口归装配 | [S-20](contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 末段、[S-23](contract.md#s-23-reload按类别重填) ⑥ |
| `toolNameConflict` | 桥给 `gh` 的某个动作起的名字恰好等于 `grep` → `refreshAvailability(s1, run: start{R1})` | `tool` 表在 agent 面前两条同名；**不静默丢一条** | [S-7](contract.md#s-7-注册表条目)、[S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) |
| `unavailable` | 「谁可以用」的读面不可用时 `lookup(s1, slash_command, "/fmt", within: session)` | 判不出来——**不是**「没有」 | [S-25](contract.md#s-25-lookup查一条) ⑧ |
| `unavailable` | 第一次求值拿不到（含「谁可以用」的读面不可用）时 `refreshAvailability(s1, run: start{R1})` | 钉不下一份判不出来的技能门控，也没有接入点持有可用——**不是**一份把技能都算作用得了（或都用不了）的报告，**也不拿装配那一次的持有去连** | [S-24](contract.md#s-24-refreshavailability每次执行尝试开始时现算) ⑧ |
| `unavailable` | 工作区 `W` 的承载目录此刻读不到时 `reload(s1, skill)` | 不当作「工作区是空的」；表不换 | [S-23](contract.md#s-23-reload按类别重填) ⑧ |
| `unavailable` | 装配清单追加失败时 `fill(s1, …, ev_1)` | 一张表都没有；装配清单里也没有这一次 | [S-17](contract.md#s-17-换表同一会话串行多表一次成败同一) 第 4 条 |
| `unavailable` | 重启期间 `W` 里 `review` 的内容改了；重启后 `list(s1, skill, within: session)` | 记下的那一版正文无法原样取回——**不是新内容，也不是空表**；直到 `omne-official:reload-skill` | [S-33](contract.md#s-33-本能力重启与重建) 第 3 条 |
