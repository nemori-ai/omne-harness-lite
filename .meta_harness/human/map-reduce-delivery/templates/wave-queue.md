# 当前波队列模板

本模板只列当前波及后一波预案。滚动规划归[负责人状态](../../../../docs/engineering/map-reduce-states.md#2-滚动规划与逐收口等待)，收口顺序归同页的[收口顺序](../../../../docs/engineering/map-reduce-states.md#收口顺序)。

- 当前波：<波号、收口卡 R(w)、F、计划修订>
- active 线：<各线父卡、本波 attempt（本波另有卡时逐张列出）、期限、交回结果>
- 全部存续线：<active、idle 与 terminal 名单及父卡。收口时每条线都要有 delta>
- 当前轨道写入：<正在处理的提升 PR、源轨道 head、目标 head、候选 head、targetBase、merge 链与实际合入结果。同一轨道一次只有一个写者>
- 等待：<`wait-cli` 的 pr-ready 与交回记录两条等待当前的 `--since` 与 `--ignore`；已处理的交回记录评论 id 与提升 PR>
- 开波同步：<各参加线的 FI 源头、目标头、合并提交与固定同步点>
- 本机准入：<当前运行者与排队情况。全机准入一次一个，由 `scripts/with-test-slot.mjs` 的运行名额排队保证；准入命令自动排队，不需要人工互斥。名额的覆盖缺口由 L-ENG 核实。>
- 后一波预案：<暂不登记 attempt 的目标、依赖、消费者影响与待验证假设>
- 收口进度：<整波检查、下一波的 attempt 与 R(w+1)、全部 delta、R(w) 接受决定、关闭 R(w)，各步的读回链接>
