# Engine 停止请求的返回值与人工停止标记

2026-09-27 核对 Moby `docker-v29.1.3` （peeled commit `fbf3ed25f893e6ce21336f1101590e40a13934f4`，主线另以 git ls-remote 核 tag）的六份原始源码，[归档](../sources/2026-09-27-engine-stop-source.tar.gz)及[hash](../sources/2026-09-27-engine-stop-source.sha256.json)。归档 manifest 给每文件官方 URL／SHA256。这是静态控制流观察，不是实际竞态复现，也不是实现采用。

- `daemon/stop.go` 的 ContainerStop 在 IsRunning 为 false 时返回 NotModified；内部 containerStop 又有一次 IsRunning 判定，false 时可直接 nil 返回。两条早返都没经过发信号逻辑。故仅一次调用前 running 样本、stop 命令成功和调用后 exited 样本，不足以推出这次请求走到了人工停止标记路径。是否可在具体系统交错复现，仍待实验。
- `daemon/kill.go` 的 ContainerKill 对显式非 SIGKILL 信号走 killWithSignal：持有容器锁、GetRunningTask 成功后才继续；正常 TERM 会调用 ExitOnNext，在 daemon 不处于 shuttingDown 时置 HasBeenManuallyStopped。已无运行任务的分支返回错误，没有 stop.go 的 NotModified 早返。成功返回只完成发信号路径，**不等待进程真实退出**。
- 同处 CheckpointTo 失败只记 warning，未作为 API 失败返回。因此 API 成功不是无条件的元数据耐久证明；并发 daemon shutdown 也跳过上述人工标记。原正常操作测试不覆盖这些故障。
- `daemon/update.go` 改 restart policy 后调用 UpdateMonitor；`daemon/internal/restartmanager/restartmanager.go` 的 SetPolicy 只替换 policy，不取消已在等待的 timer。由此不能只凭改成 no 就断言此前安排的重启已撤销。
- `daemon/monitor.go` 在普通可重启退出时置 Restarting；不可重启时置 Stopped。重启尝试本身失败也会置 Stopped。所以上述“调用前 running 到调用时 stopped”不是仅由一份 stop.go 就证明可达，需要连同 monitor、daemon 状态与失败前提核对。

上述观察暴露了“进程已退出”和“这次人工停止意图被执行”的不同证据要求。它不说明所有 docker stop 都不可靠，也不推翻已实测的稳定运行正常停止／跨私有 daemon 重启正例。普通 I/O 正常、没有并发 daemon 管理的前提与实际故障范围必须跟着结论一起引用。
