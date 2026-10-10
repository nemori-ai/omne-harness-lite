# 治理 CLI 装配承诺

本页迁入已采用的应用集成责任。文件输入、动作、报告、退出码及终端原行为继续受
[CQ1/CQ2 和保持清单](../../.meta_harness/design/architecture/identity-integration/preservation.md)约束。
跨模块采用依据归 [CLI 生命周期修正](../../.meta_harness/design/architecture/identity-integration/cli-lifecycle.md)。

应用以同一个 assembly-lifecycle 协调器按 storage 工厂、CLS、HTTPS transport、CG 装载。
每行必须同步登记，ready 成功且 fiber ACTIVE 后才能向下一行开放。SQL 桥选择 SQLite full，
不运行中心迁移。交给 CLS 的数据库只由 CLS 关闭；控制代码不选择提供者。

createClientAssembly 在任何资源副作用前返回私有句柄。requestStop 同步停止准入，重复调用幂等。
该实际装配返回PreparedClientAssembly。应用准备流程通过borrowState借用同一装配中CG所用的CLS。
借用必须等待全部行ready，并在返回前核当前装配仍开放；启动失败保留原失败，停止后拒绝新借用。
借入者不能关闭CLS；已借出的引用仍受提供者实际关闭边界约束。不得返回Context或另一份临时登录状态。
clientStopped 只观察实际 CG 关闭成功，或在停止屏障后确认本代未分配 CG 的合法前缀。
公开前 setup 失败不能隐藏已分配 CG；具名观察资源在分配前同步接管原关闭尝试。
close 抛错或拒绝必须报告 client-close-failed 和70，保留原报告、借入依赖及未完成的 closed。
不得以回调报错、服务不可见、超时或自然进程退出代替静止证明。

CG 实际结束后，TUI 先等待输入帧及输出完成，再实际尝试终端恢复。
恢复结束后才放行 CLS 行的释放门；恢复抛错记录 input-restore-failed，仍允许后续存储收尾。

正式交互只在原替代屏模式关闭时取得屏幕。入口核对模式后进入替代屏，确认成功后才绘制界面；已有替代屏则拒绝，不清空或退出他人的屏幕。正常退出、取消及可捕获失败均先排空原输入输出，再还原由本次入口改变的粘贴模式与替代屏，最后还原终端输入状态。替代屏进入写出前登记恢复责任，部分输出失败也尝试配对退出。退出后的主屏和原回滚记录不包含本次界面帧；外部录制仍能保存输出，不构成秘密擦除。
恢复或输入输出永不结束时，释放门不放行。CLS 关闭失败记录 state-close-failed，不能撤销已发生的恢复。
无 CG 的启动失败同样保留已分配 CLS 的表示门。资源尚未登记和分配时不虚构资源关闭责任。

closed 保留协调器报告及 fiber/端口撤除错误。正常本地打开失败保持原安全分类；
打开与清理双失败仍报告 internal-defect。所有诊断只包含稳定安全代码，不回显凭据或原始错误。

验证必须包含实际 SQLite/TLS/CLI、异常启动前缀、在途与迟到结果、取消、关闭故障和恢复次序。
既有有限模型、必要 PTY 与完整 GUI/IME 验收的各自范围保持，不互相替代。

## 随 CLI 发行的官方会话定义

正式会话宿主在装配时创建一个 `AssetEvaluator`，并将同一实例传给输入读取、资产注册、模型准备、工具定义注册、参数校验和工具历史读取。固定 Schema 资源只准备一次；已见过的完整作者 Schema 复用原编译结果。每次求值仍读取当前输入、权限和配值，每次工具调用仍校验实际参数。Schema 内容变化时重新编译；新宿主装配使用新实例，旧调用继续持有原实例。编译结果不进入跨宿主的全局作者缓存，也不代替当前资产可用性判断。

`session-factory-assets.ts` 拥有 `omne:session`、资产 `omne.cli.session-agent` 的官方发行。版本 1 的原正文及发行时间保持不变；版本 2 追加两项可覆盖偏好：`first_token_wait_limit=PT2M`、`post_first_token_stall_limit=PT30S`。这两项值属于本发行定义，不是全系统产品阈值或运行时补值。模型运行时必须读取实际求值结果；其他已授权配值层可按原求值规则覆盖。本增量不声称已经提供 CLI 配值管理入口。发行时间固定在各版本内；实际安装时间来自借入 Clock。两个版本均明确声明空 references 和空 contextSessionSeed，不隐含模型、秘密、预算或工具权限。

实际运行根仅在可信 creation 配置明确选择该定义时部署它。根先核实际 CG 登录，保留现有部署声明，再由具名工厂拥有者调用 EIS 官方安装入口。安装完成后，真实 G28、EIS 配方和独立 Session Context 按原准入路径消费定义；不能以 official 来源代替成员或执行授权。其他显式根不被替换，未配置 creation 不自动建会话。

重新启动认回原 release、revision 和安装时间；冲突、Clock unavailable 或发布结果不明均停止该次启动并收场，不覆盖、不重发、不把会话发布为 active。此装配承诺不表示正式 main 已完成宿主进程启动或真实 OpenRouter 验收。

## 官方 Files 工具

官方会话定义版本 4 在 Shell 之外引用 Files 和 Result。应用把原公开 Files 工厂、Sharp 图像 codec、同一装配参数校验器和宿主文件设施接入租户工具池，附件使用原 `cli-tool-results` 存储。Files 默认允许执行，仍经过原工具准入。相对路径取该 Session 创建时持久化的工作目录；该目录不构成文件访问沙箱。Files 不通过 Shell 执行文件操作。

版本 4 保持版本 3 的初始化 seed。应用在原 Runtime Context 上动态登记可选 `files.initial` 和 `tool-results.scope`。前者与 `shell.initial` 共用原工作目录来源，后者只返回原 Session 身份。配置只借用单独、短时的 coordinator 权限，完成后撤销；工具只取得读取权限。相同登记直接认回，冲突不覆盖。Run 结束撤除来源实例，不删除持久登记。既有合法会话按原当前资产选择采用新定义，不改写历史初始化事实或配方。

Result 读取工具必须与结果存储同时装配并登记真实实现，不能仅声称存在读取器。它从受控 Context 读取原 Session，使用该 Run 的实际访问资格调用结果存储的 readBytes。用户参数只能给出完整 AttachmentRef，不能选择租户或 Session。每次读取至多 512 KiB；图片返回内联字节，不把旧调用的附件重新归属给当前调用。关闭时先排空工具池和结果存储，再撤销实现。

模型请求在缓存历史投影物化后、原 Call 创建前准备图片。应用通过原 Session 与实时 Access 从结果存储读取已确认图片；原消息和附件引用保持不变，固定字节经 ModelCallHost.imageBytes 单独进入创建计划与发起计划。只有传输层转换请求表示。模型传输层同时装配公开的 `modelImageBalancedV1` 图片准备策略与共享 Sharp codec，由传输提供者管理准备任务、缓存和关闭。原 Session Log、工具结果和投影缓存保留附件引用。每次请求最多读取 8 个不同图片、合计 524288 字节；超限在读取前拒绝。不可读取、被拒绝或字节数不符时不提交该模型请求。隐藏父块中的图片不读取。Model Runtime 和 Tool Runtime 不新增日志恢复或文件读取职责。

模型调用引用外部内容时，应用通过现有 ModelCallExternalContentCustody 确认原附件保管。确认覆盖原输入、实际采用消息、完整回复及原始响应正文的全部引用，包括隐藏内容、派生表示和 offloaded 结果。确认使用实际当前 Run 的 SessionAccess 及不可变工具结果存储，核对租户、会话、完整引用和字节；已停止、无原 Run、缺失或不可读取均不确认。该存储没有自动删除或过期路径，原文件在 Run、模型调用及宿主关闭后保留，供后续有权读取和恢复使用。

## 应用根与租户目录

负责人已明确每租户有独立目录，并能识别自己的治理中心。应用路径形状由
[state-layout.ts](src/state-layout.ts)拥有。此处约束路径和绑定行为，不表示会话提供者或正式终端闭环已经交付。

根优先级为显式 `--home`、`OMNE_HOME`、当前OS用户家目录下的 `.omne`。
显式值须为不含NUL的绝对路径，统一规范化。文件系统卷根不能用作应用状态根。
无效值明确失败，不回落其他根或当前目录。
解析与地址计算不创建文件，因此帮助与版本查询不需产生状态目录。

租户目录位于根的 `tenants/<key>/`。key由完整中心标识及组织—账号身份共同定位。
中心标识直接复用governance-center-entry的公开GovernanceCenterId校验，不新增另一种中心ID。
显示名、URL、当前中心选择均不参与身份。路径编码保持不透明标识的精确值与组合边界，
不同中心的同ID租户不得混用。文件系统定位不授予登录、成员资格或会话访问权。

`tenant.json`只保管布局版本和固定中心／租户绑定。登录秘密不进入此文件。
它采用应用生成的规范UTF-8 JSON表示及末尾换行，拒绝重复字段或非规范的手改表示。
已有绑定必须与实际输入完全匹配，未知字段、非法内容及不支持版本不能当作空目录重建。
重复打开同一绑定不重写文件。初始化通过独占创建、文件同步和目录同步确认本机绑定，
未完成初始化的目录不代表业务租户已创建，更不代表运行数据库已提交。

私有根及以下受维护目录由当前OS用户拥有，权限为0700，绑定普通文件为0600且不得有额外硬链接。
路径各级不跟随软链接。祖先须由当前用户或root拥有，不能允许其他用户替换子项，
root拥有的sticky临时目录按已有本地状态提供者规则处理。权限不安全时拒绝，不静默chmod。
这不提供对同一OS用户或管理员的沙箱保护。文件错误只报告稳定分类，不回显绑定或秘密。

已有启动选择通过checkExistingTenantAuth只读核对完整绑定、私有目录和实际auth文件。缺失、损坏或绑定不一致时明确失败，不重建目录或空鉴权库。此检查不解释SQL内容；SQL格式及损坏仍由真实CLS提供者判定。

路径能力只准备租户目录和绑定文件，auth、data、sessions、assets等由真实消费者按需建立。
auth保管实际登录材料或受控秘密引用，账号登录的撤销范围不因目录隔离而变化。
data中的运行SQL及同Session原子参加者归实际提供者，sessions中的文件产物／导出不能代替日志事实。

## 正式入口的解析形状

[entry-command.ts](src/entry-command.ts)拥有新入口的可辨识命令数据。
解析只选择动作和输入，不读取秘密、连接中心、创建会话或触发Run。
实际准备、认证、提交和结果由后续正式入口装配承担。解析测试不能证明这些动作已经接通。

