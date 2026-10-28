# 当前波队列模板

本模板只列当前正式波及后一波预案。规则归[滚动规划](../../../../docs/engineering/map-reduce-states.md)。

- 当前正式 R(w)、F、plan revision、owner/epoch：<精确引用>
- 当前交付 roster：<各 active 线、预期请求/任务、期限、结果/处置>
- 全部存续线 delta roster：<active/idle/terminal 与父卡；含轮空线>
- 当前串行写入：<唯一候选、request/head/base、待完成 operation>
- 后一波预案：<暂不建卡的目标、依赖、消费者影响及待验证假设>
- 接受前物化：<实际下一波任务、R(w+1)、全部 delta 的读回引用>
- 下一等待：<supervise 绑定及未处置积压；空队列不表示完成>
