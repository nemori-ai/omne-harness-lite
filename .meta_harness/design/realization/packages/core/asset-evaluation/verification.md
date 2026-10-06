## v4 候选增量的证据义务

本节对应 [v4-design.md](v4-design.md) 的 AE4-1～AE4-8，2026-09-27 起草，未接受、未实现、未独立评审。新坐标为 `capability.asset-evaluation/v4`；以下只有应执行的义务，不能把下列 v3 历史结果重标为 v4 通过。

| 缺口与条款 | 必须能失败的验收方案 | 当前状态、owner 与受阻消费者 |
|---|---|---|
| **AE4-1**：S-6/S-7 C15、S-45；AD1 S-1～S-9 | 从真实 AD1 公开构件取得并校验声明；正确/错误类别、未知项、保留项、重复 item、缺 default、非法规范域、越域默认逐项拒绝。source 缺成员或未知成员不放行；根空属性合法；不得以任意等价 Schema 替代规范域。类型与运行值共同核对 | 未开始；本包与 agent-definition 纯节点 owner，主线负责精确接受。阻断 v4 的合法输入校验与制品采用 |
| **AE4-2**：S-7 C16、S-13/S-15 | 根 source 资产和版本分别失配时 invalidInput，覆盖 current/pinned 及换资产；与合法环/不支持类别叠加时仍优先 invalidInput；合法输入同时有环和不支持类别时 cycle 优先。三个失败均无半份结果 | 未开始；本包。阻断注册表信任 v4 求值结果 |
| **AE4-3**：S-20～S-24、S-45/S-46 E-9 | 生效根不在 composition，但声明恰进入 values；外层锁胜、无锁最内胜、默认回退；换具体资产不继承旧设置/锁；不可见根进 unresolved 且不产生根设置；attributes 空或少项不补项、不由配值造项；缺 model 不造选中模型 | 未开始；本包。阻断模型运行时消费根设置与锁 |
| **AE4-4**：S-11/S-15 ⑦/S-30；content-blocks/v3 S-24 | 独立制品调用无 Context/存储/时钟/网络/环境；严格无损值覆盖超安全整数版本、十进制、不透明合法成员、非 JSON 拒绝。逐项改变根 source/attributes/其他输入使缓存键区分不同输入；成员次序等既有指纹行为保持。调用方后续改对象与并行另一输入不改变已复制计算结果；Duration 不转成定时器数值 | 未开始；本包及消费缓存的 registry owner。阻断重放、隔离和可靠缓存结论；解析前重复键由文本接收边界另验 |
| **AE4-5**：S-16/S-23/S-27/S-28/S-33～S-44 | 新制品运行继承规范场景；既有权限函数与清单读入保持原语义；v3 显式入口以原输入运行，v4 不接受缺 attributes/source 的旧输入。真实 NonConnector 正文闭包、精确旧 Skill v2 端口与传递 Schema 离线消费；所有公开导出由独立包消费，拒绝私有路径。根和被引用 sub-agent 的正文均满足 AD1 窄模式时，后者仍须 categoryUnsupported | 未开始；本包和各未切换消费者。Connector 延期保持，不能仅跑新增用例就宣称原闭包未受影响 |
| **AE4-6**：S-29/PRE-9、S-45/S-46/G-22 | 从真实已发布正文读取两槽位及来源，经 AD1 通用/窄校验→evaluate→registry 提交→manifest readEvaluation，验证历史链；另从 runtime/v3 S-66 当前输入端口→evaluate→发前检查，验证新鲜链。换版重读；相同 source 但伪造声明应由生产者真实性检查识别，不能以 C16 冒充。合法空/缺任一时限结果可提交，但当前输入缺时限时 runtime 必须拒绝且 HTTP 发送计数为 0；readEvaluation 按现行 manifest/v3 S-33 读取固定头上界内最新 given/mint，不能因 reuse 沿旧表来源回退；历史合法结果不得遮蔽当前源读取失败、当前缺项或一致性竞争 | 未开始；`packages/assets/evaluation-input-store`、registry、assembly-manifest-store、runtime 与 `apps/model-request-acceptance`。阻断真实纵线验收，不阻断纯包起草；输入提供者节点尚未成稿、真实 IO 未验；runtime S-66 当前输入端口仍 candidate，不改本包纯计算边界 |
| **AE4-7**：S-8/S-47；manifest/v3 S-32 | 独立包调用候选 judgeEffectiveAssembly，执行 S-47/E-10 并逐一删除必需成员、损坏身份/正 version/层/枚举/布尔及集合唯一性；逐类 DTO 添加未知成员须 false，任意 value 对象增加合法用户成员仍 true。混合快照造成 composition 无 asset、同能力多版本、value 无生效资产、已生效目标又 unresolved 时 false；合法非空 unresolved、同目标多个父引用、集合重排仍 true。覆核 S-47 第 4～7 条的锁/替换/常驻、过滤关系、根与固定权限、已出现元数据反例。结构自洽的跨输入拼接不能以结果证真，由真实写入链核对。无损超安全整数/小数、非 JSON 及重复键接收反例；判定不改输入。manifest 真调用同一构件并将 false 映射既有 invalid_evaluation_content | 未开始；本包拥有共享值判定，manifest owner 消费；S-47 候选已明确未知成员拒绝边界，不再由本节点补政策。阻断持久 EffectiveAssembly 的完整读取验收；无新增 failure enum、IO 或 Schema |
| **AE4-8**：S-6/S-7 的第一步输入条件、S-17～S-19/S-39、C15/C16；AM3 S-9/S-18 | 独立制品消费者只交窄输入，不含 refs/attributes/source/动作集，覆盖官方根、组织/租户替换、禁用退回、usableBy/捕获角色、外层锁截断及同资产内层留下、current/pinned。选择结果与补入真实正文后的完整 evaluate 根资产/版本相同；删除保护/改锁优先级后比较应失败。没有生效根得 missing；缺定义、重复持有、错误租户、无效 standing、版本不存在得原 invalidInput，坏的非根持有也不得漏过；真实正文判定提供者缺席与明确缺根分开。经真实公开 ExactDecimal 构件区分 9007199254740992/9007199254740993、1e400/2e400，合法等值整数表示相等，不浮点化或展开天量零；AM3 连续版本线仍按原义拒坏，超大数值单测不冒充可实际构造的完整长版本线输入。input store 使用同一组件选来源，实际读取所选不可变正文后由完整 evaluate 检出错误 attributes/source；两者不得各自保存一份选择算法 | 未开始；本包负责共享选择与现有 call-accounts ExactDecimal 接入，input store 与验收装配验证真实 IO 交接及 PRE-3 效力前提。已定位 pinned 的 Number 转换但未修复；不新增规范 operation，技术结果不扩 evaluate 领域失败集合 |

