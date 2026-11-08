# verification/models 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：两个模型的说明、配置与判读规则
- [ProcessCustody.tla](ProcessCustody.tla)：执行域的归属、处置、移交、停止、封闭与崩溃恢复
- `ProcessCustody.cfg`、`ProcessCustody-unbound.cfg`、`ProcessCustody-live.cfg`、`ProcessCustody-inductive.cfg`：正控
- `ProcessCustody-unsafe-*.cfg`：负控，共八个
- [TerminalSegments.tla](TerminalSegments.tla)：终端段的完成与字节归属
- `TerminalSegments.cfg`：正控
- `TerminalSegments-unsafe-*.cfg`：负控，共三个
- [run-tlc.sh](run-tlc.sh)：运行全部配置与可达见证
