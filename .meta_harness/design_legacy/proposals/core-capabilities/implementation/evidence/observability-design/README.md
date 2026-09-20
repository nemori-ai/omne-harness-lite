# P1 观测设施设计证据

作者候选 `1c60feb` 与定点修订 `99fc7a3` 经独立只读评审，O-R1–O-R3 设计缺口闭合。
主调度在 HUB `9cd78a0` 合入，按原锁在全新 `tmp/observability-design/` 安装后
实际重跑两个脚本，分别通过 12 与 7 项机制检查。

- [作者资产清单](author-manifest.json)列出 38 份文件的 SHA-256；
  [原始归档](author-probes.tar.gz)保留脚本、安装锁、版本、固定来源及原始结果。
  每份文件已从归档重读校验；排除了可重建 node_modules/venv。
- [HUB 汇总](hub-summary.json)记录整合源码、安装命令及范围。
- [HUB 初始探针结果](hub-probe-result.json)覆盖 Cordis 反例、私有 ALS、OTel/Pino
  基本接口及 Sonic 有界输出/关闭。
- [HUB 定点结果](hub-review-probe-result.json)复现原门内 I/O，并验证门外输出、
  低流量可读、输出失败、无 Promise 结算观察及关闭后业务责任边界。

复现时把归档解至当前检出的 `tmp/observability-design/`，运行：

```text
npm ci --ignore-scripts --no-audit --no-fund
node probe.mjs
node review-probe.mjs
```

环境 Node v24.18.0；实际第三方版本和 integrity 见原安装锁/versions.json。
探针中的 @types/node 24.12.0 仅属于该临时环境，没有升级或替换产品 workspace
的 @types/node 24.13.4，产品锁未改。脚本只写自己的合成临时文件，没有访问
凭据、模型或外部 exporter。

最早的 review-probe-before-r3 曾错误假定 ALS.disable 能清掉尚未结束的调用者
所有 native context；原脚本与失败输出均保留。修订依靠原实例的显式关闭守卫，
不再将调用者 body/Promise 的生命周期交给 diagnostics。

本证据接受的是 [D-010](../../../../../decisions/D-010-shared-diagnostics.md) 所述 P1
施工选择的可行性，不是 O01–O12、实际 writer/admission、P2 原生桥或 P3 查询的
产品验收。诊断资源、保留、换代和真实失败组合必须在正式实现中按 TDD 验证。
