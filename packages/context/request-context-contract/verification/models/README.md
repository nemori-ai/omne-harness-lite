# verification/models

本目录承载本包的形式模型。

## 允许的内容

模型源文件、配置与说明。

## 边界

说明模型对应的 `SPEC.md` 条款、抽象前提与未覆盖的部分。模型通过不等于实现符合。

## 维护

承诺或实现结构变化时，复核模型的抽象是否仍然成立。

## 本包事实

| 目录 | 模型 | 检查什么 |
| --- | --- | --- |
| [replay/](replay/FixedReplay.tla) | `FixedReplay.tla` | 固定请求能否重放（不能），以及摘要比较与作废换身份的恢复协议（RQ-01、RQ-14；R2-D306） |
| [compaction/](compaction/CompactionFit.tla) | `CompactionFit.tla` | 压缩只追加、保留与未结工作可见、视图有界、结局封闭、至多一次计划、表示取档案（RQ-02、RQ-05、RQ-06、RQ-07） |

每个目录的 `expect.txt` 写明每个配置的预期：`pass` 或应被违反的性质名。性质表与源码对应见 [formal-mapping.md](../formal-mapping.md)，运行记录见 [formal-runs.md](../formal-runs.md)。

运行入口是 [run-tlc.sh](run-tlc.sh)。它在 WSL 里运行，先把一个模型目录复制到 WSL 的文件系统，按 `expect.txt` 逐个跑配置，再把日志复制回输出目录。负控只在日志点名该性质时算命中；退出码本身不算。

```sh
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-24.04 --exec bash -l   <WSL 视角的本目录>/run-tlc.sh <WSL 视角的本目录>/replay <WSL 视角的输出目录>
```
