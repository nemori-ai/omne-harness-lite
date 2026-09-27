# Docker 备份 IO 与关闭失败先导 · 2026-09-27

在 I1 的真实中心制品上，正常停止会等待被夹具阻塞的备份资源；关闭失败后，应用报告非正常退出并保留隔离残余。这是最终部署验收之前的有限先导，不是 I2 控制脚本或 I3 最终制品的接受。

[输入清单](inputs.json)记录 86 件原件的哈希；[归档](io-evidence.tar.gz)包含测量脚本、gate、QA 构建输入、命令原始输出、运行事件、失败尝试及判定器。归档 SHA256 为 `1b59741151fccdf67a220a6e4fc5f348abcf6513cebd031da627f4be3bffa3f1`。重复的 Docker CLI 二进制未放入归档，清单单列其哈希；完整本地副本已保全。生产镜像本体同样未置于此归档，构建输入来自 I1 源码提交 `c265bd03`，其镜像与归档摘要见清单；复跑须先取得并核对这些精确输入，不拿不同构建替代。

## 输入与方法

宿主 macOS arm64；实际应用、文件系统及属主锁在私有 Linux DinD 的独立 named volume 上运行。固定 Engine/CLI 29.1.3、Node 24.21.0、应用 UID/GID 10001，I1 BUILD_ID 为 `de6c4c19658e1f15a95614e3c6a9bde0ba13ff3673c41704f99494edcbf01a83`。QA 镜像只加 `/probe` 和预载 gate；每次启动前核对原镜像与 QA 的应用文件清单完全相同（2841 文件、115 软链）。

gate 在真实独占创建的备份临时文件上拦截 FileHandle 写入或关闭。测量器通过 `/proc/1/fd`、设备号/inode、UID/GID、0600 模式及进程身份确认资源确实仍被持有；停止请求为 exact ID 的 `docker stop --time=-1`。对照属主使用未插桩的原 I1 镜像、同一完整 state 挂载。判定器读取保存的原始命令与事件，不以测量器的完成标志作通过依据。主线复核输入哈希、关键原始输出，并复跑判定器。

## 实际运行

| 运行 ID（UTC） | 实际结果 | 能支持的结论 |
| --- | --- | --- |
| `20260926T162811Z-0f8d58d7` | ready 等待超时；首次驱动未保存失败时 inspect/log | 没有进入业务 IO；不能判断产品停止行为 |
| `20260926T164358Z-fe39d410` | 仅启动诊断：Node 37ms 后退出，`ERR_MODULE_NOT_FOUND /probe/gate.mjs` | 夹具预载失败；错误本身不能区分文件不存在与不可访问 |
| `20260926T165739Z-1a4cc537` | 原 QA `/probe` 模式0444，目标 UID 访问 EACCES；root 可核文件存在且哈希正确。显式创建0755目录后，同一 gate 在目标 UID 可读，中心 ready/full-health 成功 | 失败来自夹具目录权限；修正未改产品字节、gate 或原业务断言 |
| `20260926T171524Z-38fccdc0` | write-hold，判定器10/10通过 | 停止命令超过31.5106秒仍等待，同容器/进程持有真实FD；第二owner exit1/occupied；释放后中心exit0，备份客户端exit1且结果未确认 |
| `20260926T173249Z-b93834bc` | close-fail，判定器15/15通过 | 31.507秒后同FD/inode仍持有、第二owner拒绝；释放注入EIO后中心exit1，临时残余同inode仍在，日志`maintenance-residual`与`disposed complete:false`，客户端未报告成功 |

close-fail 中 Docker stop **命令自身返回0**，应用实际退出码却为1。这支持 [Docker 映射](../../../realization/apps/tenancy-host/docker.md)中必须单独检查应用退出与残余的义务，不能用控制命令成功代替应用收场完成。日志同时报告 controller/storage error，没有把资源关闭失败吞成 clean。

每次具名资源均按记录清理；两个成功业务运行另做独立 label 查询，容器、卷和网络残余为空。旧失败日志和旧判定器自测保留，不把后来通过改写成首次成功。

## 范围与复跑

解出归档后，从 `io-gate-prep/oracle.py` 对 write-hold 运行目录复算；从 `io-gate-diagnosis/close_fail_oracle.py` 对 close-fail 目录复算。执行新实验须按脚本中的精确镜像/工具输入和隔离布局准备环境；脚本内工作区绝对路径需指向对应输入，不能只复制一个命令就称环境一致。

本次中心 `restart=no`，无 daemon 重启；不是 R5 的显式 TERM＋wait 协议或 I2 helper 证据。关闭失败是夹具在真实 FileHandle 边界注入 EIO，没有声称复现物理磁盘故障。有限31秒观察不能证明无限等待，进程退出后的内核回收也不等于产品 disposer 成功。未覆盖强杀/断电、最终两架构制品、真实公司网络、完整 timer/升级/离线维护旅程；这些仍归最终验收。
