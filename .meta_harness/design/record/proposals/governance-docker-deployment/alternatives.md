# 候选与取舍 · R1

必要性质归[设计正文](design.md)。三个候选都用同一个正式中心制品、单个源库属主、同一个维护协议；不以改变数据库、备份或权限语义制造区别。

| 候选 | 生命周期/调度拥有者 | 必要性质的兑现与代价 | 区分依据 |
|---|---|---|---|
| A Compose 运行中心，宿主 systemd timer 触发现有维护命令 | Docker负责异常退出重启；中心负责真实排空；宿主timer只执行已有容器内ops命令，不启动容器 | 无额外常驻应用进程；镜像不接Docker socket。Compose的正常停止必须能传无限等待，timer只exec运行中的服务；需要Linux宿主systemd作为自动备份安装前提 | 探针验证负停止时长及restart行为；系统已有timer机制，Docker exec失败及服务停机组合仍需重验 |
| B 宿主 systemd 同时拥有中心容器进程生命周期与timer | Engine禁自动重启；systemd驱动前台attach、stop及异常恢复 | 可复用既有无限TimeoutStopSec；多一层Docker客户端退出与容器退出的区别，必须处理daemon断开/attach失败、同库已有容器和重启竞争 | 只有Compose负停止配置无法成立，或单一宿主生命周期管理成为必须时才优先；新增适配复杂度尚无收益证据 |
| C 中心容器内 supervisor 加定时器，统一容器发行 | 容器内supervisor拥有中心与定时器子进程 | 宿主依赖少；新增PID1、信号转交、两个子进程收场/失败/重启所有权；备份调度与业务容器寿命耦合，容器停机期间的补漏另接 | 用户并未要求去掉宿主timer；此机制需额外依赖与生命周期契约映射，当前没有验证 |

暂推荐A：与既有单进程应用边界一致，重用现有ops/timer概念；不是因为“Docker常见”就接受。A必须先证明Compose停止映射和无业务复活的调度路径。若Compose无法表达所需正常停止，先比较A的窄部署停止工具与B的完整宿主生命周期桥，不在发布说明里暗藏一个有限强杀默认。

C不是只多一个Dockerfile指令：supervisor承担了新的收场/日志责任，因此不能在包装期顺手加入。B/C若被采用，需更新同一节点的映射而非另造领域能力。

## R4 对账后的代价比较

R1原文保留。A的当前候选为Compose固定声明/create、Engine unless-stopped唯一自动重启、一次性helper检查与停止、宿主timer只exec；精确映射归[节点](../../../realization/apps/tenancy-host/docker.md)。它比原生systemd的默认关机排序少一项便利：计划维护Engine/OS须先主动停中心并等真实退出；未遵循的中断按故障恢复，可能有隔离残余或未知结果。正常排空、已确认业务耐久与隔离恢复的性质不变。

表D自证比较：

| 路径 | 收益 | 限制/代价及本次结论 |
|---|---|---|
| A＋手动维护序列 | 不修改全局daemon或OS单元；只有一个自动重启主体；相同受审stop可用于升级/维护 | 操作者要按顺序停timer/中心；系统突然维护按故障。10人内单机首版可按主线获授权的技术采用认领这项代价，须在决定和手册明示 |
| A＋Engine live-restore | daemon短暂停止时容器可以继续，减少部分Engine维护停机 | [官方live-restore](https://docs.docker.com/engine/daemon/live-restore/)限于特定daemon升级/配置条件；不是OS重启仍保进程，也不解决完整关机排序。依赖全局daemon配置，影响其他容器；本次不改用户daemon，不能把此选项当已兑现的同义路径 |
| B＋systemd依赖/停止排序 | 可将Engine维护与OS关机编排到正常等待，复用journald/StartLimit；是B的最强论据 | Engine关闭自动重启；需实现并验证attach客户端失联≠容器退出、daemon单元停止顺序、停止期间如何查询真退出、已有容器的接管。B仍须实测，不因单元写BindsTo/After就声称保证成立。需要无人值守优雅维护时优先回此候选 |
| 只增大daemon shutdown-timeout | 延后强杀 | 有限期限不能满足现有无上界排空；不选，不当作完整候选 |

A新增的helper是一次性控制和配置检查，不常驻、不拥有业务提交；Engine唯一自动重启。重启次数不封顶与非手动退出0可重启是明确代价，start观察超时会请求正常stop但不回滚已确认迁移。宿主root调用前提同时覆盖目录检查、timer与备份导出，容器应用仍非root。工程记录在受支持重建前保存，不接受“升级即丢掉全部诊断”作为隐含后果。

R4仍推荐A。改选条件：需要把无人值守OS/Engine维护纳入正常优雅路径、unless-stopped不能保留显式停止意图、实际StopTimeout无法保持-1、或控制helper的实现/验证复杂度实证超过B。前两项机制已有限取证，产品组合尚未验；不据探针成本推导任意环境可用。
