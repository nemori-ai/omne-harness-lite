# D-019：定向 fork pi-ai 用于 OpenRouter 传输

产品负责人 2026-09-16 就模型 provider 的复用边界拍的一条：
**以 pi-ai 的 OpenRouter provider、模型目录、协议请求与流/工具解析为传输实现基线，
按本项目契约做定向 fork，并针对已知问题做二次开发优化。**

- **输入与下游**：来源研究是
  [pi-ai OpenRouter 传输复用核对](../../../../research/legacy_backup/pi-ai-openrouter-transport/README.md)
  （固定 `@earendil-works/pi-ai@0.85.1` 的源码读数、离线对照与真实短请求）。
  下游是模型执行能力的契约与提供者设计——**两者在本设计链里都还不存在**。
- **范围定位**：这是**传输与模型协议的实现选择**。
  它不决定凭据放哪、不决定预算与账本归谁、不决定运行生命周期，
  也不把 pi-ai 或上游整包的设置、身份、凭据层引为任何权威。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`）。这是复用 vs 自建的采用裁决 |
| 接受记录 | **2026-09-16**，在模型 provider 复用调研与实测反馈之后明确拍板；当次核对稿逐条记录，本次迁入 |
| 精确修订 | 裁定对象是**固定版本 `@earendil-works/pi-ai@0.85.1`** 上的复用路径；`0.85.1` 是取证版本，**不是已采用的产品依赖版本** |
| 接受范围 | **采用方向**，见[决定正文](decision.md)的范围表；fork 的具体补丁、API、产品装配与符合性**都不在范围内** |
| 保留前提 | 所有模型请求经 OpenRouter；模型执行 owner 继续持有耐久 attempt、共同发出门、费用质量与迟到/停止责任 |
| 取代关系 | 不取代任何现行决定。**旧谱系对同一次接受的记录已随那条设计链整体退役**，编号 D-019 在本次迁入时保留（理由见正文） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、什么仍须验证、**不表示**什么 | [决定正文](decision.md) |
| 固定版本上实际观察到什么 | [研究包](../../../../research/legacy_backup/pi-ai-openrouter-transport/README.md)与它的[证据记录](../../../../research/legacy_backup/pi-ai-openrouter-transport/evidence.md) |
| 比较门逐项做到了哪、0.86.1 上补丁还要不要 | [2026-09-23 比较门现状补记](gate-status-2026-09-23.md)——对本决定的追加，不改写接受范围；观察本身在[模型请求运行时研究](../../../../research/model-request-transport-sources/research.md) |

返回[决定](../README.md)。
