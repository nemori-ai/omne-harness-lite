# 治理中心 Docker 采用分析 · 修订记录

R1/R2 是保留的候选分析，未接受。当前 R3 的精确提供者映射归 [tenancy-host Docker](../../../realization/apps/tenancy-host/docker.md)；与旧候选冲突处以该待审稿为本轮评审输入，仍不构成实施授权。

## 前身与来源

基准为main 2cb236db的已实现治理中心；目标态资产/模型中心部分不纳入本次。前身是PF017的应用部署与D055/D056维护生命周期、D057制品分发；Docker只改变进程承载与制品封装，不改变中心身份、租户规则和维护提交点。
已提前阅读现行机制，本次为既有采用的演化分析，不声称重新满足双盲。领域对象从对象清单读取：中心标识、部署密钥、账号/组织/租户；它们的身份与寿命不随容器ID或镜像重建变化。容器ID不是新的领域身份。

## 性质与边界（引用，不新增业务政策）

| ID | 观察者与结果 | 依据/保护位置 | 义务 |
|---|---|---|---|
| DK1 | 员工面对同一中心；替换容器保留账号、中心ID、已确认治理数据 | PF017；EC3；存储与入口owner | 持久目录必须覆盖SQLite源库及属主协调文件，不只复制db |
| DK2 | 正常停止期间，尚有维护资源则仍停止中；不报告已完成、不释放原属主 | EC3 S59、D056、maintenance-binding两槽 | Node实际收场；容器停止路径等待，不添加期限到点强杀；异常外力终止另验 |
| DK3 | 备份发生在运行中心，业务继续；失败/未取到结果可见 | EC3 S55/S56、HT3 | 定时任务只调用原ops，不带治理凭据，不重试未知写入；不以socket请求失败假称取消服务工作 |
| DK4 | 运维者主动停中心，备份时钟触发不使中心重新启动 | 既有维护装配/用户单机边界 | timer只能exec，不能compose up/start/run center；失败退出和journal可见 |
| DK5 | 运维者能verify并隔离恢复，业务保持未开放 | EC3 S57/S58 | 离线独立工作根、目标独占；不启动中心读取恢复目标，不提供安全再开放捷径 |
| DK6 | TLS、部署密钥和秘密不进镜像/公开日志；容器非root仍能访问其私有数据 | PF017、现有key/file检查与EC3 S29 | 宿主文件UID/权限映射，敏感路径只读；不许chmod777绕过检查 |
| DK7 | 升级沿既有guard；失败阶段可诊断，不承诺任何阶段都可降级 | PF017升级边界、host guard | 新镜像验证和停止先于替换；保留旧制品，是否可再起由数据/guard事实决定 |

正常停止等待不涵盖管理员docker kill、强制shutdown或整机损毁。强制终止必须作为故障恢复场景保留，不能称资源已优雅收场。单机同盘备份不成为整机灾备。

## 候选A的责任投影

不增Cordis fiber，八条应用装配与现有provider保持。中心Node为容器的实际主进程，exec形式入口；不放shell守护循环，不在容器内运行systemd。新增部署文件只接已有公开命令。

- 镜像消费已有host归档生产闭包，固定Node24.21.0及选定基础镜像digest；镜像包含代码/BUILD_ID，运行配置和数据外置。不将源码测试依赖作为运行依赖。
- Compose只装一个center服务，Linux arm64/amd64作为待验矩阵；macOS是客户端及Docker机制开发环境，不冒充生产Linux验证。先不对外推镜像，交付可导入的本地归档与摘要。
- 数据、备份和离线恢复工作根分清宿主路径；源和协调文件留同一数据挂载。持久数据目录不因删除容器而删除；运行socket可在容器私有临时目录，由相同uid的exec客户端访问，不对网络开放。
- 非root UID/GID明确可配置，目录由运维者在启动前按既有权限要求准备；密钥生成串行且只在首次部署显式调用keygen，不放自动启动脚本；证书/密钥用只读文件挂载，沿应用文件读取检查。
- Engine restart策略候选on-failure，只用于异常退出；显式停止后不重启须实测。不存在“health变红即自动重启”承诺；健康探针读取原公开健康面或原ops健康结果，并显式判字段，full-health退出0只代表取到结果，不能直接当健康。
- 正常停止候选 `stop_grace_period: -1s`，必须先验证Compose配置、Engine StopTimeout=-1及实际等待链；如不成立本项未就绪。文档化 `docker stop --timeout -1 <确切容器>`作为已存在CLI语义，不能只以帮助文字推断Compose默认stop/down。
- 宿主timer每小时仅对正在运行的既定Compose项目执行 `exec -T ... ops ... backup --only-if-due`；timer与命令不使用up/run/start，缺容器/停止中/连接失败非零退出。沿现有Persistent补漏语义，实际日界由中心判定；不新增业务计时器，不自动删除备份。
- 离线verify/restore采用同一镜像的单次命令，显式独立挂载/工作根/目标，不装serve密钥、不消费治理登录；故障后沿现行残留与排他规则，不自动清理无标记根。

