# 私有本地记录与比较替换

实现CLS1 S1～8，完整记录与恢复语义仅在契约定义。选择沿CLI-TUI三个本地方案：推荐SQLite完整记录，JSON需额外稳定OS锁及耐久替换协议，密钥环需跨库共同恢复及Linux无界面可用性；已有双平台SQLite探针支持进一步实施，不是生产验证。

## Cordis与资源边界

一个client-local-state插件，提供`clientLocalState`读/比较替换服务；不注入账号/租户服务、不连中心、不保存账号密码、不输出秘密。插件拥有专用文件存储生命周期；内部经core/storage抽象查询，具体打开由infra/storage-sql提供，SQLite FULL，不在能力契约写SQL。客户端组合注入这一个面，调用期间保存快照；未来可替换为不同本地存储提供者，保持CLS1语义。

公开`openClientLocalState({directory})`亦可由一次性CLI装配调用，返回同一服务及close；不会自建root Context。插件用同一实现，effect负责关闭。每个实例跟踪已接纳的完整读/替换Promise，close先关准入、allSettled排空再close存储；并发effect不能替代这个内部顺序。启动半成品出错关闭已开文件/数据库；采用前须完成infra/storage-sql NodeSqliteDriver打开期PRAGMA失败时未登记DatabaseSync关闭及失败读句柄不消耗池容量的修复/验证（既有代码并未自动保证），保留无法证明可删除的已创建状态文件。新旧提供者不共享WeakMap凭证，旧引用按关闭/错误域缺陷拒绝。

网络等待不持事务；本能力没有后台worker、轮询、通知或服务器当前身份缓存。CAS只保护本地记录，不保护中心权限。应用负责先静止组合后关闭本提供者；总等待失败不能继续关仍被使用的资源。

## 保护目录与初始化

调用者提供绝对目录路径及已经存在的可信父目录；本节点只创建最后一层专用目录，不递归猜建父路径。默认CLI可选用户HOME下单层目录，父目录前提由应用核验。只在该专用目录下使用固定`client.sqlite`，不把网络输入拼入路径。根目录0700、主文件0600且归当前OS用户；目录/状态文件/已有WAL与SHM拒绝符号链接、非预期类型、宽权限或错误所有者。检查通过打开的fd作fstat，不以一次路径stat替代；新文件O_EXCL/O_NOFOLLOW及0600。父路径须在本机可信所有者控制下，禁止他人可替换的路径分量；测试使用解析过系统临时目录的私有子目录，不把macOS的/tmp符号链接当作状态目录授权。

检查后SQLite按路径打开的窗口依赖CLS1“恶意同OS用户不在保证内”及私有目录保护；Node接口不提供openat式全路径能力，不能宣称抵抗同UID替换。没有临时放宽umask：主文件私有创建，WAL/SHM在私有根下并验证实际模式；根0700在副文件出现的窗口也阻止其他用户读取。系统CA是模式标记；自给CA持久化已验证的证书字节，不保存可能夹带私钥的原始文件文本。

本节点在创建/确认私有目录后同步其父目录，确认目录入口耐久；私有目录必须可打开并同步，否则在就绪前失败。初建者通过独占创建主文件取得初始化责任，用一份迁移事务同时建表、插入格式/实例身份/空记录；数据库FULL提交后还须同步私有目录，确认主文件及当时副文件的目录入口；这些确认未完成前不能提供服务。FULL不代替目录同步。每次拟返回installed的替换在数据库提交后再次同步私有目录；同步失败则unconfirmed，不能当作回滚。竞争打开者只等待有效初始化结果、等待有界，不能抢建第二份身份。既有零长度、不明表布局、缺元记录或损坏JSON不自动重建为空；失败须可见。首次初始化崩溃在服务就绪前可能留下不可用文件，用户可显式指定全新目录重新配置；这不等于已保存登录丢失可自动复原。普通重启不重置实例身份或修订。

## 同一存储对象与映射

