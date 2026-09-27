# 已确认错误停止在私有 Engine 重启后的保持

root 有限接受 v2 单次运行 `20260926T222210Z-bc6e365e`：正式 helper 确认应用错误停止后，重启保存原元数据的私有 Engine，中心仍保持同一容器的 exited1；隔离标记与残留文件保留。依据为 [D071](../../decisions/governance-docker-stop-adoption/decision.md) 与 [Docker 装配](../../../realization/apps/tenancy-host/docker.md)。本轮接续已有 exit0 重启观察，不能替代非计划进程崩溃验证。

产品源码 `f8f286c95cb9458fe3173190edbeab6076339b08`，I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`，原 helper SHA256 `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`。环境为 macOS arm64 上的私有 Linux Engine29.1.3／Compose2.40.3，应用 UID/GID10001。QA preload 仅制造真实 export FileHandle 的关闭失败；完整应用文件、链接和 BUILD 与制品一致。源码没有为测量改动。

[原始包](raw.tar.gz) SHA256 `c5ea910188da7a3610b6b3723096185d40456531308eebb7ec91440631ffdf5d`；[逐件摘要](files.sha256.json) 共719件。root 核对两轮完整实际清单、复制原件，在 v2 副本独立运行冻结 oracle 退出0，并直接检查正式停止、Engine 重启、11次中心状态观察和隔离文件。归档字节再次核验；镜像大文件按原输入摘要引用。

| run | 结果与解释 |
| --- | --- |
| v1 `20260926T221034Z-c8346777` | 原 driver/oracle 失败保持不变。正式 helper 的错误停止已发生，但私有 DinD 停止后的 Mounts 数组顺序变化，被测量器错误判成绑定变化；尚未取得完整重启结论。330件实际清单 SHA256 `18931ac1dd40443a334604ee65faaf5b032a2f9f81e982ffb7f2680d436ce262`。其后为了清理而启动 DinD 不算恢复验收。 |
| v2 `20260926T222210Z-bc6e365e` | 修正测量器后另行单次实跑，driver/oracle0，root 有限接受。385件实际清单 SHA256 `110c0da66b7058bcc8e5e100007048972bc94196101c77516ed582bffab30220`。 |

v2 按唯一 Destination 对比每个挂载的全部字段，同时拒绝重复、缺失、额外挂载和错误来源、权限、卷身份；不排序改写任何 raw。卷的 CreatedAt、Mountpoint、labels 也逐项一致。1个正例、43个反例是测量器检查；用新比较函数检查旧 raw 只是诊断，不把 v1 改判为通过。

实际 helper 返回退出1、`stopped-with-error`、`exitCode:1`、`clean:false`。中心 CID `2cf545823bc8423db223ee2c20d8b8f1347c0d36a6d85fef13f8f811f633c6fa`，StartedAt `2026-09-26T22:22:31.8819605Z`，RestartCount0。在同一私有 DinD 显式重启后及随后10.131762459秒的11次观察中，这些身份和 exited1 状态都未变。私有 DinD 的实际停止包含 TERM 后 KILL，不称为 Engine 优雅停止；应用已先由正式 helper 确认结束。

前后隔离根保持0700；残留文件保持设备/inode/属主/模式 `65025:239802:10001:10001:600`。永久 marker 始终为同一 regular file、`65025:239794:10001:10001:600:16`，原内容不变。没有重开应用或删除隔离标记来修复结果。全部业务观察完成后才清理；独立唯一标签查询容器、网络、卷皆空，六个精确资源名不存在。

v2 输入摘要 `6182fba1b2dbb2647a935f2e0606012e795cbab84aa48c536f55adc3249fca05`，driver SHA256 `e1b97a4de3bd23079b4baec4c942f2cd5ef90ca1107a5f3712cac15d1a9e7141`，oracle `dadd60f57ae9f7b6563cab3d06b765d30f7060c03eb09db5c5993f574f161cb3`。结论限于健康存储、停止意图已确认、没有并发关闭干扰的这次 Engine 重启；不包含遗失确认、非计划崩溃、任意时序、整机断电或完整 Docker 交付。
