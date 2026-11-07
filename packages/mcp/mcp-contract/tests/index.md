# tests 索引

<!-- documentation:placeholder -->

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

<!-- documentation:placeholder -->

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口的测试
- [conformance.spec.ts](conformance.spec.ts)：五个端口套件在内存替身上的运行与违约替身
- [wire.spec.ts](wire.spec.ts)：`classifyWireEvent` 对每个应答类别的样本、信封判据、读不懂的行、SSE 模式、进程退出时间窗与 HTTP 状态
- [protocol-functions.spec.ts](protocol-functions.spec.ts)：根导出的协议函数：信封与请求头（含请求头值的编码边界）、页的剔除（关键字表、类型、token 字符）、授权发现（参数名与引号、scope 的切分）、各结果与错误对象的读法（含缺省的键不出现）
- [transport-conformance.spec.ts](transport-conformance.spec.ts)：传输套件在脚本化传输上的运行、违约脚本传输，T5 关闭次序用例在读写真管道的传输上的运行，各种 JSON 类型的参数原样交给对端，以及决策表的结构检查（每个输入组合恰好一行、每行至少一个用例、SPEC 行号一致）
- [additive-shapes.spec-d.ts](additive-shapes.spec-d.ts)：对照 2026-07-28 修订加入的可加形状
- [fixtures/](fixtures/index.md)：测试固定输入
