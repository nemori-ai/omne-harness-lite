# 治理客户端公共操作承诺

根入口拥有 ActionInput、ActionIntent、预备输入、使用期、报告、错误和 exitStatus。
`./cordis` 拥有正式服务和唯一键。根入口不加载 Cordis，不选择具体本地状态或传输。
CG2 S1～16 的完整行为保持，包括全部动作、use、敏感槽和封闭失败集合。

ActionIntent 在等待前捕获。InputPrompt 的调用次数、取消与晚返回规则保持。
单个 use 固定中心、信任与登录选择，busy 与 invalid-input 的判定次序不变。
依赖注入不授予租户权限，不在已开始的动作中换入另一代 state/transport。
未知远端结果、CAS未确认、一次查证和副本过滤各按原语义保留，不能自动重投。
exitStatus 是报告到原退出码的纯映射；提供者与 CLI 共用此函数。

close 同步停止新 use/action，取消仍在等待输入的 prompt，等待网络、本地写入、
查证和完整预备输入责任真实结束。必须先登记完整工作再调用可重入的依赖。
重复 close 返回同一 Promise；旧引用拒绝原 ClientUseUsageDefect。
借入依赖只可在实际静止后释放。关闭拒绝本身不是静止许可。

ClientCloseObservation 是装配运行观察资源，在分配实例前接管一次原关闭尝试。
它没有关闭权，也不把拒绝变成静止。管理绑定、表示门与启动前缀的跨模块责任沿
[CLI生命周期采用](../../../.meta_harness/design/architecture/identity-integration/cli-lifecycle.md)。
验证覆盖原全部动作、真实SQLite/TLS/CLI、取消晚完成、忙碌、故障、机密输出及替代依赖。

## 公共操作行为

## S-1 参与方与边界

| 精确参与方 | 消费条款 | 提供什么 / 组合承担什么 |
|---|---|---|
| capability.client-local-state/v1（CLS1） | S1～8 | 完整记录、快照CAS、未知恢复与关闭；组合发号、按固定捕获使用、处理比较失败，不等待网络时持本地事务 |
| composition.governance-center-entry/v2（EC2） | S4～22、S27、S36、S50～54与完整31路由Schema | 中心认证、授权、路由及预期租户共同提交；组合只发精确载荷，不能补造调用者身份或在本地授权 |
| composition.governance-center-entry-https-json/v2（HT2） | S4～17、S29～33 | TLS/单连接单请求/成帧及未知；组合先核中心，持有网络至收场，不自动重试 |
| capability.account-identity/v3（AI3） | S15～16、S37、S44～45、S48～54（经EC2消费） | 有限登录及主动改密，不本地推断有效性或续期 |
| capability.organization-governance/v2（OG2） | S21～37、S55～64（经EC2消费） | 全部本期治理及读数；当前选择不承诺成员仍有效，角色只有成功读数才可显示为已知 |
| composition.account-registration/v2（AR2） | S8（经EC2消费） | 注册结果和中途恢复由中心负责；客户端不补一次内部激活或重复登录 |
| data.identity-values/v1 / data.offer-expiry/v2 | IV S1/3/5/9/10/31/33；OE S22（引用Schema） | 账号/租户/句柄/成员资格、取得时刻的表示；组合不重复定义领域值 |

既有完整Input路径继承v1；新增S16交互输入路径，未接受前不升级任何消费者。公开health仍为EC2保留的`composition.governance-center-entry/v1#S-18`、原三字段答复；不把health改成认人请求。可信CA/SPKI选择沿D029。本版没有服务端代理授权、后台自动登录或带外通知。

## S-2 一次使用的捕获与可见身份

一次CLI治理命令为一次使用，一次TUI打开到结束为一次使用。配置/注册/登录是进入已登录使用前的具名动作；登录成功后须明确结束进入前状态并重新开始使用，不能让既有已登录使用换账号或出示物。一次使用固定中心绑定（标识、端点及可信材料）和选中登录引用（出示物、句柄）；不因同进程或另一进程写入记录而静默换代。账号标识可从该引用已保存的已知值开始，或仅从该出示物成功取得的OG36当前租户结果补足；不能从登录名、请求载荷、显示名或缓存里别人的TenantId猜账号。