**有限模型的边界**：[RootSettings 映射与 receipt 检查器](../../../../spec/capabilities/asset-evaluation/v4/formal/README.md) 的范围为 3 Cap、5 Holding、4 Assign、3 Item、3 Asset、2 Owner、2 Version、bitwidth 4。正配置检查根成员排除、可见根投影、缺根无设置、source 一致性、外层锁与最内配值；六个定点变异检查这些断言确会发现指定错误。版本选择算法、真实时长/RouteName 值、C15 完整拒绝器、PRE-9 内容真实、IO、提交与 runtime 零出网不在模型内。运行状态归[契约验证入口](../../../../spec/capabilities/asset-evaluation/verification.md)，本节点不增加 production binding，也不把继承 Evaluation.als 的原结果换标签。

**实现期间应记录的反例**：移除 C16 守卫应放行失配输入；忽略根投影应丢根设置；把根塞入 composition 应多一个成员；忽略根锁应误取会话值；复用旧资产声明应使换版/换资产用例失败。相应测试应观察公开结果，不仅断言内部辅助函数被调用。

### 本次文档检查

2026-09-27 在执行工作区运行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`；结果判定、S-47/runtime S-66 对齐，以及本次共享根选择与 ExactDecimal 投影补齐后，以同一命令检查，最终实际退出码 **0**。检查器结尾为 `PASS: design tree …/.meta_harness/design passed gate=internal; formal=skip.`；列出的全部 formal task 均明确显示 `skipped by explicit --formal skip`。这次只证明当前设计树通过内部结构/引用门，不宣称产品测试、模型重跑或独立评审。最后仅回填本条执行说明。

### v4 覆盖缺口

上述八项均未取得本节点 v4 实现证据，bindings 中新增条数为 0。结果拒绝边界已按 S-47 候选表达；精确接受、AD1 公开签名、结果判定/共享选择实现、精确版本比较及真实正文生产者仍未兑现。输入提供者与独立验收装配 owner 已点名，节点/真实交接尚未兑现。v3 历史绑定 1 条只保留其输入、工具、源码及 NonConnector 前提，不证明新根设置行为或本次定位的所有数值边界。文档链接/身份检查通过不等于独立评审、语义接受、可实施接受或真实验证。

## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 11 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
新原始运行与逐项签收记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# asset-evaluation 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`capability.asset-evaluation/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/asset-evaluation` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**168 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。原始执行、制品与范围。
- 逐项技术接受：本节点 10 项 core-local、1 项 core-composition 的本阶段责任已经主调度接受；精确 ID、坐标和前提。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前3实际形式执行（2026-09-26）

2026-09-26-formal-core-v3 保存本次正式3输入的实际模型、指定变异、原始输出与完整封存。主调度核32冻结资源、630 SHA、631归档字节及263主Alloy／28 XML读数，独立spec-reviewer核对应性无阻断。原18命令6 run SAT/12 check UNSAT，13既有变异全部匹配规定；按各原command有限scope，不把按构造的团队来源/根身份/PRE-2当实现保护。Alloy未登记正式task，不增formal binding。旧证据保留原输入；本次模型执行不签收产品实现、W6真实组合或人的最后总体门。

契约侧的证据义务权威在 [`spec/capabilities/asset-evaluation/verification.md`](../../../../spec/capabilities/asset-evaluation/verification.md#证据义务)（V-1～V-11、SC-1～SC-3）。
本页只登记**落在本节点上的那一部分**；前提 PRE-1～PRE-9 的兑现归组输入的一方与装配。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 结构性质 (i)～(x) | 契约侧是 Alloy 模型 `Evaluation.als`（**不是 formal task、不可绑定**）；实现侧须有对应的规范场景或性质测试，否则模型结论落不到实现上 | 未开始。契约侧的依据是 M31 之后的那次重跑（[契约验证入口](../../../../spec/capabilities/asset-evaluation/verification.md#已执行组合根只作身份之后的-alloy-运行2026-09-25)：十八条命令、十三个变异体与预期一致，**未登记为 formal task**；原始输出已在 2026-09-25-alloy-asset-evaluation 登记）；它**不建失败值**（`compositionCycle`、`categoryUnsupported`），M31 的三处改动按构造、不作证据 | 本节点：选几条模型性质写成实现上的性质测试（随机持有、锁、禁用组合）；随机生成器产出含 plugin 或 sub-agent 的组合时，断言结果是 `categoryUnsupported`，不是一份结果 |
| V-2 四格齐全的一次求值（S-33，E-1） | 五个集合与 E-1 逐项相等，`root` 是 `root.definition` 且不在 `composition` 里；同一输入重放；改一项权限只动那一项 | 未开始 | 本节点 |
| V-3 先禁用后替换（S-34，E-2a、E-2b） | 规范场景 | 未开始 | 本节点 |
| V-4 清单读入的留痕（S-35，E-3） | `readWorkspaceCarrier` 对 E-3 的持有与 `dropped` 逐项相等 | 未开始 | 本节点 |
| V-5 设置不跟过去、权限的约束跟过去（S-36，E-4 五支） | 规范场景 | 未开始 | 本节点 |
| V-6 输入不合法时整体拒绝（S-37，E-5 十份） | 十份输入都得 `invalidInput`（含 M31 新加的 `root.references` 缺席、C14 两份），返回里没有任何 `EffectiveAssembly` | 未开始 | 本节点 |
| V-7 装配给的保证（S-29 左列） | 选型声明 ＋ 架构评审 | 不在本节点：一致读、分享现读、调用方核实、清单来路都归组输入的一方 | 资产治理（读面与快照面）、据点装配、读工作区的节点 |
| V-8 判下来用不了的退回下一层（S-41，E-6 六支） | 规范场景 | 未开始 | 本节点 |
| V-9 执行权限项的 `tenantAutoWritable`（S-42） | E-1 的真、假两种；E-4 五支皆假 | 未开始 | 本节点 |
| V-10 成环即拒并指出环在哪（S-43，E-7 三支） | A 支得 `compositionCycle`、`cycle` 列出环上的标识且首尾相接、返回里没有 `EffectiveAssembly`，不是 `invalidInput` 也不是 `categoryUnsupported`；B 支 Skill⇄Tool 不算环、照常得结果；C 支根被禁用 ⇒ `composition` 为空、`unresolved` 恰一条且 `referencedBy` 缺席 | 未开始 | 本节点 |
| V-11 读不了正文的一类即拒（S-44，E-8 四支） | sub-agent 那支得 `categoryUnsupported{agent_definition}`、plugin 那支得 `{plugin}`，都没有结果；plugin 被禁用那支成功、进 `unresolved`；环与 sub-agent 同时出现那支得 `compositionCycle`（判定次序） | 未开始 | 本节点 |
| SC-1～SC-3 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载)；SC-3 随 M32、M45 扩到三个失败值 | 未开始。SC-1 的时钟那一半由现有 `no-wall-clock` 规则在包落地后覆盖；其余规则不存在 | 本节点提出形式；SC-2 扫的是消费者包 |
| S-23 界与挑选的三个导出函数 | S-23 产品原话表七行各一条单元检查；同一组用例经 `evaluate` 第 4 步得同一结论（共用实现的回归） | 未开始 | 本节点；资产治理的写时守卫用例另在 asset-governance 节点 |
| `defaultBodyContracts`（M51，唯一组合根） | 六类的键齐全，每个键上的值就是对应正文包导出的那一份（同一引用）；用它构造 asset-model 判定对象不抛出；错类由 asset-model 节点的类型测试覆盖 | 未开始 | 本节点 |
| `evaluationInputFingerprint`（本节点给的缓存键） | 改输入里任何一项（含 `standing`、`workspace`、会话配值、选用版本、动作集、`root.references`）指纹都变；成员次序不同的同一输入指纹相同 | 未开始 | 本节点 |

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；AE-5 的装配清单一半改指接口契约 `capability.assembly-manifest/v2`（`root.references` 的读法不在该接口里，仍受阻）。这一面成立的静态前提即 SC-1 那条 import 白名单（候选；`@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包都在白名单之外），**规则尚无**（owner `tools/ts-checks`）。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **Alloy 模型不可绑定**：2026-09-25 的原始输出已登记，输入与当前冻结模型一致；有限结构结论仍不能代替实现侧性质测试（V-1 行）。owner：本节点（实现性质测试）。
- **两个诊断的内容不可比对**：`cycle`、`category` 的具体内容契约豁免了确定性（S-11 的两处例外），有几个环、几类读不了时，V-10、V-11 只能核「有没有、首尾相接、类别在不在读不了的那两类里」，不能逐字核（E-7 A 支只有一个一元环，逐字核得了）。这是契约的选择，不是缺证据。

## D-068 当前验证epoch

当前设计输入为 `capability.asset-evaluation · v3`，规范资源在 acceptance.json 精确冻结。原包义务和既有证据保留原输入；补CB坏名未解析、TD指定拒绝、SA两行表示优先／工具名字128/129长度或AM/AE新标准正文闭包的本节点增量。完整source release、旧资源公开闭包、W6组合和逐ID接受尚待执行；用户最终整体接受未发生。历史formal run实际版本及注释差异分别核对，不把登记任务当已跑。
