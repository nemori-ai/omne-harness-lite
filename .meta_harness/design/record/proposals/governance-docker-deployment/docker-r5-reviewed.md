# Docker 单机部署映射 · R5 合成候选（未采用）

适用节点：tenancy-host；消费PF017 rev5、EC3 S-55～S-59、HT3及D055/D056/D057。本页只新增部署提供路径，中心内部八fiber、领域契约、31条业务路由和旧运维结果不变。语义已接受；R4由[D-067](../../../record/decisions/governance-docker-deployment-adoption/decision.md)采用；本R5只替换停止控制绑定，待新决定。I1已有本地镜像增量与有限真实IO先导，I2控制脚本和最终I3制品未接受，不将旧制品结果算作本协议验证。候选比较/评审归[部署提案](../../../record/proposals/governance-docker-deployment/README.md)。

## 采用范围与责任

采用A：Docker Compose运行中心，宿主systemd timer只调用现有维护命令。容器内不运行systemd/supervisor，不挂Docker socket，不新增后台调度器；Docker与宿主不同时负责自动重启中心。应用为Node主进程，当前只创建worker_threads，无OS子进程；引入OS子进程须重验回收义务。

生产目标Linux本地文件系统、rootful Docker Engine；arm64与amd64分别验收。DockerDesktop可作机制/跨OS开发观察；排他/互斥用例只在Linux本地文件系统（包括Linux内核上的独立named volume）计数，不以macOS共享目录结果背书Linux锁语义或宿主断电耐久。首个采用版本Engine29.1.3、Compose2.40.3（Desktop的build后缀仅是已有观测）；其他版本需兼容检查，不按大于该版本推断保证。基础镜像Node24.21.0，采用多平台索引`node@sha256:64af3819f9275802414d7cdc38c27e9d82bd564dec4d4da87d008255d36c63b4`；目前仅arm64本地内容核对，amd64须独立验。不能静默换tag或Node小版本。

镜像从D057后已核清单的生产归档app目录构建，带BUILD_ID及完整文件清单；不把repo、tmp、密钥、环境文件或运行库作为build context。镜像builder的输入验证必须核host归档清单/软链/摘要，不能以Docker build成功代替制品验证。只做本地镜像和可导入归档，不在本次自动推公共registry。

## 受支持的控制入口

交付Linux Bash控制脚本与Compose模板、健康脚本、systemd备份unit/timer、操作说明。宿主依赖Docker CLI/Compose、Bash、GNU coreutils、jq（JSON读取）、util-linux flock、systemd（自动备份）；不要求宿主Node。业务设置由现有host配置文件供给。控制脚本不source/eval用户配置、不解析业务规则、不直接读写业务SQL；读取Docker返回的JSON须限定所需字段，不输出完整config（可能含秘密）。

控制命令接收显式项目名、image、state-dir、secrets-dir、settings-file、listen地址/端口、UID/GID等部署输入，并投影给固定Compose模板。参数的单一解析与校验由此脚本负责；禁止通过未受审Compose覆盖文件/COMPOSE_FILE改变拓扑或挂载。CLI动作如下：

| 动作 | 前置/职责 | 结果与失败 |
|---|---|---|
| validate | 校验明确输入、镜像/工具身份、完整挂载根、UID/模式、Compose实际配置；不启动应用 | 非法/不可读/不一致非零，诊断只点字段与原因类别；不改文件权限来令检查通过 |
| start | validate通过；项目已有running/restarting中心则拒绝，避免up隐式停换活跃容器；停止态才创建/启动 | 等Docker健康最多配置startupWaitSeconds，默认120秒（控制等待默认，无测量SLA）；失败必须对本次确切容器请求正常stop，等实际停止后报告应用退出码/残余。不在失败时自动回滚数据库或换回旧镜像 |
| stop | 仅对固定项目/服务匹配的当前容器，确认ID；发一次显式正常TERM，再独立无限等待真实退出 | TERM受理不等于已排空；须取得完整合法的wait退出码，并由同一ID的exited/ExitCode核对，0才报告clean、非0报告stopped-with-error；请求失败/丢回执、wait空值/无效值或观察矛盾均unknown。容器与数据保留，等待者退出不表示应用已退出 |
| status | 只读容器运行、健康、退出与版本/构建身份；不触发启动 | 停止/不存在/不可达如实区分；不拿running当健康 |
| backup / backup-status / full-health | 只exec现有running中心的原ops命令，沿服务UID，原命令结果/退出语义保留 | 不调用up/start/run；连接断开或客户端被杀是结果未确认，不自动重试 |
| verify / restore-isolated | 同一镜像的独立维护Compose文件，独立work-dir/target；仍挂完整/state祖先，不挂serve秘密、不开放端口；无restart | 原EC3结果和失败边界保留；不生成可直接serve的新库，不自动清理无标记根；不创造安全开放命令 |

