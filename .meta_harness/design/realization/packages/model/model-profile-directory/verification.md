# model-profile-directory 验证与证据

本页记本节点触发的证据义务、实际跑过什么、覆盖到哪里。契约层的证据状态归[契约验证入口](../../../../spec/capabilities/model-profile-directory/verification.md)。**源码不存在，本节点没有任何实现层的证据。**

## v4 候选增量（2026-09-28）

范围为 [v4 候选投影](v4-design.md)；新增义务不把下方历史义务标成完成。源码已有 `directory.spec.ts`、`manifest.spec.ts`、`lifecycle.spec.ts` 与真实文件库支持，但本次没有运行产品测试，也没有 v4 符合性证据；`bindings.yaml` 仍是 0 条。

| 义务 | 契约条款 | 必须可观察的验收与负控 | owner／当前状态 |
|---|---|---|---|
| V4-1 完整输入写入 | directory v4 S-14、S-18、S-36(1)；data v4 S-32、S-33 | register 与启动清单输入含显式 unknown 及合法有限 cap 可成功；缺必填事实、image 缺逐图 cap、cap 超有限事实上限均拒绝；相等边界通过 | 本包＋core/model-profile；待实施 |
| V4-2 整项更新与授权 | S-31、S-36(2～3)、S-38 | 同时切换模态和匹配限制后完整合法才写；局部对象不得与旧对象深合并；无权者提交完整值冲突仍返回 notAuthorized；不泄漏旧 cap | 本包；待实施 |
| V4-3 无变化与配置历史 | S-34、S-36(2～3) | 同值字段重排／精确数值等值认回不新增事实；新 cap／上游事实影响建档认回、清单同序号比较及更新；同 revision 不同 configuration.values 仍拒绝，cap 变化不清空历史 | 本包；待实施 |
| V4-4 不完整旧行与列表 | S-16、S-17、S-36(4、6) | 真实 SQL 写入合法 v3 但缺新字段的旧行；精确读取为 unavailable，物理缺行为 profileNotFound；一个可见旧行与多个合法 v4 行共存时整份列表 unavailable，无提前发布；另一租户不可见旧行不污染本租户列表 | 本包；待实施 |
| V4-5 六项时标 | S-36(5)、S-37；data S-11 | 分别改变六项均取不早于旧值的时刻；绑定／参数／provider／在册单变和集合重排不变时；同精度相等允许；时钟倒退或 unavailable 时零写入或回滚后 unavailable，原行和历史保持；注入未知提交时不得伪称回滚已完成 | 本包；待实施；倒退失败映射已由主线确认，节点仍候选 |
| V4-6 同行真并发 | S-36(4)、S-38 | 两个独立 SQLite 连接用屏障交错同一行两份完整替换；读回只有合法串行结果或 unavailable，不出现旧 cap＋新事实；关闭并重开库后再核完整值 | 本包＋storage-sql；待实施，单进程顺序测试不替代 |
| V4-7 清单回滚与中断 | S-18、S-36(3)、S-38 | 混入非法条目；另在已写首行／配置历史后注入后条配置冲突及进程提交前终止；重开四表，档案、历史、序号与处置均无半写，合法清单重装认回原处置；并发列表只见整份已提交快照 | 本包＋storage-sql；待实施，保留原始数据库与进程退出证据 |
| V4-8 显式旧值升级及历史保持 | S-36(6～7)、G-12 | 有来源的完整升级输入保留身份／在册／配置历史；输入不完整、原值变更或任一写入失败全批回滚；成功后重开可完整读；升级前已写出的调用历史逐字不变，旧精确版本消费者仍可读／结算 | 本包／清单与装配 owner；资料和机制验收待交付，不要求扩展管理应用 |
| V4-9 公共面和生命周期 | S-12、S-19～S-23；SYS-OPEN | 类型消费核心 v4 无第二套形状；真实 Cordis 卸载旧引用拒绝新调用，在途写跑完或明确失败；重载读回完整 v4；凭据来源匹配与秘密隔离回归；README／README_ZH 示例通过 | 本包；待实施，无新增模型限制服务 |

