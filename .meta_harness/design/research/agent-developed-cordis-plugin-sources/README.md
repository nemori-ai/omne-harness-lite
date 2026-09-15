# Agent 开发并动态装载 Cordis 插件的来源边界

本研究保留 PF-016 对 F 纵线的持续约束：插件定义、运行实例与在途使用必须分离，有限信任代码不能因装入 Context 获得宿主权限。

- 调查基线：R 的 PF-016.C1～C7；官方 Cordis 固定修订；旧来源页 hash 见 F dispositions
- 消费者：live-agent 执行信任前提、provider 撤除设计、后续插件部署能力

## 阅读入口

[研究正文](research.md)说明当前推断，[证据记录](evidence.md)限定来源范围。
