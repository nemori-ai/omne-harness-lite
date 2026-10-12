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

## 驱动接口及组合义务

SessionDriverStartup／Control及policy属于[共享SPEC](../SPEC.md)的施工承诺。
类型／policy校验只证明形状和界值，不证明启动、唯一执行、排空或关闭。
完整构造及实际组合义务由[本机提供者](../../../session/session-runtime-local/verification/README.md)维护。
共享定义不选择具体Model／Tool或Root资源，也不通过事件授予推进权。

每个提供者须检验坏配置、启动部分失败、撤除期间晚到control、依赖换代、原pending续关及两个实例不互撤。
plugin拥有并传入启动signal；root持原真实依赖直到closed，signal终止不等于物理执行取消。
这些动态轨迹不在SessionWork内，不从有限公平进展推导实际Clock、Storage或依赖必然可用。

## 有限机制探针


```sh
python3 packages/core/session-runtime/verification/models/probe_transactions.py > tmp/session-agent-runtime-phase1/verification/transaction-probe.json
node --experimental-strip-types packages/core/session-runtime/verification/models/probe_cordis.ts > tmp/session-agent-runtime-phase1/verification/cordis-probe.json
```

先创建输出父目录。SQLite程序验证简化同事务回滚、锁内当前判断和唯一execution owner约束；不实现公开provider端口，不证明生产迁移、并发调度或当前权限。Cordis程序解析本树kernel-basis的官方依赖，观察两个独立Context的事件／撤除／故障及inject换代。原执行句柄是受控对象，不能当成真实模型／工具组合证据。

最终提供者须补真实StorageUnit参加、两个Session／tenant、独立执行服务在途保持、bridge撤除／代际、未知commit／ACK、pending close及资源排空。跨节点升级必须取得等价协议证据。上述运行输出只进工作树tmp，不在包中保留历史日志或原始结果快照。