### 本次检查与缺口

2026-09-28 实际执行 `python3.12 .meta_harness/tooling/src/check_design.py --root .meta_harness/design --gate internal --formal skip`：exit 0，输出 `passed gate=internal; formal=skip`；另执行 `git diff --check` 通过。formal 显式跳过，未运行产品测试，设计检查不是 v4 实现证据。G4-1 阻断契约未采用时的正式实施；G4-2 的显式完整升级输入由发布者与装配承担；G4-3 的真实数据库、时标和读取失败证据由本包承担；G4-4 产品装配与跨进程边界继承旧缺口。目录未验证实际 token 计量、发送准入或 37 模型适配，不据完整读写成功宣称这些成立。

## v3 候选增量（2026-09-27）

对象为 [v3 候选实现设计](v3-design.md)，输入坐标 `capability.model-profile-directory/v3` 与 `data.model-profile/v3` 在起草后已由主线 D-070 接受；提供者候选仍未接受。本节不改变下方旧证据状态；没有本节点源码，不把计划中的测试记为执行结果。下表 S-n 默认目录 v3，data 指 model-profile/v3。

### 新增及受影响的证据义务

| 编号／条款 | 可失败的验收场景及判据 | 状态／owner |
|---|---|---|
| V3-1：S-14、S-34；data S-29～S-31 | 经真实目录 register/read/list/update/loadManifest 往返完整绑定；缺任一分量、definition.modelId 不等 routeName 在指定次序拒绝。带大整数、高精度十进制、重复 JSON 成员、对象重排、数组重排、boolean/number 反例；不能先有损解析后再比 | 未开始；本节点＋core/model-profile v3；G3-1 |
| V3-2：S-14、S-31、S-34(4)(5) | 两目录实例、两存储连接、同一 SQLite 文件，对同档案同一新修订分别写不同 values，交错双向执行；至多一方成功，另一方 malformed，profile/history 对齐。两者同值按原认回规则。撤去共享事务／唯一约束的故障版本必须令断言失败 | 未开始；本节点＋storage-sql。pg 单独跑才覆盖 pg |
| V3-3：S-31、S-34 | c1→c2→c1：c1 原值可以采用，改义值拒绝；改实现／模型定义修订但重复 c1 不得绕过。仅 adaptation 改变 updatedAt 不动；五项上游属性变动才推动。拒绝嵌套补丁与删除绑定 | 未开始；本节点 |
| V3-4：S-5、S-23、S-34(6) | c1→撤回→重启→relist→c2→c1 改义仍拒绝；同范围同名 register 不产生新身份。验证提供者卸载、迁移正常执行均不清历史；没有 delete API 或删除后的新身份产品假设 | 未开始；本节点＋装配升级验收 |
| V3-5：S-8、S-18、S-34 | 新清单两条，第二条与配置历史冲突；读到的全部档案、配置事实、ordinal/dispositions 仍旧值。逐个注入写失败、commit 前进程退出；重开真实文件确认没有部分历史或处置 | 未开始；本节点＋storage-sql；故障点与原始文件快照留证 |
| V3-6：S-18、S-35 | 清单提交后丢回执、重启同序号同完整内容，返回原 dispositions 且不写／不重发。旧序号／同序号不同内容同时含历史冲突时必须 manifestNotNewer。仅绑定改动为 updated；custom 同名行及历史逐值不变 | 未开始；本节点 |
| V3-7：S-6、S-16、S-17、S-34 | P-1 真存储 readProfile/listProfiles；并发 update 不得把旧 profile 与新 values 拼成返回值；两组织多租户同修订各值互不冲突。跨链引用在读取前拒绝，撤回与被覆盖行仍按契约列出；不需要或伪造中心请求 | 未开始；本节点＋单机验收装配 |
| V3-8：S-10、S-11、S-13、S-34 | 真实 memberships 的无权／撤销／不可用分别测试；用档案存在性、配置冲突构造探针，未授权时 protected 查询计数为零，不泄漏不同结论。authorized update 才查旧行和历史；不得用同库巧合声称跨 owner 撤销原子性 | 未开始；本节点＋organization-governance |
| V3-9：S-7、S-19、S-20、S-32 | 绑定管理真实持久化；tenant 优先、custom 无 tenant 不回落 factory、无组织 key 路径。tenant 格读取 unavailable 时即 unavailable，不能问 factory；已绑定但取值失败不当 absent。解绑不删档案／历史或保管本体 | 未开始；本节点＋凭据提供者；中心解值成功分支受 G3-2 阻断 |
| V3-10：S-12、S-20、S-34(7)；data S-30 | 密钥／CredentialRef 哨兵不得进入 read/list、失败、通知、默认诊断或档案快照；合法声明式 configuration.values 在 read/list 与档案快照中须完整保留，但不写默认诊断。逐 symbol 结构检查的正例允许可信 bootstrap 构造 reader/factory 并传递；负例拒绝 bootstrap 执行返回 reader/readBoundReplicaIn、产品 caller 导入工厂／取值、P-1r close 共享组件，以及向未具名者转交闭包。禁止配置执行代码的路径有反例；不把有限哨兵检测当任意秘密识别证明 | 未开始；本节点＋入口／诊断 owner；通用非受信配置入口 G3-4 |
| V3-11：S-21 | 真实 withdraw/loadManifest 提交后通知一次；已撤回不再发，relist 不发；监听者抛错后行仍 withdrawn 且错误可查。没有监听者仍执行发出；不宣称通知可靠送达 | 未开始；本节点；跨范围监听仍须旧 MPD-N6 取证 |
| V3-12：S-23、S-34 | 真实 Cordis4.0.4：依赖缺席 PENDING、非法配置 FAILED、provide 前清单失败无服务；依赖重跑及撤除与进行中的写交错，写事务完整成功或具名失败，已提交历史不消失，不伪造取消。fixture 必须先成功一次，再重跑并发验证 | 未开始；本节点＋kernel-basis＋storage-sql |
| V3-13：S-35 | 注册新版本→目录失败→旧绑定仍可读；目录采用→停止旧版→仍显式旧绑定的 custom 不能被重写；合法未注册绑定成功保存而 runtime acquire unavailable。已有调用快照保持旧值，新调用读到已提交新值 | 未开始；本节点＋pi-ai-transport＋runtime。研究原型不能代替这次真实组合 |
| V3-14：S-12、S-19、S-20、S-22；CCL 新技术投影 | 真登录状态／租户及 trusted bootstrap 的真实 sourceRef/body，经新 storeBoundReplica 写加密副本、localCredentialOnly 读取；重启后仍核对 sourceRef。已选 tenant 格时无行／无ref／错ref／打不开→credentialUnavailable，运行期密钥／存储不可用→unavailable，均不问 factory；custom 绝不回落。缺keyFile／枚举非法／重复键启动失败；不用伪造 centerConnection 或 MCP OAuth 服务 | 受 G3-7 阻断；本节点＋CCL 新增量＋验收装配；不接受用旧 S-12/S-13 冒充 ref 关联 |
| V3-15：S-19、S-20；R3-7/R3-8 | **顺序反例**：bind RefA、存 A、bind RefB、不更新副本，下一次取值必须 credentialUnavailable 且不发网；不得交 A。存 B 后应交 B。**真并发**：A 捕获持锁先于 bind B，以及 bind B 先于 A 延迟捕获两种次序；B 副本不被迟到 A 覆盖。匹配读取与 bind/unbind 交错，共同绑定行锁决定先后；跨StorageUnit、失效Unit、恒值reader、去锁故障版本必须失败。旧 generic storeReplica 覆盖后 sourceRef 清空；不得重新标当前Ref。检查 Ref/body 从不出日志和 afterCommit。atomic 提交故障时已暂取body不得交出 | 受 G3-7 阻断；本节点＋CCL＋storage-sql；SQLite 两实例真实库执行，pg 另测；没有并发排除前提 |
| V3-16：S-12、S-20；model-replica 技术结果映射 | 覆盖 `{body}`／`{absent}`、closed、key 不可读、StorageUnavailable、内部坏ref、四型存储异常及错/失效/重叠Unit。先在同一Unit暂存可观察写入，再令参与read抛错；即使上层试图捕获也必须回滚，只有atomic外层可将StorageUnavailable映射unavailable，其他缺陷继续抛。clock不可用时已有匹配副本仍可读，store失败由bootstrap处理；全部失败无body泄漏／零出网，且不问factory | 未开始；本节点＋CCL＋storage-sql；与CCL失败表逐格对齐，不以静态类型测试代替真实事务 |

