# 模型请求、上下文、媒体和会话切换（候选）

本页消费[共享内容和提交](shared-contracts.md)、[租户授权](tenant-and-authorization.md)、
[Run](session-and-run.md)及[工具 manifest](tools.md)。模型 wire 格式为边界
投影，不反过来拥有系统消息。所有模型用途统一经 OpenRouter。

## 目录、档案与当前能力

**MC-01**：模型档案有稳定 profileId、归属 scope、official/customized 来源、
revision、OpenRouter modelId、路由约束和 enabled/withdrawn 状态。official
原档公开只读；customized 由有权主体创建／条件更新／撤回。撤回保留历史
引用和原因，不复用 ID。恢复原档须有权显式 relist，产生新修订，不能复活
旧运行绑定。档案本身不是调用授权、计量事实或已安装 adapter。

能力事实绑定具体 OpenRouter model/provider 路由、观察来源/时间/修订、
输入/输出模态与格式、工具/参数支持、上下文及输出限制，值区分 supported、
unsupported、unknown。官方目录、提供者实测和用户档案声明分别保存来源，
用户自报不能覆盖已知不支持；缺席不等于已知支持。价格事实另有版本及
计量单位，不从能力等级推导模态。当前可用性不等同于长期目录条目存在。

**MC-02**：listCandidates 返回获准可见档案和 can_select/blocked/unknown
理由，不隐去可披露的不兼容项。资格依据包含当前用户/tenant/definition、
权益、部署与环境、事实支持及预算立场。模型等级只参与相关能力策略，
不能替代逐项模态/工具条件。事实来源断连或索引落后具名返回，不能把
旧目录当永久许可，不能私自换模型/出口完成请求。

## 一次请求与提供者绑定

**MC-03**：prepare 取得不可变 manifest：requestId、Step/辅助工作、Run
固定模型或辅助模型明确选择、profile revision、adapter generation、路由
约束、内容块及历史切点、工具映射、必需 skill、输出要求、估算/窗口依据。
准备不发网；材料/权限变化在准入时重检。发送前记录实际请求和费用 attempt，
通过当前授权、能力、预算与运行 epoch 的共同门。actualModel/provider
取供应方实际响应／核实，不用 Session 当前选择改写历史。

**MC-04**：请求状态 prepared → admitted → dispatched → settled，settled
区分 success/partial/failed/cancelled/unknown；未发出与可能已发出分别表达。
adapter 把系统内容投影到固定 OpenRouter endpoint，生成/解析不使用
任意用户 baseURL 或直连凭据。标题、压缩、后台推理、重试及多模态生成
都消费此能力；没有 Session 的系统工作仍有 WorkRef 和租户／费用归因。

**MC-05**：请求经 OpenRouter 的路由必须符合精确允许的 provider 集合和
参数支持。未授权模型 fallback、自动转写、工具模拟或静默模态丢弃禁止；
明确允许同 modelId 的供应方 fallback 时，所有候选须满足同一必需参数、
模态及预算条件，并记录实际 provider。HTTP redirect 不得转移凭据或模型
请求到非允许出口。供给动态变化不能改写已绑定请求；旧 adapter 排空
保留必要依赖，未开始旧请求可明确失效后重新 prepare。

**MC-06**：每次实际请求 attempt 有独立 ID 和计费记录。传输确认未发出
且政策允许时可发起新 attempt；可能发出后超时、断连或 abort，记录
unknown/partial，并在有供应方 ID 时查询原请求。重试须重新过当前门并
保留原尝试，不能把缺失 usage 当免费，不能承诺 OpenRouter 去重外部
请求或恰好一次生成。停止本地流不证明供应方停止或费用撤销；迟到计量
仍入原账。流中途错误不是正常 finish，部分内容明确可见。

## 共享内容与媒体取得

**CT-01**：内容能力提供 stageUpload、inspectUpload、retainReference、
read/download、releaseReference 与按政策 collect。上传限额、MIME/格式
支持和字节数在接纳前可查询；上传只有实际校验和存储完成才 ready。
引用已受理前的暂存可过期回收，持有有效历史/工作引用的媒体不可静默
回收；删除/保留期结束后返回具名 gone，不能返回空字节冒充原件。

**CT-02**：提交输入或确认输出时，内容引用与必要占用共同成立。字节
存储在外部提供者时，先取得已耐久且可核实的保留能力，源提交引用意图，
目标认回引用操作后才确认；中间失败保留待核实占用，GC 不穿过有效保留。
复用摘要不跨租户泄露内容存在或赋权，物理去重不合并逻辑 owner/读取权。
read/download 每次检查当前权限和内容状态，返回的短期位置不作为永久
历史事实。公开发布属于另一效果，不因模型生成或消息引用自动发生。

**CT-03**：输入保留 text/image/audio/video/file 的有序原件引用，每块明确
model_native 或 agent_attachment。原生语音必须实际以音频传给支持模型，
不支持具名拒绝；文件直送取决于具体格式和 provider 能力。仅供工具读取
的文件向 Agent 提供名称/MIME/长度及受限访问方式，不声称模型看过字节。
派生转写/抽帧需要显式操作及来源，不替代原始模态事实。