## 证据依赖与未就绪项

Q1：Engine 29.1.3/Compose 2.40.3-desktop.1机制探针验证负停止配置/无界等待/负对照及restart行为；版本变化需核影响。不把15秒观察等同无限时间证明，需结合CLI事实与配置传递。
Q2：真实产品备份被IO门挂住超过31秒时，正常停止仍等待且第二属主拒绝；放行后退出。明确强杀后重启/残留不同结果。
Q3：宿主systemd timer实际exec调用，备份失败日志可见，中心已停时不复活。纯shell对docker的mock不是该条证据。
Q4：干净Linux/两架构镜像运行和macOS/Linux客户端真实治理、升级/备份/离线工具。
Q5：原macOS controller-pending失败由独立诊断任务收口，不能以Linux绿测覆盖。诊断尚未完成。
Q6：镜像digest、Compose最低采用版本、健康检查的具体公开入口、UID初始化与输出卷权限均在接受前固定。计划暂未确定这些技术输入，开发者不得自选降低权限或健康判据。

接受门：Q1与可复现提供者草案完成后由architecture-reviewer审整体边界/代价/反向检查；据此更新tenancy-host节点、精确采用决定/施工单，再允许实际编程。Q2–Q5作为实现与最终验收门保留。大里程碑另请fable审设计目标、实践与实现证据，不替代独立架构/QA。

## R2：评审后收窄的运行映射（替代上文冲突的候选细节，仍未接受）

R1输入由提交dbd30176恢复，评审见review.md。Q1已有[当前版本机制证据](../../../../research/governance-docker-runtime/README.md)，但不是Linux生产主机/真实应用验证。

### 正常控制路径与外部强制终止

本提供者支持的正常停止是受审Compose项目的`stop`（保留容器）与`down`（不删持久数据），其`stop_grace_period: -1s`固定。升级不能直接运行会替换容器的up/restart：必须先走停止并核对退出/残余的显式序列。任何命令行正timeout、kill、未先停中心的daemon更新/重启或宿主关机，不是该正常控制协议，按外部中断观察与崩溃恢复验收，不冒称优雅完成。

计划维护机器/Engine的支持流程：停备份timer→Compose stop→等服务端实际退出→检查容器ExitCode与中心诊断（非0先处置，不能把Docker CLI返回0当应用clean）→维护Engine/宿主→显式重新启动中心→完整体检→恢复timer。等待过程中操作者中断Docker客户端也不代表中心已停。此流程是应用部署的使用前提，不修改EC3 S59的正常关闭保证，也不承诺控制整个操作系统关机；未遵循步骤的强制终止必须保持已确认业务事实，备份结果/隔离残余如实呈现。真实故障与优雅停机不得共用成功判据。

重新启动策略改候选`unless-stopped`，不同时设置宿主中心服务管理器；宿主systemd仅调度备份。按官方语义及待完成隔离daemon探针区分：

| 事件 | 本方案期望 | 当前证据/待验 |
|---|---|---|
| 进程非预期退出（0或非0），服务未明确停止 | Engine可重新拉起；不以复起证明上次clean | 新策略实际探针待验；启动失败循环不隐藏，部署检查须限时报告失败，停止由operator执行 |
| 操作者Compose stop后应用exit0 | 保持停止；daemon重启不恢复 | 新策略与隔离daemon探针待验 |
| 操作者Compose stop后应用exit1 | 同样保持停止；单独报告未clean | 新策略的exit1分支待验 |
| 运行中Engine/宿主被外力终止，未走正常维护流程 | 可能强杀；重启后按Engine状态及应用guard恢复，不保证旧在途效果 | 隔离daemon机制+真实产品故障矩阵分别验 |
| 备份timer到期但服务已停 | 只exec失败并可见，不启动 | 正式部署验收 |

R1 reviewer对on-failure跨daemon复活的具体推断不直接采纳：官方明确on-failure不随daemon重启恢复。改变候选的原因是启动责任完整性与停止状态保留，并非把错误推断升级为依据。有限启动重试不是EC3的新增业务保证；若最终要求自动封顶，必须选择能执行该策略的生命周期owner，不假称unless-stopped具备次数上限。尚未完成这个策略的评审与原型，不允许实施默认无限重启作为既定结果。

