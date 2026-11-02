# testing

本目录是 `./testing` 公开入口，提供非耐久替身与独立契约用例。不得装进生产装配。

- [index.ts](index.ts)：公开再导出。
- [case.ts](case.ts)：断言与不适用结果。
- [doubles.ts](doubles.ts)：提供者、账本、守卫、恢复授权、环境授权与作用域绑定替身。
- [memory-files.ts](memory-files.ts)：内存文件设施替身。
- [scripted-command.ts](scripted-command.ts)：脚本命令设施替身。
- [scripted-terminal.ts](scripted-terminal.ts)：获取独立的脚本终端设施替身。
- [scripted-process.ts](scripted-process.ts)：命令与终端共用的内部进程机制。
- [terminal-conformance.ts](terminal-conformance.ts)：可复用终端协议用例。
- [provider-conformance.ts](provider-conformance.ts)：提供者套件。
- [environment-conformance.ts](environment-conformance.ts)：执行环境套件。

每条用例新建主体并清理。缺少必要控制钩子时报不适用，不计为通过。
