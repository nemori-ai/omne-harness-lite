# D-015：工具闭环、消息流与外部 Hooks

- 状态：旧谱系设计已接受；目标新 v1 仍为候选。D-018 已接受八组 E 新可观察语义的**设计方向**，未接受其余新增接口或目标坐标发布。
- 来源：`e3573ca72d18bfe7ddd002df5025551b51eede46:docs/decisions/D-015-tool-execution-message-stream-and-hooks.md`，SHA-256 `34cd8b955485d632c76cf0e9ae7adac2cd97fe75e1baf9c44f07ee53a4d83238`。旧接受提案是同修订 `docs/proposals/tool-execution/README.md`、`docs/proposals/message-stream/README.md`、`docs/proposals/hooks-compat/README.md` 的“接受记录”；当前 E 的新比较见[消息流提案](../../proposals/message-stream/README.md)与[Hooks 提案](../../proposals/external-hooks/README.md)。
- 接受依据：2026-09-15，D-015 在三轮独立复核及用户 U-38～U-59 裁决后接受旧谱系工具、消息与 hooks 同批目标设计及有限模型。它替换 D-008 的 CD/DR/CT/TL/HD/MC 旧版依赖身份及 D-014 的 Session/Run/LC/RunDriver 旧版身份；未改选择仍有效。

## 保留的选择与当前拥有者

| 选择 | 当前候选入口 |
|---|---|
| Run 等待谁由对象登记与释放；被越过 Run 有 `superseded` 终点，调用生命周期/前后台/强停/帧有自己的 owner；Step 收束和迟到交付须一致。 | [Run RN](../../spec/capabilities/run/v1/contract.md)、[Tools TL](../../spec/capabilities/tools/v1/contract.md)、[RunDriver RD](../../spec/capabilities/run-driver/v1/contract.md)、[LC](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)。 |
| Agent 向人提问和请求批准是内建 `human` 工具调用；答复是调用结果，系统批准另守唯一消费。 | [Human Decisions HD](../../spec/capabilities/human-decisions/v1/contract.md)、[Tools TL](../../spec/capabilities/tools/v1/contract.md)。 |
| 客户端消费一套消息模型；耐久事实、授权投影、增量/游标与瞬态帧各有边界，出站流不创作事实或授权。 | [Core Work CD](../../spec/data/core-work/v1/contract.md)、[Message Stream MS](../../spec/capabilities/message-stream/v1/contract.md)、[Model MC](../../spec/capabilities/model-execution/v1/contract.md)、[Media CT](../../spec/capabilities/media-content/v1/contract.md)、[Durable Records DR](../../spec/capabilities/durable-records/v1/contract.md)。 |
| 命令式 Hooks 只能消费受限站点与效果上界；Stop 续跑有刹车，程序化作答需资格。 | [External Hooks HK](../../spec/capabilities/external-hooks/v1/contract.md)、[Session SE](../../spec/capabilities/session/v1/contract.md)。 |

## 局部覆盖和待判范围

[D-018](../e-message-stream-hooks/decision.md)只在 MS-06/22/23/24 与 HK-02/07/15/16 指定的可观察行为上覆盖旧 D-015，并保持其余旧保证；固定目标 contract SHA 不等于接受其全文。MS-07 的“已收齐”经旧 MS-08/09 与 D-018 MS-22 可澄清为授权内容已安装，但具体取数机制仍须分类。尚未有独立接受依据的公开协议选择集中在三组：MS-08/11 的完整授权 `changes`/coverage 与无帧时主动对账；MS-12 的 replacementToken、三维 CAS、完整读面及缺席分类；MS-04/20/23 的换代 marker、epoch/route/historyAnchor 与公开帧语义。旧源已保证的上界和读权不能为凑新选择重复申请；HK-07 的 pass/close context 正文还须保持一致。D-018 设计方向不替代 J 联合验证、I 的 catalog/冻结或 provider/客户端符合性。

[D-019](../pi-ai-openrouter-transport/decision.md)仅决定 ModelHost 下 OpenRouter 传输采用定向 pi-ai fork，不取代本决定对 Model attempt、费用来源、Run/Tools/授权/预算 owner 的边界。RN-05 强停安全门与 IN-02 快捷键 typed-target 是 2026-09-16 独立接受的新语义，不能追溯记为 D-015 旧版接受。DR 新个人创建和通用 v3 codec 的候选需独立审阅；批内 append 顺序沿旧 source caller-frozen 顺序核对，不从编码更换推断新排序政策。

旧工具与游标的有限模型有明确抽象边界，不包含跨域交接、多 Run、全部授权变化或真实提供者。当前 21 个迁移坐标中的每一条 source→target 关系、跨能力消费者、实际形式任务与资源 hash 仍须在 I 的精确采用记录中闭合。
