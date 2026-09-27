# 运行中中心进程意外终止后的恢复

root 有限接受 P v4 运行 `20260927T015020Z-70f5d125`：已确认的治理事实在一次确切进程OS SIGKILL后恢复；未完成备份不伪报成功，其真实明文快照仍隔离，原公开serve拒绝打开。依据为 [Docker故障恢复映射](../../../realization/apps/tenancy-host/docker.md)、[D071](../../decisions/governance-docker-stop-adoption/decision.md)及[EC3维护规则](../../../spec/compositions/governance-center-entry/v3/contract.md)。不包含Engine本身退出或物理断电。

产品源 `f8f286c95cb9458fe3173190edbeab6076339b08`，I3 manifest SHA256 `c97c8584b0346c6c0051ca43d20737e425cb8908366fd6adcfddd6b3eda1b06e`。macOS arm64上的私有Linux Engine29.1.3，应用UID/GID10001。QA镜像只增加真实FileHandle门和一次性代际标记，完整原应用清单一致；RootFS保留完整原层前缀。首次serve建立0600标记并装门，随后各代只记录pass-through，不重新安装旧门。隔离拒绝探针使用原最终镜像。

[原始包](raw.tar.gz) SHA256 `063ab3728d5d908f03f85733baea1ee3a4067bbb28f77d37802ea0ed984aaf3d`，[逐件摘要](files.sha256.json)共876件。v4原494件清单摘要 `3d5b8c98119fd894e08098f8e49d4024f135d92126ca58055f7b97c97a875ff7`；root直接执行审定工具，独立复跑原路径上的冻结oracle退出0，再逐项核验复制与归档字节。命令来源路径作为运行输入保留，未声称改变原路径后所有命令断言仍可原样重放。

在公开CLI已确认账号、组织及当前租户，并完成一份先前备份之后，第二个backup停在真实export FD。实际找到一份受0700目录和永久隔离标记保护的0600 `task-*/snapshot.sqlite`，核SQLite头、属主和摘要。工具通过确切CID的State.Pid、原始cmdline、进程起始时刻、cgroup、PID命名空间、嵌套PID1和应用BUILD逐项核实；脚本显式复制到同一私有DinD并读回摘要，最后只用OS信号终止进程，不调用中心的Engine kill接口。

实际中心 CID `e7ad25b83d54ef051a8c0b871922d49ca5aef57ff2b3630bbfc205b69e6f0490`，PID1076、RestartCount0；自动恢复后PID1545、RestartCount1，StartedAt由 `2026-09-27T01:50:49.752281756Z` 变为 `2026-09-27T01:51:19.871399673Z`。Engine记录首die137及后继start，QA记录一次armed、一次pass-through；随后稳定观察和full-health正常，公开治理事实及先前备份描述符一致。判定器允许已有boot/clock路径多次尝试后稳定，要求事件配对、实际重启计数与代际记录相符；本轮实际只发生一次。

原在途备份结果保持未知，没有重放。快照 `task-4d0066bebf2512af96b4859332a46cb2/snapshot.sqlite` 的SHA256在故障前、恢复后及打开拒绝探针后均为 `76cc93b062ec22105ef1994396dfa838af47c53e23b467accb40dd3b7ecf5c64`，文件和隔离标记身份、权限及内容不变。独立原镜像serve在完整state祖先、正常只读secrets/settings、无网络端口下，以公开STORAGE_FILE指向该实际快照，确实以storage-open隔离错误退出1。没有补标记、绕过保护或重开旧数据。

先前 v3 实跑 `20260927T014125Z-2f6cf776` 把信号脚本复制到控制容器，却在DinD执行，退出2且尚未向目标发信号。其380件清单 `e4b95811baf2c10ee95097322b96cbd1c98e0c4443cdc67c43f350d6bb383e7a`和原失败一并保留，不提升为恢复通过。v4输入摘要 `f491206cb6d5e06aab305cc92cbc044197723c27a3ef99e9d7a418f080279227`，源工具摘要见原静态清单；2个正例、24个反例仅验证测量器。

两轮业务判定之后才做私有环境清理，root独立查询均确认三类标签资源为空、六个精确名称不存在。结论只覆盖已确认的同schema部署和这一个真实进程故障窗口，不包括未知升级迁移、任意重启次数、磁盘损毁或无条件持久性保证。
