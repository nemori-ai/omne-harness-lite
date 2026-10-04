# D-108：OpenRouter refusal 文本映射的技术采用

2026-09-29，主调度沿用户「Implement the plan」「主调度者和验收者」及持续完成 model runtime 纵线的授权，接受[候选 A](../../proposals/openrouter-refusal-mapping/alternatives.md)。本次是提供者设计技术接受，不代替用户对完整交付的最终验收。

## 精确采用与依据

采用 [transport v14 revision 2](../../../realization/packages/model/pi-ai-transport/v14-refusal-design.md)，SHA256 `cf687f33d8d60270a1982ce0e7bfe36819ac520695b80f3d33143215f3015a0e`；配套 [PF-013 projection/v4](../../../product/PF-013-model-profiles-and-invocation/projection/v4/projection.md)，SHA256 `acb99ffea7e3d9c24a77174d790a7c7dee843f6aafaed16d8f3db85f7c65544a`，其 provenance SHA256 `a05d790270379bbf8c455faa28d085f0b1c18df15b288203ba42cb0edef5af87`。候选正文的未采用标签保留当时状态；本决定只改变上述精确字节的采用状态，不原地改写它们。

[独立评审](../../proposals/openrouter-refusal-mapping/review.md)在其有限范围未发现架构阻断，并回读确认两处表达修正闭合：故障 delivered 不自动进历史；raw 留存失败/过期不虚构新的禁留配置。主调度另逐一核对八份交接资源摘要并阅读实际映射、性质与反方论证。评审未执行实现测试，不能代替后继验证。

[固定第一方研究](../../../../research/openrouter-refusal-mapping/research.md)支持 refusal 是另一文本增量字段。CB3 可表达其文字，MR9 已允许原始协议留存失效，产品没有永久保存拒答来源标记的新要求。因此采用既有 text 通道；不为此扩大 CB origin 或新增响应来源索引。B/C 在永久来源审计要求成立时有价值，但当前引入持久字段和更多消费者迁移没有必要。

## 取代范围与保持的责任

只取代既有 transport 对 refusal 一律不承载、空数组忽略的映射。缺席/null/空串无内容；非空字符串按实际文字交付；其他类型包括空数组明确 protocol 失败。同帧先 content 后 refusal，跨帧按到达顺序；不依赖 JSON 键顺序，也不声称是上游生成时间。

沿既有首内容门、reply/delivered 资格、四种 outcome、三种 reply ending 和十三服务操作。interrupt 是控制入口，dispatch 是执行与结果入口；拒答支持不改变这个分工。合法 reply 只有按既有规则被选入上下文才回放，故障 delivered 仅留痕。

正常流沿原终点读取实际 usage/DONE。错误、取消或超时及时停止并保留已取得 facts，不开启额外 drain，不将未知账改零，不推断那次 Opus 诊断的实际 refusal 值型或后帧费用。来源政策沿 D-095/v6，不增加生成内容秘密保证。

CB3/AR2/SA3/MS6/MR9/RT10 继续按各自现有精确接受版本消费；没有规范新增版本或状态迁移，本次不改 catalog、frozen、covers 或 formal-tasks。T29 的 RT11/MR10/MS7/CA3 候选与图片预处理设计均不在本次采用范围。

## 实施和验证门

本次释放共享 reader 和 RF-V1–V9 的实施，不允许按厂商另写 refusal 分支。公共解析器属于固定 implementation；采用新 reader 的官方定义须统一发布新实现坐标，必要时同步 definition revision。由唯一模型发布者在整合在途窄适配后分配未占用坐标，不覆盖正在使用的 `mp4-16`，不恢复旧 factory 兼容入口。既有调用持有固定组件，旧 lease 不被新发布偷换。

reader 与独立验证可以在互不冲突文件并行推进；最终绑定发布与完整组合验收须在所有改动整合后执行。输入计量算法未改变时不虚构算法改版，但精确 binding 和计量适用依据必须一致。旧型号收据保留原 tuple 与适用范围，不批量改标为新认证；共享协议回归不等于必须重复全部付费观察。

新增 bindings 为 0。RF-V1–V9、公开制品、双语说明、固定租约及真实 service 历史回放仍待执行。图像缩放、新注册引用、完整 Session/Run/Agent 系统和错误后补取账单均不因本决定纳入实现。
