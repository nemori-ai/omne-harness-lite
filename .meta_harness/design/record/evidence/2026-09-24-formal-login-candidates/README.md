# 登录候选模型运行 · 2026-09-24

本次只是机制候选的有限模型证据，未接受生产契约。当前输入与原始结果见 [run-5](run-5/results.json)，语义/映射/范围归[模型说明](../../proposals/governance-production-mechanisms/models/README.md)。独立架构评审核对输入与日志，未重跑；原两项证据阻断在有限模型范围内闭合，SQL 精化尚未完成。

| 执行 | 结果与限制 |
|---|---|
| run-1 | 首轮 TLA 表达式缺括号导致变量未赋值，退出 75；不能作性质证据 |
| run-2 | 误用了此 TLC 不支持的参数，退出 1；未执行检查 |
| run-3 | 修正启动后正例 0、负控 12；时间比例与当前要求不一致，代际标志还有假绿风险，已被后续修订取代 |
| run-4 | 时间比例修成 Idle=2、Absolute=16；原子 lifetime 正例 2481 distinct、6256 generated，无反例；旧代际标志仍有评审缺陷，不能闭合代际性质 |
| run-5 | 三个正例无反例；三个负控分别触发 NoRevival、NoStaleIssue、NoObservedRevival，均退出 12。CredentialRevision 改从签发快照/代际事实推导，新增提交窗口/观察者模型 |

## 复现环境

官方 TLA+ v1.7.4 [发行物](https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar)，SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`，TLC 2.19（2024-08-08，rev 5a47802）。下载 jar 至复制出的运行目录，按 run.py 调用。证据不内置二进制 jar。

本机缺可运行 JRE。实际使用已有 Docker 本地 image ID `sha256:e091a9e923255f077d7103ca424cc29c79c701c82df53ccd894d9ad555758750`（codex-universal，OpenJDK 25.0.2），不是声称此 ID 是可拉取的 registry digest。容器网络关闭、单 worker。复现可用同版 JRE/TLC；应另存新 run。launcher-failure.log 保存第一次把本地 ID 误作镜像 manifest 的失败。

CHECK_DEADLOCK=FALSE；只检查给定有限状态空间中的安全性，没有进展/公平性、多账号/多登录、真实 SQL、密码、TLS、断电或备份保证。LoginCommit 未证明精化 LoginLifetime；SQL 的所有观察路径与事务失败必须另行取证。不得从有限检查升级成无条件证明。
