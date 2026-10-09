@@GOAL
交付 `apps/cli/src/application.ts` 中的 `runCli`：一次 CLI 调用的装配与收场——解析调用、取得输入、打开本机状态（CLS）、创建治理客户端（CG）、执行一次 `runPrepared`、按次序关闭并交付最终报告，返回进程退出状态。`CliRuntime`、`providers` 与签名已在文件里给出。

@@WRITE_PATHS
- `apps/cli/src/application.ts`
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | CQ1 S-5、S-10 的正常次序 | CLS 打开 → CG 动作 → CG close 实际完成 → CLS close → 最终报告输出；人读模式的 Preview 在取得秘密之前输出 |
| A2 | CQ1 S-6 的人读与机器呈现 | 人读命令在 stdout 不是 TTY 时以 `tty-required` 拒绝且不打开状态；帮助与版本不访问状态；机器输出是一份完整 JSON 文档 |
| A3 | CQ1 S-10 失败表逐行 | 受理前失败用未发起模板；CG 动作抛未声明异常时不伪造报告；CG close 被拒时保留报告、不关闭借用的 CLS；CLS close 被拒时保留报告；输出失败不重写、不重做业务。各行的诊断代码与退出状态按表 |
| A4 | CQ1 S-7 的停止 | 已受理的工作与其 close 实际结束后才释放 CLS；输入读取中收到停止则等它结束且不再打开状态 |
| A5 | 诊断 | 只写封闭代码，格式 `omne: <code>`，不含原异常文本 |
| A6 | 成员检查 | `apps/cli` 下 `pnpm test` 与 `pnpm typecheck` 通过 |

@@SPEC
- 参与方公开面：`@omne-harness-lite/governance-client-operations`（`createGovernanceClient`、`runPrepared`、`close`、`exitStatus`、报告类型）；`@omne-harness-lite/client-local-state`（`openClientLocalState`、`ClientStateOpenFailure` 及其 `reason`）。
- 相邻模块：`parser.ts`（调用形状）、`input.ts`（`buildIntent`、`readSecrets`）、`presentation.ts`（`previewText`、`reportText`、未发起模板 `unopened`）、`validation.ts`（`validIntent`、`validReport`）、`version.ts`、`diagnostic.ts`。
- 本次采用值：默认状态目录为 `<home>/.omne-harness-lite`，`--state-dir` 显式覆盖，目录必须是绝对路径；应用交付失败的退出状态为 70，人读被拒为 2，其余沿 `exitStatus`；帮助文本列出命令表每条命令与其选项。


本评估使用固定基底的接口／命令表与以下局部规则，CQ编号仅为本案例条款标签。它们不是当前项目的产品交付承诺或历史接受记录；不得据此恢复中央设计目录。

## S-5 执行一次治理命令

1. 输入：S2～3获得的完整非秘密Intent、S4输入参与方、状态目录及人读/机器呈现选择。
2. 前置：输入有效，应用尚未开始关闭；一个命令不排队成批量事务。
3. 次序：打开CLS，创建借用它的CG服务，调用一次runPrepared，在其唯一输入回调里展示Preview、说明影响并取得秘密，然后保留结果；机器也通过同一参与面取得明确秘密文件，不另行决定身份。不在应用拼HTTP、补授权读、重试写或二次CAS。对用户确认的expectedTenant逐值保留，不能发前重新查询并替换。
4. 状态：应用不拥有账号/组织事实。所有持久改变由CG/CLS处理；应用只拥有本次输入/输出/资源引用。
5. 成功：按S6交付安全报告及其进程状态。远端成功但本地未保存照原报告显示；重新进入要求也保留。
6. 失败：CG正常结果原样分类；本地打开失败/未声明缺陷按S6映射。不能在catch里伪造远端未修改、登录失败或退出成功。
7. 重复：本次一次CG调用，不自动重放。用户新命令是新使用。
8. 外部效果：全部中心/本地操作由CG拥有；stdout最终写入不可回滚，不能因重绘或输出失败重发业务。
9. 收场：先停止新的输入，等待完整CG close，再关闭CLS；最后释放本次引用。CG未实际静止不得提前关闭依赖。收到可处理终止信号时遵循相同步骤，不用process.exit中断已接纳结算。


