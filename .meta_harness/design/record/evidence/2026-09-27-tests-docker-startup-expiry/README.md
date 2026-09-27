# Docker 启动健康观察过期

root 接受运行 `20260926T211719Z-bfa58421` 的有限结果：启动健康观察过期后，正式 helper 请求一次正常 TERM、等应用真实退出，且 **start 仍返回失败**。依据为 [D-071](../../decisions/governance-docker-stop-adoption/decision.md) 与 [Docker 映射](../../../realization/apps/tenancy-host/docker.md) 的启动失败收场绑定；前序正常停止和换镜像另见[对应运行](../2026-09-27-tests-docker-recovery/README.md)。

产品源码 `f8f286c95cb9458fe3173190edbeab6076339b08`；最终 I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`，helper SHA256 `71ba9f3c31b34c171dd2a4048d9e249af31f7948abcf66ee603da5ffb7d1b365`，host BUILD_ID `7547343852a07540fc171c8914711aa81d16815e9b2d0df6facc955154fd5616`。macOS arm64 宿主上的私有 Linux Engine29.1.3／Compose2.40.3，root 控制宿主，应用 UID10023/GID10024；没有操作宿主 Engine 生命周期。

[原始包](raw.tar.gz) SHA256 `e135c82e848822c1add124f4b7e2d4277a4359a6ddd6bacec2807e5dd98ee857`，[逐件摘要](files.sha256.json) 共 257 件。原实际清单 SHA256 `2859ddaa3013e9ab9f3afd89d974c6b614cbefc0b4f5387588930b284d0000c5` 的 254 件均由 root 逐 hash 复制并复核；副本中冻结 oracle 独立复跑退出 0，root 另读 start/status/事件原文，归档后再核 tar 内字节。大镜像 tar 不在本包，只保存其身份、摘要和导入核对。

唯一实际运行中，QA 镜像只增加 `/probe/qa-health-delay.mjs` 和精确 NODE_OPTIONS；原镜像与 QA 镜像的完整 `/opt/omne/app` 文件、目录、链接、模式和内容摘要相同，BUILD_ID 未变，原 Healthcheck.Test、Entrypoint/Cmd/WorkingDir/User 保持。probe 只在原 `health.mjs` 进程中用活跃 event loop 挂起，在 serve 中不挂起；实际读取 probe 源 SHA、root:root、0444。QA 注入不是生产配置，也不是让应用超时被 KILL 的新机制。

12 秒 startup-wait 是测试观察预算，health interval/timeout 为 1s/2s、start period 1s、retries 1。实际 `c-start` 返回 1、stdout 为空；stderr 顺序为 center-start-request、startup-observation-expired、term-request、同 CID stopped/exitCode0/clean:true。真实 inspect 为同 CID exited/0、RestartCount0；health 为 unhealthy，记录两次 ExitCode=-1 的健康探针超时。事件原文恰一次 start、一次 signal15 的 kill、一次 die(exit0)，无再次启动。helper status 保留同 QA image、BUILD 和退出事实；应用正常退出没有把启动失败改成成功。

state/data 仍为原 inode 的私有 0700 目录，业务库为应用 UID/GID 的非空普通文件；实际库模式为 0644。本项不擅加业务库或空协调锁独立 0600 的承诺；私有目录、隔离 marker、任务明文各自的要求仍按所属契约检查。容器、目录和诊断均在业务判断时保留，随后才执行夹具清理。独立查询本次唯一标签的容器、卷、网络全空，六个创建名称均不存在。

固定输入摘要 `ac3c45ce1d169a8190ae26dfd35e897083010e260c9c877e7ad7a9a976d0d6d3`，driver SHA256 `7bc75da6ecb6bcacd773dad5b7dd3785a141f1197e0ee984eedf10bc6b12a6e4`，oracle SHA256 `71db19a6f6e3ffc8e6b25d2fb23c2b706a75d6e046e21514d1de6a33b631b967`。1 个合成正例、18 个负例及 preload 两分支仅验证测量器。实际外层 driver 与冻结 oracle 均退出 0，属于有限通过。

本轮不覆盖慢迁移中的强杀／回滚、Engine 存储损坏、调用者失联、无界时序保证、原生 amd64、timer 停复链或公司部署；不声称完整 Docker 交付完成。