TTY中的裸 `omne`进入会话准备，`--session`显式选择已有会话。

默认准备读取实际根catalog与所选租户的原CLS。没有中心时收集中心配置；没有登录或登录被中心明确拒绝时，提供登录／注册选择。登录成功后在同一次入口继续准备。注册成功单独显示结果，再由用户明确选择登录。连接故障、身份不符、成员无效、未知结果或关闭失败均阻止进入，不自动重发登录或注册。

有效登录须经过实际CG的当前身份和成员读取，并与原固定TenantBinding一致。准备不修改默认租户、不创建Session、不发模型或工具调用。完成后调用应用配置的`enterSession`端口，传递原命令与这次身份观察；该观察不是执行资格。未装配会话入口时返回`not-ready`，不显示会话已就绪。终端与原客户端仍按共同的排空、恢复、CLS释放顺序关闭。
非TTY须提供 `--message-file <path> --json`，可选 `--session`。
单独 `--json`、缺少机读呈现的文件提交或非TTY裸入口均拒绝，不等待交互输入。
人读入口因缺少终端或不支持的终端而拒绝时，stderr 第一行保留固定诊断码，第二行给出正式机读入口。治理命令指出同一动作的 `--json` 用法；会话入口指出 `--message-file <path> --json [--session <session-id>]`。指引只使用受信的动作名称，不回显用户值、文件路径或凭据。拒绝非TTY输入发生在打开状态目录之前，不自动执行机读动作。
帮助和版本为独立、无身份副作用的入口。

治理入口为 `center add`、`tenant create`、`tenant add`、`tenant switch`。
账号入口为login、register、logout，以及logins list／revoke和credential change。
命令数据分别携带中心地址与信任选择、组织名、邀请引用或租户定位引用。
这些引用只定位对象，不能自行产生资格。鉴权凭据使用受保护的文件输入，不直接放入参数。

选项按动作校验，重复选项、未知命令／选项及互斥信任配置均明确拒绝。
非TTY治理命令必须使用JSON呈现并给齐必要输入。TTY中的JSON模式也不补交互答案。
秘密、原参数或解析器的原始错误不进入用法错误文本。
被替代的machine前缀、tui别名和旧治理命令不进入新解析面，被替代实现及其命令注册表、表单已物理删除。

## 新会话的身份准备读面

[session-preparation.ts](src/session-preparation.ts)从借入的固定GovernanceUse读取新会话所需的
当前租户与成员资格，两次都使用refresh。打开和关闭该use仍由调用者负责。
本函数不登录、不建会话、不提交消息，不重复治理请求。

它只采用实际线上成功结果，检查正式中心ID、账号、登录handle和租户形状，
并核对租户的账号及两次报告的身份一致。成员资格必须是有明确角色的effective。
呈现副本、无法核实、明确无效、登录被拒绝、身份变化及内部缺陷分别处理；
中心不可达不能被解释为登录已撤销。意外的端口异常向调用者传播，不吞错。

返回值只是这两次读取的观察，不是Session Access、持续有效的租约或跨系统原子鉴权证明。
会话提供者仍须在实际创建提交中执行其可信授权规则。秘密出示物不进入观察返回值。
此读面只服务新建会话；已有会话的离线继续遵守PF-016现行边界，不能因复用本函数扩大现读范围。

## 新 Run 的登录确认观察

产品负责人已确认：正在执行的 Run 不因登录到期停止，每个新 Run 开始前确认登录有效。
`session-preparation.ts` 的 `readNewRunLogin` 接受借入的固定 GovernanceUse 和本次选定的
中心／账号／登录 handle。它复用现有 S-36 的线上 refresh 读取，该操作已经要求登录当前有效。
它不读取成员资格，不签发新登录，不创建 Run，不提交或移除待处理消息。

观察必须来自线上成功结果，并与本次选定的完整登录绑定相同。无效的预期绑定在读取前拒绝。
结果中的当前租户须属于该账号，但它的组织选择不重写 Session 的固定租户归属。
返回值仅包含中心／账号／登录 handle，不包含秘密、当前组织选择或持续放行凭证。
每次调用都重新读取，不能以缓存、上一次有效观察或中心不可达冒充本次登录有效。
明确登录拒绝、无法确认、身份变化、重入要求与内部缺陷分别报告。意外异常不吞掉、不自动重试。

此函数只提供新 Run 门需要的远端观察，不是最终准入门。真实协调责任须在开始提交中
核当前本机资格、观察适用性及拒绝屏障，失败时保留原持久消息且不发该 Run 的模型／工具 IO。
原 Run 的合法后续 Attempt 和已经获准的原工具动作不消费此函数，不能因复用而加登录中断点。
调用者拥有 use 的打开与关闭。本函数不能作为跨系统原子授权或已完成生产装配的证据。

## 本机配置与未完创建请求

`catalog.ts`的内部应用端口拥有中心模板、本机启动选择及原创建请求，不拥有治理事实或
Session授权。采用单本机SQLite配置库，实际路径为根`config.sqlite`；它取代目录草图中的
`config.json`及中心`profile.json`。不双写同一配置，租户`tenant.json`及`auth/client.sqlite`保持。
配置库不能保存登录出示物、凭据或秘密引用；登录材料仍由原CLS保管。

中心显示名、完整中心ID及连接模板在同事务域登记。同名异中心或同中心异模板冲突，
完全相同认回原记录；添加不隐式更新。调用者须先取得实际TLS公共体检观察。
本机选择比较原storeId和revision，成功才登记完整租户绑定和原operationId。
版本冲突不改选择。调用者须先核实治理切换／目录准备，不以本机选择授予资格。

原创建请求保存center/account/loginHandle/name/creationKey，按center/account/creationKey
定位；同身份不同原请求拒绝，名称不去重。先可靠capture，后事务核原prepared状态并写
submitted，真正提交后才给唯一胜者一次执行许可。submitted只证明本机许可，不证明发送。
竞争者和重启恢复只读原记录，不再发送；数据库提交未知也不发送，不更换key。
未知请求保留，即使中心创建键保留期已过也不能自动重投。远端结果与本机准备分别保管。

端口借入AtomicStorage，不关闭它。close同步停止新准入，等待许可、远端调用及本机结果
记录的完整工作。结果尚未可靠保管时保留原值与依赖；关闭报pending-result，不能假报完成。
后续close可重试同一结果的存储核实／保管，不重新调用治理中心。策略显式约束中心数、
未释放创建记录数和单记录字节，达到上界不能删除unknown回收名额。

物理打开者独占创建才能初始化。已有损坏或不支持格式不能当空库重建。
每个打开者确认自身新目录及数据库文件所在目录的耐久性，同步失败不发布ready或许可。
SQLite full不能替代文件命名空间确认。文件0600、目录0700，不跟随软链接或接受额外硬链接。
`catalog-open.ts`拥有实际文件及FULL SQLite打开、停止准入、排空和关闭。
只有独占创建文件的打开者初始化；竞争者在明确时限内只观察同一快照中的空库／完整格式。
遗留空库、损坏或不支持格式不授予初始化许可。打开时限和轮询间隔由显式策略提供。
主文件及WAL／SHM均检查所属OS用户、0600、普通文件、无软链接和额外硬链接。
打开失败保留原错误与实际清理错误；完整正式命令仍须接入，不据局部承载声称产品交付。

## 中心添加前的连接观察

`center-preparation.ts`直接复用HTTPS公共体检函数，核实目标中心及调用者明确选择的TLS信任。
它在等待网络前捕获连接模板，不能因之后修改参数而保存另一份地址或信任。
它不读取或发送登录材料，不登录、不切换，也不保存本机配置。成功返回值只证明本次
体检及连接模板，不能充当当前成员资格或Session授权。实际配置持久保存由入口承担。

名称须是非空白字符串。已声明的连接配置错误归invalid-input，连接、信任、超时、
取消及响应失败保持原分类，未知错误原样传播。失败不能自动重试或覆盖原配置。
替换端口返回非法中心标识时拒绝采纳，不生成本机中心ID。

`center-add.ts`将上述观察与配置库保存组合。调用者先展示并确认核实后的中心和信任模板；
确认回调只接收副本，不能更改将要保存的原模板。拒绝或取消不保存，体检失败不请求确认。
成功只登记配置，不登录、不切换租户、不建立Session；同名／同中心冲突沿配置库明确返回。

## 创建组织后的租户准备

`tenant-preparation.ts`消费借入的固定GovernanceUse、已核实的中心／账号／登录绑定、
原组织名称及稳定创建键。调用者须在远端副作用前可靠保管这份原请求；本函数不生成
重试键，不负责请求日志或存储初始化。正式命令仍须完成上述保管和结果呈现接线。

无效名称、键或绑定在调用治理端口前拒绝。有效输入只调用一次团队创建，保留原完整
ActionReport。没有可核实组织结果时返回unresolved，不把未知或不完整响应称为未创建。
固定身份不一致也保留原报告，不能因此自动再次创建。

创建结果可核实时，再线上读取该组织名称和目标成员资格。两次结果须与固定中心、账号
及登录一致。只采用中心返回的原名称和明确effective角色，不采用显示缓存或本机回显。
组织已创建而准备受阻时，返回原组织身份和准备失败；准备失败不能回滚远端创建或重做。
函数不切换中心当前租户，不修改已有Session，不关闭借入use，也不签发Access。

## 租户内的原登录材料承接

[tenant-login.ts](src/tenant-login.ts)借用两个ClientLocalState，将已认人的原登录材料保管到
目标租户的本地状态。调用者须先核对目标目录的完整绑定，持有来源和目标的生命周期，
并传入固定治理use取得的身份观察。本函数不选择目录、不关闭存储，也不调用登录接口。

来源的中心、已认出的账号及原登录handle须与观察一致。目标不能属于另一中心或账号。
目标已保管完全相同的原登录时只读认回，不改revision或读取副本。
替换同账号旧登录须由调用者显式选择replace-same-account；empty-only不覆盖已有其他登录。
已有目标的实际连接与TLS信任保留，不被来源模板重写。首次安装不复制来源读取缓存。

承接使用目标拥有者的SnapshotToken和compareAndReplace。冲突明确要求重新选择；
unconfirmed保留原operationId，不自动再次写入，也不销毁原材料。后续读取可确认实际已安装材料。
两个存储不共享事务，此操作不承诺跨库原子移动；来源材料须在目标实际确认前继续保管。
返回installed只证明目标本地保管，不证明登录当前有效、成员资格有效或Session访问已获准。
跨租户保管的相同handle仍是同一账号登录，撤销范围不因复制而变化。错误返回不含秘密。

