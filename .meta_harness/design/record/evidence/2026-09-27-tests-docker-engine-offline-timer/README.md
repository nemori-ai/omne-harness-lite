# Docker 不可达时的定时备份

root 接受运行 `20260926T213838Z-7479ff7a` 的有限结果：真实 systemd timer 在私有 Engine 不可达时触发，service 明确失败，没有启动 Engine 或中心。依据为 [Docker 映射](../../../realization/apps/tenancy-host/docker.md) 的定时备份绑定与 [D-071](../../decisions/governance-docker-stop-adoption/decision.md)。这是已有正常备份、已停中心定时任务验证的补充，不是完整 Docker 交付结论。

产品源码 `f8f286c95cb9458fe3173190edbeab6076339b08`；最终 I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`，helper SHA256 `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`。macOS arm64 上隔离的 Linux control/systemd252、私有 Engine29.1.3、Compose2.40.3；中心使用非插桩最终 arm64 镜像，UID10023/GID10024。没有操作用户宿主 Engine 生命周期。

[原始包](raw.tar.gz) SHA256 `5f134e26ab9acfde3a5496ed93a938b797d0764fcda04befe7da36d4676f6c2e`；[逐件摘要](files.sha256.json) 共293件。实际清单 SHA256 `a7cdaba0a9ffcdc23770b308621deab07f7f5523ef96b17d91847692b4e29695` 的290件由 root 逐项核对、复制；副本冻结 oracle 独立复跑退出0，另核 service、timer、journal、Engine事件与前后 inspect。归档内字节再次核验。大镜像 tar 不包含在包内，保存其摘要及实际导入核对。

正式 helper 先 validate/start/full-health/status，再正常 stop；同 CID 独立 inspect 已是 exited0 后才停止本次私有 DinD。control 的 service/timer 文件与最终制品逐字相同，仅测试 timer drop-in 改为 OnActiveSec=2s、Persistent=false。观察预算90秒涵盖此 systemd 调度窗，不是生产调度时限保证。

真实 LastTrigger 从空变为 `2026-09-26 21:39:04 UTC`，ExecMainStartTimestampMonotonic 从0变为269965466341；service 实际 `Result=exit-code`、`ExecMainStatus=1`、`ActiveState=failed`，journal 恰一次 `omne-center: engine-unavailable`。运行时依赖未加入 Docker、containerd 或中心启动依赖。先取得终态再停 timer，没有 reset-failed 或写入重试。

离线观察前后同一 DinD ID 为 exited、StartedAt 不变，事件没有 start/restart。本轮外层 Docker stop 私有 DinD 的记录包含 signal15 后的 signal9，因此只称 Engine 不可达，不声称 DinD 自身优雅停机。中心在此之前已正常停止，不能把这个夹具动作当成对运行中中心的强杀验证。

所有离线观察及 timer 停止完成后，夹具明确启动原私有 DinD 以便检查及清理；这不是 timer 自动恢复。原中心仍为同 CID、exited0，StartedAt 与 RestartCount0 均未变。实际 helper status 同样报告该容器的退出事实。独立按本轮唯一标签查询容器、卷、网络皆空，六个创建名称均不存在。

输入摘要 `1c1b649688789f6c413eebc11a95e22a1248cdf6617cb7b9bf689e5bad00e556`；driver SHA256 `128f1ff67b5a95193123bec56d0316961c80eb7ec247552452278149ad562833`，oracle `d667fe8ee98af03810932b09ca67d9fac99ea740dcc84c1365fb435ec42484bd`。1个合成正例、17个反例只验证测量器。本轮不证明运行中 daemon 故障后的业务恢复、调用者断开后的备份结果重取、物理断电耐久或公司部署；未使用新模型请求。