start失败触发的stop也无有限强杀兜底；控制脚本不得在超时后自报已停止。它可以被管理员外力终止，但此时结果是未确认。脚本不重试业务/维护写；只读等待使用有界循环及配置间隔，最终结果明确。脚本和实际调用不得把key、PEM、环境变量值或业务正文输出到journal。

## 生命周期与停止意图

两份Compose固定stop_signal=SIGTERM；中心stop_grace_period=-1s。中心在config及create后/start前实核Config.StopSignal恰为SIGTERM，并核StopTimeout=-1。离线维护保持独占具名Compose run，在固定配置与实际创建结果中核StopSignal恰为SIGTERM；不新增create再start的路径。Engine采用unless-stopped（隔离daemon四格已有限通过，真实产品故障矩阵待验）。异常退出0/非0均可重启；在Engine元数据存储健康、无并发daemon shutdown/外部管理命令的支持前提下，明确完成stop后跨计划daemon重启保留停止状态，应用上次exit1也不得复活。TERM回执不证明无条件耐久；helper不能自动识别全部前提失效。该限制只关Engine人工停止标记，不减少业务持久性、唯一属主或隔离恢复保证。Docker健康失败只标unhealthy，不自动重启；正常stopping时ops不答属于预期。runtime反复退出时Engine重试次数不封顶，这是该选择的明确运维代价，不假称继承systemd StartLimit；start入口的健康等待失败会显式stop并报告，运行中连续失败由status/日志暴露，运维者可stop。此默认策略必须在采用时明确接受，不由实现者选择；需有限自动重试或自动跨daemon恢复其他语义时回候选比较，不增加自写常驻看门狗。

正常部署操作一律使用上述入口。计划重启/升级Engine或宿主：停备份timer→stop中心并等真实退出→核应用ExitCode与诊断（非0先处置）→维护Engine/机器→显式start并确认健康→恢复timer。不得把daemon shutdown-timeout当中心无限等待的一部分；未遵循此步骤的daemon中断/宿主关机可能强杀，是外部故障，按崩溃恢复义务验证，不冒称正常收场。此次Docker提供路径不管理宿主关机事务；需要无人值守的关机排序时采用候选B另行映射，不能只加一个systemd hook就混合两个生命周期拥有者。

控制面故障不能绕过存储排他。Docker restart发生在旧进程真正消失后；源/工作根锁与明文临时资源仍由原storage/entry owner负责，控制脚本不删锁、不修marker、不改登录/时钟数据。强杀恢复需重验普通业务耐久和隔离残余，不能从机制夹具推断。

## 身份、权限与持久布局

非root应用默认UID/GID10001，允许显式其他正整数；0拒绝。运行前由运维者创建/准备目录，脚本仅验证，不在serve启动时递归chown/chmod。无privileged、host PID/network、额外capabilities或Docker socket；只映射业务TLS端口到显式私有/回环地址（不默认0.0.0.0宿主发布）。Docker API的宿主操作者及timer具有宿主管理能力，不能把“容器非root”说成“宿主无特权”；其OS权限不转为账号治理权限。

一份宿主规范化绝对state-dir整体绑定/state，不能只挂db或隔离根内部子树。默认结构：data/center.sqlite及其-wal/-shm、源.owner-lock、升级guard/快照与辅助文件；backups及其.quarantine/永久标记；offline-work；restores/<唯一目标>。所有实际guard辅助文件归原provider，不由部署脚本筛选。state-dir及其可见宿主祖先必须不处于任何既有永久隔离根下；脚本应按storage公开定义/映射的实际marker名称检查，不自造替代标记。任何软链/非法祖先/挂载覆写使配置验证失败；受支持Compose实际Mounts也核对，不只读输入参数。NFS/CIFS/远程卷不声明支持。

