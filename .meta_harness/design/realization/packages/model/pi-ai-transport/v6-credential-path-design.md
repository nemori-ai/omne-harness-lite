# pi-ai-transport：完整共享政策与RT5单次头交接

当前技术采用范围与排除见本页“当前采用范围”；不据此宣称实现或验证完成。

## 公共配置与来源

`TransportPolicy`移除旧`credentialFragmentMinLength`，改为必需显式`credentialRedaction: CredentialRedactionConfig`。静态factory与动态插件同样以runtime公开`createCredentialRedactionPolicy`校验、复制/冻结完整三参数，非法构造/启动失败且零HTTP，不发布半套服务。其余limits、固定OpenRouter、definition/配置/TTL、显式diagnostic及lease规则保持，不加缺省政策或从环境读值。

`sendRequest`与公开`NetworkResources`直接消费路径同样校验完整配置：在acquireConnection/request及任何异步排队之前，校验并自有复制/冻结本次完整policy，绑定credential；非法配置交既有rejected:invalidInput，零连接/零HTTP。factory/plugin不构成绕过此门的许可；源resources.policy/config在队列等待中变化不能改变本次规则。bind的受控缺陷沿下方来源映射，不冒充非法输入。

transport现有对runtime的workspace依赖改为实际调用这个纯构造器，不再仅type import。runtime不能反向依赖transport，该复用不形成运行时循环；不新增公共共享包。一次send开始以这次明确凭据绑定完整policy，私有响应状态只保留受控绑定闭包，不公开原始对象/凭据/config。绑定寿命固定，不因贡献/凭据轮换改成本次latest。

`json.ts/http.ts/stream.ts`的原私有known-value matcher及只清字符串的raw/error walker不再作为第二权威；调用D093已验证的text/headers/json闭包，不复刻窗口或pattern引擎。采用运行前需确认D093允许的生产config，而不是把任何合法generic config当批准的生产基线。装配明确传入openRouterCredentialRedactionConfig或已被采用的加强值；没有内部fallback。

来源判定沿runtime的[来源接线稿](../model-request-runtime/v6-credential-path-design.md)：实际HTTP/SSE状态、独立验证的身份及usage/cost事实保持；上游frame model/provider/generation字符串继续text处理，不因字段位置而豁免，raw/error/header/local原文包括所有key/scalar匹配值脱敏，不按字段名豁免。`frame.error.code`的合法协议状态提取与该error原文副本处理分开；HTTP成功码不填带内status。真实reply/工具参数回显未获改写授权，不据此次采用宣称完整内容秘密保证。

## H单一权威与收尾

[v5-headers-design](v5-headers-design.md)的PH-P1～P6/PH-V1～V9/PH-J1～J2作为本次明确消费，不改其已决定的公开不可达R、同次H和生命周期：实际response回调先捕获/共享headers处理/自有冻结map，再异步读错误体；只有SendResult.rawHeaders，response/failed/aborted可带、rejected不带。移除TransportFailure.headers，不从R/header事件/StreamEnd再取一份。

成功、错误、取消或error-body失败都保留已经采得的H。已知HTTP错误body读中req.error不能抢成connect无头结果；晚error/abort不能覆盖已定终局。数组原次序、重复、空值、缺席/空map保持，不归一化/join/trim。真实status缺失不得造0。

所有本包公共send/read/diagnostic错误出口使用相应完整共享政策；原始底层异常不直接返回或throw原文。表示违约、处理器rejected与受控defect的公共出口逐阶段只沿runtime稿[处理失败的唯一出口](../model-request-runtime/v6-credential-path-design.md#处理失败的唯一出口)，本包不另选映射。已经持有H后错误体处理失败保持同次H与独立HTTP/in_band失败事实，载荷缺席而固定本地阶段留痕；不能reject Promise丢H、把它报成connect或正常结束。S-58交出之前尚未成功留存的可选H处理defect只沿S-54留存失败例外，诊断并保持既有实际收场；非法头表示/rejected不享有该例外；S-58交出的合法自有不可变H在invoke固定持有，不重新进行可选留存或构造第二脱敏出口。具体取消与停止沿该表，不新增业务outcome。HTTP状态或保真账不能经generic JSON整体变成marker；库的合法JSON值域不证明业务来源。

原Agent、ClientRequest、IncomingMessage、reader及callback任务归原私有owner，stopAdmission/真实stop/stopped/dispose配对沿已接受设计，不靠GC或隐藏对象保证资源收口。H为普通自有值，释放R不清H；H不进事件/detail或默认trace原文。source types、invoke消费者、codec以及app各由其原owner实施，本包不持有append权或跨owner事务。

## 交付与门

沿PH-V义务，额外把原minimum-only配置改成完整policy的正反验收：静态/插件缺配置拒、共享policy跨error JSON scalar/keys/敏感头/模式一致、直接send配置准入与排队期间源配置变化负控、H采得后处理defect/rejected保持来源/头及实际停止、真实HTTP与带内code同值保真、actualsend公共可达图无原始秘密、所有取消/错误H保留和socket/reader/callback停止；实际公包制品、根/插件公开面以及README/README_ZH示例在完成时一起迁移。没有旧field兼容fallback。

这两份接线稿必须独立有限核对并精确采用后才允许源实施。传输局部pass不关闭业务内容回显、raw.body附件、全部响应写方、G29-P/H、十三操作或37认证；现有纯构件/opaque句柄有限证据仍只支持原范围。

## 当前采用范围

RT5/MR5 的按来源定界凭据政策与两节点 revision 3 接线；同一次完整配置显式校验/冻结，共享 text/headers/json；直接 send 的零连接非法配置门；单一 rawHeaders 的固定交接与处理故障出口。

技术采用不表示实现或实际验证已完成。验证义务：CP-V1..CP-V5；PH-V；完整内容秘密边界和 G29-P/H；实际 TLS/socket/reader/回调收口；各既有操作及模型认证按实际当前实现范围验证。
范围之外：RT6 模态候选；给所有业务 reply/tool 内容追加未声明保密保证；冻结规范变更。
