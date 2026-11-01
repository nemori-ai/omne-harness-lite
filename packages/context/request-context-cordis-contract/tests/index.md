# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、运行方式与当前缺口
- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有运行导出
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：服务定义、真实 Cordis 机制和贡献者生命周期
- [fixtures/](fixtures/index.md)：公开导出固定清单

- [assembly.spec.ts](assembly.spec.ts)：来源登记与托管操作边界
- [boundary.spec.ts](boundary.spec.ts)：产物导入与共享导出清单
- [contract.spec-d.ts](contract.spec-d.ts)：公开类型复用
- [trust-service.spec.ts](trust-service.spec.ts)、[trust-types.spec-d.ts](trust-types.spec-d.ts)：信任键与收件口键的装载、缺席、键只写一次，信任类型反例
- [scripted-trust.spec.ts](scripted-trust.spec.ts)：脚本替身逐字段匹配
- [trust-conformance.spec.ts](trust-conformance.spec.ts)、[trust-registry.ts](trust-registry.ts)：信任套件与参考登记表
- [testing-entry.spec.ts](testing-entry.spec.ts)：`./testing` 入口条件与边界
- [provider.ts](provider.ts)：仅供探针的非持久提供者
