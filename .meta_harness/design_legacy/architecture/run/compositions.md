# 组合与动作链

1. Session 接受并耐久输入，固定身份、来源与意图；队列取用与 Run 建立在 LC-04 具名同域组合提交。
2. Run 发行 epoch；RunDriver 取得当前 claim 与 WorkPermit，在每次提交前重核授权、预算、绑定和取消。
3. 模型结果先结算 attempt；工具提议形成冻结 Action。Tools 记录调用、准入与等待登记，再由真实执行 owner 接纳。
4. 需要人类时，HD 创建请求；unavailable 明确保留等待。首个合法答复结算原请求/调用，迟到答复不能复活关闭工作。
5. 调用结果形成稳定 frames 和结算事实；Inbound 裁决为 continuation/context/queue/closed，只有 continuation 同批注销等待登记。
6. interrupt/cancel/force_stop/Yield/terminal 由调用方请求、Run owner 独占准备状态与 epoch facts；open epoch
   唯一关闭，已 closed 只引用原事实。force-stop terminationIntent 禁止任何 successor，unknown 长期可见。
7. 崩溃恢复先校验完整耐久前缀并 fold 裁决视图，再裁决 accepted arrivals、查询外部 owner、重核兼容/资格；
   Run owner 的 reacquire/resume preparation 与 AR WorkPermit 联合提交才发行 successor。旧句柄、旧 AgentRef 和旧 epoch 均不复活。

跨协调域时原子行退化为耐久意图、幂等消费与回执；在这些义务被新版本兑现前，首版只承诺同一协调域。
