# Model request runtime：revision 5 参数及公开制品验证

2026-09-27 在 model-request-runtime hub 实际执行，HEAD `d87f2df9c5cfcae82e5367c5521b360ba8d79d99` 上有未提交源码。采用 D-076、model-profile3 S-16／17／21、runtime3 S-54／57／58 和 transport v3 参数表，沿原义务修复实现，没有修改冻结规格。上下文计划 revision6 及其 66 项当前输入随快照保留，逐项哈希一致。

## 实际结果

`source-config-and-runs.tar.gz` 下 `input/checks/p2-parameter-verification/` 保留所有命令、stdout／stderr、失败、真实字节、源码／dist 和测量工具。

| 检查 | 实际结果 | 原文位置 |
| --- | --- | --- |
| 独立参数验证第一次 | 20 项通过；后续发现测试对空 extra 的判据不符合 S-17，不能当该分支合格证据 | `parameters-run-1/` |
| 测量器类型失败 | 新测试证据记录器 3 处 TS2322；沿公开无损 JSON 边界修正，不改产品或降低断言 | `typecheck-run-1/` |
| 真实产品反例 | run3 为 21 pass／1 fail：保护键全丢后仍留下非法 `parameters.extra={}`；保存 201 文件失败快照 | `parameters-run-3/`、`failure-run-3-inputs/` |
| 不变判据修复后 | run4 为 22／22；11 次真实本机 HTTPS 单请求、10 个非法参数／配置零 HTTP 负控、5 种测量错误检出 | `parameters-run-4/`、`final-run-4-inputs/`、`audit.json` |
| 反例前后精确对照 | 线上字节与丢项名字相同，只移除非法空 extra；公开 judge 从 malformed 变 ok | `transcript-comparison.json`、`product-plan.diff` |
| 整包回归 | transport 231／231，7 文件；runtime 6／6；类型、格式、源码规则退出 0 | `transport-full-r5.stdout`、`runtime-regression-r5.stdout`、`transport-typecheck-r5.stdout`、`format-r5.stdout`、`source-rules-r5.stdout` |
| 新仓库外制品 | 新 pack/deploy 和两个外部目录共 6 命令退出 0；37×impl5/def1、默认仍两 pilot；根入口不解析 Cordis/kernel-basis；插件 peer 4.0.4 | `external-r5/results.json`、`commands.json`、`inputs.json`、`location.json` |
| 外部实际传输与生命周期 | 两处各一次真实 TLS，规划字节一致、extra 全丢不残留且不改保护字段；实际 socket 停止、tracked callback 保留及模型贡献排空 | `external-r5/*consumer.stdout`、`observed-wire-body.json` |
| 外部负控 | 恢复旧 extra 残留缺陷后消费者按预期 exit1，不接受假成功 | `external-r5/negative-control.json`、`negative-root.stderr` |

共享实现从 revision4 更新5，37个窄定义的 definition revision 仍1。run3与run4测试字节完全相同；source／dist 和所有执行边界的哈希见归档。外部验证保存15包、820项输入且运行后无漂移；本归档共2915个输入文件，包含此前失败与最终制品。`public-artifact-r5.tar.gz` 是所验证外部目录的另一次保真打包，其 gzip／tar 元数据与验证工具原打包不同；文件值与相对链接不变，精确归档摘要见下。测试报告中的原打包摘要保留，不混作本次归档摘要。

## 精确归档

- `source-config-and-runs.tar.gz` SHA256：`93aa1f62452c54dc71f3076a909e84c3dfb3a8d10f219476dee3502ae0042159`
- `public-artifact-r5.tar.gz` SHA256：`991c68e18cdd6aaf7266a18762e79e5a76a84ef5a9458ef1c3ea9ba6c5d478bf`
- 完整输入／输出哈希：`input-and-output-hashes.json`；环境及预算：`environment.json`；秘密及制品链接扫描：`secret-scan.json`（实际凭据及其8字节窗口0命中，不记录凭据或其摘要）。

## 范围与未覆盖

这只证明参数表列明的 T-10 子项、有限输入、实际本机 TLS 字节及上述公开制品消费。配置中藏统一调参、topP=0、空 stop 或空 extra 等非法形状的拒绝已有零 HTTP 反例；不从规划参数表推导全部模型支持这些参数，也没有以模型目录宣告替代实际能力认证。

完整 T／SC／G、全部 offer／配置 Schema、实际 provider 对应、缓存命中与 TTL 到期、目录耐久采用、十三操作租户 service、耐久／恢复及整体独立验收仍待。官方生产认证仍 **0／37**，没有付费或形式任务执行。本 run 付费请求0；独占账本共有170 settled／0 unsettled，USD1.139960389500000000，历史费用不移作本修订认证。[旧 revision4 run](../2026-09-27-tests-model-request-runtime-conformance/README.md) 保留原输入、失败和范围。

映射补验：两个 model 节点的入口、投影、绑定与链接检查0错误；完整设计结构检查exit0，formal=skip（执行形式任务0）。最终映射快照 `final-mapping-check.tar.gz` SHA256：`1b337d7848be2241657236171181f80beaeb063d6ce20e9a9ef1db9c8aa5ae61`，不声称全仓realization或make通过。
