# 符合性套件运行器边界 · R1

持续消费者：core/storage测试入口、storage-sql开发测试与两种应用的生产归档。失效事件：测试运行器或打包闭包规则变化。来源是2026-09-26 fable终审；原core/storage/design明确把Vitest放运行时依赖，现状符合旧设计。本次先从制品看到机制代价再核领域要求，双盲未达成，不把该读数当独立领域发现。

性质：Storage行为、符合性判据与生产生命周期不变；测试调用者显式提供测试运行器；普通Storage/host/CLI运行不需要Vitest。这里演化开发API，不产生领域对象、服务、fiber或语言无关契约条款。

| 候选 | 性质承载与代价 | 判断 |
|---|---|---|
| A 测试调用方传runner | ./conformance保留判据，以实际使用的Vitest函数类型约束参数，两个suite只作type import；Vitest为devDependency，三文件显式传runner。普通根不重导出测试类型 | 推荐；当前三消费文件下最小，必须实际证明生产闭包和独立类型消费 |
| B 独立开发工具包 | 套件迁到tools，生产产品包不带任何测试文件，测试SDK可独立演进 | 边界更彻底，但新增成员/入口/维护责任；当前没有必须删去全部测试源码的要求 |
| C 可选peer依赖 | 保持调用形状，但pnpm已解析peer可能仍进入deploy闭包 | 未实测不能承诺隔离，不以元信息可选冒充实际没有依赖 |

A的类型代价：公开conformance声明仍引用Vitest，独立测试消费者必须自己安装同版本开发依赖，以skipLibCheck:false验证；生产根声明不能引入该类型。禁止默认动态import Vitest、全局runner或未检查的自造通用断言DSL。若独立类型消费不成立，或新要求生产包不得含未执行的conformance文件，再回B比较。

独立architecture-reviewer核对A无结构阻断，指出声明解析、atomic.ts遗漏及制品实际清单风险；未执行测试，不代表接受。要求负例：生产制品不得含Vitest/Vite/rolldown等测试依赖，任一出现失败；现有全部C/P13判据不删；普通消费者与测试消费者各在独立安装布局编译。
