# D-071 · 采用 Docker R5 停止控制绑定

2026-09-27，主线按用户“自己设计和架构、由 Sol xhigh 编程、负责验收 review 并决定接受”的授权，接受 [S-B](../../proposals/governance-docker-deployment/stop-r5.md) 及[完整受审 R5](../../proposals/governance-docker-deployment/docker-r5-reviewed.md)（SHA256 `9916ba6b4b7be0d03238acac3f50b02b9282890772981b0f9de05912a71ae887`）。独立 architecture/spec 评审及故障验证范围处置归[review](../../proposals/governance-docker-deployment/review.md)。根源、固定源码和实际有限实验见[研究报告](../../../../research/governance-docker-runtime/reports/2026-09-27-stop-intent-experiments.md)。

## 精确选择与取代

只取代 [D-070 Docker R4](../core11-integration-coordination/decision.md#docker-r4)承接的三处具体绑定：中心显式 stop、启动观察失败的收场、具名单次维护的取消／手工收场。D-070 其他范围及原合并前本支 D-067 原文保持，不取代上游格式化件 D-067。当前节点／验证和 PF017 projection/v7 与本决定同步，精确文件由 [provider-snapshot.json](provider-snapshot.json)固定。

- 两份固定 Compose 均显式 SIGTERM。中心 create 后/start 前核实际 Config.StopSignal=SIGTERM 与 StopTimeout=-1；离线保持唯一具名 Compose run，核固定配置及实际创建结果，不改成 create＋start。
- 对已核确切 ID 的 running/restarting 中心发一次显式 TERM 请求，再无限 wait；完整合法退出码必须与同一 ID exited／ExitCode 相符。请求 ack 仅为受理，CLI rc0、空结果、观察矛盾或失联均不能宣布完成。应用0才 clean，非0 stopped-with-error；保持 containerId/exitCode/clean 表示。初始 exited 返回 stop-intent-unconfirmed／非零，不先启动来制造停止意图。
- start 失败仍按同一路径等待真实收场，事实写 stderr，start 始终非零。单次维护 restart=no，已真实完成可按原输出结算；未核 ID 不发信号；可处理的 Ctrl-C／SIGTERM 在已核 ID 后请求正常终止并继续等真实结束，取得完成事实时按实际结果结算。只有调用者离开／失联或结果丢失导致完成不可确认时保持 unknown，保留资源，不自动重放。

原业务 EC3／HT3、同一属主、正常无限排空、隔离恢复及禁止强杀兜底不改。健康元数据存储、无并发 daemon shutdown／外部管理，是 Engine 人工停止标记跨计划 daemon 重启的前提；helper 不能自动检测全部前提失效。clean0 只指观察到应用成功退出，不能解释为无条件的 Engine 标记耐久证明。

## 选择理由与实际观察

固定 Moby29.1.3 `fbf3ed25f893e6ce21336f1101590e40a13934f4` 的 stop 可能在 restarting 早返；显式非KILL signal 路径更贴合请求正常终止，但 checkpoint 失败只记 warning，并发 shutdown 有跳过标记分支。S-B 没有隐藏这两项限制。S-A 的事件关联可避免换请求路径但引入额外生命周期；S-C 可透传 checkpoint 错误是真优势，但策略更换不消除已排程重启；当前不增加第二重启管理者。

正常实验分别观察 exit0/1 持续排空超过31秒、实际wait/inspect相符且计划私有daemon重启后保持停止；已退出 stop API304与TERM409、restarting收到TERM204后的有限无复活窗口、丢回执调用方unknown均原样保留。该正常整轮末尾等待者夹具失败，不能称整轮全过。后续定向等待者实验发现被终止的外层 host docker exec 客户端可rc0而stdout空，应用仍活着；不证明内层 wait 进程已退出。

metadata V2/V3/V4先导分别被传播隔离、复合挂载命令和无关version诊断守卫拦住，未执行目标TERM，均保存失败。V5在精确私有路径完成只读bind remount后，TERM API204、PID1收到信号且仍held，原磁盘 HasBeenManuallyStopped=false，同一日志行记录该容器checkpoint只读错误；主线核76件manifest并重跑19项oracle、对关键raw独立读取。它证明 ack 不蕴含标记成功持盘，不证明跨daemon结果或产品恢复。

并发shutdown特定分支仍未实测。独立架构复核确认当前外部观察点无确定屏障，主线已接受以固定源码及明确未测范围处置该项；不把竞态描述成不可达。未放宽业务持久性或产品最终故障验证。

## 施工与验收边界

准许 I2 worker 基于原 ac4c3f82 与当前整合基线修订 helper、两Compose、手册及有意义反例测试；root验实现，独立QA验最终两架构制品／Linux真实组合。必须重验实际应用长IO排空、close残余与第二owner、初始exited/restarting、空wait/失联、start失败、离线取消竞争、timer不复活与完整治理旅程。旧I1机制及产品先导不冒充新helper/I3结果。

新增deploy文件改变BUILD_ID，整合后重新生成各架构归档、镜像和manifest。Fable仍按整体目标、架构、实践与证据复审，然后主线接受；本决定不是交付完成。若在支持前提下真实退出后跨daemon复活，或helper把未知报成功，返回候选和对应owner，不能删除反例。公司DNS/TLS和独立灾备继续保持原未验边界。
