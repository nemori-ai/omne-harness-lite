# 方案版本表（Skill 与 MCP 交付）

格式沿 `.meta_harness/human/map-reduce-delivery/templates/plan-changes.md`。方案版本代号 `SM`（Skill 与 MCP 两域，单会话）。

| plan_version | change_id | effective_date | scope | metric | expected_direction | rationale | source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SM | C-SM-01 | 2026-11-03 | 两域全部波段 | 每个闭包从派发到合入父分支的时长 | 降 | 单会话同时担任 reduce 与两条线负责人，去掉线父卡、delta、wait-cli、gate 等跨会话协调 | 负责人 2026-11-03 会话内要求；[范式 r1](operating-model.md) |
| SM | C-SM-02 | 2026-11-03 | 两域全部波段 | 写者澄清往返次数；返工轮次 | 降 | 写者可以直接问 reduce；纯澄清直接答并记录 | [范式 r1 §3](operating-model.md#3-变通) |
| SM | C-SM-03 | 2026-11-03 | 两域全部波段 | 闭包规格的偏离与跑偏次数 | 降 | 闭包规格必须引用 DDD 建模草图、九项建模发现与命名账本 | 负责人 2026-11-03 会话内要求 |
| SM | C-SM-04 | 2026-11-03 | 两域全部波段 | 负责人发现的结构问题数 | 降 | 每次合入后从实际源码重生成技术文档与健康读数 | 负责人 2026-11-03 会话内要求；[范式 r1 §8](operating-model.md#8-两份源码技术文档) |
