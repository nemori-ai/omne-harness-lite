# asset-registry 验证与证据

## v3 候选增量

本节对应 [registry v3](../../../../spec/capabilities/asset-registry/v3/contract.md)及 [v3 候选设计](v3-design.md)。全部义务尚无产品运行，绑定仍为 0；旧 v2 的设计/记录不转换成 v3 证据。原 S-36～S-47、N-1～N-10 按 v3 的精确变化重跑；下列针对新增顺序、读取和组合边界。

| 编号、条款与投影行 | 可失败验收 | owner 与闭合条件 | 状态 |
| --- | --- | --- | --- |
| VE-1：S-22/S-48/S-49；AR3-1 | 真实根正文→AE4→fill；打乱集合编码不改显式顺序，六类按排列筛选；空组合须显式空序列；缺/重/漏/额外/根项均零追加 | 本节点、AE4、输入源、验收装配；固定真实输入及提交记录 | 未开始 |
| VE-2：S-16/S-23⑥/S-24⑥/S-48/S-50.6；AR3-2/3 | 即使根漂移，缺 compositionOrder、缺 attempt、错运行报告仍先收调用者 invalidInput；成功 E 后才核全排列，再 unresolved、toolNameConflict；根一致时 AE4 cycle/unsupported 原样转交；无来源的同名 invalidInput 不得被一概映射；去掉/后移检查的变异应失败 | 本节点；真实公开 evaluate 与失败因果交接，不以只跑 Schema 代替行为次序 | 未开始 |
| VE-3：S-18/S-22⑦/S-48.3～5/S-50.1；AR3-1/6 | content 恰三字段且完整 E 无损；所有表/内容同次追加；given 回执丢失认回原结果和顺序，已被取代收 evaluationSuperseded；无占位 basedOn | 本节点、manifest；真实存储失败注入与重开，不允许内存先发布 | 未开始 |
| VE-4：S-16/S-23/S-24/S-31/S-50.2/5；AR3-2/3 | reload(tool) 只改 tool，plugin 连带目标一次成立，mint 引用来自同一提交壳；另从真实 A1 正文求值/fill，分别把当前持有改选 B、A2，固定根不变，合法 reload、refresh start/continue 均由真实 AE4 C16 invalidInput 转为依赖 unavailable；六张旧表、清单头/历史不变且无新报告；root/source/声明/引用/当前持有均未被修补 | 本节点、真实输入源、AE4、manifest 与验收装配；记录固定来源和本次选择及依赖→操作结果，不能只注入无来源的失败；故障窗口检查不存在半份 content/tables | 未开始 |
| VE-5：S-20/S-24～S-26、AE4 S-6/C12/PRE-3；AR3-3/4 | slash 每读现求，skill/session 现求，skill/run 沿报告，tool/run 沿旧正文；S-24 捕获路径的角色不被当前 role 覆盖，但当前有效性撤销/未知必须拒绝组输入；权限失败是 unavailable 非“没有”；新条目不能由现求偷偷进入 | 本节点与真实输入源；同一 unit 真实 memberships 读与竞争、固定根选版 C16 失败分支；不通过固定 getter 假装实时 | 受阻于真实源尚未交付 |
| VE-6：S-11/S-12/S-16/S-24/S-46/S-47/S-50.6；AR3-3 | 第一次失败不调桥/不交报告；第二次求值通常读不到仍交报告，除 meta 门外的权限项 unavailable；已确认 C16 根失配则整个 unavailable、不交报告，不能套用通常二次失败分支；无动作不二次求值；同次权限按模型面名字；session/run/attempt 不符被拒 | 本节点、桥与调用方；VE-4 的真实根失配加通常二次读不到的具名故障对照；未具备 meta 门清单不得冒领该支 | 未开始 |
| VE-7：S-25/S-33/S-34；AR3-4/6 | 持旧报告连续两次 reload，再重启取旧快照；旧正文不可恢复时 unavailable，不给最新表/空表；scope/租户来源错不得泄露 | 本节点、manifest/正文源、runtime；真实历史重建及消费 | 未开始 |
| VE-8：S-27/S-28/S-48.6/S-50.3～4；AR3-5/6 | E1/O1→另一类 reload E2/O2→两种收窄分别 reuse E1/O1；readHistory 源 E1，readEvaluation 源 E2；重开保持；删序列不重排、不改历史 E | 本节点与 manifest；负控为改用最新 E、裁剪 O、沿头引用回退，均应失败 | 未开始 |
| VE-9：S-17/S-18；R-AR3-1/2 | 两个实例同头换表，禁用进程队列仍由共享主键/事务定序；旧实例晚提交，新实例下一次读先对头；冲突重做重新求值并重验排列 | 本节点、manifest、存储；实际并发连接/实例及配置上限，不能只有 Promise mock | 未开始 |
| VE-10：S-13/S-22；R-AR3-3/4 | 两会话同 given 引用恰一方成功；reuse 不借外会话源；拆库/移除约束负控不能被报告通过 | manifest owner 主验，本节点消费失败；共同 owned_ref 唯一约束实际有效 | 未开始 |
| VE-11：S-27；AR3-5/6 | 真实 session JSONL 失败落盘后才执行 SQL 收窄；在两者之间中断，保留失败且命令仍在；SQL 提交失败/未知不删除日志、不谎称两者回滚 | sessionLog、派发调用方、本节点、验收装配；分别记录两个耐久点，重启验事实 | 未开始 |
| VE-12：S-31～S-34；AR3-7 | 真 Cordis 4.0.4 依赖缺席/换代、部分初始化失败、旧引用后到、在途已受理/排队任务收口；新实例不接管旧缓存，停止请求不冒充事务已结束 | 本节点与 manifest/装配；原 N-6/N-8 连同实际资源观测，确认 provide 纳管，不据 fiber 状态推断 | 未开始 |
| VE-13：S-16/S-29/S-30；AR3-7；SYS-OPEN/OBSERVABILITY | 公开纯构件独立制品可用；不自组 BodyContracts、不复制 evaluate、不 inject storage/监听全局事件；有界队列/诊断配置、sink 故障、敏感值不落观测 | 本节点与装配；结构规则须有故意违反会失败的自测，诊断故障不改变提交结果 | 未开始 |

