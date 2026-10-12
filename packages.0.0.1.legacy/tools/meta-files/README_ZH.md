# @omne-harness-lite/meta-files

[English](README.md)

Files 是独立工具闭包，共十三个命令。文本返回使用现有 Unix formatter。edit 与 patch 返回 unified diff。open 返回已确认的图片附件引用，不把 base64 放在工具文本中。

根入口 `createFilesTool(options, {imageCodec})` 接收显式容量政策和借用的图片协议。每次执行使用注入的 Runtime Context、所选文件设施及当前调用的附件 writer。工具不直接访问宿主文件系统，不调用 Shell，不发送 emit。

`./cordis` 的 `files` 插件消费原工具实现注册表。Config 只放身份、政策和附件存储名；具体 Sharp 组合在此入口完成。根工厂不加载 Sharp 或 Cordis。撤除登记不破坏已借用的纯 executor。

通过 help 查看全部命令或单命令帮助。patch 预检失败不提交任何目标修改；提交中断可能部分修改，明确返回未知。恢复只识别原批次，不自动续写、重发或回滚。类型之外的承诺见 [SPEC](SPEC.md)。图片送入模型由后续消费者集成完成。

构建、类型检查和测试使用本成员三个脚本。共享环境及测试排队见[开发指南](../../../docs/development.md)。