组合持有不对外枚举秘密的使用实例。开始时及每个新动作准入前读CLS1，核持久实例身份、绑定和所选登录引用；不同即停止该使用新准入，结果为需要重新进入。纯修订或副本更新不等于身份改变；组合不借新快照重新提交旧网络结果。自身已确认的CAS可推进本使用的本地快照；外部选择变化不承接为新身份。已接纳动作始终以捕获身份结算，结果不能改挂到后来屏幕选择下。

每份公开结果包含绑定中心、非秘密登录句柄、已知账号（未知明确为未知），以及请求使用的expectedTenant（若有）。expectedTenant只表示用户发起时确认的预期，不冒称失败后的实际当前身份。当前租户/角色的显示来自具名读数，并带线上/副本/未知及取得时刻；当前租户是选择，不能因为读到了它就显示成员有效。未认出账号时普通治理动作先以同一出示物取得OG36；失败不发目标动作，不用账号默认值。退出自己的登录可直接使用捕获句柄，不以取得账号为前置。注册/登录结果尚未取得账号时只显示非秘密事实。

应用进入治理界面应明确发起待办读面的refresh并保留失败时副本来源，承接PF016 §6.14；不能永远只走prefer-copy使新邀请不可见。这是进入时的新读动作，不新增后台刷新。

同一使用一次接纳一个动作；忙时返回busy且不排队、不发网络。不同使用可并发；本地CAS、中心事务各自裁决。本版没有批量原子治理操作。

## S-3 完整结果与秘密边界

结果同时区分以下事实，不能压成一个布尔成功：

- 目标远端动作未发起、已收到成功、已收到具名拒绝、暂不可得，或其修改结果未知。保留原契约拒绝字面，不把业务失败统称登录无效。记录失败发生在health、身份准备还是目标动作。
- 本地替换未请求、installed、conflict、not-installed及原因、unconfirmed；若未确认，另含S10查证结果，不能改写原结果。
- 此次可显示数据的来源：online、copy或none。副本必带取得时刻和原中心/账号/可选租户/精确查询；副本绝非准入证据。
- 使用仍可继续或需要结束后重新进入。

每个动作有非秘密关联标识；它不是中心幂等键或事务编号。本地operationId由组合为每次逻辑替换分配新非空值，随机分配的碰撞假设须明说；未确认的查证保留原值，不分配新值重交。

登录原答复的出示物只交CLS保存，公开数据只保留loginStateHandle。其他数据须符合所请求EC2操作的公开答复；副本只取成功读结果。账号凭据、旧/新凭据、出示物、完整CLS读取或完整输入不进入人读/机读/诊断。缺陷报出稳定分类，不把异常原文、SQL参数、TLS错误附带材料或输入回显给用户。进度只入诊断通道，机读输出是单一可解析的版本化JSON文档，字段形状由本组合Schema定义，过程文本不得混入。

## S-4 配置中心

1. 输入：CLS实例、端点与已由调用者明确选择的CA/SPKI可信材料；不含账号凭据。
2. 前置：无活跃已登录使用修改其捕获绑定；遵守CLS本地访问前提。
3. 次序：读原记录；按给定信任无秘密health；取得中心标识。原记录已绑定时必须逐值相同，否则center-mismatch，不发送登录秘密、不改记录。首次新目录可绑定所取得标识。地址改变不产生新身份；不自动接受新证书/SPKI。
4. 状态：用原CLS凭证整体CAS保存绑定；同中心更新地址/信任保留原登录及副本，不能跨中心搬移。
5. 成功：health事实与本地installed分别报告；配置未安装不能显示为已生效配置。
6. 失败：本地读取失败、配置表示不合、信任/网络/协议失败、中心不匹配，或CLS其余终结；无猜测默认中心。
7. 重复：一次动作一次health/一次CAS；不重试失败网络或比较替换。不同中心使用独立目录显式重新配置。
8. 外部效果：无远端业务修改；仅CLS本地提交。
9. 收场：拥有health和CLS工作到实际结束；取消不丢弃提交确认责任，关闭见S11。

## S-5 开始已登录使用

1. 输入：CLS实例；调用者不传Bearer或冒充账号。
2. 前置：组合尚未关闭；本地读取中的中心和选中登录存在。
3. 次序：读完整CLS，捕获S2；不在开始操作中暗中登录或假定远端有效。
4. 状态：建立使用实例；只读，无持久提交。
5. 成功：仅给不透明使用引用与秘密过滤后的本地选择事实；不是认证成功答复。账号/当前租户尚未线上取得时明确来源或未知。
6. 失败：not-configured、not-logged-in、本地读取失败。已关闭组合属于调用者误用缺陷，不伪装未登录。
7. 重复：新使用重新读取实际记录；不复活已结束引用。
8. 外部效果：无网络、无通知、无租约或自动续期。
9. 收场：此后动作受本使用准入与关闭管理；资源仍归组合。