### v3 实际执行

尚无产品执行。文档检查命令、原始 stdout/stderr、退出码与输入摘要随本次交付报告提交；design checker 通过只支持链接与登记结构，不支持以上行为。其他候选的有限模型或 Schema 检查不绑定到本节点。

### v3 覆盖缺口与受阻消费者

- AR3-G1：契约/节点候选和源码缺失；模型 runtime 的真实工具 lookup/报告链尚不能验收。主线接受与相应实施者负责。
- AR3-G2：AE4 S-6/C12 与 E-11、runtime S-66 已区分角色配方与 PRE-3 当前资格；真实 memberships 同一 unit 读取、调用核权与撤销/未知分支仍未实现验收。S-20 现读与 S-24 捕获不得被一个隐含统一 getter 混掉。
- AR3-G3/G4：S-16/S-23/S-24/S-31/S-50.5/6 的已确认 C16 invalidInput→依赖 unavailable 映射已落定；VE-2/4/6 尚无行为证据。固定用途读取面、共享 AE 选版构件、真实正文/会话/工作区来源、可核实的失败原因交接和一致性接线仍归 source/AE4/本节点 owner；验收装配须演练 A1→B/A2、旧表/清单不动、refresh 无报告及通常二次失败对照，禁止修 holding/source。不把 runtime S-66 当前根接口可调用等同所有 registry 输入已具备。
- AR3-G5：MCP、自报、有效模式、meta 门分支沿原 G-6/G-7/G-9；缺席分支可实现，未具备的成功分支不可验收为通过。
- AR3-G6：真实 SQL 竞争、JSONL→SQL 顺序、崩溃重开、资源停止和有界诊断尚无，归真实提供者及 `apps/model-request-acceptance`。
- 旧 A-3/A-8、产品 G-3/G-14/G-17 继续保留；本节点新绑定 0，不接受或验证自己。

## v2 历史证据义务

