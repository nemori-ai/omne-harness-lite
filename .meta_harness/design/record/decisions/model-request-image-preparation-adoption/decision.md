# D-109：请求期图片准备的技术采用

2026-09-29，主调度沿用户「Implement the plan」「主调度者和验收者」、复用成熟图片缩放方案及持续完成 model runtime 纵线的授权，接受[候选 A](../../proposals/model-request-image-preparation/alternatives.md)。本次是提供者技术接受，不代替用户对完整交付的最终验收。

## 精确采用与理由

采用 [transport v15 revision 4](../../../realization/packages/model/pi-ai-transport/v15-image-preparation-design.md)（SHA256 `3cf764f6218c2286a93381a5969368085efdd4e9992014ec6c7edd3f8518e26a`）及 [runtime v21 revision 3](../../../realization/packages/model/model-request-runtime/v21-image-preparation-design.md)（SHA256 `767a636ff35833b28c5ecb159c477b4a76ca1515f4646566f7f05c47ba0e82bf`）。配套 [PF-013 projection/v6](../../../product/PF-013-model-profiles-and-invocation/projection/v6/projection.md) 的 SHA256 为 `5bfdb016b02479dafaf2101035980b35b64de90d4661e31d33a10912e633ce91`，provenance 为 `afe5f324aa61d15ef673069b581da903d0b16a3b5a84585af3722851197add7a`。原候选标签和 provenance.acceptance=null 保留快照时刻，现行技术接受由本决定给出，不改受审正文。

主调度回读两节点、候选比较、独立评审及10份投影来源，核对15个交接资源；导航整合保留既有 D108，技术正文摘要一致。[独立架构与表达评审](../../proposals/model-request-image-preparation/review.md#2026-09-29-r3r4-收束记录)在上述精确修订均无其范围阻断；历次发现及失败保留。它们没有代做实现、真实 HTTP 或资源峰值验收。

A 将独立 public 与 runtime 的图片处理放在同一请求路径，原消息不变，避免消费者分别补准备与计量时序。代价为 plan 统一异步迁移、首遇解码成本和有限资源归属。B 保留同步 plan 但把必要责任散给每个消费者；C 增加本轮未要求的持久媒体产物和治理。当前已有成熟 codec 的有限可行性证据，采用 A，不建立媒体平台。

采用节点列明的 `model-image-balanced-v1` 作为显式可替换本地 preset，采用已显式加载 sharp 0.35.3 的薄适配。数字是项目的资源与搜索政策，不是上游限制，不是任意图像必可转换的保证。保留 codec revision 的实际 libvips/平台/像素语义；装配负责加载，纯入口不得隐式 import、下载或读取路径。

## 取代范围与不能删去的保证

只替换当前图片原样投影后直接因可转换超限而拒绝的提供者路径。统一 async plan/context，无同步兼容执行；图片准备先于实际投影计量和最终序列化，发送阶段不再次转换。原 PlanInput、源摘要、usage 和 outputHistory 不改写。先验证原事实，再建立临时图片映射，坏来源不能借 full 重算逃逸。

搜索与资源以最终 v15 r4/v21 r3 为准；提案 r1 中已被后继修正的候选计数、早返或接口草图不作为并列施工依据。逻辑 ordinal 前缀不随缓存冷热变化；总量按真实 JSON/data URL 字节，不固定均分。无图才能把 nonImageWireBytes 当完整 exact actual，有图仅是下界。

full/φ/δ 消费一个共享依据关系实现，φ 显式取得当前 countingBasis；当前可解释性、原 O 适用性与原 I 前缀复用分开。不得为各型号另补 compound 条件或清掉仍有效的原输出计量。所有原严格 binding 与来源范围继续成立。

真实 owner 持有异步准备；取消后等待 native 实际终结才释放，close 不能以 Promise.race 假完成。缓存有限、按受信 tenant/session/log-generation scope 隔离，scope 不赋权。借用 codec 最后由其 owner 释放，不依赖 Cordis 多个 effect 的完成顺序。不增加服务键、持久对象、跨 owner 同一提交要求或业务操作。

沿已接受 RT10/MR9 及各现有精确依赖；本次不改变 catalog/frozen/covers/formal-tasks，不新增规范版本或实际 binding。T29 的新注册引用、完整 Session/Run/Agent、外部媒体下载与持久派生存储不在本次采用范围，也不成为实施前置。

## 实施与验收门

释放两个已采用节点的实现及 IP-V1～10。先落公开类型/协议接缝，再按独立文件推进成熟 codec 与有限搜索、runtime 异步生命周期和 scope、共享计量依据迁移；最终由主线组合。官方 definition/binding 的发布继续由唯一模型 owner 负责；新行为不偷换已固定 lease，原认证收据不改标成新源码已认证。

验收必须包含超限图实际缩放后 public/service HTTPS、原历史不变、异常格式/动画/EXIF/alpha、非均匀多图总量、缓存冷热同结果、取消与原生任务排空、资源上限及 native 峰值、三轮稳定复用和失效、完整 meter/wire 同源、包制品及双语可运行示例。现有 sharp 8例与4096有限搜索组合只支持有限可行性，不关闭这些义务。实施如发现性质冲突回报精确反例，只阻依赖部分，不自行扩域或放宽验收。