## S-6 注册与登录

1. 输入：已配置的CLS及EC2 Payload_AR_S8或Payload_AI_S15，选择register或login；输入在异步前固定，密码只在本次内存中使用。
2. 前置：不在活跃已登录使用中换出示物；CLI单次进入前动作、TUI明确退出旧使用后才可发起。配置存在且可信材料已选择。
3. 次序：读原完整记录并捕获绑定；无秘密health比对中心标识；仅一致才发送一次对应免认人操作。不给该请求添加原登录出示物。
4. 状态：注册只调用中心，不自动登录。登录收到成功后，以原CLS凭证保存新出示物/句柄、账号暂未知、副本清空；不在保存前拿新秘密当当前使用，不自动发第二次登录。
5. 成功：远端registered或非秘密loginStateHandle，加本地保存的独立结果。远端登录成立而本地冲突/未确认仍如实说已创建登录、本机选中未获确认，不声称登录不存在。
6. 失败：health失败则未发目标动作；凭据拒绝/版本/表示等保留精确拒绝；目标修改请求可能已经发送而收不到可信答复，或中心返回unavailable，均不声称无远端变化。注册的中间事实由AR2处理。
7. 重复：不重发、不自动补偿撤销、不自动切回旧登录；再次发起是人的新动作，可能创建另一登录。CLS未知按S10查证。
8. 外部效果：中心可能新增账号或登录；登录也有独立本地CAS，没有跨域原子性。
9. 收场：拥有发送、答复处理及本地结算全链；结束进入前动作后，显式开始新使用。

## S-7 发起治理动作

1. 输入：S5使用实例、除AR8/AI15外的EC2具名操作及其精确载荷，读模式prefer-copy或refresh；输入不含出示物，由组合加入捕获引用。AI50同样由此面执行，提交前两种呈现必须说明全部旧登录失效；不增加中心授权条件。
2. 前置：使用开放、不忙；S2本地捕获仍匹配。账号未知先取得OG36，失败不发目标动作。涉及expectedTenant的操作必须由调用者显式给出确认的值，组合不在用户动作之后暗读新当前值并替换预期。
3. 次序：先核输入和本地选择；读面按S9。要联系中心时，无秘密health比对中心标识后发送；只用捕获信任/端点/登录。中心不匹配不发送秘密。写/切换不以副本放行，进入EC2由中心完成同提交现读与授权；客户端不重复发明权限判定。
4. 状态：业务写只发生于中心；组合按S9保存已读结果/移除已被新事实否定的副本，按S8清理本次已确认失效的本地登录。任何本地修改均从该动作准入时的原CLS凭证CAS，不自动套取新凭证重做。
5. 成功：按所发操作的结果呈现；origin固定，远端成功不因本地副本写入失败被改成业务失败。对AI50只显示ok与必须重新登录，不回显凭据。
6. 失败：读取/信任/绑定/版本/表示/具名业务拒绝各自可辨。EC2的login-state-rejected表示本次引用已被拒绝（领域loginStateNotValid已经由EC2映射，CG1不把它另立为线上值），结束新准入；普通业务拒绝不改成登录拒绝。unavailable与失权不同。对可能发出的修改，没有可信终态时报告unknown；sendAttempted只表示可能发送，不证明中心收到或产生效果。读失败也不承诺登录活动时间未变。
7. 重复：无自动重试、重登、补交或写补偿；刷新是明确的新读动作。幂等性属于原操作，不能据幂等标签隐藏unknown。
8. 外部效果：中心原操作及可能的CLS结算；没有可靠通知、队列投递或跨域共同事务。
9. 收场：每个Promise包括最后的CLS结算；网络超时/取消先让真实运输收场再结束，不把取消当远端撤销。

## S-8 退出、撤销与更换凭据的本地后果

退出自己是S7的具名便捷动作：用捕获loginStateHandle发AI16；载荷目标不从后来的本地选择取得。撤销另一句柄仍是AI16，但不清本机选中引用。以下确认使当前使用停止新准入并以原CLS凭证删除选中登录、清空副本、保留中心：①退出自己的AI16成功；②撤销的目标就是捕获句柄且成功；③AI50成功；④中心明确拒绝捕获登录。CAS冲突不删除新登录，unknown不假装清除成功。

