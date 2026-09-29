# xAI 两叶完整输出组贡献的有限适用性

2026-09-29，revision 1，candidate，未采用/未实施，新增bindings 0。接续[D107完整输出组](v13-output-history-design.md)、[已采用共享家族机制](priority-family-output-cache-candidate.md)、[basis关系](image-preparation-basis-applicability-candidate.md)及[D108拒绝映射](v14-refusal-design.md)。RT10/MR9的estimated、完整组、来源、失效与贡献不可用表面足以表达；不升公共契约，不依赖ACK/T29，不新增框架、plugin或通用walker。

依据为[固定xAI窄研究](../../../../../research/model-request-adaptation/vendor-continuation/xai/2026-09-29-closeout-evidence.md)及其逐项SHA来源，原件已在HUB `bb992237d7a02d6074d9257f84b70e86e440bbc7`存在。本候选只从这些固定事实选择**有依据的估算**，不把native Responses回放或Grok Build密文字节估算写成OpenRouter的token等式。

## 选择及公开范围

仅 `x-ai/grok-4.6`、`x-ai/grok-4.7`，固定OpenRouter provider=xai、单route、allow_fallbacks=false、require_parameters=true、stream=true、store=false。主线已协调后继两叶definition revision `5` / implementation `pi-ai:xai` revision `mp4-19`；现visible前驱为`4/mp4-18`，旧材料中的`3/mp4-17`不是当前factory。不保留旧factory/自动升级配置。

对完整、原样保留、同一模型的一个原输出组，采用原upstream `usage.output_tokens` **O一次**作为其下次输入贡献的workload相关estimated代理，净组framing修正取0作为明确估计假设。O已含reasoning，不另加reasoning_tokens，也不再加同组text/tool的可见计数。不是精确输入占用、不是上界，不声称密文长度对应token。其余可见单位用原visible counter和共享JSON净framing；full/new/φ唯一共享贡献函数，margin仍只在已有最终门加一次。

原生官方文档只支持“原样回送encrypted reasoning有延续上下文作用”；两叶OR真实输出中已见`xai-responses-v1`密文，但既有六次holdout输入为预构造明文，**没有已完成真实密文二轮认证**。因此该估计需下表新验收，不能将旧case改标签当通过。

## 有限来源与依据表

每行同时要求精确模型ID匹配，provider=xai，源origin和实际字段没有矛盾。`origin.adaptation`中的定义/implementation/模型须整体匹配下表；若requestInput known，还必须由共享C关系核algorithm/tokenizer/replay/transform全部原坐标。不按版本范围、mp4前缀或模型名相似匹配。

| 来源行 | 定义/实现 | meter algorithm | tokenizer | replay | projection |
| --- | --- | --- | --- | --- | --- |
| X46-V3 | 3 / pi-ai:xai/mp4-17 | grok-build-visible-text-tools-effort-offset141-2/response-calibration-1 | tokenizer-basis/grok-build-visible-text-tools-effort-offset141-2 | visible-final-units-json-net-estimated/1 | openrouter-input-projection/2 |
| X47-V3 | 3 / pi-ai:xai/mp4-17 | grok-build-visible-text-tools-effort-offset1181-2/response-calibration-1 | tokenizer-basis/grok-build-visible-text-tools-effort-offset1181-2 | visible-final-units-json-net-estimated/1 | openrouter-input-projection/2 |
| X46-V4 | 4 / pi-ai:xai/mp4-18 | 同X46-V3 | 同X46-V3 | 同X46-V3 | openrouter-input-projection/3 |
| X47-V4 | 4 / pi-ai:xai/mp4-18 | 同X47-V3 | 同X47-V3 | 同X47-V3 | openrouter-input-projection/3 |
| X46-V5 | 5 / pi-ai:xai/mp4-19 | xai-visible-json-complete-output-group-estimated/1 | 同X46-V3 | xai-complete-output-group-workload-estimated/1 | openrouter-input-projection/3 |
| X47-V5 | 5 / pi-ai:xai/mp4-19 | xai-visible-json-complete-output-group-estimated/1 | 同X47-V3 | xai-complete-output-group-workload-estimated/1 | openrouter-input-projection/3 |

所有行的基础transform为`openrouter-wire/2`。D109图片准备复合revision仅交共享inspect/relation判断，不由xAI解析字符串或删除原basis字段；必须识别精确base和实际变换语义，未知包络unavailable。此页不新增图片计量域。当前meter algorithm/replay真实改变，必须升坐标；原visible算法、偏移141/1181和tokenizer surrogate均未变，不伪升tokenizer。V3值取固定xAI源码`531143471d596783db4838d1786fd7997e3fde41`的factory构造；V4沿主线visible发布，仅表示源解释，不声称actual certification。实施提交必须导出这些工厂值逐字段核表，任一不符先纠正候选/采用，不能编造历史。

研究中的definition1/mp4-1真实请求记录是原研究证据；其I/O和格式观察可支持估算选择，但本页**未采用它为现MR outputHistory原basis**。研究脚本unbound candidate、nativeReasoningTokens、手工构造TLS组同样不进入来源表，禁止给它们补现binding或改原inputCalibration。仅原requestInput缺席时，可由真实且完整可核的history.origin、完整组/原O及上述有限binding行作O解释；原I仍不可重锚。已知requestInput但算法未知不因origin看似相同而绕过。

