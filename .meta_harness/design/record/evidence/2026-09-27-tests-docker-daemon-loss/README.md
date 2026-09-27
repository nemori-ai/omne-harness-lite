# 私有 Docker Engine 意外退出后的治理恢复

root 有限接受运行 `20260927T023116Z-f00f3c2f` 的完整观测及独立追加复核：一次私有 Engine 非正常退出、显式恢复同一 Engine 后，原治理中心自动恢复；已确认治理事实、先前备份和未完成备份的隔离残留保持。依据为 [Docker部署映射](../../../realization/apps/tenancy-host/docker.md)、[D071](../../decisions/governance-docker-stop-adoption/decision.md)与[EC3维护契约](../../../spec/compositions/governance-center-entry/v3/contract.md)。原判定器失败保留；追加复核不是新产品运行。

产品源 `f8f286c95cb9458fe3173190edbeab6076339b08`，I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`。macOS arm64 上的私有 Linux Engine29.1.3、Compose2.40.3、Node24.21.0；应用UID/GID10001。测量器由独立于产品实现的 Sol xhigh 执行者编写，root静态审核、核固定输入和离线自检后亲自运行。QA镜像保留原应用完整清单与RootFS前缀，只增加真实export FileHandle门和首次装门、后续pass-through的代际记录；公开打开拒绝探针使用原最终镜像。

运行先通过公开CLI确认账号、组织、当前租户，并完成一份备份；第二份备份持有真实export FD和一份受0700工作目录、0600权限、永久标记保护的SQLite快照。工具核确切外层DinD容器、标签、三个完整挂载及卷记录后，仅对该DinD发送一次SIGKILL，记录真实exit137，再显式启动同一个DinD。没有向内部中心发start/restart/kill来促成恢复。

外层CID `28897b6f2279852f31dab287892b958da3ed6d7a9a9fcd8e3edca76e1bee3617` 保持，进入新PID命名空间。内部中心CID `9f6b722cc9a68ac5f24ea501a91ed08b8e7fb9280aa7220a3d7c82cd0c6dfad0`保持；StartedAt由 `2026-09-27T02:31:56.721023463Z` 变为 `2026-09-27T02:32:37.706824926Z`，PID1079变为321，新Engine记录该中心start。跨Engine生命周期的RestartCount实际仍为0，不将它误要求为加一。随后至少10秒稳定观测、完整健康检查、公开治理事实与先前备份描述符均符合原判据。

原在途客户端退出255、stdout为空，结果保持未知且没有重放。实际快照 `task-53996cffcb53b30d9d478bce26bc2a2d/snapshot.sqlite` 的SHA256在故障前、恢复后及打开拒绝探针后均为 `27b14c92ccfbaf6ae7a7c0a0484e7a85bcd60926fc3424f4d0206fc5e24cda2c`，属主、权限、文件身份与永久标记不变。原镜像serve带完整state祖先及正常只读secrets/settings、无网络或公开端口，指向该实际快照，真实以storage-open隔离错误退出1。

## 原失败与追加复核

原工具完成192条命令并清理，但原oracle退出1：`frozen input differs: io_driver.py`。运行内输入复制列表和输入哈希字典均未包含这个辅助文件，oracle却要求它存在。该文件已由执行前独立static-manifest绑定，root在启动前验证全部候选文件与来源；执行后字节仍一致。不是通过向旧run补文件解决。

新的独立复核工具仅替换这条不存在的运行内冻结项：改核原static清单、候选辅助源码、root执行前核对、gate、实际调用与执行后清单的来源链；其余行为断言原样执行。32项检查给出 `limited_pass`，新结论为 `limited_pass_reassessment`。原446个运行文件前后逐件哈希一致，原exit1及原stdout不变。root另行阅读关键事件、健康与残留记录，独立调用同一复核工具得到相同结果；接受范围仅为本次完整原始观测。

原副本清单SHA256 `4f34f0ae0f3e96c0ee70f772aca84b99bab3cbfb1bba6ddd5c22c84b89a9be90`。工具保留运行来源绝对路径断言；本记录不声称任意搬迁后的副本可不调整路径直接重放。原始包、逐件摘要与root复核结果见同目录文件。业务观测之后才清理；root独立查询三类标签和六个精确资源名，全部不存在。

本次只覆盖固定版本、保留Engine元数据和状态卷的同schema恢复窗口；不包含物理断电、磁盘损毁、任意Engine元数据丢失、升级迁移中断或原生amd64硬件。宿主Engine本身没有被停止；私有DinD的重新启动由测试执行者明确触发，不声称自动恢复宿主Docker服务。Docker整体交付仍待最终Fable评审与root接受。

[原始运行及追加复核包](raw.tar.gz) SHA256 `ef935608aa3844ec4f5712f29c3bcd334d45960dc5c74044506f10cb214d6dc0`；[逐件摘要](files.sha256.json)共484件。最终复核工具SHA256 `6d3630a9094f54a3dcc32314ee9d5453c06e5b6228997588fec1b2c0887fee09`；root最终只读复核结果也在包内。
