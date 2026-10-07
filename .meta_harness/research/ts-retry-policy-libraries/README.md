# TypeScript 里「可配置重试策略」的现成库：cockatiel、p-retry 与同类

以 D-063 R-6「重试做成可配置策略、调度复用成熟 TS 库（对应 Python 的 tenacity）」为问题，
以 [`capability.model-request-runtime` v2](../../design/spec/capabilities/model-request-runtime/v2/contract.md) 的 S-35（默认重试件）、S-30（`dispatchAgain` 与三道守卫）、G-8，
以及 [model-request-runtime 节点](../../design/realization/packages/model/model-request-runtime/design.md) 的 P-5 为对照基准，核对 npm 上八个重试库能交出什么。

这项调查要区分三件事：候选的**执行器**（自己睡、自己再调用）、**延迟计算**（第 n 次等多久）与**配置词汇**，各自能不能单独拿出来；
候选能不能表达「按失败原因换到下一个目标」；以及每个候选的维护、包形态与已知的语义坑。它能回答「哪些库在本项目的重试件形状下还用得上、用上要付什么」；
**不能**回答该选哪一个，也不能回答契约该不该把等待与再发移进重试件——那归 record 家族。

- 调查对象与基线：`cockatiel@4.0.0`、`p-retry@8.0.1`、`retry@0.13.1`、`exponential-backoff@3.1.3`、`async-retry@1.3.3`、`ts-retry-promise@0.8.1`、`@lifeomic/attempt@3.1.0`、`promise-retry@2.0.1`；
  参照 `tenacity@9.1.4`（Python）与 `effect@3.22.2` 的 `Schedule`。2026-09-25 的 npm 注册表、GitHub 仓库状态与 tarball 源码；本机 Node `v24.18.0`、TypeScript `6.0.3` 实测。
- 消费者：D-063 R-6 的三个落点——model-request-runtime 节点 P-5 改写、契约 G-8 改成「策略配置项与默认初值」、实施边界 W-10b（均待出现）。
- 最近核对：2026-09-25 / 上述版本。

## 准入核对

- **对象与版本**：八个包都钉到当日 `latest`，`dist.integrity` 记在 [evidence.md E2](evidence.md#e2-npm-注册表元数据与周下载量)；版本 token 集中在 [evidence.md 页首](evidence.md)，上游升级时 grep。
- **取得方式**：注册表与下载 API 原样 JSON、tarball 里的关键源文件原样、GitHub 仓库快照都钉在 [sources/](sources/)（`sha256sum -c SHA256SUMS`，逐文件来历见 `provenance.json`）；
  行为与类型结论来自本轮自写探针，锁文件随包，可在空目录 `npm ci` 后复跑。
- **来源立场**：代码与注册表是一手事实；README 是作者自述，与实现不一致处（cockatiel 的 `maxAttempts`、`exponent`）照实分列；短板取自各仓库未关的 issue／PR 与本轮构造的反例。
- **局限**：周下载含传递依赖，无法拆分；没跑任何候选的自带测试；`effect` 只核了类型签名；未检索第三方评测与迁移案例；负面结论多为「读遍导出面与源码未见」级，三条关键缺陷做了实测。
  调研要求的「推荐排序」按家族红线写成「按写明判据的契合度排序」，判据变则次序变，不构成选型。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么（两张对照表、九条结论 C-1～C-9、契合度排序） | [研究正文](research.md) |
| 每条观察出自哪个 URL、哪个文件、怎么测的、支持到哪 | [证据记录](evidence.md) |
| 原样字节、探针与校验 | [sources/](sources/)（`provenance.json`、`SHA256SUMS`） |
