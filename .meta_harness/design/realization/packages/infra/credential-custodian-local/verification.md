# credential-custodian-local 验证与证据

下列原设计义务与独立评审记录保留当时范围；来源绑定候选的新增义务在末尾，不以其替代完整 CCL 六操作/OAuth 验收。

契约侧的证据义务权威在 [`spec/capabilities/credential-custodian/verification.md`](../../../../spec/capabilities/credential-custodian/verification.md)：一份 TLA+ 模型（已运行）加七条规范场景（未开始）。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（锁同一绑定行与同一个过期谓词、附加认证数据、密钥现读与启动时判定、存储异常剥值）。**本节点尚未建包，一切未开始。**

## 证据义务

### 契约的形式工件：已运行，不作本节点的绑定

formal task `credential-custodian-v2-sweep`（[run 2026-09-25-formal-credential-custodian](../../../../record/evidence/2026-09-25-formal-credential-custodian/README.md)：正配置无反例，三份去保护配置与两个探针按预期）证的是**契约模型**：「只丢三种」与「按排到之后读的时刻判」缺一即有反例。它把「在绑定上排序」建成每个动作的原子性、两侧共用一个 `Expired`——**这两条被建模方式吸收，模型不检查它们**；而本节点对 S-18 的份额恰是这两条（锁同一绑定行、锁到之后取时刻；过期只经桥的 `isPendingExpired` 判）。所以它是本节点设计的依据，不是本节点实现的证据；[bindings](bindings.yaml) 不登记它。本节点那一份的证据是下面的 S-28 与 N-1。

### 规范场景（七条，全部未开始）

契约 verification 列每条的证据形式；本表只写**在本节点上**额外受阻于什么、前提是什么。

