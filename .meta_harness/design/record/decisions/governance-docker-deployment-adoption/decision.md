# D-067 · 单机治理中心采用 Docker Compose

2026-09-26，主线依据用户明确“内网部署用Docker”、后续“自己设计和架构、交GPT6Sol xhigh实际编程、负责验收review、决定是否接受”的授权，接受[三候选中的A及R4代价比较](../../proposals/governance-docker-deployment/alternatives.md)。这是一项部署技术采用，不代表用户新增了业务政策；PF017 rev5与EC3/HT3既定性质不变。R3封存在fc30a6d4；本次精确R4见[provider-snapshot.json](provider-snapshot.json)，最终受审语义稿eb798316fca41ea1ccd82d385da20aa5713225105c86d5545888fa5fbdbe8c52仅改采用状态与本决定导航后形成该快照。

## 选择与接受范围

采用Linux rootful Engine29.1.3/Compose2.40.3、固定Node24.21.0镜像索引、现有host生产闭包；Compose只提供固定声明/create，Engine是唯一自动重启者，应用负责真实排空，宿主timer只exec原维护面。两份固定Compose分别承载center与离线单次工具；不增加Cordis fiber、领域状态表或治理路由。主线施工投影为[PF017 v6](../../../product/PF-017-governance-center-as-deployable-application/projection/v6/projection.md)。

明确接受的技术代价：宿主helper/timer以root身份检查私有目录，容器仍非root；unless-stopped运行期重试不封顶，非手动停止可自动恢复；Engine/OS计划维护须先停timer/中心并等真退出，不按此序列的中断按故障恢复；健康等待超时不等于应用启动失败；支持路径重建前保存有限日志，不能恢复已轮转记录；宿主祖先预检在显式入口，自动恢复依赖挂载/祖先保持不变；helper失联后旧Engine请求终结前保持unknown，不自动重试。以上没有取消正常关闭无强杀期限、已确认业务耐久或隔离恢复保证。

同project start/stop由非阻塞flock覆盖全控制动作；锁不持有领域资格，SIGKILL释放它不说明daemon请求终结。离线任务具有独立容器身份，不因同一Compose服务名互相替换。新实现不得从一次status样本推断旧失联请求已结束。

## 理由、独立评审与依据

[评审与处置](../../proposals/governance-docker-deployment/review.md)分别保留Fable R3整体架构、R4独立架构/spec及施工计划结果。R3无结构阻断；R4把输入/目录/状态身份空白、控制竞态和离线路径歧义逐项闭合。root负责采用判断，评审意见本身不代替本决定。

[Docker机制研究](../../../../research/governance-docker-runtime/README.md)给出固定版本的负停止时长、明确停止跨daemon重启、raw env及tmpfs UID的有限事实；既有[macOS host回归](../../evidence/2026-09-26-tests-host-macos-fixtures/README.md)关闭fixture反例。A避免新增常驻supervisor或宿主attach生命周期桥，B的统一关机排序/有界重试仍是实际优点；需要无人值守优雅维护时回候选B比较，不在现有脚本暗增第二自动重启者。

## 实施与验证边界

准许按固定施工单分增量实现：镜像与健康/部署材料→控制命令与timer→重建最终两架构制品→独立真实组合/故障QA。复杂编码由Sol xhigh；验证环境与IO门由另一个verification owner生产，root复核真实组合并决定接受。新增deploy文件进入app生产清单，后续修改必须重建BUILD_ID与镜像，旧制品结果不自动迁移。

当前产品Docker源码、绑定及实际产品验证均为零；不得把机制探针或设计接受写成完成。真实备份IO超过31秒时停止等待/持锁、强杀恢复、隔离祖先负例、timer不复活、控制竞态、未知请求晚到、日志导出失败、两个离线任务并行、Mac/Linux治理、最终两架构归档都须有对应证据。amd64仿真执行只能按仿真范围报告，不背书原生硬件性能；实际公司DNS/TLS与整机损毁灾备仍未验。最终里程碑仍需用户指定的Claude Code fable整体review及主线接受。

本决定新增可选部署提供路径，不替代D055/D056正常收场或D057生产闭包，也不改原生systemd路径。catalog/frozen的55个契约版本/319资源保持；没有新契约身份或消费者版本自动升级。后续出现反例回相应owner，不能原地改冻结规格消掉部署失败。
