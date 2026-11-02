# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、覆盖的条款、运行方式与当前缺口
- [public-entry.spec.ts](public-entry.spec.ts)：导出面、设施声明、块声明与不导入 Cordis
- [judge-requirement.spec.ts](judge-requirement.spec.ts)：环境要求的边界解码
- [decode.spec.ts](decode.spec.ts)：租户文本、绑定层、两条块的值与小型身份函数的边界解码
- [match-providers.spec.ts](match-providers.spec.ts)：按允许清单匹配提供者
- [need-declaration.spec.ts](need-declaration.spec.ts)：工具环境声明的 schema 与摘要
- [facility-set.spec-d.ts](facility-set.spec-d.ts)：`FacilitySet`、示例与设施键的类型测试
- [fixtures/](fixtures/index.md)：测试固定输入与机读导出清单

- [operation-schemas.spec.ts](operation-schemas.spec.ts)：三面九操作、七个数据结果与拒绝原因。
- [retention.spec.ts](retention.spec.ts)：保留范围的严格解码、端口身份和不支持保留时的拒绝。
- [file-write-result.spec-d.ts](file-write-result.spec-d.ts)：写入效果只进入写结果，查看形状保持不变。
- [exports-inventory.spec.ts](exports-inventory.spec.ts)：共享库存工具核对。

- [provider-conformance.spec.ts](provider-conformance.spec.ts)：公开提供者套件十六项义务的直接消费、逐项坏提供者否定与惰性组装。
- [memory-file-system.spec.ts](memory-file-system.spec.ts)：内存文件设施替身的读写、版本冲突、路径与点名对象的拒绝、分段读取、查看、列表与关闭。
- [scripted-command-facility.spec.ts](scripted-command-facility.spec.ts)：脚本命令设施替身的启动三种答复、输出块、终局、停止两态、单一读者与关闭。
- [scripted-terminal-facility.spec.ts](scripted-terminal-facility.spec.ts)：终端的获取归属、代际、状态、并发、输出、停止、目录观察和单次覆盖。
- [terminal-conformance.spec.ts](terminal-conformance.spec.ts)：终端套件七条协议义务的双停止场景、跨获取故障否定、缺控制与惰性组装。
- [facility-doubles.spec.ts](facility-doubles.spec.ts)：两个替身装进脚本提供者租约后的往返路径，以及以内存文件替身作已持设施的提供者套件。
