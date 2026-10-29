# 当前波队列模板

本模板只列当前波及后一波预案。滚动规划归[负责人状态](../../../../docs/engineering/map-reduce-states.md#2-滚动规划与逐收口等待)，收口顺序归[集成清单](../../../../docs/engineering/map-reduce-states.md#收口顺序)。

- 当前波：<波号、收口卡 R(w)、F、计划修订>
- active 线：<各线父卡、任务卡、期限、交回结果>
- 全部存续线：<active、idle 与 terminal 名单及父卡。收口时每条线都要有 delta>
- 当前轨道写入：<正在处理的批次 PR、原 head、候选 head、targetBase。一次只有一个>
- 等待：<`wait-cli` 的 pr-ready 与交回记录两条等待，及上次命中的 delivery id>
- 后一波预案：<暂不建卡的目标、依赖、消费者影响与待验证假设>
- 收口进度：<整波检查、下一波卡与 R(w+1)、全部 delta、关闭 R(w)，各步的读回链接>