| 场景 | 本节点上的形式与前提 | 另外受阻于 | 状态 |
|---|---|---|---|
| [S-22](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-22-离线用副本) 离线用副本 | 验收装配：测试登录状态经 `storeReplica` 写种子，切断中心连接后调模型 | P-1r 向中心取值不在本版（MPD-N2）：只能验「副本在就交出」那一半，**有前提：测试种子** | 未开始 |
| [S-23](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-23-另一个账号的据点读不到) 另一个账号的据点读不到 | 两个据点各一份 `storage` 与各自的 `keyFile`；把 A 的两张表的行拷进 B 的库再读（契约已写明只拷条目、B 的密钥不变） | —— | 未开始 |
| [S-24](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-24-登录状态结束副本随之清除) 登录状态结束，副本随之清除 | 集成测试（sqlite 与 pg 两方言） | 产品里没有调用方（CCL-4）：测试直接调 `discardLoginState` | 未开始 |
| [S-25](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-25-oauth-条目待生效时不交出granted-才交出) 待生效不交出，`granted` 才交出 | 对真实存储：绑定行由桥的迁移建表、测试按桥的写法迁状态；故障注入：绑定读失败 ⇒ `unavailable` | 桥的 `./tx-reads` 尚未建包 | 未开始 |
| [S-26](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-26-加密落地) 加密落地 | 以已知原文逐字节扫库文件（sqlite 主文件与预写日志都扫）；**运行期**让密钥文件读不到（改权限或挪走）⇒ 四个操作 `unavailable` | —— | 未开始 |
| [S-27](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-27-秘密不出本契约) 秘密不出本契约 | 哨兵扫全部返回、失败值、工程记录与结构化日志；**加一支**：在 pg 上造一次引用主键冲突与一次引用约束失败，断言日志里没有引用（N-4） | —— | 未开始 |
| [S-28](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-28-清扫与完成交错) 清扫与完成交错 | **真并发**：见 N-1；按装配给的 `sweepInterval` 计时，调度按起点到起点、轮不重叠（[关键选择五](design.md#关键选择)末段）：断言条目在 `t` 成为可丢后不晚于 `t + sweepInterval` 被丢；**另一支**把存储放慢到一轮超过 `sweepInterval / 2`，断言下一拍被跳过、记 warn、两轮从不重叠 | 桥（本体或按它的写法迁状态的测试件）；桥的 `./tx-reads` 尚未建包 | 未开始 |
| [examples §4](../../../../spec/capabilities/credential-custodian/v2/examples.md#4-每个失败值一个反例) 失败值与次序 | 每个失败值一个反例 ＋ 三条次序回归例；**加一条**：密钥读不到且这个租户没有副本 ⇒ `unavailable`（不是 `absent`） | —— | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| N-1 | **清扫与完成在绑定行上排序**（[跨 owner 一节](design.md#跨-owner-的同一提交桥的绑定行与引用约束)）：pg 上两个连接，一边按桥的写法锁绑定行迁 `granted`，一边清扫，在恰好过期那一刻反复跑；断言每轮要么「`granted` 且交得出」、要么「未迁 `granted` 且条目被删」。**边界一支**：可控时钟让两边锁到之后读到的都恰是 `since + oauthPendingTtl` 那一毫秒 ⇒ 断言清扫不删、完成迁 `granted` 且 `resolve` 交得出。**变异**：清扫不锁绑定行（或在锁之前删）时主支要红；本包把过期判定换成手写的 `now ≥ since + ttl`（不经 `isPendingExpired`）时边界一支要红 | 真并发演练（pg；sqlite 由库级写锁天然排序，另跑一遍作回归） | 未开始 | 本节点 ＋ 桥节点（X-3：完成一侧也经 `isPendingExpired`） |
| N-2 | **`discardLoginState` 与改归属的 `storeReplica` 并发**（[副本表一节](design.md#同一张副本表上的两个写入者)）：pg 上断言被并发改归 `L2` 的那一行不被 `L1` 的删除带走 | 真并发演练（pg） | 未开始 | 本节点 |
| N-3 | **附加认证数据绑条目身份**：把租户甲那一行的 `sealed_body` 写进租户乙那一行 ⇒ 乙 `readReplica` 得 `absent` 并留一条记录；OAuth 条目挪到另一份持有的行上 ⇒ `notResolvable`。**变异**：去掉附加认证数据时这条要红。**打不开的 OAuth 条目留下**（契约 G-10）：换掉密钥文件后，绑定 `granted` 且记的是它的那条 ⇒ `resolve` 答 `notResolvable`、一条 error 级记录（有绑定号与持有、没有引用）；随后跑一轮清扫，条目仍在、绑定行逐字节不变 | 单元 ＋ 集成测试 | 未开始 | 本节点 |
| N-4 | **存储异常剥值**：pg 上造一次 OAuth 条目主键冲突（注入固定的「随机」引用）与一次 `missing-target`；断言上抛的异常与日志里没有引用串、没有本体 | 集成测试（pg），哨兵 | 未开始 | 本节点 |
| N-5 | **密钥文件的启动判定**（[关键选择四](design.md#关键选择)）：缺席且两张条目表都空 ⇒ 生成、`0600`、32 字节；两个实例同时启动只生成一份（`EEXIST` 转读）；对 group 可读、长度不对、读不到 ⇒ 启动失败、诊断不含内容；**缺席而任一张表非空 ⇒ 启动失败、密钥文件仍不存在**，诊断点名 `keyFile` 与条数、不含引用与本体（两张表各造一支）；数行时存储读失败 ⇒ 启动失败。**变异**：去掉「表非空」判定（缺席一律生成）时非空两支要红 | 集成测试 | 未开始 | 本节点 |
| N-6 | **撤除**：撤除开始后到达的与还没进事务的得 `custodianWithdrawn`；已进事务的跑完、按那一次提交收场；存储同时撤除时在事务里失败的收成 `custodianWithdrawn`；撤除前后两张表与密钥文件逐字节不变 | 演练 | 未开始 | 本节点 |
| N-7 | **配置错误一个政策**：`keyFile` 缺席或不是绝对路径、`sweepInterval` 或 `oauthPendingTtl` 缺席或非正 ⇒ 装配启动失败、诊断点名那一项不含值；`oauthPendingTtl` 与桥的那一项相等（装配测试） | 单元测试 ＋ `apps/cli` 装配测试 | 未开始 | 本节点 ＋ `apps/cli`（CCL-3） |
| N-8 | **公开函数面**：`sweepVerdict` 恰三种交回 `discard`（逐格穷举绑定三态 × 过期、恰在边界、未过期 × 记的是不是它；恰在边界交回 `keep`）；`resolveVerdict` 五种都交回同一个 `notResolvable`；`openBody` 对错钥、错身份、截断都交回 `unopenable` 不抛；都不装 Cordis、不给存储即可调 | 单元测试 | 未开始 | 本节点；有实现即可跑 |
| N-9 | **调用点限定**：`readReplica` 只许 P-1r、`depositOAuth`／`resolve` 只许桥本体解析；本包不 `emit`、不监听；本包源码不出现 `Math.random` | 结构检查（`tools/ts-checks`，候选规则），带「故意违反就失败」的自测 | 未开始 | MPD-N4 ＋ 桥 N-14 ＋ ts-checks owner；本节点提供方法名 |
| N-10 | **桥的事务内读函数与本节点的约定**：桥改 `mcp_oauth_binding` 的四列之一而不改读函数时，本节点的 S-25 集成测试要红 | 集成测试（引用桥的迁移片段与读函数） | 未开始（两包都尚未建包） | 本节点 ＋ 桥节点（X-1～X-3） |
| N-11 | 上游语义取证（CCL-11）：GCM 认证失败在 `final()` 抛、`'wx'` 不覆盖、同一句柄 `fstat` | 各一条会失败的测试（Node 24.18.0 起） | 未开始 | 本节点 |

## 实际执行

**无。**本节点没有源码；契约模型的那一次运行见上文，不计入本节点。

## 覆盖缺口

- **全部条款没有任何实现证据**：源码、测试、集成运行都不存在；[bindings](bindings.yaml) 为空。
- **跨包的设计已接上、代码都没有**：S-25、S-28、N-1、N-10 要桥包的 `./tx-reads`（读、锁、`isPendingExpired`）与桥的迁移片段——桥节点已登记（X-1～X-3），两包都尚未建包。受阻消费者：桥的 `resolve` 与 `completeOAuth`、P-1r 离线取凭据的验收（S-22 那一半）。
- **只能在测试种子上跑通的**（D-060 §八 N-35 ①）：S-22（副本来路 G-6）、S-24（调用方 G-5）——记「有前提：测试种子」，不计入实际验证完成数。
- **打不开的 OAuth 条目本版没有收场路径**（契约 G-10）：N-3 只证「留下、记 error、不动绑定」，不证它会被收走；受阻消费者：桥（那个绑定一直 `credentialUnavailable`，直到人重新授权）。
- **密钥丢失而条目表非空时没有运维出口**（CCL-13）：N-5 只证启动失败与诊断，不证人能从那里走出来。
- **契约 S-19 右列（协议须给）**本节点一条都不兑现。

## 独立评审

**独立评审 N7**（architecture-reviewer，2026-09-25；对象：本节点首稿与同批另三个节点；结论无阻断）。下表是本节点名下各项的处置，依据主线裁定 [D-060 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)。**处置不等于评审闭合**：本次修订尚未复评。

| 评审项 | 处置 | 落在哪 |
|---|---|---|
| F-1 过期谓词两边各写一份，边界可构造「`granted` 却交不出」 | 改：过期只经桥 `./tx-reads` 导出的 `isPendingExpired`（`now > since + ttl`，同 `Sweep.tla`）；本包不手写比较。契约 S-18 第 2 条已写明运算符（规格侧） | design [实现路径](design.md#实现路径与来源)、[公开面](design.md#公开面) `sweepVerdict`、[跨 owner 一节](design.md#跨-owner-的同一提交桥的绑定行与引用约束)第一条反证加边界一支；N-1 边界一支、N-8 |
| F-2 换钥后 OAuth 条目无丢弃路径、`GrantedResolvable` 缺前提 | 改：关键选择四翻转——密钥缺席且条目表非空 ⇒ 启动失败、表空 ⇒ 生成；打不开的 OAuth 条目本版留下、记 error、不作废绑定；代价表补「OAuth 那一半没有覆盖路径」一行。契约 `GrantedResolvable` 前提「条目可开封」与 G-10 由规格侧补 | design [关键选择四](design.md#关键选择)、失败映射、装卸表；新缺口 CCL-13；N-3、N-5 |
| F-6 「cli 已按 M48 显式驱动」引用过宽 | 改为「要求 cli 加入显式次序；未加入时的收场已兜住」，对指 cli A-32（cli 已加：验收装配里执行环境 → 保管方，最后撤根） | design [装卸](design.md#成对的装载与撤除)末段、归装配 |
| S-1 清扫调度语义未写 | 写明起点到起点、轮不重叠、超半间隔跳拍记 warn，并推出上界 | design [关键选择五](design.md#关键选择)末段；S-28 行两支计时断言 |
| S-6 CCL-1 与桥节点不同步 | CCL-1 改「已由桥节点 X-1／X-2 闭合」并互指；`readOAuthBinding`、`lockOAuthBinding` 与过期谓词 `isPendingExpired`（桥节点 X-3，桥已导出并自用）同在桥的 `./tx-reads`，本节点判过期一律经它 | design CCL-1、依赖表、跨 owner 一节；README |
| D-1 `oauthPendingTtl` 双持（主线裁） | 维持双持加相等装配测试；谓词已只一份 | design CCL-3 |
| 观察：本包依赖 `tools/mcp-bridge` 子路径的方向（主线裁） | 与契约依赖同向，接受 | design 关键选择一、CCL-10 |
| 顺带 | CCL-7、CCL-8 的契约措辞已落（D-060 §八 N-40 ③），改「已闭合」 | design 缺口表 |


## 模型副本来源绑定候选的验证义务

对应 [v2-design.md](v2-design.md)、CCL2 S-5～S-20 与目录3 S-7/S-12/S-19/S-20/S-32；精确采用状态查 [registry catalog](../../../../registry/catalog.json)。本节点尚未建包，全部新增义务未开始、绑定仍 0；既有 Sweep 模型不含模型 sourceRef 或目录绑定轮换，不能用于本增量的实现绑定。

### 旧义务保留及本次影响

| 旧义务 | 保留与增量影响 |
| --- | --- |
| S-22/S-23/S-24 | 通用离线副本、据点隔离和登录归属清除原场景保留；model-only 的真实 bootstrap 不冒充中心送达或完整登录结束产品流程 |
| S-25/S-28、N-1/N-10 | OAuth 真桥事务函数、真实迁移/外键、完成与清扫的交错全部保留；窄组件不执行也不关闭这些义务 |
| S-26/S-27、N-3/N-4/N-11 | 原加密/秘密隔离/错误剥值/上游取证保留；MCR-V2/V5 增加 sourceRef AAD 与新边界哨兵 |
| 原失败反例、N-2/N-8 | 旧六操作输入次序、tenant-only 读、按登录状态删除、纯构件全部保留；MCR-V1 验 generic 新写清标签及新格式通用读 |
| N-5/N-7 | full 两张条目表均空才生成钥的判据和清扫配置仍原样；model-only 单独验证预置钥、无自动生成、无伪 OAuth 默认配置 |
| N-6/N-9 | 原 full 撤除与调用点限制保留；MCR-V6/V7 增加窄闭包及技术 subpath 的 owner/消费者检查 |

### 新增真实验证

共同前提：真实 SQLite 临时文件库、同一 AtomicStorage 实例、目录真实 bind/unbind 与事务 helper、实际本机 keyFile；通过真实账号/登录/组织治理公开能力取得身份。秘密原值只在测试进程内持有，证据输出只记录断言与阶段。损坏 fixture、拆保护的负控与正常业务路径分别记录；跨实例竞争必须指向同一实际库，不能拿两个独立库假并发。PG 未执行单列未验，不外推 SQLite 结果。

| # | 条款与动作 | 必须可失败的断言 / 范围 | owner |
| --- | --- | --- | --- |
| MCR-V1 | CCL2 S-5/S-12～S-15：旧格式行迁移、generic store/read、bound store 后 generic read、再 generic 重写、按登录状态清除 | 迁移只增 NULL 不猜 sourceRef；旧 read 仍交原 tenant body；bound 格式由已存 ref 重建 AAD 通用读成功；generic 重写清来源且以旧 AAD 封存，新目录读不得借旧标签成功。一个租户一整行，login/state/time/body/source 一起换；按 LoginStateId 删除不改变别的归属 | 本节点 |
| MCR-V2 | CCL2 S-6/S-7/S-8：真实钥封存 A；仅改 source_ref、跨 tenant 移密文、复制旧 ciphertext 并贴新 ref、不同账号/据点复制行、错钥/截断；重开同文件 | 不匹配不交 body，留下裁剪后的原因；新 AAD 绑定真实来源，旧格式+新非空 ref 不可冒充有效；另一据点保持自己的钥时交不出。扫描 SQLite 主文件/WAL、所有持久证据无哨兵明文；不宣称密钥与密文一并被盗也安全 | 本节点 + storage |
| MCR-V3 | 目录3 S-19/S-20/S-32：真实 refA/bodyA 发布→bind refB，副本尚为 A；迟到 store A；再实际 store B；unbind；custom 与 official 分支 | present 可为 true 但 value 不得交 A；迟到 A 返回技术 stored:false 且不覆盖 B/残留；B 完整提交后只交 B；无 sourceRef 同样不交。tenant 分支解不出不得回 factory；只有确无绑定且 official 才由目录选 factory，custom 不回退。取值失败对应 runtime 零 HTTP；无暗中中心查询或第二次重试 | directory + 本节点 + runtime |
| MCR-V4 | 目录3 S-19/S-20、K-M1/K-M2：在真实锁取得处设屏障，两连接并发 bind/unbind 与 storeBoundReplica/readBoundReplicaIn；提交前中途终止进程、提交后回执丢失后重开 | 同一 model_credential_binding tenant 行排序，读只交该次完整匹配 body；来源/密文/归属无半份；漂移不写，未知提交由实际重开事实判定。分别移除锁后使用旧值、移除来源比较、在读时贴当前 ref 的负控必须失败。记录真实 StorageUnit/assertStorage；参与异常到外层终结后才映射，对外 body 不早于 atomic 成功返回 | 本节点 + directory/storage |
| MCR-V5 | CCL2 S-7/S-8 与 SYS-OBSERVABILITY：model-only 缺钥/坏权限/坏长度/非普通文件；运行期不可读；目录读失败/存储约束失败；观测端口失败 | 缺钥启动失败且不生成，运行期 key/storage 不可用不假 absent。body/key/全部 ref/密文不进日志、trace、诊断、错误 cause、指标标签；成功 body 仅到目录取值→本次 transport。上游 Node 假设沿 N-11 取证，不凭使用 crypto 声称已通过；观测失败不能伪造业务完成 | 本节点 + app/观测 owner |
| MCR-V6 | CCL2 S-20：独立 factory 和真实 Cordis 装配；阻塞参与读、发布，随后撤 P-1r/替换依赖/取消等待/关闭 | 准入关闭后不接受新工作；实际 unit 尚未结束时不能提前交 body、销毁 key 或关闭借来的 storage。外层 owner 等实际 Promise/事务，取消不等于停止；撤除不删钥/副本/目录绑定。P-1r 只借用唯一组件，app owns close，无多 disposer 顺序假设；无后台任务与句柄泄漏 | 本节点 + directory/app |
| MCR-V7 | CCL2 S-11/S-19、目录3 S-12：真实 auth/accounts/logins/OG → 可信 source pair 导入 → bind → bound store → runtime 取值；制品/调用点负控 | 实际 LoginStateId 与租户账号一致，不造品牌值；真实 helper 由 createCredentialBindingReader(storage) 产生，恒值 reader 替身不算实际链。按候选逐 symbol 许可检查：bootstrap 可以导入/调用两个工厂并传递闭包、调用 store，不能执行 binding reader 或 readBoundReplicaIn；P-1r 可执行两种读，不得 close；CCL 只执行被注入 reader，不反向 import directory。合法构造链必须通过，越权导入/调用各有失败负控。model-only 不 provide 六操作键、不加载伪 MCP、不执行 OAuth 迁移；full 模式缺真实桥仍受阻，不能把窄组件断言成 full。验证关停次序与迁移/密钥 owner | app + directory + 本节点 + ts-checks |
| MCR-V8 | 提供者技术投影的完整结果/异常表；CCL2 S-9/S-10/S-20、core/storage P-13：逐格注入非法 sourceRef/expectedRef/tenant/body、clock unavailable、close、坏钥、四型存储失败、wrong/closed/非活跃/重叠 Unit、reader 非法返回 | 写入严格复用 invalidInput/custodianWithdrawn/unavailable；漂移才 stored:false。参与读仅 body/absent 为正常结果，内部非法参数和 Unit 误用抛 StorageDefect，closed/key/storage 不可用抛 StorageUnavailable；clock unavailable 不影响读取。先在真实 atomic 暂存哨兵行，再注入参与异常并故意在 caller catch：单元仍须失败且哨兵不提交；正常 absent 可结束但不交 body。P-1r 仅在 atomic 外把 StorageUnavailable 映射 unavailable，另外三型/其它缺陷不得降格；所有异常剥值仍保持分类。重复 close 同等实际排空，提前结束或绕过 run 的变异必须失败 | 本节点 + directory/storage + app |

### 覆盖缺口

- **MCR-1**：候选尚未采用、无实现/制品；本机模型凭据链须待双方真实组件与 MCR-V1～V8。设计检查不是 SQL 或凭据符合性证据。
- **MCR-2**：真实 bootstrap 只闭合本次本地输入来源。CCL G-5/G-6/G-7 的产品登录结束、中心送达、刷新与轮换传播仍由未来 owner 承接。
- **MCR-3**：full CCL 的真桥 tx-reads/迁移/OAuth 义务仍阻断完整节点声明；model-only 只能按自身范围报告通过。
- **MCR-4**：`apps/model-request-acceptance` 尚未成稿；真实身份、可信 source pair、keyFile、唯一组件 owner、调用点限定和退出次序须在装配节点明确并验收。
- **MCR-5**：所有来源格式、加密/文件异常、真实并发、PG、重开、撤除和零泄漏证据尚未执行；原 CCL-11/12 待核对主张不因新增设计而关闭。

### 候选文档检查

2026-09-27，rev 2 补齐技术结果/异常与符号级许可后，实际执行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal registered --gate internal`，退出 0，输出 `PASS: design tree /data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/.meta_harness/design passed gate=internal; formal=registered.`。formal 仅登记检查，均报告 `execution was not requested`。本节点 diff 空白检查通过；原已接受 design.md 与 HEAD 无差异。没有实现测试、真实 IO 或新 formal run；静态通过不代表候选已接受或提供者已验证。
