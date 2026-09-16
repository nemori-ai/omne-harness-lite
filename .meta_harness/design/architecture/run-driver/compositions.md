# 组合与动作链

1. Session 接受并耐久输入，固定身份、来源与意图；队列取用与 Run 建立在 LC-04 具名同域组合提交。
2. Run 发行 epoch；RunDriver 取得当前 claim 与 WorkPermit，在每次提交前重核授权、预算、绑定和取消。
3. 模型结果先结算 attempt；工具提议形成冻结 Action。Tools 记录调用、准入与等待登记，再由真实执行 owner 接纳。
4. 需要人类时，HD 创建请求；unavailable 明确保留等待。首个合法答复结算原请求/调用，迟到答复不能复活关闭工作。
5. 调用结果形成稳定 frames 和结算事实；Inbound 裁决为 continuation/context/queue/closed，只有 continuation 同批注销等待登记。
6. interrupt/cancel/force_stop 分别封闭新工作并收集物理停止事实；unknown 长期可见。安全边界 Yield 封闭 epoch，不改写 Run 状态。
7. 崩溃恢复先校验耐久前缀与到达裁决，再重建投影、查询外部 owner、发行新 epoch；旧句柄、旧 AgentRef 和旧 epoch 均不复活。

跨协调域时原子行退化为耐久意图、幂等消费与回执；在这些义务被新版本兑现前，首版只承诺同一协调域。
