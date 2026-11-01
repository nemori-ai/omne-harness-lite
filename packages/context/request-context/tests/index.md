# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、替身、运行方式与当前缺口
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出名单与类型
- [default-policies.spec.ts](default-policies.spec.ts)：默认压缩、表示策略与修剪器
- [default-assembly.spec.ts](default-assembly.spec.ts)：默认策略在真实操作组里的固定请求与 `lineage.continues`
- [conversion-results.spec.ts](conversion-results.spec.ts)：缺席的转换件结果读口
- [registry.spec.ts](registry.spec.ts)：来源登记表与操作组一致性
- [accounting.spec.ts](accounting.spec.ts)：账目投影、窗口占用与恢复
- [trust-conformance.spec.ts](trust-conformance.spec.ts)：信任套件在来源登记表上运行
- [fixtures/](fixtures/index.md)：测试固定输入，现在有一份消息构造辅助