### 宿主主体与持久目录

容器应用默认固定非root UID/GID10001；部署允许显式选其他正整数UID/GID并准备同属主目录，0不在受支持配置。镜像代码只读可遍历；服务无privileged、无Docker socket挂载、无宿主PID/network共享、只发布业务TLS端口。

执行Docker CLI的宿主运维者/备份unit需要访问该Docker Engine；在rootful Engine下这相当于宿主管理权限，不能宣称其为无特权账号。应用进程仍是非root。PF017已把机器和部署材料交给运维者，Docker采用不增加任何账号治理操作；rootless Engine暂不声明支持。timer的Docker exec不覆盖user，沿服务UID调用ops。

受支持的一份数据目录整体挂载到`/state`，默认库`/state/data/center.sqlite`，备份`/state/backups`，离线工作`/state/offline-work`、隔离输出`/state/restores/<独占目标>`。持久集合包括db、-wal/-shm、源.owner-lock、升级guard/快照及其辅助文件、备份封装/发布元信息、维护.quarantine/永久隔离标记、离线工作/恢复根与全部祖先。具体guard文件名由原provider拥有，部署不得筛选仅复制db。

只声明宿主本地Linux文件系统上的完整目录持久挂载；NFS/CIFS/远程卷、DockerDesktop共享文件系统只作开发观察，不作为磁盘耐久接受。目录要在启动前由明确运维步骤创建并核属主/0700；不在应用启动时以root递归chown任意路径。配置与TLS/部署密钥在另一只读挂载，按原0600规则。

服务与离线工具均挂整个`/state`祖先，不能单独挂隔离根之下的明文文件或子树、不能用软链把隔离祖先隐藏后作为源。正当的部署配置仅允许该固定布局；任何自定义挂载不自动受支持。发布前检查Compose实际config/inspect挂载与规范化宿主来源，不只验证示例YAML。负例必须证明受支持安装入口会拒绝不符合的布局；不能仅在文档写禁止却把任意路径模板作为已验交付。恶意Docker管理员可突破文件边界，不在应用隔离保证内；普通误配置不能靠此排除。

### 命令、健康与升级

沿公开host CLI，不跨包调用私有ops代码。镜像entrypoint为exec形式Node24.21.0运行`app/dist/cli.js`，默认serve；单独的maintenance profile消费相同镜像，只挂完整状态目录及显式输入，不挂serve密钥/证书、不开放端口、不设置重启。verify/restore必须显式命令/参数；不默认启动第二中心。

Docker健康探针只调用已有`ops full-health`，并要求reachable/storageReachable/clockSane/deploymentKeyPresent/deploymentKeyComplete均严格true、defectCount为0；JSON不合形或取不到结果即探针失败。以私有socket读取，不复制HTTPS或Schema业务路由。probe有自己的读取时间界，失败只标记unhealthy，不停/起/重启服务；正常停止中不答也是预期失败。禁止用backup-status充作健康探针。具体脚本走公开CLI、限定超时/输出上界并清理自身子进程，健康策略配置及默认值待施工单固定。

备份timer沿D055每小时only-if-due，不用up/run/start；持久补漏仍让中心判20/24小时边界，定时触发不等于完成。ops客户端在服务收尾时可能失去结果，timer失败或unknown不得被手册描述成服务备份必然失败；下次backup-status确认实际状态。不自动重试未知结果。

升级序列：验证镜像来源与摘要、离线`--version`核BUILD_ID→停timer→正常停中心并核实际退出/残余→固定新image引用→启动并查公开/完整体检→恢复timer。升级自动化在检查窗口失败即停止流程并给出诊断，不能自动旧镜像重启新schema。新镜像启动失败或维护残余必须显式停住再按guard事实处理；旧image与离线校验版本保留，不通过prune清掉。健康/升级失败的自动重启交互仍需最终生命周期策略评审。

日志消费应用原JSONL；Engine记录器选择带容量边界的local驱动或明确json-file轮转，参数列为部署配置，不新增业务日志副本。容量与备份保留由运维负责；不承诺任何日志/监控路径不占磁盘。PID1无OS子进程的现状一旦改变，重新核对子进程回收，不拿worker_threads证据外推。

### 未解除的接受门

R2还不是施工输入：unless-stopped矩阵/启动失败重试策略、受支持Compose包版本、镜像平台digest、安装前配置验证及健康策略具体值须收口；Fable R1的B1/B2需定向复评。不得因为negative grace探针通过就忽略这些门。最终Linux真实产品与独立QA仍后置。
