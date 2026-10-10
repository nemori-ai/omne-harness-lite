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
恢复或输入输出永不结束时，释放门不放行。CLS 关闭失败记录 state-close-failed，不能撤销已发生的恢复。
无 CG 的启动失败同样保留已分配 CLS 的表示门。资源尚未登记和分配时不虚构资源关闭责任。

closed 保留协调器报告及 fiber/端口撤除错误。正常本地打开失败保持原安全分类；
打开与清理双失败仍报告 internal-defect。所有诊断只包含稳定安全代码，不回显凭据或原始错误。

验证必须包含实际 SQLite/TLS/CLI、异常启动前缀、在途与迟到结果、取消、关闭故障和恢复次序。
既有有限模型、必要 PTY 与完整 GUI/IME 验收的各自范围保持，不互相替代。

## 随 CLI 发行的官方会话定义

`session-factory-assets.ts` 拥有 `omne:session`、资产 `omne.cli.session-agent` 的官方发行。版本 1 的原正文及发行时间保持不变；版本 2 追加两项可覆盖偏好：`first_token_wait_limit=PT2M`、`post_first_token_stall_limit=PT30S`。这两项值属于本发行定义，不是全系统产品阈值或运行时补值。模型运行时必须读取实际求值结果；其他已授权配值层可按原求值规则覆盖。本增量不声称已经提供 CLI 配值管理入口。发行时间固定在各版本内；实际安装时间来自借入 Clock。两个版本均明确声明空 references 和空 contextSessionSeed，不隐含模型、秘密、预算或工具权限。

实际运行根仅在可信 creation 配置明确选择该定义时部署它。根先核实际 CG 登录，保留现有部署声明，再由具名工厂拥有者调用 EIS 官方安装入口。安装完成后，真实 G28、EIS 配方和独立 Session Context 按原准入路径消费定义；不能以 official 来源代替成员或执行授权。其他显式根不被替换，未配置 creation 不自动建会话。

重新启动认回原 release、revision 和安装时间；冲突、Clock unavailable 或发布结果不明均停止该次启动并收场，不覆盖、不重发、不把会话发布为 active。此装配承诺不表示正式 main 已完成宿主进程启动或真实 OpenRouter 验收。

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
帮助和版本为独立、无身份副作用的入口。

治理入口为 `center add`、`tenant create`、`tenant add`、`tenant switch`。
账号入口为login、register、logout，以及logins list／revoke和credential change。
命令数据分别携带中心地址与信任选择、组织名、邀请引用或租户定位引用。
这些引用只定位对象，不能自行产生资格。鉴权凭据使用受保护的文件输入，不直接放入参数。

选项按动作校验，重复选项、未知命令／选项及互斥信任配置均明确拒绝。
非TTY治理命令必须使用JSON呈现并给齐必要输入。TTY中的JSON模式也不补交互答案。
秘密、原参数或解析器的原始错误不进入用法错误文本。
被替代的machine前缀、tui别名和旧治理命令不进入新解析面，正式进程切换时删除被替代实现。

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

函数等待自己打开的use关闭，不关闭借入CG、catalog或来源CLS。工作和关闭双失败保留两项错误；未知异常传播，已记录远端结果仍归catalog保管。main通过正式entry解析、entry-execution及tenant-create-entry消费此函数；JSON进程入口已接通。登录／注册、添加／切换租户及账号安全的机读和治理交互接线已实现；默认会话准备与完整终端产品仍未完成。


## 创建租户的入口装配

tenant-create-entry.ts消费根catalog的原启动选择，并核对所选租户的已有绑定和鉴权文件。无选择时返回not-selected；已有目录缺失或损坏时返回实际安全分类，不建立空目录冒充恢复。正式main已消费该入口。JSON进程调用不代表交互补全、默认启动路径或完整CLI已经交付。

入口打开所选auth目录的实际Cordis装配。它核对同一CLS中的中心及已识别账号，再将固定范围交给创建流程。根配置、目录绑定和登录读取都不签发Session Access；团队创建仍通过实际线上治理能力完成。创建后不修改原启动选择，不建立Session。重复认回同一原creationKey不重新创建；网络及取消导致的未知结果仍由根catalog保留。

