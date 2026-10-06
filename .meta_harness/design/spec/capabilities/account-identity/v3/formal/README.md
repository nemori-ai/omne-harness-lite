# AI v3 有限行为模型

本目录是 D-040 接受规范的有限行为表达；正例登记为形式任务，负控为有效性核对。来自机制提案 r3 的精确模型字节；既有执行证据可按输入哈希核对复用，但 SQL 精化仍未验证。

| 条款 | 模型与配置 | 性质与负控 |
|---|---|---|
| S-48/49/53 | LoginLifetime.tla，valid.cfg / bad-admission.cfg | NoRevival/AbsoluteBound；回填准入时刻负控应检出 NoRevival |
| S-49/51/53 | LoginCommit.tla，commit-valid.cfg / commit-bad-observer.cfg | NoObservedRevival/AbsoluteBound；绕过观察保护负控应检出 NoObservedRevival |
| S-15/50/53 | CredentialRevision.tla，revision-valid.cfg / revision-bad.cfg | NoStaleIssue/OldLoginInvalid；取消签发代际重核负控应检出 NoStaleIssue |

一个账号、一个被模型追踪的登录/一次签发和一次改密，时间单位30分钟、Idle2/Absolute16/MaxTime18。CHECK_DEADLOCK=FALSE，仅检查有限状态安全性，无公平性/进展声明。Stage 仅对最终提交成功的操作作线性化解释；暂存到提交窗口的所有观察者必须共用保护。LoginCommit 未证明精化 LoginLifetime。

不得将单账号有限模型视为多账号/多登录/组织授权、真实 SQL、重启耐久或异常提交已验证。S-53 的这些提供者义务另需测试。
