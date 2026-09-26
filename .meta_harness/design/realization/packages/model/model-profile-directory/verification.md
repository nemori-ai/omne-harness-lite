# model-profile-directory 验证与证据

本页记本节点触发的证据义务、实际跑过什么、覆盖到哪里。契约层的证据状态归[契约验证入口](../../../../spec/capabilities/model-profile-directory/verification.md)。**源码不存在，本节点没有任何实现层的证据。**

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

## 实际执行

没有。本契约没有登记的 formal task，本节点没有源码。

## 覆盖缺口

- **没有任何证据**：全部义务未开始；中心取值与 P-1r 向中心取值两处受阻（MPD-N1 中心一侧、MPD-N2）。
- **离线用据点副本调模型**（PF-016 §6.17／§6.20）：读副本那一半经保管方最小提供者 `credential-custodian-local` ＋ 种子可证；副本怎样来（`storeReplica` 的登录状态与值）要未来资产/据点入口（版本未分配），产品装配里没有兑现，只能证「如实收成 `credentialUnavailable`」那一半。
- `bindings.yaml` 为空，与本页一致：没有一条契约承诺已有会失败的证据。
- R-2 在 pg 上的兑现（范围键非空、唯一约束覆盖已撤回行）只有在 pg 上跑 S-26 才算覆盖；sqlite 上的通过不代表 pg。

## 独立评审

2026-09-25 本节点（修复波 3 对齐之后）随 N4 批经一次独立的架构评审（只读结构核对，无运行）：应修 1、建议 2，总判可进 G5；另有 N5 批（cli）反推出的离线凭据来源。主线据此裁定 [D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M47、M65、M69。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| D-1（应修） | 装配给表「在册状态变化之后」一行指向一个没有节点的单进程装配；产品装配里它是协议给、受阻 | 按 M65：改为「产品装配（cli）：协议给——中心可达时经 P-1r 读中心，据点副本经保管方；`serveBaseFaces: true` 只供尚无节点的开发装配」 | design.md 装配给表第 2 行、「一个 Context 里这两个服务键」一条、单进程装配代价一段；README 边界依据 |
| D-2（建议） | `profile.withdrawn` 不带 `thisArg` 的可见范围是未 probe 的假设 H-7；跨进程转发的过滤义务没有落处 | 按 M65：H-7 登 kernel-basis 待补 probe（MPD-N6）；「转发者按目标据点会话的范围链过滤」写进 G-7 的闭合条件——本节点记在 MPD-N2 闭合条件，契约那一处归主线 | design.md 事件 F③；MPD-N2、MPD-N6 |
| D-3（建议） | S-14「同一事务里重读」依赖 core/storage P-2，pg 上要保存点 | 按 M65：S-14 行写明依 core/storage P-2、pg 由 storage-sql 承接 | design.md 操作落点 S-14 行；本页证据义务新增 pg 一行 |
| N5 B-2（cli 批反推） | 离线调模型：P-1r 不落地凭据时据点上没有一条路读得到副本，与 PF-016 §6.17／§6.20 相抵 | 按 M47（改判 M44 的「P-1r 不持久凭据」）：P-1r 把租户那一把的副本经 `credentialCustodian` 落在据点（加密、按登录状态归属），取值先本地副本、中心可达时刷新；保管方缺席的本版离线如实 `credentialUnavailable`（P-2 记 `undispatched{credential_unavailable}`），显式缺口；`credentialLookup` 的静态检查加副本表一条 | design.md 插件表 P-1r 行、「不在本节点」一条、`credentialLookup` 一行、操作落点 S-20 行、inject 表、R-9 一段、装配给表第 3 行、依赖表、装卸表 P-1r 行、MPD-N1、MPD-N2、MPD-N4；README；本页证据义务新增一行 |
| 服务键 | 保管方叫法两处不一 | 按 M69：定为 `credentialCustodian`（本节点原用名） | design.md 插件表 |
| 反证清单 1～4 | 撞名判定域改成隶属树；成员撤销与目录写同一提交；据点副本要离线新鲜度或合并语义；保管方要求引用与绑定行同库立引用约束 | 照录为改选条件，本版都未触发（第 4 条随 C-5 起草复核） | 本表 |

## 修订波（2026-09-25 公开面）

依据：[D-063](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1、R-2、R-4，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)，[D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-37 ⑤⑩。本波只改节点；契约侧（引替身与 C-n 处）由规格侧并行落，本节点只引条款号。**处置不等于接受或评审闭合。**

| 事项 | 依据 | 处置 | 落点 |
| --- | --- | --- | --- |
| 公开面 | SYS-OPEN；D-063 R-2 | 新开「公开面」：五个判定纯函数公开，目录本身只有服务面（取舍表）；运行时层才成立的不变量列出；登 MPD-N7 | design.md「公开面」、MPD-N7；README；本页函数面一行 |
| 保管方接线 | `capability.credential-custodian` v2 S-12、S-13、S-19、S-20、G-6、G-7 | P-1r 的取值改走 `readReplica`（`absent` 与 `unavailable` 分开）、`storeReplica`；P-1 在中心不取用保管方（中心一侧本版不收）；MPD-N1 拆成据点「接口已定、真承接者未到」与中心「本版不收」 | design.md「不在本节点」、插件表、S-20 行、inject 表、装配给表、依赖表、失败映射、R-9 段；MPD-N1 |
| 中心连接接线 | `capability.center-connection` v2 S-6、S-7、S-9、G-1 | P-1r 以 `reachability` 判可达、`reachCount` 判再连上；「断线不以换代表达」改指 S-7；向中心发请求仍在未来资产/据点入口（版本未分配）（MPD-N2） | design.md 插件表、S-20 行、inject 表、依赖表；MPD-N2 |
| MPD-N4 静态检查 | N-37 ⑩；保管方 S-19 第 3 行 | 加「`readReplica` 只许 P-1r 调」 | design.md `credentialLookup` 一行、MPD-N4；本页 `#S-12` 一行 |
| G-19 闭合的影响 | D-063 R-4 | `A` = 那一格登记的全部档案，由本节点读面直接给，不加操作 | design.md「实施缺口」首段；公开面 `winningRow` |
| 最小提供者节点互指（主线 2026-09-25） | `packages/infra/credential-custodian-local`、`packages/infra/center-connection-probe`（candidate） | P-1r 的凭据副本读写（保管方 S-12／S-13 两行）改指 `credential-custodian-local`；中心连接那一行改指 `center-connection-probe`（产品装法 probe、验收装法同包 replay 插件）；MPD-N1 改为「真承接者未到，最小提供者节点已立」 | design.md 实现路径、插件表、依赖表、MPD-N1；本页 `#S-28`、`#S-22` 第三行、覆盖缺口 |
