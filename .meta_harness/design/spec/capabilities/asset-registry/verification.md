# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

## v3 候选：求值快照与显式顺序

2026-09-27 起草 [v3](v3/contract.md)，未接受、未冻结。v2 已接受状态以 registry 为准；下方较早的候选进度是历史记录，不撤回 v2 的接受，也不表示 v3 已通过真实实现验证。

### 变化的影响（v3）

- **2026-09-27 独立规格评审后的有限修订（第三次检查）**：按主线裁定补 S-16、S-23、S-24、S-31 的依赖失败交接：合法操作请求使用固定根来源与当前持有，因根替换或选用版本改变而触发 `capability.asset-evaluation/v4#S-7` C16 的内部 `invalidInput` 时，对调用者收 `unavailable`。不改持有、根来源或声明来迎合校验，不换旧表、不追加清单、不交新报告；普通第二次求值读不到与调用者 `invalidInput` 仍按原分支。S-50⑤⑥及实例第 9 节要求真实生产者交错与反向对照。登记提案只新增求值依赖 S-7，不改坐标、覆盖或失败值集合；旧证据保留，新材料在 `run-3/`。候选未接受。
- **2026-09-27 有限表达对齐（第二次检查）**：按主线针对根设置回退问题的技术裁定，S-50④、实例第 9 节及 manifest S-33 引用改为两个读取关系：旧表收窄记录及其引用保持 E1，全会话 `readEvaluation` 在固定清单头上界内读取最近已提交的 `given`／`mint` E2。七个旧操作、表的 `basedOn`、`reuse` 引用、记录内求值与排列均不变；该历史结果不代表当前层值的实时求值。此裁定未接受，仍须整批独立核对；不改变 registry 依赖坐标或消费条款集合。旧检查输出保留，新检查与输入哈希另存任务目录 `run-2/`。
- 继承 v2 的七个操作、闭合失败集合、授权、同会话串行换表、报告与旧快照的读取边界。S-6、S-22、S-23、S-48 改用调用者显式提供的 `compositionOrder`，不再把求值的 `composition` 集合当成有序值；这改变 `fill`／`reload` 输入，旧调用不能直接采用 v3。
- S-18、S-48 把记录 `content` 收为恰含 `evaluation`、`compositionOrder`、`filledBy` 的对象。`basedOn` 只取壳 `evaluationRef`，`filledAt` 只取表时刻。`given`／`mint` 同次追加完整真实求值与目标表构成；`reuse` 保留原求值及其完整排列，不把收窄伪装成重新求值。
- 求值依赖升为候选 v4，清单依赖升为候选 v3，资产形状／工具／拓展件升为已接受 v3；消息仍采用 v2，新消费 S-37 的无损 JSON。根属性与超时／模型默认值的求值不由本契约另行定义。PF-002 rev 20、PF-004 rev 12、PF-006 rev 19 与当前工作区一致；相邻 PF-012 已为 rev 15，本次未改变其尝试开始时生产报告要求。
- 传播到装配、reload 派发者及清单提供者：须生产全排列，保留真实结果，并把新字段纳入既有提交。模型请求运行时及拓展件派发者继续用真实 `lookup` 和同一尝试的报告；本包不宣称任一提供者已升级。
- 调用者责任由只点名 agent loop 泛化为已核实会话／运行／尝试身份的内部尝试调用方；读取时点、报告身份与快照绑定均保留。模型请求运行时列入 lookup 消费者，装配提供真实事实读面的职责不再只硬指 `apps/cli`。这不创建新的 agent loop 业务，也不豁免任何调用前提。
- 无新增正式词条或身份对象；`compositionOrder`、三个内容成员均为既有会话资产注册表／清单记录的字段。继承 G-1～G-17 的 owner 和未决边界；没有用本次窄增量关闭完整 PF-004 装配、全部资产类别、工具执行或 agent loop 的缺口。

### v3 证据义务

