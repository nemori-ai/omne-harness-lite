# R5 S-B Engine stop-intent 实验 · 2026-09-27

状态：**主线已核对原始事实与归档；这是有限机制研究，不是产品实现验收**。六次私有 Docker Engine 实验均在分支 `pandazki/agent-work-loop-docker-stop-intent`、HEAD `06ab4fc0df9c0b947e176fabf0c61bdb979b6dc6` 上按各自放行范围执行，均保留原始 `commands/`、`result.json`、当轮 oracle 和 manifest。所有实验使用唯一 `omne.r5.stop-intent=<run-id>` 标签，只操作私有 DinD、私有控制容器和其卷；不重启用户 daemon。归档中的 `runs/` 是原件逐字节副本，逐件 SHA-256 在 `SHA256SUMS` 与 `provenance.json`，不是根据最终结论改写的样本。

## 输入与可恢复性

固定 Engine 为 Moby 29.1.3 commit `fbf3ed25f893e6ce21336f1101590e40a13934f4`，私有 DinD image ID `sha256:20cca7e2a7da287ded85087ce88d443a5347163eebf6a9ed0c27bc4cabe90ae7`；控制镜像 ID `sha256:825773f9776113d54fb23a5de9511d5b6c7bc7550d891f7a3584bfe71c0795f6`；内层 BusyBox 1.37.0 image tar SHA-256 `39986e21f0fa8fface4e8c16b0ecf138573e1f0b2b9efe6cecc99a8c40f86045`。镜像 tar 因可重建且体积较大未收入归档；固定 ID、tar hash、原始 Docker 版本/镜像检查和官方源码快照均保留。归档包含 [固定 Moby 源码](https://github.com/moby/moby/tree/fbf3ed25f893e6ce21336f1101590e40a13934f4)、[BusyBox 1.37.0 源码](https://busybox.net/downloads/busybox-1.37.0.tar.bz2)、V4 镜像层的 mount→BusyBox 身份报告、Linux 挂载文档及输入任务书；源码推断与实机结果各自标明。

| 实验 | 原 run manifest SHA-256 | 当轮 driver/oracle 的归档位置 |
| --- | --- | --- |
| 正常矩阵 `20260926t171722z-ac6580ef` | `03468e21e1d313c67ceeaac367f527b900cf7e99a45f4293ba3df794c0633acc` | `versions/run-20260926t171722z-ac6580ef/{driver,oracle}.py` |
| 定向 waiter `20260926t173506z-f2c17715` | `87dcc4f8f46dd51853f5a5c53372967e98cbfd6dbca33ee2408d47dea6a19111` | `fixtures/{driver,oracle}.py`；`revisions/waiter-only/change.diff` |
| metadata V2 `20260926t174526z-67f932e6` | `744b91a62421e57bef0b27a312249f590fca0c82d092e46d10ba20472d92e31c` | `versions/metadata-fault-v2/{metadata_fault,metadata_oracle}.py`；共同 `fixtures/{driver,oracle}.py` |
| metadata V3 `20260926t175815z-65b5a7f4` | `475c856fd071c3c250f767960c6e88e0b19ec95b5f0eb23fedac773e98e1d025` | `versions/metadata-fault-v3/{metadata_fault,metadata_oracle}.py`；共同基础 |
| metadata V4 `20260926t181326z-6c67c09c` | `736b499e451d3393f0da641e88362abb277acfd64e24a1483f0118a46669aac4` | `versions/metadata-fault-v4/{metadata_fault,metadata_oracle}.py`；共同基础 |
| metadata V5 `20260926t182346z-52057f0c` | `5cb17d7b2bd423c5ae5adf49c5eacf36b39c56cf39152341749bed3a95882a78` | `versions/metadata-fault-v5/{metadata_fault,metadata_oracle}.py`；共同基础 |

每个版本的精确脚本 SHA 见对应 run manifest 与本包 `version-map.json`。`revisions/` 同时保存 waiter 和 metadata 各静态轮次的 diff、离线自测与静态 manifest。`pid1-gate.sh`、`lossy-proxy.mjs`、通用 `driver.py`/`oracle.py` 均在 `fixtures/`。运行时 `result.json` 中记录的原绝对路径供来源核对；迁移归档不声称在新目录无需重写路径即可运行 Docker。

## 正常矩阵：整轮失败，五格限定观察保留

正常矩阵只执行一次；driver exit 1、`experiment_failed`，原 oracle `failed_observation`。它的 **2 个有限时长 gate** 分别在 TERM 后仍运行且 waiter pending `32.214s`/`32.066s`，释放后实际退出 0/1，私有 daemon 重启后仍停止；这只覆盖观察窗口与本 fixture，不证明无限期不重启。**1 个 restarting 窗口**在真实 `Restarting=true`、重启计数 2 与同 ID create 回放后获 TERM API 204；捕获的请求期间/受理后 start 均为 0，daemon 前后 inspect 均 exited、exit 17，oracle 给 `limited_pass`。事件流跨 daemon 断开，后半段靠 inspect 而不是连续事件证明。**1 个已退出样本**给 stop API 304、TERM kill API 409、CLI stop rc0/kill rc1，不推断向已退出进程实际送达信号。**1 个丢回执样本**给上游一次 HTTP 204、调用端 curl rc52/无回执；后续真实退出 0，调用端结果仍 `unknown`。**第 6 格 waiter** 当时的测量器要求外层客户端非零 rc，实得 rc0/空 stdout，且 release 后退出未测，故失败；五格事实不能把失败整轮升级为通过。全部原始事件、命令和失败快照在 `runs/20260926t171722z-ac6580ef/`。

## 定向 waiter：调用端断开，不等于应用退出

单独放行的定向运行只补 waiter 一格，没有重跑前五格。TERM API 204 后，`docker wait` 仍 pending，应用 inspect 仍 `Running=true`。被发送 SIGTERM 的 PID 属于**宿主机外层 `docker exec <私有 DinD> docker wait ...` 客户端**；该外层客户端随后 rc0、stdout 空，未给合法数字 exit result，调用端结果维持 `unknown`。本证据**不证明 DinD 内层 `docker wait` 进程也退出**，也不能推广为直接调用原生 helper 的返回行为。之后释放 fixture，另一份 inspect 确认应用实际 exit 0；定向 oracle 为 `targeted_waiter_observed`。正常矩阵原失败与此定向观察并列保存，不合并成一轮 pass。

## metadata 注入递进：四轮各有边界

- **V2**：同 namespace 的 `/var/lib/docker` 挂载虽是本轮 named volume，实测 `rw shared:22 master:1`；传播前提不满足，安全预检拒绝。57 条命令，无 bind、TERM 或 release，checkpoint 未测；oracle `failed_observation`。
- **V3**：精确私有 DinD 中非递归 `mount --make-private /var/lib/docker` rc0，同 mount ID 317 保持 `rw`、无 shared/master。其后复合 bind/remount 命令 rc1，报 `/proc/mounts` 找不到路径；没有中间挂载快照，不能证明 bind 状态。无 TERM；oracle `failed_observation`。
- **V4**：拆开的 bind rc0，mountinfo 新增精确 metadata mount ID 269 `rw/private`，`/proc/self/mounts` 同路径 rw。BusyBox `mount --version` rc0/空输出触发了过严的诊断门；`mount --help` 实有 v1.37.0 能力文字。双路径 remount、TERM 和 checkpoint 均未执行；oracle仍 `failed_observation`，bind 的实证不等于整轮成功。
- **V5**：仅修正诊断门后单次实跑。精确 bind rc0，目标 mount ID 269 从 rw 到两参数 remount 后 `ro/private`，父 mount ID 317 仍 `rw/private`，mountinfo 与 `/proc/self/mounts` 一致；**TERM API 204 后观察到应用仍 Running=true/Restarting=false**，同一日志行同时含确切 ID、`error checkpointing container state` 与 `read-only file system`；独立读取 `config.v2.json` 中同 ID 的 `HasBeenManuallyStopped` 在前后均 `false`。独立 oracle 19/19 检查成立，限定结论 `limited_checkpoint_failure_observed`。这是 **ACK 后 checkpoint 写盘失败、旧旗标仍在** 的反例；没有应用 release、没有 daemon 重启，也没有证明随后恢复行为或跨 daemon 持久性。更没有并发 shutdown 注入。

每轮唯一标签下的私有容器/卷均在原日志中记录清理，V4/V5 有另一次独立 exact-label 空查询；V2/V3 与正常/waiter 各原运行目录也保存了独立空输出。清理可核，但它不扩张各业务观察的适用范围。正常 gate 的私有 daemon restart 带 `--time 10`，私有 fixture 的 cleanup 可以强制删除；“应用 gate 未用 SIGKILL”不能泛化为整个实验绝无强制终止。

## 缺失或不可由现存原件恢复的输入

- 大型可重建的 DinD/control 镜像与内层 BusyBox image tar 未随包复制；保留了精确 image ID/tar SHA 与检查记录。若缓存消失，归档本身不能提供二进制镜像或保证重新拉取的 tag 相同。V4 离线镜像层事实 JSON 和固定 BusyBox 上游源码已入包，但已排除 364 MB `docker image save` 原 tar。
- 正常矩阵第六格的 release 后真实退出在**该轮**未执行；定向 waiter 是另一次运行，不能补造为原轮结果。现存原件不能判定内层 `docker wait` 进程是否随宿主外层客户端断开而终止。
- metadata V3 复合命令之间没有 bind 后快照；V4 没有 remount 后快照或 TERM，因为 remount 未发出。V5 没有 release/daemon 重启后的存盘状态与恢复轨迹。
- 固定 Engine 上并发 shutdown 的确定性 `IsShuttingDown` barrier 未获得，未做该负例；未验证正式产品 helper、跨 daemon 恢复或 R5 采用。源码与 fixture 不能替代这些缺失的运行事实。

## 归档及主线复核

[原始证据包](../sources/2026-09-27-stop-intent-evidence.tar.gz) SHA256 `034a60ccfdc8561b51c9a86ce80436e397f95ece35bba8fbad2257673c5467e6`，601文件；包内SHA256SUMS列600项。主线逐件复算包内内容与原manifest，并独立重跑V5 oracle及读取TERM、挂载、磁盘旗标和同行warning原件。独立spec-reviewer另核76份V5文件及表述，没有执行Docker或oracle。六轮结果保持各自输入与失败身份；采用归[D-071](../../../design/record/decisions/governance-docker-stop-adoption/decision.md)，不是本报告替实施/QA签字。
