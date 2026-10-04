# 厂商输入计量、demo 输出配置与 DeepSeek 真实工具／缓存验收

2026-09-28，主线在 HUB 实际运行。源码截至 `d77f9677`；新增纯计量公开出口提交 `b9c7112c`。本包是有限实施证据，不提升完整37模型或十三操作验收状态。

## 离线与受控网络

transport 构建、类型检查、43文件487测试通过。各增量依次在HUB验证：OpenAI51、Anthropic34、DeepSeek33、Google27、xAI20、Qwen45（随后47的追加场景进入全套487）、ZAI35。各自原始命令输出见归档 vendor-wave 日志；不是这些数量相加后的另一套测试。真实本机HTTPS覆盖最终请求、工具历史、usage与不支持输入；Google/xAI与商业别名的合成meter只证明投影，不能发往生产。

新增Qwen两款与GLM三款有固定公开模板／词表的估算器；其余已有12个绑定，合计17个有限输入绑定，不代表17个完整可供给模型。Moonshot仍在独立修订，未包含。模型范围、推理／媒体拒绝、上游私有转换未知、许可与余量归对应包双语README。

实际 pnpm pack 解包后164个 dist/tokenizer成员逐字核源；从解包公开入口真实创建并运行Qwen2与GLM3文本计量。消费者仅共用已安装的依赖，不回读源码入口；原始制品本地保留，归档保存hash与消费者结果，不宣称隔离安装或线上精度验证。

demo输出上限由写死1024改为CLI默认16384及可配置 `--max-output-tokens`，公共openDemo显式接值。构建、类型检查、22文件90测试通过；受控TLS证明同会话16384、重开8192按原样进入max_tokens并保留完整历史。非正整数CLI拒绝。该变化不修改模型档案上限；Pro16384、Flash131072。文档检查1985文件通过。此前manifest ordinal3与Flash计量修订亦经全套90验证。

## 真实 OpenRouter 请求

实际run `deepseek-current-77d00f32-94d0-4d91-9041-2d516e6cb2ad`，两模型固定 `deepinfra/fp8`，官方definition/config/profile与真实meter，经生产 createPiAiTransport／invokeModel 调用。每模型3请求，无自动重试，无供应商回退，显式余量1.1+256、low推理；本验收脚本为短工具任务显式选1024输出预算，独立于交互demo默认值。每模型首轮返回真实lookup_code调用，次轮完整保留assistant块及实际callId配对工具结果，第三轮与第二轮最终请求字节相同。

| 模型／轮次 | 估算tokens | 实际完整输入 | 缓存读取 | 实际USD |
|---|---:|---:|---:|---:|
| Pro0813／1 | 7800 | 7723 | 0 | 0.0102011 |
| Pro0813／2 | 7969 | 7801 | 7680 | 0.0009435 |
| Pro0813／3 | 7969 | 7801 | 7680 | 0.0009435 |
| V4.1Flash／1 | 7816 | 7738 | 0 | 0.0011081 |
| V4.1Flash／2 | 7983 | 7809 | 7680 | 0.000053256 |
| V4.1Flash／3 | 7983 | 7809 | 7808 | 0.0000358736 |

六轮全部complete，实际服务方DeepInfra，每次一次send，流到达事件可观察，reader实际stopped。六项费用以无损十进制结算到原唯一预算账本，合计 **USD0.0132853296**；历史unknown条目未改写。未在证据包复制凭据或另造账本。

本次证明固定文本／工具请求的真实接受、完整回复续接、稳定长前缀命中及可见费用。未覆盖Flash真实图片、缓存过期、取消故障、全部参数组合、Cordis service逐模型认证或完整模型认证；尚未确定用户短会话连续只命中256的精确原因。一次估算对照不能证明统一误差上界。此前无请求dry首轮因snapshot误带profile专属字段被正确拒绝，修正脚本后dry两型号通过；两次原记录一起保留，未改生产门来放行。

## 复跑与证据

离线入口：`pnpm --filter @omne-harness-lite/pi-ai-transport build`、`typecheck`、`test`；demo同名脚本。归档中的 `deepseek-current-public.mjs --dry` 不发请求；真实执行需显式凭据文件、原唯一ledger和已有预算授权，不应无意重跑产生费用。inputs.json给出源提交及受影响源码SHA；manifest.json核每个原始归档成员，主线已逐字读回。新增bindings0，后续源码改变按影响重新验收。
