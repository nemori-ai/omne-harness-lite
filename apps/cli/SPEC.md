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

正式执行器已接四个治理动作、登录／注册、退出、登录列表／撤销与换凭据。Session执行器尚未接通，返回not-ready和3，不生成会话、资格或模型请求。交互补全和默认准备尚未完成；B01交付前须接通其计划要求的路径。

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

`createSessionHostEndpoint`只供可信根装配使用。装配须提供真实匹配的中心／租户绑定和
原LocalSessionIngress；它不能从普通请求body造principal或Access。绑定不同在业务端口
调用前拒绝。实际调用使用原活体Access及提供者的当前授权检查；Access、协调资格、
AttemptPermit、Storage和原始日志均不进入请求或回复。普通消息输出只包含允许展示的文本。

`startLocalSessionHost`拥有本机Unix HTTP监听器及入站请求。通道地址为状态根下的
`run/session-host.sock`；父目录按原私有命名空间规则检查，socket归当前OS用户且为0600。
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

session-model-owner的createSessionOriginalModelOwner是可信应用构造器。它选择公开createOriginalIssueOwner，传入与Session相同的AtomicStorage及原活体日志权限；通过modelIssue工厂交给Session参加者，不从Session具体提供者导入或选择该模型实现。每个工厂只附着一个原拥有者。构造参数中的当前模型资格、持久记录容量和在途上界均须由正式根显式提供，没有默认授权、默认模型、凭据或预算。

bind固定原Scope、prepareCall及其实际permit，以OriginalIssueAdmission形状供模型原调用的SettlementLogBinding消费。原模型输入先经其公开prepareOriginal捕获，然后经Session同单元modelInvocation.admit；应用不调用绕过Session的原admitOriginal。成功只转交原claim和原位置；复制claim或另一binding的claim不进入原consume。consume仍由原模型拥有者重新核当前资格和唯一启动权。重复alreadyIssued映为原模型conflict，不转换成confirmed或第二启动权；最新栅栏／终态及来源重读失败保持原失败语义。

unknownCommit必须先交还构造时明确提供的retainUnknown责任端口，保持原Scope、call及协调准备位置，然后对原模型调用返回unavailable。它不重试发起、不替换原身份，也不以不可用伪称未提交。责任端口异常保留原异常交Session fault owner，不吞为正常模型结果。正式根必须持续保管该义务，并按原持久准备和模型拥有者的恢复规则接续；此构造器没有授权通用重发。

close同步撤本原拥有者的新准入，等待原模型唯一发起责任核实；pending保持原资源，后续可重试原close。它不关闭借入Storage／日志、Session、Runtime Context或模型实际执行池，不把原发起拥有者关闭当模型调用已经结束。正式根仍须配对真实ModelRuntime及其executionSource、完整结果保管和ACK。当前构造器的实际SQLite／CG客户端／Context／原模型owner组合使用受控运输、模型输入和当前模型资格；它不是完整运行根、真实OpenRouter或默认CLI验收。

## 原 Run 的模型运行时接线

`createSessionRunModelBinding`只供可信运行根调用。它先用原协调权限和实际Run grant借用Session日志，再将原prepareCall和唯一发起owner接入`SettlementLogBinding`。模型执行和模型选择使用同一个日志binding及借用代际。完整前缀来自原借用的实际日志读面；不把普通用户Access提升成Run写权限。

本应用使用已有物理ModelRuntime的`project`建立原调用的操作面，不创建第二个执行池。事实视图必须借入该物理runtime的同一content owner，由原ModelRuntime核验。可信根显式提供原host权限端口、身份源、当前评估输入、catalog、凭据、工具lookup、选择策略及版本坐标。构造器不推断主体、模型、秘密或权限，不补默认资产及配方。仅固定Session能够通过该投影的sessions.bind；不同Session返回invalidInput。

返回的operations是模型的普通公开操作面，不包含executionSource或物理runtime的close。原executionSource仍由物理运行根持有。`returnJournal`只撤销和归还该次日志借用，等待原日志单元结束；它不停止模型，不确认结果保管，也不发ACK。运行根必须先完成原模型结算／保管责任，并等待原模型对该binding的工作实际结束，才调用returnJournal。Session关闭等待日志借用归还；借入的Storage、日志、Context和物理模型池由各自原拥有者关闭。

