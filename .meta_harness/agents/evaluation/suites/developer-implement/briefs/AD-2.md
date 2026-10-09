@@GOAL
交付 `apps/cli/src/parser.ts` 中的两个函数（类型、命令表加载与签名已在文件里给出）：

- `parseInvocation`：把进程参数映射成一次调用——帮助、版本、语法错误或一条命令。
- `secretOption`：秘密字段对应的来源选项名。

@@WRITE_PATHS
- `apps/cli/src/parser.ts`
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | CQ1 S-2 的命令与选项规则 | 命令表每条命令只接受它的 `allowedOptions`；未知命令、未知选项、重复选项、缺值、额外位置参数均为语法错误，不打开任何文件 |
| A2 | `machine` 前缀 | 同一命令带与不带前缀只改变呈现模式；语法错误时仍能还原调用方要的呈现模式，包括前缀出现在全局选项之后 |
| A3 | 帮助与版本 | 无参数与单独的 `--help` 为帮助，单独的 `--version` 为版本；机器模式不兼容这两种说明 |
| A4 | `center configure` | 需要 `--endpoint` 且 `--system-ca`、`--ca-file`、`--spki` 恰好一个 |
| A5 | 语法错误的诊断 | 无法确定命令为 `invalid-command`，其余为 `invalid-options`；已确定的命令随错误一并返回 |
| A6 | 成员检查 | `apps/cli` 下 `pnpm test` 与 `pnpm typecheck` 通过 |

@@SPEC
- 公开面与相邻接口：`Invocation`、`Command` 类型见本文件；消费者是 `apps/cli/src/input.ts`、`apps/cli/src/application.ts`、`apps/cli/src/presentation.ts`。`tui` 入口在进入本函数之前已由 `apps/cli/src/main.ts` 分流，不归本函数。
- 本次采用值：布尔选项为 `system-ca`、`refresh`、`help`、`version`，其余选项带值；解析用 Node 公开的参数解析 API；返回的选项值对象不可变。
- 秘密字段与来源选项的对应见 CQ1 S-4 第 1 项。


本评估使用固定基底的接口／命令表与以下局部规则，CQ编号仅为本案例条款标签。它们不是当前项目的产品交付承诺或历史接受记录；不得据此恢复中央设计目录。

## S-2 进程输入与模式

一条调用只发起一个CG Input，机器呈现是`machine`前缀子命令，例如`omne machine tenant current`；相同命令移除该前缀为人读呈现。机器输出是一个CG2 Output JSON文档并以换行结束，不改为JSON事件流。进程状态严格消费CG2 S15。

全局`--state-dir <directory>`指定本机状态目录；省略时应用映射定义一个确定的当前OS用户默认目录，不能按当前项目或登录名暗换目录。操作命令由commands.json精确映射。未知/重复命令、重复选项、未知选项、缺值、额外位置参数、秘密来源选项重复均拒绝，不能忽略继续。

仅register/login/invoke接受`--payload-file <path>`读取一次严格UTF-8 JSON对象，作为非秘密载荷。缺席时载荷为空对象，但注册/登录允许`--login-identifier <exact-value>`设置loginIdentifier；该选项与载荷同名成员同时出现为冲突，不定义覆盖优先级。configure/health/logout不接受payload-file或login-identifier；secret来源选项仅对应secretFields中存在的字段，其他来源选项必须在读取任何文件前拒绝。命令表逐项列出allowedOptions，state-dir也必须在其中；不存在“通用解析了但当前命令忽略”的选项。命令表的secretFields成员禁止出现在该文件内，即使值为空、null或占位字符串也拒绝。原始载荷/解析错误片段不回显。

`center configure`专用`--endpoint <HTTPS URL>`及恰一个`--system-ca`、`--ca-file <path>`、`--spki <64 hex>`。证书文件只读一次并作为值交给CG；原绑定匹配/保存仍由CG裁决。其他命令不接受这些配置选项，不用失败连接建议自动信任新证书。

只读命令接受`--refresh`，省略沿CG2 prefer-copy；写命令不接受。普通读取与秘密读取均有提供者声明的有界输入限额，超限显式拒绝，不截断。`--help`及`--version`是无治理动作的进程说明，不访问状态/中心；机器模式不兼容这两种说明，以输入不合报告，不输出非CG文档。无参数时显示本期帮助；TUI入口单独采用前不伪装成已支持。


## S-3 取得非秘密输入

1. 输入：已解析路径及被选择命令，可能含证书文件与非秘密载荷文件；不含任意秘密读取指令。
2. 前置：命令/选项纯语法有效，未开始CG动作。
3. 次序：每文件打开并有界读取一次；UTF-8不合、BOM、JSON语法不合、非对象或重复成员拒绝。本期JSON数值只接受十进制安全整数字面量，不接受小数或指数写法；越界整数也拒绝，不能先经浮点舍入而变成合法期限。证书文件不按JSON读取，由CG信任配置进一步核对。
4. 状态：仅形成不可变输入快照，不写源文件，不改变本地选择。
5. 成功：原字符串/对象语义保留；不偷偷补入当前账号或当前租户。
6. 失败：读取不可用、大小超限、表示不合，进入S6稳定输入诊断；没有部分载荷继续执行。
7. 重复：本次不重读、不自动改路径；下一次命令可明确重试。
8. 外部效果：只读用户指定文件，无网络/治理修改。
9. 收场：成功、失败、取消均关闭本次拥有的文件句柄；不删除输入文件。