契约侧的证据义务权威在 [`spec/capabilities/asset-registry/verification.md`](../../../../spec/capabilities/asset-registry/verification.md)：本版**不建形式工件**（[S-35](../../../../spec/capabilities/asset-registry/v2/contract.md#s-35-本版选用哪些形式工件)），证据全部是十二条规范场景与故障注入。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（清单头校验、条件追加、进程内队列不承担正确性）。**本节点尚未建包，一切未开始。**

## 证据义务

### 规范场景（十二条，全部未开始）

契约 verification 列每条的证据形式；本表只写**在本节点上**额外受阻于什么。**共同受阻**：装配清单接口已定（`capability.assembly-manifest` v2）、最小提供者节点 `assembly-manifest-store` 已立但尚未建包（本插件整批 `PENDING`）；据点读面没有接口契约也没有节点（design 缺口 A-2）——可做的最小形态是在验收装配里装清单的最小提供者、用标明「非产品行为」的替身顶上据点读面，那是「有前提：最小提供者、读面替身」的本节点测试，不是契约场景在产品装配里的通过。

| 场景 | 本节点上另外受阻于 | 状态 |
|---|---|---|
| [S-36](../../../../spec/capabilities/asset-registry/v2/contract.md#s-36-创建时填六张) 创建时填六张 | meta 门清单无家（契约 G-7）：「meta 门在 `tool` 表里且 `resident = true`」只能按求值给的常驻值断言；M34 那一支（过时的 `EvaluationRef` ⇒ `invalidInput{evaluationSuperseded}`）要两份六张表都来自同一个清单最小提供者（`given` 撞 `alreadyRecorded{record}`，assembly-manifest S-17 ⑦） | 未开始 |
| [S-37](../../../../spec/capabilities/asset-registry/v2/contract.md#s-37-reload-plugin-连带) reload-plugin 连带 | 「尝试中途 reload」一支（M35）：被顶替的那一份在内存里；另加一支——实例重启之后再读同一份报告，按装配清单那条记录现建（design 关键选择四），工作区提供的资产目录已改 ⇒ `unavailable` 而不是当前那一份 | 未开始 |
| [S-38](../../../../spec/capabilities/asset-registry/v2/contract.md#s-38-mcp-接入点连不上动作原位顶替) MCP 连不上，原位顶替 | MCP 桥（`packages/tools/mcp-bridge`，未建包）；另加一支 M37：桥把一个动作标成 `schema_unsupported` ⇒ 条目 `stand_in{for: schema_unsupported}`、同形 | 未开始 |
| [S-39](../../../../spec/capabilities/asset-registry/v2/contract.md#s-39-命令型服务报错之后命令不再可见) 命令型服务报错之后不再可见 | —— | 未开始 |
| [S-40](../../../../spec/capabilities/asset-registry/v2/contract.md#s-40-依赖缺失与恢复) 依赖缺失与恢复 | 提供者自报与有效运行模式没有读面（契约 G-6、G-9）：演练要替身 | 未开始 |
| [S-41](../../../../spec/capabilities/asset-registry/v2/contract.md#s-41-无权即不存在收回此刻起不存在再授予要等-reload) 无权即不存在 | 资产变化没有转发者（A-3）：「`onAssetChange` 之后」那一段要测试直接调 | 未开始 |
| [S-42](../../../../spec/capabilities/asset-registry/v2/contract.md#s-42-没人发-reload增删禁用不进来) 没人发 reload | —— | 未开始 |
| [S-43](../../../../spec/capabilities/asset-registry/v2/contract.md#s-43-重启之后重建) 重启之后重建 | 「逐条与重启之前相同」对断电不成立（design R-M7） | 未开始 |
| [S-44](../../../../spec/capabilities/asset-registry/v2/contract.md#s-44-依赖未解析与同名冲突) 依赖未解析与同名冲突 | —— | 未开始 |
| [S-45](../../../../spec/capabilities/asset-registry/v2/contract.md#s-45-不可用时明确失败) 不可用时明确失败 | 第 ③ 支（M32、M45）：求值替身以 `compositionCycle`／`categoryUnsupported` 失败 ⇒ 原样转交、不收成 `unavailable`；还要加一支：注入**求值模块抛出**，断言它是缺陷（原样上抛），不被收成 `unavailable` | 未开始 |
| [S-46](../../../../spec/capabilities/asset-registry/v2/contract.md#s-46-逐动作执行权限与接入点持有钉进报告) 逐动作执行权限钉进报告 | meta 门一支受阻于 G-7 | 未开始 |
| [S-47](../../../../spec/capabilities/asset-registry/v2/contract.md#s-47-别的运行的报告不能拿来-continue) 别的运行的报告不能拿来 continue | 尝试标识一支（M46）：报告带调用方交来的 `attempt`、缺席 ⇒ `invalidInput`；接收方按三者核对的那一半在 runner 与执行运行时 | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| N-1 | **实例交替时读得到旧实例在途的换表**（[关键选择二](design.md#关键选择)）：旧实例的 `reload` 在新实例建好缓存之后才追加成功；断言新实例的下一次 `lookup` 读到的是 reload 之后的表 | 演练：可控的清单替身让旧实例的追加挂住，期间让插件重跑，再放行 | 未开始 | 本节点 |
| N-2 | **两个写入者撞条件追加**：同一会话 `fill` 与 `reload(plugin)` 并发（两个实例、同一份清单），以及同一实例两次 `reload(skill)` 并发（队列关掉）。断言清单里一条接一条、没有半截、多表那一次整批成立、后到者按清单重做而不是覆盖 | **真并发**演练 | 未开始；受阻于装配清单最小提供者节点尚无（接口 `capability.assembly-manifest/v2#S-12` 已定） | 本节点 ＋ 装配清单提供者（互指 R-M1） |
| N-3 | 条件追加连续两次冲突 ⇒ `unavailable`，缓存与清单都不留这一次 | 故障注入 | 未开始 | 本节点 |
| N-4 | `fill` 回执丢了的重试：同一个 `EvaluationRef` 再 `fill` ⇒ 原样返回、清单不多一条（R-M2）；此后有过 `markFailed`（只改 `slash_command` 一张、`basedOn` 沿用）再拿旧的 `EvaluationRef` `fill` ⇒ `invalidInput{evaluationSuperseded}`——判据取「六份任一 `filledBy ≠ assembly` 或 `basedOn` 已变」的最严一读（N-21） | 演练 | 未开始 | 本节点 |
| N-5 | 同一毫秒里连续两次换表，`filledAt` 严格递增（A-4） | 单元测试，可控时间替身 | 未开始 | 本节点 |
| N-6 | 撤除之后到达的调用答 `unavailable`；在途调用跑完、按它那一次追加收场 | 演练 | 未开始 | 本节点 |
| N-7 | 静态检查：本包不 `emit`、不监听事件；不 inject `storage`；求值只经 `core/asset-evaluation` 的公开入口 import，本包内没有第二份求值；**本包不自组 `BodyContracts`**，asset-model 判定对象只用 `core/asset-evaluation` 导出的 `defaultBodyContracts` 构造（M51） | 结构检查（`tools/ts-checks` 的规则，候选），带「故意违反就失败」的自测 | 未开始 | 本节点 ＋ ts-checks owner |
| N-8 | `provide` 由 effect 纳管（kernel-basis probe `provide-is-effect-managed`）升格为 basis 条目 | basis 升格 | 未开始（**待核对主张**） | `core/kernel-basis` owner |
| N-9 | **被顶替快照的留存**（[关键选择四](design.md#关键选择)）：一次尝试里接连两次 reload（内存只留上一份）⇒ 那一次尝试的读仍按它的报告所依的那一份，按装配清单记录现建；装配清单删了那条历史记录 ⇒ `unavailable`（R-M9 的反例） | 演练（前一支用清单最小提供者；「删了」那一支用按 `capability.assembly-manifest` v2 行为、另开删除口的测试替身——最小提供者本版不删，S-24） | 未开始 | 本节点 ＋ 装配清单提供者（互指 R-M9） |
| N-10 | **公开函数面**（[design 的公开面](design.md#公开面)）：四个函数不装 Cordis、不给清单与时钟即可调；`buildSnapshots` 撞名得 `toolNameConflict`；`computeAvailability` 读数缺一项即那一项「读不到」；`findInSnapshot` 只在给定那一份里找——**反证**：函数层不判「这一份是不是报告所依那一份」，那是服务面的事 | 单元测试 | 未开始 | 本节点；有实现即可跑 |

## 实际执行

**无。**本节点没有源码；契约本版没有形式任务。

## 覆盖缺口

- **全部条款没有任何实现证据**：源码、测试、集成运行都不存在。
- **整批受阻**：装配清单（A-1，对应契约 G-1；接口已定、最小提供者节点 `assembly-manifest-store` 已立、尚未建包、本版只进验收装配）与据点读面（A-2，接口未立）都没有提供者——本插件在清单的提供者装上之前不会进入 `ACTIVE`。受阻消费者：执行运行时的 `submit`、agent loop 的尝试开始（无节点）、`Tools()`／`Skills()`、斜杠命令识别、MCP 桥的接入点持有来源。
- **原先契约内部对不上的两处**（A-5、A-6）已随修复波 3 定下（M34、M35），证据义务落在 S-36、S-37 的新支与 N-4、N-9。装配清单与据点读面按 M43 本程不补。
- **契约 G-6 在本批的后果**：凡声明了外部服务、设施、存储或模态项的工具与技能一律是替换件——S-40 只能用替身演练，真实装配里可用的工具只有「没有这些项」的那几件。
- **不绑形式结论**：契约没有形式工件；[bindings](bindings.yaml) 为空。
- **契约 S-31 右列（协议须给）**本节点一条都不兑现；跨进程逐行重开（契约 G-11）。

## 独立评审

2026-09-25 本节点随 N3 批（`tools` 三节点）经一次独立的架构评审（只读结构核对，无运行）：本节点建议 1、观察 1，无阻断、无应修；另有 N1 批（`core` 纯模块）的一条建议落到本节点。主线据此裁定 [D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M51 并处置 AR-1（批的结论见同节 N-28）。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| AR-1（建议） | `slash_command` 的 `lookup`／`list` 每次现跑一次完整求值，交付面命令识别的频率乘以这份代价；节点已按契约 S-25 ⑦ 不加无测量的缓存并登 A-8 | 不改设计；A-8 加「G5 放行后第一轮测量排入」 | design.md 缺口 A-8 |
| AR-2（观察） | `refreshAvailability` 逐接入点串行调桥，尝试开始的时长上界是接入点数 × `connectTimeout` | 不作发现；design 已写「接入点多了再议」 | —— |
| N1 建议 3（落到本节点） | `BodyContracts` 有三处组合根（资产治理插件体、本注册表插件体、`core/asset-evaluation` 加载时），S-27「同一值在每个接收边界得同一个拒绝值」要三处组合逐一相同，而没有检查 | 按 M51：只 import `core/asset-evaluation` 导出的 `defaultBodyContracts`，不自组 | design.md 实现路径表「正文端口的组合根」行；README；本页 N-7 |
| 转 spec-reviewer（表达） | 本页义务表 N-9 排在 N-4 与 N-5 之间 | 顺手移到 N-8 之后，内容不变 | 本页证据义务表 |

## 修订波（2026-09-25 公开面）

依据：[D-063](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1、R-2，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)，[D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-37 ③。契约侧（本契约 S-13 改 `$ref`、G-1／A-1 改指 manifest）由规格侧并行落，本节点只引条款号。**处置不等于接受或评审闭合。**

| 事项 | 依据 | 处置 | 落点 |
| --- | --- | --- | --- |
| 公开面 | SYS-OPEN；D-063 R-2 | 新开「公开面」一节：四个纯函数公开，服务面组合；函数层不承诺的运行时不变量逐条列出 | design.md「公开面」；README 公开面一条；本页 N-10 |
| 装配清单接线 | D-063 R-1；`capability.assembly-manifest` v2 | 必需 inject 的服务键 `assemblyManifest` 不变、改指接口契约；R-M1～R-M9 加「接口契约兑现条款」一列；清单失败值逐一映射；A-1 改写为「接口已定、真承接者未到」 | design.md 插件边界、关键选择一与三、S-18 行、依赖表、要求清单、失败值对应、A-1、归装配；README；本页共同受阻、N-2、N-9、S-36 行 |
| `EvaluationRef` 权威 | N-37 ③ | S-13 行改为引用 `capability.assembly-manifest/v2#S-8`；`fill`／`reload`／收窄三种追加分别用 `given`／`mint`／`reuse` | design.md S-13 行 |
| 会话事实的租户那一片 | M48；`capability.session-tenancy` v2 S-8 | S-16 行与依赖表写明它与 `sessionTenancy` 同一读面，其余几片仍归 A-2 | design.md S-16 行、依赖表 |
| 写入方记下的 `content` 形状 | 起草时推导；assembly-manifest G-4 | 报主线：派发器与模型请求运行时从本节点写下的记录里取值，读法未约定 | design.md「报给主线」 |
| 最小提供者节点互指（主线 2026-09-25） | `packages/assets/assembly-manifest-store`（candidate）「会话资产注册表的要求（R-M1～R-M9）的承接」 | R-M 引导段、A-1、关键选择表、归装配、装配给表改为「真承接者未到，最小提供者节点 `assembly-manifest-store` 已立（candidate）」，两边互指 | design.md 各处；README；本页共同受阻、覆盖缺口 |

## 原完整 fill 来源认回补充（候选）

本段独立对应 [v3-original-fill-source.md](v3-original-fill-source.md)，不改变上文或已采用 v3-design 的状态。AR3/MF3/AE4 已接受事实沿 catalog；本补充未采用。D-077 EIS SI-G1 保持开放，**OF-G1/2 缺公共定位及本次 head 关联，停止完整恢复接线**。0 新 bindings；以下均未执行，不以走查或独立技术组件测试报告整链通过。

| 编号、条款、投影 | 可失败验收与负控 | owner／前置 | 状态 |
| --- | --- | --- | --- |
| OF-V1：AR3 S-22/S-48，AE4 S-47；OF-1 | 真实完整 given 记录提取唯一根 asset/version，超出安全整数的合法版本无损；错会话、mint/reuse、非 assembly、缺六表、缺/重复根项、坏 E/O 拒绝。故意接受任意 E 便交“当前来源”的变异须失败；纯函数不读 IO | registry/core；纯提取可独立实现，不证明给定记录当前或来源真实 | 未执行 |
| OF-V2：MF3 S-16，AR3 S-22④；OF-2 | 初次 fill 后重开；依次 reload 五类，尚存一类合法 assembly 时从同一 readHead 认回原 given。新 full fill 覆盖全部六类后必须认新记录；同 seq/ref 内容冲突不得择一 | registry/MF/真实输入源；真实给定记录与 head | 未执行 |
| OF-V3：MF3 S-16/S-18/S-33；OF-X1、OF-2 | 按两段 H1/H2 历史重放，六类全 reload 后重开；可见尾部按 opaque 等价关系一致，但目标 full fill 不同。现有受限读者必须明确不能认回，零 EIS 固定读；负控用 latest E、最小/最大表时刻或解析 ref 宣称恢复须失败 | registry/MF；按稿中步骤形成真实历史，不能预先给恢复者隐藏 locator | 未执行；通用成功恢复受 OF-G1 阻断 |
| OF-V4：MF3 S-9/S-18/S-24，AR3 S-22⑦/S-33；OF-3 | 可信 category/filledAt 可读旧原记录，但新 full fill 后旧 locator 不得证明当前。reuse 的时刻不得拿来定位 given；旧 fill 重试被 evaluationSuperseded 拒绝，不能用 append 当猜 ref 的只读查询 | registry/MF；全部断言检查零意外追加、头/历史未变 | 未执行 |
| OF-V5：AR3 S-23/S-24/S-31/S-50.5；OF-4、OF-X2 | A/v1→完整 fill A/v2→六类 reload→重开；creation source 不得供固定读。owner 补公共定位后才执行原 given→EIS 真固定正文→实际 evaluate/操作；根来源缺失时无新报告、无默认根 | registry/MF/EIS/验收装配；公共契约采用与真实 producer | 未执行；成功链受 OF-G1/2 阻断 |
| OF-V6：AR3 S-16/S-23/S-24/S-50；OF-4 | 原来源确证后 current 改 B 或 A/v2，实际 selector/evaluate 确认 C16，registry unavailable、旧表/清单不动、无新报告；普通二次求值读不到分支保留。移除来源核实、改 pinned 或伪造旧持有的负控失败 | registry/EIS/AE4；承接既有 VE-4/6，不重复冒领 | 未执行 |
| OF-V7：MF3 S-12/S-17，AR3 S-17/S-22/S-23；OF-5 | 两真实实例：旧 reload 持 h/F1，F2 full fill 先提交，旧 append 必 headMismatch。重做若只更新 expectedHead、不重新认来源/取源/求值必须失败；关闭实例队列仍由共享 manifest 行排序 | registry/MF/storage；来源重做读面须先补齐 | 未执行；完整重做受 OF-G1/2 阻断 |
| OF-V8：AR3 S-24/S-31，MF3 S-16，EIS SI-2/3；并发交接 | 暂停在原记录读取、EIS 源快照读取、头复核三处，分别插入 full fill、局部 reload、reuse、EIS 发布；不能把不同 head 的记录/表拼接，不能称 MF 与源同提交。公开边界确定后核真实返回适用范围；移除 head 关联的负控须失败 | AR/MF/EIS owner 先补 OF-G2；验收装配注入调度并观测实际存储 | 未执行；依赖设计停止 |
| OF-V9：AR3 S-22/S-48，MF3 S-13/S-17/S-22，SLog2 S-3/S-13 | given 成功前、提交后回执前、重开前注入故障；有原请求时幂等认回，无 locator 时明确失败。负控新增 JSONL locator 双写：SQL 后崩溃、JSONL 先成功但 SQL 失败均须被“不存在共同提交”断言暴露，不当正式实现 | registry/MF/验收装配；不新增 MS2 载荷或 EIS 表来让场景通过 | 未执行 |
| OF-V10：AR3 S-31～S-33；装卸与观测 | 真宿主更换 provider、旧实例在途读取/追加结束，旧引用不提供猜测来源；无未归属 Promise、未等真实结束就关存储、正文/配值泄漏。诊断失效不改变已经提交的给定记录 | registry/MF/EIS/验收装配；沿已采用生命周期与有界策略 | 未执行 |

OF-G1 最小缺口归 MF 契约 owner：公开固定 head 范围内最后 given 的不可变记录及关联；AR owner 核它是完整 assembly 并采用。OF-G2 归 AR owner：本次操作所依完整 fill、表与源的观察范围/并发重做，不能在 app 胶水暗定。MS2/SLog2 没有已定义的装配来源载荷或跨 manifest 提交关系，不能借 opaque JSON 补齐。完整重开与重新装配验收在这些缺口关闭并产生 OF-V 实际证据前保持受阻；本段不修改旧 bindings，也不接受本稿。

## v4 完整增量的证据义务

对应 [v4-design.md](v4-design.md) 的 AR4-1～7 与 [AR4 S-51/S-52](../../../../spec/capabilities/asset-registry/v4/contract.md#s-51-原完整填表来源与本次表头的关联)。D-079 已接受 AR4/MF4/MF4 provider，本节点新稿未采用、尚未建包。**本段全部未执行，0 新 bindings**；旧 S-36～S-47、N、VE、OF 的历史义务保留，不批量提升状态。旧 OF-V8 的候选末尾头复核不带入本版：refresh 固定 H，不要求最后仍是最新头。

共同真实前置：实际文件型存储、MF4 六操作、真实 STT/当前 OG 资格、EIS 本地发布/capture/fixed-root 公共面、同一 AE4/正文判定制品、真实公开 evaluate 和 caller 显式 O。输入 fixture 可以作坏值负控，不能作成功链的来源。存储 owner 的独立事务测试、EIS 45 项及 MF3 45 项组件检查只能覆盖各自原范围；本段须亲自观察跨边界行为。

| 编号／条款／投影 | 可失败验收和负控 | owner／额外前置 | 状态 |
| --- | --- | --- | --- |
| V4-1：S-22/S-48/S-49，AR4-1 | 真发布/捕获→真 evaluate→显式 O→fill；清单恰一 given、六表含空类、content 恰三槽且完整 E/O，无 input/占位 ref。换 E 的集合编码不换表次序；O 缺席/重复/遗漏/额外/含根在追加前拒绝。真实生产计数不能被 typed E fixture 代替 | registry/AE4/EIS/app；真实根正文 producer 和表正文 | 未执行 |
| V4-2：S-23/S-27/S-28/S-48/S-50，AR4-1/2/5 | reload 只换目标，plugin 按旧新成员同次换连带；真实权限收回/markFailed 只缩 slash_command，保留原 E/O/ref/相对次序，其他五表不动。以删 O、重 evaluate 后写 E、自动加入新授予条目为负控。重复收窄零追加 | registry/MF/源；plugin/MCP/正文未具备成功分支须显式待验，不能 mock 成产品通过 | 未执行 |
| V4-3：S-51.1～3/S-52.1，AR4-2 | A/v1 真 full fill→逐类六次 reload→可选 reuse→销毁 registry/MF 并重开，从公共 readHead/readGiven 认原 given，精确提根→EIS 真读原正文→reload 和 refresh 成功。故意移除 readGiven、用 latest E/creation/内存预置根/猜 ref 的变异须失败 | registry/MF4/EIS/真实 storage；MF MG-V11 互验，含公开调用轨迹 | 未执行 |
| V4-4：S-51/S-52.2/6，AR4-2/6 | 完整 fill A/v2 再六类全换、重开，必须认新 given；另做 E/O/根值完全相同但 ref/seq 不同的两次 full fill，仍认最后提交身份。F/E0→tool E2→旧表 reuse E0 后三读分别是表 E0、readEvaluation E2、readGiven F；重开保持 | registry/MF/EIS；不能解析 opaque ref 或比较根值选来源 | 未执行 |
| V4-5：S-51.2/6/S-52.5，AR4-2 | 有表无 given、最新 given 非 assembly、mint 冒充、缺/多类、非完整构成、坏 E/O、根缺/重复、跨 session、ref 不符、seq>H、坏无损值、读取失败，均 unavailable、后续 fixed-root/evaluate/append/report 为零。H=0 确认无装配仍 sessionNotFound；坏最新不回退旧合法 | registry/MF；合法 MF JSON 负例要经实际 append；结构损坏在隔离故障库注入，不冒称合规写者可生成 | 未执行 |
| V4-6：S-16/S-23/S-24/S-50.5/6/S-51.6，AR4-2/3 | 真源 A1 fill 后 actual current 改 B 或 A2，固定根不变，EIS 真 selector/evaluate 产生 C16；reload/refresh start/continue 均 unavailable，无表/头变化、无报告。root 保持而角色变化分别验证 reload 当前角色、refresh 捕获角色，两者实际资格撤销/未知仍拒绝。invalid O 表示、缺 attempt/错报告优先；cycle/unsupported 原样转交，通常第二求值不可读作对照 | EIS/AE4/registry/app；不得仅注入 failure 字符串、改 pinned 或伪造旧 holding | 未执行 |
| V4-7：S-17/S-23/S-51.4/S-52.4，AR4-2/6 | 两真实实例停在 H/F1 后，F2 full fill 提交 H+1，旧 reload append 零写 headMismatch；重做须新 readHead/readGiven/input/evaluate/目标表，caller O 再核。只换 expectedHead、旧 source/E 复用、自动修 O 的三种变异均被断言拒绝。关实例队列再跑；策略耗尽明确失败 | registry/MF/storage；共享真实哨兵/parent，显式可控调度与有界策略 | 未执行 |
| V4-8：S-24/S-51.5/S-52.3，AR4-3/6 | refresh 固定 H 表后并发 H+1 full fill/reload/reuse，再 readGiven(H) 与 EIS。根未漂移支成功、报告无 head 字段、历史 lookup/list 只见 H；根漂移支真实 C16 整个失败。末尾强制读新头重启、H 表配新 given、途中换新表的变异失败。EIS 自己的发布另排交错，报告不冒称 MF/EIS 同快照 | registry/MF/EIS；不靠“没有竞争”绕过旧观察点 | 未执行 |
| V4-9：S-25/S-26/S-33/S-34/S-48.6，AR4-4/5/6 | 保存真实报告，换表多次并让旧资产不再被当前持有，关闭/重开 registry 后从 MF history＋真实受限 historicalBody 读原版本成功；新正文不得进旧报告。缺原版本/源不可读时 unavailable，不换当前表。tool ModelToolName、动作并入、slash 现读、skill/run 钉门分别断言；报告自身丢失仍沿原 start 例外，不伪造持久报告 | source/EIS/registry/app；**AR4-G3 窄源设计/采用及 IO 必须完成**。拒绝分支通过不能替代成功恢复 | 未执行，成功链受 AR4-G3 阻断 |
| V4-10：S-17/S-18/S-22⑦/S-27/S-48.5，AR4-1/5/6 | parent/table 故障整批回滚、不提前发布；提交后回执丢失/进程退出，given 原请求认回或 superseded；mint/reuse 未知不自动重发、后续对头保留真实已写事实。两会话同 ref 至多一成功。日志失败不调 markFailed，日志成功后 MF 失败/崩溃不撤销日志 | MF MG-V7/8、registry/sessionLog/app；真实文件库/故障边界，不把中止等待当回滚 | 未执行 |
| V4-11：S-8～S-12/S-24/S-29/S-30，AR4-3/7 | first E→技能门控→工具/技能依赖→桥→第二 E 的顺序；无动作集不多求值，second 通常失败非 meta 项 unavailable、meta 有真实部署来源才 auto；失持有接入点零桥调用/零动作，单项依赖缺失只影响该项；名字冲突、替换件同形、命令开关、零业务事件/提醒 | bridge/源/meta/可用性 owner/registry；缺成功依赖的项仍未验，不能用全空集合宣称完整覆盖 | 未执行 |
| V4-12：S-6/S-19/S-25/S-31/S-48/S-51，AR4-4/7 | 跨租户/错 session/report/table-bound source 拒绝，读取他方正文次数零；当前资格失效时 historicalBody 不交正文，但“已不持有”且来源/权限合法的旧表仍成功。对参数/依赖回值/返回报告做深层修改不影响后续；大版号/精确小数、布尔数字、对象重排/数组次序保真 | STT/OG/EIS/source/registry；真实 tenant mapping，严格 JSON/BodyContracts | 未执行 |
| V4-13：S-31～S-33，AR4-6/7 | 真 Cordis 4.0.4 缺必需依赖 PENDING；provider 换代旧调用晚提交、新实例下次读能见新头，旧缓存不污染新实例；同实例低 H 构建晚到不覆盖高 H。close 前后调用、排队/读取/追加/故障各支 Promise 有归属，真实完成后才 close 源/storage，借用者不提前关资源 | registry/MF/EIS/clock/宿主/app；补 provide 纳管实际核对，不以 fiber dispose 代证事务终结 | 未执行 |
| V4-14：S-31/S-51 与 SYS-OPEN，AR4-1～7 | 纯构件不用 Cordis/storage 可取用；完整制品导出七操作闭包/技术 close；禁止 registry 私表 import、EIS fixed-root/historicalBody 向 runtime/adapter/tool 转导出或别名旁路、第二份 evaluate/BodyContracts、自动 O 生成/输入 fixture 生产。每条结构 guard 有故意违反即失败的负控 | registry/source/ts-checks；受限历史端口采用后更新精确合法消费者 | 未执行 |
| V4-15：S-52 及全局观测，AR4-7 | 同真实动作的日志/trace 能关联 H/given/source revision/阶段/提交已知或未知、实际资源结束；sink 拒绝/异常/有界饱和不改业务事实或吞缺陷。秘密/正文/E/O canary 不出现在产物；记录源读取、双次纯 evaluate、表重建/追加耗时和规模，不伪 SQL 获锁或未测阈值 | registry/MF/EIS/app/observability owner；端口尺寸/容量/保留显式配置，独立故障通道 | 未执行 |

### v4 覆盖缺口与证据范围

- AR4-G1/2：规范缺口已有 D-079，provider 采用与实现/组合证据仍缺；受阻 reload/refresh 原来源认回、runtime 前置报告。MF 只证给定记录，不证 AR 用途及 EIS 读取权。
- AR4-G3：历史正文的受限来源接口归 EIS/source owner 起草并采用，registry/app 负责表与报告证明、接线与恢复验收。**旧报告＋已不持有旧表正文成功恢复是本批交付条件**；unavailable 只能验证缺源的安全后果，不能结束此项工作。
- AR4-G4/5：workspace/shared/MCP、有效模式/自报/meta、产品通知转发、PF-004 完整装配触发及报告跨崩溃沿原 owner；未具备成功分支不得标通过。源为空必须是实际未配置的事实。
- AR4-G6：真实存储交错、未知回执、真 Cordis/close、制品边界及有界诊断尚无本节点运行证据；文档检查、纯枚举、测试替身不能替代。全局形式工件范围沿 S-35/S-52，不新建无法失败的绑定。
- 本段不更改旧绑定或其 assumptions；节点新增绑定始终为 0，直到主线取得有稳定名字且能否定错误实现的真实证据。

V4-9/12/13/14 的 source 接线对应尚待采用的 [EIS 历史正文候选增量](../../assets/evaluation-input-store/v4-history-source-interfaces.md)，SHA-256 `9313dcbe4788f4e72b1be13b05b109d55f7d5aa70d928e24927af49bc9e584a0`，候选入口为 `./registry-history`／`createRegistryHistoryReader`。真实执行轨迹必须是：技术表示校验／实例准入 → 真实 STT 核 tenant，不符／未知／不可读时零 MF IO → 真实 MF4 readHistory 回读请求三元定位并核原表 capability/asset/精确 version 元组 → 同一 EIS atomic 内当前 OG 资格与版本读取 → atomic 实际结束后的严格 JSON／AM3 judge／BodyContracts 纯判定。增加“错误 tenant 却先调用 MF”“假常量 readHistory”“只信请求元组”“从当前持有选择旧正文”“MF 换代后复用关闭 reader”的负控；均须失败，并核参与异常先越过真实 atomic 终结再映射。AR 对报告/H/full E/O/filledBy/reuse 的核验仍独立存在，不以 source 回读替代，也不声称 MF/EIS 共同事务。装配构造/close、registry 借用 read 的逐 symbol 权限须做制品/AST 检查；本段明确责任仍不等于接口采用或 IO 实现，旧报告及已不持有旧表正文的成功恢复继续受 AR4-G3 停止线约束。
