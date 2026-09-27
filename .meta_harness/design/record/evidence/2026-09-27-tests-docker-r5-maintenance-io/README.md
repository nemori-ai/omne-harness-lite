# Docker R5 在途维护写入与关闭失败

root 接受本轮两个有界真实场景：写入挂起时停止等待真实资源收场；关闭失败时停止报错并保留隔离残余。依据为 [D-071](../../decisions/governance-docker-stop-adoption/decision.md) 与当前 [Docker 装配](../../../realization/apps/tenancy-host/docker.md)。受测源码 `f8f286c95cb9458fe3173190edbeab6076339b08`，最终 I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`，host BUILD_ID `7547343852a07540fc171c8914711aa81d16815e9b2d0df6facc955154fd5616`，helper SHA256 `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`。正常运维证据见[前一运行](../2026-09-27-tests-docker-r5-smoke/README.md)。

[原始包](raw.tar.gz) SHA256 `bbd809919580e3e4c2df793558890b453afa35adcfad1a69330e2cb1159a1522`，1005 件原始脚本、输入、配置、stdout／stderr、退出码、inspect、事件、文件身份与清理记录；[逐件摘要](files.sha256.json)。root 逐文件复核三份实际运行清单，归档后再次验证 tar 内字节；在独立副本上复跑两份冻结 oracle 均退出 0。包内静态 README 与初次 root review 是当时快照，实际后续授权与结果由各 reviewed gate、run 元数据和本记录说明，未回写旧快照。

| run | 实际结果 |
| --- | --- |
| `20260926T200718Z-3aa15e0d` | 私有 Engine 的 legacy builder 不支持 COPY --chmod，QA 镜像构建失败，业务未启动。保留 195 件原件；后继仅改 QA Dockerfile 为 COPY --chown 后 RUN chmod。 |
| `20260926T201227Z-f72eff54` | 真实 write-hold 完成，但 oracle 额外要求备份客户端一直 pending，给出 unverified。服务端在 TERM 事件后继续持有资源 31.50963675 秒，客户端提前返回明确结果未确认。原失败不改写为通过。 |
| `20260926T202009Z-04decf5b` | 新判据下 write-hold：driver 0、oracle 25 项有限通过，root 独立复跑通过。实际 TERM 事件观察后 31.501525125 秒仍持有同一 FileHandle，释放后同一容器 exit0，helper stopped／clean:true。 |
| `20260926T202342Z-0a04662e` | close-fail：driver 0、oracle 25 项有限通过，root 独立复跑通过。事件观察后 31.50551625 秒仍持有同一 FileHandle，释放后同一容器 exit1，helper 非零 stopped-with-error／clean:false，隔离残余保留。 |

运行环境为 macOS arm64 上 Docker Desktop 的私有 Linux Engine／控制容器，应用 UID/GID 10001。正式 helper 与原应用制品保持原字节；QA 派生镜像仅增加 `/probe` 和 NODE_OPTIONS，逐项核对原镜像及 QA 镜像内完整应用文件、链接和 BUILD_ID。注入点是应用真实打开的 `/state/backups/.quarantine/export-…` FileHandle，观测真实 FD、设备号、inode、0600 与 owner；它是文件句柄处的阻塞／错误注入，**不是物理磁盘 EIO 或断电试验**。

计时起点在私有 Engine 已记录精确容器 ID 的 SIGTERM kill 事件之后，不从外层 helper 启动时刻推算。两个通过场景的中点均确认 helper 仍 pending、原 PID 仍持有同一文件句柄；使用未注入的原镜像启动第二 owner，实际退出 1 并报告 occupied。备份客户端可以已返回 exit1、空成功输出与明确 `ops result unconfirmed`，这不表示服务端资源已经释放。该判据只适用于本轮在线备份客户端；不能用于豁免已识别离线维护任务的 handled cancellation 等待责任。

close-fail 场景同时核对持有期与退出后的工作根 `.omne-isolated`：同一设备号/inode，10001:10001、普通 0600、16 字节且内容准确为 `omne-isolated/1\n`。退出后残余仍是原文件身份及 0600；真实应用日志报告 dispose incomplete。释放后的退出码来自同一容器实际 inspect，与 helper 输出分别核对。

v3 driver SHA256 `f1c4f815fa8d0e8d7260d59e0d49c08a7c60037f719880bed055f4f09ecfe646`，oracle SHA256 `7ea164d04199f5a5fee046882501c4298192df4cc598d3b16670627273bb835b`；三组合成正例与 40 个反例仅验证测量器。write 输入 SHA256 `d347a8a1d251dde244fee7be119e0fd7ddcb55c0824833a24bc8ffa26a7a4b2d`，close 输入 SHA256 `3b85f03d19d545748672a7e7858658deabbcb0ac00cdec7bc7b30f2d790068d5`。四次实际执行与各自冻结脚本均保留；最初未实跑的静态草稿曾被作者覆盖，原字节不可恢复，未采用该草稿的 hash 或离线结果作为证据。

各轮测试判断与夹具清理分开，独立宿主按唯一标签查询容器、卷、网络均为空。大镜像归档仍由制品工作树留存，本小包不包含完整二进制。此有限接受不覆盖 daemon 重启后的状态、离线取消／调用者丢失／并发维护、业务并发备份、跨 OS 治理、升级、强杀恢复、物理断电、公司部署或整机损毁灾备，不代表整个 Docker 交付已完成。
