# 治理中心服务端的公开集成与资源责任

根入口拥有 entry/ops 配置、独立工厂、显式依赖和 GovernanceCenterWork；不加载 Cordis。
`./cordis` 拥有四种限定名绑定，消费同一工厂。配置只含数据；运行对象不进入配置。
公开工厂不要求 Agent 或 tenancy-host。调用方提供原存储、时钟、业务、开闸、维护、日志及通知依赖。

## 启动与停止

构造不执行 I/O、不订阅通知。setup 第一次调用同步推进到首次 await，重复调用返回同一 Promise。
close 先保存稳定 Promise，再同步关闭本实例继续启动及准入资格，防止依赖或通知重入另开关闭过程。
close 等已开始 setup 结算，再释放取得的全部资源及真实在途工作，最后撤除通知订阅。
setup 失败独立拒绝，不被 close 成功覆盖。关闭及订阅清理同时失败时保留两个错误。
close 先于 setup 时不启动资源；随后 setup 以 GovernanceCenterWorkStopped 拒绝。
工厂观察内部 Promise 的拒绝；调用方仍须调用并等待 close。

每项已接纳业务先登记，再调用可同步重入 close 的依赖。网络排空上界不代替真实业务完成。
启动中的资格来自 isCurrent；entry 开闸另核 isReadyToOpen。准入每次仍核 opening.isOpen。
这些资格不表达租户授权，也不替代持久身份及同提交参与核验。
原时钟超时、100ms 轮询、TLS/Unix 协议、接收和排空上界保持。

entry 取得的端口、启动前缀与监听由同一工厂关闭；开闸通知抛错沿原路径记日志。
ops 在第一次异步等待前安装三项订阅。部分安装失败保留 setup 的原错误；close 撤除已取得的前缀。
维护检查集合和 closed 目标来自 EntryMaintenanceResources；检查非空且每项是函数，完成目标必须是函数。
同一次 setup 捕获同一完成目标，提供者后续换代不能把旧实例的完成通知转交新拥有者。
未取得 socket 的失败前缀不删除另一实例的 socket。

## 绑定与静态边界

独立绑定先登记关闭 effect，再 setup；管理绑定同步将同一工厂 setup/close 交给 startAssemblyWork。
管理绑定保留 assemblyLifecycle:1 和纯 describeAssembly 声明。OwnedWork.ready 与 fiber ACTIVE 分开观察。
必需服务键用公共常量直接列入 inject；资源提供者由装配保持到真实关闭完成。
EntryServices 只授予原路由所用操作与参加事务能力，不扩大同提交例外。

ServingNotice 与四个事件常量唯一归 core/governance-center-entry 根；Events 增补只在其 `./cordis`。
ops 只订阅 SERVING_EVENT/STOPPED_EVENT/DEFECT_EVENT，只派发 LISTENING_EVENT。
静态白名单只增加无导入的 work.ts 生命周期叶子和 AssemblyDeclaration 的类型导入。
纯事件叶子只消费 Instant 类型；不得经叶子、命名空间、私有入口或运行时导入绕入治理实现。

## 保持与依据

31 条路由、判定次序、租户拒绝、同提交、中心身份、wire/Schema 身份、SQL/迁移及维护算法保持。
共享判定、授权、结果及同提交承诺归[公共入口](../../core/governance-center-entry/SPEC.md)，客户端读取归[传输定义](../../core/governance-center-entry-https-json/SPEC.md)。本包拥有实际持久身份、服务端字节和维护资源行为。
采用依据为身份整体设计及T4 接缝。
源码、声明、运行闭包和制品消费须分别验证；类型及静态图不能证明启动、隔离、事务或关闭。

## 请求判定与协议装配

`service-faces.ts`、`json-shapes.ts` 与 `routing/record-shapes.ts` 分别唯一拥有服务、读取结果与工程记录形状。`routing/routes.ts` 保留原31条业务调用及失败规则，`route-wire.ts` 按同一原 schema 拥有协议投影。内部形状与投影不成为新的公共操作。

`decision-policy.ts` 通过私有协议、关联号和认证事务端口作原判定。`decide.ts` 绑定实际 JSON 读取、原协议编码/校验、关联号与原共同事务；五参与面仍在同一 atomic 回调按原次序构造。公开体检与无需查询的拒绝不读取服务或启动事务。

成功路径仍按投影、矛盾检查、Schema 校验、编码、最后活动、真实提交、字节交付的原顺序完成。原捕获边界分别保持；校验和编码仍在提交前。已观察缺陷在回滚后保留，不被污染单元的终结异常覆盖。改密准备后最终事务使用原 caller/ticket，不再 exchange。注册仍保持三个独立提交。

本成员策略不直接拥有 wire 编码、关联号 crypto 或存储终结。既有公共身份函数的传递运行闭包继续有效；此分离不宣称共享公共根无 crypto，也不扩大租户授权或同提交例外。

