# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、运行方式与当前缺口
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的运行导出只有八个纯操作，不导入 Cordis
- [conformance.spec.ts](conformance.spec.ts)：非耐久替身跑核心、扩展、权威与恢复四组用例
- [conformance-negative.spec.ts](conformance-negative.spec.ts)：坏实现被公共用例否定
- [exports.spec.ts](exports.spec.ts)：导出清单与公开接口页一致
- [pure.spec.ts](pure.spec.ts)：纯函数的解码、绑定、合并与变化材料
- [registration.spec.ts](registration.spec.ts)：注册材料核对
- [public-types.spec-d.ts](public-types.spec-d.ts)：公开类型的形状
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空

- [cross-realm-schema.spec.ts](cross-realm-schema.spec.ts)：真实跨 realm Promise 的同步定义拒绝与原异常传播
- [reader-refusals-negative.spec.ts](reader-refusals-negative.spec.ts)：公共套件否定固定消费者越界与无注册冒充缺项

- [coverage-risk.spec.ts](coverage-risk.spec.ts)：无声明绑定拒绝、祖先取值边界与撤销后的变化读取

- [source-lifecycle.spec.ts](source-lifecycle.spec.ts)：来源失败恢复、生产者换代的晚到结果与逐请求结果边界
