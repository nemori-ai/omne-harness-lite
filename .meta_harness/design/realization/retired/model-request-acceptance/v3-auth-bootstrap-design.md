# model-request-acceptance 真实鉴权启动投影增量

revision 1，**candidate，未接受、未实施、未验证**。本页只候选修订 [design.md](design.md) A-1/A-2/A-6 及 bootstrap 2/3 在“真实鉴权＋目录＋model-only 凭据”阶段的装载顺序。原 design.md 的字节、完整模型纵线其余阶段及各 provider 的契约不改。须经独立架构评审与主线精确采用后，应用实施者才可消费本页；bindings 仍为 0。

## 依据、边界与可实施判断

需求沿 [PF-013 rev 13](../../../product/PF-013-model-profiles-and-invocation/README.md) 的技术验收范围；本页不新增产品入口。精确契约均在 [catalog](../../../registry/catalog.json) 登记为 accepted：account-identity/v3（AI3）、organization-governance/v2（OG2）、account-registration/v2（AR2）、model-profile-directory/v3（MD3）、credential-custodian/v2（CC2）、model-profile/v3、identity-values/v1、offer-expiry/v1。provider 来源为 D-075 的目录 v3／CCL v2 窄组件；应用原 revision 2 已由 D-076 采用。Cordis 仍是 D-025 的 4.0.4；存储、时钟与配置错误政策沿原 A-2：复用已选提供者，非法静态配置启动失败，领域操作的具名拒绝保持原值。

本增量只装真实 storage、clock、credential-verification、account-identity、organization-governance、account-registration、目录管理／本机取值和唯一 model-only CCL 组件。无 runtime、transport、session seed、资产源、中心、OAuth 或完整 CCL；不发布它们的假服务，也不取得模型网络能力。范围内仍是一个据点账号、同一真实 AtomicStorage、同一 clock；本页不是通用启动框架。