入口只关闭自己打开的装配，不关闭借入catalog。取消触发实际装配停止；在途副作用保留真实未知结果，不改称未发送。只有实际clientStopped成功才放行CLS释放门。收尾失败返回安全诊断并保留原业务结果；工作与关闭双失败保留两项原错误。调用者必须把任何收尾诊断呈现为失败退出，不能只根据远端created返回成功。


## 正式进程的结果与失败

main只使用entry-command的命令面；旧machine前缀、tui别名及旧治理动作不再作为进程入口。帮助与版本不打开状态目录。entry-application对已执行命令输出omne-cli/1：action、outcome及安全diagnostics。JSON模式输出单个JSON对象和换行；当前人读输出同一对象的缩进表示，完整交互反馈仍待实现。

退出码0表示动作及本机准备完成，2表示未执行或明确拒绝，3表示不可用或尚未接通，4表示原结果或本机提交不明，70表示缺陷或收尾／输出失败。远端创建成功而目标auth准备失败不能返回0；收尾诊断也不能被远端成功覆盖。原治理报告沿CG的实际退出分类，不复制其授权或判断规则。错误仅输出安全代码，不回显原异常、凭据或参数。

正式执行器已接四个治理动作、登录／注册、退出、登录列表／撤销与换凭据。Session机读执行器已接匹配宿主的新建／既有会话提交与观察；它不自行签发执行资格。未接对应入口时返回not-ready和3。完整默认准备、独立宿主启动及终端会话仍待B01交付，不把已配置宿主的机读路径当作完整裸入口。

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

发行装配在启动时读取显式部署输入OMNE_TERMINAL_PROFILE，不从TERM推定终端版本。
当前终端提供者识别xterm-379，以及macOS上的iterm-3.7.1beta1配置。
缺少或不支持的配置拒绝进入交互，不回落到未验证的原始输入模式。
这些配置声明不是版本检测或真实终端验收证据。真实GUI、IME、宽字符、resize和恢复验收另行执行。
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

createSessionRunAssets组合原Run输入、历史正文和实际AssetRegistry。构造同步返回包含ready和close的原资源拥有者，初始化失败后仍保留关闭入口。只有manifest为空时才按显式求值策略和initialFillRef填入六表；已有manifest必须从原表重建，不因新Run或新的initialFillRef重新填表。读取或填表未确认时ready返回unavailable，不自动重发。关闭先停止初始化发布，等待已开始的初始化，再关闭注册表和输入读取器；借入bootstrap、manifest、journal和Storage仍归原宿主。

此装配构件的组合测试必须区分实际持久资格、资产和Context与受控运输／seed／访问端口。独立宿主、动态Agent贡献、真实SessionAccess发行、模型和工具消费者及默认产品路径仍须完整B01验收；构件通过不能作为三张故事卡完成的依据。

## Session访问发行的装配义务

可信宿主从实际登录来源或原Agent／系统装配核实主体种类后，构造固定租户的createLocalSessionAccess。Session Context仅借入其operations；issuer保持在可信宿主，不经命令body或普通服务暴露。当前只读组合使用原SessionRuntime公开readSession核实际G28成员及Session持有，绑定明确的已鉴权自然人主体，只允许context.read；不能据此声称Agent／系统主体或模型／工具执行权限已核实。后续消费者须按各自原权限核实，不能从consumer名称推断主体种类或增授session.log.coordinate。

组合测试中的访问绑定已经由实际提供者发行，当前拒绝来自真实G28持久观察和原SessionRuntime读取。运输、seed仍受控，正式宿主尚须消费这些构件。

## 官方部署的Context声明输入

contextSeedFromDefinition是本应用对其官方部署根的解释器。它只消费真实已授权输入来源持有的完整NonConnectorEvaluationInput，不从普通命令body接收资产或声明。定义正文的contextSessionSeed是应用拥有的附加字段；AD1的references／attributes承诺保持原归属。本解释器只采用官方定义及实际factory层official持有；合法的普通自定义根及其自报字段不能充当本解释器的meta声明来源。其他定义／部署提供者仍须通过原可信contextSeed端口供应其实际声明，不能据合法资产身份授予初始化权限。

