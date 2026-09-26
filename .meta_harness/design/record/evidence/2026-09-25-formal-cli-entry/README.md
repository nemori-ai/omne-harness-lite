# CQ1入口生命周期有限模型

2026-09-25。候选r1只保留原始输入/日志；r2为44个distinct states与五负控，针对输入与依赖释放、模式恢复和单次输出；r3补NoEarlyEcho与第六负控，正例仍44个distinct且EventuallyClosed通过，六负控各exit12并命中自己的不变量。

模型、cfg、原始输出和返回码按每次运行保存，candidate-input为r3后的规范/命令表快照。Temurin25-jre及TLC1.7.4发行jar/TLC2.19，来源沿CG2模型记录。这里没有运行应用。模型将PasteEnd作为可信抽象事件，不能从该结果推导2004字节流帧可信；明确不证明真实终端、恢复失败、CG/CLS close抛错、EPIPE或输出映射。

规范表达独立复核已确认NoEarlyEcho对提前恢复回显可失败、注册条款展开且没有剩余表达阻断。TTY协议仍有独立架构阻断；文件CLI可作为不进入TTY的部分路径另行采用。
