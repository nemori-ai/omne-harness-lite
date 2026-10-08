# 治理入口有限模型

业务承诺归[公共入口](../../../../core/governance-center-entry/SPEC.md)，维护/字节与资源归[提供者](../../SPEC.md)。四模型不是完整端到端refinement，原可执行输入与scope保持。

| 模型 | 配置与义务 |
|---|---|
| EntryDecision | EntryDecision.cfg正控；readPresentationBeforeVersion/authBeforeEnvelope/inputBeforeAuth/deriveBeforePayload/gateUnavailableAsDenied/unavailableAsRejected/passthroughStateNotValid/defectAsResult八Validity负控；Validity_Reachability使用-continue，九个Never都应违反，不能只认第一反例。WF(Pipeline)/EventuallyClassified明确前提；非真实SQL、多组织优先级或字节证明。 |
| EntryCommit | commit-valid正控；bad-catch/bad-notify分别拒吞clockfailure和earlynotify。NoCommitWithoutFinalTime/ActivityWithBusiness/NotificationAfterKnownCommit/SuccessAfterKnownCommit；模型假设atomic，不证明实际SQL、touch/不复活或drain进展。含commit成立但receipt未知。 |
| ExpectedTenant | valid正控；bad-no-protection/bad-no-compare定点反控，AppliedExpected/CheckedSameCommit/RejectedWithoutEffect；t1/t2、一个业务及外切换，不证明membership、ABA或数据库实现。 |
| Maintenance | maintenance-valid及maintenance-progress正控；releaseEarly/unknownSuccess/plaintextEarly/removeProtection四负控。OwnerUntilRealEnd/ConfirmedSuccess/IsolatedPlaintext/CancelledUnpublished/EndedReleasedHandles；移除保护后Crash使deleteundo的负控不能删除。FairSpec/WF(Advance)/EventuallySettled不是dead IO有限完成保证。 |

共22cfg，配置均关terminal deadlock检查。维护模型不证明busy/单slot/workroot锁/多root并行/restore竞争、摘要/fixedfd/生产打开拒绝、5分钟/24小时/有限close。实际实现需验证入口列的真实组合。

```sh
java -XX:+UseParallelGC -Xmx2g -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 1 -config EntryDecision.cfg EntryDecision.tla
```

逐配置执行，精确识别预期性质及Safety/Temporal反例；negative非零本身不是通过。使用Validity_Reachability.cfg时加-continue核全部九项。实际输入、工具版本、输出与反例归任务tmp。