## 家族守卫与失效

1. classifier三态沿共享接口：纯可见合法unit→visible；包含有效`xai-responses-v1` reasoning.summary（非空summary）或reasoning.encrypted（非空data）的完整assistant组→wholeGroup；未知format、无法解释的opaque或缺必要字段→uninterpretable/unavailable。不把false落进JSON/BPE去分词密文，不删除summary或任何原块来凑可见输入。共享source/摘要不一致仍先invalidInput/malformed，不能降级full绕过真实性。
2. 完整组的块身份、选择顺序、同一assistant消息、全部原块可见、实际wire投影、工具domain callId及完整参数均由同一个共享组核验证；O仅合法非负整数且source=upstream。缺O、partial组、未知来源不可补造。存在同组多种reasoning+text+tool时只覆盖一次；多个完整组各计一次。
3. 原origin.parameters.reasoningEffort与当前实际wire reasoning.effort分别限于缺席或low/medium/high，且二者必须相同（缺席只与缺席相等）。改变effort会使旧组本候选贡献unavailable，不能以新effort重解释原O；max_tokens变化不改变O解释，但原完整envelope变化依原C使I/φ失效而走full。xhigh/max/none不在本供应域，不暗改统一值含义。原字段缺席不猜默认；固定mode=OR chat wire承载xai-responses-v1，不声称这是native Chat直接回放ciphertext。
4. 原origin若有servingProvider或upstreamModel，须与实际response provenance一致，并命中实施前从固定真实原件提取的两模型有限身份映射；缺席不得被填成xai/路由名。未取得精确映射时相应组unavailable，不能以contains(grok)等宽匹配放行。模型ID/provider冲突为可判来源矛盾，先按既有接收拒绝；没有冲突但无法解释为unavailable。
5. 本候选不声称xAI有Anthropic那种签名前缀核验契约，因此requiresSignedPrefix=false，不借用Anthropic签名facts。但模型/basis/原前缀实际变化仍按统一C使原I/φ失效；full需再次核完整组来源后才独立应用O。φ只在完整同一有效依据和合法追加前缀下复用I；unknown I不由O推导、unknown O不借I补造。输出组O可解释与输入I可复用分开。

所有guard均为模型家族有限数据/纯谓词，共享own/source/group walker/精确加总/cover/unavailable传播保持唯一。当前完整计量不可得则沿PF-N1解释到既有PlanFailure invalidInput/input_size_unavailable，禁止send；不增模型专属错误枚举。

## 图片明确未采用

Grok Build 765/image注释仅低分辨率compaction粗估，当前4MiB字节cap不推出尺寸域；当前wire省略detail，官方snapshot没有给两叶OR图像token公式。不得把765推广到全域、借OpenAI/Anthropic算法、缩成测试图白名单或削掉产品图片供给目标。本页只释放opaque实现；图片estimate适用性和实际public/service差分仍是两叶完整交付缺口，另行用D109最终prepared尺寸/编码/字节取得事实。

## 新验收与旧证据复用

| 义务 | 精确覆盖 |
| --- | --- |
| X1 有限表及发布 | 两模型逐字段factory导出表；新5/mp4-19当前实现，旧3/4仅原事实解释；未知revision/algorithm/provider/上游identity、跨模型/effort改变反控 |
| X2 唯一组贡献 | full/new/φ参数化同一数值oracle；text+summary+encrypted+tool整组O一次，两个组、不相交I、O=0、reasoning不另加、margin一次；密文tokenizer调用零 |
| X3 完整性与真实性 | partial/repeated/乱序/跨message/错误callId/参数不完整/坏摘要/篡改origin；可判伪造invalidInput，未知解释unavailable，full不绕源检查 |
| X4 失效 | 模型、算法、effort、max_tokens、prepared历史投影变化分别检查；I失效时full独立O前提，φ只同有效basis，unknown I不重锚 |
| X5 真实两入口 | 两叶公开独立invoke及真实Cordis service各三轮原回复回放；记录完整wire/source/basis/O/完整I/cache/cost、估计误差及局限；工具结果只配原真实callId；含stream与无第二send拒绝 |
| X6 复用 | 原visible77/55测试、14 service TLS及六个upstream fit/holdout按精确源码与行为无影响复用；受控TLS/研究候选/旧明文holdout不能充新opaque真实认证 |

low/medium/high供给已有，但当前原真实观察没有覆盖各effort的opaque二轮；采用同effort estimated策略不等于已验全域，认证需区分实际覆盖，至少每叶主路径真实三轮及各effort本地正反分支。上游更改实际身份/format时显式unknown，不能继续声称原认证有效。README/README_ZH同步能力、估算口径及图像剩余缺口。

无新状态机、持久关系或跨owner提交；不新增TLA/Alloy，以既有RT10形式性质和上述家族正反/真实差分承接。未执行新paid，最终采用及真实认证归主线。