R1-T5 的严格 JSON 形状搬迁只允许 json.ts 从 json-shapes.ts 以具名纯 type import 消费 JsonLimits、DuplicateMember、JsonReading。新叶子只能含 interface/type 声明，无导入、重导出和运行时语句。SC-2 对运维与只读叶子绕入治理/写逻辑的限制保持；本例外不开放其他名称、消费者或运行时绑定。

## 维护策略与实际文件拥有者

维护的 Metadata、BackupDescriptor、大小上限和文件名判据由 maintenance/backup-data.ts 唯一维护；当前备份 MAGIC 为 `OMNE-CENTER-BACKUP/2`。metadata-policy.ts 拥有原时间判据，metadata.ts 与 input-codec.ts 拥有原协议校验和字节编码。

input、catalog、publication、online、offline 只消费 maintenance-ports.ts 的具名效果。实际文件/目录、同fd稳定检查和资源登记分别归 input-io、directory-io、file-io；assembly 唯一选择文件、codec、摘要和中心读取。useBackup 在同一次 files.useInput 回调内完成原 header、纯输入对象构造与业务调用，close 仍由真实资源拥有者和 session 负责。公开离线工厂的名字、选项、结果和错误不变；不增加其他导出路径。

中心读取仍绑定原 readSnapshotCenterId，在同一原 view 内保留逐迁移、逐Check与原结构/身份SQL检查，不去重或另开快照。原单任务准入、stop请求/close实际完成、正常耗尽digest、中心筛选先于时间/耐久、可见发布不可撤销、未知耐久、残余与清理错误优先级保持。原三处测试与两构造改接实际装配，原类方法故障注入的作用阶段不变。

维护输入及结果策略通过同一 MaintenanceEffects.validate 调用原 Schema 判据。assembly 在每个原调用时点取得实际校验器，构造不读取校验器、不缓存。输入校验仍先于准入及文件效果；结果仍在工作或原失败映射、残余报告之后校验，校验器缺陷继续原样传播。BackupInput 形状归 backup-data，inputs 只拥有交互校验实现。

## 运维体检与连接装配

ops/health-probe.ts 拥有原只读SQL探针及两秒竞速。超时只结束本次观察，实际读取继续；迟到StorageDefect仍走原诊断出口。health.ts 通过具名probe读取结果，保持原公开字段和字节顺序。health-sources.ts 延迟读取原字段，不在构造时探测、读取时钟或缓存值。

ops/face.ts 拥有原完整连接控制；entry.ts 选择实际维护与探针提供者。三秒只限制网络排空；停止准入后仍等待已登记业务和维护真实关闭，才删除本实例socket并通知完成。订阅、未取得socket的启动前缀清理、原fullHealthBody故障注入坐标和公共工厂保持。

## 稳定中心身份

启动只读本人center slot。合法既有值复用；NULL表示尚未铸造，可首次取128bit随机值。missing row、坏值或读写失败使启动失败，不能当未铸造默认。非空数据库缺center表由preflight拒绝，不重建后mint；仅剩迁移残留但slot不可读也失败。

同数据库/备份恢复保留centerId，地址、key、配置和迁移不改变；载入后数据库断开，health仍为同ID。随机不同中心的概率界不检测碰撞，ID不证明身份认证。

## 服务端成帧与字节