退出/改密请求结果未知时，停止当前使用新准入、保留原记录并说明不确定；不能用“清本地”冒充远端撤销。下一次显式进入重新读取实际记录，远端效力仍须询问中心；没有自动沿旧操作继续。改密后如何核实旧/新凭据按PF001，本组合没有找回或管理员重置。

本节是S7的确定性结算分支，不额外发网络补偿；同样遵守其九项与S10/S11。机器与人读都能区分远端成功、本地已改变、本地清理未知。

## S-9 全部适用读面与副本

覆盖AI37及OG22/26/27/34/35/36/55/56/57/58/59/60；没有其他操作结果可作副本。缓存键是中心、捕获账号、可选租户语境、精确操作与完整非秘密载荷（对象成员次序不改变值；数组次序保留），不以简称或显示名合并。没有已知账号不能保存/显示副本。保存完整线上结果，时间是客户端取得读数的观察时刻而非中心认证时钟；不改邀约期限、不据时间自行把pending改成expired。

prefer-copy遇到本账号匹配副本直接显示，标明历史时点，不以网络探测作为显示前提；无匹配副本时可尝试线上读取。refresh明确尝试线上获取；仅当网络/中心暂不可得，允许回退到适用副本并同时保留不可得事实。运输的connection/timeout/response-framing/response-limit/response-invalid表示未取得可信读答复，可以呈现旧副本且保留具体故障；trust不允许，cancelled是用户取消也不自动回退。信任不成立、中心不匹配、版本不兼容、明确invalid-input/本地输入表示错误、业务拒绝或登录拒绝均不借副本掩盖；没有副本明确不可得，不生成空列表。

成功读写回同查询副本；副本保存冲突/失败独立报告。OG36可补足所选登录的未知账号，并只在与既有已知账号一致时保存；不同账号为协议/实现缺陷，不覆盖既有选择。角色来源为OG26，effective/ineffective/读失败严格分开。副本中的权限/角色只是旧读数，不成为发起写/切换的授权依据。

已知失效的副本不能继续作为当前有效观察：登录被拒绝/清除按S8清全部；明确业务拒绝时至少移除同查询副本；expectedTenantMismatch另失效OG36旧选择，membershipNotEffective按目标Tenant组织收拢相关副本；本账号资格通过真实线上路径观察：EC2 S13使OG22/26/34/35在本账号不具备所查组织资格时返回notAuthorized，**不会给本人OG26返回ineffective成功值**。收到这四路由的notAuthorized，按载荷所涉组织移除依赖该组织资格的副本；OG34有两个组织时只知道至少一个不满足，保守停止两者相关副本，不把两者均显示成ineffective。含expectedTenant的路由返回notAuthorized时，同样停止该组织相关资格副本，不据此猜member或ineffective。成功OG26仅在查询本账号且角色为member时收拢超管副本并保存新判定；查询其他账号所得ineffective不能当成本人失权。本人OG28降权/OG29退出成功同样执行此收拢，不能仅失效成员名单。同一使用即使删除副本CAS失败也记住该失效事实，不在本次后续操作回退旧值；跨进程未知/冲突不能伪称全局缓存已清。

成功写使以下受影响副本不再适用，CAS移除对应组；其余保留，不借容量或显示简化任意丢弃：

| 成功操作 | 失效副本组 |
|---|---|
| OG21建组织 | OG27我的租户 |
| OG23/24/25/61、EC50成员邀请动作 | OG55/57/58；接受另失效OG27、OG26与OG59 |
| OG28/29变角色/解除成员 | OG26、OG27、OG59；此处跨成员及可见性相关读组整体失效，不改变远端选择 |
| OG30/31/32/33/62隶属动作 | OG34/56/58/60；OG32接受与OG33解除另失效OG22的parent读数（上级链传递影响不只限于请求的两个组织） |
| OG37切换 | OG36当前选择；不凭ok猜目标当前角色 |
| AI16撤销别的登录 | AI37登录清单 |

