# LLM 与有限媒体源基线

本页记录固定 DeepSeek Harness commit
`c291e7961a515f6d7af9304e7fd1d257929aef26` 中本批实际选取的语言无关行为。
它是 D-006 定向源码 fork 的维护说明，不是 D-008 产品规格，也不表示目标模型、
媒体服务或 OpenRouter adapter 已实现。逐文件原件、SHA-256 和活动源码差异由
`packages/dsh-baseline/provenance/llm.json` 追踪。

## 消息与内容快照

源消息统一携带稳定消息标识、`system | user | assistant` 角色、按序内容块和明确
来源。内容块包含文本、推理、图片引用、文件引用、工具调用及递归工具结果；工具
调用标识把调用与结果关联。构造函数为新消息产生随机标识，随后先复制整个输入图，
再递归冻结副本。因此调用者后续改变原数组或嵌套对象不会改变已发布消息，已存在
标识在重新冻结时保持不变。system 空文本投影为空块数组，工具结果固定成为
user-role 的单个 `tool-result` 块。

活动切片保留上述源消息和内容词汇，但品牌及冻结辅助改为本包 `src/support/`
中的唯一副本，随机标识使用 Node `randomUUID()`，不带 DSH crypto 依赖。媒体引用
是本源包的 baseline 类型，不是 `core-work v1` 的 `MediaRef`。源中的插件化消息
来源扩展点作为 TypeScript 源词汇保留，不赋予租户权限或耐久提交含义。

## 流装配与紧凑记录

`BlockAssembler` 按流中第一次出现的 block index 保存顺序，连接文本、推理和工具
参数 delta；显式 `block-end` 是该 block 的权威终值，之后的迟到 delta 或重复关闭
不会再改变它。缺少 start/end 的已知 delta 仍可完成装配；未知且未关闭的 block
显式失败。缺少 finish 时按普通 stop 处理。max-token 结束会丢弃未能安全执行的
工具调用，并同步裁剪与 block 对齐的 replay 元数据；元数据长度不匹配时整份丢弃。
中断投影只保留非空白文本/推理，不伪造工具结果。

`AssistantStreamAccumulator` 对输入 chunk 做无损 JSON 快照和冻结，再把相邻、同类、
同 index（工具调用还要求同 id/name）的 delta 压成带首时间和时间差的记录。时间、
index、字符串字段及 JSON 可表示性不合法时立即失败；无法安全表示的时间差会开始
新记录。`snapshot()` 返回与内部状态分离的冻结记录。`expandAssistantStream()` 是
持久边界的验证入口：它拒绝多余或缺失字段、空 run、非法时间/index、长度不匹配和
非 JSON raw chunk，并精确恢复原 delta 边界及时间。只读 helper 可直接回答首 token、
可见内容、尾部原始 chunk 和拼接文本；这些 helper 信任静态类型，不替代边界验证。

## 失败、请求配置与归因

`HarnessError` 分离稳定机器 code、可读 message 和标准 cause。上下文超限及余额/
配额分类只识别明确措辞；诊断渲染遍历 cause 与 aggregate 成员、识别真实环，并把
敌意 getter/coercion 隔离成不可渲染标记。adapter 失败归一化只信任 Harness 自有
code，或同时通过 own-property 校验且 code 一致的可序列化 failure 快照；第三方错误
默认为 `UNKNOWN`，非法 status、retry delay、request id 或访问器不会漏入结果。

请求配置比较覆盖 provider、model、reasoning effort、temperature、max token 和有序
stop 列表。loop 标记使用对象身份的进程内 WeakSet，仅能说明同一对象在本进程经过
源 loop 装配，不是授权、持久事实或恢复依据。归因 helper 只接受公开静态产品字段，
生成标准 user-agent；活动默认身份指向本源基线包，未来真实 OpenRouter adapter 必须
由 D-008 目标实现重新确定并验证请求归因及费用事实。

## 有限媒体辅助

本批只保留 attachment 的品牌、纯类型、稳定错误分类和请求图片尺寸计算。图片尺寸
算法不放大小图；需要缩小时按宽高比向内取整，并在舍入导致像素预算超限时沿主轴
逐像素收缩，保证正整数结果和 `width * height <= maxPixels`。媒体引用携带内容地址、
已验证媒体类型、字节数和尺寸；文件引用携带内容地址、显示名和字节数。这些只是源
数据词汇，不代表存储对象存在、引用获准访问或内容已验证。

完整 attachment service、上传 admission、图片解码/规范化、持久 store 与请求版本
后端均未导入；活动纯函数不声称提供这些生命周期。完整 LLM runtime、adapter
registry、模型发现、重试政策、API key/settings、Typert RPC、schemastery、DSH
invariant/crypto 及所有直连 provider adapters 也未编译。上游入口原件仅供差异核对，
因为直接编译它会重新引入明确排除的依赖和未验证的运行时保证。
