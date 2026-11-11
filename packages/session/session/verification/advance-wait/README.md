# C2 的等待与重试

本模型补充 [控制传播模型](../control-propagation/README.md)的等待边界。一个原 attempt 的等待分为采样、计时、重读和结束。停止信号在采样与计时期间均可到达，时钟不必最终答复。

初态保留原 operation，重试次数为零。只有 elapsed 能进入重读，重试不换 operation，次数不超过 MaxRetries。Stop 不写业务终态。停止后的本地完成只依赖 Cancel 的弱公平性，不依赖时钟回复。晚到时钟不能被解释为这次已取消等待的 elapsed。

| 模型 | 实现及守护 |
| --- | --- |
| Sample、Cancel、Elapsed | scheduling.wait 在采样前登记取消，处理答复前再核信号，完成后移除监听器 |
| Retry、Exhaust | advance 的有限退避、原 attempt 重读、次数耗尽诊断 |
| OriginalOperation | invoke 与 bounded-close 复用原身份；unknown 重放固定请求 |

正控固定 MaxRetries=2，检查类型、安全不变量及 CancelProgress。三个负控分别忽略取消、跳过等待和替换原 operation，须违反对应具名不变量。运行命令如下，日志目录必须尚不存在。

```sh
python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py \
  packages/session/session/verification/advance-wait tmp/session-wait-tlc \
  --jar "$TLA2TOOLS_JAR"
```

该脚本是仓库验证设施复用，不形成运行时成员依赖。它记录输入、工具哈希及退出码，使用一个 worker 和有界堆。

这是有限抽象，不是源码精化证明。它把推进权重读及本地继续视为一个动作，没有建模存储提交、跨进程通知或未应答的 Agent RPC。实现仍须由原端口核资格；通知丢失只能在下一次时钟到期后重读。取消本地等待不证明物理取消外部工作。多会话相互隔离和下一轮的实际可用性由 Session factory 回归与控制传播模型共同验证。