解释器核固定Scope的租户，并按本次合法读数的root.source精确定位唯一asset／version及同根能力。它不换用最新版本、其他定义或其他租户。正文通过公开readOpaqueJson解释，contextSessionSeed通过公开decodeContextData的Seed固定Schema捕获；字段缺失、非法或原版本缺失返回unavailable，不补空required／initial／fixed、身份、配值或秘密。语义及原子初始化仍由实际Runtime Context初始化拥有者核验。

此字段表达显式声明；空列表只有在实际官方声明明确给出时有效。初始化数据本身不授权，issuer／原G28／当前读权保持各自责任。组合测试须以真实持久官方发布取得声明，并覆盖缺失／非法、精确来源及factory持有缺失；受控运输仍不作为正式中心部署验收。

## 宿主的纯用户文本读取

createSessionTextReader消费实际Ingress可信journal面，固定真实租户；请求只接受闭合SessionScope数据。非数据／访问器拒绝且不执行访问器，跨租户在日志读取前拒绝。日志坐标和当前成员资格由原Ingress在同单元核验；固定历史坐标不授当前权。

该读面输出固定source及原日志位置顺序中的用户可见文本。显式Message封装才参与，事实／事件与其他JSON不转成消息。文本及thinking文本须toHuman=true，ToolResult后代同时受所有父块的toHuman约束。输出只含位置、消息ID／类型／时间及块ID／类型／文本，不携带原能力记录、OpaqueJson、模型专用块、工具参数或文件凭据。无可见文本的消息不输出；媒体／附件／工具结构不是本读面的文本，后续完整历史读面仍须沿所属阶段提供。模型消息投影与本读面分别由各自承诺拥有者维护。

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

`submitSessionMessage`只发送一次原提交。其余请求只观察原回执；它拒绝异操作、改变的回执、异journalGeneration、不同消息和倒退前缀。unknownCommit保留完整原OperationRef；运输未确认保留原请求身份，均不自动重发。取得回执后，等待超时、断连或取消等待仍保留原回执，不取消原Run。应用根显式提供请求时限、整体等待时限、轮询间隔和回复容量；使用Node异步计时器及总等待截止信号，不为客户端等待创建线程。

仅本次输入对应Run的completed返回退出码0；failed／cancelled返回3；受理但等待未完成及未确认返回4。终态消息须来自覆盖该终态观察的用户文本前缀，返回原输入及该Run的消息；迟到的其他Run消息不混入。本报告只输出请求的完整租户绑定、Session、operationKey和messageId，不回显原消息体。用户文本规则继续排除事实、OpaqueJson和ModelOnly内容。最终JSON使用现有无损编码器，原日志整数位置不得经JSON.stringify取整。

该路径消费已经配置并运行的宿主。正式main的独立进程启动、生产配置准备及裸终端入口仍须完成。
实际SQLite／Ingress组合和编译后进程测试分别验证所属路径；受控宿主或模型结果不表示真实OpenRouter交付。

## 已准备模型段的 Agent Loop 消费