构造在借用后失败时，先归还已分配的日志。若归还也失败，AggregateError保留两项原错误，不报告成功。作用域及content owner校验不能由复制的配置对象或进程代际替代。进程借用代际、持久日志代际和物理executionGeneration各有原语义，不能互相比较来授权。

组合测试使用实际物理ModelRuntime、project、SQLite日志、原Run grant和唯一发起owner。非空原调用经公开openCall／dispatch产生完整Pending；实际executionSource交给Session保管，最新permit提交原结果一次采用，原SDK保存消息／响应批次后原acknowledgeCall成功。治理运输、当前模型资格、catalog和模型IO仍受控；该组合不覆盖正式宿主或真实OpenRouter首答。

## 原模型结果来源与借用结束

`createSessionModelResultSource`只供可信运行根构造。根须提供租户的实际AtomicStorage、完整TenantId、原物理ModelRuntime.executionSource的读取端口、明确捕获容量及同单元引用接管端口。它不从请求数据恢复这些能力，不提供默认引用接管器。执行来源尚未装配时返回unavailable。容量检查先于来源捕获；不同租户在进入执行来源前拒绝。

capture只选择原Session和call的唯一执行，等待其原invocation.outcome。仅完整PendingModelResponse能够成为结果来源，必须保留原Run、attempt、dispatch及无损数据。借用的物理executionGeneration对象、原唯一发起记录的字符串代际和持久日志代际分别使用，不互相比较。原invocation只留在来源拥有者内部；返回的捕获仅含固定Scope、完整Pending和原对象身份，不泄露可执行句柄。复制捕获对象不能取得释放资格。

`source.verifyIn`先核实际存储单元，再核捕获的原Scope、调用、attempt、dispatch、完整Pending及物理来源当前记录。ACK已解除副本或来源已失去记录时，不接管引用。引用接管必须参加调用者的同一StorageUnit；端口返回unavailable不折成verified，异常保留原异常。此适配器不独立提交、不推进Run，也不决定回复处置或发ACK。

release撤销该捕获的新验证，等待已经参加的实际StorageUnit结束。正常提交或确定回滚后才返回原frame；事务回调结束本身不构成可释放条件。完成观察为unknown时保持pending和原借用责任，不能据此确认接管。`confirmCustody`通过根所持原Session协调权限读取原call/resultKey的完整结果，核对原Scope、日志代际、回执键及完整结果后才能解除这项不明义务；absent、不可用或不同结果不能解除。确认结果保管不是回复采用或ACK的授权。

来源拥有者在归还frame前清除原执行数组和invocation引用；捕获分面不让这些能力逃逸到调用者。close只撤新捕获准入；已分配且正在等待的捕获仍由原拥有者结束。存在未归还捕获时close返回pending。它不停止借入ModelRuntime、不关闭借入Storage、Session或Context，也不代替物理模型拥有者的真实关闭证明。


## 原Run历史的模型读取

`createSessionRunHistory`由可信根固定完整SessionScope。它只解释模型SDK给出的原owned prefix；Scope、来源或借用代际失效时返回unavailable，不另开存储事务，不授执行权。

读取从同一完整前缀核原run_started、原attempt及最新attempt、run_finished。无Run、无原attempt、重复开始、倒序attempt或不匹配的终态拒绝；合法其他会话事实和模型消息保留，不改成模型提醒。读取至多O(n)，没有新增缓存算法。

实际ModelRuntime的dispatch发布ready后可关闭原invocation结算入口。可信根不能假定捕获该句柄后仍能settleReply；需要结算时复用公开SDK coordinator及原Run日志、真实owner和Run历史。原完整结果先由Session可靠接管；原SDK仍拥有消息／响应配对及ACK条件。Session结果采用和原能力结算分别核对，不以保管或模型ACK冒充最新permit的推进完成。


## 宿主拥有的一次原模型消费

`runSessionModelTurn`由运行宿主消费一个已持久准备的原调用。输入包含实际Ingress、固定Scope、原prepareCall、实际Run绑定和结果来源，以及真实模型依据／装配报告、投影规则与拥有者codec、原创建／结果／采用键和原结算owner／策略。模型IO的signal属于运行宿主，不借用终端客户端的signal。缺少这些输入不补默认身份、模型、秘密、权限或策略。

