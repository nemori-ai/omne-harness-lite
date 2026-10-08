# Loop extension 公共行为

本包拥有声明、输入、输出、结论的公开形状、纯判断及固定 Schema。根入口不执行拓展件，不创建 Run、日志、环境、卡片或运行状态。合法形状不证明权限、真实执行、历史完整或来源可信。实际遍历、策略效果、持久结论与恢复由 [Runner](../loop-extension-runner/SPEC.md) 及其提供者负责。

## 声明、默认和作用范围

name 与 capability.name 精确相等，位置不是身份，builtinName 仅为实现绑定。属性只声明 position、需要时的 dimension、power，不推出 onError、unavailability、needs、implementation、disabled、usableBy 或治理项。无 dimension 的九位置共用一域；after_model_call 与 after_action 各自按 dimension 分域，不能拼成独立跨配的非法组合。

power 的允许集是声明档及以下，求值不得升档。工作区只能 observe，由求值者保证。onError／unavailability 属正文声明，不允许各层配值。needs 缺席表示无依赖，空数组不是另一表示，也不建立 DependencyName 身份空间。没有 order；装配顺序及系统固定末位由 Runner 保证。

onError 缺席按实际 effective power：observe→ignore、rewrite→record、veto→treat_as_veto。声明或生效策略不能越档，生效策略过高按该档默认。ignore 无效果；record 产生本件“未跑成”提醒；treat_as_veto 在之前为 veto，在之后为 stop/failed；after_terminal 一律 observed。处置留在结论内，error／reason 不带凭据或未落盘内容。

租户缺 unavailability 按 skip。声明 veto 只许 veto 档五个之前位置；实际 power 收窄时采用 skip。fallback 只归系统固定挂件，作者不能声明。不可用记录没有 output，并保实际政策，不伪 observed；errored 的 output 是实际处置，不保被拒建议。command 的来源语义非零且非 2 退出、timeout、bad_output 固定 ignore，仍保 errored/error；builtin 和兼容件的其他错误不适用此例外。command 错误说明区分非零退出、timeout 与 bad_output；非零退出保退出码，不转述 stderr 或 output 原文。

## 输入与改写

subject 是前件 final 叠 rewrite／select_model 后的值。earlier 仅含经过中的前件 finals，含实际缺席与错误记录，不含任何 ask、本件 ask 或别的动作结论。before_persist_message 不给 contributor run／attempt，即使外层有真实写栅栏。before_action.batch 覆盖真实原批全部 callId，未解析项仍在原批但无经过；数据层不赋予该旧 batch 顺序业务含义，当前 Runner 整批请求与下方 AR-2 的顺序责任保持。

rewrite 只许改消息、请求 parameters/messages、工具 arguments 或结果 result，其余逐值不变。请求 target 只经 select_model 改，tools 不改；工具 identity、definition、batch 与结果 callId/outcome 不改。模型消息只有真实系统模态转换件可向原无派生块增加派生表示／transcript，已有块序列、成员及消息其他字段不变。能力来源不能从形状推出，所有 producer 的派生表示改动另须 Runner 核真实系统模态转换件来源。原模型回复参数不被后置 rewrite 覆盖；生效参数须先落结论，再由真正执行者执行。

output 是闭合集合，不授 next-state、环绕调用、代模型或人作答、放宽权限。allow 只译 observed。inject.source 只能是本件。select_model 仅对本次且须真实 legalTargets，不改用户选中模型；最后生效来源归响应 selectedBy。retry 只改 provider／after，不换模型；after 缺席不等待。真实事实三类及可用供应商由 runtime guard 判断，本包不另定重试次数或承诺自定义重试必停。

stop.terminal 缺席按 cancelled，真实取消请求先于 cancelled 终态；failed 不写取消请求，拓展件不能宣告 completed。ask 草稿不是授权，proposedRewrite 尚未生效，答后最终 rewrite 才改变主体；自由作答、明确不答和系统错误不同。卡片、等待与终态均归外部拥有者。

## 失败调用与完整历史

失败主体的原快照、binding、dispatches 来自同一次真实调用，不用当前目录或响应体补输入。该调用的每条 failure conclusion，包括 ask、skip、error，都带同一唯一 modelCallId，不借工具 callId；生产者与接收者须核同 session/call 的原日志。

retryConclusions 是同一完整合法前缀中全部有效 retry 的原值，按日志位置保留。不能按 provider、extension、attempt 筛选，不能按 timestamp 排序或 JSON 去重。同值两条保两次，已生效而尚未再次发送也保留；被拒建议不算有效 retry。只有可信完整前缀确实没有历史才可给 []。来源、完整性或归属不可判时不可用，不能补 [] 或身份。不兼容旧值拒绝，不开旧读取／结算面，也不按当前目录修补。

Schema 只判元素形状，不证明完整来源。纯 positioned-subject／conclusion 判断不要求虚构 Run 或句柄，成功也不证明执行、授权或完整历史。完整 input/conclusion 判断的原前提不能因此降低。

## 拒绝与效应边界

首拒绝依次为 malformed、position_unknown、power_unknown、dimension_missing、dimension_not_allowed、output_not_allowed_for_power、ask_at_forbidden_position、output_not_allowed_at_position、rewrite_touches_immutable、inject_source_mismatch。malformed 不抢占后面专管谓词。表示层非法 output 记入 errored.error 时恰为该首拒绝 token，不用任意错误描述替代。判断须比较真实 input、署名与 binding；辅助配置错误抛 TypeError，不伪协议拒绝。

表示拒绝先于资格判断，不修剪、降级、补字段、删多余成员或忽略未知成员。log／environment 句柄不透明、只及本 session，不承载 sessionId 或运行状态，不是跨等待内存；解析失败不当无 tenant／env，不回退 host。跨等待的模型调用由真实等待拥有者从耐久日志认回原结果与费用，不再次付费或出卡，偏离须停止且可见。本包不拥有提交、事件、恢复动作，也不保证已执行外部效应可逆。

## 拒绝调用的动作后置输入

AR-2 的当前采用限定如下。after_action(each) 对被拒调用用 outcome=denied，result 必须缺席；拒绝未执行，不能伪造结果供 hook 改写。each 不改调用身份、outcome 或正式拒绝依据。

after_action(batch) 的 outcomes 按原序包含全部调用，包括 denied。全拒批次仍有原集合，不能清空；完整性由协调拥有者保证。batch 仍不允许 rewrite 或 veto，两个位置的合法输出集合保持。其余形状与规范实例不随该增量改变。

## 固定图与验证

当前公开 Schema 及 URI 保持。retained v2／v3 只服务精确 $ref，不恢复旧可执行 API。当前图及外部资源各有一个拥有者，不按文件位置改变 Schema 身份。

build 先清 dist/generated，完整 tsc 与全部固定图／metadata 生成后才交付。资源、编译或写盘失败须非零并清这两目录。第一次实际校验原生加载，缺 generated/helper 原样抛，不改成业务拒绝或回退旧版；src/dist 使用同一拥有者图。固定图是进程有界模块资源，无新 Service；作者动态图仍遵守其构造与释放范围。

[验证义务](verification/README.md)覆盖逐格合法组合、首拒绝、真实主体比较、同调用历史、原输入与固定图失败。纯值模块没有独立状态模型；权限、先提交、等待、回放、迟到及外部作用由效果拥有者验证。
