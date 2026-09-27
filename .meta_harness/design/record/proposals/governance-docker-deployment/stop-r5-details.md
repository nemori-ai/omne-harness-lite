# R5 实施表达补充候选

尚未接受。承接 [R5](stop-r5.md) 的 S-B，明确现有 helper 的调用和观察口径，不另选方案、不增加领域状态。固定 Engine 源观察仍为前提；正常矩阵已取得部分结果，等待者退出、metadata 故障及并发 shutdown 的验证门尚未全闭合。

## 支持的信号与配置

中心固定 Compose 增加 `stop_signal: SIGTERM`；config 与 create 后、start 前的实际检查均核对应值。实际 `Config.StopSignal` 必须为 `SIGTERM`，不能只靠镜像标签或空缺时的经验默认值。应用仍是 Node PID1，处理 TERM 的设计与实现不变，`StopTimeout=-1` 与 `unless-stopped` 保持。此显式值使 Engine 非 KILL 路径的 ExitOnNext 与所发信号相符，不接受任意 StopSignal 覆盖。

离线维护 Compose 同样明确 `stop_signal: SIGTERM`，原 `restart=no`、无端口／秘密、完整 state 映射不变；实际创建结果核该值。维护进程收场仍归原工具，helper 不改变其退出码或结果 JSON。

## 中心停止与启动失败收场

沿原 project 独占锁取得确切 ID。初始 running/restarting 时，对该 ID 发一次 `docker kill --signal=SIGTERM`；请求失败、回执缺失或控制连接中断均为停止结果未确认，不能自动重发。成功只表述 Engine 受理正常终止请求，不能表述已排空／已退出／元数据无条件耐久。

随后等待该 ID 的 `docker wait` 完成，无到期 SIGKILL。CLI 退出 0 **不是**应用退出 0：必须取得一个完整、合法的退出码结果，并由 inspect 确认该 ID 是 exited，且退出码一致。空 stdout、无效或矛盾结果、inspect 不可得都保持 unknown。正常 wait 可回 0 的应用，也可回非 0 的应用；前者才是 clean，后者明确 stopped-with-error，不从控制客户端退出码推导应用状态。现有 stopped JSON 的 exitCode/clean 字段保留，不新增表示耐久确认的字段。

初始 exited 时，保留实际退出观察并返回现有 stop-intent-unconfirmed／非零，不调用 start 来制造一次新停止。其他原不支持的状态仍拒绝。不能从后来一次 exited 观察反推先前失联请求的成功，也不因锁释放而允许未结算请求的重复变更。

启动失败触发同一停止路径。最终实际退出／残余／unknown 保留在控制 stderr；start 始终非零，不能因应用最终 clean0 把启动观察失败改成成功。显式 stop 的正常结果沿原 stdout，控制元信息沿 stderr。

## 单次维护的取消

已有核过身份的独占 ID 才能发正常 TERM；创建期间只有唯一 name 或未核身份的 ID 时，沿原 unknown 报告，不重建新任务。若任务已经真实退出，可以按原退出码与工具输出结算；信号请求与退出交错时同理，以实际任务完成事实为依据，不把中心跨 daemon 的人工意图确认套到 `restart=no` 任务。

TERM 请求受理后仍等任务真正结束；调用者被终止、等待结果为空、连接失去等只表明调用者未取得完成结果。任务资源和输出保留，可按原 maintenance-status 查询。不得以清理容器代替实际排空，不自动删除工作根或重放未知维护动作。

## 采用和证据要求

新决定若接受，明确取代 D-067 的三处具体绑定：中心显式 stop、start 失败清理、具名单次维护的取消／手工收场说明。节点、验证义务、手册、固定 Compose 及 PF017 新 projection 同轮对齐。原 EC3/HT3、正常排空责任、未知不成功、禁止强杀兜底和单一 Engine 重启均不改。

R5 的健康 Engine 元数据存储／无并发 daemon shutdown 前提原样保留；helper 不声称能自动检测所有违背前提的故障。独立表达评审不替代实验、架构判断或采用。最终仍需在新 helper 与最终制品上重验真实 I/O、关闭残余、第二 owner、离线取消与正常运营旅程；I1 的有限先导不得冒充 I3 验收。

## 2026-09-27 表达评审后的来源补记

上述“现有”输出特指尚未集成的 I2 提交 `ac4c3f82645ddd6bb489d21087a54020b8b5dc24`，`apps/tenancy-host/deploy/docker/omne-center` SHA256 为 `666b73a6bfd99fac40c66b2a475aa5be810616c247415a97e8d2a4093544a0a1`：`normal_stop` 定义 stopped JSON 的 `containerId`、`exitCode`、`clean`，初始 exited 以 `stop-intent-unconfirmed` 非零返回；start 失败收场沿 stderr。这里只固定继承表示的来源，不把该实现反向作为语义权威。新采用及投影应明确保留这些表示，并把停止请求承载改为本候选所述；仍未开放实施门。
