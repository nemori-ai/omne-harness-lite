# 当前读数 · 2026-09-26 R1

当前受测版本能把Compose的`stop_grace_period: -1s`传成Engine的`Config.StopTimeout=-1`。默认`compose stop`和`down`在TERM后16秒仍等待；释放夹具门后完成。两秒停止期限的负对照却在约两秒后强杀为137，说明夹具能够区分强杀与真实释放后退出。依据为[实验P1–P3及负对照](evidence.md)。

官方Engine CLI说明`--timeout -1`表示不设等待超时；Compose的负duration传递由本轮实际配置/inspect/进程观察补足。16秒观察不是无限时间证明，也未覆盖Engine进程死亡、DockerDesktop退出、宿主关机或运维者显式覆盖timeout的路径。`down`已删除容器，实验只能用独立跟随日志证明看到释放，不能补造事后inspect退出码。

`on-failure`在非零退出后重启一次；显式停止后12秒仍停且RestartCount不增加。官方文档同时明确它不随daemon重启自动启动容器。因此它与带宿主开机启动关系的systemd `Restart=on-failure`不等价。`unless-stopped`及隔离daemon重启另需实验，本轮没有结果，不将on-failure结果外推。

成本与局限：无限等待允许进程永久停在stopping，不能宣称有停机时间上限；强制杀进程仍可越过优雅路径。所有文件系统与uid映射的产品性质、源库保锁、在线备份、定时器不启动中心、健康判据仍没有由本实验验证。镜像/Compose测试可以复现机制，不证明任何现有应用已经正确接入。

## R2：隔离 daemon 重启 · 2026-09-26

隔离的Engine29.1.3/Linux arm64完成一次干净daemon stop/start，四格分别通过：未明确停止的unless-stopped容器恢复为新进程；主动stop且应用退出0/退出1的两格均仍停止，StartedAt、RestartCount、ExitCode不变；原先运行的on-failure对照没有随daemon启动。运行容器的StartedAt与/proc/1/stat启动时刻均改变，不能只凭Running=true认作新进程。[本轮原始输入与结果](sources/2026-09-26-daemon-stop-probe.tar.gz)记录四格独立判据与清理。操作者没有重启用户实际Docker daemon。

这是固定版本、一次干净重启和有限观察的restart manager事实，不是异常daemon SIGKILL、宿主断电、Compose组合或真实应用收场验证。内层daemon由具名DinD容器承载，与生产宿主的文件系统/关机路径不同，不能补齐产品验收。

此前失败轮没有改写为通过：[测量失败原件](sources/2026-09-26-restart-measurement-failure.tar.gz)在非零退出后读到Running=true、Status=restarting、Pid=0与旧StartedAt，错误地提前结束等待；该轮尚未执行daemon重启。修正后独立测剩余停止/重启矩阵。这个反例说明restart计数或Running单字段不足以断言启动完成。

## R3：配置原值、私有 tmpfs 与离线文件

同一Engine29.1.3/Compose2.40.3下，[运行输入探针](sources/2026-09-26-runtime-input-probe.tar.gz)的两个非root UID格各运行一次：raw env中的单`$`和双引号在Engine Config.Env及进程内保持，显式environment覆盖同名项；tmpfs分别为10001:10001:0700、10002:10002:0700，匹配UID可写，另一UID拒绝，mount选项含nosuid/nodev/noexec。独立maintenance文件在没有serve.env时完成config/run，所属项目只有maintenance容器。自己的三个项目均清理，未pull或改主daemon。

首轮在任何容器创建前误把config输出的`$$`转义当作运行原值，测量器拒绝；原件保留。成功轮从原始Compose文件运行，Engine和实际进程值单独检验，不以配置序列化自证运行正确。固定版本的有限观察不背书真实产品健康/权限/维护行为。
