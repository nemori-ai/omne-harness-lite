# Run、Step、执行权与控制验证范围

本主题没有独立 Run 模型；状态关系由 lifecycle 与 RunDriver 模型部分覆盖。RN-05 严格终态门已有独立用户接受依据；本候选澄清 execution exposure 与派生 scheduler barrier。旧模型不覆盖 settled unknown、A stopping+B running、supplement/C 阻断、hold 独立解除或错代证据。

正文为条款级重基候选，旧执行结果、review、publication 与实现接受不进入新 baseline。
本轮只通过设计树 internal gate、来源哈希和依赖映射；候选接受、真实组合测试、形式工具运行
和 release evidence 仍是独立门。provider 事实见本主题入口所列映射。

新结构链固定 Run owner effect-free prepare + CC submit-time owner guard：每 epoch 唯一 close、已关闭只引用、
consumer不得写 Run facts；latestIssued/openEpoch/executor 分离；reacquire/resume 总发行 successor，force-stop
terminationIntent 硬拒。RN-03 只以同 execution identity/generation/fence 的 quiescent 或 verified isolation
关闭 exposure，业务 `settled(unknown)` 不满足门。`9a58ae2` 已拒绝；形式线须按新 exact commit 重建并执行。

DR/CC revision 与 publication 同步验证：首次 created/issued/state.changed 共用一个 Run append/revision=1，
随后 expectedRunRevision=1 成功而 =3 冲突；同批相对引用在 canonical commit 后解析为最终 eventId。
恢复 publication 等全部 required owner roots 同水位安装，旧 host/owner 代确认不清门；旧 blocked
completion 保持原样，新代 lookup 只能在 baseline 覆盖且当前资格/墓碑/inspect 通过后报告可消费，
不能自动重发外部 attempt。
