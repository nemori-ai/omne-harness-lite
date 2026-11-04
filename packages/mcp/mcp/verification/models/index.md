# verification/models 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：模型的常量、配置表、运行与判读规则、运行记录。
- [ConnectionTable.tla](ConnectionTable.tla)：连接表生命周期的有界模型。
- `valid-*.cfg`、`live.cfg`：正控。`cex-*.cfg`：1160e92c8 的已知反例。`probe-*.cfg`：反定理 A1 的探针。`bad-*.cfg`：负控。
- [run.py](run.py)：串行运行 TLC、判读结果、保存证据。
- 与实现、探索器的映射见 [../README.md](../README.md#动作映射)。