消费者从原Run借用的完整日志计算请求消息，复用`projectMessages`和`materializeMessages`；事实不转为提醒。实际Context等来源须由其拥有者的公开codec验证，缺codec阻止调用。本实现做固定前缀的O(n)投影，没有改变缓存算法。原openCall使用实际准备的call身份来源，返回call必须与原准备一致；dispatch显式带原attempt，不自行造调用或更换原键重试。

完整结果依次经过实际执行来源捕获、Session同提交保管、最新permit采用、原SDK消息／响应结算、真实任务停止和结算owner关闭、来源frame归还，再请求原ACK。保管、采用和SDK结算分别成功才继续；任何一步未确认都不假完成，不将保管等同回复处置。该消费者不决定Run终态、不执行工具、不创建第二个Agent Loop，也不停止借入的物理ModelRuntime、Session或日志。

根必须提供`retain`责任端口。返回retained前，该端口须接管原turn的配置、身份、绑定及尚未结束的捕获／结算coordinator；不能只写一条日志后丢掉能力。消费者不自动重发或重试未知提交。根使用原身份和实际公开认回操作处理未完成责任；本文不承诺完整重启恢复。ACK不可用时，Session原全文和已结算记录仍保留，来源归还不等于ACK成功。

异常完成仍等待原结算任务的stopped。原缺陷上抛；异常处理中的责任接管也失败时，AggregateError保留两项原错误。责任端口一次失败不再自动调用第二次。返回acknowledged仅表示原结果采用和原ACK闭合，不代表Run已completed、真实OpenRouter或完整宿主已通过验收。


## 原消息受理与机读结果观察

`session-submission.ts`只读普通用户的原submitInput回执，再读一个经当前成员授权的固定完整日志前缀。这是两个读取操作；回执不可变，后续前缀必须同Scope、同journalGeneration，并覆盖原回执。它核原input_accepted与原UserMessage位置，再按run_started／input_adopted／run_finished关联真正消费该输入的Run。尚未消费时run为null；上一轮completed不能替代本次消息的结果。读取至多O(n)，不追加事实、不消费输入、不授予执行或取消资格。

普通宿主数据协议增加readSubmission。请求只含完整租户绑定及原OperationRef，不含活体Access、permit或协调资格。宿主仍从可信构造取得原Ingress；跨中心／租户绑定在业务动作前拒绝。用户文本读取携带日志原run字段，未归属Run时为null。该字段只是归因数据，不是执行权。

正式main通过entry-execution消费session-message-entry。当前已实现明确指定既有会话的`omne --message-file <path> --json --session <session-id>`路径；新会话准备及裸终端入口仍须完成。文件有明确大小上限，必须是严格UTF-8、无重复字段的JSON UserMessage。应用读取真实根catalog选择及该租户的已有鉴权目录，核中心／账号一致；不从消息文件制造身份，不自动建立缺失租户或切换选择。客户端只拥有自己打开的catalog和治理客户端装配；模型、工具、Session及宿主执行资格仍由宿主拥有。新Run的登录确认继续由原G28路径承担，客户端提交或读取不替代它。

`submitSessionMessage`只发送一次原提交。其余请求只观察原回执；它拒绝异操作、改变的回执、异journalGeneration、不同消息和倒退前缀。unknownCommit保留完整原OperationRef；运输未确认保留原请求身份，均不自动重发。取得回执后，等待超时、断连或取消等待仍保留原回执，不取消原Run。应用根显式提供请求时限、整体等待时限、轮询间隔和回复容量；使用Node异步计时器及总等待截止信号，不为客户端等待创建线程。

仅本次输入对应Run的completed返回退出码0；failed／cancelled返回3；受理但等待未完成及未确认返回4。终态消息须来自覆盖该终态观察的用户文本前缀，返回原输入及该Run的消息；迟到的其他Run消息不混入。本报告只输出请求的完整租户绑定、Session、operationKey和messageId，不回显原消息体。用户文本规则继续排除事实、OpaqueJson和ModelOnly内容。最终JSON使用现有无损编码器，原日志整数位置不得经JSON.stringify取整。

实际SQLite／Ingress组合已覆盖原输入关联与上一轮completed隔离；编译后的main已通过真实catalog及租户鉴权目录、实际私有Unix通道完成机读观察。此进程测试的宿主结果受控，不表示生产独立宿主、真实OpenRouter、核心Agent Loop或默认终端路径已经交付。
