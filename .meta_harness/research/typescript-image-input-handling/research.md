# pi、DSH、LangChain TS 的图像处理边界

- 调查对象与日期：README 所列精确 commit，2026-09-29。
- 消费者：本项目 content-blocks Schema 等价验证、pi-ai-transport 图像计量。
- 当前结论：DSH 的 sharp 调用覆盖尺寸/格式/动画帧数探测和栅格解码；pi 以 Photon 实际重编码和缩放；LangChain 的代表 OpenAI 路径主要投影内容，其预估 token 路径忽略图像。三者都不能直接证明本项目整个 Schema 或 meter 可等价替换。

## 问题与区分条件

“支持 base64 图像”至少有五个不同命题：接收字符串、接受集合验证、MIME 与实际字节相符、图像可解码、模型输入 token 可估计。物理 resize 改变发送字节；meter 的尺寸计算不改变发送字节。上游通过某种图像类型/schema/example 声明，不足以证明实际验证或预算。

## 当前结论

### pi 的代表 read 路径在二进制图像上调用 Photon，而不是对大型 base64 使用验证正则

事实：`createReadToolDefinition().execute` 先 sniff 文件 MIME，读取 Buffer，调用 `processImage`；后者默认经 `resizeImage` → worker/进程内 `resizeImageInProcess` → `PhotonImage.new_from_byteslice`。尺寸来自 Photon；EXIF 朝向处理后按 2000×2000 和 base64 编码后 4.5 MiB 默认预算挑选 PNG/JPEG 输出，必要时继续缩小。输出 base64 由 Buffer 编码。依赖精确为 `@silvia-odwyer/photon-node@0.3.4`。这是可执行函数链，不是示例。

MIME sniff 是 pi 自写代码，读取头部最多 4100 字节；PNG 有 acTL 检查，GIF 只按 GIF 前缀识别，WebP 按 RIFF/WEBP 识别。该路径没有像 DSH 那样显式使用统一页数元数据拒绝 GIF/WebP 动画。没有本轮全动画解码验证。

这条实际处理链同时约束像素和 base64 编码字节，能够通过重新编码／缩小图片降低请求体积，因此是共享图像预处理的候选来源。它是否满足本项目“保留原图、使用派生表示、计量最终发送图片”的既有转换契约，属于独立映射核对；不能仅因它不是 token 计量器就排除其预处理价值。2000×2000 与 4.5 MiB 是所查 pi 调用的默认参数，不是本项目或各模型的固定政策。

适用范围：文件 read → coding-agent 输出图像路径。它从字节开始，不证明任意外部 base64 输入已经验证；不证明仓库所有入口无 base64 正则。物理尺寸/编码质量预算不是精确模型视觉 token 算法，4.5 MiB 注释是 pi 自述的预算来源，不是本轮重新认证 Anthropic 限额。

代价与不适用：worker 与 WASM 解码/多次编码、原图和输出分配；自动缩放关闭时可直接编码原字节。转换失败返回 null/文字替代的产品行为不适用于本项目已有失败语义。pi 自写 MIME sniff 不能据其成熟项目身份自动成为可复制的通用验证器。

