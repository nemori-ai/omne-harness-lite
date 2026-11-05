# verification/models 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：模型怎样表示、与实现的对应、配置与 TLC 结果、运行命令
- [ReadGate.tla](ReadGate.tla)：读取与目录的自组合模型（S1、S2、S3、S5、S6）
- 正控配置：[ReadGate.cfg](ReadGate.cfg)、[ReadGate_Change.cfg](ReadGate_Change.cfg)、[ReadGate_Abort.cfg](ReadGate_Abort.cfg)、[ReadGate_Disclosure.cfg](ReadGate_Disclosure.cfg)、[ReadGate_Order.cfg](ReadGate_Order.cfg)
- 负控配置：[ReadGate_FlawRefusedAsBasis.cfg](ReadGate_FlawRefusedAsBasis.cfg)、[ReadGate_FlawUnknownAsEmpty.cfg](ReadGate_FlawUnknownAsEmpty.cfg)、[ReadGate_FlawNoEntryDigest.cfg](ReadGate_FlawNoEntryDigest.cfg)、[ReadGate_FlawNoCheckAfterSnapshot.cfg](ReadGate_FlawNoCheckAfterSnapshot.cfg)、[ReadGate_FlawCompletionOrder.cfg](ReadGate_FlawCompletionOrder.cfg)