- TLS≥1.3，仅配置匹配chain/private key，不用内置/plaintext fallback，不用client certificate授权，SNI不换chain、不接受0-RTT。握手完成后计请求，每连接一个请求/答复，无1xx、100Continue或第二pipeline处理。
- 仅body决定业务。method/path/query及Host/Authorization/Cookie/Expect/Upgrade/Content-Encoding、peer/TLS属性不改变答案；HEAD仍有body，header不提供presentation，不另增4xx或错误页。
- HTTP严格ABNF/CRLF，拒bare LF/obs-fold/冒号前空白，不修补裸CR/LF/NUL或忽略前空行。任何Transfer-Encoding拒绝；每个Content-Length去OWS后均为digits，重复值逐字相等，05和5不同，comma-list拒绝，允许leading zero；无CL为零，空body按version出口。
- head限额先判；head齐后由CL先判body限额，不读超限body。body齐后才decode JSON，截止前读尽已到数据再判。未齐、framing/limit/timeout均无HTTP答复，不映射invalid或400。最小head8192/body65536、JSON depth64/members1024、receive/handshake30秒不因版本缩小。receive从TLS握手完成或ops accept起计，合法Schema也可能超限。
- 整体strict UTF-8、拒BOM、左到右恰一个JSON且顶层object。raw surrogate编码拒绝；escaped lone surrogate保留给所属步骤。exact JSON数不能先IEEE舍入，1.0/1e3可为整数，超2^53−1由其payload拒。depth/members只量合法最长prefix，prefix超限先于后续syntax错误给无答复，否则syntax按version出口。
- decode成员名不normalize，报告所有duplicates，不first/last-wins。version重复按version出口；operation/extra按envelopeinvalid；payload任意层在auth后inputinvalid；presentation重复认证拒绝，免auth忽略。唯一public-health operation识别后其他duplicates忽略但仍核限额。
- HTTP/1.1 200 OK，四header依次Content-Type application/json、Cache-Control no-store、Content-Length无leading zero、Connection close，无Date/Server/其他header，完整字符串一次write。JSON依实际Result_及嵌套Schema properties顺序，array原序、不sort/dedup；optional缺席不写也不填null。compact UTF-8、RFC8785字符串、非ASCII及U+2028/29不escape，整数十进制、UTCInstant大T/Z和最短非零fraction。
- 四种入口完整字节133/137/128/130，六种认证拒绝含迟到均137，不带requestId/time/reason。TLS record或网络chunk分割不属于逐字承诺。固定独立输入见tests/fixtures，不从当前encoder生成期望。
- 答复write后close_notify/half-close，再read-discard最多65536字节或5秒，然后full close；超界直接close，答复可能被吞仍为问不到。无答复时，握手已完成则先close_notify再close，不drain。
- 未serving、启动/换代、停止时新不完整请求、framing/limits/receive/handshake失败均无HTTP字节。admitted在途是完整head+body而非socket accept；socket结束不释放业务/prepare/维护依赖，丢reply不证明未commit。

## 运维网络面

固定Unix governance-center-ops.sock，TLS不接ops、Unix不接治理。目录必须已存在、current uid且group/other无权限；不合则失败，不mkdir/chmod另开。已有active socket不抢，stale可替换，非socket不删。两面同准入与framing/limits，offline verify/restore不上网络、不接任意file location调用任意service。

opsVersion=1、operation与payload三成员严格必给，无默认/extra；任意层duplicates/BOM/encoding/shape错误为对象status invalid-input，零服务调用，不使用客户端string invalid/version-mismatch。framing或合法prefix限额先行无答复。full-health十字段，backup-status重新确认；固定字段顺序及sourceBuildId/latest/targetLocation的明确null保持。

合法admitted后独立defect无result则无答复，记录安全ops-internal-defect，不500、不造status或unavailable。write失败不能保证已发送零字节，也不补第二答复；原工作/资源owner继续保有。未得完整reply不能确认结果，不重试backup，可另显式status核实。

## 维护准入、目录与封装

- 两面serving、升级confirmed、实际唯一deployment源owner才准入。backup/status/onlyIfDue共一个slot，busy立即返回不排队；各owner从同一完整snapshot核原源，业务可继续写，不改安全/login/clock。
- `onlyIfDue:false`每次新output，target-exists不改名重试。true先完整validate并reconfirm latest：age<20h not-due，整20h due，无latest才备份。只扫描直接32hex.omne-backup名字，先数全部匹配含坏/foreign；超过256先capacity，不递归/nonmatching不计。
- 每个匹配名的symlink/nonregular、format/hash/owner不合格或完整foreign-center候选，invalidCount恰加一后排除，继续其余候选；symlink不follow，非匹配名不计。因IO无法判定时返回unavailable，容量故障为capacity，二者及持久确认故障不计invalidCount并终止。foreign center排除先于时间评价；本中心future startedAt为unavailable。latest取最大startedAt，同刻ASCII文件名最小。每个本中心候选固定fd/parent重新fsync；unknown不退回旧件或继续备份。24h整为current，超过为overdue；full-health不做reconfirm。
- 封装为ASCII OMNE-CENTER-BACKUP/2换行、uint32BE头长、compact strict JSON metadata、原SQLite bytes，无tail/压缩/加密。header1–16384、content1–1GiB；sourceBuildId按BUILD_ID或dev null，迁移完整有序列表与副本实际登记相等，startedAt≤finishedAt，且该闭区间必须包含实际固定观察时刻。输入可合法字段排序但拒duplicate/extra/BOM/bad UTF-8，输出固定顺序；SHA覆盖数据库段和规范Clock checkpoint后缀，不认证任意metadata或来源身份。
- O_NOFOLLOW普通文件、current uid、group/other无权限。固定同fd读head及全部body，核exact length/full SHA，64KiB流inspection针对同复制字节；前后fstat比较dev/ino/size/mtime/ctime，变化为unavailable。恶意改后恢复不在此防篡改保证内。
- same-FS exclusive hardlink发布：file fsync→link→parent fsync，EXDEV为unavailable。visible但未durable是outcome-unknown，保原output、不retry，不凭存在性推success。unknown优先cleanup failure；durable后cleanup失败为unavailable，保output/protected residual及安全位置，不称cancelled或no-effect。只有未发布且实际工作清理完成才cancelled，durable后迟cancel仍completed。

