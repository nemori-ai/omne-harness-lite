# Asset evaluation behavior

Public shapes belong to `src/index.ts`. This page owns the pure evaluation, root selection, result reading, and tool-environment behavior. Input production and IO belong to their actual providers, including evaluation-input-store. Evaluation does not grant tenant authorization or prove that supplied facts are true.

## 输入、选用与展开

所有输入显式给出；算法不读文件、存储、时钟或进程身份。同输入、同正文规则可确定重放，没有在途工作。先核身份／版本／持有／配值／根来源的一致性，再业务计算；失败次序 invalidInput→compositionCycle→categoryUnsupported，失败没有部分 EffectiveAssembly。正文规则缺席／缺陷不能假装空正文。成功中的 unresolved 是明确缺引用；真实装配必须拒绝非空 unresolved，不能悄悄少装。

各成员先沿公开类型及其数据拥有者校验形状／闭合枚举。下列跨成员条件任一不满足即 invalidInput，零结果；不将坏输入换成默认或空结果：

| 条件 | 输入要求 |
| --- | --- |
| C1/2 | 形状及判别式合法；root.definition 类别恰 agent_definition |
| C3 | 每份持有属于本次 factory、tenant 所在 organization、本 tenant 或显式 workspace；workspace.tenant=tenant，没 workspace 不得有工作区持有 |
| C4/5 | 每层每能力至多一持有、持有每项至多一配值；所指 asset 在 definitions 恰有一份且能力一致 |
| C6/7 | factory 只持 official 且无配值；任何指向 official 的持有都不得 disabled=true |
| C8 | 工作区资产不得同时被其他层持有；这是当前 carrier 表示／求值未接全的边界，不是禁止产品支持工作区为外层资产配设置 |
| C9 | 除 workspace 外，每份在效持有自己的 versionSelection 须确定一个已发布版本；各自版本用于解释各自权限声明，不仅核生效那份 |
| C10 | 实际参与配值合所持选用正文声明域；session 取生效声明，设置合 schema、权限集合是枚举子集；域外不修默认 |
| C11/12 | session 配值含能力且每(能力,项)唯一；standing 必为 effective 并带角色，来源与当前核权仍归生产者 |
| C13 | 每 MCP 动作集类别 mcp、对应 scope 真实存在同 endpoint 持有、(endpoint,scope)唯一、actions 为 fetched；not_fetched 不是空动作集 |
| C14 | root.references 每能力唯一，resident 只用于 tool/skill 引用 |
| C15 | 根声明 item 唯一且只取 first_token_wait_limit/post_first_token_stall_limit（setting/preference，显式正有限 Duration default）及 model（setting/binding，显式合法 RouteName default）；规范域／类别／种类均合 agent-definition，不带未知 root/source 成员 |
| C16 | 根存在时 source.asset/version 恰为选根结果；根缺失不由 source 补资产，也不因这一缺失拒绝合法输入，仍 unresolved |

cycle 诊断给闭环能力序列；多个环的选择／起写位置不承载业务含义。多个不支持类别的诊断选择同样只供说明，不据诊断顺序比较重放。失败种类及所有有含义结果确定。

先禁用，再判 usableBy，再取最具体持有，受最外起作用的替换锁截断。禁用取组织／租户同资产标识及工作区自产资产的析取。官方件不禁用、不参与 usableBy，是可信部署给齐后的下界。被过滤持有的锁不截断；锁以内同资产持有仍可配值，异资产持有不能替换。custom 的 self 是作者租户身份，跨 TenantId 的同一自然人不是 self；工作区作者取其会话租户。资格判定先于锁，不把外部服务可用性混入谁可用。

工作区提供的 stdio MCP 和 command 型 loop_extension 默认禁用；当前缺租户显式启用表示／写面，闭合前恒禁用，不凭工作区的“否”放行。usableBy 的参与者只取已过禁用的 organization/tenant 同能力持有（不论指向何资产）和 session 配值，不看稍后才裁决的替换锁；每候选资产以其默认 self 作 factory 挑选，工作区资产用 self 界且无 factory 挑选，指向同一资产同进同退。角色在允许集合中，或 self 在允许集合且指向当前 tenant，才可用；未通过记 not_usable。每个组合成员输出当时判定的 usableBy，official 也输出但不拿它过滤；根不输出。已开始 run 保原结果、重求时机及即时斜杠命令门控由消费者负责。

