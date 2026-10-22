# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，重导出类型与八个纯操作

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与条款，再读 `index.ts` 的精确类型。模块怎样切分见[内部架构](../docs/architecture.md#模块与依赖)。

## 模块

- [decode.ts](decode.ts)
- [descriptor.ts](descriptor.ts)
- [diff.ts](diff.ts)
- [judge.ts](judge.ts)
- [need.ts](need.ts)
- [operations.ts](operations.ts)
- [producer.ts](producer.ts)
- [reader.ts](reader.ts)
- [reduce.ts](reduce.ts)
- [registration.ts](registration.ts)
- [shared.ts](shared.ts)
- [update.ts](update.ts)
- [validation.ts](validation.ts)
- [testing/index.ts](testing/index.ts)：套件与非耐久替身
