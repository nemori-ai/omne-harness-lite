# D-024：租户领域的限界上下文名 `tenancy`

产品负责人 2026-09-22 拍板：租户领域这个限界上下文在源码与实现映射里的名字是 **`tenancy`**，
四个领域 provider 节点的路径 `packages/tenancy/<node>` 由此定型。**只裁名字**，不裁布局规则、不裁任何契约。

- **输入与下游**：来源是 [realization 的两层布局规则](../../../realization/README.md#packages-的两层布局)
  与 [D-023](../tenant-domain-design-acceptance/README.md) 留下的未闭合项；
  下游是六个 provider 节点的 `README.md` 源码位置行、将来承载仓库根下 `packages/tenancy/`。
- **范围定位**：只解决「这一层叫什么」。**不解决**：`core/` 与 `<domain>/` 的归属判据（归 realization README）、
  Cordis 采用版本、任何契约语义。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`）。realization README 写明「领域名是候选，直到产品负责人拍板」 |
| 接受记录 | 2026-09-22 设计会话，就交接文档门槛 G-3 作答，原话「tenancy 我觉得没问题啊」 |
| 精确修订 | 六个节点与布局规则的修订同 D-023（主检出 `main` `26f2667`） |
| 接受范围 | 一个名字：`tenancy` |
| 保留前提 | 领域边界即 D-023 接受的五份契约边界；边界重分解时名字要重看 |
| 取代关系 | 不取代任何决定；闭合 D-023「取代与影响」表里 `tenancy` 名那一项 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么、不表示什么 | [决定正文](decision.md) |
| 一个节点归 `core` 还是 `tenancy` | [两层布局](../../../realization/README.md#packages-的两层布局) |

返回[决定](../README.md)。
