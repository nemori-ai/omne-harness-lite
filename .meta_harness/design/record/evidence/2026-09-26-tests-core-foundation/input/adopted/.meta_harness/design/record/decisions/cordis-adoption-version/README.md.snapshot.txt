# D-025：Cordis 采用版本 `@deepseek-ai/cordis` 4.0.4

产品负责人 2026-09-22 拍板：本项目第一批产品包采用 **`@deepseek-ai/cordis` 4.0.4**（npm 发布于 2026-09-22），
不沿用 basis 与手册取证时的 4.0.2 基线。**只裁版本**，不裁任何契约或节点语义；
basis 四条与六节点共用的三条待核对主张按 4.0.4 源码重新取证并写 probe，是本决定的闭合条件之一。

- **输入与下游**：来源是 [D-023](../tenant-domain-design-acceptance/README.md)「取代与影响」表留下的未闭合项「Cordis 采用版本」、
  投影 v1 的 [Q-14](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)、
  [basis/cordis](../../../basis/README.md#当前状态) 四条 `version: 4.0.2` 且 `probe: null` 的条目；
  下游是 `packages/core/kernel-basis` 节点（probe 的家）、四个 tenancy 插件节点的依赖表、承载仓库根 `package.json` 的版本钉。
- **范围定位**：只解决「产品包依赖哪个 Cordis 发布版」。**不解决**：任何 Cordis API 语义（那归 basis 取证）、DSH 其他复用组件的采用版本。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-22 实施规划会话，就「第一程钉 4.0.2 还是 4.0.4」二选一作答，选 **4.0.4（最新）** |
| 精确修订 | npm `@deepseek-ai/cordis@4.0.4`（dist-tag `latest`，2026-09-22 发布；依赖 `@deepseek-ai/cosmokit ~1.8.5`、`@standard-schema/spec ^1.1.0`） |
| 接受范围 | 一个版本号 |
| 保留前提 | basis 四条与三条待核对主张的 probe 在 4.0.4 上通过；任一 probe 失败即为本版本真正改变的语义，须回到 basis 与相应节点重判 |
| 取代关系 | 不取代任何决定；闭合 D-023「取代与影响」表里「Cordis 采用版本」一项 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么、不表示什么 | [决定正文](decision.md) |
| 4.0.4 上哪些内核语义已被 probe 钉住 | [basis/cordis](../../../basis/README.md#当前状态)（`probe` 字段） |

返回[决定](../README.md)。