| 性质 | 规范落点 | 验收方法 | 当前状态 |
|---|---|---|---|
| 顺序恰为全排列，错误零追加；空值与缺席分开 | [S-48、S-49](v3/contract.md#s-49-顺序缺陷在提交前拒绝) | 真实接收边界正反例；改变求值集合编码次序，观察结果；记录清单头与追加计数 | 未开始 |
| 真实求值结果、顺序、目标表构成同一次追加 | [S-18、S-50](v3/contract.md#s-50-求值记录重载与收窄) | 真实 evaluate → fill → manifest 读回；提交前后故障注入、重启恢复、数值无损对照 | 未开始 |
| reload 仅动目标表，mint 引用从壳投影 | [S-23、S-50](v3/contract.md#s-50-求值记录重载与收窄) | 两类别不同顺序，核未选类别的构成／时刻／引用原样 | 未开始 |
| 两种 reuse 保留原求值和完整排列，只删不重排 | [S-27、S-28、S-50](v3/contract.md#s-50-求值记录重载与收窄) | markFailed、onAssetChange 分别演练；较新求值 E2 存在时，旧表历史及引用仍追 E1，全会话 `readEvaluation` 在固定头上界内读 E2 | 未开始 |
| 固定根来源遇当前根替换／改版，C16 失配依赖拒绝正确交接 | [S-16](v3/contract.md#s-16-会话资产注册表不求值只消费求值结果)、S-23、S-24、[S-50⑤⑥](v3/contract.md#s-50-求值记录重载与收窄) | 真实 A/1 填表后改当前持有为 B 或 A/2，真实求值返回 invalidInput、操作返回 unavailable；核旧表与清单未变、没有新报告；另核调用者缺参仍 invalidInput、两种结论失败原样转交 | 未开始 |
| 七操作与既有授权、失败和报告边界保持 | S-21～S-28、S-31、S-36～S-47 | 继承 v2 场景逐项采用 v3 输入重新执行 | 未开始 |

本次不新增 TLA+／Alloy 或 formal task：新增范围不改变继承的单写者与同次追加前提，排列与投影由有限值对照、真实存储读回和故障注入承担。形状或散文结构检查不替代上表验收。没有本 capability 自有 JSON Schema，线上形状仍归消费它的 composition。

### v3 实际检查（2026-09-27）

本次 `.venv/bin/python`（Python 3.12.13）执行结构脚本：**116 项通过**，包括 50 条编号、七操作各九项、闭合失败值集合继承、17 个精确依赖及全部 clauses、两份 v2 冻结资源与基线逐字不变。脚本、完整输出、输入快照和 SHA-256 存于本次执行树 `tmp/model-request-runtime/asset-registry-v3/`，待主线归档；这些是结构核对，未执行 JSON Schema、TLA+、Alloy、真实 evaluate、清单存储或运行时。

全树 `check_design.py --formal registered` 在同一 Python 下实际退出 1，报告 **10 处他包链接错误**（asset-evaluation 2、model-request-runtime 2、model-response 6），未报告本包错误。原始输出为任务目录 `design-check-venv.txt`。第一次用系统 `python3` 执行因旧 Python 缺少 `PurePosixPath.is_relative_to` 而失败，原始输出另存 `design-check.txt`；不把工具未运行完成写成通过。`git diff --check` 在本包通过。

`registry-candidate.json` 提供 2 资源、17 依赖、38 项 `reviewed: false` 覆盖供主线集成，未写入共享 registry。接受和生产实施还须闭合候选精确采用与独立评审；真实根声明生产者受 `capability.asset-evaluation/v4` G-22 约束，不能用手写结果或 fixture 当作完成本包 S-22 的输入前提。

**第二次有限检查**：`run-2/check.py` 实际 **27 项通过**，只核 E1／E2 描述、manifest S-32/S-33 的对应声明与新锚、13 个旧操作／记录条款逐字未变、登记提案未变及 v2 冻结资源。`git diff --check` 通过。未重跑全树检查或执行行为验证；原始输出、新输入快照及哈希保存在 `run-2/`，首次检查材料保持不变。局部脚本最初两次因标题截取与条款定位错误退出 1，修正脚本后通过；失败输出和当时脚本另存，未改弱契约要求。

**第三次有限检查**：`run-3/check.py` 实际 **50 项通过**，覆盖 C16 条件映射、两项操作九件事、生产者交接与禁止修输入、调用者错误及第二次通常读失败的区分、真实交错场景要求、求值 S-7 精确引用、登记提案仅增该条、五个未改操作及冻结 v2。`git diff --check` 通过。原始输出、修订前后输入快照及 SHA-256 均保留在 `run-3/`；没有重跑全树检查、形式工具或真实生产者，新增行为场景仍为未开始。

> **当前状态（2026-09-24 第一轮独立评审处置后；2026-09-25 修复波 1b 原地改，同日修复波 2 按第二轮复评原地改，同日修复波 3 按实现映射反推原地改——[处置](#实现映射反推2026-09-25)）：没有任何证据。**
> `capability.asset-registry` v2 是 `candidate`，经过两轮独立评审（处置见独立评审），**未接受**；尚无提供者设计、尚无源码。
> **本版不建形式工件**（理由在[契约 S-35](v2/contract.md#s-35-本版选用哪些形式工件)），因此也没有 formal task；
> 下表登记的是**已经触发的证据义务**，规范场景**一条都没演练**。

## 证据义务

### 形式工件

**未触发，未建，未运行。**不登记 formal task。

| 本来可能建模的性质 | 为什么不建 | 证据改由谁承担 |
|---|---|---|
| 快照只在四个时刻换；同一会话换表串行、多表一次成立 | 每个 (会话, 类别) 单写者、换表一次提交：行为模型里「别的动作不改快照」只能写成 `UNCHANGED`，**被建模方式吸收**，模型里没有一条会在条款被违反时失败的断言——建了也不构成证据 | [S-36](v2/contract.md#s-36-创建时填六张)、[S-37](v2/contract.md#s-37-reload-plugin-连带)、[S-39](v2/contract.md#s-39-命令型服务报错之后命令不再可见)、[S-42](v2/contract.md#s-42-没人发-reload增删禁用不进来) 与故障注入 |
| 可用性是当下条件的纯函数 | 没有状态可交错 | [S-40](v2/contract.md#s-40-依赖缺失与恢复) 枚举 |
| 进行中的尝试看不看得见 reload | **主线已裁**（D-060 §八 M35，原 G-2 闭合）：尝试之内看不见、下一次尝试起看得见。一次读在哪一份快照里找是固定的取值规则，行为模型只会把它写成一条赋值，**按构造成立**，不构成证据 | [S-37](v2/contract.md#s-37-reload-plugin-连带)「尝试中途 reload 一支」、examples §2 第 7、8 行 |
| 尝试开始时两次求值、接入点持有与全部工具条目的执行权限钉进报告、拿不到不补档；`continue` 核对运行标识 | 一次调用里的固定次序，不写状态；「拿不到不补档」是取值规则，没有交错——模型只会把它写成一条赋值，**按构造成立**，不构成证据 | [S-46](v2/contract.md#s-46-逐动作执行权限与接入点持有钉进报告)、[S-47](v2/contract.md#s-47-别的运行的报告不能拿来-continue) 与故障注入 |

**触发条件**：同一会话允许多次执行尝试并发读表，或报告所依的旧快照要跨实例保留（M35 之后 `within = run` 读的可能是已被顶替的那一份）——那时「一次尝试内不变」与换表之间有了真实交错，应重判。（原先的前一半「G-2 裁成下一次取就看到新表」已由 M35 以「下一次**尝试**」答掉，尝试之内不交错。）

### 规范场景

**十二条全部未开始**——它们要的是真实实现，而实现不存在。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-36 创建时填六张](v2/contract.md#s-36-创建时填六张) | 演练 ＋ **故障注入**（装配清单追加失败） | **未开始** | 受阻：装配清单无追加面（[G-1](v2/contract.md#十已知缺口)）；求值给出的常驻值与「谁可以用」在 Agent Definition 正文与 `self` 未定时缺席（`capability.asset-evaluation` 的 G-3、G-15），填表因此收 `unavailable` |
| [S-37 reload-plugin 连带](v2/contract.md#s-37-reload-plugin-连带) | 演练；在提交前后各插一次读 | **未开始** | 「没有半截那一刻」要在提交边界上插读才看得出；受阻同上 |
| [S-38 MCP 接入点连不上](v2/contract.md#s-38-mcp-接入点连不上动作原位顶替) | 演练，**跨契约**（本契约 ＋ `capability.mcp-bridge`） | **未开始** | 「替换件替的是最近一次那份」靠桥在判定类失败时随值交出持久的副本（`capability.mcp-bridge/v2#S-16` ⑥）；「调用替换件落收场 `unavailable`」由工具执行运行时兑现，只跑本契约这一半证明不了 |
| [S-39 命令型服务报错之后](v2/contract.md#s-39-命令型服务报错之后命令不再可见) | 演练，**跨契约**（本契约 ＋ ③ 型派发） | **未开始** | 「同一时段新加的 ① 型没进来」是「只删不增」唯一的实现侧证据 |
| [S-40 依赖缺失与恢复](v2/contract.md#s-40-依赖缺失与恢复) | 枚举 ＋ **故障注入**（提供者自报读不到） | **未开始** | 受阻：依赖项提供者的读面（[G-6](v2/contract.md#十已知缺口)）、会话有效运行模式的读面（[G-9](v2/contract.md#十已知缺口)）、meta 门能力标识清单（[G-7](v2/contract.md#十已知缺口)） |
| [S-41 无权即不存在；收回此刻起不存在](v2/contract.md#s-41-无权即不存在收回此刻起不存在再授予要等-reload) | 演练，**关掉资产变化通知的转发再跑一遍** | **未开始** | 两遍里「收回之后读不到」必须相同——那是「不靠通知」唯一的实现侧证据；「再授予后重新可见」那一支**如实记为 G-3 的观测** |
| [S-42 没人发 reload，增删禁用不进来](v2/contract.md#s-42-没人发-reload增删禁用不进来) | 演练（一次运行之内、没有重新装配） | **未开始** | 这是 [S-15](v2/contract.md#s-15-快照只在这几个时刻换) 最直接的证据；能断言到哪一刻随 [G-17](v2/contract.md#十已知缺口) 的裁定 |
| [S-43 重启之后重建](v2/contract.md#s-43-重启之后重建) | 演练，重启据点进程 | **未开始** | 受阻：[G-1](v2/contract.md#十已知缺口)——装配清单记不下换表，重建就没有依托 |
| [S-44 依赖未解析与同名冲突](v2/contract.md#s-44-依赖未解析与同名冲突) | 演练，**跨契约**（收回引起的那一支要装配一起跑） | **未开始** | `toolNameConflict` 那一支在 [G-12](v2/contract.md#十已知缺口) 闭合后可能构造不出来——那时改用注入桥的命名；收回那一支里「装配失败、收口归装配」由装配兑现，本契约只证明 reload 收 `dependencyUnresolved` |
| [S-45 不可用时明确失败](v2/contract.md#s-45-不可用时明确失败) | **故障注入** | **未开始** | 最容易被「读不到就当没有」抹掉的一条，必须真跑 |
| [S-46 逐动作执行权限与接入点持有钉进报告](v2/contract.md#s-46-逐动作执行权限与接入点持有钉进报告) | 演练，**跨契约**（本契约 ＋ `capability.asset-evaluation` ＋ `capability.mcp-bridge`）＋ **故障注入**（两次求值分别不可用） | **未开始** | 「拿不到不补档」「不拿旧持有去连」是本条的要害，必须注入；放行判断收到 `unavailable` 之后全拒由 `capability.tool-admission` 兑现 |
| [S-47 别的运行的报告不能拿来 continue](v2/contract.md#s-47-别的运行的报告不能拿来-continue) | 演练 ＋ 重启 | **未开始** | 崩溃恢复那一支受 [G-15](v2/contract.md#十已知缺口) 约束：门控按此刻重判，如实记下与运行开始时的差 |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| 求值给出所选版本、常驻值、「谁可以用」的答案 | [S-7](v2/contract.md#s-7-注册表条目)、[S-20](v2/contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) | `capability.asset-evaluation`（S-8、S-38、S-39） | 那份契约的 V-2（E-1 的 `assets` 三列） |
| 换表与装配清单追加同一次提交 | [S-17](v2/contract.md#s-17-换表同一会话串行多表一次成败同一)、[S-18](v2/contract.md#s-18-快照不持久装配清单是唯一权威) | PF-004 装配清单的契约 ＋ 装配 | 提供者设计须指出事务覆盖的存储对象；[G-1](v2/contract.md#十已知缺口) |
| 替换件、关掉的命令被调用时落收场 `unavailable` | [S-9](v2/contract.md#s-9-按命令的可用性)、[S-10](v2/contract.md#s-10-替换件同形只换说明) | `capability.tool-execution-runtime`（S-23 ④） | 那份契约的场景 |
| 工具结果那一端：转换件登记的查询 | [S-8](v2/contract.md#s-8-当下可用性的三个取值) 第 8 条 | `capability.modality-projection`（S-19） | 那份契约的场景；尝试开始时按哪份档案算见 [G-6](v2/contract.md#十已知缺口) |
| 每次执行尝试开始时调 `refreshAvailability`，尝试内只用那一份；如实带运行标识与尝试标识（M46） | [S-24](v2/contract.md#s-24-refreshavailability每次执行尝试开始时现算) | agent loop | agent loop 契约的场景 |
| 报告在接收边界核会话、`runId`、`attempt` 三者，对不上 ⇒ `invalidInput`（M46） | [S-11](v2/contract.md#s-11-一次执行尝试的可用性报告)、[S-31](v2/contract.md#s-31-装配给的保证-vs-协议须给的保证) | `capability.loop-extension-runner`（`dispatch.admission.report`）、`capability.tool-execution-runtime`（`submit.report`）——子那一侧落 | 那两份契约的场景 |
| 两次求值的输入收齐（配方同装配、持有与配值取此刻；第二次加 `mcpActionSets`） | [S-24](v2/contract.md#s-24-refreshavailability每次执行尝试开始时现算) ② | 装配 ＋ `capability.asset-evaluation`（S-6、S-21） | 提供者设计须指出据点副本与工作区读入结果的来处 |
| 放行判断的调用方从报告取逐动作执行权限、`unavailable` 即全拒 | [S-11](v2/contract.md#s-11-一次执行尝试的可用性报告) | `capability.tool-admission`（S-8） | 那份契约的场景 |
| MCP 调用按报告钉住的接入点持有寻址 | [S-11](v2/contract.md#s-11-一次执行尝试的可用性报告) | `capability.tool-execution-runtime`（S-23、S-38）＋ `capability.mcp-bridge`（S-19） | 那两份契约的场景 |
| 被引用的能力无人可用、没有下一层时装配失败并对交付面可见 | [S-20](v2/contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 末段 | 装配（PF-004 的契约，未建立） | [G-14](v2/contract.md#十已知缺口) ① |

## 变化的影响

- **2026-09-25 修复波 3（实现映射反推；候选，未冻结，原地改）**：逐条见下节[实现映射反推](#实现映射反推2026-09-25)。**语义改变**：`within = run` 的读改在报告所依的快照里找（M35）；`fill` 旧 `EvaluationRef` 的第三种情形改为拒绝（M34）；求值的两个新失败值转交。**表示改变**：`refreshAvailability` 多一个必填输入 `attempt`，报告多一个成员（M46）——没有已采用的消费者，无迁移。
- **2026-09-25 修复波 2（候选，未冻结，原地改）**：裁定出处 D-060 §七 M8、M10、M21；评审发现处置见第二轮。
  - **表示改变**：报告的 `effectivePermissions` 从「每条条目恰一项」写明为**以 `ModelToolName` 为键**的一张表；`tool` 类 `lookup` 的查找键写明为 `ModelToolName`。两处此前都只说「模型面的名字」，现改成那份 data 契约的正式名，没有改变已写的取值；没有已采用的消费者，无迁移。
  - **语义改变**：meta 门那一项不再取求值，恒为 `{auto}`（M21）；它在第二次求值拿不到时也不变成 `unavailable`（S-24 ⑧ 改为「除 meta 门外」）。`not_in_composition` 的适用面收窄，MCP 动作条目明确不适用。
  - **新增推导（已报主线）**：meta 门那一项 `from = factory`、不带 `lockedAt`；G-7 闭合之前没有条目被当作门。
  - **registry**：catalog 本契约的依赖与 clauses 不变（`data.tool-definition` 的 `S-6` 已在；M8 不新增被消费条款）；covers、formal-tasks、id-namespaces 不变。
  - **对证据的影响**：没有既有证据；S-46 多三支（接入点失去持有、meta 门、退回下一层），仍「未开始」。

- **2026-09-25 修复波 1b（候选，未冻结，原地改；本包原属 R4b 批，由丁按主线授权改 L13 一条）**：裁定出处 D-060 §六 L13。
  - **`effectivePermissions` 扩到 `tool` 表每条条目**（[S-11](v2/contract.md#s-11-一次执行尝试的可用性报告)）：作者写的与官方的工具（常驻与否、meta 门都算）取第二次求值里它能力标识 `execute` 那一项的 `EffectiveValue`（含 `tenantAutoWritable`），MCP 动作照旧；一次尝试内不变的口径覆盖全部工具条目（S-11 第 1、4 条）。**某条条目在第二次求值里没有那一项的值**（此刻已不在组合里）——起初推导为 `unavailable`（已报主线），同轮由主线改裁为显式值 `not_in_composition`（L15，见下一条）。
  - [S-24](v2/contract.md#s-24-refreshavailability每次执行尝试开始时现算) ④ 第 5 步：从第二次求值取全部工具条目的执行权限；没有钉住动作条目时两次输入相同、直接取第一次的结果（依据 `capability.asset-evaluation/v2#S-11`）。「为什么是两次求值」一段补作者写的工具为什么也从第二次取，并把「配方同装配、持有与配值取此刻」改链 §六 L8、N-10。
  - S-1 第 4 行、S-33 第 5 条、第六节不变量／安全／进展各一行、S-31 一行、S-35 一行、消费者核对「放行判断」一行随之改；场景 [S-46](v2/contract.md#s-46-逐动作执行权限与接入点持有钉进报告) 加「作者写的工具一支」（标题与锚点不改）；实例第 3 节第 1、8 行改写、加第 9 行。本契约不附 Schema，没有 Schema 要改。
  - **registry**：catalog 本契约对 `data.tool-definition` 补 `S-31`（`execute` 项名、恒有），对 `capability.asset-evaluation` 补 `S-11`（同输入同结果）；S-4 两张表同改。covers、formal-tasks、id-namespaces 不变。
  - **同轮追加：L15**（D-060 §六 L15）：条目的能力标识不在第二次求值的组合里（被禁用、被移除、这个租户用不了）⇒ `effectivePermissions` 那一项写显式值 **`not_in_composition`**，`unavailable` 只留给求值本身失败；放行判断那一侧对它单独判 `deny{not_held}`、不牵连同批（`capability.tool-admission` S-8 同轮改）。S-11 那一行、安全性质一行、消费者核对「放行判断」一行随之改；场景 S-46「作者写的工具一支」的禁用那一步改期望为 `not_in_composition`；实例第 3 节加第 10 行。
  - **同轮追加：G-16 闭合**（D-060 §六 N-10）：页首那一行与正文 S-9、S-15 表、S-21 注、S-28 引语里的 `[G-16]` 改链 N-10；G-16 行改为已闭合，S22-a 括注与 S-28 的出入指向 D-060 §四 已登的那一行。
  - **对证据的影响**：没有既有证据；S-46 多一支，仍「未开始」。
- **2026-09-24 第一轮独立评审处置（候选，未冻结，原地改）**：处置逐条见上表。
  - **产品依据 rev 复核**：PF-002 rev 17（§4 MCP「每一次执行尝试开始前重算、尝试内不变」落进产品正文）→ S-12 依据改引正文；rev 19（§5.2「谁可以使用它」判下来不能用的不装、收回自下一次运行起）→ 早已落在 S-20；rev 20（连接件的事件目录与投递、拓展件不可用处置是自己的声明）→ 不涉本契约的条款；词条「会话资产注册表」的定义另由词条批按 rev 20 改为「装进运行的自下一次运行起」，与 S-20 一致 → 头部词条注记。PF-006 rev 17～19（§6.13 按尝试重取、工具说明必填）→ 不改本契约的条款。PF-004 rev 11～12（I-4 的时间尺度；构成变小也重新装配）→ S-15、S-20 末段、G-14 收窄、新 G-17。PF-007 rev 17～18、PF-012 rev 11～14、PF-016 rev 8 → 本契约引到的小节没有语义变化。
  - **表示改变**：`refreshAvailability` 的 `run` 两支都带 `runId`，报告多三个成员（运行、`endpointHoldings`、`effectivePermissions`）；`within = session` 的 `tool` 读不再含 MCP 动作条目。没有已采用的消费者，无迁移。
  - **依据链**：K30、K33 链 D-060 §五；账本名一律改引 D-060（§块 A、§块 B、§S13、§S21、§S22、§三）；尚未汇编的三条登 G-16。
  - **新增条款**：S-46、S-47（规范场景）；新缺口 G-16、G-17；G-14、G-15 改写。
  - **对证据的影响**：没有既有证据；S-38、S-42、S-43、S-44 的断言改了，仍登「未开始」。
  - **消费者要知道的**：agent loop 调 `refreshAvailability` 要带 `runId`；放行判断的调用方从报告取 MCP 逐动作权限；工具执行运行时从报告取接入点持有；装配要为尝试开始时的两次求值收齐输入，并在 `unresolved` 非空时收口。
- **2026-09-23 起草**：首版，没有旧证据可作废。
- 起草同日按主线补充裁定纳入：块 B 对账「S22 六组」、操作 `onAssetChange`（[S-28](v2/contract.md#s-28-onassetchange权限收回之后收窄)，**本稿只收窄，与裁定原文有出入，登 [G-3](v2/contract.md#十已知缺口)**）、按命令的可用性 `commandAvailability`（[S-9](v2/contract.md#s-9-按命令的可用性)）。这些都在首版之内，没有旧证据受影响。
- **2026-09-24 整批对齐（简报 S23；主线裁定 2026-09-23，待产品负责人确认，账本 S22-a～g）：原地改了候选。**
  - 七份并行契约的依赖由施工账本名换成条款号，新增 `capability.modality-projection`、`data.model-profile` 两项（[S-4](v2/contract.md#s-4-依赖方向与被消费的面)）；`data.messages` 的消费由 `#S-15`／`#S-18` 换成 `#S-24` `SessionRef`。
  - [S-30](v2/contract.md#s-30-可用性变化不出提醒) 改为「可用性变化不出提醒」（S22-d，标题与锚点随之改）；[S-28](v2/contract.md#s-28-onassetchange权限收回之后收窄) 只收窄已裁（S22-a）；`slotConflict` 改名 `toolNameConflict`；`dependencyUnresolved` 待账本给名。
  - [S-12](v2/contract.md#s-12-mcp-动作条目在一次尝试内钉住) 按桥 `refreshActions` 的四种结局重写（不再另调 `availability`；「只能以替换件出现」「被排除」「没有结论」三处补齐）；[S-8](v2/contract.md#s-8-当下可用性的三个取值) 加第 8 条工具两端的模态；[S-14](v2/contract.md#s-14-会话斜杠命令集是-slash_command-那张表的视图) 写明交出「命令名 ＋ 正文」一对；[S-7](v2/contract.md#s-7-注册表条目)、[S-20](v2/contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 取求值的 `version`／`resident`／`usable`，缺席即 `unavailable`。
  - G-4、G-5、G-8、G-10 闭合；G-1、G-3、G-6、G-12 改写；新缺口 G-13。实例第 3、8 节随之改。**条款编号不变**；外部引用的 S-10、S-20 含义不变。
- **2026-09-24 随 `capability.asset-evaluation` 的第一步三小步（PF-002 rev 19；主线派发，候选未冻结，原地改）**：那份契约删去 `EffectiveAsset.usable`，「谁可以使用它」在求值第一步判掉。
  - [S-20](v2/contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 2、5 条：**进了 `assets` 的就是用得了的**；读时现读改为看此刻的求值有没有把这份资产以 `not_usable` 滤掉；删去「`usable` 缺席」一句。S-20 末段加「与『下一次运行起按此刻求值装入、退回下一层』怎样对上」：一次尝试内不变、装入与退回归下一次装配的 `fill`、`onAssetChange` 与读时现读只收窄——主线读法。
  - [S-4](v2/contract.md#s-4-依赖方向与被消费的面) 表那一行、S-16 ②、[S-22](v2/contract.md#s-22-fill装配时填六张) ④⑥、G-5、消费者核对末行同步去掉 `usable`。
  - **新缺口 [G-14](v2/contract.md#十已知缺口)**：每次运行之前是不是一次装配、`skill` 表在一次已经开始的运行里被收窄、钉住的单位是尝试还是运行——三处对不上，已报主线。
  - 证据义务表里「求值给出所选版本、常驻值、『谁可以用』的答案」那一行：「谁可以用」的答案现在是「在不在 `assets` 里」，实例（第 3、8 节）的期望不变：没有权限的命令不在表里。
- **2026-09-24 修订第二轮（主线裁定 R2-13；候选未冻结，原地改）**：「谁可以用」门控里**钉住的单位是运行**，收窄只对下一次运行起作用。**怎样兑现是本契约推导**（已报主线）：
  - [S-11](v2/contract.md#s-11-一次执行尝试的可用性报告)：报告加一项「这次运行钉住的技能门控」，第 4 条写明两个单位——可用性与 MCP 动作集仍按尝试（B-M03 不变），技能门控按运行。
  - [S-24](v2/contract.md#s-24-refreshavailability每次执行尝试开始时现算) ① 加**必填判别式 `run`**（`start`／`continue{report}`）：`start` 现判 `skill` 表并钉下、`continue` 沿用不重判；`start` 时「谁可以用」读不到 ⇒ 整个 `unavailable`。[S-25](v2/contract.md#s-25-lookup查一条)、[S-26](v2/contract.md#s-26-list列一类) ① 加**必填判别式 `within`**（`session`／`run{report}`）：运行里的读按报告钉住的门控、不现读，会话级的读（斜杠命令识别、② 型展开）照旧现读；`tool` 类的 MCP 动作条目按所带报告取。[S-19](v2/contract.md#s-19-缺席时的默认答案) 写明二者缺席即 `invalidInput`。**表示改变**：三个操作的输入多一个必填成员，旧调用形状不再合法——没有已采用的消费者，无迁移。
  - [S-28](v2/contract.md#s-28-onassetchange权限收回之后收窄) 只收窄 `slash_command`，**不动 `skill` 表**；[S-15](v2/contract.md#s-15-快照只在这几个时刻换) 那一行、[S-20](v2/contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 3 条与末段、[S-34](v2/contract.md#s-34-进行中的运行与撤销)、第六节（加一条不变量、一条进展性质）、[S-41](v2/contract.md#s-41-无权即不存在收回此刻起不存在再授予要等-reload)（加技能一支）、消费者核对四行随之改。
  - **[G-14](v2/contract.md#十已知缺口) ②③ 闭合，① 留**（每次运行之前是不是一次装配，PF-004 的契约）。**新缺口 [G-15](v2/contract.md#十已知缺口)**：钉住的门控只在报告里，报告不持久，崩溃恢复之后的尝试拿不回它——只能以 `start` 重判、只会更窄；owner 是 agent loop 与运行的契约。
  - `examples.md`：全部调用补上 `run`／`within`；第 3 节尝试二改为同一运行的 `continue`；第 7 节第 2、6 步改写，加第 7、8 步（运行中途收回照样用、下一次运行起不在）；第 8 节加两行（缺 `run` ⇒ `invalidInput`；`start` 时门控读不到 ⇒ `unavailable`）。
  - **证据**：本契约没有已执行的证据，没有要作废的；[S-41](v2/contract.md#s-41-无权即不存在收回此刻起不存在再授予要等-reload) 与第 7 节首次执行时按本轮的期望。
  - **（同轮追加）** 参数名 `run`／`within` 由主线接受，头部注记随之写明；语义不变。
- 此后 G-3 改判（G-2 已由 M35 闭合），**[S-41](v2/contract.md#s-41-无权即不存在收回此刻起不存在再授予要等-reload)、[S-42](v2/contract.md#s-42-没人发-reload增删禁用不进来) 的预期要跟着重写**，并按上文「触发条件」重判形式工件。

## 实现映射反推（2026-09-25）

起因：realization-drafter 庚报回 A-5、A-6，壬、辛报回 C-10，spec-drafter 子报回尝试号缺失（N-20）；戊报回 AE-1、AE-2 引出求值的 M31、M32、M45。主线裁定见 D-060 §八。**裁定不代替接受**，本契约仍是 candidate。

| 裁定 | 落点 | 本契约推导的部分（已报主线） |
|---|---|---|
| **M34** 同一 `EvaluationRef` 再 `fill` 而六张表已不是它填出的 ⇒ `invalidInput{evaluationSuperseded}`，不当作新装配 | [S-22](v2/contract.md#s-22-fill装配时填六张) ⑥⑦（⑦ 按 S-13 分三种：没落下／正是它填的／已被取代）；[S-19](v2/contract.md#s-19-缺席时的默认答案) 第三行；[S-21](v2/contract.md#s-21-这一节每个操作写全九件事) 总表 `invalidInput` 一行；S-36「再跑一支」；examples §1 第 10 行、§8 一行 | 「已不是它填出的」读作六份里任一份的 `filledBy ≠ assembly` 或 `basedOn` 不是它——`markFailed`、`onAssetChange` 虽沿用 `basedOn`，也算取代 |
| **M35** `within = run{report}` 只在报告所依的快照里找；reload 之后新条目对仍在跑的尝试答「没有」，下一次尝试起可见；S-25 ⑤、S-8 末段、S-34、G-2 同口径 | [S-25](v2/contract.md#s-25-lookup查一条) ④⑤⑧、[S-26](v2/contract.md#s-26-list列一类) ④、[S-8](v2/contract.md#s-8-当下可用性的三个取值) 末段、[S-11](v2/contract.md#s-11-一次执行尝试的可用性报告) 表与第 1 条、[S-6](v2/contract.md#s-6-注册表快照) 第 2 条、[S-23](v2/contract.md#s-23-reload按类别重填) 末条、[S-34](v2/contract.md#s-34-进行中的运行与撤销)、S-2 表、S-3、不变量一行、S-35 一行；**[G-2](v2/contract.md#十已知缺口) 闭合**；S-37「尝试中途 reload 一支」；examples §2 第 7、8 行 | ① 被顶替的快照在仍有报告依它时照样读得到（构成在装配清单里）；② 它此刻取不回 ⇒ `unavailable`，**不改读当前那一份**；③ 单位是尝试不是运行，与技能门控按运行钉分开写 |
| **M40** `apps/runtime-host` → `apps/cli`（D-059） | [S-31](v2/contract.md#s-31-装配给的保证-vs-协议须给的保证) 第 3、6 行 | — |
| **M46** 报告加 `attempt`（`AttemptId`）；S-24 产出时填；runner／TER 接收边界核三者 | [S-11](v2/contract.md#s-11-一次执行尝试的可用性报告) 首行；[S-24](v2/contract.md#s-24-refreshavailability每次执行尝试开始时现算) ①⑤⑥（`attempt` 必填、调用方给）；[S-19](v2/contract.md#s-19-缺席时的默认答案) 身份参数一条；[S-31](v2/contract.md#s-31-装配给的保证-vs-协议须给的保证) 第 5 行；S-4 `data.call-accounts` 一行；S-47「尝试标识一支」；消费者核对 agent loop 一行；examples 读法一条、§3 第 1 行、§8 一行；上文「由别处承担」加一行 | `attempt` 由调用方给、本契约不铸（它的家是 `data.call-accounts/v2#S-37`，尝试开始记录派生）；本契约自己的 `continue` 不核尝试号（M46 只要求接收方核） |
| **随求值 M31** 组合根引用集 | [S-24](v2/contract.md#s-24-refreshavailability每次执行尝试开始时现算) ② 配方加「同一个组合根」；[S-23](v2/contract.md#s-23-reload按类别重填) ④；S-4 表；消费者核对末行 | 组合根随定义版本不变——定义版本不随 reload 与尝试变，`root` 也就不变 |
| **随求值 M32、M45** `compositionCycle`、`categoryUnsupported` | [S-21](v2/contract.md#s-21-这一节每个操作写全九件事) 总表加两行；[S-19](v2/contract.md#s-19-缺席时的默认答案) 第一行；[S-23](v2/contract.md#s-23-reload按类别重填) ⑥、[S-24](v2/contract.md#s-24-refreshavailability每次执行尝试开始时现算) ⑥⑧；[S-22](v2/contract.md#s-22-fill装配时填六张) ⑥ 注明 `fill` 不会被调到；S-44 ③；examples §8 两行 | **整条是推导**：本契约的失败集合闭合，`reload`、`refreshAvailability` 自己请求求值，求值多了两个失败，就得说它们变成什么。**原样转交、类属「结论」**，不收成 `unavailable`（那是「重试可能不同」）；本版装配成功的会话到不了这两个值，场景用故障注入 |

**registry**：catalog 本契约对 `capability.asset-evaluation` 的 clauses 补 `S-15`（失败集合，转交所据）；`data.call-accounts` 的 `S-37` 已在（`AttemptId` 同一条）；covers、formal-tasks、id-namespaces 不变。

**对证据的影响**：没有既有证据；S-36、S-37、S-44、S-47 各多一支，仍「未开始」。

**对消费者**：agent loop 调 `refreshAvailability` 要带 `attempt`；runner 与工具执行运行时在接收报告处核三者（子那一侧落，[对齐义务](#对齐义务)）；装配只给 `fill` 当前那一次的 `EvaluationRef`，重试回执丢失时照旧可以重发。

**跨批对齐（2026-09-25，drafter 丑；候选未冻结，原地改）**：
- **尝试标识的写法与形状对齐**：`attempt` 是 `data.call-accounts/v2#S-37` 的 `AttemptId`——运行里的第几次，**从 1 起的整数**，不是不透明串；[examples](v2/examples.md) 读法一条与第 2 节第 7、8 步、第 3 节第 1 步原写 `T1`、`T2`，改为 `1`、`2`（「尝试 1」）；[S-47](v2/contract.md#s-47-别的运行的报告不能拿来-continue) 的尝试标识一支同改。与 runner（`attempt = 1`、`2`）、执行运行时（`attempt = 1`）的实例同一种写法。**语义不变**。
- **消费者核对**：[第十一节](v2/contract.md#十一消费者核对)放行判断一行补「runner 按报告带的会话、运行、尝试三者核」、执行运行时一行补「`submit` 带同一份报告、按三者核、不现算」（M33、M46；两边正文已读到）；[对齐义务](#对齐义务)那一行改为已对齐。
- **registry**：不变（runner → 本契约 S-11、执行运行时 → 本契约 S-11 早已登记；本契约引它们是指路，反向登记会成环）。**证据**：没有既有证据受影响。
- **examples 对 Schema 的机检**：本契约不附 Schema，examples 是操作层面的「输入 → 预期」，没有 data 契约的完整值，**0 处可机检**——不是「过了」。组合根引用集的名字与形状同 `capability.asset-evaluation` S-6（`root { definition, references }`）逐字一致，核对无改动。

## 对齐义务

本轮处置里要由别的契约写的一半（对方批次改，核对以合回后的正文为准）：

| 对方 | 须写成什么 | 状态 |
|---|---|---|
| `capability.asset-evaluation` v2 S-6、S-8 | 「以装配那一次的输入加上它再求一次」读作**沿用配方、持有与配值取此刻的**（本契约 S-24 ②）；否则凭据与逐动作权限改值要等 reload 才生效，与 `capability.mcp-bridge` P-9 相抵 | **已对齐**（2026-09-25 读到）：对方 S-6 `mcpActionSets` 一行与 S-8 末段改引本契约 S-24 ②、不另列配方（D-060 §七 M6） |
| `capability.tool-admission` v2 S-8 | MCP 动作的 `effectivePermission` 从报告的 `effectivePermissions` 取，`unavailable` 即全拒 | 对方正文已写（2026-09-24 读到） |
| `capability.tool-execution-runtime` v2 S-23、S-38 | MCP 调用的接入点持有取自报告的 `endpointHoldings` | 对方正文已写（2026-09-24 读到） |
| `capability.mcp-bridge` v2 CS-2、CS-4 | 改引本契约的报告 | 同批（R4b）已改 |
| `data.tool-definition` v2 S-6 | 「替换件怎么造归执行运行时」补一句「是不是替换件归会话资产注册表」 | **已对齐**（2026-09-25 读到）：对方 S-6 已写「这一条目此刻是不是替换件、为什么是，由会话资产注册表判」（D-060 §六 L10） |
| D-060 §S22 S22-a | 括注「被移除/被禁用的条目」与本契约 S-28（只去掉此刻用不了的）对齐 | **已对齐**：D-060 §四 已登「括注写宽了，契约为准」 |
| `capability.loop-extension-runner` v2 S-29 第 5 条 | 报告每一项以 `ModelToolName` 为键、`call.tool` 原样去查；查不到键的调用不进放行判断；meta 门那一项恒 `{auto}`（D-060 §七 M8、M10、M21） | 同为丁所写，已对齐（2026-09-25） |
| `capability.tool-execution-runtime` v2 S-23 ② 第 6 条、④ | 以 `call.tool` 原样查本契约 S-25（`within = run`）；「没有」即刻收场 `unavailable{no_such_entry}`（D-060 §七 M8、M10） | 对方正文已写（2026-09-25 读到，丙批） |
| `capability.loop-extension-runner` v2（`dispatch.admission.report`）、`capability.tool-execution-runtime` v2（`submit.report`） | 接收报告时核会话、`runId`、`attempt` 三者，对不上 ⇒ `invalidInput`（D-060 §八 M46、M33） | **已对齐（2026-09-25，丑跨批核对）**：runner S-21 ①② 与执行运行时 S-23 ①⑥⑧ 都按三者核、名字与形状一致（`attempt` 是 `data.call-accounts/v2#S-37` 的 `AttemptId`，整数序号）；本契约[第十一节](v2/contract.md#十一消费者核对)放行判断与执行运行时两行补了这一句 |
| `capability.tool-admission` v2 S-8 | `not_in_composition` 只指「条目仍在快照、能力标识不在此刻组合里」（D-060 §七 M10） | 对方正文已写（2026-09-25 读到，丙批 S-8 末条与设计依据表）；它另留的「条目在 `tool` 表里、报告却缺那一项」一支按本契约 S-11 不会出现（键集合恰是 `tool` 表的名字），已报主线 |

## 修订波（2026-09-25 公开面）

依据链：D-063 R-1（替身改为接口契约 ＋ 最小提供者）；D-060 §八 N-33～N-37。候选未冻结，原地改。

| 变化 | 依据 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|---|
| **`EvaluationRef` 改为以坐标引用 `capability.assembly-manifest/v2#S-8`**（fill → `given`、reload → `mint`、`markFailed`／`onAssetChange` → `reuse`），不再自带一份定义 | N-37 ③ | [S-13](v2/contract.md#s-13-evaluationref) | 不改形状；原两处定义的对齐义务撤销 |
| **换表的提交点改指装配清单窄口**：「写进装配清单」即 `capability.assembly-manifest` v2 的条件追加成功（S-6、S-16～S-18） | R-1 | [S-18](v2/contract.md#s-18-快照不持久装配清单是唯一权威) 第 4 条 | 不改语义 |
| **G-1 改写为「真承接者未到，接口已定」**；G-9 的会话租户切片指 `capability.session-tenancy/v2#S-8` | R-1 | [G-1](v2/contract.md#十已知缺口)、[G-9](v2/contract.md#十已知缺口) | 不改语义 |
| catalog：本契约新增依赖 `capability.assembly-manifest` v2（S-6、S-8、S-16、S-17、S-18） | 引用即消费 | [S-4](v2/contract.md#s-4-依赖方向与被消费的面) 新一行、页首依赖、[README](README.md) | 装配清单不以坐标依赖本契约，无环 |

**没有证据因此作废**——本契约此前没有执行证据。

## v4 候选原完整填表来源（2026-09-27）

**候选，未接受。** 依据主线来源认回施工简报与只读 refresh 的 H 观察点裁定；继承 D-073 接受的 v3，新增 S-51/S-52，正文与[实例](v4/examples.md)为本版规范工件。D-077 来源接口与 registry 来源缺口稿为动因，不替代契约接受。继承 v3 七操作，仅升级 manifest 依赖到 v4；同 H 表/原 given，reload 同 H CAS，refresh 报告保留 H 时的表，后续追加不强制重做。

### 变化的影响

保持旧 v3 资源字节及原失败/授权/提交/恢复语义；新增承诺仅在 v4 被显式采用后成立。未自动重写任何下游精确版本。`registration-candidate.json` 仅交主线合入，不是中心 registry。无新身份、Schema、formal task；固定上界的选择/消费不新增状态转移，旧 formal 或实现证据不能推成新来源链已通过。

### 新增证据义务

| 义务 | 方法与反例 | 状态 |
|---|---|---|
| 精确坐标/依赖、完整原操作与九项、规范链接 | 候选结构检查与设计全树 checker；冻结哈希核对 | 见下方实际检查入口；不代替独立评审 |
| 固定 H、同会话、最后 given、none 与不可用分开 | 有限历史纯选择关系；最近 mint/忽略 H/跨会话/坏源回退/混拼负控 | 见下方实际检查入口；只覆盖抽象值关系 |
| 六类全部 reload/reuse 后重开、再次完整 fill | 真实生产求值→given→公开 readHead/readGiven→真实固定正文→操作 | **未开始** |
| 并发 append、reload CAS、refresh 旧 H 有效与混拼失败 | 真实存储两个写者/消费者，保留提交顺序、H 与返回事实 | **未开始** |
| 已存损坏、严格无损、权限/当前角色与捕获角色、实际 C16 | 真源与故障注入，零新表/记录/报告断言；不得用 fixture 代替来源 | **未开始** |

### 实际检查入口与边界

复跑入口为工作树 `tmp/model-request-runtime/manifest-origin-v4/check.py`；候选登记为同目录 `registration-candidate.json`，原输入 SHA 为 `input-sha256.json`。这些临时路径仅为代码文本，不是权威设计链接；永久证据由主线归档。检查脚本保存真实 stdout/stderr、命令和输入哈希，不以一段“通过”摘要替代原始输出。此段只列入口，**实际结果以本次 run 文件为准**；未跑提供者/组合，未运行新增 TLA+/Alloy（本增量未建模型）。

### 保留缺口与上报

来源定位/同头消费在候选中明确，不表示 OF-G1/OF-G2/EIS SI-G1 已实现或接受。提供者/消费者/验收装配仍负责真实源及恢复证据。继承全部旧 G 项与 owner；shared/workspace/MCP 真实来源、完整装配代际、权限和正式采用由各自 owner 接续，本文不填默认。

### 本次实际结果（v4 成稿）

`tmp/model-request-runtime/manifest-origin-v4/run-3/run.json` 记录两条真实命令：规格检查 exit 0；带候选 catalog/covers 的隔离设计工作区 `check_design.py --formal skip` exit 0。原始输出为同目录 `spec.stdout.txt`、`spec.stderr.txt`、`design-check.stdout.txt`、`design-check.stderr.txt`；输入快照与 5,454 项 SHA 见同目录 `input-sha256.json`，已逐项复核无变化。规范四文件与该次检查输入完全相同；本结果段在运行后追加，不属于当时输入。

规格检查实际核了 MF4 的 37 条/6 操作、AR4 的 52 条/7 操作及各自九项，4,977 个抽象历史输入、6 个错误选择变体、同 H 观察与混拼负例、严格 JSON 数值示例；这些不执行产品提供者、不运行完整 AE judge、不证明真实 CAS/权限/耐久。**真实组合与新来源恢复仍未开始**；没有新形式模型，既有 formal tasks 明确 skip，不称已运行。

原 `run-1` 也保留：纯检查 exit 0，设计检查因快照没有保留 `.meta_harness/design` 与 research/agents 的目录关系而 exit 1；361 个边界链接错误不是产品结论。其输入清单还存在同名覆盖的记录缺陷，不能当作完整哈希证据。`run-2` 修正快照与清单后两项 exit 0；`run-3` 针对说明对齐及合法 head 的跨会话负控重跑。原始输出未删除或替换。最终资源哈希与 v3→v4 差异在同目录 `final-hashes.json`、`changes.diff`，候选未接受。