本地凭据成功分支依赖 CCL 新技术投影保留真实 sourceRef，并核对实际绑定；**旧 storeReplica/readReplica 不足以覆盖本机 RefA→RefB**。可信本机 bootstrap 必须持有同一来源的 sourceRef/body 及真实登录状态／租户归属输入，不能提交时把旧 body 标为当前 ref。它不证明中心送达协议；factory 值来自受管装配，凭据 body 不写入目录配置历史。

### 本机凭据引用独立评审后的修订

主线转交独立评审反例：credentialPresent 仅返回存在与范围，readReplica 只按 tenant 返回 body；RefA→RefB 后即使没有并发也仍可能交 A。该反例违反目录 v3 S-19 下一次取用生效与 S-20 按绑定取值；不能归入中心传播范围。原候选的成功路径声明已撤回。

现候选改为目录真实绑定读取、CCL 来源引用捕获、同一 StorageUnit 中锁定共同绑定行并匹配 sourceRef。CCL2 六个领域操作不变；有限技术端口由 CCL owner 起草新设计增量。见 [替代比较与动作链](v3-design.md#当前绑定与副本引用匹配的有限替代)。这只是修订处置，**未作独立复审或接受声明**；V3-14/V3-15 尚未执行。

CCL owner 的 [v2-design 候选](../../infra/credential-custodian-local/v2-design.md) 已成稿；R3-7/R3-8 与 K-M1/K-M2/K-M4 双向指明共同对象。两节点统一由装配唯一拥有 model-only 组件，bootstrap 与 P-1r 借用，等待外层 atomic 实际结束后才关闭。2026-09-27 此修订运行同一设计检查命令，先因并行节点未完成的两个锚点失败（目录节点未被点名），节点成稿后重跑退出 **0**，末行 `passed gate=internal; formal=skip`；本节点 `git diff --check` 通过。没有执行 V3-14/V3-15 或任何生产请求。

后续有限表达修订按 symbol 区分工厂构造与返回闭包执行：可信 bootstrap 可以构造和传递真实 reader，不能据此执行取值；CCL/P-1r 才可执行 reader。同步 CCL 完整技术失败表，P-1r 的 StorageUnavailable 仅在外层 atomic 回滚后映射 unavailable，内部缺陷不伪装为 credentialUnavailable；V3-10 新增许可正例与越权负例，V3-16 登记逐格映射和真实回滚义务。此处仍只记修订，未宣称独立复审闭合。

本次有限表达修订完成后，设计检查实际退出 **0**（`gate=internal; formal=skip`），本节点 `git diff --check` 通过。V3-10/V3-16 的结构负控及真实回滚仍未执行，bindings 仍为 0。

### 本次实际执行与覆盖缺口

2026-09-27 本次实际运行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`，退出码 **0**，输出末行：`PASS: design tree … passed gate=internal; formal=skip.`；全部 formal 项均明确 skipped。此结果仅为设计树内部导航／登记检查，不是实现或形式运行证据。未运行目录单测、存储并发或生产请求；`bindings.yaml` 维持空表。

同日后续检查退出码 **1**，输出 `FAIL: design validation found 5 error(s).`：并行更新中的 acceptance 缺 scope_clauses、assembly-manifest/v3 锚点两处、messages/v4 冻结资源未见 catalog、formal task[37] 工件未全登记。本节点四件套未被该输出点名；这不能称为全树通过，已交主线处置，本节点不越界改 registry/spec。

主线登记稳定后，以同一命令对本节点最终候选及全树复查，退出码 **0**，末行恢复为 `PASS: design tree … passed gate=internal; formal=skip.`。formal 仍全部跳过；`git diff --check` 对本节点三份已跟踪文件通过。中间失败记录保留，不把最后一次文档通过解释成实现验证。

缺口与受阻消费沿 [G3-1～G3-7](v3-design.md#归装配及缺口)：候选采用和 v3 数据包、中心租户凭据解值、独立验收装配、非受信配置入口、真实并发／持久证据、原有远端协议和通知范围，以及新增的本机引用关联。旧 V2 的有限证据与其他节点的通过结果均不自动提升本增量。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| `capability.model-profile-directory/v2#S-25` 建档、撤回、再读 | 包内场景测试：真实 P-1 ＋ 真实存储（sqlite 临时文件库）＋ organization-governance 的真实 `memberships` | 未开始 | 本节点；有实现即可跑 |
| `#S-26` 同名两条只有先成的一条成立 | **真并发**：两个装配、两个存储连接、同一库文件，两位超管同时建同名档案；另跑认回一支 | 未开始 | 本节点；有实现即可跑（sqlite 写事务库级串行；pg 上另跑一次才算覆盖 R-2 在 pg 的兑现） |
| `#S-27` 清单五种处置、旧清单被拒 | 场景测试：经插件体装入（换配置重启三次：新清单、更小序号、原样重装），含重启一支 | 未开始 | 本节点 |
| `#S-28` 取最具体的一把、读不到不回落 | 场景测试，含故障注入（租户那一格读不到） | 未开始；中心取值那几支**受阻**于中心一侧没有保管方（保管方契约 G-7，MPD-N1）；据点取值那几支经保管方最小提供者 `credential-custodian-local` ＋ 经 `storeReplica` 写的种子可跑（节点已立、尚未建包）；「有没有」那几支不受阻 | 本节点 ＋ 保管方的 owner |
| `#S-29` 秘密不出本契约 | 哨兵串场景 ＋ 静态检查（读面返回类型不含凭据值与引用） | 未开始；规则未写（MPD-N4） | 本节点 ＋ `tools/ts-checks` |
| `#S-30` 无权者探不到名字 | 场景测试，含成员资格 `unavailable` 的故障注入 | 未开始 | 本节点 |
| `#S-12` 取值问法只给运行时（装配给） | 静态检查：只有 `packages/model/model-request-runtime` 解析 `credentialLookup`；**保管方的 `readReplica` 只许 P-1r 调**（N-37 ⑩，保管方 S-19 第 3 行），各带一条「故意违反就失败」的自测 | 未开始（MPD-N4） | 本节点 ＋ `tools/ts-checks` |
| `#S-21` 通知必发、监听者失败不改已提交的撤回 | 场景测试：挂一个会抛出的监听者，撤回照样成立、error 日志可见 | 未开始 | 本节点 |
| `#S-22` 第二行（据点读的新鲜度）与 P-1r | 协议级测试 | **受阻**：未来资产/据点入口（版本未分配） 未起草（MPD-N2） | 主线 → 未来资产/据点入口（版本未分配） |
| `#S-22` 第三行（据点凭据副本，D-060 §八 M47） | P-1r 单元测试：保管方 `readReplica` 答 `{ body }` ⇒ 离线照常取值；答 `{ absent }` 且 `reachability` 为 `unreachable` 或 `undetermined` ⇒ `credentialUnavailable`；答 `unavailable` ⇒ `unavailable`（**不当 `absent`**）；保管方缺席且离线 ⇒ `credentialUnavailable`（不是「照常」）；副本表与读面里找不到哨兵凭据串。保管方与中心连接用最小提供者 `credential-custodian-local`（种子经 `storeReplica` 写副本）、`center-connection-replay`（`center-connection-probe` 包的验收装法，脚本给可达性序列） | 未开始；以上各支有实现、两个最小提供者建包即可跑（节点已立）；「可达时向中心取值、写成副本」那一支**受阻**于未来资产/据点入口（版本未分配）（center-connection G-1、保管方 G-6，MPD-N2） | 本节点 |
| 公开函数面（[design 的公开面](design.md#公开面)） | 单元测试：`scopeChain`、`winningRow`（含 `allowed` 为全部登记档案时与只读链等价，D-063 R-4）、`manifestDisposition`（五种处置与 `manifestNotNewer`）、`configEligibility`、`credentialSlot` 逐格；P-1 与 P-1r 的对应判定只调这几个函数（结构检查） | 未开始 | 本节点；有实现即可跑 |
| `#S-14` 撞名后同一事务重读（pg） | 在 pg 上跑 `#S-26`，确认语句级失败后同一事务仍可读（core/storage P-2，由 storage-sql 承接） | 未开始 | 本节点 ＋ `infra/storage-sql` |

## 覆盖缺口

- **没有任何证据**：全部义务未开始；中心取值与 P-1r 向中心取值两处受阻（MPD-N1 中心一侧、MPD-N2）。
- **离线用据点副本调模型**（PF-016 §6.17／§6.20）：读副本那一半经保管方最小提供者 `credential-custodian-local` ＋ 种子可证；副本怎样来（`storeReplica` 的登录状态与值）要未来资产/据点入口（版本未分配），产品装配里没有兑现，只能证「如实收成 `credentialUnavailable`」那一半。
- `bindings.yaml` 为空，与本页一致：没有一条契约承诺已有会失败的证据。
- R-2 在 pg 上的兑现（范围键非空、唯一约束覆盖已撤回行）只有在 pg 上跑 S-26 才算覆盖；sqlite 上的通过不代表 pg。

## 修订波（2026-09-25 公开面）

依据：D-063 R-1、R-2、R-4，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)，D-060 §八 N-37 ⑤⑩。本波只改节点；契约侧（引替身与 C-n 处）由规格侧并行落，本节点只引条款号。**处置不等于接受或评审闭合。**

| 事项 | 依据 | 处置 | 落点 |
| --- | --- | --- | --- |
| 公开面 | SYS-OPEN；D-063 R-2 | 新开「公开面」：五个判定纯函数公开，目录本身只有服务面（取舍表）；运行时层才成立的不变量列出；登 MPD-N7 | design.md「公开面」、MPD-N7；README；本页函数面一行 |
| 保管方接线 | `capability.credential-custodian` v2 S-12、S-13、S-19、S-20、G-6、G-7 | P-1r 的取值改走 `readReplica`（`absent` 与 `unavailable` 分开）、`storeReplica`；P-1 在中心不取用保管方（中心一侧本版不收）；MPD-N1 拆成据点「接口已定、真承接者未到」与中心「本版不收」 | design.md「不在本节点」、插件表、S-20 行、inject 表、装配给表、依赖表、失败映射、R-9 段；MPD-N1 |
| 中心连接接线 | `capability.center-connection` v2 S-6、S-7、S-9、G-1 | P-1r 以 `reachability` 判可达、`reachCount` 判再连上；「断线不以换代表达」改指 S-7；向中心发请求仍在未来资产/据点入口（版本未分配）（MPD-N2） | design.md 插件表、S-20 行、inject 表、依赖表；MPD-N2 |
| MPD-N4 静态检查 | N-37 ⑩；保管方 S-19 第 3 行 | 加「`readReplica` 只许 P-1r 调」 | design.md `credentialLookup` 一行、MPD-N4；本页 `#S-12` 一行 |
| G-19 闭合的影响 | D-063 R-4 | `A` = 那一格登记的全部档案，由本节点读面直接给，不加操作 | design.md「实施缺口」首段；公开面 `winningRow` |
| 最小提供者节点互指（主线 2026-09-25） | `packages/infra/credential-custodian-local`、`packages/infra/center-connection-probe`（candidate） | P-1r 的凭据副本读写（保管方 S-12／S-13 两行）改指 `credential-custodian-local`；中心连接那一行改指 `center-connection-probe`（产品装法 probe、验收装法同包 replay 插件）；MPD-N1 改为「真承接者未到，最小提供者节点已立」 | design.md 实现路径、插件表、依赖表、MPD-N1；本页 `#S-28`、`#S-22` 第三行、覆盖缺口 |