`tenant-auth.ts`将完整已核实身份绑定到实际租户目录，再通过公共CLS提供者打开该租户auth。
它按原operationId调用登录承接，等待结果后关闭自己打开的目标CLS；不关闭借入来源，
不删除原材料、不登录、不修改根启动选择，也不将身份观察变成Access。
账号／租户冲突及非法操作身份在创建目录前拒绝；跨中心来源不能写入目标登录。
已有目标的活体TLS连接保持。安装与关闭双失败保留两项错误，不假报完成。

## 创建租户的应用流程

tenant-create-command.ts组合实际CG、根catalog和租户auth准备。调用者给出本次原creationKey、已解析参数及固定中心／账号范围；函数在等待前捕获这些值。它自行打开一个固定GovernanceUse，线上读取实际登录，允许刚签发但尚未识别账号的登录在本次读取中认人。线上来源必须仍是原中心和原handle，已有账号不能被另一个账号替代。结果还必须符合入口捕获的中心／账号范围，不能按其他租户的出示物重新解释本次命令。该观察不签发Session资格。

原请求必须可靠capture后才能取得catalog的唯一创建许可。conflict或unconfirmed不发送创建；submitted或结果未知的原请求只认回，不换键重发。远端已创建、本机成员准备失败和本机鉴权目录失败分别返回。创建或添加不隐式切换；本流程也不建立Session。只有可核实的目标成员及完整固定身份才进入原登录承接，承接使用原creationKey作为本机原操作身份，不覆盖其他登录。

函数等待自己打开的use关闭，不关闭借入CG、catalog或来源CLS。工作和关闭双失败保留两项错误；未知异常传播，已记录远端结果仍归catalog保管。main通过正式entry解析、entry-execution及tenant-create-entry消费此函数。治理交互、默认会话准备与终端会话分别遵守其下文的生命周期约束。


## 创建租户的入口装配

tenant-create-entry.ts消费根catalog的原启动选择，并核对所选租户的已有绑定和鉴权文件。无选择时返回not-selected；已有目录缺失或损坏时返回实际安全分类，不建立空目录冒充恢复。正式main消费该入口，交互补全先取得所需输入再调用同一业务流程。

入口打开所选auth目录的实际Cordis装配。它核对同一CLS中的中心及已识别账号，再将固定范围交给创建流程。根配置、目录绑定和登录读取都不签发Session Access；团队创建仍通过实际线上治理能力完成。创建后不修改原启动选择，不建立Session。重复认回同一原creationKey不重新创建；网络及取消导致的未知结果仍由根catalog保留。

入口只关闭自己打开的装配，不关闭借入catalog。取消触发实际装配停止；在途副作用保留真实未知结果，不改称未发送。只有实际clientStopped成功才放行CLS释放门。收尾失败返回安全诊断并保留原业务结果；工作与关闭双失败保留两项原错误。调用者必须把任何收尾诊断呈现为失败退出，不能只根据远端created返回成功。


## 正式进程的结果与失败

main只使用entry-command的命令面；旧machine前缀、tui别名及旧治理动作不再作为进程入口。帮助与版本不打开状态目录。entry-application对已执行命令输出omne-cli/1：action、outcome及安全diagnostics。JSON模式输出单个JSON对象和换行；治理人读输出同一对象的缩进表示，会话人读输出原受理状态、会话身份及操作身份。

退出码0表示动作及本机准备完成，2表示未执行或明确拒绝，3表示不可用或尚未接通，4表示原结果或本机提交不明，70表示缺陷或收尾／输出失败。远端创建成功而目标auth准备失败不能返回0；收尾诊断也不能被远端成功覆盖。原治理报告沿CG的实际退出分类，不复制其授权或判断规则。错误输出安全代码，终端准入失败另附机读指引；不回显原异常、凭据或参数。

正式执行器提供四个治理动作、登录／注册、退出、登录列表／撤销与换凭据。Session机读执行器向匹配宿主提交新建／既有会话输入并观察原结果；它不自行签发执行资格。可替换应用装配缺少对应入口时返回not-ready和3。裸入口先执行默认准备，再通过独立宿主进入终端会话；机读提交只连接已配置并运行的匹配宿主。

根catalog策略由应用构造输入提供。当前程序采用最多256个中心、100000个原创建请求及每记录1MiB的初始本机上界；达到容量明确失败，不删除unknown请求回收名额。应用组装者可传入另一组合法有界策略，策略不是授权或租户事实。


### 登录与注册准备

正式`login`／`register`命令从根catalog选择已保存中心。显式`--center`匹配名称。缺省只采用当前租户对应的唯一中心模板；没有当前租户时，只采用唯一模板。存在歧义时要求选择，不猜地址发送凭据。

应用以`run/login/<center-id>/auth/`保管初始化期间的实际CLS。该私有工作区按中心隔离，不能用作Session事实源。空CLS先安装所选中心的现行模板，再由实际CG重新核中心和信任。已有记录的中心不符时拒绝，不重建或覆盖。只有核对通过才读取受保护凭据文件；读取保留完整内容。命令取消停止新准入和输入，实际原请求沿CG的排空责任收尾。

注册返回原注册结果，不自动登录或建立Session。登录返回的秘密仅由实际CLS保管，表示层使用CG的安全报告。登录成功且本机保管已知完成后，应用打开固定use，现读账号、当前租户与成员资格，将同一条原登录保管至该租户的auth。显式登录允许替换同账号的登录，不允许跨中心或跨账号替换。租户保管成功后，以远端动作前捕获的根选择作CAS；竞争失败和未知分别报告，不覆盖竞争者。

远端登录、本机鉴权保管和根选择是三个分别可观察的结果，不能声称它们跨文件同提交。未知登录不自动重试，不假造登录材料或租户选择。初始化CLS在认回和保管不确定时保留；本增量不实现自动清理该工作区。`logged-in`报告只有鉴权已安装且根选择已确认时退出0。保管／选择未知退出4，冲突或未保管退出3；关闭缺陷仍退出70。登录和注册路径不创建Session。


### 添加与切换租户

`tenant add`只经实际治理S-25接受邀请。CG携带原登录并由中心推导接受账号，CLI不接受自称账号的参数。成功返回的租户必须属于原中心／账号；应用随后现读S-26的目标成员资格，将原登录保管至目标auth。接受成功与后续保管结果分别呈现；后续失败仍保留原接受报告。此命令不改变根选择，不创建Session，不在未知时自动重发接受请求。

`tenant switch`的机读引用是完整TenantBinding的JSON：formatVersion、centerId及tenant的organization／account。引用不是路径或数据库键。应用提供tenantReference／parseTenantReference进行有界编解码，拒绝重复字段、额外字段和无效身份。人读候选必须展示同一完整身份；不能仅凭组织名称、目录散列或跨中心相同字符串授予访问。

切换只针对当前中心／账号。应用固定启动选择，核已有租户绑定／真实CLS，再现读原登录的当前租户和成员资格。远端当前租户与固定启动选择不符时拒绝，不自动重解释。目标S-26资格有效且原登录已保管到目标auth后，应用携实际expectedTenant执行S-37。显式切换允许替换目标同账号的旧登录，同时保留目标中心的活体信任配置；跨账号／中心仍拒绝。只有原S-37已知成功，才以捕获的根选择CAS修改默认租户。远端成功、根冲突及根未知分别返回；unknown不自动重试，也不写本机成功选择。已存在Session与在途执行不随默认选择迁移。

### 账号安全命令

退出、列出／撤销登录及换凭据都借用所选租户对应的实际CG，命令拥有自己的固定use和装配。列表强制线上刷新，撤销不携带读取选项。换凭据经实际runPrepared在核中心和账号之后读取两个受保护文件，保留完整内容；不将秘密放入命令载荷预览或结果。

成功退出、撤销当前登录或换凭据会使原use要求重登录，这是这些动作的预期结果。CLI仅在原报告无缺陷、动作已受理、远端成功且本机安装已知完成时，为S-16／S-50返回0。未知、拒绝、本机保管失败和关闭错误仍返回失败；不改CG公开报告和其通用退出分类。

## 治理交互输入与表示所有权

正式治理入口在非JSON的TTY模式下借用既有Dialog，补齐缺少的动作输入并确认。
凭据输入只收集受保护文件的路径。秘密读取仍由实际CG的准备回调承担，读取前先核中心和账号。
原解析命令不被修改。取消输入或确认不执行相应业务动作；在途请求仍遵守CG的原结果及排空规则。
JSON模式不读取交互候选、不打开终端、不补交互答案。非TTY的人读入口在解析阶段拒绝。

中心候选来自根catalog，展示名称、完整中心ID与HTTPS地址。
租户候选通过所选租户的实际CG线上刷新S-27，逐项现读S-26资格与S-22名称。
候选携带完整TenantBinding，展示组织名称、组织ID、账号、角色及中心ID。
“Current local selection”只表示根catalog的启动选择，不证明远端当前选择与本机一致。
邀请候选来自原账号实际S-57结果，展示发出组织、接收账号、角色和到期时间。
只列出pending邀请；候选读取不接受邀请、不切换租户、不授予Session资格。
执行时，实际治理动作重新核当前资格。读取失败不能冒充空列表，跨账号结果及重复身份拒绝。
候选数量使用装配提供的正整数上限，超过上限明确失败，不静默截断。发行装配初始上限为256。

添加中心的确认发生在实际公共体检成功之后、根catalog写入之前。
确认展示原观察中的名称、地址、中心ID及信任源。SPKI展示其SHA-256指纹。
自选CA展示所用CA文本字节的SHA-256摘要；系统CA明确标记。CA文本不进入确认页面。
确认不改变原观察模板，取消不保存模板。

终端由本次治理交互拥有。准备工厂的presentation属性是应用内部的构造输入，不来自命令数据。
表示拥有者在资源分配后登记每个真实装配，只用其实际clientStopped成功标记静止。
候选及执行装配在CG停止后保留原CLS释放门，不能提前把closed当作已经完成。
交互先等输入排空及输出结束，再在所有CG均已确认静止时尝试终端恢复。
恢复尝试结束后逐个放行CLS，等待真实closed并保留其诊断。恢复抛错仍可继续存储收尾。
静止无法确认、输入排空失败或输入／输出不结束时，不放行终端恢复及CLS释放。
提示在两路收场结算后结束，即使排空失败也不能永久等待已停止的输入。
原业务成功不会掩盖恢复或关闭失败。工作和收场双失败保留原错误，表示层仍只输出安全代码。

