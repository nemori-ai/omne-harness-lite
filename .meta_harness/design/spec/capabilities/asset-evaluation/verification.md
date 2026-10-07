# 验证义务与方法

本页维护验证义务、方法、前提与范围。采用与接受状态从专题入口/registry 读取；实际实现从成员入口读取。执行输入、配置、结果和反例留工作树 tmp，不维护运行台账。义务列出与日志移除均不能代替符合性或关闭缺口。

## 求值模型的覆盖边界

Alloy 按每条命令的 SAT/UNSAT 与有解实例判读，不按退出0判断通过；只支持性质表标为 Alloy 的那些行及给定有限规模，按构造吸收的前提不作为证据。规范场景、静态检查及真实提供者/装配分别验证，文件存在不等于执行。精确模型内容与范围见 formal 入口。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 |责任与限制|
|---|---|---|---|---|
| V-1 | **结构性质 (i)～(x)**：团队资产不出那棵树、锁截断、禁用析取、工作区滤权（权限、落点类、治理类）、官方件下界、换了实现逃不出外层对这个能力标识锁下的界、与界不交的挑选不给出值、判为用不了的不生效、用不了的那份不带走外层的界、不锁的「禁止」也是界 | Alloy：[`Evaluation.als`](v2/formal/Evaluation.als) 的十八条命令 ＋ 十三个变异体 | [S-17](v2/contract.md#s-17-第一步之一先按禁用滤)～[S-19](v2/contract.md#s-19-官方件是下界)、[S-39](v2/contract.md#s-39-谁可以使用它值与判定) 的结构后果、[S-22](v2/contract.md#s-22-第四步设置)～[S-25](v2/contract.md#s-25-工作区提供的资产的权限项一律取最严值) 的「来自哪一格」那一面 | (i)由持有与PRE-2按构造，M5只说明该前提依赖，不独立证明；只来自持有由V-2多带定义反例核。其他结构性质按十八命令/十三mutants与formal有限范围核。 |
| V-2 | **四格齐全的一次求值**（[S-33](v2/contract.md#s-33-四格齐全的一次求值)）：五个集合与 [E-1](v2/examples.md#e-1-四格齐全的一次求值) 逐项相等；同一输入重放；改一项权限只动那一项的值 | 规范场景演练，**同一次演练比对全部五个集合** | [S-8](v2/contract.md#s-8-求值结果-effectiveassembly)、[S-11](v2/contract.md#s-11-纯计算)、[S-17](v2/contract.md#s-17-第一步之一先按禁用滤)～[S-26](v2/contract.md#s-26-每份持有都有去处) | 同一次比对全部五集合及root：assets含version/resident，values含provenance；真实凭据不可外泄；mcpActionSets与execute真名、额外定义/缺动作集等四附加支均核。composition不含根，根不投属性或filteredOut；被引用正文规则仍依G-3 owner，替身不能关闭真实组合义务。 |
| V-3 | **先禁用后替换**（[S-34](v2/contract.md#s-34-先禁用后替换)）：[E-2a、E-2b](v2/examples.md#e-2-先禁用后替换) | 规范场景演练 | [S-17](v2/contract.md#s-17-第一步之一先按禁用滤)、[S-18](v2/contract.md#s-18-第一步之三最后取最具体的一份锁在最外那一把处截断) | 真实提供者按E-2两支验证，不以模型替代。 |
| V-4 | **清单读入的留痕**（[S-35](v2/contract.md#s-35-清单读入的留痕)）：[E-3](v2/examples.md#e-3-一次清单读入)，并与 E-1 连起来看 | 规范场景演练 | [S-16](v2/contract.md#s-16-readworkspacecarrier)、[S-27](v2/contract.md#s-27-清单列的资产变成工作区那一格的持有)、[S-28](v2/contract.md#s-28-配值与禁用只对工作区提供的资产生效丢掉的留痕) | 记录号G-6按owner接续；缺assignments/disabled为invalidInput，不补空；holding/assignment since由调用方读入时刻补。 |
| V-5 | **设置不跟过去、权限的约束跟过去**（[S-36](v2/contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)）：[E-4](v2/examples.md#e-4-换了实现设置不跟过去权限的约束跟过去) 五支同跑 | 规范场景演练 | [S-22](v2/contract.md#s-22-第四步设置)、[S-23](v2/contract.md#s-23-第四步权限) | 按E-4五支核界与挑选：禁止无锁亦为界，界不同时挑选、无界内挑选取最近档；A/B/C执行权限from是factory。 |
| V-6 | **输入不合法时整体拒绝**（[S-37](v2/contract.md#s-37-输入不合法时整体拒绝)）：[E-5](v2/examples.md#e-5-不合法的输入) 十份 | 规范场景演练，**核返回里没有任何 `EffectiveAssembly`** | [S-7](v2/contract.md#s-7-输入的一致性条件)、[S-13](v2/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) | 所有十输入整体拒绝且无EffectiveAssembly；含root.references缺席C1和非tool/skill常驻C14，按root.definition核。 |
| V-7 | **装配给的保证**（[S-29](v2/contract.md#s-29-装配给的保证-vs-协议须给的保证) 左列）：一致读、分享此刻成立、调用方已核实、清单就是目录里那份 | 装配设计的选型声明 ＋ 架构评审 | [第七节前提](v2/contract.md#前提由别人兑现本契约不检查) PRE-1～PRE-3、PRE-7、PRE-8（动作集就是这次尝试钉住的那一份，由会话资产注册表兑现） | 装配设计与独立审阅核PRE-1～3/7/8；失效会静默算错，规范场景不能证明这些外部事实，动作集由注册表当前尝试钉住。 |
| V-8 | **判下来用不了的退回下一层**（[S-41](v2/contract.md#s-41-判下来用不了的退回下一层)）：[E-6](v2/examples.md#e-6-判下来用不了的退回下一层) 六支同跑 | 规范场景演练 | [S-39](v2/contract.md#s-39-谁可以使用它值与判定)、[S-18](v2/contract.md#s-18-第一步之三最后取最具体的一份锁在最外那一把处截断)、[S-19](v2/contract.md#s-19-官方件是下界)、[S-26](v2/contract.md#s-26-每份持有都有去处) | E/F核被滤持有不带走锁；组织直接持有不经plugin时，无official则标识进unresolved，实际装配收场归S-31。 |
| V-9 | **执行权限项的 `tenantAutoWritable`**（[S-42](v2/contract.md#s-42-执行权限项另带租户那一层写得进自动吗)）：[E-1](v2/examples.md#e-1-四格齐全的一次求值) 的真、假两种（假的那两条同时演示 `mcp` 逐动作项恒为假）、「`h6` 带锁」与「`h6` 被禁用」两支，[E-4](v2/examples.md#e-4-换了实现设置不跟过去权限的约束跟过去) 五支皆假 | 规范场景演练，随 V-2、V-5 同一次演练比对 | [S-42](v2/contract.md#s-42-执行权限项另带租户那一层写得进自动吗)、[S-8](v2/contract.md#s-8-求值结果-effectiveassembly) | 同V-2/V-5比对：MCP逐动作恒假，h6锁/禁用、租户持有无效或另一资产均核，不用模型中未表达的位作证明。 |
| V-10 | **成环即拒并指出环在哪；根不可见即不往下走**（[S-43](v2/contract.md#s-43-成环即拒并指出环在哪)）：[E-7](v2/examples.md#e-7-成环即拒并指出环在哪) 三支同跑 | 规范场景演练，**A 支核返回里没有任何 `EffectiveAssembly`、失败值是 `compositionCycle` 而不是 `invalidInput`、诊断 `cycle` 列出环上的标识** | [S-15](v2/contract.md#s-15-evaluate) ⑥ 与其后一段、[S-13](v2/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 末段、[S-20](v2/contract.md#s-20-第二步组装) | 环诊断只核真环与每步直接引用，不规定起点/多环选择；当前正文G-3未闭合时只有根自指可达，subagent环待owner规则补齐再扩。 |
| V-11 | **读不了正文的一类即拒**（[S-44](v2/contract.md#s-44-读不了正文的一类即拒)）：[E-8](v2/examples.md#e-8-读不了正文的一类即拒) 四支同跑 | 规范场景演练，**A、B 两支核返回里没有任何 `EffectiveAssembly`、失败值是 `categoryUnsupported` 且 `category` 对得上**；C 支核被禁用的不触发；D 支核判定次序 | [S-15](v2/contract.md#s-15-evaluate) ⑥ 与其后 `categoryUnsupported` 一段、[S-12](v2/contract.md#s-12-缺席时的默认答案) 那一行、[S-13](v2/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 末段、[S-20](v2/contract.md#s-20-第二步组装) | 不能把未支持正文当空引用或全启用。G-3/G-21闭合须按新正文规则接续并迁消费者，才能退役该值/义务，不能直接删除。 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。检查器形式归实现拥有者，不能从义务列出推已检查。

| # | 检查什么 | 对应条款 |责任|
|---|---|---|---|
| SC-1 | 两个操作的实现不读存储、时钟、文件与进程状态，不写任何东西 | [S-11](v2/contract.md#s-11-纯计算)、[S-30](v2/contract.md#s-30-本能力没有在途工作) | 验证义务 |
| SC-2 | 消费者缓存求值结果时，键覆盖整份输入（含 `standing`、`workspace`、会话配值、选用版本、`root.references` 与 `mcpActionSets`），不只以 `(tenant, root.definition)` 为键 | [S-15](v2/contract.md#s-15-evaluate) ⑦ | 验证义务 |
| SC-3 | 不存在把 `invalidInput`、`compositionCycle`、`categoryUnsupported` 转成空 `EffectiveAssembly`（或去掉一部分的结果）、或把 `unresolved` 升级成失败的路径 | [S-13](v2/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) | 验证义务 |

## 结果与反例

### 组合根模型的判读与限制

模型输入为 [Evaluation.als](v2/formal/Evaluation.als)。check 的 UNSAT 仅表示给定范围内无反例，SAT 表示找到反例；run 的 SAT 表示前件可满足。正断言须配套对应变异反例，不能用退出0判断成立。

composition 不含根、根不可见不往下走按定义构造，没有断言或变异体保护；由 V-2（E-1第5件）与 V-10（E-7 C支）真实场景兜底。模型不构建 compositionCycle 失败，含环实例按定义算出的 composition 不对应任何结果；PRE-9未建模，rootRefs任取。有限结构性质不证明真实求值、权限或组合符合性。

## 形式化工件

**选用 Alloy，不登记为 formal task。**[检查器只以退出码判成败](../../../registry/README.md#当前采用)，
而 `alloy exec` 找到反例照样退出 0——登记它只会得到一个永远通过的任务。
映射、规模与盖不到的部分在 [formal 入口](v2/formal/README.md)。**`formal-tasks.json` 里本契约没有条目，这是有意的**，不是漏登。

## 变化的影响

当前计算规则归 [v2 contract](v2/contract.md)，不复述改判/模型运行过程。输入/输出引用、HoldingBasis/versionSelection、声明允许域与正文投影变化时同步实际求值、治理写面、registry报告和完整缓存键。

- 设置随资产，权限界跨能力标识；不锁禁止仍为界，工作区只贡献合法设置，权限/落点/治理配值不参与并留filteredOut。official不判usableBy；self按自定义作者或挂工作区租户认，先禁用、再滤不可用、再替换，不让被滤持有锁住外层。
- PRE-2是active分享、此刻关系成立、确认以来未断的合取；按分享类型核合法所有者，不以同树一谓词替代。组输入先读关系/有效性后读时刻，或一次可串行化读，反序可能复活；读不可用不能当关系成立。Alloy只取给定TreeOwner子集，不算分享条件/时刻/读序；这些归asset-transfer与输入生产者。
- root只身份，references组装；根无生效资产时unresolved且不下走，根不投属性、不参与配值。mcp动作集必须当前尝试钉住；二次求值配方唯一源归registry S-24②，root/workspace沿配方而持有配值现读。
- tenantAutoWritable须声明执行项、非工作区、组织界含自动、租户未锁且该持有在效并对应实际资产；组织界不以持有在效为前提，MCP逐动作恒假。registry报告交runner/admission，真实位计算不由Alloy证明。
- invalidInput优先compositionCycle，后者优先categoryUnsupported；环必须当前组合的直接引用环，Skill/Tool允许互引不误判。unsupported只在实际走到生效正文时触发；G-3/G-21未闭合不能假定空引用，G-18可能因正文未支持而不可达。
- E-3工作区清单可按asset-model WorkspaceCarrierManifest做形状校验；E-1～8输入/结果集合表是含义记法，不能当Schema实例。G-6闭合时工作区读入亦须name_not_projectable检查。Alloy不覆盖PRE-9、生产租户授权、根失败及真实拼装；各有限范围与变异映射归formal owner。

跨进程时S-29的协议责任归当前架构与承诺owner接续，不外推单机输入前提；发现规则冲突回PF-002/PF-001/PF-003/PF-004及当前contract。
