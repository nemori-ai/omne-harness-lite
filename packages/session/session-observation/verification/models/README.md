# verification/models

本目录承载本包的形式模型，例如 TLA+、Alloy 或 SMT 模型。

## 允许的内容

模型源文件、配置与说明。

## 边界

模型对应 [SPEC.md](../../SPEC.md) 的「通知」与「定位的读法」条款：不丢唤醒、旧目标的帧不出现在新目标之后、不停在旧的调用上。模型检查的是设计的小模型，不是代码；模型通过不等于实现符合。对应的代码与用例见 SPEC 的「组合与验证」。

## 维护

承诺或实现结构变化时，复核模型的抽象是否仍然成立。

## 本包事实

本目录现在没有文件。会话观察的形式模型三（`SessionObservation.tla` 与四份 `obs-correct`、`obs-dropWhileBusy`、`obs-noDiscard`、`obs-keepOldTarget` 配置）暂在接入组，待搬到本目录，因为接入组另一个会话正在改那里：

- 模型：[SessionObservation.tla](../../../../access/server-entry/verification/models/SessionObservation.tla)
- 说明与运行命令：[接入组模型目录的 README](../../../../access/server-entry/verification/models/README.md)

TLC 在原地运行。