## S-6 安全呈现与进程状态

操作前人读只消费CG2 Preview，操作后公开数据只消费CG2 Output。所有人读命令要求stdout是实际TTY，缺席时明确输入不合并提示显式machine模式，不能悄悄改模式；机器无此要求。改密预览必须说明全部旧登录失效，不能隐含新增权限、凭据找回或替用户确认其他治理动作。人读至少明确操作、原中心、账号/未知、非秘密登录句柄、原expectedTenant（若有）、远端阶段/结果、本地保存结果、线上/副本/无数据；副本显示取得时刻，失败字面保留；不得把当前租户等同成员有效，或把报告原身份改挂到新选择。人读可用本地化说明，但保留精确失败名与报告关联标识。

人读的远端字符串和ID必须作为数据转义，不能成为ANSI/OSC、光标移动、终端标题或伪造的新提示。机器输出必须一次完整合法JSON表示，JSON字符串中的控制字符不得以可执行终端序列泄出；stdout不混入进度、logger或调试输出，诊断只到stderr且不含输入/原异常。不同呈现模式不得改变CG调用与结果状态。

应用在CG受理前失败时，使用同一CG2 Output形状表达未发起：action/operation只取已验证命令，未知时invalid/null；origin未知，不猜记录；remote=not-attempted/none/false，local=not-requested，view=none，use=ended。表示/秘密来源不合归admission.invalid-input；CLS不可用归local-unavailable、损坏/未来格式沿同名原因；未声明异常归独立defect及稳定internal-defect。关联标识由应用为这次未受理调用生成。应用失败发生在CG已受理后不能使用这个“未发起”模板，须等其真实结果；缺陷遵守CG2 S14，不用异常文本救场。

写stdout失败、EPIPE或输出终端在完整JSON交付前消失，不尝试补写第二个JSON或重做业务；尽可调度地完成资源收场。进程状态70表明输出未完整交付，不能凭已生成的报告声称用户收到；无法写stderr也不触发无限递归诊断。正常报告进程状态沿CG2 S15，成功改密/退出后的reenter-required也不由CLI私改为0。


## S-7 停止、异常与模式恢复

应用只在可调度前提下承诺收场。捕获SIGINT/SIGTERM/SIGHUP时停止本次继续取得输入，向CG2交互发出取消，输入拥有者等已开始的粘贴尾段实际结束并恢复TTY，CG继续等待已接纳工作（网络可能直到既定超时才终结）及其本地结算。尚未调用CG的取消报告未发起、输入不合，不伪称已撤销远端效果。已调用CG的取消不抹去已知事实、不重放；若仍可输出，按实际结果交付。

停止是幂等的，同一资源只由其拥有者关闭；未完成的输出/恢复失败只能稳定报错，不能让错误处理重复打印秘密。SIGKILL、进程崩溃、断电和终端物理消失不在可恢复保证内，验证需明确这些不可调度边界。


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

## 装配与资源

一个Node24进程，Linux/macOS当前用户；本案例使用固定代码基底，目标与写入范围由上方施工简报限定。默认状态目录两平台统一为`$HOME/.omne-harness-lite`，`--state-dir`可显式覆盖。HOME必须指向当前OS用户可信且耐久已存在的绝对目录；不按cwd/登录名猜。应用不创建任何祖先目录：默认只由CLS创建HOME下的最终私有目录，自定义路径的父层同样必须已可信耐久存在，缺席则明确失败。这样CLS对直接父目录与私有目录的同步承诺不被应用新增路径削弱。不同中心用不同目录，不chmod既有不安全目录来绕过核对。