## 离线验证、恢复与永久隔离

- 显式路径及机器运维权限，无account/tenant授权，不需中心active。每call slot及同workroot跨进程mutex，不同workroot可以只读同input并行，不锁全机input。verify固定fd全检查，不reconfirm发布耐久、不mint/migrate/reset login或clock；verified仍businessOpen=false，不改原completed/unknown。
- restore先verify再exclusive mkdir0700，已有空目录也target-exists。固定data.omne-backup保存原envelope bytes，不写临时SQLite作为恢复输出。file/target dir/parent均fsync才restored；已mkdir而发布前失败可保residual/unavailable，不能假target-exists。发布unknown时fileName:null且保原请求target，不overwrite/merge/force/retry/delete。再次verify只证明完整性，不reopen或消解旧unknown。
- plaintext之前写durable隔离保护。cleanup不得删拒开依据，因为删除crash后可恢复旧状态；所有支持生产打开路径拒envelope/isolated restore/protected plaintext，无法确认也拒。恶意物理owner及不支持实验产物不属无条件保证；不提供extract/serve/reset/remove-marker旁路。
- 同一原snapshot核physical integrity/FK、完整迁移登记、table/column/unique/FK/extra trigger及center恰slot一行合法非空；仅物理integrity或重hash不证明结构，缺login_state也拒。不新读第二snapshot。
- open成功立即在同维护run登记原fd的close/isClosed，await异步open，取消后才取得的fd也登记。显式close与fallback保持原锁，callback只关原fd，不重读服务、wait run、publish或删除output。
- 5分钟预算到期必须请求取消。cancel、断连、该取消请求或stop均不等实际终结，不另开第二owner。close等export/inspection/handles及隔离residual真实稳定，30秒只诊断。媒介/clock已声明失败与程序缺陷分开。
- hourly onlyIfDue不启动stopped/stopping中心。daily依赖timer延迟+slot等待+validate/export/publish不超过余4h，及clock/source/space/throughput/≤256可用；不承诺自动删备份、整机RPO/RTO或dead IO有限close。

## 固定Schema构建与验证

schema-inputs只有资源、定义、options、keywords与sourceFiles，不做校验。构建先清dist/generated，再tsc及全部有限graph与新鲜metadata；任一资源/metadata/后续定义/写出失败非零且清两目录，不保半产物。运行首次实际消费才load，缺generated/helper原抛，不valid:false或旧产物fallback；发布含generated/dist。

native CJS helper保持receiver/instance，text function不得拆取；src/dist用同owner，原unknown、copy projection、公共错误和exact postcheck保持。显式作者运行构造独立保有/释放，不新增module增长cache、Service或fiber。SC2仅允许现schema-inputs/routing只读形状及generated/ordinary.cjs例外。

全部定义、原oracle布尔/errors、原始输入摘要、新鲜性失效、missing helper/graph/代表性五共同失败、确定性及无half fallback须验证。共享CB/messages图的扩散性质由实际共享owner承担，本包不能单独宣称全部exact/meta/ref/dynamicRef证明。规范资源、四个有限模型及适用前提见[验证入口](verification/README.md)。

## 独立时钟的备份底线

在线备份先固定业务快照，再取 finishedAt，随后等待 Clock.checkpoint。时钟必须提供此能力；缺失、不可用或底线早于 finishedAt 均拒绝备份。异步等待后的取消仍由原 session 核验，不能发布已取消的备份。

格式 `omne-center-backup/2` 必须携带 clockCheckpoint。writtenAt 和 upperBound 是非负安全整数，且 finishedAt ≤ writtenAt ≤ upperBound。摘要依次覆盖原业务数据库字节和 checkpointDigestBytes 定义的规范时间底线后缀。旧版本不再作为当前输入接受。解析检查、摘要与离线验证必须覆盖底线，不能只验证数据库字节。

restoreIsolated 保留完整封套并保持 businessOpen=false，不开启业务数据库或时钟。未来激活恢复库的拥有者必须先把该 checkpoint 交给 Clock 的初始化或 minimum 接纳入口，且不得降低目标已有的更高底线。离线复制完成不等于业务已经激活。

本次仅迁移备份维护的形状与行为：schema/governance-maintenance.schema.json 为当前维护协议的唯一形状源，采用新 URI `https://omne-harness-lite.invalid/schema/governance-center-maintenance/2.json`。31条业务路由保留主线接续的Schema资源。构建图为维护定义选择本包新源，为业务定义选择各自当前拥有者的源；运行时仍使用按需加载且由 Node 缓存的预编译校验器。旧维护成功示例的 /1 元数据已退役，测试仍核对未变答复字节并拒绝旧元数据，新例子归 verification/maintenance-v2.json。