资格依赖的映射必须可复核：含expectedTenant的读面（OG55 tenant分支、OG56/58/59/60）把该值作为CLS副本租户语境；只有符合本使用账号的语境才可保存。OG22依赖所查organization，OG26/35依赖载荷tenant的组织，OG34依赖organizations中的各组织，判断的是本账号在该组织的资格，不把被查成员账号当成发起者。账号级AI37/OG27/OG36/OG57及OG55 account分支不借另一账号副本补齐。发现本账号某组织资格失效或收到上述notAuthorized，移除上述依赖该组织的副本；发现仅超管资格丧失，至少移除OG55 tenant、OG56/58/60及OG59(includeIneffective=true)的该组织副本（含已有符合该组织语境的记录）。保守移除同组织其余读副本可行，但不能清除无关联的其他账号级或其他组织数据。正在显示的旧副本同步失去当前适用性，即使持久清理失败也不在本使用内继续当可适用副本。 后来fresh成功只证明这次新读数可呈现；必须是这份新副本经installed确认后，才能恢复该具体副本的适用性，不凭同查询键放行仍在盘上的旧版本。新的失效观察再次撤销受影响例外。

这是对已知本次操作涉及的读组进行保守失效，不等于清空所有读面；以后读取重新取得，仍须覆盖全表。未知写不假造已发生的新事实，输出保留unknown，旧读数只能仍作为标注时刻的历史副本显示，不表示修改没发生。

## S-10 CLS未确认与查证

每次拟替换只一次CAS。installed才能说本地保存成功；not-installed确知未替换；conflict说明此动作没有覆盖当前记录，若当前绑定/登录已变则结束使用。若只是另一副本写入造成修订变化，也不以新凭证重交旧结果。

unconfirmed后仅做一次CLS读取，同时核原storeId与operationId：对应本次、当前其他版本、目前未见本次、不同存储实例或读取仍不可用。按CLS S6报告当前可见事实，**原结果继续unconfirmed**。公开查证只给非秘密中心/账号/句柄与修订，不返出示物或完整记录。查证未发现本次不意味着它从未发生。所有查证仍属于原动作生命期。

## S-11 关闭与提供者换代

组合关闭先停止新动作及新使用；各使用关闭停止新动作；随后等待所有已接纳动作的网络、本地CAS及S10查证真实结束，再释放引用。调用者重复关闭等待同一次收场；关闭后旧引用误用为ClientUseUsageDefect（closed），跨组合/伪造使用引用为同类invalid-use，不能变成未登录或远端拒绝。未声明内部异常是实现缺陷，保持传播至应用稳定诊断边界。

提供者/依赖更换同样先静止旧组合，不把新依赖换进旧调用。宿主拥有依赖直至所有完整动作结束；不能凭截止时间或连接已关就关闭仍待本地结算的CLS。进展依赖可调度调用及网络/存储最终收场，期限只决定结果未知和观察到等待，不证明已释放。没有外部事务补偿、重放旧操作、后台重登或新建Agent会话。

## S-12 规范表达与验证边界

Schema定义公开动作/结果的线上形状与秘密过滤，EC2已有字段一律引用不改名；本地CLS完整记录不是机读输出。规范场景需覆盖全31路由的投影、输入冻结、中心不符不发秘密、有限登录拒绝、未知改密/退出、原登录与本地选择交错、CAS每种终结、全部读面与失效组、两种呈现同源、无秘密输出。

行为模型触发于整次使用身份、在途收场与远端/本地不能合并；有限模型须有固定身份、无新准入后换代及资源不早释三项反例/负控。CLS已有模型只承担本地CAS，不能替代本组合生命周期。TLS真链、真实CLI/PTY/双平台、失败注入由实际组成测试；不把有限模型或单包mock当生产完成。

## S-13 公开体检动作

1. 输入：已配置CLS，无账号凭据或使用引用。
2. 前置：组合未关闭，本地绑定可读取。
3. 次序：捕获绑定，以其可信材料调用一次无秘密health，比较返回centerId；体检不消费所选登录。
4. 状态：只读，无本地或远端治理提交。
5. 成功：三字段health读数；只表示可达及该时点的标识/版本，不宣称账号登录有效或治理路由已准备好。
6. 失败：未配置、本地不可读、信任/网络/成帧/协议失败、中心不匹配分别可辨；不返回假健康。
7. 重复：每次显式调用一次，不自动重试。
8. 外部效果：运输连接；无登录活动续期、治理修改或后台探活。
9. 收场：完整health Promise归组合，关闭等待实际收场。

## S-14 公开字段与机读映射

