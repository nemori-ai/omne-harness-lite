# D-098：输入限制提供者的分段技术采用

2026-09-28，主调度在用户持续实施及技术验收授权内，采用下列已完成独立评审的节点。实际范围以 [acceptance.json](acceptance.json) 的精确路径和摘要为准；尚未列入的候选不随同采用。

## core/model-profile v4

契约来源为 [D-097](../model-profile-v4-limit-contract-adoption/decision.md)接受的 MP4；技术方向沿[既有模型适配提案](../../proposals/model-request-adaptation/design.md)及 D-071 纯值采用方式。采用 [v4-design](../../../realization/packages/core/model-profile/v4-design.md)：root/schema 升级 MP4，保留显式 v3 与既有 v2 入口；精确数值、三态事实、十四项 Schema 定义、M15/M16 次序和完整快照形状按文落实。

独立 architecture-reviewer 核对 `51dd8ad98fc4e933e18d3cc630ca68a610efc7922e9cb7f7e6e537fd642133bc` 后无阻断或非阻断残留。其分段依据是 MP4 仅正向依赖 IV1/OE1/CB2；runtime、目录等是消费者，不构成纯值包的反向前置。所保留的硬前提是同次集成将尚未采用 MP4 的消费者明确固定到 v3，特别是旧 model-response Schema；不隐式升级，不按缺字段猜版，不补旧 cap。独立评审为只读，未执行产品测试。

本纯包不取得资源，不新增 Cordis 服务、时钟、存储、克隆服务或默认限额。目录更新时间、实际输入计量、快照写入和历史认回仍由其原 owner 承担。实施范围包含包双语 README、独立制品和 v4/旧版 Schema 不串版检查；实际实现与验证尚待交付。

## 取代范围与未采用部分

本次只使选用 MP4 的纯值 root 具备可施工映射，不原地修改 D-071 采用的 v3 文件，不改变仍显式消费 v3/v2 的契约。目录 v4、传输 v7 及其余数据/runtime/runner 增量保持各自评审和采用边界；不以本决定放行未知 token 算法、37 份定义或完整 service。

## 追加采用：目录 v4 与传输纯声明分段 A

在 D-099 接受目录4/RT6等后继后，主线采用目录 `v4-design.md` 与传输 `v7-input-limits-design.md` rev2 的下列精确范围。独立 architecture-reviewer 首评两节点无阻断，传输过渡公开面的定点复评也无阻断/非阻断残留；模型与目录能力边界不变。

目录采用完整值写读、同一行/清单共同状态事务、六项更新时间驱动、存量不完整行 unavailable 且列表不得部分成功、时钟倒退零写或回滚后 unavailable。存量升级仍要求装配显式提供有来源的完整新值，不猜 cap、不新建管理应用或存储平台；旧提交未知的责任不被普通失败吞并。

传输仅采用**分段 A**：纯 `./definitions/v4` 入口的六项 MP4 能力、完整读取/校验、配置 Schema、建档内容构造及八家声明数据，覆盖 IL-V1～3 中纯声明部分与 IL-V9。现有 root 的执行、旧 Pro 与 demo 仍显式消费 MP3；不得因 core root 升级而自动准许新版出网。新六项原值进入旧注册/规划须拒绝；合法旧输入携未登记的新 binding 为不可取得。禁止自动剥字段桥接，但不以修订字符串黑名单声称能识别可信调用者自行另造的合法旧声明。

**分段 B 的新注册、lease、计量、plan/send 尚未在本追加采用。**模型/provider 计量依据、模态承载与缓存认证仍逐项实施；纯声明完成不提升执行或认证状态。当前双入口是精确代际隔离，待 B 就绪按其另行采用迁移，不能变成永久猜形状兼容层。
