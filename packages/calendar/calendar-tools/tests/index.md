# tests 索引

持续资源和覆盖边界见 [README.md](README.md)。

## 内容

public-entry/cordis-entry 核对独立入口；environment.spec.ts 验证每次可信上下文和基础环境释放；author.spec.ts 通过真实公开 Tool 作者接口检查四动作、完整输出、托管和当前资格读回。受控夹具不证明最终 Tool 宿主已接线。

从公开入口用例开始，再按所改行为读取专题用例和 [fixtures](fixtures/index.md)。独立验收归 [acceptance](../acceptance/index.md)，单次输出留任务 tmp。
