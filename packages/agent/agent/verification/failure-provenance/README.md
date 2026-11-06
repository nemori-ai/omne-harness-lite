# 故障来源隔离验证

一个端口调用对失败的分类不得改变其他端口或执行对同一个外部 Failure 对象的解释。Agent 自身访问被拒绝时，没有原终态或有效取消就不能据此建立 node-failed。承诺归 [Agent SPEC](../../SPEC.md#确定节点故障的收尾)。

## 归纳与边界

设 H 是对象身份到本地来源的映射。对端口返回值 e 分类时，localFailure 构造新对象 n，只增加 H[n]，不写 H[e]。对每个此前存在的对象 x，分类前后 H[x] 相同。多个分类调用各自创建新身份，其映射更新可交换。

构造、标记和返回在同一 JavaScript isolate 的同步调用内完成，没有 await，不共享跨线程内存。WeakMap 允许无引用的局部结果释放。此论证不假设外部提供者每次返回新 Failure，也不假设 Object.freeze 能阻止外部元数据。它不覆盖提供者自行改变 failure.kind 或重新取得内部标记结果。

## 模型及源码映射

模型交错两个执行的 capability 分类与 Journal denied 读取。共享端口对象用 shared 表示。每个执行的局部副本用 A 或 B 表示。TagCapability 对应 capabilityResult 调用 localFailure；ReadJournalDenial 对应 failedNode 对 Agent 访问拒绝的处理。

JournalDenialNeverEnds 禁止因共享来源污染而结束任一执行。SharedSourceUnchanged 要求共享对象仍未分类。负控 FreshTag=FALSE 改回标记 shared，必须违反 JournalDenialNeverEnds。它不是一般的 Run 收场模型，没有替代 Journal 责任闭包、资格或取消协议。

源码守护在 [loop-node-failure.spec.ts](../../tests/loop-node-failure.spec.ts)。配对场景先让一个实际 coordinator 的 selection 明确拒绝，再让另一个 coordinator 的 Journal 返回同一 frozen denied。第二个执行必须保留原访问拒绝，candidate 为空且不得 ended。未共享对象作对照。

## 运行

从仓库根复用有界 TLC 执行器。输出目录必须尚不存在。日志、工具和输入哈希留任务 tmp。

```sh
scripts/with-test-slot.sh python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/agent/agent/verification/failure-provenance tmp/formal-agent-failure-provenance --jar "$TLA2TOOLS_JAR"
```

有限探索及归纳说明不构成源码的机器精化证明。产品回归和负控分别提供实现层证据。