组合只从生效根引用展开，根不进 composition。普通设置／权限不创造动作；usableBy 和将来 plugin 启用设置是早期选用例外。沿引用走回已在路径的能力标识为组合环，失败并指出环；仅 Skill↔Tool 允许互引那对边的来回不算环，可达集合照常求。Skill tools 同时是组合引用和必需依赖，不能因不算环而略过 Tool。实际可达的有效 plugin／非根 agent_definition 缺真实正文规则才 categoryUnsupported；未引用、被过滤或缺持有不因此失败，不把 sub-agent 当无引用或 plugin 当全启用。当前采用不包含 Connector 正文求值；不据类型存在扩成全类别支持。

项存在性来自选用正文，不由配值创造。disabled 是持有治理项，不进 values。MCP 逐动作项只由生效持有本次钉住的动作集推出；缺动作集不是明确空集。execute: 前缀识别执行权限种类。

## 设置、权限与工作区

设置按具体生效资产取值，异资产持有不能给其配值，防止凭据跟到同名替换件；会话按项给值。层序 factory/organization/tenant/workspace/session。最外 immutable 设置先截断，无锁取最内配值再到声明默认；无值则缺席，不补值。外层旧实现的设置锁不跟随替换件；防替换靠 holding 锁。

权限按能力标识跨实现；各持有格仅参与自己所持选用版本将该项声明为 permission 的配值；MCP execute: 项按项名直接认执行权限，不要求该格动作集在场，外层同名界不因此丢失。immutable 配值及 execute 恰 `{forbid}` 配值是界，声明默认 forbid 仍是挑选。界与挑选互斥，以生效声明域与各界交成 X；由内向外取 P={} 或 P∩X 非空的第一挑选，值为 P∩X。空挑选即使交集空也必须选中；其他不相交挑选跳过。无挑选落界时，分档权限取界中离最具体挑选最近的一档，等距取严；空界为空，其他权限返回界。工作区资产无挑选，直接取界。execute 档序 auto→ask→forbid，干预力 veto→rewrite→observe，含 observe 的受限子集仍分档。选中挑选时 from 为该层；未选中时 from 为最内界层，无界 factory。lockedAt 为最外界层，无界缺席；工作区最严 factory 界不算锁。公开 permission helpers 与 evaluate 共用此算法。

被替换、被 not_usable 滤掉但未禁用且不在外锁内异资产的持有仍在效，其权限界继续约束同标识替换件；禁用或 locked_below 持有不参与。替换件未声明的权限项，仅严格外于生效资产 from 的在效界继续约束；同层／更内界不能创造该项。按原种类最严值与这些界交集仍出现，表外或种类冲突为空；from/lockedAt 为所参与界的来源，不看普通挑选。普通挑选不能创造替换件未声明项。

工作区不贡献权限、落点／身份或治理设置，自产 disabled 除外；丢弃留下对应 FilterReason/DropReason。读 carrier 时能判断的 immutable／未知资产先丢，须正文属性分类的项在求值阶段过滤，不重复丢、不吞掉。工作区资产忽略作者权限默认挑选：工厂执行界 ask、干预界 observe、usableBy 为会话租户 self，表外权限为空。这不允许工作区自行放宽。

每份持有都可解释为过滤、替换或选用，不漏项；同有效资产的内层配值保留。官方件不伪造普通滤除项。readWorkspaceCarrier 是纯值读入，要求显式完整列表，不把缺失作空，不扫描文件；重复／非法身份拒绝。工作区身份确定派生，不碰其他资产身份。since/assign-since 由实际读文件者填同一观察时刻，算法不取 clock；此 reader 不代证完整工作区发现协议。

resident 只从根引用／组合规则中适用 tool/skill 标记来；将来 plugin 常驻未知，不补 false。部署 meta 常驻／身份来自可信部署，发布者不能自封。provenance 只用于落点／身份类设置；声明默认 from=factory 不证明官方持有，来源持有和 from 含义不同，都不是授权证明。

根引用上的 resident 优先于 plugin 成员标记；确实无标记且组合无 plugin 时 false。plugin 标记互冲当前未定且该分支尚不可达；不得把不可读标记当无标记。provenance 对落点／身份设置必带：from=factory 时等于 EffectiveAsset.from，否则等于 from；其他设置和全部权限不带。

tenantAutoWritable 仅标执行权限：资产有实际声明、非 workspace，组织层按项名对齐的界容许 auto（无论该持有是否在效、指向何资产），租户该项未锁，已有租户持有须在效且指向生效资产。MCP 逐动作写面尚缺则 false。此位不改权限、不授权、不建持有；实际调用仍现读守卫。

## 根、值读与重放身份

根的受限声明来自实际选用的不可变正文，attributes/references/source 一体；source 的 asset/version 必须等于选根结果。相同版本标签不证明内容真实。根可见时投影属性但不进组合；缺根不补默认或空锁。换版必须重读实际正文，不能仅贴新版本。selectEvaluationRootSource 成功只核指认一致，不证明真实读取。

