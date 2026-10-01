# 来源与复核记录

- 外部原件：用户指定Downloads目录内2026-09-30讨论稿1.0。三份文字按原始字节保存为`.source.txt`，避免使归档中的相对插图链接被误认为活跃设计入口；全包25个文件hash归[source-manifest.json](source-manifest.json)。
- 框架：Git `2a04c2322a7b679133654acc3c4241effaade4be`；[framework-capabilities.json](framework-capabilities.json)列PF修订、契约、节点、来源路径与hash。
- 取得方式：只读本地文件、Git版本与注册表；独立领域读数先封存，再展开机制映射。[source-seal-v1.json](source-seal-v1.json)保留初版封存hash；这些hash只证明当时读数，不替代原稿版本或接受。
- 观察：165功能、23故事、224故事正文需求行；27项故事细化、5跨模块、6发布待定事项。条目对应与计数见[source-coverage.json](source-coverage.json)。
- 自检修正：[source-corrections-v2.md](source-corrections-v2.md)为初版读数的显式修正登记，未倒改封存件。最终映射会按处置采用，不把弱关联当直接证据。
- 执行边界：本次没有运行framework产品测试或形式模型；实际执行的仅来源提取、引用/计数/依赖检查与Claude Fable文档review。最终机器检查和review输入/输出归报告包。

外部技术文档的调查事实在外围研究完成后补入本包；正文不得将厂商功能说明当本产品已交付证据。

## 外部技术事实

[external-sources.json](external-sources.json)记录17份一手规范/厂商文档、观察版本、URL、使用事实和不适用范围。仅用作外围候选的技术来源，未采用网页价格或SLA数值，未运行其产品。不可读取的页面另列excluded，未据此补造事实。

## R1复核修正

Claude Fable第一轮允许继续，无阻断。v2按R1-F01恢复X25/X26明写要求并拆X27混合状态；按F02/F03去弱关联、补M07.10；按F04新增X28-X30假成功反例；按F07改非建议标签、F08重建表格。[v2 seal](source-seal-v2.json)记录产物hash。v1封存件不改，输入原稿未改。框架版本钉定的F06须由主线另行核对，不盲从审阅建议。

R5补充复核采用的S3基础原语见EXT-15至17（2026-10-01）：[一致性](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)、[条件写](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)、[策略强制条件写](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html)。仅证明候选原语存在；独立恢复域、凭据失效与完整恢复协议仍待实施验证。
