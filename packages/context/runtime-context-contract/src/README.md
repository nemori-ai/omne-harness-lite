# Runtime Context 源码

根入口 [index.ts](index.ts) 重导出值类型与八个纯操作。模块和阅读路径见 [index.md](index.md)。

`testing/` 提供框架无关的用例列表与非耐久替身。只有测试辅助持有状态。根入口不导入 Cordis、存储或生产机制。

精确公开签名归源码，行为归 [SPEC](../SPEC.md)。修改导出时同步公开接口页和导出清单。