应用通过CLS公开构造创建实例，再通过CG公开构造创建服务。此切片不要求起root Context：两个公开构造与各自Cordis插件来自同一提供者实现；无需为了形状添加空Context。未来嵌入Cordis宿主时须依照已接受节点先close CG、再撤CLS，不能依赖effect并发排序。

应用内部按parser/input/secret/presentation/lifecycle分模块；它们不是独立服务。public报告沿CG Schema校验，type-only引用CG类型。只有主入口负责stdout；logger/进度不进入机器流，底层异常只映射稳定分类。原异常、完整输入、TLS材料和CLS快照不交给通用logger。

## 输入取得

Node公开参数解析与fs/TTY API，不能依赖私有readline回显方法。命令目录从CQ1 commands.json准确复制并做漂移核对；普通文件同样先以非阻塞/不接管终端方式打开、fd核regular后才读，不读FIFO/设备；普通payload有界64KiB、证书1MiB、每个秘密64KiB，UTF-8解析不替换非法字节。重复JSON成员拒绝，不做字符串ID归一化。只有机读报告或人读公开投影能离开应用。

秘密文件：以O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_NOCTTY打开最终分量；类型核对前不阻塞等待FIFO对端、不取得字符设备控制终端，fstat核当前euid、regular、POSIX权限不得给组/其他人任何访问；核对之后只读该fd，打开后路径替换不重取。最终文件符号链接拒绝；父路径重定向不能绕过已打开文件的所有权/权限核对，不声称防同UID/root或额外ACL授权。本期采用秘密文件入口，不接受fd/pipe或普通stdin：Node文件读取取消不自动中止已提交的阻塞pipe读取，不能用Promise.race返回后留下读者消费数据。普通文件读取已发出后取消只停止后续受理，实际读取返回并关闭拥有句柄后再完成收场；不承诺操作系统IO停滞时的有界释放。

TTY秘密协议候选（尚待实际原型核对）：stdin/stderr须均为TTY且fstat指向同一字符设备；只支持新建CLI进程的独占stdin，不接管已有data/readable监听者或另一raw拥有者。Node24.21的setRawMode(true)首次切换由libuv捕获实际termios，setRawMode(false)恢复该快照；不能用启动时isRaw=false推断OS原来就是cooked。实际OS属性须在两平台PTY验证。

模拟器模式另管：进入raw后用DECRQM查询2004状态，只有明确可变set/reset答复才继续；不识别/查询超时则不提示秘密，明确tty-unsupported，可另行使用秘密文件。原为reset时发送enable并再次查询确认；原为set不改变。查询与控制输出都走同一stderr终端，不能由stdout重定向到别处。恢复时只恢复本次修改的2004，并查询确认，再恢复OS模式；查询失败明确input-restore-failed，不冒称成功。查询探测上限1000ms只裁“未取得支持证明”，不当作输入尾段已结束；已有输入解析责任不能因这个定时器消失。

输入按字节增量解析，秘密仅在内存，任何字符/星号/长度均不回显。支持已提交Unicode文本、尾部退格、整行清除、括号粘贴和帧外显式Enter；不支持的编辑控制键拒绝本次输入。粘贴中的换行/控制序列不提交目标，内容非法或超过64KiB时标失败、丢弃内容但继续拥有帧直到end标记或真实EOF；始标记的跨块前缀同样不能提前释放。取消/信号只标停止，不能恢复回显后让余下秘密进入shell或下一提示。缓冲只保留有限解析前缀与允许大小内容，超限后不继续累积。外部输入若永不完成已开始帧，关闭也不声称完成；这是具名输入最终结束前提，不用50ms空闲或超时替代。终端失联/物理消失走恢复失败边界。

EOF指输入流实际结束，Ctrl-D只是受限提示的取消键。严格UTF-8解码跨块保持完整，不用替换字符改写凭据。帧内不支持内容明确拒绝，秘密文件可表达精确UTF-8。此协议不是通用编辑器；真实IME与终端兼容性必须单独验证，不能从合成字节流推导。

