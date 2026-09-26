# Entry v2 候选有限模型

2026-09-25，真实TLC执行；候选模型不代表采用或SQL实现验证。工具TLC 2.19（tla2tools v1.7.4，jar SHA256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`）。容器网络关闭，实际image ID/命令见各results.json，后次JRE镜像身份见environment.txt。run.py旁放同hash jar可重跑，jar本身不入仓库。

- EntryCommit：正例18 distinct，退出0；吞最终时钟失败及提交前通知两个负控分别退出12，命中NoCommitWithoutFinalTime/NotificationAfterKnownCommit。原子提交是模型前提；活动是否暂存是布尔抽象，不能证明所有有效登录必touch或过期不复活；没有进展或排空证明。
- EntryDecision：四类路由，一个请求，版本/信封/载荷/身份查验结果抽象。正配置退出0，九个否定配置均退出12。结果是临时分类，不是已提交/已发送答复；弱公平仅用于EventuallyClassified，deadlock检查关闭。真实Schema、改密G优先、expectedTenant、SQL共同保护、传输与生命周期不在模型范围。
- decision-first为首次运行；随后只修正失效/分类注释，r2因本机旧JRE镜像已不在而十项均退出125，未运行TLC，不计通过。恢复镜像后r3使用修订字节重跑正反例，原始失败保留。

各输入、配置、原始日志与结果完整保留，SHA256SUMS可核。EntryCommit与ExpectedTenant曾独立架构审阅其有限映射；EntryDecision新映射仍待独立复核。三份模型没有组合成端到端证明，不能据此声称业务/活动同SQL提交或生产就绪。
