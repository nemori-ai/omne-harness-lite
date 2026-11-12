# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口，导出领域面、帧、端口与默认策略
- [cordis.ts](cordis.ts)：Cordis 绑定入口，服务、键与插件工厂
- [observation.ts](observation.ts)：一次观察，帧的唯一出口与收场
- [locate.ts](locate.ts)：定位，读日志与标记「有新提交待看」
- [refresh-budget.ts](refresh-budget.ts)：刷新的预算
- [frames.ts](frames.ts)：帧的类型与帧的翻译
- [ports.ts](ports.ts)：端口、策略与默认值

阅读路径：[observation.ts](observation.ts) 是主线，再读 [locate.ts](locate.ts)、[refresh-budget.ts](refresh-budget.ts)、[frames.ts](frames.ts)。行为条款见 [../SPEC.md](../SPEC.md)。
