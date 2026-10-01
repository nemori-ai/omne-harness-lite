# 第一方字段与请求组合复核：2026-09-27

结论：目录能确认固定37个身份及所选route的元数据，但不能填成37份完整正式定义。新增15次合成、非流式OpenRouter Chat请求取得了真实reasoning＋tools和两款Claude签名回放的有限读数；简单工具请求的零reasoning与Luna low算错结果均保留。没有生产适配、流式runtime或official认证结论。

调查对象仍是用户确认的八家37个精确ID，没有用相近型号替换。三路第一方取得222个原文／工具工件；主线逐个核摘要，并从原JSON重算全部37项身份、唯一所选tag、模态、token字段、参数集合、tool-choice标志、reasoning和cache元数据。222是工件数，重复URL、Markdown／MCP表示不是独立证据。完整归档、逐字段JSON pointer和哈希见[来源索引](../evidence.md#2026-09-27-第一方与组合复核)。

## 目录字段的实际重算

原models有458项；固定37项及37个所选tag均唯一匹配。模型层输入声明为text37、image31、video10、audio2，额外file20原样保留；输出全部text。architecture声明没有证明每个endpoint实际收得进对应媒体。

所选endpoint中18项max_prompt_tokens为数值，19项为null；全部有context_length和max_completion_tokens。未把null填0、把共享窗口直接当独立输入上限或用aggregate代替所选route。例如DeepSeek Flash的aggregate输出384000／所选131072，Pro为943718／16384；GLM5.3为943717／131072，GLM5.3 Flash为128000／131072。以上只报告来源字段，不决定项目能力值或窗口换算。

所选37条均列tools、tool_choice和response_format，30条列structured_outputs。参数名、厂商按值标志和实际请求效果是不同证据；未报告不是false。maxImageBytes、完整数值域、组合条件和19项只计输入的上界仍未闭合。

## OpenAI：原生限制与OpenRouter实际请求分开

主线先搜索并实际获取[官方模型指导的API参数段](https://developers.openai.com/api/docs/guides/latest-model#gpt-6-astra-update-api-and-model-parameters)：原生Astra的tools需要Responses；Sol／Luna原生Chat仅在none支持函数工具，reasoning＋tools需要Responses。原生限制不能直接推成OpenRouter Chat不支持。[OpenRouter GPT6迁移文档](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/gpt-6)公开特殊配置项转换；它没有为本次请求提供逐字段native-wire日志。

全部实际请求固定openai tag、allow_fallbacks=false、require_parameters=true，实际响应均报OpenAI。普通developer提醒不带configuration_update。

| 样例 | 请求effort | 实际reasoning tokens | 工具参数 | 有限观察 |
| --- | --- | ---: | --- | --- |
| Luna简单工具 | none／low | 各0 | ALPHA | HTTP200且tool_calls；未证明low产生reasoning |
| Sol简单工具 | low | 0 | ALPHA | 同上 |
| Astra简单工具 | low | 0 | ALPHA | 同上 |
| Luna十二步checksum | low | 546 | 983331 | 实际reasoning与工具同时出现；答案错误 |
| Luna十二步checksum | high | 615 | 540360 | 与独立整数计算一致 |
| Astra十二步checksum | high | 668 | 540360 | 与独立整数计算一致 |

checksum定义是从x=17开始，k=1..12逐步令x=(37x+k²+11) mod1000003；主线独立BigInt计算为540360。三条计算请求均带reasoning.summary和reasoning.encrypted。错误样例是原始观察，未重试成通过。有限样例不能证明effort强度、最优策略、完整数值域、native内部传输或生产流式回放。

## Anthropic：历史提醒与签名回放

主线亲核[Opus5.5迁移原文](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide)的thinking回放及账号边界段：原样回放thinking块，签名与模型及此前会话绑定；创建于2026-08-31 00:00UTC及之后的账号默认对编辑前文执行400检查。更早账号及OpenRouter实际上游账号条件没有在本次公开资料或凭据中查明。

初轮Opus5.5／Fable5.1简单工具各HTTP200，却无reasoning_details，签名实验因此记为Unable to verify，没有把工具成功当回放成功。独立多步样例改为high，每款执行seed、保留旧提醒续接、只移除旧提醒续接三次：

| 精确模型／所选tag | seed reasoning | signature长度 | 保留提醒续接 | 仅移除旧提醒续接 |
| --- | ---: | ---: | --- | --- |
| anthropic/claude-opus-5.5／anthropic | 731 | 2568 | 200，ALPHA | 200，ALPHA |
| anthropic/claude-fable-5.1／anthropic | 589 | 2260 | 200，ALPHA | 200，ALPHA |

seed都返回reasoning.text及signature、正确checksum工具参数；续接在JSON值层原样复制整个assistant，tools、effort、output cap及当前尾相同，仅删第一请求的一条user提醒。请求及原始响应可逐字核对。这个账号／路由上的成功没有推翻原生文档：native-wire、上游账号创建日期、prefix检查和签名实际校验机制均未观察。未执行损坏签名负控，不能证明平台验证了签名，也不能推广到未来组织／租户或所有流式路径。

## 取得、局限与代价

15次新增请求均非流式，max_tokens=2048、60秒超时和4MB响应界限是本次研究测量配置，非产品默认。只有合成提示、算术和本地模拟工具结果，没有真实会话或外部工具效应。所有POST只向OpenRouter发送，单供应商、零重试和零重定向；每次先预留，15笔都有原usage.cost，新增USD0.1452249，账本185 settled／0 unsettled，总USD1.285185289500000000，原USD100／research50额度不变。

准备Anthropic计算脚本时发生replacement-string转义导致的语法错误；syntax／module load各exit1、付费0。失败源码保留，按字面替换修复、实际syntax check成功后才执行。初次归档缺现有工具模块的重放闭包，保全原档后补齐三份实际工具源码和环境，再全成员读回；没有重跑已结束请求。

本轮主线亲核范围为上述JSON字段、OpenAI实际获取段、OpenRouter Chat schema／GPT6／reasoning／cache相关段、Anthropic迁移的回放及账号边界，以及15份实际请求响应。其余native两路报告仅转述、未核原文内容；哈希完整不等于其结论正确，归档报告是模型输出。六款OpenAI pro原生页404、其它厂商条件／文档冲突、Alibaba缓存适用性等均保留待核实，不因目录存在填未知。没有做TTL到期、媒体字节边界、全域参数、流式公开制品或37生产认证；原162次暖读仍只属于原缓存run。

复核触发：模型／所选tag／native及gateway版本、账号执行政策、reasoning回放表示或缓存文档变化。没有额外搜集同类营销页面；本轮只核第一方原文和受控行为，未取得独立社区的反例或native-wire记录。
