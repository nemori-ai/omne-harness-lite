# 有限登录与凭据代际模型

本目录约束 [身份行为](../../SPEC.md) 的有限安全性质，不证明真实 SQL 精化。

| 模型 | 正配置 | 负配置与精确预期 |
| --- | --- | --- |
| LoginLifetime | valid.cfg | bad-admission.cfg：NoRevival 反例 |
| LoginCommit | commit-valid.cfg | commit-bad-observer.cfg：NoObservedRevival 反例 |
| CredentialRevision | revision-valid.cfg | revision-bad.cfg：NoStaleIssue 反例 |

每组正配置还核 AbsoluteBound 或 OldLoginInvalid，具体输入以 cfg 为准。模型一个账号、一个追踪登录、一次签发与一次改密，单位 30 分钟，Idle=2／Absolute=16／MaxTime=18。关闭死锁检查，仅有限状态安全性，不含公平性／进展。

Stage 仅解释最终成功操作；暂存至提交窗口的观察者共用保护是前提。LoginCommit 没有证明精化 LoginLifetime。多账号／多登录、组织授权、SQL、密码学、重启耐久及异常提交仍需实际验证。

从本目录执行 `java -cp /opt/tlaplus/tla2tools.jar tlc2.TLC -workers 1 -config <cfg> -metadir <工作树tmp目录> <模型>.tla`。正控须 exit 0，负控须 exit 12 且命中指定性质，工具错误或超时不是有效反例。原始运行输出不入 Git。