[Schema](schema/governance-client-operations.schema.json)的Input先做纯表示校验，成功后才进入各操作次序。动作是configure、health、register、login、invoke、logout；invoke消费29条非注册/登录路由，登录/注册必须走S6安全结算。readMode只供13读面，省略为prefer-copy；写操作不接受这个成员。进入前动作的界面不能假扮S5已登录使用。CLI/TUI可用具名别名，但必须落到同一Input与S5/S7，不各写一套行为。

Output的format固定governance-client/1；actionId只是本动作关联。origin沿S2；admission区分本地阻断与已受理，remote沿S3，其sendAttempted仅表示**目标治理动作**可能发送（不是health/身份准备是否访问过中心）。因此身份准备阶段读失败可以有remote.stage=identity、目标sendAttempted=false，不声称没有任何网络访问或登录活动更新。remote.reply保留发生该阶段的精确操作；目标阶段必须对应Output.operation，身份准备阶段只能为OG36。

local反映本动作最后那次拟替换；纯读无保存或未取得可保存数据时not-requested。一次动作将身份补足、成功读取及需失效项汇总到一份CLS替换，不在身份准备后先保存、再用新凭证提交目标结果。unconfirmed必须附S10的一次查证；查证仍未知不省略。S10恢复分支的current仅是秘密过滤后的当前可见选择，不含完整记录。已受理动作发生缺陷时在独立defect字段标明阶段和internal-defect，不把admission改回blocked；此前已验证的远端成功事实仍保留，view为none，不带错误文本。仅比较替换本身未返回正常终结而抛缺陷时，local.status=defect，不推断本地是否写入；读取缺陷只进独立defect字段。若CAS已unconfirmed而后续查证抛缺陷，原local.status必须继续unconfirmed，recovery.observation=unknown，另记defect.stage=recovery，不能覆盖原结果；状态70。详细错误不能混进JSON或秘密诊断。

view中的query只允许13读面的非秘密operation/payload，必须保留完整查询；copy还给出CLS条目的租户语境（若有）。源中心/账号在origin中，copy时不能未知。登录/注册/改密载荷绝不进入query。

view只承载目标动作可呈现数据：online的数据来自目标成功；copy限定本期13读面，带取得时刻；none不带data。PublicExchange按EC2每条操作约束答复，唯一改变是AI15成功的result只留loginStateHandle，原Bearer字段在这个公开Schema中不合法。登录失败仍沿EC2。任何返回不得携带原始输入、完整CLS或诊断文本。

Schema给闭合形状，值之间的关联仍须按S2/S3/S9核对：请求预期值逐值保留、缓存与捕获账号/中心一致、结果不能因同名字段改挂身份，属于动态规范义务，不以JSON Schema通过代替。

### remote的封闭映射

remote.reply只装已校验的业务对象答复（result/failure，带其操作坐标）；裸入口字符串只进remote.answer，二者不同时出现，不把同一入口答复装两种形状。health三字段只进remote.health，不装业务reply。remote.stage表明下列判定属于哪一步；配置/体检以health为目标，其sendAttempted仍为false，因为这个字段专指目标治理动作。

| 观察 | remote.status / 细节 / 目标动作 |
|---|---|
| 纯本地准入失败，未调用运输 | not-attempted，stage=none、sendAttempted=false，无reply/answer/health |
| 配置/体检收到正确中心的health | success，stage=health、health=三字段、sendAttempted=false；本地配置是否安装另报 |
| health标识不匹配 | not-attempted，stage=health，保留三字段观察；admission阻断center-mismatch，目标不发 |
| health或身份准备连接/超时/不可信答复/限额/取消 | unavailable，stage=health或identity，transportFailure原名，sendAttempted=false；未发目标动作 |
| health收到version-mismatch | 按HT2 S17固定字节特例：rejected，stage=health、answer=version-mismatch、sendAttempted=false；不清登录 |
| health收到unavailable/invalid-input/login-state-rejected等非PublicHealthReply值 | 按HT2 S17对端异常：unavailable，stage=health、transportFailure=response-invalid、sendAttempted=false，不放入answer；免认人的health不能证明捕获登录无效，不清登录 |
| 身份准备OG36的明确入口拒绝 | rejected，stage=identity、answer原值、sendAttempted=false；只有login-state-rejected走S8清理；OG36裸unavailable另见下一行 |
| 身份准备OG36返回裸unavailable | unavailable，stage=identity、answer=unavailable、sendAttempted=false；未发目标动作，不误报response-invalid |
| 目标业务成功 | success，stage=operation、reply为安全PublicExchange、sendAttempted=true；AI15只留句柄 |
| AR8返回failure=interrupted | **unknown**，stage=operation、reply仍保留interrupted、sendAttempted=true；可能已有提交，不能当确定拒绝（状态3） |
| 其余已校验具名业务失败 | rejected，stage=operation、reply保留原失败，sendAttempted=true |
| 目标裸unavailable | 13读面为unavailable，修改操作为unknown；stage=operation、answer=unavailable，不推断无提交 |
| 目标其余裸入口答复 | rejected，stage=operation、answer原值；仅login-state-rejected对应S8 |
| 目标运输不可得且sendAttempted=false | unavailable，stage=operation、transportFailure原名、sendAttempted=false；不声称已修改 |
| 目标运输不可得且sendAttempted=true | 13读面为unavailable，修改为unknown；stage=operation、transportFailure原名，不把可能发送当效果已发生 |
| prefer-copy直接命中 | not-attempted，stage=none、sendAttempted=false；view.source=copy、本地无替换 |

