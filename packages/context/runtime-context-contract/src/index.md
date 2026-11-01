# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，重导出类型与八个纯操作

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与条款，再读 `index.ts` 的精确类型。模块怎样切分见[内部架构](../docs/architecture.md#模块与依赖)。

## 模块

- [authority.ts](authority.ts)：可信绑定来源、权威端口、授权判定与三面动作
- [decode.ts](decode.ts)
- [descriptor.ts](descriptor.ts)
- [diff.ts](diff.ts)
- [judge.ts](judge.ts)
- [need.ts](need.ts)
- [operations.ts](operations.ts)
- [producer.ts](producer.ts)
- [reader.ts](reader.ts)
- [reduce.ts](reduce.ts)
- [replay.ts](replay.ts)：恢复引用、开始与完成恢复的输入、恢复材料与结果
- [registration.ts](registration.ts)
- [trust.ts](trust.ts)：RuntimeContextTrust 构造输入类型
- [shared.ts](shared.ts)
- [update.ts](update.ts)
- [validation.ts](validation.ts)
- [testing/index.ts](testing/index.ts)：套件与非耐久替身
- [testing/conformance.ts](testing/conformance.ts)、[testing/extended-conformance.ts](testing/extended-conformance.ts)、[testing/authority-conformance.ts](testing/authority-conformance.ts)、[testing/replay-conformance.ts](testing/replay-conformance.ts)：四组用例；[testing/suite.ts](testing/suite.ts) 是夹具与端口类型，[testing/case.ts](testing/case.ts) 是用例与不适用结果，[testing/fixtures.ts](testing/fixtures.ts) 是共用安排
- [testing/ports.ts](testing/ports.ts)：可编排的权威端口与可信绑定替身
- [testing/memory.ts](testing/memory.ts)：非耐久替身的组装；[testing/memory-world.ts](testing/memory-world.ts)、[testing/memory-holder.ts](testing/memory-holder.ts)、[testing/memory-producer.ts](testing/memory-producer.ts)、[testing/memory-reader.ts](testing/memory-reader.ts)、[testing/memory-replay.ts](testing/memory-replay.ts) 分别是世界状态、持有者面、生产者面、读者面与恢复会话
