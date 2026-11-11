# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口与公开定义
- [cordis.ts](cordis.ts)：Cordis 绑定入口
- [ask-protocol.ts](ask-protocol.ts)：Ask 的命令表、参数校验、卡片与等待协议
- [ask.ts](ask.ts)：Ask 的检查点执行者
- [ask-result.ts](ask-result.ts)：Ask 的结果投影，把题目与答复写成给模型的结果文字
- [web.ts](web.ts)、[web-port.ts](web-port.ts)、[web-protocol.ts](web-protocol.ts)：Web 作者、窄口与命令表
