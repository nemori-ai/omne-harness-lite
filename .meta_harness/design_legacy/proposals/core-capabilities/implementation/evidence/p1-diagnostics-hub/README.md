# diagnostics D1 候选的 HUB 验证

本页保留修订前候选的实际整合结果，**不是 D1 接受证据**。独立只读评审另发现
D1-R1–R6，见[评审与修订义务](../../review.md#diagnostics-d1-实现评审)。新反例
尚未由这些运行覆盖，后续修订不能借用本次结果宣称通过。

## 精确对象与执行

- 作者源码 `4b8125eb953c97893bdeeeeafac3fb77d276d208`，证据提交
  `66d92a946e22f79b10e8f7f672052b79459486b2`。
- HUB 整合 `4e0124da75ec3c3c63f293fcf558c7457d2ecd36`，根锁更新 `4963b2c`，
  机械格式化后实际产品检查对象为 `46770b9d739c14b6506008326fee7c741da57d81`。
- Node 24.18.0、pnpm 10.28.1；本 HUB 自己的依赖、源码与构建。
- `pnpm install --lockfile-only --ignore-scripts`、随后冻结安装均退出 0。
  根锁纳入 diagnostics 依赖，同时改变 Vitest 可选 OTel peer 的解析绑定；
  Vitest 仍为 4.1.8，不声称旧 importer 内容逐字未变。
- `pnpm check` 退出 0，包含格式检查、临时 Git 的真实提交 hook、构建、严格类型、
  各包测试、13 项检查器测试、17 包独立 tarball 消费与实际组合。
- `make docs-check BASELINE=8c791b3` 退出 0，检查 416 份 Markdown。

首次显式格式命令误含 provenance.json，工具按既定范围拒绝，退出 2 且无改动；
排除该文件后只格式化获准的九个受维护文件，退出 0，四个文件产生机械差异。
失败与修正日志均保留，不扩大格式化范围。

## 另行真实文件消费者

在 `tmp/p1-diagnostics-hub-consumer` 使用作者的 consumer.ts、tsconfig.json，
仅声明本次 HUB 实际打包的 diagnostics、records、work-data 三个产品 tarball，
以及固定 TypeScript 6.0.3、Node 类型 24.13.4。

`pnpm install --offline --ignore-scripts --ignore-workspace`、
`pnpm exec tsc -p tsconfig.json` 和
`node --no-global-search-paths build/consumer.js` 均实际退出 0。消费程序经公开默认
入口建立 0700 目录、0600 来源，执行 log/span/end/close，读回四条真实记录，
核对租户、结果以及 closed/released/无活动 span。

这个消费者位于仓库 tmp；它证明所列文件/资源行为，**不独立证明仓库外依赖隔离**。
逐包仓库外隔离结论来自上述实际 package-checks，两项证据不能混称。
这些运行没有加载 `.env`、发送模型请求，也未验证真实业务短门、宿主换代或
O09–O12；不抵扣最小运行基线与完整 M1/M2。

## 原始资产

[artifacts.tar.gz](artifacts.tar.gz) 保存上述安装、格式、产品与文档日志，三个精确
tarball，以及消费者源码、配置、锁、打包/编译/运行日志和实际 JSONL。归档使用
原 HUB 相对路径；配置内原绝对路径保留当时身份，迁移复现时须显式重定位。
[manifest.json](manifest.json) 给出归档及每份资产的 SHA-256；创建后已从归档
逐项读回与原字节比较。没有归档 node_modules 或可重建构建目录。