四份部署密钥、TLS链和TLS私钥从另一只读secrets-dir挂载；模板固定文件路径，沿原0600/私有目录检查。设置文件只提供下表列明的七项必填参数和可选凭据政策；state/socket/key路径由Compose固定，不能由env_file把源改到restores。原应用发现PEM与FILE同时给定仍失败，不做静默优先级。

独立维护Compose文件复用同一/state完整祖先。隔离结果只在restores下，源校验路径不任意映射成新根；传入原子目录、标记下面的明文、或替换挂载绕过祖先约束必须在支持入口拒绝。恶意拥有Docker API/宿主数据权限者不属于应用能隔离的威胁范围；普通安装误配仍须检出。

## 健康、调度、升级与日志

健康脚本只运行公开host CLI ops full-health，私有socket取完整体检；五个标志reachable/storageReachable/clockSane/deploymentKeyPresent/deploymentKeyComplete严格true且defectCount=0才健康。体的结构由HT3原解析支持，包装器仍对选用字段严格核查。默认读取deadline5秒、输出上界64KiB；只终止自身只读客户端，不取消任何服务端维护。Docker health默认interval30秒、timeout7秒、start_period30秒、retries3，可在受支持策略配置中调节正值；这些是初值，不是响应SLA。禁止用backup-status占维护槽代替健康检查。

备份unit在宿主以Docker操作者身份exec原ops，不覆盖容器user。timer沿D055每小时、Persistent补漏；应用only-if-due判20/24小时，不在脚本重复算法。unit不Wants/Requires/BindsTo中心或docker.service，不启动Engine/中心；既有Engine不可达则可见失败。timer客户端失败不证明服务端备份失败，手册指下次backup-status读取已确认事实，不自动重放。自动备份安装和启用由运维者明确操作，创建配置文件不自动安装到用户主机。

升级必须先校验新image来源/digest及离线--version/BUILD_ID→停timer→正常stop及退出核对→固定新image→start健康→恢复timer。旧image保留供依法可回退的阶段与旧封装校验；启动失败不自动降级，按原guard与残余处理。正常控制不以down删除诊断对象；重建停止容器之前必须先保存其现存工程记录（见下）。明文与永久marker不因升级移动/删除。

Engine日志选择local驱动，max-size默认10m、max-file默认3，明确为可配置操作参数；应用沿原JSONL，控制脚本只写元信息和阶段，不复制业务审计。不得把无限重试/日志轮转描述为容量保证；备份容量由原结果与运维保留流程管理。

## 验收与未完成

1. 有限机制：负停止配置/stop/down；unless-stopped退出0/1、明确停止及daemon重启，on-failure负对照。已跑部分不能替代未跑矩阵。
2. 实际产品：备份IO门>31秒时stop仍等待、第二属主拒绝，释放后退出；正常停止残余exit1正确报告；强杀/daemon消失后的guard/备份unknown/永久隔离结果。
3. 安装入口：误挂载/软链/隔离子树/uid0/权限/未知Compose覆盖拒绝；无密钥入image/输出；两架构镜像制品清单。
4. 升级与启动失败：健康等待失败→正常stop，无自动降级；不得以CLI返回0掩盖应用exit1；旧image可取。
5. timer：现有运行中心备份成功；已停/无Engine时失败不复活；在途stop后客户端未确认而服务端可能完成，后续status解释一致。
6. 干净Linux本地文件系统实际Docker中心+macOS/Linux客户端治理与维护旅程；既有1926/34证据不升级为新平台验收。

继承的R4节点路径与配置由D-067技术采用；本稿R5新增StopSignal与停止请求绑定尚待新决定。R3独立Fable架构评审、R4合成稿的独立architecture/spec复评及施工计划评审归提案review；接受设计不等于这些验收已通过。不得修改冻结EC3/HT3来消除部署失败。接受后worker使用固定节点hash/施工清单；最终Fable审整体目标/边界与证据，再由主线接受交付。

## 输入、目录、镜像身份

