# Model 协议模型

本目录保存协议模型及其性质、假设和执行说明。目录导航见 [index](index.md)。

| 模型 | 检查什么 |
| --- | --- |
| [Admission.tla](Admission.tla) | 受理至多一次、未决写期间不答 not-accepted、记录不可改、容量诚实、写入不截断、租户隔离 |
| [ResultPush.tla](ResultPush.tla) | 结果推送的保管链、每次唤醒的推送上限、晚账名额、清理后丢正文，以及在前提下的进展 |
| [SendBoundary.tla](SendBoundary.tla) | 发送边界与 driver 的全部出口：确定拒绝最终定局、已发送的调用不判成 credential 失败、终止写重试不重复 |

配置名的前缀表示用途：`admission`、`push`、`push-wide`、`push-live`、`send`、`send-wide`、`send-retry-new-op-window` 是正控，`bad-` 是负控，`known-` 是记录已知限制的反例，每个负控只检查点名的一条性质。性质表、源码对应与机读守卫见 [formal-mapping.md](formal-mapping.md)，运行记录见 [formal-runs.md](formal-runs.md)。运行入口是 WSL 里的 [run-tlc.sh](run-tlc.sh)：

```sh
wsl.exe -d Ubuntu-24.04 --exec bash -l <WSL 视角的本目录>/run-tlc.sh [配置名 ...]
```

[性质与前提](protocols.md) 记录 ModelHandoff 与 FirstContent 的设计前提。这两个模型还没有模型文件或运行命令，不能据此声称它们的模型检查通过。ResultPush 覆盖了 ACK 需要消费者保管与清理在 ACK 之后两条，读写保护与首内容不重生仍只在设计前提里。