**CT-04**：模型原生媒体、工具生成媒体与已有制品引用都进入同一内容读取
治理。流按 blockId 和序号发出 start/delta/complete/error，文本可先到，
媒体在实际取得/存储进度后到；媒体内容失败不关闭此前所有文本，也不
伪造完整成功。只有完整块和媒体引用已耐久时才确认为历史内容；临时
增量可丢失，但最终已确认内容/顺序在刷新和恢复后保持一致。
结果记录完整/部分/失败及缺失块，原件不可取得不能被成功说明文字掩盖。

## 上下文装配

**MC-07**：装配在一个明确历史切点与贡献集合 revision 上计算，包含系统
指引、当前组织流程、有效历史、固定输入批次、选择的工具结果/帧投影、
原生媒体和必需 skill。贡献声明作用域、排序、来源和可见条件，同 scope
命名冲突拒绝；稳定排序不依赖插件随机装载顺序。动态变量在准备时求值，
秘密引用只在受限投送边界取值，不把凭据写入提示或日志。

必需 skill 核心正文与可调用命令集合一致，正文不足则缩小集合或拒绝。
压缩保留原始内容、已消费输入边界、工具关联和必需内容；未取批输入、
已撤回草稿和来自未授权会话的内容不能通过摘要或投影混入请求。
准备期间历史/贡献变化可重算一次新 manifest 或返回 conflict；发出后
manifest 不变，内容更新在下一请求边界生效，不宣称任意在途热改。

## 会话模型切换

**MC-08**：switchModel 有稳定 operationId、目标 profile/model、观察到的
Session/selection revision、历史切点、压缩尝试状态及结果；有权用户
改变本 Session 的未来选择，不修改用户偏好或定义。若 Run 仍活动，
将切换意图登记为 pending_next_run，在当前 Run 安全边界后完成实际
检查和提交；pending 不是已经生效。期间可显式取代请求，旧意图不能
随后覆盖新选择。Run 准入与选择生效共享屏障，避免半次切换。

**MC-09**：实际切换按当前 durable Session 模态集合和 target 实际能力
检查，已知不支持与 unknown 分别拒绝。压缩/缓存丢失不能删除模态；
派生 Session 只消费派生切点已有事实，不能混入母会话后来媒体。
模态历史不可信时阻塞；不得为使切换成功静默删图、转写或换目标。

**MC-10**：通过模态门后，按目标已知窗口、配置比例和输出预留检查当前
有效上下文。超限仅为该切换发起一次具名 compression 工作，所有请求
仍走当前授权/预算和 OpenRouter；压缩所用模型明确记录，不能让目标
模型或旧模型的选择被隐式猜定。默认使用切换前合法模型，无法使用时
返回 compression_unavailable，不偷偷更换。压缩保存 summary 及原切点
引用，原历史和模态集合保持。

一次压缩的发起/可能发出/结果状态耐久记录；未知时核实原 attempt，
不借 switch 重试无限压缩。成功摘要即使随后切换失败仍保留；复核后
仍超限或压缩失败则拒绝，原模型选择不变。窗口未知记录诊断但不当成
已知超限拒绝；仍检查其他已知容量限制。切换提交前再核对权限、版本
和历史变化，无法沿原切点有效完成则 conflict，不重复压缩掩盖竞争。

**MC-11**：下一 Run 取得已经生效的精确选择，重新计算模型工具能力及
部署/权限交集。旧后台工具保持原绑定/归属，不因切模型终止或重新调用。
回复中的 actualModel、来源 request/attempt 及费用独立保存；候选列表、
设置更新成功和实际模型执行成功分别报告。

## OpenRouter 的具体映射依据

2026-09-13 查阅官方文档；它们是时点证据，实际实现还须固定 API/SDK
依赖版本并用请求/响应 fixture 及获准真实调用验证。

- [Multimodal overview](https://openrouter.ai/docs/guides/overview/multimodal/overview)：
  Chat Completions 使用 image_url、file、input_audio、video_url 等内容类型；
  具体模型/格式支持仍需判定，不能只据 API 联合类型标记全模态已支持。
- [Audio](https://openrouter.ai/docs/guides/overview/multimodal/audio)：原生音频输入
  使用带格式的 base64；音频输出需相应 modalities/audio 配置和 streaming。
  本项目因此在 adapter 中保留音频块和部分交付，不能统一替换为文本。
- [Models](https://openrouter.ai/docs/guides/overview/models)：目录包含模态、
  参数、上下文和价格信息；请求全输出模态目录需明确过滤，不能只取默认
  文本目录。目录观察和实时可用资格分别存储。
- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)：
  `require_parameters` 可以排除不支持所需参数的 provider。它参与本项目
  必需参数约束，但不代替租户授权、精确请求记录或端到端模态验证。

本版具体提供者选择项目自有 OpenRouter adapter，首版采用标准 HTTP/SSE
映射而非引入被 D-006 排除的 DSH DeepSeek/pi-ai adapters；源码 fork 阶段
仅导入允许的 dsh-llm 基础，不宣称已交付该 OpenRouter adapter。