交付固定 `compose.yaml`（center）及 `compose.maintenance.yaml`（maintenance 单次任务），由同一个 Bash 控制入口选择；不是从用户提供的覆盖文件合成。离线文件不引用center服务/其环境/秘密/端口，所以无serve设置也可解析运行。禁止不受审覆盖。helper名为 `omne-center`，只投影部署/进程控制，不拥有领域提交或恢复状态。

动作必填输入：
- `validate/start`：project、image（本地不可变sha256 ID或RepoDigest）、state-dir、secrets-dir、settings-file、publish-address、publish-port；uid/gid缺省10001，startup-wait缺省120秒。
- `stop/status/backup/backup-status/full-health`：project；从当前唯一center容器读取确切ID和实际标签，不要求当前secrets/settings仍可读，也不使用待升级image替代真实容器身份。ops路径固定；已停止时备份/体检拒绝，不创建容器。
- `verify/restore-isolated`：project、image、state-dir、source、work-dir；restore另需target；uid/gid同上。不接受/不消费secrets/settings/publish输入。另 `maintenance-status --container-id` 加project只读这次单次任务的实际状态/退出/已产生输出；不启动任务。

settings-file采用Docker Compose env_file的raw格式（无值插值），只允许以下现有host变量的单行赋值和空行/注释；缺必填/重复/未知键为配置失败，诊断不打印值；脚本不source/eval，不再实现时长/凭据政策算法，合法值及跨字段关系仍由start时的现有应用解析器校验。validate只报告部署结构、输入存在和挂载等检查通过，不声称业务值/跨字段已合法，也不新增应用dry-run接口：

| 输入 | 必填 | 到host的映射 |
|---|---|---|
|五项部署参数|是|OMNE_TENANCY_UNACTIVATED_RETENTION、OMNE_TENANCY_INVITATION_TTL_DEFAULT、OMNE_TENANCY_AFFILIATION_REQUEST_TTL_DEFAULT、OMNE_TENANCY_COPY_NOTICE_TTL_DEFAULT、OMNE_TENANCY_SHARING_INVITATION_TTL_DEFAULT，原值 |
|团队创建幂等键保留期|是|OMNE_TENANCY_TEAM_CREATION_KEY_RETENTION，原值，无Docker默认 |
|启动等钟时限|是|OMNE_TENANCY_CLOCK_READY_TIMEOUT，原值，无Docker默认；原应用要求大于租约宽度 |
|凭据政策|否|OMNE_TENANCY_CREDENTIAL_POLICY，缺席沿原应用未设置语义，不增加Docker政策 |

模板固定环境：STORAGE_DIALECT=sqlite、STORAGE_FILE=/state/data/center.sqlite、BACKUP_DIR=/state/backups、OPS_SOCKET_DIR=/run/omne-tenancy、ENTRY_LISTEN=0.0.0.0:8443（仅容器内部；宿主发布到显式私有/回环地址与1..65535端口）；变量全带OMNE_TENANCY_前缀。不传STORAGE_URL或inline PEM。六个*_PEM_FILE变量固定/secrets下activation-signing-key.pem、activation-verification-key.pem、purge-signing-key.pem、purge-verification-key.pem、tls-chain.pem、tls-private.pem；变量名精确对应现有四份部署密钥和ENTRY_TLS_CERT_CHAIN/ENTRY_TLS_PRIVATE_KEY。四份部署密钥文件名沿现有keygen输出；TLS链/私钥由运维者提供；不自动生成或覆盖。

本版helper受支持的调用身份是Linux宿主root（EUID=0；timer同样），以便遍历应用UID拥有的0700目录；只有docker组权限不满足此检查前提。容器运行UID仍必须非0，宿主root权限不成为治理账号权限。LSM或文件系统使读取失败仍拒绝，不放宽0700。运维者在首次启动前创建state-dir及data、offline-work、restores四个0700目录，归目标uid/gid；backups路径不存在或为已存在合规目录，其初始化仍归原provider。secrets-dir 0700，六文件普通非软链0600、归目标uid/gid。settings-file0600归宿主操作者、只由宿主Compose读，不要求容器uid拥有；文件不进image或/state。helper只核权限/归属，不修权限。

