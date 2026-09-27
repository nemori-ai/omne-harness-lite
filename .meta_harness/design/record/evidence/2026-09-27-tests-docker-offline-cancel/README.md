# Docker 离线维护的 handled TERM

root 接受运行 `20260926T211738Z-9212fcbe` 的有限结果：已确认身份的离线 verify helper 收到 TERM 后，对实际任务发一次 TERM，持续等待真实收场，原工作根排他与资源不提前释放。依据为 [D-071](../../decisions/governance-docker-stop-adoption/decision.md)、[Docker 离线映射](../../../realization/apps/tenancy-host/docker.md) 与 [storage-sql 维护工作根](../../../realization/packages/infra/storage-sql/maintenance.md)。本结果不包括 helper SIGKILL／调用者失联或不同工作根并行。

产品源码 `f8f286c95cb9458fe3173190edbeab6076339b08`，最终 I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`，host BUILD_ID `7547343852a07540fc171c8914711aa81d16815e9b2d0df6facc955154fd5616`，helper SHA256 `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`。运行于 macOS arm64 上的私有 Linux Engine29.1.3／Compose2.40.3，应用 UID/GID10001，控制宿主 root；没有使用用户主 Docker socket。

[原始包](raw.tar.gz) SHA256 `1f3d608a323c67165ba85c420675f866cc9d8042c6da9af06cb32a7bb2ffead6`，[逐件摘要](files.sha256.json) 共 1482 件，含四轮原始工具、输入、配置、进程与 FD 身份、stdout/stderr、退出码、判定和资源清理。root 分别逐 hash 保全四份实际清单，最终副本冻结 oracle 独立复跑退出 0，另直接核 cancelled/busy/status 与工作根原文；归档后再次核 tar 内字节。大镜像 tar 不在包内，仅保存已验证身份与摘要。

| run | 结果与后继修订 |
| --- | --- |
| `20260926T205730Z-1836ef3e` | 控制容器没有外部 ps，身份探针 rc127，尚未发送 TERM。253 件原件保留；后继改为已有 Node 只读精确 helper PID 的 proc cmdline、direct children 与子进程 cmdline。 |
| `20260926T210533Z-631c1011` | 已观测真实 helper/wait CID、FD、marker，但控制容器没有外部 kill，发送前 rc127。278 件原件保留；后继只改用 Node 对已核 PID 同步 process.kill(SIGTERM)，异常不吞。 |
| `20260926T211021Z-0a5cae66` | 实际 TERM、等待、busy 与取消结算均发生，但 oracle 误要求空协调锁为0600，给出 unverified；实际锁为0644。326 件原件保留。root 核现行映射：0700 属于私有父／工作根，0600 属于 marker 与任务明文，协调锁未另定0600；root 承认并纠正该误加条件。 |
| `20260926T211738Z-9212fcbe` | 新工具记录锁的实际模式，额外直接核工作根持有期／结束后的0700与同设备/inode。driver 0、冻结 oracle limited_pass，root 独立复跑通过。最终实际清单含619件（包括明确标注的旧轮反事实诊断副本），旧三轮原结论不改。 |

原中心以正式制品生成真实备份，然后正常停止。离线 QA image 只增加 `/probe` 与 NODE_OPTIONS；原应用全部文件、链接、BUILD 与制品清单相同，实际入口不替换。gate 只拦本次工作根内真实 `task-…/snapshot.sqlite` 以 wx/0600 打开后的首次 FileHandle.writeFile；工作根由原提供者建立，不预造无 marker 根。它是句柄处的可控挂起，不是物理 I/O 故障。

测试用 pidfile+exec 取得**内层 helper** PID，再以真实 `/proc/<pid>/task/<pid>/children` 及原始 NUL cmdline 确认其 direct child 正等待精确 CID；maintenance-created 本身不充当已核身份的证据。对该 PID 发送一次同步 TERM，私有 Engine 事件实际记录同任务 signal15。事件观察后 31.509571667 秒，helper 仍 pending、没有结果 stdout；同 CID/PID/FD/设备/inode 保持，真实临时文件0600。原制品启动的另一独立 CID 使用同工作根，实际返回 busy/exit2，未替换旧任务。

释放 gate 后，原任务实际返回 `{"status":"cancelled"}`、退出 2，helper 同样返回原结果/2；maintenance-status 按同 CID 读回 exited/2 与原 outputText。原 source 封装 SHA 未变，任务临时明文在实际收场后消失。工作根持有期与结束后均为同设备/inode、10001:10001、0700；永久 marker 同身份、0600、准确内容保留。空 owner lock 的0644只是观测值，不提升为接口保证，也不代替真实 busy/排他证据。

v4 driver SHA256 `93583cbd96d9bc7c89e7a1b71116eba76f26ba02e9f045ea05faa5ddd9a74c05`，oracle `5234da7f66883fd4796d603ec7f97cd40a734e5d9f458eb6178a363a9648a90b`，输入摘要 `aae6ff516fdab912e7358a4796886166a1eb208b209e33f84aa0945ce0821edc`。两个合成正例和32个反例仅检查测量器。只松开旧错误 mode 判据的旧 raw 副本运行是**反事实诊断**，不使 v3 成为通过；v4 新工作根 stat 必须依靠本轮实际采样。

各轮先固定业务判定，再清理夹具；独立宿主按唯一标签查询容器、卷、网络均空，六个创建名称均不存在。此有限接受不覆盖 caller SIGKILL／网络失联、不同工作根并行、旧 Engine 请求晚到、跨 daemon 恢复、物理断电或完整 Docker 交付；在线备份客户端可提前返回结果未确认的规则，也不能替代本轮 handled cancellation 的真实等待。