来源：[E1](evidence.md#e1-pi-文件图像处理)。最近核对：2026-09-29 / pi 0.86.1 固定 commit。

### DSH 明确分开 canonical base64、来源字节上限、解码和请求图像预算

事实：`admitEncodedImages` → `decodeCanonicalBase64` 使用 Node Buffer 解码并回编码全串相等，不用大型重复分组正则；随后 `saveImages` → `prepareImageFile` 在 decode 栅格前检查来源 bytes（默认 20 MiB），`inspectMetadata` → `detectImage` 用 sharp。实际 MIME 与声明不符报错，像素/单边上限检查后 `.raw().toBuffer()` 强制像素解码。尺寸考虑 EXIF；`metadata.pages > 1` 标为动画。依赖声明 `sharp:^0.35.3`。

DSH 的正常化会重编码：转 sRGB、旋转、inside resize；动画不能 pass-through，输出要求非动画。normalization 的 4 MiB 是编码目标，quality ladder 不达标时保留最小输出，不是保证成功输出 ≤4 MiB。request-image 同样有目标/最小候选回退；真正请求总量由 `prepareImages`/`inlineImages` 的 raw/base64 两种预算检查承担。

token 定价按 `resolveRequestImageTarget` 后的目标尺寸进入 DeepSeek 专属 `deepSeekImageTokens`；usage 仍是另一事实来源。此公式不适用于 OpenAI named patch rules，更不适用于本项目 37 模型的统一推广。

适用范围：所列 admission/store/DeepSeek 请求路径；不继承 DSH 附件存储、离线卸载、Agent 或服务所有权。base64 在批量 admission 前全部解码，不能据此声称超大编码字符串有低内存成本或已预先限流。

代价与不适用：sharp 为异步栅格处理；DSH 解码使用 `failOn:'error', limitInputPixels:false`，依靠自己先验尺寸检查。sharp 官方 v0.35.3 默认 `failOn:'warning'`，默认只读 1 页；metadata 不解码像素。这说明 DSH 强制解码不等于把全部动画帧全部解码，且不能无条件照抄关闭库像素保护的选项。

来源：[E2](evidence.md#e2-dsh-分层处理)、[E4](evidence.md#e4-sharp-底层能力与限制)。最近核对：2026-09-29 / DSH 与 sharp 固定 commit。

### LangChain OpenAI 代表路径主要投影图像，不提供可复用的栅格计量闭包

事实：`ChatOpenAICompletions._generate` → `convertMessagesToCompletionsMessageParams` → standard 内容转换；图像 URL 保留，base64 data 组成 data URL。所读路径不调用图像栅格解析、动画检测、resize 或图像字节预算检查；未证明其他 provider/入口也如此。

`getNumTokensFromMessages` 调用 core `getNumTokens`，后者只拼接 text 类型，其他块贡献空串。因此该估计链不能代替本项目视觉 token 估算。包依赖有 js-tiktoken/OpenAI SDK/Zod，所读 OpenAI 包 manifest 没有栅格库。

附加有限观察：core 旧 `parseBase64DataUrl` 用一个字符类的正则匹配，默认返回字符串；选 asTypedArray 才 atob 解码。该表达式允许任意数量尾部 =，不能当本项目严格 padded base64 等价验证。Google GenAI 分支对某些 Uint8Array 使用 `String.fromCharCode(...data)`；本轮未运行此上游代码，不据此声称已复现其大型输入溢出，也不能当大型字节安全转换证据。

适用范围：固定 commit 的 Chat Completions 和所列附加 helper；未来重构或 Responses 其他入口未审计。代价与不适用：将图片原样交 provider 保留输入，却把图像合法性/计量证明留在调用者或服务端；不能静默把未知图像费用当零。

来源：[E3](evidence.md#e3-langchain-ts-投影与计量)。最近核对：2026-09-29 / 固定 commit。

### canonical 回编码校验不能直接替代本项目 InlineBytes 的 Schema 接受集合

本项目 CB v3 InlineBytes pattern 要求标准字母表、按组填充、非空、不含换行；pattern 不检查最后一个符号的未使用位。Node v24.18.0 小型实测：`Zh==` 匹配 pattern，但 Buffer 解码后重编码为 `Zg==`；因此 DSH roundtrip 规则严格于该 pattern。本项目现有 openai-images meter 已另行要求 canonical 回编码，这个既有局部规则与通用 Schema 等价不是一回事。

判断：不能为了避免栈溢出把 CB 既有 pattern 悄悄改为 canonical decoder，也不能仅依靠 Buffer 解码成功就接受输入（它会容忍部分非标准形式）。本轮不定义替代算法，等价实现由并行修复负责。短串反例不证明 4 MiB 性能/栈行为，后者是独立验证义务。

来源：[E5](evidence.md#e5-本项目冻结基线与短串反例)。适用范围：CB v3 该 pattern 与 Node 24.18.0，非 RFC 所有政策裁决。最近核对：2026-09-29。

### 成熟库可覆盖探测职责，但本轮未证明任何整段替换与现有 meter 等价

| 本项目职责 | 上游事实提供的可复用能力 | 尚不能直接采用的部分 |
|---|---|---|
| CB Schema 等价验证 | 原生字节编码库可避免自己实现 base64 codec；DSH 展示 canonical 验证调用 | canonical 规则比 CB pattern 严；图像库不能接管所有 inline bytes |
| MIME/尺寸探测 | 现有 image-size 已为成熟依赖；DSH sharp 元数据支持格式、尺寸和页数 | sharp 解码/异步/native 成本；朝向语义与 image-size 原尺寸需核 |
| 手写 singleFrameGif | sharp pages 能表达 GIF 是否多帧；可作为候选证据，无需从零写帧 parser | pages=1 不证明本地 exact trailer/截断/垃圾尾巴同样拒绝；metadata 非全解码 |
| 字节 resize | Photon/sharp 已有真实调用者 | 当前 meter 不发送重编码后的 bytes；搬入会改变输入和预算基准 |
| token 计量 | DSH 明确将请求尺寸与 provider 公式相接；pi 区分编码字节预算 | DSH DeepSeek 公式、pi 像素默认值、LangChain text-only 估计均不能替代本项目已接受 named rules |
| 4 MiB 大输入 | DSH 没有重复分组正则；pi 从字节编码 | 未运行上游 4 MiB 基准；解码+回编码仍有 O(n) 分配，LangChain helper 也未证明严格集合或性能 |

这张表是能力匹配与证据边界，不是采用决定；本轮没有新增 parser、库依赖、模型或媒体平台。

## 未知与最小后续证据

| 未知 | 最小区分验证 | 消费时点/责任 |
|---|---|---|
| 替换库与现有 GIF 接受集合 | 单帧、多帧、截断 subblock、缺 trailer、尾随字节、伪有效头、损坏像素；同时区分 metadata 与 decode | 图像提供者设计/实现选择前 |
| 同步 meter 接口、耗时/内存与库异步解码 | 离线公开 fixtures，含 ≥4 MiB base64、较大尺寸和异常；不得静默放宽图片输入 | 提供者实现/验证负责人 |
| CB 等价与大输入稳定性 | 原 pattern 正反例集合 + padding bits + 空白/base64url/填充边界 + ≥4 MiB；新实现保持精确集合 | base64_validation_fix |
| sharp / Photon 在本机构建平台可用性 | 锁定依赖和受控离线调用；本研究未安装/运行 | 若设计选择库时 |
| token 与发送字节的一致 | 保留现有公开 plan / meter fixture，证明库读取不修改 sent bytes、不改 detail/family规则 | 本纵线接受检查 |

## 采用与后续核对

尚未采用；主线可将事实升格正式 research，再由对应设计承担选择。只有来源版本、输入契约或库调用方式变化触及上述结论时需要重核；无需展开完整媒体系统。