center固定tmpfs `/run/omne-tenancy`，`mode=0700,uid=<uid>,gid=<gid>,nosuid,nodev,noexec`，由Engine在应用exec前创建；无root入口脚本。start校验实际挂载类型/UID选项并在容器内原公开CLI拒绝错误目录。每次容器重新启动tmpfs重建，保留已停容器仅为诊断，不把旧socket当持久状态。maintenance不需要该tmpfs或ops目录。

宿主state-dir及祖先检查遵循storage-sql/maintenance.md“持久隔离与打开检查”：固定`.omne-isolated`，任意类型条目存在即拒绝，不读内容决定放行；无法检查、路径任一软链也拒绝。合法既有工作根的marker则按原离线工具检查，不把state根的禁止规则误用到其内部工作根。

image构建在验证生产归档清单后，读取原`--version`的应用版本和BUILD_ID，写固定labels `org.opencontainers.image.version`、`ai.nemori.omne.host-build-id`、`ai.nemori.omne.distribution=tenancy-host-docker/1`；镜像中保留原BUILD_ID，离线只运行--version核label一致才可采用。容器创建复制这三项label及固定project/service关联，state-dir挂载摘要可供诊断，但不带密钥/环境值。`status`读取实际container.Config.Labels与container.Image不可变ID，和该ID的image标签核对；不启动新容器、不执行--version、不使用配置中的新image。不存在center→absent无构建身份；label缺失/格式错误/镜像不可读或不一致→identity-unavailable且命令非0，不伪装development。运行健康另读Docker.State.Health；不在full-health加字段。标签是已验镜像的声明，不是独立密码学来源认证。

## 离线任务路径与收场

控制入口的source/work-dir/target均为宿主规范绝对路径，必须位于同一完整state-dir内；helper逐既有祖先拒软链和不规范路径，按state-dir相对后缀唯一映射到/state，绝不根据输入添加额外挂载。source须现存普通文件，允许/state内封装的位置，由原工具核内容；work-dir须在state-dir/offline-work/内，已有父目录0700归运行UID，新根或已有已标根的判定交原工具；target须在state-dir/restores/内，其已有父目录同样私有，目标必须不存在，包括空目录也拒绝。source/work/target不得互相占用或将source作为目标；不擅自添加marker。返回原JSON中的location仍是容器/state命名空间，外层元信息给出state-dir映射，不篡改原结果。

每次verify/restore独占一个具名maintenance容器：调用前生成并输出唯一name；create后记录并输出不可变ID；控制元信息（name、ID、宿主↔/state映射、等待/unknown诊断）全部放stderr，stdout只转交原工具的一个JSON+LF，不能前置banner或Docker progress。带project/action标签、不设restart、不挂secrets、不发布端口、不自动删除。用固定maintenance Compose定义启动后等待实际终结、转交原stdout/stderr和应用退出码；不得把docker run/wait命令退出0当作原工具成功。客户端Ctrl-C/SIGTERM对已核身份的确切ID发一次docker kill --signal=SIGTERM，仍等真实结束；任务已完成时可按实际退出码与原工具输出结算，不套用中心的跨daemon停止意图确认；客户端SIGKILL/连接中断则结果未确认，任务可能继续，其容器和输出保留。运维者以maintenance-status查那次ID，必要时对该确切任务正常stop并等退出；输出出现不等于进程完成。只能显式清理已确认停止的具名容器，不能随命令超时清理工作根。离线状态查询缺ID/项目不匹配拒绝；镜像身份仍按该任务的真实镜像读。

补入验收：无secrets/settings时离线解析与运行；自定义UID的tmpfs私有目录；缺两项时限时validate/start具名拒绝；旧停止容器和待升级image不一致时status报实际旧身份；离线client被终止而服务端未结束时state与原结果仍可查询、锁仍持有；所有host↔/state映射和拒绝路径的反例。

## R3 架构评审的技术处置

### 控制状态与启动观察

运行态要求State.Status=running、Running=true、Restarting=false、Pid>0；restarting独立报告，RestartCount只诊断，不当已启动。可启动的既有容器仅created/exited；paused/dead/removing/未知状态拒绝且保留诊断。created表示尚未运行，不伪称曾clean。启动完成还须StartedAt相对启动前改变（新容器由零值改变）、原完整健康字段通过。