身份准备成功只是动作中间事实，不替代目标成功；最终答复只装结束该动作的阶段。若目标尚未发起，不能把准备成功改写成目标成功。不存在其他正常类别；未声明结果按缺陷处理。用户取消不会触发cache自动回退，也不产生新请求。

## S-15 进程入口的结果状态

CLI每次输出一份S14机读结果（选择机读呈现时），再以如下优先级给进程状态；TUI使用相同分类呈现该次结果，不因窗口仍打开把失败改成成功。状态只总结该动作，详细远端/本地事实仍保留在Output。

1. 未声明实现缺陷：70，稳定defect诊断，无原输入/异常原文。
2. 本地结算conflict/not-installed/unconfirmed：5；即使远端成功，也不能暗示本机选择/副本已保存。
3. 目标修改unknown或所需线上事实unavailable且无可呈现副本：3。
4. 已确认远端拒绝、需重新登录/重新进入：4。
5. 输入不合、未配置、配置表示/中心不匹配、busy等本地准入失败：2；本地读不可用为3，格式不支持/损坏为2。
6. 剩余明确成功，或只读按规则取得适用历史副本：0；后者必须仍在JSON中显示copy与不可得事实，0不意味着中心当前在线。

用户取消只取消本次继续等待/可取消的运输，仍按实际动作收场；若已发修改不能证明结果，状态3并保留unknown，不能用退出码暗示远端已撤销。终端或输出流在最终JSON完成前被强制关闭时，应用不能声称交付过一份完整机读结果；仍尽可调度地收场实际工作。正常停止TUI不等于退出中心登录，不自动调用AI16。

## S-16 固定动作上的交互输入

### 参与方与值

新增交互参与方不持有治理状态：只接受安全Preview和取消信号，实际结束时返回PromptResult。Intent与完整Input同名同义，唯三类秘密字段尚不存在：register/login的credential、AI50的currentCredential/newCredential；其他载荷完整保留，不能含秘密占位成员。Schema引用EC2已有值类型，不给凭据另定义一套格式。

Preview含安全意图投影、原origin、端点及来源。除configure的信任摘要外，治理意图逐值保留原非秘密载荷；configure投影不含certificateAuthorities原文，只含验证过的端点和信任摘要：CA来源system/explicit，显式CA附原捕获UTF-8字节的SHA-256十六进制摘要；SPKI模式只给原已选摘要。实际执行继续使用原捕获配置，不从摘要恢复或重新读取文件。它不是授权结果、不是可转发Bearer，也没有CLS读取/token；origin.accountId只能来自原已知登录或同P的成功OG36，不从登录标识猜。origin.expectedTenant逐值保留请求预期；preview不能冒称当前成员有效。source=local-selection表示本地已捕获选择，verified-center表示该绑定本次已核对health，两者都不自动证明权限。Preview不是最终Output，不进入机器最终文档；人读只从它展示非秘密意图和身份。完整Input/Output的表示仍为governance-client/1，v2直接引用冻结v1 Schema，不另复制第二份表示权威。

### 一次交互动作的九项

