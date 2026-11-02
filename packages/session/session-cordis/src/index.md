# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，保持为空
- [cordis.ts](cordis.ts)：`./cordis` 入口，导出 `SessionProvider` 与类型 `SessionProviderConfig`
- [provider.ts](provider.ts)：`SessionProvider`，`SessionService` 的具体子类，也是插件；四个面属性与调用方类
- [config.ts](config.ts)：静态 `Config`，Standard Schema，与合成完整策略
- [runtime.ts](runtime.ts)：一次装载建出的东西：依赖、实例、组合通知者、外来通知的监听、撤除的两个触发
- [ports.ts](ports.ts)：按调用现取的端口，缺席与抛出映射为 `unavailable`
- [faces.ts](faces.ts)：调用方类的识别，以及每个操作都拒绝的面
- [scanners.ts](scanners.ts)：每租户一个扫描者的表
- [teardown.ts](teardown.ts)：撤除的四步，两个触发共用，只执行一次
- [assembly-lifecycle.ts](assembly-lifecycle.ts)：装配生命周期的私有键与形状（IC-8 偏离）
- [diagnostics.ts](diagnostics.ts)：诊断记录

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与依据，再读 [Cordis 说明](../docs/cordis.md#插件与服务)，最后读源码。两个入口怎样分工见[内部架构](../docs/architecture.md#模块与依赖)。
