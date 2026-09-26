# CG2交互输入候选的有限模型与Schema

2026-09-25。TLC1.7.4发行包/TLC2.19、Temurin25容器，jar与镜像沿前次CG1模型运行的固定来源。r1有效配置56个distinct states，无反例且EventuallyClosed通过；四负控均exit12，分别触发PreviewMatchesExecution、NoLateSend、NoEarlyRelease、NoForgottenInteraction。模型文件与当前候选逐字节相同。

正向/负控的源、cfg和原始输出在model-r1；候选输入在candidate-input。Node24.21.0/Ajv2020对v1引用和新增Intent/Preview/PromptResult/PromptExchange检查通过，最终r2为110例。r1的108例输出只作先前过程观察，当前候选快照对应r2；不把后续配置安全修订倒写成r1已验证。

模型只从一次已捕获身份开始，最多一次外部选择变更、一个交互和一次网络/结算。弱公平及交互/网络/存储最终可调度结束是前提；不证明真实TTY、秘密字节流、SQL耐久、所有输出组合或应用关闭。Schema也不替代非网络URL/X509安全核对的实际执行。CG2尚未接受或实现。

D048采用时补充：final-114保留四个交互中止/异常Output场景加入后的114例输入及通过日志；此前110例快照保持不变。模型及其cfg未变，没有重跑声明。新增源码验证尚待运行。