## S-6 安全呈现与进程状态

操作前人读只消费CG2 Preview，操作后公开数据只消费CG2 Output。所有人读命令要求stdout是实际TTY，缺席时明确输入不合并提示显式machine模式，不能悄悄改模式；机器无此要求。改密预览必须说明全部旧登录失效，不能隐含新增权限、凭据找回或替用户确认其他治理动作。人读至少明确操作、原中心、账号/未知、非秘密登录句柄、原expectedTenant（若有）、远端阶段/结果、本地保存结果、线上/副本/无数据；副本显示取得时刻，失败字面保留；不得把当前租户等同成员有效，或把报告原身份改挂到新选择。人读可用本地化说明，但保留精确失败名与报告关联标识。

人读的远端字符串和ID必须作为数据转义，不能成为ANSI/OSC、光标移动、终端标题或伪造的新提示。机器输出必须一次完整合法JSON表示，JSON字符串中的控制字符不得以可执行终端序列泄出；stdout不混入进度、logger或调试输出，诊断只到stderr且不含输入/原异常。不同呈现模式不得改变CG调用与结果状态。

应用在CG受理前失败时，使用同一CG2 Output形状表达未发起：action/operation只取已验证命令，未知时invalid/null；origin未知，不猜记录；remote=not-attempted/none/false，local=not-requested，view=none，use=ended。表示/秘密来源不合归admission.invalid-input；CLS不可用归local-unavailable、损坏/未来格式沿同名原因；未声明异常归独立defect及稳定internal-defect。关联标识由应用为这次未受理调用生成。应用失败发生在CG已受理后不能使用这个“未发起”模板，须等其真实结果；缺陷遵守CG2 S14，不用异常文本救场。

写stdout失败、EPIPE或输出终端在完整JSON交付前消失，不尝试补写第二个JSON或重做业务；尽可调度地完成资源收场。进程状态70表明输出未完整交付，不能凭已生成的报告声称用户收到；无法写stderr也不触发无限递归诊断。正常报告进程状态沿CG2 S15，成功改密/退出后的reenter-required也不由CLI私改为0。


## S-10 交付前后失败的收敛

正常次序是CG动作返回 → 完整CG close → CLS close → 最终报告输出。TTY恢复包含在输入回调实际结束里，必须先于目标治理请求；输出以后没有普通close任务，也不再开始业务。进程说明/help路径没有这两项资源。

| 失败位置 | 报告与收场 |
|---|---|
| CG受理前的语法、来源声明、非秘密文件或CLS打开失败 | 使用S6未发起模板；源字段只来自验证过的命令。已打开文件仍等实际关闭 |
| CG输入回调内的正常来源/权限/EOF/取消 | 返回cancelled，CG2保留准备读数和本地结算；stderr只给稳定诊断代码，不重新生成“完全未访问”报告 |
| 输入回调内TTY恢复或已打开文件关闭的未声明失败 | 不返回continue，作为稳定input缺陷交CG；继续尽可调度恢复，不发送目标、不宣称恢复成功 |
| CG动作抛未声明异常而没有可交付报告 | 应用不能猜远端结果或伪造not-attempted；只在stderr报稳定缺陷并状态70，尽可调度收场；机器文档此时未交付 |
| CG close拒绝 | 保留已经返回的CG报告，状态70及稳定收场诊断；不称CG静止，不主动close借用的CLS，不靠process.exit强行“完成”。自然进程结束也不算静止证据 |
| CLS close拒绝（CG已实际静止） | 保留CG报告与原本地结算，状态70及稳定收场诊断；不将关闭失败解释成提交失败或重做治理 |
| 最终输出开始前已知应用收场缺陷 | CG报告保持事实不变，stderr稳定诊断和退出70是本次交付失败；不伪造CG内部defect.stage来指代不同拥有者 |
| 最终输出过程中EPIPE/写失败 | 不补第二份JSON，不再执行业务；原报告是否生成与用户是否收到分开，状态70；stderr失败不递归 |

稳定诊断只用封闭代码：invalid-command、invalid-options、input-unavailable、input-too-large、invalid-encoding、invalid-json、secret-permissions、secret-source、input-eof、input-cancelled、tty-required、tty-unsupported、input-restore-failed、state-unavailable、state-invalid、internal-defect、client-close-failed、state-close-failed、output-failed。正常CG失败已在报告里，不把原错误文本塞进诊断。

未发起模板的operation：register固定AR2 S8、login固定AI3 S15、logout固定AI3 S16、invoke取命令表坐标、configure/health与invalid为null；它不是任意输入声称的operation。正常状态沿CG2 S15，只有本节明确的应用交付失败覆盖为70。

@@PROPERTIES
- 语法无效的调用不产生命令，也不触发任何文件或状态访问。
- 呈现模式的还原只影响输出形式，不授权任何命令。
- 不存在「解析了但当前命令忽略」的选项。
