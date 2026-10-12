# Slash command 行为承诺

公开形状归类型和必要校验，本页约束默认2的表示、识别、切词、绑定和展开。纯包不查询权限，不产生消息、队列或业务流程；调用者给准确的只读、已授权命令集，未授权即不存在。

## 名字与识别

保留区按 ASCII 不区分大小写识别，但合法 command 只能用小写 omne-official: 且后缀非空，记录来源必须 official；prompt／skill 禁保留区。局部上下文 ok 不证明完整来源关系，系统动作与 command 名不能撞，不设优先级。

依次识别 text、以 // 开头的 literal、invocation；literal 恰去第一个 /，例如 ///x 输出 //x。N 从第二码点扫描到首个 W 或末尾，N 空则原样 text；名字含 / 则是原样 text。W 恰为 identity-values 的固定空白码点集合，不按宿主 trim 或 \s 扩大。不裁 raw，argumentText 仅裁精确 W 两端，span／at 按码点，raw 无孤立代理项。接收 invocation 用 raw 重新识别核对；一输入至多一命令，名字从第一个码点开始。

## 切词与绑定

参数缺席与 [] 不同，只有带声明才切词。六条规则：引号外 W 分隔；引号外反斜杠转义下一码点、末尾反斜杠原样；单引号内无转义；双引号内仅转义双引号和反斜杠；相邻段拼为一 token；span 含引号边界。空引号 token 不等于缺 token。未闭合引号拒绝，at 从开引号到 raw 末尾。

具名 boolean --p 为 true，不吞下一 token；带等号时只能 true／false。只有以 -- 开头且长于两码点的 token 为具名，以第一个 = 分隔；其他具名有 = 取其后（值可为空），否则下一 token 无论形状都作值；重复或未知具名拒绝。其余位置值按声明次序，-- 与短选项无特殊规则。integer 文字恰为可选 - 加一个或多个 ASCII 数字，值域恰为 −(2^53−1)≤n≤2^53−1，不收 +、小数或指数；enum 逐码点相等。位置 boolean 也仅收 true／false；optional 缺席不补默认。

解析失败先名字、再全部切词、再左至右绑定、最后按声明顺序检查必填。具名无下一 token 的 missing_required 指具名 token，下一 token 值失败指值 token，最后必填缺席无 at。reason＋at 确定，explanation 仅来自 invocation 与该命令集，不泄露权限、别的租户或层。表示拒绝独立按 binding_unknown → name_invalid → name_reserved → parameter_duplicate → positional_after_named → malformed，不与六种 parse reason 混用、不修补。

## 展开与消费

模板只识别最长 ASCII 数字串 $N 和 $ARGUMENTS。N 从0起按位置声明映射切词后原文字，可选缺席为空串；每个未转义 $N 必有对应位置声明。带声明时，须有未转义 $ARGUMENTS，或没有具名且覆盖全部位置序号。单反斜杠转义，多反斜杠保留并展开；单遍不递归，发布核占位符覆盖声明。无声明、无未转义 ARGUMENTS、但附自由参数时追加准确 `"\n\nARGUMENTS: " + argumentText`，冒号后恰一个 U+0020，换行恰两个 U+000A。

skill 解析只返回引用；展开先正文，再原 argumentText 的非空参数块，不把绑定表序列化，也不拼入正文。调用者以敲命令的人独立核 Skill 权限，命令权限不授 Skill 许可。command 不产生消息，arguments 缺席与 {} 区分；无声明时 arguments 缺席，真实交接者仍把 service 与 invocation.argumentText 一起交流程。

失败不产生入站、队列、展开、流程或降级 text；已经受理的到达失败保留具名拒绝。prompt／skill 成功消息另存 raw 的 slash_command_record，不存独立 ParseResult，不按当前命令集重构历史。这些效果由真正消费者兑现，纯 parse 成功不代替实际受理。

## 验证与未定范围

规范输入与模型外单值测试核码点、六条切词、首拒绝、保留区、参数精度及展开原文。固定 Schema 构建生成、首次消费加载，缺资源／生成物原抛。系统流程登记、command／拒绝日志条目形状、附件如何随命令走仍归消费者限定，不由本纯包填政策。

## 跨边界消费责任

raw 每跳原样保留，不归一或改换行。代理不把 unknown_command 加料成无权限或泄露其他命令存在；两端各跑同套识别输入，接收边界重验 invocation。分开发行仍核系统动作与保留名不相交，不以各模块局部合法证明装配无冲突。

正文声明恒为空，不从参数／绑定推出 setting 或权限；仅 AM 加 disabled／usableBy。未知／重复具名或位置值过量为 unexpected_argument；integer／boolean 非法为 type_mismatch；enum 非法为 enum_out_of_range。具名 = 内值失败的 at 指整个具名 token，其余 at 按既定值 token／必填缺席规则。

unknown_command 的 at 恰为 invocation.span。交付预判和受理分别使用当刻已授权命令集 S；两次不同以受理为准，不复用旧成功绕过撤权。确定性只承诺同 invocation＋同 S 有同结果。