发行装配默认使用auto终端准入，未设置或空的OMNE_TERMINAL_PROFILE不再拒绝交互。
准入要求同一实际独占UTF-8 TTY，并通过DECRQM核对粘贴模式2004和替代屏1049。
这些查询及其状态变更经过SSH传递给客户端终端，不需要DISPLAY、X11或指定终端品牌。
已有替代屏、能力不受支持、查询超时和恢复失败仍按原规则拒绝或报告失败，不猜测原模式。
显式xterm-379和iterm-3.7.1beta1保留其原处理；未知配置拒绝。TERM不是能力通过的证据。
B01应用运行平台仍为Linux；在其他操作系统使用SSH客户端不等于在该系统运行本应用。
终端必须保留括号粘贴边界，并阻止粘贴正文伪造结束定界符。真实终端、IME、宽字符、resize和恢复验收另行执行。
输入管线按已发送但尚未收到回复的模式查询登记，分离分块粘贴中的对应回复，不以应用所在操作系统判断客户端终端。
等待超时不删除未结查询登记。对应回复到达才消耗登记，同模式的旧回复不得满足新的查询。已经持有的回复前缀须完成或遇到EOF才释放，查询超时不丢弃该前缀。
没有待处理查询且没有持有前缀时，字节原样交给输入分帧器，不静默删除粘贴正文中的类回复内容。
此治理输入接线不表示默认会话准备、Session终端或完整B01已交付。


## 会话准入的治理来源

可信宿主以固定center／account／login handle／tenant构造session-admission-probe，并借入原GovernanceClientOperations。原G28拥有持久排队、核验唯一性和票据消费；本适配器只提供一次已实际结束的治理观察，不签发Access、guard或Run，不写Session事实。它不从CLI body建立身份，不能把目录或登录副本当作当前资格。完整宿主消费者仍在施工。

每次核验先核原固定来源和目标租户，再打开实际client use；打开来源不同则关闭原use并返回unavailable，不发送核验。新Session沿线上refresh读取原登录和当前租户成员，固定租户及原来源均匹配且成员effective时返回携带实际role的memberValid；明确成员无效返回memberRejected，不记作登录拒绝。新Run只现读原登录，不附加成员线上查询，也不按登录的当前租户重新解释既有Session归属。

明确原登录拒绝返回rejected；copy、未知、来源不符及当前无法判定返回unavailable。适配器不自动重试。只有原use实际关闭后才返回核验结果；工作或关闭抛错传播，双失败保留两项原错误，不能据已读到有效结果先释放G28屏障。G28在无法取得实际已结束的结果时保留原querying，后继不得越过。借入CG及其CLS的关闭仍归真实宿主，不归一次核验。

实际CG／CLS／根G28组合须验证：新Session成员与新Run登录的不同查询面、较新登录拒绝和重开屏障、成员拒绝后恢复、原use关闭失败后零重发，以及错误绑定零治理IO。此组合测试的运输输入是受控的；正式HTTPS／宿主／模型与工具闭环仍须完整B01验收。


## Session Context提供者选择

应用的session-context构造入口选择正式runtime-context-local提供者，每个Session使用新工厂，并通过session-runtime-local公开./cordis传入原plugin、ready、initializer及closeAdmission。Context隔离、固定Scope桥接及原关闭责任仍归Session构造器；应用不复制其实现。运行引用不进入JSON配置。该入口是实际装配构件，完整运行宿主尚须消费它并闭合合法资产／根配方及执行接线；入口存在不表示宿主进程已经交付。

## 原创建配方与Session初始化装配

session-bootstrap固定原center／account／login handle／tenant，借入真实G28、租户Storage、归属、日志、SessionAccess和Clock。普通CLI请求不能提供这些引用。它使用原创建票据的实际消费回执核Session身份，并从原根记录读取角色。每次资产读取另经G28当前成员顺序和活体guard授权实际租户单元。原角色是配方，不是治理中心当前真相或当前权限。

应用选择evaluation-input-store的公开./admitted来源。合法实际定义与原根配方确认后，可信部署／定义拥有者须从原求值输入提供完整ContextSessionSeed；没有默认seed、默认配值或合成秘密。应用随后选择每Session新的正式Runtime Context提供者，等待其实际ready和原Scope初始化完成，才向Session创建入口返回ready。不可用保持原预留未发布，接续认回原身份；已发布重放不重新查询或初始化。

装配只向可信宿主提供已初始化Context和只读输入面，不把运行引用放入JSON或向普通客户端暴露捕获／关闭能力。关闭先停止新初始化、来源读取与Context准入，再等待原工作和实际Context释放。原释放失败保留责任，retryClose只重试原关闭，不恢复准入。借入G28、日志、CG和Storage仍由宿主关闭。

runRegistry只接受同Scope、当前世代的原Run journal。它经evaluation-input-store的./admitted读取原Run固定根可用性和历史正文，不伪造当前成员或授予reload。应用保留读取器的关闭责任；单次借用释放或整个bootstrap关闭时，先排空读取器，再释放其借入的journal、manifest和Storage。

createSessionRunAssets组合原Run输入、历史正文和实际AssetRegistry。构造同步返回包含ready和close的原资源拥有者，初始化失败后仍保留关闭入口。manifest为空时按显式求值策略和initialFillRef填入六表。默认从已有manifest重建，不因新Run或新的initialFillRef重新填表。

正式CLI显式选择其官方Session定义作为refreshRoot。只有当前合法输入与原manifest的根能力均为该定义，且实际选中资产或版本改变，才通过原注册表完整求值和fill重装配。重装配采用由原initialFillRef、当前manifest head及实际根能力、资产和版本派生的独立填表身份，不能复用原版本的填表身份；填表后重新核实manifest根已对应当前选择。能力不匹配、原根来源不唯一或读取失败不能授权重装配。同一资产版本不重复填表；其他消费者未选择refreshRoot时保持原manifest。重装配不改写Session初始化快照、历史消息、原调用或原操作身份。后续模型请求分别消费当前系统提示、工具声明与原消息历史，历史工具调用仍使用原采用事实。

读取或填表未确认时ready返回unavailable，不自动重发。关闭先停止初始化发布，等待已开始的初始化，再关闭注册表和输入读取器；借入bootstrap、manifest、journal和Storage仍归原宿主。

此装配构件的组合测试必须区分实际持久资格、资产和Context与受控运输／seed／访问端口。独立宿主、动态Agent贡献、真实SessionAccess发行、模型和工具消费者及默认产品路径仍须完整B01验收；构件通过不能作为三张故事卡完成的依据。

## Session访问发行的装配义务

可信宿主从实际登录来源或原Agent／系统装配核实主体种类后，构造固定租户的createLocalSessionAccess。Session Context仅借入其operations；issuer保持在可信宿主，不经命令body或普通服务暴露。当前只读组合使用原SessionRuntime公开readSession核实际G28成员及Session持有，绑定明确的已鉴权自然人主体，只允许context.read；不能据此声称Agent／系统主体或模型／工具执行权限已核实。后续消费者须按各自原权限核实，不能从consumer名称推断主体种类或增授session.log.coordinate。

组合测试中的访问绑定已经由实际提供者发行，当前拒绝来自真实G28持久观察和原SessionRuntime读取。运输、seed仍受控，正式宿主尚须消费这些构件。

## 官方部署的Context声明输入

contextSeedFromDefinition是本应用对其官方部署根的解释器。它只消费真实已授权输入来源持有的完整NonConnectorEvaluationInput，不从普通命令body接收资产或声明。定义正文的contextSessionSeed是应用拥有的附加字段；AD1的references／attributes承诺保持原归属。本解释器只采用官方定义及实际factory层official持有；合法的普通自定义根及其自报字段不能充当本解释器的meta声明来源。其他定义／部署提供者仍须通过原可信contextSeed端口供应其实际声明，不能据合法资产身份授予初始化权限。

解释器核固定Scope的租户，并按本次合法读数的root.source精确定位唯一asset／version及同根能力。它不换用最新版本、其他定义或其他租户。正文通过公开readOpaqueJson解释，contextSessionSeed通过公开decodeContextData的Seed固定Schema捕获；字段缺失、非法或原版本缺失返回unavailable，不补空required／initial／fixed、身份、配值或秘密。语义及原子初始化仍由实际Runtime Context初始化拥有者核验。

此字段表达显式声明；空列表只有在实际官方声明明确给出时有效。初始化数据本身不授权，issuer／原G28／当前读权保持各自责任。组合测试须以真实持久官方发布取得声明，并覆盖缺失／非法、精确来源及factory持有缺失；受控运输仍不作为正式中心部署验收。

## 宿主的纯用户文本读取

createSessionConversationReader消费实际Ingress可信journal面，固定真实租户；请求只接受闭合SessionScope数据。非数据／访问器拒绝且不执行访问器，跨租户在日志读取前拒绝。日志坐标和当前成员资格由原Ingress在同单元核验；固定历史坐标不授当前权。

该读面输出固定source及原日志位置顺序中的用户可见内容。显式Message封装才参与，事实／事件与其他JSON不转成消息。共同HumanBlock投影保留块ID、文本、公开thinking正文、工具调用ID／名称／参数编码和原参数、工具结果的调用ID／结果／原因及可见子块。结构化参数用无损JSON序列化，不降低数值精度；无法解析的参数保留原文本并明确标识。toHuman=false的块及整个后代不输出；不携带原能力记录、OpaqueJson、加密推理或模型专用块。媒体只显示类型及已有名称，不读取附件内容。没有可见块的消息不输出。模型请求消息投影仍由其自身拥有者维护。

重复读取不写日志、创建Run、初始化Context或发起模型／工具。损坏的已拥有消息明确StorageDefect，不跳过成部分成功。此函数只提供可信宿主消费者，连接关闭、实际进程协议与独立执行排空另由宿主装配承担；本函数不证明宿主已启动。

## 本机Session宿主的数据传输构件

`session-host-protocol.ts`拥有应用内部传输的数据形状，格式标识为
`omne-session-host/1`。请求显式包含完整中心／租户绑定、动作及该动作的原输入。
创建、消息提交、回执、Session及进度读取映射到原Session入口；用户文本读取使用上述
独立读取面。解析拒绝重复字段、未知字段、非法消息及非数据对象，不执行访问器或toJSON。
稳定操作键和完整OperationRef沿用原拥有者；传输不生成新的业务身份。

`readCreationDefaults`只读可信根显式给定的创建偏好：AgentDefinition引用、executionType、
mode和collaboration。它不授予成员资格、资产合法性或执行权限，也不预留Session。
未配置时返回creationNotReady，不补初始资产或策略。偏好快照不包含operationKey或workspace。
客户端后续提交完整createSession输入；真正创建仍由原G28和Session拥有者核验。

`createSessionHostEndpoint`只供可信根装配使用。装配须提供真实匹配的中心／租户绑定和
原LocalSessionIngress；它不能从普通请求body造principal或Access。绑定不同在业务端口
调用前拒绝。实际调用使用原活体Access及提供者的当前授权检查；Access、协调资格、
AttemptPermit、Storage和原始日志均不进入请求或回复。普通消息输出只包含允许展示的文本。