start先拒绝活跃/重启中容器，再验证输入。替换已停止容器前先导出记录；固定Compose只用于config/create（不build、不pull），create后核实际Config.StopTimeout=-1、用户、挂载、网络/端口、restart、标签及健康配置；满足才docker start确切ID。不使用compose up/restart或--force-recreate，不把create命令退出0当满足配置。其他版本/配置不能传-1时拒绝启动，而不是依赖发布说明。

健康等待中观察到应用退出、restarting或RestartCount相对本次起点增加，报告startup-process-failed并请求确切ID正常stop；到期仍未健康，报告startup-observation-expired并同样stop，两者不混称应用启动失败。默认120秒只是部署观察输入，慢迁移可显式调大。应用可能在stop请求后完成boot/迁移确认才撤除；helper等待原收场，不能撤销已确认迁移或自动降级，应用退出0也不把观察超时改成成功。Docker API失联、调用者中断均保留未确认，不能报已停。

自动恢复期望：未通过支持的stop入口记录停止意图时，Engine在可用后可依unless-stopped拉起同一配置，沿原boot/guard/clock/存储检查；明确stop后的容器保持停止。故障恢复不是优雅收场证明，反复启动失败最终仍需运维者处置。应用自行退出0同样可能被重启；容器内直接给PID1发TERM不是支持的停中心操作，说明书须给负例。status保留真实RestartCount及可得的上次退出状态；Engine没有提供历史时写unknown，不据当前State.ExitCode发明上次结果。

中心生命周期的宿主祖先检查在validate/start执行，离线verify/restore每次仍按输入章核完整宿主祖先；Engine自动拉起不执行Bash；容器只看得见/state及内部祖先。因此部署前提是运行/自动恢复期间不移动state-dir、不重定挂载、不在宿主祖先新增隔离marker；需改这些映射时先按支持流程停中心再重新validate/start。容器内每次生产打开照原provider检查marker，宿主祖先不可见的部分不冒称已重验。负例分别覆盖marker位于state-dir上方与其内部。

### 工程记录和备份取用

默认local日志驱动的10m×3是有限容器日志保留。对已有停止容器执行任何可能重建的create之前，helper以宿主root在state-dir/operations下独占建立0700目录，将该确切ID当前可取的stdout/stderr日志、应用版本/BUILD_ID/镜像ID/终态等非秘密元信息分别保存为0600文件，文件和目录同步成功才允许替换。不得保存完整inspect/env；日志导出或同步失败则拒绝替换、保留旧容器，不删除先前成功导出。该目录不自动清理，运维者按容量人工归档；导出只保留当时尚未轮转掉的记录，不宣称无限审计历史。用户绕过helper直接down/rm可能丢记录，是未支持路径。operations不进业务备份封装，也不成为领域状态来源。

宿主root可从私有backups目录复制已完成封装到另一个受保护位置，保持原封装字节/hash；若归档位置在state-dir外，校验时先把该封装复制回受支持state-dir中的独占新文件（不覆盖已有备份），核相同hash后用匹配版本verify，不因此新增任意挂载。不能为方便普通用户复制而放宽0700/0600。同机移动仍非独立灾备。验收加入实际导出日志、迁走并校验一份备份与失败时保留旧容器。

### 构建与平台范围

开发构建入口消费已经解压的app，不实现任意tar解包。复用artifact-builder公开inventory/digest核完整清单，排除仅由该归档算法保留的BUILD_ID/build-info.json后重算；生成context只放该app和固定Dockerfile。首批应用闭包须核没有原生addon或平台专属可执行代码，才能用同一app层构建两个架构；若发现平台相关物则停止该分发路径，回本节点规定分别构建，不能标相同BUILD_ID。Node/SQLite运行时来自各自固定平台的基础镜像。

每个架构分别构建、保存并实际运行归档，记录imageID、基础manifest、BUILD_ID和归档hash。当前可用amd64路径是Docker仿真，须明确记作仿真CPU上的Linux amd64执行，不冒称原生硬件性能/介质保证；原生amd64和公司主机实装另记平台范围。用户已允许Docker模拟跨OS，未把原生CPU设为本次前置；遇仿真不支持的系统调用或存储行为时不能用arm64结果代替，回报缺口。

