# testing

本目录是 `./testing` 公开入口，提供非耐久替身与独立契约用例。不得装进生产装配。

- [index.ts](index.ts)：公开再导出。
- [case.ts](case.ts)：断言与不适用结果。
- [doubles.ts](doubles.ts)：提供者、账本、守卫、恢复授权、环境授权与作用域绑定替身。提供者替身带配额域、配额、原获取查询、获取列出与结清。
- [memory-files.ts](memory-files.ts)：内存文件设施替身 `createMemoryFileSystem`。授予根在替身建立时确定，请求只带相对路径。
- [scripted-command.ts](scripted-command.ts)：脚本命令设施替身 `createScriptedCommandFacility`。脚本答复每次 `start`，替身给出输出块、终局与停止两态。
- [scripted-terminal.ts](scripted-terminal.ts)：每次获取独立的终端替身 `createScriptedTerminalFacility`，提供创建、执行、关闭、列表及显式失效和退出观察。
- [scripted-process.ts](scripted-process.ts)：命令与终端共用的内部进程机制，不从 testing 入口导出。
- [terminal-conformance.ts](terminal-conformance.ts)：`terminalFacilityConformance` 的七条可复用协议用例。
- [provider-conformance.ts](provider-conformance.ts)：提供者套件。
- [environment-conformance.ts](environment-conformance.ts)：执行环境套件。

每条用例新建主体并清理。缺少必要控制钩子时报不适用，不计为通过。

调用方把两个设施替身经脚本提供者的 `lease` 装进租约。给出 `lease` 时，它替换整张默认设施表；没有给出时，脚本提供者使用自己的默认设施。调用方在 `retire` 脚本里调用两个替身的 `close()`。接入规则见[公开接口页](../../docs/public-api.md#测试入口)。两个替身只证明契约形状与判据，不证明真实进程、文件系统、授予根核对或隔离。

套件函数只组装具名 `ConformanceCase` 清单。各 `check…` 函数拥有一项行为义务。夹具构造与逐项清理独立于行为断言。提供者套件由本包的 `provider-conformance.spec.ts` 直接执行十六项义务，并逐项否定坏提供者。执行环境套件有三十五项，`subject(ports)` 收到套件的访问端口替身，主体用它们构造执行环境，可另给恢复授权。它由登记表成员与 host-local 消费，真实宿主设施保证仍归 host-local。

## 终端替身

每次获取调用一次 createScriptedTerminalFacility。调用方显式配置 facilities: ['terminal'] 与 lease: { terminal: terminal.facility }，并在退役脚本中调用 terminal.close()。默认提供者的 terminal 行为不变。

脚本收到原始 execute 请求和独立的基态快照 { observedCwd, env }。它按 ScriptedTerminalAnswer 答复 started、rejected 或 unknown。输出、终局与停止配置沿用 ScriptedCommandAnswer。输出只能使用 terminal 流，字节和单读者规则与命令替身相同。

started.observedCwd 是脚本报告的成功控制观察，仅在该段执行得到 completed 时保留。请求的单次 cwd/env 覆盖不会改变基态。替身不解析脚本文本，也不模拟 shell 对环境变量的修改。

每个工厂有独立身份空间，引用同时核对 id 和 generation。外来引用、错误代际与失效终端答 rejected/invalidInput。已关闭引用答 rejected/closed。同一终端的脚本答复尚未到达或执行尚未结束时，重复执行答 rejected/busy。其他终端可以独立执行。

未知启动使终端失效，后续执行不重放脚本。设施 close 对正在执行的段请求强制停止。确认停止后关闭终端，未确认则保持失效且终局仍等待实际退出观察。finish(ref) 显式观察脚本段退出，可用于在未确认停止之后收场。invalidate(ref) 表示失去终端控制观察，迟到结果不会使终端复活。工厂的 close() 只拒绝新设施操作，已交出的进程句柄及显式控制仍可使用。

## 终端符合性接入

terminalFacilityConformance({ subject, waitMs? }) 惰性返回用例。每条用例的 subject() 都建立两份独立获取，并返回 acquisitions: [first, second]。每项提供 facility、合法的 createRequest 模板、产生新关联身份的 request() 和 executeRequest(ref)。每次创建从 request() 取得新的 requestId。普通执行请求必须能自然结束。

涉及运行中状态的用例还需要 control。start(acquisition, ref) 启动可控执行，finish(handle) 观察其退出并完成清理。stopMode 和 stopAnswer 声明该夹具准备的段进程停止方式与答复。closeAnswer 独立声明持久终端的关闭答复。段进程停止与终端关闭分别确认，两者可以不同。未确认停止的夹具在调用 finish 之前必须保持执行运行；终端关闭未确认不表示段进程仍在运行。真实后端通过夹具控制函数准备场景，不需要返回测试专属字段。缺少控制时三条用例报告不适用，不计通过。dispose() 清理本条用例的所有获取。

完整的双获取、两种停止答复及收场示例见 [terminal-conformance.spec.ts](../../tests/terminal-conformance.spec.ts)。它直接消费公开入口，并证明共享获取的故障实现能通过普通生命周期，却不能通过归属检查。套件只覆盖进程内协议判据，不证明真实 PTY、系统进程停止或目录持久化。