共同对象是此目录同一SQLite库的一行`client_local_state`，与中心数据库没有共同事务。

| CLS1 | 提供者投影 |
|---|---|
| S2完整记录 | singleton主键、format_version=1、store_id、revision、operation_id及value_json；JSON同时含中心绑定/选中登录/副本。字段/索引归本地格式，不是新远端协议 |
| S4一致读取 | core/storage.read内核格式与整行，按CLS1闭合形状校验再返回；快照为WeakMap登记的opaque对象，私有证明保存store_id/revision/中心/原登录引用；不把原秘密写进可枚举凭证 |
| S5比较替换 | storage.atomic内先读、核实例/修订/中心/原登录，再核替换约束，单条完整UPDATE推进revision并写operation_id。比较与UPDATE到COMMIT全在同一BEGIN IMMEDIATE保护中；不借JS锁代替进程间锁 |
| S5 installed | 只有atomic正常返回、FULL提交确认后；返回新快照与记录 |
| S5 conflict | 同事务比较不符，零UPDATE；可返回本次同区间读数 |
| S5 not-installed | 输入/记录校验或已知回滚/开始前失败有明确证据才用；声明为defect的单元误用仍抛出，不吞成输入错误 |
| S5 unconfirmed | 不知道提交是否生效/耐久；仅对StorageUnavailable或明确归为正常IO不可用的故障保守返回unconfirmed；StorageDefect与未声明异常保持缺陷传播。SqlStorage异常不按类型盲猜没写；不能把回调返回当COMMIT |
| S6查证 | 后续read暴露当前operation_id给可信组合；只说明目前可见，不补原耐久保证；不自动重试、恢复旧值或撤销远端 |

operationId由上层为一次拟替换分配并保持，足够熵且不主动复用；提供者拒绝本次与当前已记录ID相同的不同拟写，历史唯一性前提不得被描述为数据库记录了无限去重历史。revision达到安全表示上界时not-installed/unavailable，不能回绕。

内存记录在返回前深复制/冻结，不让调用方后来改动本次拟替换；输入先序列化/校验成私有快照，再await存储。格式与副本验证是本节点按CLS1的投影，不新增schema能力。存储实际业务表只有这一张；记录大小超本实现可处理资源时明确unavailable，不能静默丢副本、拆开保存或让其他身份副本顶替。

## 失败、验证与演进

读取错误、格式错误、future-format分开；异常消息不含文件内容、出示物或密码。文件路径作为本地配置可在开发诊断中定位，但不把秘密值拼进错误。SQLite锁等待由提供者的既有受控配置承担；不通过无限等待或PID抢锁改善表面成功率。

必须验证真实多进程CAS、旧退出不删新登录、存储重建/错误域凭证、不匹配原登录、整个记录不撕裂、提交未知与operationId查证、进程被杀后锁释放/回滚、权限/符号链接/损坏与首次初始化中断。候选格式首次发布，不兼容未定义旧文件；未来变更须明确迁移，不静默覆盖较新格式。

本节点依据D046完成CLS1规格与独立节点评审后的限定采用；实施与实际验证状态另见README。

## TypeScript表示与公开资源

完整记录使用`center: {centerId, endpoint, trust}`、可选`login: {presentation, handle, accountId?}`及`cache`数组。信任的系统CA模式为`{mode: "ca"}`；自给CA为同模式加仅含已验证PEM证书的`certificateAuthorities`；SPKI为`{mode: "spki", sha256}`。副本用`centerId/accountId/tenant?/operation/payload/result/acquiredAt`，按EC2已读成功Exchange校验；公开Schema经governance-center-client的`./schema`资源入口消费，不穿透源码。引用ID沿IV，具体缓存适用性与过滤仍由组合承担。本实现单份编码上限16MiB，超出显式unavailable；不静默截断。初始化等候上限5秒，不抢占初始化责任。实例身份用随机UUID，假设密码学随机源碰撞可忽略；不拿随机性代替比较。