1. 输入：Intent、交互参与方、同S1的CLS/协议参与方；根动作支持六类action，既有use只支持invoke/logout。Intent在任何异步前校验并深捕获，表示不合不读取秘密或调用交互参与方。configure在交Preview前额外进行非网络安全表示核对：端点必须是HTTPS且无userinfo/query/fragment；显式CA只能由可解析且具有CA性质的证书PEM块与空白组成，含私钥或额外文本即拒绝，不能等运输层后来拒绝才停止公开。Preview端点为该URL解析后的可发送表示，原值仍用于绑定比较。
2. 前置：组合/use未关闭；同use忙时仍拒绝不排队；前置动作不在活跃登录use中换绑定。交互参与方必须能观察取消并最终实际收场，不能在自身回调内等待包含它自己的组合close。
3. 次序：按原操作捕获原CLS快照、绑定和登录；不同使用仍独立。configure/health在捕获本地配置后、调用health前交安全预览（首次configure中心可未知，端点来自Intent）。register/login先核health，再交预览；它们不拿原登录认证。invoke/logout若有适用prefer-copy可直接用本地来源预览，其他先核health；账号未知时先以原P取OG36，成功补账号后再交预览，失败沿S8/S10结算而不询问秘密或发目标动作。交互退出自己的登录也走这个可见账号准备；完整Input路径的S8直接退出不变。
4. 状态：等待交互期间保留同一动作的原快照/绑定/P，**不持数据库事务或锁**。账号补足、副本及失效仍汇总到这一次原快照CAS，不在预览前先保存换凭证。Preview交出后不能因同进程/另一进程修改记录而跟随新选择；目标始终用原捕获，迟到本地保存仍可能conflict/unconfirmed。
5. 成功：交互参与方返回continue及恰好所需的秘密字段：普通动作空对象、register/login仅credential、AI50仅currentCredential/newCredential。只能填这些槽，不能换action、operation、原非秘密载荷、expectedTenant、中心或登录。构造完整Input再按原Schema校验；然后沿既有路径执行一次目标并报告原远端/本地结果。原会在身份准备得到的读数按S9/S10处理，切换等后来的失效仍作用于准备读数。
6. 失败：取消信号已发出、参与方返回cancelled、槽不匹配或最终Input不合时，不发目标；取消/不合映射admission.blocked/invalid-input，view=none。此前health/身份读数及本地结算保留，不能伪称完全未访问中心：对register/login/invoke/logout若尚无目标答复，将remote.status标not-attempted，stage仍保留health或identity及已校验观察，目标sendAttempted=false；无前置网络则none。configure/health的取消发生在网络前，保持none。未声明参与方异常为独立defect.stage=input、稳定internal-defect，原事实不抹去，目标仍不发。显示时刻或本地结算失败仍沿既有优先级，不因取消掩盖unknown/defect。
7. 重复：本次最多调用交互参与方一次、目标一次、CAS一次；不因为用户改错密码自动弹第二次、不重放。新尝试是新动作。等待期间未收到继续并不等于默许，也没有自动缺省密码。
8. 外部效果：在交互前可能已经有无秘密health和OG36业务访问；OG36可能更新登录活动，取消不撤销该事实。交互参与方拥有TTY/文件输入及其恢复，组合拥有整个等待和后续结算；二者不共享事务。只在调用方实际返回后放弃其秘密值引用，不能将秘密存入缓存知识或诊断。
9. 收场：组合/use关闭先停新准入，向在途交互发取消信号；**仍等该交互调用真实结束**，不以abort或时间到了假装结束。取消后迟到的continue不允许发目标；此前网络/本地CAS/查证完整收场后才释放借用依赖。交互若忽略信号且永不结束，则关闭也不能声称完成；这是具名进展前提，不以提前关CLS逃脱。

### 对S14/S15的有限增补

以上仅扩充“Input还在受控取得”的正常路径：remote.not-attempted可保留成功的health/OG36准备观察，分别在health/identity阶段，sendAttempted仍只指目标。它不表示没有任何前置网络。本地输入取消为invalid-input，S15既有优先级不变：defect70、本地不确定5、不可得/unknown3、重进/拒绝4、其余本地阻断2；不会把准备成功当目标成功或自动返回0。原完整Input路径没有这些交互中止情况，其封闭映射不变。

应用必须在继续前用本Preview呈现身份及影响说明，不能另读一个版本替换预览。此保证指动作身份一致，不保证人已经读懂、也不产生新的治理授权或“确认即有权限”。TTY模式与秘密尾块收场仍由CQ/终端拥有者兑现，不能由这个安全Preview替代。
