# 相同完成意图被拒绝后的等待

Session 可以拒绝 Agent 的条件终结。Agent 重读自己的事实后，若仍在 settling、Journal 修订未变且纯求值仍为同一无失败 complete 意图，应保留原候选并等待外部变化或检查时刻，不反复写新候选。

## 状态与归纳

模型只覆盖没有新输入、新失败或取消改变结论的局部路径。finishing 对应 F3，reconsidering 对应 R0 后的 I8，waiting 对应既有 F3 内存等待，ended 仅由 Journal 接受终结得到。released 表示原拒绝条件已解除，但本身不授予 Agent 结束权。

初始周期有一次尝试资格。Journal 修订不变时，拒绝后 Reconsider 必须进入 waiting，Wake 才能允许下一次尝试。Release 模拟外部责任完成并增加 externalRevision；若它发生在拒绝后的重读之前，可以立即重建候选并重试。因此对任意前缀，attempts 不超过 wakeEpoch + externalRevision + 1，候选数不超过 externalRevision + 1。只有成功 Attempt 写 ended，成功要求 Journal 允许。

本地比较只消费 Agent 的已保存状态、刚才 tryFinish 的 expected 修订和纯求值结果。该修订只在当前驱动保存；恢复后先尝试并取得当时的拒绝再判断。它不读取 Session pending，不决定何时重交输入，也不绕过 Journal。检查时刻及通知仍使用现有 waitForWake 的先观察后重读协议。它们只允许重新核对，不证明终结成立。

## 有限探索与负控

正控探索两个唤醒周期和拒绝解除的交错，检查 NoUnpromptedRetries、PreserveCandidate、OnlyJournalEnds。负控关闭拒绝后的等待；第二次 Attempt 在没有 Wake 时违反 NoUnpromptedRetries。该负控必须退出 12 并点名这个不变量。

这是有限安全性探索和局部归纳说明，不是完整源码精化或公平性证明。模型将外部责任转移抽象为一次修订变化，不含新输入、取消、跨线程和 SQL。实现的这些出口由既有终结前新输入、取消及未知操作测试补充。条件长期不解除时允许一直等待，不声称最终完成。

## 实现守护

`tests/loop-terminal.spec.ts` 经真实 coordinator 分别注入 changed 和 blocked。首次 runExecution 必须返回到内存等待，候选保持一份；等待期间 revision 不变；时钟到期且拒绝解除后，仍用原候选结束。测试注入器在第三次重复尝试时返回 unavailable，给错误实现设置有限退出点，断言必须在此前的尝试次数上判红。

从仓库根运行以下命令，输出目录须不存在。

```sh
scripts/with-test-slot.sh python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/agent/agent/verification/finish-refusal tmp/formal-agent-finish-refusal --jar "$TLA2TOOLS_JAR"
```
