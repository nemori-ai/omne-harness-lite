# verification/models 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：两个模型的文件、性质与负控、运行方法与判读规则；五个旧状态空间模型的登记。
- [Finishing.tla](Finishing.tla)：Journal 收尾协议的有界模型。
- [CardRounds.tla](CardRounds.tla)：Agent 循环等人状态点的有界模型。
- `valid*.cfg`、`live*.cfg`、`bad-*.cfg`、`probe-keep-cancelled.cfg`、`trace-*.cfg`：收尾协议模型的正控、负控、探针与轨迹导出的配置。
- `cardrounds-*.cfg`：等人状态点模型的正控、可达性见证与负控的配置。
- [run.py](run.py)：运行两个模型的 TLC、判读结果、保存证据、导出收尾协议的轨迹。
- [finishing-traces.json](finishing-traces.json)：导出的回放轨迹。
- 规模上限与映射见 [../formal-mapping.md](../formal-mapping.md)，运行记录见 [../formal-runs.md](../formal-runs.md)。
