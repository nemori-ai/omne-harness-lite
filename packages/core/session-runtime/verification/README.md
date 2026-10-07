# Session协调的形式验证

目标性质：受理保全、当前推进栅栏、收尾与输入竞争、有限公平进展。模型和配置是持续维护资源，原始运行日志写工作树tmp，不提交。

从仓库根设置已安装的TLC jar路径后运行：

```sh
java -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 1 -metadir tmp/session-agent-runtime-phase1/verification/tlc-positive -config packages/core/session-runtime/verification/models/SessionWork.cfg packages/core/session-runtime/verification/models/SessionWork.tla
```

负控分别用同目录HalfAccept.cfg、OldIssue.cfg、StaleFinish.cfg替换配置，并使用不同tmp metadir。正配置须完成且不违反列出的性质；三份负配置必须实际给出对应反例，不能仅以非零退出当反例。

范围：两个输入、两个Run、一个调用、最多两个attempt；抽象原子提交、可信访问和公平调度。不含真实SQL、权限、网络、队列优先级、完整Loop、原结果保管或外部效果恰好一次。
SingleActive只检查模型单指针，不能证明真实表中至多一个未终结Run。ResultsAttributed只检查原Run已创建，不能证明完整跨owner／租户／费用归因。AdmissionConserved、NoOldIssue、NoStaleFinish的去保护反例保留为配置。

真实提供者必须补事务回滚、唯一约束、当前授权与撤权顺序、持续追加进展、原IO准入及结果保管／ACK的故障组合。有限模型不替代这些义务。模型涉及的状态与生产协议建立明确映射后，才判断证据可用于哪项实现接受。