judgeEffectiveAssembly 严格无损 JSON，拒重复键，不先舍入／归一／修补。封闭 DTO 拒未知成员；任意用户 value 的合法对象保持开放。集合按语义身份唯一，数组关系不自动修复。composition 是 assets 子集且无 root；成功结果不含可达 plugin/sub-agent；values 只归组合成员或可见根。unresolved 目标不能同时生效，其父须根／组合成员；缺根时仅缺根记录且组合／值空。非空 unresolved 是合法 DTO，读取者不能因装配将拒绝而拒绝此值。

replaced/lockedAt 维持外层锁与截断关系，resident 只用于适用 tool/skill。工作区原因、官方下界、not_usable 与过滤／选用／替换关系一致；根声明域和执行权限固定元数据保留各自条件。值读不执行 evaluate，不证明正确计算、授权、新鲜或原正文真实。

公共结果值读还须精确保持下列可判关系；不能靠再次求值或读当前声明补齐：

| 位置 | 结果关系 |
| --- | --- |
| 唯一性 | assets/composition 按能力；values 按(能力,项)；filteredOut 按(能力,from,reason)；unresolved 按(能力,referencedBy 的缺席或精确身份)。同一目标由两个不同父引用可并存 |
| 层次 | replaced 各层严格外于 EffectiveAsset.from；lockedAt 不内于 from，replaced 还须严格外于 lockedAt |
| 常驻 | resident 恰在 composition 的 tool/skill 资产上必带，其他含仅持有者不带 |
| 过滤 | 三个 workspace_* reason 只来自 workspace；disabled/not_usable/locked_below 不能来自 factory，所记(能力,from)不能同时为生效或 replaced 层。locked_below 须有生效资产锁且被滤层严格内于锁层；过滤目标不必都有效 |
| 根固定项 | 只三项，出现的两时限是正有限 Duration，model 合 RouteName；不强制补齐。无 provenance/tenantAutoWritable，lockedAt 若在必须=from |
| usableBy | 每 composition 成员恰一项，PermissionValue 域为 superAdministrator/member/self，from 非 workspace，无两种专用元数据；根不得有此项 |
| provenance | from=factory 则=EffectiveAsset.from，否则=from；from 非 workspace，不兼 tenantAutoWritable |
| tenantAutoWritable | 只 tool/mcp 上的执行 PermissionValue，allowed 只 auto/ask/forbid，from 非 workspace；资产来自 workspace 时只能 false。mcp execute:<非空动作名> 必带且 false，不带 provenance |

任意 setting 对象有 allowed 成员不因此成为 PermissionValue。除固定项及已出现元数据之外，结果值读无法判断任意项种类／域／遗漏或元数据计算正确；这些仍由真实输入求值者兑现。

生产 Schema 和规则捕获为自有深冻结快照；默认判定 owner 首次实际使用时构造，成功复用，失败原抛且可重试。显式工厂和作者临时编译保持独立；不要求默认键是 provider 导出的同一对象引用。

evaluationInputFingerprint 覆盖 standing、workspace、会话配值、选版、动作集、根引用／属性／来源等完整输入；语义无序集合重排不改指纹。它不独自覆盖显式 options、正文策略修订或外部事实新鲜。默认 loop 正文的有限版本／声明支持不能推成完整 loop 产品支持。

## 外部事实前提

生产者须提供一次一致的持有／配值／定义／选版／资格输入，分享仍有效、关系起时满足确认口径，撤销不得复活旧持有。当前资格和授权另外核；TenantId/SessionRef/隔离标签不替代授权。官方件、部署 meta 和锁清单须真实给齐。workspace 真属于会话租户且已挂载，carrier 对应实际读内容。正文规则确定可重放且缺陷显露。MCP 动作副本为本次尝试实际钉住者。references/attributes/source 是同一实际选用不可变正文；C16 不证明此真实性。装配负责这些前提，不把 IO/授权搬进纯算法。

## Tool environment extension

AE-E1 `evaluate` with `EvaluationOptions` derives an executionEnvironment permission declaration from each applicable tool body through the tool-definition owner. The factory permission is explicit. Missing options do not invent a permission declaration. Invalid options reject the input before evaluation.

AE-E2 The new declaration uses the same existing bounds, picks, holding selection and workspace rules as other declarations. It does not add a permission tier order, turn never-allow into the unrelated execute.forbid token, or select one member from an unresolved allowed set. Consumers must reject permission results that cannot determine one environment decision.

AE-E3 The effective targetEnvironment remains a setting of the actually selected tool version. Declaration defaults do not substitute for complete evaluation. Input identity, source version and the explicit factory option all belong to a consumer's adopted revision; an input-only fingerprint does not cover a changed option.