在CG2唯一回调内从Preview展示身份/影响，再逐个取得秘密；每个提示恢复实际完成后才能继续下一个，全部完成才返回continue。取消时等已开始粘贴尾段收场，不能立即切到下一提示。不保存undo/kill ring。引用释放不等于内存可靠擦除。TUI的丰富编辑器与pi-tui适配不在这次CLI采用范围，不能把该密码提示扩充成自建全功能渲染器。

## 输出、信号与失败

人读只投影CG报告：非秘密身份、结果分类及数据。文本经JSON式转义后再增加由应用拥有的排版，额外转义DEL/C1与双向控制字符，远端ESC/OSC不能成为终端指令。机器输出一个验证过的CG JSON文档；UTF-8 JSON编码后的控制字节与人读相同检查，换行只由应用写入。stdout.write必须等待回调/背压结果，EPIPE后只记录稳定失败且不再次输出正文。

信号订阅属于应用本次运行；SIGHUP/SIGTERM/SIGINT先取消未完成输入并恢复TTY，标记停止，调用CG close传播交互取消；尚未受理时不再开始CG调用。已受理CG动作无法以信号证明撤销，必须等待原动作/close（网络最长仍由CG超时控制），确认CG静止后关CLS，再输出最终报告。close拒绝沿CQ1 S10，不把Promise拒绝当静止证明。process.exitCode在完成后设置，不用process.exit抢断收场。输出失败发生在远端动作后时不能构造“未发送”假报告。

预受理失败模板只使用已验证命令和未知origin，符合CG Schema；报错没有源文件内容/原异常。TypeScript内部未声明异常向主入口稳定诊断边界传播。无参数显示帮助；正式TUI命令尚未开放，不能在帮助里暗示已完成。

## 分发与尚缺的证据

本期仍以npm包+bin/Node24为候选；workspace依赖未发布，普通npm pack不自动成为可安装交付。需通过离线依赖打包或可独立安装的制品实验后再采用具体打包路径，不能拿本地pnpm执行当员工安装完成。pi-tui直接采用的E1/E3另有未完成义务。

本案例使用固定CLI代码和下述文件输入规则。TTY秘密输入不是本任务的可实施面。

## 预览、数值与收场规则

CG2 Preview承担原捕获可见身份，所有人读要求stdout TTY；改密影响在回调内说明。命令表含逐条选项白名单与载荷来源，错误选项不会打开文件。数值输入只接受安全整数字面量，拒绝小数/指数避免舍入越过期限校验。CQ1 S10把输入恢复、CG/CLS关闭与输出失败分开，保留原CG事实。

## 本案例采用的文件输入

本案例使用受保护秘密文件CLI：全部31路由及配置/体检/退出入口、CG2 Preview与公开报告均保留；秘密只从明确指定的受保护常规文件取得，来源缺席返回tty-unsupported，不进入raw或2004，不在帮助中宣称可交互输入密码。没有秘密的命令仍在人读回调中展示Preview。这个增量不以TTY候选的成立为前置，也不声称完成TUI/秘密提示目标。

上方TTY协议仍是未采用候选：2004模式可查询不代表正文中的ESC[201~不可伪装结束，输入流中的DECRQM形状也不自动是真答复。必须先建立受支持模拟器/设置与可信输入来源前提并实测，不能继续只改字符串解析器解决不可区分的帧。用户本期TTY/TUI义务不因此删除；本切片取得可运行CLI后独立接续，不能以文件入口作为最终全链路验收。

@@PROPERTIES
- 应用不拥有治理事实：报告只来自 CG 或未发起模板，不在异常处理里改写已发生的事实。
- 每个资源只由其拥有者关闭一次；CG 未实际静止不释放它借用的 CLS。
- 一次调用至多一次 CG 动作，任何失败都不自动重放。
- 不用 `process.exit` 中断收场。
