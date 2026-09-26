# D-045 · EC2 / HT2 业务协议客户端

2026-09-25，主线在用户“开搞”与先完成治理CLI/TUI授权内作技术采用。接受[同节点v2增量](../../../realization/packages/frontend/governance-center-client/v2-design.md)，延续D038的Node24 HTTPS路径；三个候选比较归原design与CLI-TUI提案，不重立传输能力。独立节点评审复核hash3f1e537b02d26a9543df2829a8c9c66d0beca991a4247aeabdd5285797db62f2无局部阻断；随后仅校正HT2 G3为请求限制，响应限额自属提供者。

新增exchangeGovernance消费D044 EC2/HT2冻结Envelope/Exchange及31路由；输入与配置在await前捕获，按请求验证结果，OG34分支另核；sendAttempted只表示可能已发送。公开health仍依D038 EC1/HT1独立解码器，共享运输和资源生命周期，不混用协议分类。采用扩展D038的包实施范围，不修改任何冻结规范，也不以目录或内部接口另立领域契约。

本层须在TLS信任确认后才进入发送，无代理/重定向/自动重试；结束须等request/socket真实关闭。合法长答复超过64KiB是明确response-limit，不是非法或空结果；不是业务容量承诺。源码与测试可从此范围实施，但完成声明须有真实协议及平台证据。

没有采用本地状态库、账号密码保存、CLI命令/退出码、TUI或备份恢复。上层仍须先无秘密核中心、同一调用复用可信材料快照；两连接原子中心绑定缺口保留，不作为生产开闸。结果中登录秘密只交给授权调用者，呈现与保存归后续用例契约。
