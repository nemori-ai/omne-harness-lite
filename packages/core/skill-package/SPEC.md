# Skill package 行为承诺

默认3读入只成功或拒绝。AM、资产求值和 Slash 的真实消费者仍使用公开 /v2 规范值／正文端口；不提供旧2文本／目录 reader 或 undetermined 兼容层。类型和必要校验拥有形状，本页约束正文、资源、声明及读入；读包永不执行。

## 内容与身份

name 是能力身份镜像，目录不是身份。有能力上下文须精确相等，否则 name_mismatch；无上下文只核词法。license、compatibility、metadata 原样保留，不解释为路由。allowed-tools 原样保留但不生效；其他外部／未知键不进 manifest，须可见报告。常驻、调用面开关、模型选择、预批准均不从内容生效，侧车仅普通资源。

read 与 Slash skill 展开使用逐字相同 body，不占位展开、不替换命令、不解释 Markdown；参数另成块。manifest、body、definition、资源路径与字节同属一版，不混版本；复制覆盖内容不动持有配值。规范形状无字节摘要不能证明跨进程完整性。

## 资源、依赖与设置

资源为包内规范相对路径，不重复、不形成文件／目录前缀冲突，排除控制文件；字节由版本＋path 指认，mediaType 缺席不表示文本。scripts 恰是 scripts/ 下资源，根文件 scripts 不算；读取不执行、执行位不进规范值、列为脚本不等于许可。

tools 引用 Tool 能力且均为必需依赖；外部服务不等于 Cordis 服务。固定环境要求属于内容，不是设置、不能配值，无脚本不得带；依赖集合只有且恰是所列必需项。settings 是正文唯一声明投影，不产权限、治理或保留项；作者 setting 叫 targetEnvironment 也不是落点要求。

偏好与绑定值可交 Agent 及脚本；落点身份只交脚本，不进入 Agent 返回。真正 Skills 消费者保证交付边界，纯派生不替代交付观察。Skills.exec_script 的工具落点设置与 Skill 固定环境要求如何合成仍归实际拥有者限定，不假设谁覆盖谁。

## 文本与目录读入

文本无 BOM，接受 LF／CRLF，以首个独占闭合行结束头部；核心字段不强转。已识别非法 Core tag 的 fallback 不是成功；未知键丢弃前检查全图。目录缺 SKILL.md 拒绝，definition 缺席合法，其余普通文件不任意过滤。内部／外部链接及环由调用者给真实观测：解析后出包为 resource_escapes，无法解析／环为 malformed，包内链接读取所指文件原字节；控制路径 SKILL.md 与 .omne/skill.json 不作为资源。非常规文件拒绝；路径判断不能替代实际读取。

拒绝顺序为 manifest_missing → name_mismatch → definition_format_unsupported → resource_escapes → tool_ref_invalid → binding_layer_unknown → setting_category_unknown → malformed。未知 definition 格式停止其余内部判断，坏包不折成不可用替换件；忽略未知文本键仅在明文范围内且留痕。

## 验证与机制

固定 Schema 图构建生成、首次实际消费加载，缺资源／定义／生成物原抛，不回退；作者动态 Schema 编译归调用者。规范输入验证正文原样、完整包一致、路径／链接事实、设置可见性和准确首拒绝。跨进程资源摘要仍由真正包运输／读入协议拥有者限定，不凭路径与版本声称字节完整。没有独立状态模型，不将旧2读入历史缺口搬成当前3缺口或宣布旧2文本 reader 已完成。

## 跨边界消费责任

跨节点资源请求携准确版及 path，不按最新包代取；传递 body 原值，不给远端一条重新解析正文的指令。链接及真实目录 confinement 由持目录宿主判断，远端不能代猜；每个接收边界重验规范值及完整上下文，跨进程摘要未定不伪称已验。

实际正文／脚本使用须符合声明，固定环境要求无法满足即不可用，不降级或忽略。环境合成政策未定不放宽这两条已有消费红线。