`startLocalSessionHost`拥有本机Unix HTTP监听器及入站请求。通道地址为状态根下的
`run/<tenant-digest>.sock`。tenant-digest复用租户目录的完整SHA-256身份摘要，以base64url编码，不截短摘要；绑定同时包括中心、组织和账号。共享run目录仅承载临时通道，各租户持久数据仍在原独立目录。不同租户可在同一状态根保持独立宿主；通道名不授予访问权，服务端在调用业务入口前重新核完整绑定。完整socket路径超过103字节时拒绝启动或发送，不允许系统截断路径。父目录按原私有命名空间规则检查，socket归当前OS用户且为0600。
绑定失败不能先删已有socket，也不能覆盖存活宿主。Node HTTP负责消息分帧；应用只校验
固定POST路径、媒体类型、严格UTF-8／JSON及实际字节上界。通道不提供对同一OS用户或
管理员的沙箱保护，不替代根装配的真实身份来源。

容量、请求／响应字节、连接数、头部上界、超时和故障保留数均由显式策略给定。
分配入站工作时先预留容量；容量失败不调用业务端口。停止准入后，包括仍在接收body的
请求均不得进入业务端口。客户端断连、取消等待或超时不向已受理操作传取消信号。
业务结果超出回复上界时报告传输失败；不得伪造成功回执或改动原业务结果。

监听器关闭先停止准入，再等实际网络关闭及原入站工作结束。它不关闭借入的Session、
Context、模型或工具拥有者。意外业务／传输缺陷停止新准入，并交给显式诊断端口；原缺陷
与诊断缺陷在关闭时保留。故障记录达到上界后保留额外故障数量，不用截断制造无故障关闭。
监听器关闭不是完整运行根、模型池或工具池已经静止的证明。

`sendSessionHostRequest`只发送一次。发送前只读检查既有私有目录与socket，不创建宿主
或修复不安全路径。等待时限和响应字节上界由显式策略给定。只有合法成功回复才返回reply；
通道不可用、等待结束、宿主拒绝或坏回复返回unconfirmed，携带原完整请求。此状态是
传输未确认，不冒充提供者的unknownCommit，不自动重发、不更换操作键，也不证明业务未提交。
回复保持数据形状，不能经JSON cast恢复活体授权对象。

上述函数是供运行根消费的运输构件。正式main的启动／附着、部署输入、运行协调和
模型／工具装配仍须由真实应用接线与验收闭合；构件测试不代表正式CLI闭环已经交付。

### 宿主启动与附着

`connectSessionHost`先通过原私有协议读取创建偏好。合法回复确认通道可用，不创建
Session或Run。没有配置创建偏好的宿主仍可附着，返回的defaults为null。
调用开始时固定完整租户绑定与四项等待策略，后续不随调用者修改而改变。

只有通道文件不存在时，才调用应用提供的可信launch函数一次。launch提供已安装启动
输入、独立拥有生命周期的实际子进程。连接函数不从用户请求接收可执行文件或代码，
不代替应用的生产装配。已有但不可用的socket、错误的就绪回复和不安全的路径不会
触发替换、删除、清理或重启。真正绑定仍由原监听器排他完成。

启动后按显式时限及轮询间隔等待原协议。原进程创建错误或提前退出明确失败，不自动
重新启动。取消或到期返回unconfirmed，只结束本次等待，不发送终止信号，也不表示
宿主没有启动。这个连接函数不拥有Session、Context、Storage或执行池的关闭权限。

该连接逻辑已通过真实子进程与私有协议验证。正式main、独立宿主入口和部署配置仍须
接入后才能作为完整CLI启动能力交付。

`createSessionModelTaskOwner`跟踪Session模型路径的读取、等待和写入任务。
注册先占用并发容量，释放必须等待本次注册的实际任务结束。关闭撤销新注册并请求
取消，仍须等待原任务结束；未释放的注册使关闭返回unavailable。原选择及调用组件
继续负责写入语义、结果确认和未知提交的认回；任务拥有者不读取会话历史，也不发起
重试。结果不明的写入在原注册释放前保留。释放表示调用者已满足原协议的停止和
认回条件；任务完成本身不触发释放。

## 原模型唯一发起拥有者的应用选择

session-model-owner的createSessionOriginalModelOwner是可信应用构造器。它选择公开createOriginalIssueOwner，传入与Session相同的AtomicStorage及原活体日志权限；通过modelIssue工厂交给Session参加者，不从Session具体提供者导入或选择该模型实现。每个工厂只附着一个原拥有者。模型登记、当前装配模态和凭据沿ModelRuntime的原调用路径核验，正式根不再提供独立current授权回调；账户额度本期不作约束；持久记录容量和在途上界仍显式提供。没有默认模型、凭据或预算。模型登记及装配模态沿原拥有者，不在CLI另建许可制度。

bind固定原Scope、prepareCall及其实际permit，以OriginalIssueAdmission形状供模型原调用的SettlementLogBinding消费。原模型输入先经其公开prepareOriginal捕获，然后经Session同单元modelInvocation.admit；应用不调用绕过Session的原admitOriginal。成功只转交原claim和原位置；复制claim或另一binding的claim不进入原consume。consume仍由原模型拥有者重新核当前资格和唯一启动权。重复alreadyIssued映为原模型conflict，不转换成confirmed或第二启动权；最新栅栏／终态及来源重读失败保持原失败语义。

unknownCommit必须先交还构造时明确提供的retainUnknown责任端口，保持原Scope、call及协调准备位置，然后对原模型调用返回unavailable。它不重试发起、不替换原身份，也不以不可用伪称未提交。责任端口异常保留原异常交Session fault owner，不吞为正常模型结果。正式根必须持续保管该义务，并按原持久准备和模型拥有者的恢复规则接续；此构造器没有授权通用重发。

close同步撤本原拥有者的新准入，等待原模型唯一发起责任核实；pending保持原资源，后续可重试原close。它不关闭借入Storage／日志、Session、Runtime Context或模型实际执行池，不把原发起拥有者关闭当模型调用已经结束。正式根仍须配对真实ModelRuntime及其executionSource、完整结果保管和ACK。当前构造器的实际SQLite／CG客户端／Context／原模型owner组合使用受控运输和模型输入；它不是完整运行根、真实OpenRouter或默认CLI验收。

## 原 Run 的模型运行时接线

