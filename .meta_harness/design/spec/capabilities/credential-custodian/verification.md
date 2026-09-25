# 验证覆盖与实际证据

`capability.credential-custodian` v1（candidate）的证据义务与执行状态。本文件可更新，位于规范版本目录之外；
结果始终绑定实际规范、模型与实现修订。

**当前状态：全部义务「未开始」。**没有实现，没有执行过任何场景；**形式模型写了、没有运行**。本页不含任何通过记录。

## 证据义务

### 形式工件

| 条款与性质 | 模型与配置 | 前提 | 状态 |
|---|---|---|---|
| [S-18](v1/contract.md#s-18-清扫) 第 1、2 条：`GrantedResolvable`（绑定 `granted` ⇒ 记下的条目还在） | [`Sweep.tla`](v1/formal/Sweep.tla)，主配置 [`Sweep.cfg`](v1/formal/Sweep.cfg)（formal task `credential-custodian-v1-sweep`）；去保护配置 `Sweep_Validity_SweepNotGranted.cfg`、`Sweep_Validity_StaleCompletionTime.cfg` 须各给出反例 | 每个动作对它所碰的绑定原子（＝在绑定上排序，装配给）；同一时间源、读数不回退；`CompleteFreshTime` 是桥一侧的前提 | **未运行**：本次起草没有给定工具链，模型与配置未经 SANY 解析、未经 TLC 检查 |
| [S-18](v1/contract.md#s-18-清扫) 第 4 条：`OrphanEventuallySwept` | 同一模型，主配置；去保护配置 `Sweep_Validity_NoSweep.cfg` 须给出反例 | 每条条目上 `Sweep` 的弱公平性（本能力在场、存储与绑定读得到）；**上界 `sweepInterval` 不在模型里** | **未运行** |
| 两个探针（`granted` 可达、丢弃可达） | `Sweep_Reach_Granted.cfg`、`Sweep_Reach_Discard.cfg`，须各被反驳 | 同主配置 | **未运行** |

**运行方式**（登记在 `registry/formal-tasks.json`）：`${JAVA_BIN} -cp ${TLA2TOOLS_JAR} tlc2.TLC -metadir tmp/tlc/credential-custodian-v1-sweep -cleanup -noGenerateSpecTE -workers 1 -config spec/capabilities/credential-custodian/v1/formal/Sweep.cfg spec/capabilities/credential-custodian/v1/formal/Sweep.tla`（工作目录 `.meta_harness/design`）；去保护配置与探针换 `-config` 即可，它们不登记为 formal task。

### 规范场景

| 条款与性质 | 场景 | 证据形式与前提 | 状态 |
|---|---|---|---|
| [S-12](v1/contract.md#s-12-storereplica)、[S-13](v1/contract.md#s-13-readreplica) 离线用副本；`absent` 与 `unavailable` 分开 | [S-22](v1/contract.md#s-22-离线用副本)；[examples §1](v1/examples.md#1-副本写读离线按登录状态清除) | 验收装配：切断中心连接后调模型（cli 验证入口 M47 第 ①、② 条的这一半） | 未开始 |
| [S-6](v1/contract.md#s-6-据点隔离与按登录状态归属) 第 1 条据点隔离 | [S-23](v1/contract.md#s-23-另一个账号的据点读不到)；[examples §2](v1/examples.md#2-据点隔离与加密落地) | 同一台机器两个账号两个据点；另把落地内容拷过去再读（cli 验证入口 M47 第 ③ 条） | 未开始 |
| [S-15](v1/contract.md#s-15-discardloginstate) 只删归属它的 | [S-24](v1/contract.md#s-24-登录状态结束副本随之清除) | 集成测试 | 未开始 |
| [S-16](v1/contract.md#s-16-depositoauth)、[S-17](v1/contract.md#s-17-resolve) 待生效不交出、五种 `notResolvable` 不分、读不到是 `unavailable` | [S-25](v1/contract.md#s-25-oauth-条目待生效时不交出granted-才交出)；[examples §3](v1/examples.md#3-oauth-条目收下交出清扫) | 对真实存储的集成测试；**故障注入**（绑定读失败） | 未开始 |
| [S-7](v1/contract.md#s-7-加密落地) 加密落地、密钥取不到即 `unavailable`、打不开按「没有」并留记录 | [S-26](v1/contract.md#s-26-加密落地) | 以已知原文逐字节扫落地内容；**故障注入**（密钥取不到、条目损坏） | 未开始 |
| [S-8](v1/contract.md#s-8-秘密与引用只在各自那一个问法里出现) 秘密与引用只在各自那一个问法里 | [S-27](v1/contract.md#s-27-秘密不出本契约) | 哨兵扫全部返回、失败值、工程记录与日志（cli 验证入口 M47 第 ④ 条）；另加静态检查：`readReplica` 只许模型档案读提供者解析，`depositOAuth`、`resolve` 只许 MCP 桥 | 未开始 |
| [S-18](v1/contract.md#s-18-清扫) 清扫与完成交错、有界 | [S-28](v1/contract.md#s-28-清扫与完成交错) | **必须真跑并发**；按装配给的 `sweepInterval` 计时；前提：两边同一时间源 | 未开始 |
| [S-10](v1/contract.md#s-10-失败值) 失败值闭合与判定次序 | [examples §4](v1/examples.md#4-每个失败值一个反例) | 每个失败值一个反例 ＋ 三条次序回归例 | 未开始 |

### 由别处承担、本契约只写明要求的

| 要求 | 由谁承担 | 本契约位置 |
|---|---|---|
| OAuth 条目与绑定共有一个排序点（同一存储、同一约束域） | 提供者与桥的装配（桥节点 R-B5、C-1～C-3） | [S-19](v1/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行 |
| 完成时过期按排到之后的时刻判 | `capability.mcp-bridge` 的提供者（桥节点 C-3 与 `completeOAuth` 那一行） | [S-18](v1/contract.md#s-18-清扫) 第 2 条；模型的 `CompleteFreshTime` |
| 取值问法只许具名消费者解析 | 装配与静态检查（模型档案目录节点 MPD-N4 那一类） | [S-19](v1/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 3 行 |

## 实际执行

**尚无。**形式模型未运行（见上）。

## 结果与反例

**尚无。**

## 变化的影响

- **2026-09-25 起草**：首版，无旧证据。
