# diagnostics 提供者设计归属迁移

本次输入为 `1ab8635d57829bb8aed7b32506289285ddd5209a`，分支
`design/dsh-diagnostics-directory`，含 main `59139bb` 与 HUB `1368c52`。
按本树 spec-maintenance/organization 和派发的精确写入范围，仅迁移设计正文及
维护此次证据；作者不接受自己的候选，不修改产品或原 RED。

## 精确移动与状态

| 来源 | 当前拥有者及处理 |
|---|---|
| D-010 已接受、observability.md@99fc7a3 的提供者映射 | [包 design](../../../../../../packages/observation/diagnostics/design.md) 汇入依赖、注入、身份/上下文、裁剪、输出/缺口、来源生命周期及消费者边界；已实现签名引用包 src/index.ts，不复制 DTO 或正式状态机 |
| observability-directory.md@d4cd27e 的 R1 公共面及所有权 | 原候选签名、共同额度、扫描/create/fd、关闭、release_unknown 与装载撤除表迁入同一包 design，标明受审但待接受；产品 R1 仍未通过 |
| 目录施工稿的反例/选型/采用交接 | [来源页](../../observability-directory.md)保留比较、来源、待接受差异及主调度后续对账；删除其完整当前接口和实现规则副本 |
| runtime-baseline/plan@1368c52 | 明确当前停止点是最小真实基线；完整 M1/M2/A01–A32 保留后续，不由旧稿文字重新扩成本轮硬门 |

本次无新增提供者选型或业务语义变化。R1 已受审但尚待接受的3项差异完整保留：
唯一目录 owner与预留；fs-ext及8源文件+1零字节锁；所有子资源静止后的最后锁
关闭及真实 raw fd未知不盲重试。R2前置模拟失败的证据范围保持有限。

主调度交接确认 d4 评审无阻断、R6 `4fa2c74f4816fe37850a812ca59032cb889d75fd`
窄缺口闭合；这不是本次运行或声称该产品修订已在此树验证。既有源码仍为旧
factory，目录候选不能被当作已存在的 API。D-010/公共施工输入/README/应用
导航与接受记录归主调度，原实施者负责 R1 产品修改和真实 GREEN。

## 检查与保留

本树环境执行 `make docs-check BASELINE=1ab8635`，结果见
[migration-docs-check.log](migration-docs-check.log)：exit 0，434份 Markdown通过。
空白与精确写入范围、历史
资产哈希核对见 [migration-checks.json](migration-checks.json)。后者逐项比较
本次输入提交中的 d4 专属 evidence 原件与当前内容，包含 README、RED 源码/
日志、probe/输出/manifest、原 docs/diff 日志；不重写历史结论或用新结果覆盖。

仅文档归属与表述改变，因此未重跑产品测试、R1机制探针、P0原生锁、模型或
远程 exporter；原证据保留固定修订和范围。docs-check 只证明机械文档约束，
diff/scope检查只证明此次文件与空白边界，不证明候选已接受或产品通过。