可信根从Session提供者公开入口选择`createSessionRunModelBinding`。它提供实际Model装配factory、原issue绑定、原Run求值来源及工程策略；领域借用和调用绑定由提供者拥有。具体ModelRuntime及其facts仍在应用根配对。行为见[提供者规格](../../packages/session/session-runtime-local/SPEC.md#原-run-的模型运行时接线)。

## 原模型结果来源与借用结束

可信根从Session提供者公开入口选择`createSessionModelResultSource`，传入实际物理executionSource、同Unit引用保管与明确容量。该构造器的能力身份和释放语义由提供者维护。行为见[提供者规格](../../packages/session/session-runtime-local/SPEC.md#原模型结果来源与借用结束)。

## 原Run历史的模型读取

模型SDK的Run历史由Session提供者公开`createSessionRunHistory`解释。应用不维护另一份Run状态扫描。行为见[提供者规格](../../packages/session/session-runtime-local/SPEC.md#原run历史的模型读取)。

## 宿主拥有的一次原模型消费

原模型段通过Session提供者公开`runSessionModelTurn`执行。应用只提供真实源、工程策略和原责任保管端口。结算使用Core factory；选择具体Model提供者仍归根。行为见[提供者规格](../../packages/session/session-runtime-local/SPEC.md#宿主拥有的一次原模型消费)。

## 原消息受理与机读结果观察

`session-submission.ts`只读普通用户的原submitInput回执，再读一个经当前成员授权的固定完整日志前缀。这是两个读取操作；回执不可变，后续前缀必须同Scope、同journalGeneration，并覆盖原回执。它核原input_accepted与原UserMessage位置，再按run_started／input_adopted／run_finished关联真正消费该输入的Run。尚未消费时run为null；上一轮completed不能替代本次消息的结果。读取至多O(n)，不追加事实、不消费输入、不授予执行或取消资格。

普通宿主数据协议增加readSubmission。请求只含完整租户绑定及原OperationRef，不含活体Access、permit或协调资格。宿主仍从可信构造取得原Ingress；跨中心／租户绑定在业务动作前拒绝。用户文本读取携带日志原run字段，未归属Run时为null。该字段只是归因数据，不是执行权。

正式main通过entry-execution消费session-message-entry，支持`omne --message-file <path> --json [--session <session-id>]`。
文件有明确大小上限，必须是严格UTF-8、无重复字段的JSON UserMessage。应用先验证完整消息，
再读取真实根catalog选择及该租户的已有鉴权目录，核中心／账号一致。它不从消息文件制造身份，
不自动建立缺失租户或切换选择。客户端只拥有自己打开的catalog和治理客户端装配；模型、工具、
Session及宿主执行资格仍由宿主拥有。新Run的登录确认继续由原G28路径承担。

指定Session时只提交与观察，不读取创建偏好或创建新Session。未指定Session时，
createSessionForMessage从已运行的匹配宿主读取实际创建偏好，捕获完整输入并只分配一个原创建键。
可靠认回完整原创建回执后，才用独立消息操作键提交消息。配置缺失或非法时不分配创建键。
创建运输未确认、unknownCommit或回复身份不匹配时保留完整原请求及OperationRef，返回退出码4，
不重发、不新建会话，也不提交消息。明确创建拒绝和配置不可用返回3。
创建回执必须匹配原租户、主体、操作键、新Session及原日志坐标。机读报告使用无损编码。
读取偏好与创建之间的配置变化不改写已捕获的原语义，实际创建仍重新核合法资产和资格。

`submitSessionMessage`只发送一次原提交。其余请求只观察原回执；它拒绝异操作、改变的回执、异journalGeneration、不同消息和倒退前缀。unknownCommit保留完整原OperationRef；运输未确认保留原请求身份，均不自动重发。取得回执后，等待超时、断连或取消等待仍保留原回执，不取消原Run。

只读请求的运输暂不可用、宿主拒绝和显式unavailable按原轮询间隔重试，共用调用者的等待截止和取消信号。非法回复、关联不符、invalidInput、absent、denied或notFound结束观察，保留原回执及最后一次有效读取。非法回复、关联不符或invalidInput返回accepted及invalidObservation；其余上述非重试结果返回accepted及observationUnavailable。它们不把已受理输入改成unconfirmed。

终态消息读取沿用同一重试、截止及取消规则，只有覆盖原终态观察的有效前缀才能产生终态结果。

应用根显式提供请求时限、整体等待时限、轮询间隔和回复容量。maxWaitMs为正整数时限制整体等待；为null时只由调用者取消结束等待。每个请求仍有有限时限。实现使用Node异步计时器及调用者等待信号，不为客户端等待创建线程。

仅本次输入对应Run的completed返回退出码0；failed／cancelled返回3；受理但等待未完成及未确认返回4。终态消息须来自覆盖该终态观察的用户文本前缀，返回原输入及该Run的消息；迟到的其他Run消息不混入。本报告只输出请求的完整租户绑定、Session、operationKey和messageId，不回显原消息体。用户文本规则继续排除事实、OpaqueJson和ModelOnly内容。最终JSON使用现有无损编码器，原日志整数位置不得经JSON.stringify取整。

该路径消费已经配置并运行的宿主。独立宿主启动及终端接入见下文；该机读入口本身仍只消费已配置并运行的宿主。
实际SQLite／Ingress组合和编译后进程测试分别验证所属路径；受控宿主或模型结果不表示真实OpenRouter交付。

机读入口创建新会话时，工作目录取客户端当前目录并随原创建输入提交。已有会话保持原工作目录，不因后继客户端目录改变而替换。

## 已准备模型段的 Agent Loop 消费

应用通过Session公开入口调用prepareSessionModelRun、createSessionModelAttempt和createSessionModelObservations。原Run准备、Loop解释、任务保留和本地等待结束均归提供者。应用提供原身份和真实来源，不维护第二个Loop。行为见[提供者规格](../../packages/session/session-runtime-local/SPEC.md#已准备模型段的-agent-loop-消费)。

## 后台Session执行宿主

`startSessionDriverHost`把同一固定租户的私有协议接到实际`createLocalSessionDriver`。宿主只管理监听、准入和原Driver的生命周期，不扫描队列、不建立Run、不另写模型或工具推进逻辑。创建偏好仍为显式输入；普通请求仍只携带协议数据。

Driver故障先停止协议准入，再调用原诊断端口。关闭停止新请求和Driver的新工作，并等待实际网络请求及Driver收场；Driver返回pending时保留原资源，后续显式close继续原收场。网络与Driver的关闭错误全部保留。启动失败关闭已打开的监听器；关闭失败以SessionDriverHostStartupFailure保留原错误及closeRetained。这里不关闭借入的Ingress、Context、Storage或模型／工具执行池。

可信根选择Session提供者的createSessionDriverWorkOwner，将同一readIn交Ingress.workSettledIn，并将同一owner交驱动。工作登记／结清／释放行为归[提供者承诺](../../packages/session/session-runtime-local/SPEC.md#完整驱动构造的施工面)。应用不另写工作状态机；原模型段须实际完成保管／采用／ACK并停止writer后才调用complete，可靠finish及归还日志后才release。

该记录表示当前根对实际任务的保管，属于运行时资源；它不是持久恢复证明。新进程不能据旧Run或日志存在补登记为已结算，重启认回仍须由后续恢复承诺完成。工具回复不使用这个模型段将整Run证明为已结算。普通客户端不能取得readIn、原Unit或token。

### 正式运行根的装配与关闭

`startSessionDriverRuntimeRoot`复用同一套G28、Ingress、日志、结果保管、Context和关闭机制，并启动公开Session Driver。配置方提供Run来源、模型投影及结算工厂、工具借用、身份生成和工程策略。运行根固定租户、Ingress、Clock、原工作拥有者、实际OriginalIssueOwner、执行来源和结果保管来源；配置方不能替换这些已经配对的实例。配置失败时按原运行根的关闭和保留责任收场。

`SessionOriginalModelOwner.native()`只向可信运行根借出已附着的同一原拥有者，并保留其完整ModelExecutionRecords类型。它与已交给Session的participant来自同一实例，不另建记录拥有者。初始化前或原关闭开始后拒绝新借用。普通命令和socket协议没有该入口，生命周期仍由原运行根管理。

`startSessionDriverRuntimeRoot`借入真实根／租户Storage、治理客户端、时钟、合法部署输入和物理模型池，组合已有G28、SessionIngress、原模型发起／结果保管拥有者、工作结算证明及独立Session Context。构造先核固定中心／账号／登录句柄和实际opened use来源，再刷新登录；原use关闭结束后才分配本机运行资源。缺失资产、Context seed、模型配置、引用保管或策略均不补默认。普通客户端只使用既有私有通道协议；可信owners不进入协议。

模型Run绑定将SDK的call工厂固定为Session已经持久prepareCall的原call，保持原message／response工厂。全局模型工厂不能另造call后与原准备不匹配。模型执行来源由正式根提供实际来源getter，引用保管仍在同Unit完成；该getter不授予权限。

关闭先停止宿主及等待原任务；仍有未交还责任时返回pending，保留原拥有者。可靠收场后依次结束原发起／捕获、Context及访问绑定、Ingress、日志和G28。本入口不关闭借入Storage、治理客户端或物理模型池。启动失败必须完成已分配资源的实际收场；若收场失败或pending，则抛SessionRuntimeRootFailure并保留原closeRetained闭包及原错误。closeRetained只保留原收场责任，不承诺自动重试、恢复准入或取消独立模型／工具。同一收场尝试中的close共享原Promise；closed及原缺陷结果保留。确定pending的尝试结束后，在原捕获明确归还等责任已解除时，调用者可显式再次close检查原资源并完成剩余收场；不自动循环、不恢复新准入、不重试原模型IO或未知业务动作。

运行根将借入Clock的有效Instant转换为RFC3339；原`unavailable`保持为Session时间端口的`unavailable`，由Session提供者回滚本次日志、状态及回执并返回公开不可用结果。不把声明的时钟不可用抛成普通内部错误，不补墙钟。Clock的意外异常仍传播原缺陷。

此函数负责实际资源总装与监听，不负责创建独立OS进程、解析生产配置文件或发行资产。调用方必须提供完整且可信的部署输入，并承担借入资源的最终关闭。

### 文件运行根拥有的资源

`SessionRuntimeFiles`拥有准入库、租户运行库和LeaseClock的文件分配及关闭。打开失败时，已取得的资源仍保留在原对象中，调用方须完成closeFiles。调用方先关闭使用这些资源的Driver、Context和执行池，再关闭文件资源。首次模型准备、文件运行根和后续Driver根共用同一迁移顺序，不建立第二套运行库。

运行根在同一租户Storage上创建实际AssemblyManifestStore，并通过可信owners.manifest供Run资产装配借用。它在bootstrap及其资产读取器结束后关闭manifest，不把关闭责任交给普通客户端。租户迁移在现有迁移末尾追加assembly_manifest；重开文件根读取原装配表，不重新填表或改变先前迁移的顺序。启动失败同样关闭已经分配的manifest。

`createNativeSessionModelPool`分配实际ModelRuntime、调用存储、内容存储、调用事实、官方OpenRouter运输和可选模型目录。ready返回这些原对象，close保留原关闭语义。Session绑定在资源分配之后由应用选择，不内置某个宿主循环。文件根在池ready后注入同一公开Session Driver；可替换的池构造函数必须先返回原ready和close拥有者。

该应用根显式选择Session的createSessionModelSelection并注入原Model读取适配器。sources只提供调用来源，不选择或替换此工厂；选择器的原句柄与关闭责任仍归物理拥有者。

`startFileSessionDriverRoot`在分配资源前核固定中心／账号／登录来源，完成原CG刷新及use关闭，并核既有`tenant.json`的完整租户绑定。它不安装登录、绑定或模型凭据。准入库位于`<home>/data/session-admission.sqlite`，租户运行库沿`tenantPaths.runtime`，时钟使用该租户`run/clock.sqlite`的独立LeaseClock。目录、数据库及旁文件按既有私有命名空间规则检查。只有本次原子创建的新时钟文件允许初始化；重新打开不改写时钟身份。

`startFileSessionDriverRoot`复用相同的文件资源和关闭拥有者，启动`startSessionDriverRuntimeRoot`。它先分配实际物理模型池，再把原pool、Session拥有者、工作结算拥有者和同一Storage／Clock交给可信configure。executionSource和Model工厂固定为原pool，不能由configure替换。configure提供公开Driver的Run来源、模型结算配置和工具绑定，不增加应用层循环。可信Session拥有者另提供原SqlSessionLog，供工具结果保管等组合使用；借用方不关闭它。普通协议不公开这些引用。配置失败也按同一顺序释放已分配资源。

文件Driver的`initialRouteName`来自首次模型配置。`createSessionDriverModelFactory`为每次实际调用投影原物理ModelRuntime，使用该调用借入的Session和Run来源。第一次求有效模型前读取完整原日志；没有模型选择记录时，才调用原ModelRuntime的selectModel写入所配置的选择。已有选择不被启动配置覆盖，即使已有模型后来不可用，也由原模型选择规则返回相应结果。来源不可读、租户不匹配或世代失效时不写选择、不发送请求。首次选择被拒绝或结果不明时，本次借用停止初始化，不自动重试或改选其他模型。归还借用等待已开始的初始化结束，不关闭物理模型池。普通用户历史查询不使用这个工厂，不触发首次选择。

可信应用明确选择`nativeModel`或可替换的`createModel`，二者互斥。实际模型拥有者使用同一租户Storage与Clock。工厂必须先返回原关闭端口，再等待异步ready；同步构造抛错时不得遗留资源。ready提供原运行根所需的模型输入，不代表已授权或已发起模型IO。普通通道不携带这些函数或运行引用。

外层关闭先等待原运行根收场，再关闭实际模型池，随后关闭Clock、租户库和准入库。运行根pending或模型unavailable时保留尚被使用的资源，显式再次close只续接原收场。启动失败同样执行原关闭；尚有责任或关闭失败时，FileSessionRuntimeFailure保留原错误与closeRetained。治理客户端仍由借出方关闭。文件入口不负责独立OS进程启动。目录按下文的显式输入装入；当前调用权限、凭据初次准备及正式main消费者仍由实际应用接线。

`nativeModel`选择现有ModelRuntime、同一租户库中的原调用内容／事实与官方OpenRouter传输。模型ID列表必须明确、非空、无重复，且来自实际官方catalog；注册原定义及对应meter，不另写HTTP／SSE协议或模型执行器。应用不会转发自定义baseUrl或TLS覆盖。模型池来源、预算、结算和关闭策略由可信应用提供；模型列表不代替当前选择或执行授权。

原模型拥有者在分配内容／调用／传输资源前已存在。来源或Run装配失败时，ready保留原错误，close仍结束实际部分资源。executionSource固定为此物理ModelRuntime的实际来源，不采用外部复制或替代getter。关闭先完成原ModelRuntime关闭，再释放原executionSource，之后关闭内容与实际传输。原捕获未归还时，source.release保持unavailable；外层保留模型池及文件资源，归还后显式close可继续原收场。remaining_active保持unavailable，不把提交关闭当资源已释放。借入Clock、Storage和治理依赖不在模型构造器内关闭。

### 原 Run 的 Runner 装配

`createSessionRunRunner`选择实际LoopExtensionRunner和ToolAdmission。它消费原Run日志借用、同一装配清单、原采用历史和Session归属。请求的Session或Run不同，在读取前拒绝。原日志借用、物理日志世代或Context失效后停止新准入。`before_action`的数据由Session公开的`readSessionRunnerAction`读取，不在应用复制工具批次解释器。

可信根显式提供原访问对象、执行端口、消息前缀读取、候选内容识别和准入策略。缺失端口不补默认能力。物理日志根提供原`RunnerTaskOwner`并拥有未确认写入的后续责任；此构造器只借用该对象。每次Runner读取只拥有自己的归还标记，不创建替代任务拥有者。Runner通过实际装配清单和原历史选择扩展链，实际ToolAdmission贡献核原pass和完整批次。

构造先返回ready和close，再异步分配资源。分配失败保留原错误，close收场已分配部分。关闭先停止新准入，等待分配结束，再停止实际准入判断、排空Runner、撤贡献及归还ToolAdmission的原日志借用。归还失败保留原资源；显式再次close只重试原收场，不重新分配或恢复准入。并发close共享同一收场尝试。本拥有者不关闭借入日志、Storage、Context、装配清单、物理任务拥有者或模型／工具池。

实际Model组合验证原Run的Runner读取及关闭责任。受控执行端口不代表生产工具接线或独立OS宿主已经交付。

### 原模型目录及凭据读面

显式nativeModel.directory输入固定实际租户、中心／账号／登录句柄、同一借入CG、已有受保护密钥文件及诊断端口。文件运行根在治理或文件分配前核它属于原固定运行根，异租户或异登录拒绝，不另开其他命名空间。目录和replica升级与原模型调用事实共用实际租户Storage。

`createSessionModelDirectory`复用公开目录函数、官方catalog生成的明确清单、实际CG成员观察、原replica组件及受限取值工厂。成员观察消费实际S26角色，不以固定member或本机缓存冒充中心真相，不伪造同Unit治理参加者。它只向模型绑定交ModelCatalogRead和CredentialLookup；管理面、绑定reader、replica写入及原组件不离开拥有者。只读面不承接凭据写入；缺已有绑定或replica为credentialUnavailable，不选择测试key或环境key补值。目录构造时密钥必须已有、普通32字节文件且权限0600；缺钥按实际组件失败，目录本身不生成密钥。外层首次准备负责下面规定的本地文件创建。

应用准备方可调用此拥有者的`publishCredential`，显式给出原credentialRef和凭据字节；模型消费者仍只取得ready中的只读面。拥有者复制输入字节，先经实际目录核当前成员并绑定，再由原replica保管器加密保存。绑定或保管不可用返回带原ref和阶段的unconfirmed，不自动重试；明确拒绝不冒称已存。内部字节副本在结果或异常后清零，不修改调用方的输入。关闭撤新发布并等待在途发布结束，再按原顺序释放取值／保管／目录。这个端口不负责读取凭据文件、创建本地加密密钥或启动模型请求。

正式裸入口在身份准备后调用`prepareSessionModel`。该流程读取当前租户的真实目录，让用户明确选择已登记且本发行版能调用的官方模型。它不把候选列表当作权限，也不自动选择第一个模型。随后检查实际凭据副本；缺失时可选择受保护文件或无凭据继续。后者保留合法空Session的创建路径，并向后继入口显式传递credentialPresent=false，不伪称模型已准备好。

该准备流程仅在本租户auth/credentials中创建缺失的32字节本地加密密钥，权限0600，采用系统随机数。已有密钥必须通过文件类型、拥有者、链接数、权限和长度检查；无效或部分写入的旧材料保持原样并拒绝使用。它不替换模型API凭据，不从环境补值。实际凭据文件沿原受保护文件读取规则，用户确认后才读取并通过上述端口发布。取消不继续进入会话；结果不明保留原引用并停止本次准备。

准备与文件运行根复用同一数据库打开和迁移方法。准备方关闭原目录、Clock及Storage后才将固定租户的routeName、keyFile和凭据就绪状态交给后继会话入口。正式默认入口在准备资源关闭后调用终端会话消费者，后者启动或附着独立宿主。准备成功本身不表示模型已回复或B01产品交付完成。

本机模型拥有者从实际createCallContainerStore选择createCallContainerPresence，同时供给原facts和ModelRuntime；sources不再提供本机callPresence。它不从常量、池引用或容器缺失推定stopped。当前调用资格仍由其原拥有者核实；存续读面不授执行权。

实际native拥有者先持目录关闭端口再等ready，再构造模型池。关闭先结束原模型及实际传输责任，然后撤取值、排空原取值事务、关闭原replica和目录，最后才允许外层释放Clock及Storage。目录启动失败亦执行原收场；关闭异常保留责任，显式再次close只续接原关闭。CG仍为借入，目录关闭不注销登录或关闭客户端。目录就绪或凭据可读不产生原调用的唯一执行权；原Run、最新attempt及唯一claim仍在Session原发起点核实。

## 交互操作与退出

正式治理动作消费同一CG操作与原结果，不由界面实现业务规则。界面一次只提交一个动作，等待实际操作及本地结算后才表示结果。候选、确认按钮和本机选择都不是授权依据。实际动作重新核对固定身份；未知写结果保留原请求，不因重新绘制、网络恢复或再次进入而重发。

关闭先撤新输入与重绘准入，等待实际CG工作、输入和已提交输出结束，再由原终端拥有者恢复模式及OS属性。CG未能证明静止时，不释放它仍借入的CLS。恢复失败保留原业务结果和实际故障。重复关闭只接续原收场，不重复业务调用或最终输出。物理终端消失和SIGKILL不承诺终端恢复。

退出状态由entryExitCode和各结果拥有者约束。缺陷不能被成功的远端结果掩盖，正常关闭也不能把失败或未确认结果改成成功。无原报告时只输出稳定诊断，不编造CG报告；原始异常、秘密或输入路径不回显。JSON结果将C1及双向文字控制符编码为转义数据，解码后的原值不变。

## 原Run调用读取与Loop当前观察

createSessionContextReadGrant只绑定可信根已确认的自然人登录与同源Ingress，消费者名称不推导主体种类。固定账号必须属于固定租户。这个应用输入适配仅提供context.read，显式消费者和容量由根给定；它不签发token，不授模型发起、Agent、工具效果或日志协调权。每次check通过实际Ingress的readSession核当前G28成员顺序与原Session持有，并要求Session已发布active；无法读保持unavailable，其他非可读状态拒绝。发行、撤销、借用及关闭仍由实际createLocalSessionAccess拥有。根须先通过实际CG确认来源，不能从普通请求调用此适配获取权限。

createSessionRunModelBinding消费Session提供者公开的createSessionCallAccess，并显式提供maxCallReads。原Run读取／ACK／关闭行为归[提供者承诺](../../packages/session/session-runtime-local/SPEC.md#可信宿主日志读取)。应用只选择实际Model提供者；运行消费机制迁至Session拥有者，关闭先结束CallAccess，再归还求值输入和原journal。

应用选择实际Context和当前来源，调用Session提供者的createSessionModelObservations；解释规则见[提供者规格](../../packages/session/session-runtime-local/SPEC.md#已准备模型段的-agent-loop-消费)。

## 正式入口与终端验证义务

正式命令语法由entry-command及其独立例子覆盖。被替代的machine前缀、tui别名和34项旧表单不再保留。实际治理、准备、Session和终端消费者分别验证自己的公开结果与关闭责任。

持续验证精确UTF-8、秘密文件权限与符号链接拒绝、严格租户引用、控制文本、跨块输入、超限丢弃、输入输出背压、resize、确认修订、取消／EOF／信号及实际模式和OS属性恢复。有限模型只覆盖其状态与进展假设；真实终端／IME、发行制品和支持平台另验。原操作未知、原身份保管和跨租户拒绝不因更换界面而减弱。

长期PF-006验收由正式CLI驱动真实Shell与OpenRouter，核普通字符串、完整结果、原调用身份、持久资源、后继请求及最终答复。PF-016核非终端拒绝、正式机读指引及结构化输出；真实PTY不能替代图形终端或IME矩阵。执行条件及命令见[验收说明](acceptance/README.md)。

本机模型装配显式选择Session的publishSessionModelCallContent作为记录发布者。创建与回复标记由Session按原历史发布；CLI只选择实际实现，不复制该判断，不用成功占位绕过原件及标记确认。

### Session提供模型结算

本机Model池的可信构造显式选择Session的sessionModelSettlement。该依赖与原请求准备、记录发布和ACK实现同属应用装配选择，不由CLI命令参数提供。调用创建、原锚定执行、post-ACK工作和工作恢复沿原模型资源使用这个工厂；CLI不解释这些日志批次。

本机Model装配从Session公开入口选择createSessionModelCallFacts，并传入原Model内容存储和实际presence。各主体视图共享同一索引。停止单个Session不得关闭该物理池索引；原池在排空后按原顺序关闭。

模型根装配同时选择Session的createSessionModelReads与createSessionModelSelection。sources不提供或覆盖这两个工厂。读取拥有者借入原Model内容和ACK补全能力，Model原池继续负责执行与清理。

## 独立宿主进程与启动输入

`session-host-main` 是私有进程入口。`omne-session-host-startup/1` 只传入规范化 home、完整 TenantBinding 和显式模型名称。它拒绝附加字段，不接收账号声明、密钥、SessionAccess、回调或执行器。进程从实际本机目录读取登录记录，再经真实治理客户端完成既有登录与成员检查。密钥位置由该租户目录确定。

`runSessionHostProcess` 持有根目录、治理客户端和文件运行根。停止请求先交给原运行根；只有它确认 closed，进程才释放治理客户端和目录。pending 或关闭异常保留原拥有者，记录故障并等待另一次显式停止请求，不自动重试业务操作。启动失败留下的 closeRetained 遵守相同次序。客户端退出不发送停止请求。

`connectProductionSessionHost` 消费既有连接协议。通道缺失时，用当前 Node 可执行文件启动发行包内的私有入口，启用 detached。子进程继承自己的私有日志文件描述符；父进程归还文件句柄不关闭子进程日志。已有通道不被覆盖，连接取消或超时不杀子进程。日志仅记录诊断类别，不输出启动身份材料或凭据。

`startProductionSessionHost` 选择既有 Session Driver、官方定义、实际模型目录、加密凭据、同库参加者、Clock 和 OpenRouter 提供者。Run 的源和任务在实际生命周期内借用及归还，不由 CLI 消费者维护执行循环。当前发行定义同时安装文本模型回路、Shell及其准入扩展。未安装的工具与扩展执行返回不可用。裸终端入口消费同一独立宿主，不另设执行循环。

正式宿主为 Driver 显式配置历史投影缓存，最多保留四个 Session。每份缓存上限为16384条日志、65536个内容块及8 MiB规范化输入字节；这不是堆内存上限。缓存使用既有 Core 投影实现；每次仍通过当前 Run 借用核验授权并读取固定后缀。宿主构造时固定 reader 策略身份，策略及其捕获参数变更时必须更换身份。模型、工具声明和请求参数逐次求值，不由历史缓存替代。容量超限回到完整投影；宿主关闭时在 Driver 工作排空后释放缓存。

生产模型历史读取从同一个受权完整前缀，定位当前请求所选消息及其原 response、dispatch。只有原消息及各块完全匹配，才提交对应的校准候选；原 Session 校准器继续核验位置、Run、dispatch、完整结算成员及因果顺序。加密 reasoning 使用已保存的 outputGroup 和 usage，不把密文长度当 token 数。缺少输出组时不构造重放映射，普通可见内容仍可按原完整计量路径处理；缺失或变化的来源不补造计量事实。本读取只选择请求中的已持久回复，不增加无回复重试的校准来源。


## 终端会话消费者

`runTerminalSession` 只连接、提交和观察独立宿主。默认入口先确认固定租户身份，再查询该租户已有宿主的初始模型。已有宿主可读时直接复用其模型名称，不打开运行数据库、不重复模型或凭据准备。已有通道不可读、拒绝或回复非法时阻止进入，不把它当成无宿主重建。只有通道不存在时才执行模型准备，关闭准备资源后再启动宿主。准备期间有其他进程取得数据库拥有权时，仍由原存储规则拒绝第二个拥有者，不接管或删除锁。

上述次序同时适用于显式重附着和已有宿主下的新会话入口。宿主的初始模型不是具体Session运行中模型的推断；本入口不切换已有宿主模型。终端消费者不读取 Session 数据库、不创建协调资格、不执行模型或工具。

连接成功后，终端读取宿主公开的初始模型名称。名称必须与本次明确选择相同，否则在创建会话或提交输入之前返回 `host-model-mismatch`。缺少初始模型读面也拒绝继续，不暗中采用另一个模型。本项不提供宿主运行期间的模型切换。传入 Session 时复用原身份；未传入时，通过原创建协议提交一次包含工作目录的创建请求。

`readClock` 从宿主借入的 Clock 取得当前时间，返回 RFC 3339 时间。Clock 不可用时不生成消息、不用客户端墙钟代替。`readInitialModel` 只返回宿主显式配置的初始模型名称，不推测具体 Session 的运行中模型。两项读操作都先核对完整中心及租户绑定，且不启动 Session 工作。

每次文本输入形成一个有独立身份的 UserMessage。终端通过宿主的人类可见消息读面加载当前Session历史，核对原租户、Session及位置顺序后，按角色显示用户输入和助手、工具回复。后续只将本轮持久消息按原消息身份合入显示历史，不重复追加旧回复。回复结束后直接显示历史和新的输入框，不先停在需要确认的回复页。会话输入无须翻完历史即可发送；治理动作仍要求完成原页面阅读与确认。终端只提交一次并观察原回执。输入取消、客户端退出或等待超时都不关闭宿主、不取消已受理输入。结果不明时保留原操作身份，不自动重发。正常脱离输出原 Session 的恢复命令；机读请求继续保留无损结构化结果。

终端等待原 Run 时可请求 `readSubmission.includePresentation`。宿主先完成原受理回执、Session 授权和 Run 关联读取，再返回该 Run 的临时展示。默认机读调用不请求临时展示。临时文字不证明结果已保存，不修改 SessionLog、模型请求、工具准入或 ACK。合并读取失败时，客户端丢弃该回复，并在原轮询间隔后用同一回执读取不含展示的权威状态。本轮后续读取不再请求临时展示。终端保留最后画面；只读暂不可用时显示重连状态。终端显式使用maxWaitMs:null，持续观察至终态、明确观察失败或用户取消。最终显示仍使用原 Run 的持久消息。

生产根在应用层观察原模型调用的已接受快照，使用与历史相同的HumanBlock投影和格式化器。公开thinking有正文才显示Reasoning summary，不输出空标题，不解释opaque。快照按原dispatch及position替换累计内容，不重复追加。公开工具调用显示实际参数；执行状态、可见流式帧及终态结果只来自原工具执行观察。观察装饰原调用位置，不改变模型的文本／调用／文本顺序。终态结果替换临时工具帧；同名或同文不同调用不合并。每次读取归还观察者，客户端断开不停止模型或工具。参数、正文和嵌套结果共同受展示容量约束，省略必须明示。原Run结束且最终日志读取确认后，已保存消息整体替换本轮临时内容，不按文本猜测合并。应用关闭清除临时展示，重启从原历史读取。

展示容量由应用显式配置。超限或淘汰显示省略提示。终端按现有有界轮询刷新，慢终端只保留最新待绘制画面，不阻塞模型流。实时画面默认跟随末页；用户翻页时保留阅读位置，回到末页后继续跟随。普通按键只重画变化行，尺寸改变后完整重画；已送达帧仍是输入可提交的依据。

终端将已识别的成功工具执行结果显示为输出、退出状态和输出丢弃计数，不显示环境实现标识。停止观察状态存在时必须显示。未知或失败结果保留原用户可见文本，不丢弃错误信息。这只改变终端表示，不改写会话日志、模型输入或机读 JSON。

终端 UI 的真实矩阵、正式安装及完整工具装配仍须独立验收。脚本化 Dialog 与真实 socket 测试不替代真实终端证据。

### 正式工具装配

CLI官方会话定义的第三版声明Shell及官方工具准入扩展，工厂整组安装仍由session-factory-assets拥有。既有会话的固定根版本不被改写。Shell工作目录取原会话创建事实，运行环境显式包含PATH；不能采用后台宿主进程的cwd或继承其环境。RuntimeContext中的session-workspace来源以reread_source方式读取原会话创建事实，不另存一份Context内容。每次Run重新登记该来源，结束时撤除登记，原会话事实保留。

每租户根持有一个实际工具执行池、环境登记和结果存储。每次Run注册其当前输入、Context和准入实现；工具借用按原scope/run绑定，原发起claim只回到产生它的Run。Run返回借用不关闭共享池。宿主收场先等待Driver实际停止，再关闭工具池和结果／环境资源，最后关闭Context、日志及存储。不能把观察者释放或客户端退出当作工具已停。

## 发行命令入口

发行包包含可执行的`bin/omne.js`及完整生产依赖。命令经真实模块路径加载同一`dist/main.js`，通过符号链接调用和从仓库外调用不改变应用资源定位。推荐代码目录为`~/.local/share/omne/builds/<BUILD_ID>/app`，命令链接为`~/.local/bin/omne`。该目录与`~/.omne`状态根分开。安装说明不覆盖现有版本或命令链接；切换代码不隐式停止已运行的租户宿主。

发行检查从部署后的应用目录加载实际 Host 依赖的 node-pty 原生模块。失败不得发布归档；仅仓库源码或本机开发依赖加载成功不足以满足此检查。原生构建限根工作区的依赖白名单。当前 Shell Host 的 Linux/systemd 前提随发行说明交付；终端 profile 本身不保证工具设施可用。

### 已受理输入的新 Run 登录提示

私有`readSubmission`先按原OperationRef读取回执和用户消息，再关联实际Driver的只读观察。只有尚无消费Run、且观察的inputPosition等于该原消息位置时，返回可选admission。此观察不改变原受理结果，也不从其他输入、泛化拒绝或超时推断登录状态。

`loginRejected`提示重新登录；`confirmationUnavailable`提示治理中心无法确认登录且新Run未开始。两者均保留原receipt，机读状态仍为accepted，退出码4。终端明确提示不要重发该消息。进程内无确定观察时保持原有等待／脱离语义，不能声称登录有效或永久失败。


### 常驻宿主的登录更新

宿主固定原中心、账号和租户，不固定未来每次准入使用的登录handle。新Session和新Run从实际治理客户端的当前本机状态取得完整来源，再由G28执行线上核验。每次use必须真实关闭后才返回来源或核验结果。候选来源与打开的use不一致时拒绝，不把其他账号或中心的登录接入现有Session。

原输入因登录拒绝或已结束的网络不可达而尚未建立Run时，Driver可在后续扫描重新核验。用户重新登录后不需要重发已受理消息，也不需要停止同宿主中其他在途Run。观察仍保留原输入位置；它不能把已受理改成未受理。旧Run的持久grant不随本机登录变化撤销。

### 原 Run 的 Session Context 恢复

本地宿主先取得原独占通道，再启动 Driver 及调用未发起模型的恢复操作。
`SessionBootstrapAssembly.ensureRun` 在原 Run 的资源获取边界按需恢复 Session Context。
它经原 BorrowedRunJournal 和 `createRunEvaluationInputReader` 读取已持久化的配方，再调用实际 Context 初始化拥有者识别原 seed。
恢复不创建 admission ticket，不查询当前成员身份，不重新捕获配方，也不重复追加初始化事实。
恢复行只拥有 Context 和原 Run 读取器；创建时使用的 ticket 和 admitted source 仍仅归创建行。

同一 Session 的并发恢复共享一个初始化任务。失效的 journal、外租户和关闭中的 bootstrap 返回 unavailable。
关闭停止新恢复，并等待原初始化任务和读取器排空；关闭失败保留原资源和 retryClose 责任。
`createSessionRunAssets` 必须等待 ensureRun 成功，再获取 runInputs 和 runRegistry。

### 已准备模型身份的认回

正式身份源对同一组原坐标使用同一个SHA-256摘要，并分别加上prepare、call、origin、creation、result及adopt前缀。该生成方案保持不变。宿主恢复只接收Session提供者已验证的原preparation；身份源核对已存call、prepareKey与originalPosition具有相同的64位小写十六进制摘要，再认回其余原键。CreationKey仍通过原公开解析器。

此规则仅属于正式CLI身份源，不是通用Runtime的身份格式。格式或摘要不一致时拒绝认回，不猜工具消息位置、不换Call、不重发用户输入。恢复仍经过Session当前grant、Source、Attempt及唯一发起校验。
