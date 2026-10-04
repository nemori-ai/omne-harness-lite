# 最终输入计量：有依据的 token 估算与配置余量

2026-09-28，candidate，待独立评审及主线技术采用。继承 [v9](v9-current-design.md) 的当前公开面、精确贡献、固定计划和资源生命周期；目标为 `data.model-profile/v6` 与 `capability.model-request-runtime/v8`。依据 PF-013 rev15 用户确认的计量规则。本页没有新增插件、服务、存储或后台任务；新增证据绑定0，实际实现及网络验收尚未完成。

## 责任与公开面

`planRequest` 在完整 messages、tools、reminder、reasoning、缓存标记及供应商参数投影完成后，针对唯一的 `body/serialized` 计量，再签发计划；`http` 只发送同一 owned serialized。`InputMeter` 是随精确 adaptation 贡献装配的可信函数，不是档案里的可执行配置。标识包含模型、definition修订、implementation名及修订、provider、算法修订和事实依据；元数据的存在本身不构成有效算法证明。

- `registerAdaptation(definition, meter, owner, cleanup)` 和 `createModelPlugin(definition, meter, policy)` 将函数与贡献绑定；直接 factory 消费同一类型。缺有效构件或绑定不符按依赖不可用拒绝，不把所有输入当作0。
- meter 返回 exact、upperBound、estimated 或 unavailable；覆盖完整投影所需项，不能只数最后一条 user 文本。只支持部分模态/协议的提供者在其他输入上明确 unavailable，不能忽略无法解释的块。
- 每次计划显式给出 `tokenMargin:{multiplier,reserveTokens}`；前者有限且至少1，后者非负整数。估算准入量为 `ceil(estimatedTokens * multiplier) + reserveTokens`，按契约十进制数值精确计算，避免二进制浮点造成边界误拒。它不写回 profile、不冒充上游限制，运行设置与配置由宿主提供，不写死默认。
- 已有适用准确计数或可证明上界时优先使用；上界不能证明合规不得换估算来掩盖。估算必须有适用模型/供应商和最终协议的依据；任意字符系数或上次usage不构成依据。
- UTF-8 request bytes、严格解码后的逐图bytes和图数精确计算。可远程变化且未由本次实际材料确定的内容不能假定大小。可判定精确超限优先于估算超限；缺量/缺限额沿RT8原具名拒绝，不发送新HTTP、不产生新锚点。

所有当前公开/插件规划路径执行同一门，不增加不检查计量的入口。`PlanFailure` 对准确超限保留 `basis:exact/actual/limit`，估算超限用 `basis:estimated/estimatedTokens/admissionTokens/limit`；两者不得互换。门通过的私有计划证据保留方法、来源和版本、margin及准入量，结构化诊断不得记录凭据或完整用户内容；估算不是实际usage或账单，响应仍只消费上游事实。

## 生命周期、热换和自建供给

精确binding租借引用固定其definition和meter。注册时 owned copy 元数据，函数为可信不可变实现；同binding的不同函数内容不能静默覆盖，替换算法须以新implementation修订重新贡献。旧lease继续使用原meter，撤回阻止新借用，已有工作完成并释放引用后才cleanup。宿主不能利用可变闭包偷偷改变同一修订的算法；此项是可信代码装配前提，声明为自定义配置的租户不能提交函数获得执行权限。

官方窄meter与组织提供的可信扩展复用上述公共面；声明式profile仍只是值，不增加独立meter注册平台或自动支持所有模型。Cordis P-2/P-3原有inject/effect职责不变；meter本身是纯函数，无独立fiber。公共函数仍可不经runtime单独调用。

## 首模型与实施证据

DeepSeek V4文本/工具路径采用固定修订官方tokenizer和prompt encoder的窄移植，随包分发所需制品、许可证及SHA。官方编码golden仅证明本地实现遵循该输入子集的编码规则；OpenRouter和DeepInfra可能追加或改写协议，因此该路由当前类别必须为estimated，不能因golden通过就称exact。@huggingface/tokenizers的采用版本、官方模型仓库commit和逐文件摘要归实现provenance；事实变化触发该meter修订。

其他37项已发布定义不因此自动取得可发送的meter。各模型按家族公共实现加模型窄配置逐项给出依据与验收；没有依据的组合显式拒绝，同时保持其待交付状态。

## 验收义务

1. 同一最终serialized包含多轮、system/developer/user reminder、完整tools/schema/result及reasoning；故意漏任一计量贡献的负控失败。
2. 准确、上界、估算三类准入边界；十进制整数边界；准确超限和估算超限同时成立时准确优先；margin缺失/非法拒绝，未知材料拒绝。
3. 估算门通过、上游实际tokens高于估算甚至cap：响应保存真实值，未将估算灌入usage/cost，之后的调用仍独立过门。另验本地估算放行后，上游因实际输入限额拒绝：按既有失败分类留真实错误、usage/cost未知则保持未知，不伪造本地零发送，也不绕过重试政策自动缩减后重发。
4. UTF-8/base64/逐图bytes/图数精确边界；token估算许可不放宽其他维度。
5. root与Cordis使用同一meter；替换贡献后旧lease固定旧函数，新lease用新修订；同binding异函数拒绝，撤除等待实际引用释放。
6. 伪planned、外部输入突变、cap缺失、meter缺席与不适用路由零HTTP/锚点；真实多轮OpenRouter调用另验，golden不代替网络事实。

存储要求无新增；唯一固定计划、会话日志与响应记录继续沿现行owner。采用门是MP6/RT8精确资源及本映射接受；运行门是首模型完整实际输入的meter和材料就绪。用户已接受估算误差边界，未豁免任一仍可精确检查的限制。
