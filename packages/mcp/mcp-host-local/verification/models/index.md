# verification/models 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：模型里的名字、两种断开的结算规则、配置表、有效动作的变异、运行命令与判读规则
- [TransportSession.tla](TransportSession.tla)：会话请求生命周期的 TLA+ 模型，含 `signal`、`close()`、线路断开与会话结束
- [run.py](run.py)：运行脚本，判读每个配置并写 `summary.json`；`--mutations` 在模块副本上做有效动作的变异并写 `mutations.json`
- `*.cfg`：正控（`valid-*`）与负控（`bad-*`）的 TLC 配置

## 阅读路径

先读 [README.md](README.md) 的名字、配置表与判读规则，再读 [TransportSession.tla](TransportSession.tla) 的动作与不变式。性质陈述与证据状态见 [SPEC.md「性质与证据」](../../SPEC.md#properties)。