### 接受时必须认领的代价

主线按用户“自己设计和架构、负责验收review、决定是否接受”的授权，由D-067明确接受以下技术采用代价：单一Engine自动重启管理；运行期重试不封顶；宿主root运维与timer；人工先停中心再维护Engine/OS；不按序列的关闭按故障恢复；非手动停止后可能自动拉起；工程记录有有限轮转并在受支持重建前导出。这里没有把用户已要求的正常关闭、业务持久性或隔离恢复取消；替代方案及其成本回部署候选比较，新增业务取舍仍回产品负责人。

## 同项目的控制互斥与故障后接续

project只接受小写安全token（`[a-z0-9][a-z0-9_-]{0,62}`），不允许不同拼法指向同一项目。宿主root在自己的/run/omne-center私有0700目录持有<project>.lock，父目录/锁必须普通真实对象、归root，不跟随符号链接。start/stop用util-linux flock非阻塞独占锁，从第一次状态检查直到日志导出、create、实际配置核验、start/正常stop及最终观察全部在同一锁范围；竞争者立即busy非零，不排队后悄悄继续。这样两次支持的start不能都通过停止态检查后互相重建。status和原业务ops不取此锁，锁不是数据库属主资格，也不替代原排空。

helper被SIGKILL或Engine请求失联时，OS释放flock不证明daemon侧请求结束；一次status的exited/created也不足以排除旧请求晚到。此时保持unknown，不自动重试create/start/stop；操作者必须取得旧请求已终结的依据并核确切容器后才发新生命周期变更，不能用单次状态样本当解除依据。这是故障后的支持前提，工具不造持久意图协调器、不提供自动清unknown捷径。故障模拟须能让旧请求晚到并检查未按成功继续；未能确认的运行如实保持未确认。

离线任务每次用唯一name/ID的Compose run，不先create/up共享maintenance服务、不加--remove-orphans、不删除另一任务。两次不同工作根任务可并存，原provider只对相同工作根判busy；center生命周期锁不把这两次任务串成全机维护锁。停止具名离线任务的恢复说明只允许对核过project/action的确切ID调用docker kill --signal=SIGTERM，再docker wait并核同ID实际退出；只对已核身份的ID发送，未核身份保持unknown，不能把center stop用于单次任务。

验收新增：同project两个start在预检后交错，第二个busy且不得发生替换/丢日志；stop与start同样互斥；脚本死后旧Engine请求未结算继续unknown；不同工作根的两次离线任务不会互相重建。D-067记录此补充与R4的独立架构复评，代码符合性仍待真实检查。

## R5 停止请求与结果观察

中心在同project独占锁下，对最初观察为running/restarting的确切ID只发一次 `docker kill --signal=SIGTERM`，显式TERM不可省略或替成KILL；受理后 `docker wait` 无到期强杀。必须取得一个完整合法退出码，并由inspect确认同一ID处于exited且ExitCode相同；控制CLI自身返回0不表示应用exit0，空stdout、无效值、矛盾或不可得均unknown。不用后来一次exited反推先前失联请求成功，不自动重发。初始exited只报告观察与`stop-intent-unconfirmed`、非零，不为补停止意图而start。其他不支持状态拒绝。

正常stop保留JSON字段containerId/exitCode/clean；应用exit0才clean，非0 stopped-with-error。启动健康观察失败触发同一协议，最终真实退出/残余/unknown写stderr，start始终非零。调用者离开不删除容器、数据或任务，不取消既有未知请求的人工接续前提。

离线任务restart=no；创建期间只有唯一name或未核身份ID时不发信号，报告unknown。已取得实际完成事实的任务可按原退出码/原JSON结算；否则请求TERM后仍等真实结束，控制等待结束不能代替任务结束，保留输出与资源供maintenance-status查询，不重放未知动作。

上述继承输出的精确实现来源为I2提交ac4c3f82645ddd6bb489d21087a54020b8b5dc24，helper SHA256 666b73a6bfd99fac40c66b2a475aa5be810616c247415a97e8d2a4093544a0a1；不是用实现替代规格。R5候选及独立评审归部署提案，D-067的其余采用保持。新的最终helper/镜像仍须完整受验；并发shutdown特定分支未实测，不称竞态不存在。
