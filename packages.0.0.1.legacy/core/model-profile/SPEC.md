# Model profile 行为承诺

默认公开纯值与 Schema 仍采用 MP5；公开 MP6 是明确的资源入口，不更换默认身份或恢复旧执行入口。公开类型与校验拥有形状，本页拥有其余行为。真实发送、计量与调整由 [模型运行时](../model-request-runtime/SPEC.md) 的显式提供者负责，本纯模块无 IO、注册、授权或提交。

## 身份、引用与更新

档案身份是 (ownerScope, routeName)，scope 不藏在行内部；有身份的行／快照须与准确 Ref 成对。名称逐码点相等，不 trim、折叠大小写或 Unicode 归一，不解析成来源。官方档案在 factory，自定义在组织／租户。撤回仍占名，不删除复用；scope／route／origin 不可改。同格撞名判定与建档同提交，只比该格，不因不同格的隶属关系互相挡；依据不可读明确失败。副本一旦读到一次 registration 转移，不得倒退到该转移前的状态，实际目录写方及读协议负责兑现。

精确引用不跨 scope 回退，missing／unavailable／withdrawn 分开，不补默认档案。按层路由名覆盖是另一查询，不与准确 Ref 混用；设置／选择保存 routeName，Ref 不授访问权。

撤回／恢复仅变 registration，不动 updatedAt；同次内容修改独立更新。updatedAt 仅随输入／输出 modalities、两个 token cap、inputConstraints、upstreamInputLimits 的值变化，不随 providers、fallback、parameters、registration 或 adaptation 改变。时刻不倒退，可因精度相等，不作为完整 revision identity。

## 路由与限额事实

providers 是有序、非空、唯一的允许上界，不要求全部试完；每次发出一家，首发第一家。allowFallback=false 始终第一家，即使名单长度大于一也合法；true 不强迫回退，不把整名单作为上游自动回退请求。input modalities 必含 text，模态集无序；真实路由行为归运行时。

maxInputTokens 覆盖最终输入全部文本、system、tools、协议和模态贡献；maxImageBytes 按每个实际发送图的解码原字节，maxImages 按发送项计（含工具图及重复，不去重）；maxRequestBytes 按最终请求体 UTF-8 字节，不算头、压缩或流帧。image 档案即使当前没图，仍需完整项目图字节限项和两个相应上游事实。

optional cap 缺席只表示项目不额外加界，不表示上游无限。上游 unknown／unbounded 仍须原必填的有限项目 cap，可选 cap 仍可缺席；上游有限时对应 cap 不超过它，unknown／unbounded 不当数比较。多 provider 的适用事实不能拿某一家宽界冒充共同事实；共享窗口须按具体前提换算，不能直接写作输入 cap。

发送的 token 依据、估算／余量及 byte／图数精确性沿模型运行时的已采用承诺；纯档案判断不证明最终输入已准入，也不保证估算不越上游窗口。

## 完整快照与适配绑定

打开调用时从同一次完整读取复制快照，保留所有适用 cap、上游 unknown／unbounded／limited、optional 缺席、updatedAt 及完整 adaptation，并与 Ref 成对。调用及恢复不刷新当前目录。不先截成刚好使用的字段，不把行合法推作快照来源真实。

Content 不带 registration／updatedAt；相等保 optional 存在性，providers 有序、modalities 按集合、数精确、对象成员次序无义。

适配绑定的实现／定义／配置修订分别在自己的域内不可原地改义；相同 revision 字符串跨档案／来源不代表同一事实，不用 Fiber UID 代替数据修订。完整绑定比较全部五个字符串与 configuration.values；modelId 必等 routeName。配置只有显式 JSON 值，不携代码或秘密，不把合法形状当已注册／适用资格。重复键拒绝、数无损；空配置、缺席与 null 不能混，也不补默认政策。

## 参数与纯接纳

档案 parameters 和 extra 出现时不得空；独立 ModelRequestParameters 的 {} 合法。缺参数不补，reasoning=none 是显式值。extra 不得用上游别名重复统一参数，识别由真实适配方负责。输出参数不超过档案 cap。

仅当上游输出上限降到档案 parameters.maxOutputTokens 以下时，保留原 maxOutputTokens，不偷偷改参数；其余五项适用内容仍照常更新，并按内容变化更新 updatedAt。适配方只凭真实来源调整且留 requested／sent／dropped 痕迹；来源缺失不擅调、沿原值发送，必要发送前提仍由运行时负责，不能把它写成未知来源也准入。

纯 judge 对当前四种公开值一次返回合法或唯一拒绝，不读取环境、不授权、不修改。先完整结构 malformed，再 route_name_empty → providers_empty → modalities_empty → input_text_missing → modality_unknown → registration_unknown → parameter_out_of_range → max_output_exceeds_profile → constraint_unknown；空 route 先报 route_name_empty，不被 modelId 比较遮盖。精确跨字段比较在合法结构后进行。route_name_taken 属目录写入判断，不加进值拒绝集合。

## 验证与边界

规范输入与独立原资源摘要由 tests 拥有；检查准确 scope、撤回、optional 缺席、未知限额、providers／模态相等、快照无损复制、完整绑定与拒绝顺序。资源 MP6 不替代真实发送或 created 往返验证。多节点须协议保持身份、原快照、精确配置、当前准入和同一次事实，不借共享内存或字符串修订推全部成立。