原顺序存在真实冲突：目录 [v3 装卸表](../../packages/model/model-profile-directory/v3-design.md#成对的装载与撤除) 规定 `loadManifest` 在 provide 前耐久提交，后续 provide 失败不撤销；原应用 bootstrap 3 却在目录 ACTIVE 后才确认，并禁止确认前业务事实。合法空清单也不是无写模式：初始序号为 0，合法输入序号为正，新清单仍更新清单状态。不能凭“尚未开放外部入口”把这次提交说成不存在。

[storage-sql R-U6](../../packages/infra/storage-sql/design.md#确认为什么绑在守卫对象上) 的确认前提是同一个 guard 已附着在役且完成迁移的 storage；它不检查其他业务 fiber。因而本页可在不改存储协议、目录 preprovide 行为或凭据契约的前提下，把**升级确认**和**完整场景准入**分成两个明确时点。代价是确认后的目录构造失败属于不可整库回退的后半启动失败；这项取舍必须随本页接受，不能当作对旧“全 ACTIVE 后确认”的文字解释。

## 契约责任到应用构件的投影

下表应用阶段名、局部贡献、配置项均为候选；provider 已有公开操作保留其实名。服务名沿所链 provider，不新增领域服务。

| 行／责任 | 插件、操作及接线 | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| AB-1：原 A-2；storage R-U1～R-U8、P-1/P-13 | 应用唯一 owner 调公开 `openStorage`，传同一 guard、全部阶段迁移及只读 checks；局部 storage 贡献只 provide 此真实实例 | [storage-sql](../../packages/infra/storage-sql/design.md)、[storage 协议](../../packages/core/storage/design.md)；不另开第二个实例 | 确认集合、完整迁移及无早期业务写见下；AB-V1/V2/V3 待验 |
| AB-2：原 A-1；AI3 S-8/S-15/S-26/S-27/S-44；OG2 S-26/S-63；AR2 S-7～S-12 | 真实凭据校验、AI、OG、registration fiber 先就绪，调用权限仍由应用关闭；确认且全部阶段就绪后才 register／issue／exchange／currentTenant／standing | [AI](../../packages/tenancy/account-identity/README.md)、[OG v2](../../packages/tenancy/organization-governance/v2-design.md)、[registration](../../packages/tenancy/account-registration/README.md)、[credential-verification](../../packages/tenancy/credential-verification/design.md) | 启动体不调用业务方法；凭据政策缺席仍沿 AI3 拒绝，正例给真实政策；AB-V1/V4 |
| AB-3：offer-expiry1 S-16/S-17、原 A-2 | 同一 clock fiber；迁移前用其公开只读 preflight，启动／续约可写租约；确认前核真实 now 可用 | [clock](../../packages/infra/clock/design.md)；不新建第二只 clock 或伪时间源 | ACTIVE 不代表 now 有值；重开租约窗口按显式等待策略，AB-V3/V7 |
| AB-4：MD3 S-8/S-18/S-23/S-34；原 A-6 | 确认后才装目录 `faceMode: management`；插件自己的 loadManifest 原样在 provide 前执行 | [目录 v3](../../packages/model/model-profile-directory/v3-design.md) 与公开 Config Schema | 不复制清单序号／历史判断、不制造空清单无写特例；AB-V2/V5/V7 |
| AB-5：MD3 S-7/S-19/S-20；CC2 S-7/S-12～S-15/S-20 | 确认后由应用唯一构造 binding reader 与 model-only CCL，把读闭包借给 `localCredentialOnly`；公开 bind 与受限 store 使用同一可信 pair | [CCL v2](../../packages/infra/credential-custodian-local/v2-design.md)、D-075 的符号许可 | bootstrap 可构造／传递 reader，不执行它或 readBoundReplicaIn；AB-V1/V6/V8 |
| AB-6：AR2 S-7/S-12；MD3 S-23；CC2 S-20；原 A-11 | 应用持有阶段门、已准入工作和一个顺序 cleanup；先停准入与排空，再撤借用者、关唯一 CCL、撤基础依赖、最后关 storage | 原 [装卸责任](design.md#成对装载与撤除) 的有限接线 | 不依赖 disposer 全局顺序；真实释放、无秘密观测与部分失败 AB-V3～V8 待验 |

## 候选启动顺序与两个门

1. **只读准备。** 固定全部精确版本及本阶段必需清单；先解析公开 Config Schema、核两组签名密钥配对、读取明确部署清单及模型 keyFile 的文件属性／密钥形状，固定本次配置值。目录配置／清单用公开 `ModelProfileDirectoryConfigSchema` 验表示，不调用 loadManifest，不在 app 复制持久序号和历史判重。只读准备不保证稍后文件不会损坏，组件构造和运行时仍按原规则重核。缺密钥、非法配置、重复服务键启动失败；不自动换钥。受限诊断先取得，秘密值不进快照摘要。
2. **一次迁移和基础装载。** 合成该阶段所需的 clock、AI、OG、目录及 model-only CCL 全部公开迁移，检查序列前缀与 clock 只读回拨，再以一个 guard 打开真实存储。后装目录不意味着后跑迁移；确认后不追加遗漏的迁移。应用局部 storage 贡献发布 openStorage 返回的同一实例，仅拥有贡献撤除，实际 storage 关闭权仍在 bootstrap。装真实 clock、credential-verification、AI、OG、registration。此时不运行账号读取、登录核实、资格读取等“看似读”的业务操作；其中有些普通操作会落活动／到期事实，不能拿来作只读启动探针。
3. **升级确认门。** 预先固定基础必需集合为上述 storage 贡献、clock、credential-verification、AI、OG、registration 六条 fiber，全部须 ACTIVE；storage 已实际完成全部迁移，所有构造结果已检查，clock 的真实 now 可用。clock 暂不可用时，只按显式配置的等待／截止策略等待同一个实例；截止仍无值即启动失败，不新造时钟或假时间，不隐藏重试业务。然后且仅然后调本次同一 `guard.confirm()`，核 `snapshotTaken ⇒ snapshotRemoved`。确认成功记录是后续启动写入的唯一放行事实；没有它不能进入第 4 步。
4. **确认后的目录与副本组件。** 装目录 management，等它真实完成 loadManifest 并 ACTIVE；构造同 storage 的公开 binding reader，由应用唯一调用 `createModelReplicaCustodian`；其密钥／表读取校验成功后，把读取闭包借给本机 `localCredentialOnly` fiber。此时 CCL 没有独立领域服务或 fiber，不以“CCL ACTIVE”造一个不存在的判据。目录 loadManifest 已提交而随后的 provide、CCL 构造或 lookup 启动失败，均关闭阶段入口并收口资源，保留迁移和已提交清单；不复原升级快照。
5. **完整阶段准入门。** 原六条基础 fiber 加目录管理、本机 lookup 共八条必须都 ACTIVE，唯一 CCL 构造成功、同 storage 接线确认、没有关闭已开始或未收口启动失败。这个集合启动前已固定，不能在某项 PENDING／FAILED 后删掉它使测试变绿。仍由应用持有所有服务引用与 Context；此前不给机器场景或回调业务权限。此门只开放本阶段真实认证和凭据场景，不开放未装载模型能力。
6. **真实身份和来源。** 通过真实 registration.register、logins.issue／exchange 取得账号与 LoginStateId，经 currentTenant／standing 现取有效租户，核 tenant.account 与真实登录对应。可信来源回调只在此后调用，携本次已核账号／租户取得 sourceRef/body 对；先 bindCredential，再同对 storeBoundReplica。`stored:false` 或失败保持原结论，绝不重贴最新引用、改用旧 body 或默认 factory。场景仅经 lookup.value 走 P-1r 的真实共同事务读，bootstrap 不直执行内部 reader；返回值／日志不呈现秘密。注册中断或后续失败按原幂等／认回规则及显式新尝试处置，不整段自动重放。

第 2～3 步允许的写入只有迁移自身的结构／初始元数据和同一 clock 的租约建立、续约／撤除收回。目录迁移初始化序号 0 不算已采用一份发布清单；不得把正序号 loadManifest、账号、登录、成员、绑定或副本写入藏进这个例外。已建库无待跑迁移时可能没有快照，基础租约元数据仍可留存；本页从不承诺“失败前任何字节都不变化”。不把确认前的 clock 结果交给业务调用者或外部来源回调。

可替换等待机制和截止值沿原显式调度配置；没有参数不替用户写一个常数。启动阶段不接配置热更／服务替换请求。阶段开放后每次场景准入现核全部必需 fiber 状态及关闭标志，任一不再 ACTIVE 就拒绝该次新准入；已进入的方法仍跑完自己的提交，不把准入检查当作跨 fiber 原子锁。恢复／重开必须重新按实际 provider 状态核门，不能用曾经确认过的内存布尔值替新 storage attachment 确认。

## 关键选择与被保留的代价

| 候选 | 最强论证 | 问题／本方弱点 | 处置与置信度 |
| --- | --- | --- | --- |
| 保持所有 fiber ACTIVE 后确认，允许目录先写 | 对全部启动构件保留回退机会，最接近旧装配文字 | 会使已提交清单被 guard 快照撤回，且违反确认前无业务事实；空清单同样写 | 不采用；冲突已可定位 |
| 为目录新增 dry-run／延迟 loadManifest 模式 | 原全 ACTIVE 门可保持，业务采用可以后置 | 当前公开面无此模式，改变 preprovide／服务可用责任，须另改 provider 设计／实现；重复判断有漂移风险 | 本增量不采用；若必须保留整体启动回退再回 provider owner |
| **基础就绪后确认，目录启动写入后再开完整阶段门** | 使用现有存储 guard 和目录公开行为即可兑现两种门，不动业务契约 | 后半启动失败保留新迁移／清单，旧程序未必可重新打开；须明确报告并验证重开 | 推荐候选，置信度高；独立评审与采用前不可据此实施 |

| 本页具体选择 | 落选方最强论证 | 本方弱点／复查信号 | 置信度 |
| --- | --- | --- | --- |
| bootstrap 唯一 openStorage＋局部借用贡献，顺序关闭实际资源 | 直接 storageSqlPlugin 少一段贡献接线 | 应用必须负责每次部分失败时调用真实 close；漏掉会留下属主。收益是明确持有资源与关闭结果，不把插件日志当 close 成功 | 高；AB-V3/V8 未验 |
| 保留独立 clock／AI／OG／registration／目录／lookup fiber，CCL 为唯一普通组件 | 全部并入一个插件更容易统一状态检查 | 多条生命周期须由应用门与顺序收口协调；不能靠必需注入自动取消在途 | 高；沿已有 provider 边界 |
| 基础阶段启动真实鉴权 provider，但关闭全部业务调用 | 全部身份 provider 延后确认可缩小早期装载集合 | 本方要证明启动体无业务调用，未来 provider 新增启动写入必须重新分类；换来密钥／依赖／凭据构件早失败 | 高；AB-V2 是持续回归门 |

## 对存储 owner 的要求、提交与交错

本页不选择新的数据库或改协议；使用原 A-2 已选择的提供者。所有以下要求必须由同一个真实 AtomicStorage 及原 provider 满足，不能用同文件不同实例冒充。

| 要求 | 责任／共同对象与依据 |
| --- | --- |
| 完整迁移、迁移前只读 preflight、属主排他、确认／恢复可观察 | storage R-U1～R-U8；guard 附着与快照／标记归 storage owner。全部迁移在确认前完成，排他一直保留至真实关闭；装配不得另开 upgrade:false 写者 |
| 确认前基础时间状态的顺序与重开 | clock owner 的真实 clock_lease 行及其存储锁；本阶段一个 clock，没有进程内第二份高水位。旧租约窗口只答 unavailable 或真实时间，不因此认身份／清单已准备好 |
| 官方序号、档案、配置修订、处置同提交且重放不降级 | 目录 owner 的 model_manifest_state 行和档案／历史对象，MD3 S-8/S-18/S-34；guard 确认在其首次业务提交之前完成，不产生跨事务原子启动承诺 |
| 绑定变化与副本来源读取／写入能排序 | 两个写入 owner 共同触碰 model_credential_binding(tenant) 行：目录写它，CCL 经受限 reader 在同 unit 锁定读它，再写 credential_custodian_replica(tenant)；MD3 R3-7/R3-8 与 CCL K-M1/K-M2/K-M4 双方要求原样继承。时间戳、进程锁或 present 读数不能替代该对象 |
| 真实身份事实及注册部分完成持久保留 | AR2 S-8/S-9/S-10 的普通独立提交链及 AI／OG 原唯一／引用约束；应用不把注册、绑定、副本和清单包成新跨 owner 事务 |

反向交错一：确认成功 → loadManifest N 提交 → provide 失败 → cleanup → 重开。不得回退 N；相同清单按 MD3 S-18 认回，旧 N−1 返回 manifestNotNewer 并保留实际最新状态，同序号异内容仍拒绝。应用不能声称请求清单就是实际清单，不能为启动通过删除持久状态。

反向交错二：来源 A 已被真实登录方取得 → 目录绑定轮换 B → A 的 store 到达。共同绑定行令晚 A 得 stored:false；若 A 的 store 先锁行完成，后 B 仍可轮换，下一次 P-1r 不交 A。再验 lookup 已锁 A 而 B 轮换等待时，交出的值只属于该共同单元的真实排序，不从一次 present 缓存推断。启动顺序不替代既有真并发义务；本阶段只复核接线及代表交错。

## 失败、撤除、重开与可观测性

| 取得的资源／贡献 | owner、可用时点 | 部分失败和关闭次序 | 保留／不得声称 |
| --- | --- | --- | --- |
| 诊断 sink、配置快照、阶段门 | 应用根 owner，最先建立，门到第 5 步才开 | 首先关新准入；记录失败阶段及门状态；最后有界 flush／close | 默认不记密码、presentation、私钥、模型 key、sourceRef、body、密文或其散列；sink 坏不改业务结果 |
| 业务 Promise／来源回调／外层 atomic | 应用记录每个已准入调用；provider 仍拥有本次事务 | 关门后等实际完成；失败保留原返回与已知／未知提交，不以取消信号代替结束 | 未返回的副本写不推断未提交；身份／清单事实不整段回放 |
| 目录及 lookup fiber | 各 provider owner；确认后装载，完整门前私有 | 停新场景并排空后先撤 lookup，再撤目录；lookup disposer 等真实外层事务，不关闭借用 CCL | 撤除不删绑定／清单，旧方法按自己的提交结束 |
| model-only CCL | 应用唯一实例，lookup 只借读闭包 | 所有 source/store/read 与外层 atomic 静止后，唯一 owner await 同一个幂等 close；重复 app.close 共享同次 cleanup | 不删除 keyFile／密文、不造完整 credentialCustodian；关闭失败不报告已静止 |
| registration、OG、AI、credentials、clock | 各自 fiber；同一实例链 | 业务先排空，再逐条 await 撤 registration→OG→AI→credentials→clock；clock 必须在真实 storage 关闭前结束续约／收回 | 不靠 Cordis 并发 disposer 自动排序，不用新 clock 绕过旧租约 |
| storage 贡献、真实实例及 guard | 应用持 openStorage 结果；局部贡献只借用 | 最后撤 storage 贡献、await 实际 storage.close，再查 guard.pending；根 Context 在受管对象都收口后撤除 | 确认前有快照按 R-U4/R-U5 恢复；确认后不恢复；close/pending 不明确则报告残留，不宣称成功 |

确认调用尚未成功返回时，绝不装目录或调用业务。若确认删除失败且快照仍在，按原恢复链处理；若删除已生效而目录落盘失败，沿 storage 已登记缺口可能没有可恢复快照。此时启动失败、入口保持关闭，报告“确认未完成”与实际 pending／恢复状态；`pending: clear` 不足以推断确认成功、恢复成功或库回到旧版。应用不自建删除／复制快照补丁。正常确认后后半失败，重开只读实际状态并按原操作的显式认回规则继续；不会自动恢复备份或重新注册账号。

应用独占生命周期串行启动／关闭：关闭与 confirm 相交时，以已开始的 confirm 实际结果收场，关闭标志阻止继续第 4 步；不得等待完成后误开入口。两个 app 启动竞争同部署文件，继续由 storage 属主拒绝第二者，不用应用进程锁取代。崩溃后不声称 cleanup 完成；下一进程重新做守卫／迁移／clock／密钥检查。

记录同一 runId 的阶段开始／结束、基础必需状态、confirm started／succeeded／failed、confirmation 三布尔、场景门开关、清单采用／认回／拒绝、已核租户关联、来源匹配布尔与关闭结果。只用固定错误类别和允许的安全字段，不转储异常 cause／原始配置。业务锚点仍归真实存储，诊断不是恢复账本；sink 故障独立计数、权限／限额／保留沿原 A-11 和本机 owner 政策。命名空间／日志无网络凭据，零模型 HTTP 是本阶段结构事实。

Cordis 的依据仍是 [inject-has-no-optional-form](../../../basis/cordis/inject-has-no-optional-form.md)、[plugin-body-reruns-on-provider-change](../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[plugin-throw-fails-fiber](../../../basis/cordis/plugin-throw-fails-fiber.md)、[effect-disposal-concurrent-not-ordered](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)，均有 4.0.4 probe。provide 纳管与 fiber 状态读沿 [kernel-basis 已有验证](../../../../../packages/core/kernel-basis/verification/README.md)，未由它们推导出本组合关闭保证。本阶段没有新事件协议或异步 bail 授权门。

## 缺口与受阻消费者

- **AB-G1（原 A-2／目录 MD3 S-18/S-23）**：候选将确认点前移，尚待独立架构评审与技术采用；受阻消费者是本应用的真实鉴权启动实施。现有 design.md 不能被静默解释成已经允许本顺序。
- **AB-G2（AI3 S-15/S-26/S-44、OG2 S-63、CC2 S-12）**：真实注册／密码验证／登录／租户／可信来源组合还没有本应用证据，owner 为 app 实施与独立验收；AB-V1/V4/V6 通过前不声明认证来源完整。身份读取、绑定 reader 的符号级结构门继续适用。
- **AB-G3（storage R-U6/R-U8、MD3 S-23、CC2 S-20）**：确认前后故障、部分 provide 失败、重开、并发 close 及唯一组件资源收口尚未执行；AB-V2/V3/V5/V7/V8 由 app 验收承担，provider 缺陷交原 owner。storage 已有确认删除后落盘失败边界保留，不由本页关闭。
- **AB-G4（原完整应用范围）**：本页只修 A-1/A-2/A-6 的有限启动接线，不推导 assets/session/runtime/transport 等后续阶段也可在同一确认点安全装载。以后新增一个会写业务事实的启动体，须重新核该阶段清单与对应接受投影；37 模型生产认证、PG 组合、完整 CCL 和全 Loop 仍不在本阶段。

迁移合成、配置／密钥只读准备、入口身份核实、真实来源 pair、同实例接线、阶段门、顺序 cleanup 和安全观测均由本应用承接。没有新增“归装配但未点名”的 owner；相应运行证据尚缺，不能用稿件齐全替代。
