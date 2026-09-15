# Cordis 与 DSH 复用边界

本视图固定 F 纵线实际消费的复用边界，供后续 provider 选择和 API 核对使用。

- 观察基线：锁文件采用 Cordis `4.0.2`；官方 DeepSeek Harness 修订 `c291e7961a515f6d7af9304e7fd1d257929aef26`；旧 D-006
- 权威状态：复用选择的旧接受只作为新谱系 lineage；新 catalog/decision 采用待 I 整合
- 完整性范围：Cordis 和 `dsh-scope`/`dsh-agent`；其他 DSH 来源仅列为相邻范围

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 哪些能力复用什么 | [能力投影](capabilities.md) |
| 复用机制怎样进入组合 | [组合视图](compositions.md) |
