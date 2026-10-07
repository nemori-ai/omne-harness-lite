# SessionWork 的有限验证输入

本目录属于待接受的 Session 协调设计，不是已接受契约登记，也不表示实际产品已通过。模型与正负配置共同维护，单次配置、运行输出和反例留执行工作树 tmp。

`SessionWork.cfg` 使用两个输入、两个 Run、一个原调用与至多两个 attempt，检查 AdmissionConserved、SingleActive、NoOldIssue、NoStaleFinish、ResultsAttributed 和 WorkEventuallyClaimed。FairSpec 只为 StartOrAdopt 假设弱公平。

- `HalfAccept.cfg` 应产生 AdmissionConserved 反例。
- `OldIssue.cfg` 应产生 NoOldIssue 反例。
- `StaleFinish.cfg` 应产生 NoStaleFinish 反例。

使用本工作树配置的 TLC，分别选择对应配置运行 SessionWork.tla，逐项核对真正失败的性质。语法失败、超时或资源缺失不能算负控命中。

SingleActive 只检查单指针，不证明真实存储没有第二个未终结 Run；ResultsAttributed 只检查原 Run 已创建，不证明完整租户或费用归因。模型不证明真实多 owner 提交、无限追加进展、SQL 公平调度或网络恰好一次。完整责任归 [验证正文](../../verification.md)。