应用通过Session公开入口调用prepareSessionModelRun、createSessionModelAttempt和createSessionModelObservations。原Run准备、Loop解释、任务保留和本地等待结束均归提供者。应用提供原身份和真实来源，不维护第二个Loop。行为见[提供者规格](../../packages/session/session-runtime-local/SPEC.md#已准备模型段的-agent-loop-消费)。

## 后台Session执行宿主

`startSessionDriverHost`把同一固定租户的私有协议接到实际`createLocalSessionDriver`。宿主只管理监听、准入和原Driver的生命周期，不扫描队列、不建立Run、不另写模型或工具推进逻辑。创建偏好仍为显式输入；普通请求仍只携带协议数据。

Driver故障先停止协议准入，再调用原诊断端口。关闭停止新请求和Driver的新工作，并等待实际网络请求及Driver收场；Driver返回pending时保留原资源，后续显式close继续原收场。网络与Driver的关闭错误全部保留。启动失败关闭已打开的监听器；关闭失败以SessionDriverHostStartupFailure保留原错误及closeRetained。这里不关闭借入的Ingress、Context、Storage或模型／工具执行池。

当前该入口已用实际SQLite、Context、采用注册表及ModelRuntime验证普通Run与异Scope拒绝。治理和模型运输仍为受控输入。正式文件运行根和独立OS进程尚未接到本入口，不据此宣称正式CLI已完成。

`startRunningSessionHost`组合本机监听器、原Ingress工作扫描、持久Run准备和核心Agent Loop模型段。可信根须给出固定TenantBinding、原Ingress、五项正整数执行策略、原操作身份工厂、实际模型装配工厂及诊断端口；绑定和策略在启动前捕获。模型工厂必须接原Scope、原准备和同一Ingress，不能自行发送模型请求。局部资源须在工厂返回前拥有失败收场责任。这个入口不补部署资产、当前资格、模型、秘密或预算。

宿主按显式scanLimit与intervalMs进行持久键集分页扫描。扫描游标到末尾后返回起点，候选仍须由原协调入口核验并提交；扫描及普通查询均不授发起权。maxTasks约束新驱动工作的准入，maxHeld约束保留的Session槽位。同一宿主只保留一个Session槽位；已有活动Run由其原拥有者负责，不因再次扫描建立第二Run或签发第二permit。

每个槽位持有原操作身份、实际attempt frame、原模型任务及必要保管记录。局部等待结束时，宿主先持有原completion和绑定，再确认交还，并等原任务结算。任务不因客户端退出或宿主停止等待而收到模型取消信号。只有实际完整结果已保管、采用并ACK，且回复不含tool_call，才尝试原finish；finish仍由提供者核验待处理输入和原工作结算，不以收到回复代替判据。工具回复和未确认结果继续保留责任，这个模型段不宣称工具闭环已经完成。

关闭先撤新准入、停止扫描及监听器，再等已登记驱动和原任务结束，撤frame并排空交还任务。槽位未释放时返回pending及数量，不报告closed；任一实际缺陷保留并报告AggregateError。故障记录由maxFailures限定，超过上界时保留额外数量。关闭不会关闭借入Ingress、Context、原模型拥有者或物理执行池；完整运行根须在该责任真正结束后再收场借入资源。

本构件测试覆盖无观察请求的自动模型执行及局部退出交还；其中治理运输、模型运输、当前资格／代际和原工作结算证明仍为受控输入。正式main启动／附着、真实OpenRouter、工具执行和独立进程部署由完整应用验收承担。

可信根选择Session提供者的createSessionDriverWorkOwner，将同一readIn交Ingress.workSettledIn，并将同一owner交驱动。工作登记／结清／释放行为归[提供者承诺](../../packages/session/session-runtime-local/SPEC.md#完整驱动构造的施工面)。应用不另写工作状态机；原模型段须实际完成保管／采用／ACK并停止writer后才调用complete，可靠finish及归还日志后才release。

该记录表示当前根对实际任务的保管，属于运行时资源；它不是持久恢复证明。新进程不能据旧Run或日志存在补登记为已结算，重启认回仍须由后续恢复承诺完成。工具回复不使用这个模型段将整Run证明为已结算。普通客户端不能取得readIn、原Unit或token。

### 正式运行根的装配与关闭

`startSessionDriverRuntimeRoot`复用同一套G28、Ingress、日志、结果保管、Context和关闭机制，并启动公开Session Driver。配置方提供Run来源、模型投影及结算工厂、工具借用、身份生成和工程策略。运行根固定租户、Ingress、Clock、原工作拥有者、实际OriginalIssueOwner、执行来源和结果保管来源；配置方不能替换这些已经配对的实例。配置失败时按原运行根的关闭和保留责任收场。

`SessionOriginalModelOwner.native()`只向可信运行根借出已附着的原拥有者。初始化前或原关闭开始后拒绝新借用。普通命令和socket协议没有该入口，生命周期仍由原运行根管理。

`startSessionRuntimeRoot`借入真实根／租户Storage、治理客户端、时钟、合法部署输入和物理模型池，组合已有G28、SessionIngress、原模型发起／结果保管拥有者、工作结算证明及独立Session Context。构造先核固定中心／账号／登录句柄和实际opened use来源，再刷新登录；原use关闭结束后才分配本机运行资源。缺失资产、Context seed、模型配置、引用保管或策略均不补默认。普通客户端只使用既有私有通道协议；可信owners不进入协议。

模型Run绑定将SDK的call工厂固定为Session已经持久prepareCall的原call，保持原message／response工厂。全局模型工厂不能另造call后与原准备不匹配。模型执行来源由正式根提供实际来源getter，引用保管仍在同Unit完成；该getter不授予权限。

关闭先停止宿主及等待原任务；仍有未交还责任时返回pending，保留原拥有者。可靠收场后依次结束原发起／捕获、Context及访问绑定、Ingress、日志和G28。本入口不关闭借入Storage、治理客户端或物理模型池。启动失败必须完成已分配资源的实际收场；若收场失败或pending，则抛SessionRuntimeRootFailure并保留原closeRetained闭包及原错误。closeRetained只保留原收场责任，不承诺自动重试、恢复准入或取消独立模型／工具。同一收场尝试中的close共享原Promise；closed及原缺陷结果保留。确定pending的尝试结束后，在原捕获明确归还等责任已解除时，调用者可显式再次close检查原资源并完成剩余收场；不自动循环、不恢复新准入、不重试原模型IO或未知业务动作。

运行根将借入Clock的有效Instant转换为RFC3339；原`unavailable`保持为Session时间端口的`unavailable`，由Session提供者回滚本次日志、状态及回执并返回公开不可用结果。不把声明的时钟不可用抛成普通内部错误，不补墙钟。Clock的意外异常仍传播原缺陷。

此函数负责实际资源总装与监听，不负责创建独立OS进程、解析生产配置文件或发行资产。调用方必须提供完整且可信的部署输入，并承担借入资源的最终关闭。

### 文件运行根拥有的资源

`SessionRuntimeFiles`拥有准入库、租户运行库和LeaseClock的文件分配及关闭。打开失败时，已取得的资源仍保留在原对象中，调用方须完成closeFiles。调用方先关闭使用这些资源的Driver、Context和执行池，再关闭文件资源。首次模型准备、文件运行根和后续Driver根共用同一迁移顺序，不建立第二套运行库。

运行根在同一租户Storage上创建实际AssemblyManifestStore，并通过可信owners.manifest供Run资产装配借用。它在bootstrap及其资产读取器结束后关闭manifest，不把关闭责任交给普通客户端。租户迁移在现有迁移末尾追加assembly_manifest；重开文件根读取原装配表，不重新填表或改变先前迁移的顺序。启动失败同样关闭已经分配的manifest。

`createNativeSessionModelPool`分配实际ModelRuntime、调用存储、内容存储、调用事实、官方OpenRouter运输和可选模型目录。ready返回这些原对象，close保留原关闭语义。Session绑定在资源分配之后由应用选择，不内置某个宿主循环。已有createNativeSessionModelOwner在同一分配函数上安装模型绑定，不另建第二个池。

`startFileSessionRuntimeRoot`在分配资源前核固定中心／账号／登录来源，完成原CG刷新及use关闭，并核既有`tenant.json`的完整租户绑定。它不安装登录、绑定或模型凭据。准入库位于`<home>/data/session-admission.sqlite`，租户运行库沿`tenantPaths.runtime`，时钟使用该租户`run/clock.sqlite`的独立LeaseClock。目录、数据库及旁文件按既有私有命名空间规则检查。只有本次原子创建的新时钟文件允许初始化；重新打开不改写时钟身份。

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

准备与文件运行根复用同一数据库打开和迁移方法。准备方关闭原目录、Clock及Storage后才将固定租户的routeName、keyFile和凭据就绪状态交给后继会话入口。当前正式OS宿主／Session终端消费者尚未装配，因此完成准备仍返回not-ready；不得将准备成功表述为B01产品交付完成。

本机模型拥有者从实际createCallContainerStore选择createCallContainerPresence，同时供给原facts和ModelRuntime；sources不再提供本机callPresence。它不从常量、池引用或容器缺失推定stopped。当前调用资格仍由其原拥有者核实；存续读面不授执行权。

实际native拥有者先持目录关闭端口再等ready，再构造模型池。关闭先结束原模型及实际传输责任，然后撤取值、排空原取值事务、关闭原replica和目录，最后才允许外层释放Clock及Storage。目录启动失败亦执行原收场；关闭异常保留责任，显式再次close只续接原关闭。CG仍为借入，目录关闭不注销登录或关闭客户端。目录就绪或凭据可读不产生原调用的唯一执行权；原Run、最新attempt及唯一claim仍在Session原发起点核实。

## 既有终端部件的验证义务

以下义务约束仍存在的旧终端部件。其CQ命令清单不是当前正式入口；迁移须保持输入／输出／恢复性质，不恢复旧公开命令。正式入口由前文和entry-command拥有。

## S-9 单次交互操作的结算

1. 输入：经S5/S6形成的Intent和CG2 Report。
2. 前置：一次最多一个CG调用；治理屏仅invoke/logout，setup屏仅configure/health/register/login，精确phase归forms。禁止为了health从治理屏调用会重新捕获本地选择的根级runPrepared；匿名health在明确setup新调用中提供。不把界面按钮启用状态当成授权。
3. 次序：等完整CG调用及本地结算，再显示原Report与分类。需要重进或use已结束时进入S10。当前身份只从OG2 S36的可用结果更新；S37成功的Ack之后标为未确认并明确现读S36，读不成保持未确认，不猜成目标。写结果未知同样不猜身份。
4. 状态：原origin不挂到另一个选择；结果/视图沿CG。旧界面详情不作为新的缓存来源，重新进入详情必须再经CG读取。
5. 成功：显示与CLI同一事实、失败名和该动作exitStatus；成功改密/退出仍是reenter-required。setup任一动作完整结算后结束本屏，退出沿该Report，不把根级ended当成自动进入治理屏的指令。
6. 失败：unavailable、unknown、rejected、local conflict/uncertain、需重进分开；未声明CG异常无可交付Report时不能编造not-attempted。
7. 重复：不重试写，不因回到主页、重新登录、网络恢复或重绘而重发。回主页的明确刷新沿S4。
8. 效果：只有CG/中心/CLS拥有业务事实；界面不自行清登录、CAS或记授权结果。
9. 收场：记录本次用户操作的CG退出状态供S11；初始/附带读取不覆盖用户操作状态，CG已结束才允许另一次输入。

## S-10 退出与依赖释放

1. 输入：退出键、EOF、信号、CG要求重进、呈现/内部失败。
2. 前置：可调度；终端物理消失、SIGKILL不承诺可恢复。
3. 次序：幂等关闭新动作/重绘准入，请求CG关闭；等本次输入帧、CG实际工作及已经提交的普通输出全部结束；同一输出拥有者恢复本次改动的模拟器模式并核实，再恢复OS属性并撤输入监听；最后关闭CLS并给稳定结束说明。没有活动use的setup同样关闭CG根及其已受理任务，不凭use缺席跳过根工作。
4. 状态：关闭不改变已发出的业务事实，不把停止说成撤销；待画帧可以丢弃，已发帧不可撤回。
5. 成功：没有遗留输入消费者、重绘、模式改动或仍被使用的CLS；不自动再开use。
6. 失败：CG关闭拒绝不得宣称静止或撤CLS；输入/输出/恢复无法结束不靠超时假释放；已知恢复/关闭缺陷按S11报告。
7. 重复：重复信号/关闭只作用同一收场任务，不创建新调用或重复最终输出。
8. 效果：已知业务结果原样保留；不强制退出以伪造完成。
9. 收场：资源按实际拥有关系配对；退出后迟到事件不能再写或发请求。

## S-11 失败与退出状态

正常用户退出时，状态沿最近一次用户明确请求的操作之CG exitStatus；没有该操作时为0，初始/附带读不覆盖它。CG要求重进/结束触发退出时使用该Report的exitStatus。输入调用不合/环境不支持在进入前为2；内部、终端恢复、输出或关闭失败为70，保留原业务报告，不伪造CG defect字段。用户读到失败不因TUI进程随后可正常关闭而被改写为成功。

没有CG Report的初始化结果固定如下，仍按S10释放实际拥有部分，绝不生成假的CG业务报告：

| 结果 | 处置/状态 | 稳定诊断 |
|---|---|---|
| openUse not-configured / not-logged-in | 转连接与登录屏，无失败退出；用户未执行任何操作便退出为0 | 屏上说明缺少配置/登录，不当内部缺陷 |
| CLS打开unavailable；openUse local-unavailable | 退出3 | state-unavailable |
| CLS打开invalid-record / unsupported-format / unsafe-path / invalid-directory；openUse invalid-record / unsupported-format | 退出2 | state-invalid |
| 应用在初始化期间已观察到自己的取消并请求关闭；在途openUse之后不交付use | 退出2，这是应用的初始化取消处置，不新增CG2的openUse失败集合 | input-cancelled |
| openUse busy / defect；参与方抛未声明异常；openUse返回本表未列出的形状/原因 | 退出70 | internal-defect |
| 语法/TTY/profile/尺寸准入不合，或业务前捕获取消且没有CG结果 | 退出2 | 对应invalid-options / tty-required / tty-unsupported / input-cancelled |

稳定诊断沿CQ1 S10已有封闭代码；所有原始异常/源内容不回显。TUI不输出机器JSON事件流，machine+tui作为输入不合按CQ1机器错误模板处理。无可交付CG报告的缺陷仅稳定诊断；中途终端写失败不重写已失去可信交付的一份屏幕内容。

## 原Run调用读取与Loop当前观察

createSessionContextReadGrant只绑定可信根已确认的自然人登录与同源Ingress，消费者名称不推导主体种类。固定账号必须属于固定租户。这个应用输入适配仅提供context.read，显式消费者和容量由根给定；它不签发token，不授模型发起、Agent、工具效果或日志协调权。每次check通过实际Ingress的readSession核当前G28成员顺序与原Session持有，并要求Session已发布active；无法读保持unavailable，其他非可读状态拒绝。发行、撤销、借用及关闭仍由实际createLocalSessionAccess拥有。根须先通过实际CG确认来源，不能从普通请求调用此适配获取权限。

createSessionRunModelBinding消费Session提供者公开的createSessionCallAccess，并显式提供maxCallReads。原Run读取／ACK／关闭行为归[提供者承诺](../../packages/session/session-runtime-local/SPEC.md#可信宿主日志读取)。应用只选择实际Model提供者；运行消费机制迁至Session拥有者，关闭先结束CallAccess，再归还求值输入和原journal。

应用选择实际Context和当前来源，调用Session提供者的createSessionModelObservations；解释规则见[提供者规格](../../packages/session/session-runtime-local/SPEC.md#已准备模型段的-agent-loop-消费)。

## S-12 验证义务

forms逐条覆盖CQ1全部34命令/31路由，生成Intent与原CG/EC Schema一致，条件/可选字段与秘密槽精确。相同治理旅程在CLI/TUI消费同一CG事实；初始收件箱和失权/不可得/空区别；其他进程改变本地状态、原预览后CAS冲突不换登录。终端测试覆盖严格增量UTF-8、控制文本、跨块帧、超限丢弃、输入/输出背压、resize、确认修订、取消/EOF/信号、实际模式及OS属性恢复。模型只证明其有限状态与来源/进展假设；真实模拟器/IME、最终制品和Linux/macOS运行另验。


本机模型装配显式选择Session的publishSessionModelCallContent作为记录发布者。创建与回复标记由Session按原历史发布；CLI只选择实际实现，不复制该判断，不用成功占位绕过原件及标记确认。

### Session提供模型结算

本机Model池的可信构造显式选择Session的sessionModelSettlement。该依赖与原请求准备、记录发布和ACK实现同属应用装配选择，不由CLI命令参数提供。调用创建、原锚定执行、post-ACK工作和工作恢复沿原模型资源使用这个工厂；CLI不解释这些日志批次。
