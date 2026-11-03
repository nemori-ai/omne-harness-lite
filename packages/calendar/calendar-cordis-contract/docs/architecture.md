# 成员架构

## 模块与依赖

根入口保持无运行服务定义。[cordis.ts](../src/cordis.ts)声明抽象 Service、稳定 provide/key 与 Context 类型增补，方法类型沿 calendar-contract 端口。它不导入 calendar 或 calendar-local 实现。

成员关系见[组架构](../../docs/architecture.md)，公共服务 DTO 与本机工厂配置分开。

## 关键机制与理由

QueryService 和 SupplyService 分别实现纯公开服务端口，provide 与 key 同源。提供者继承定义，不重声明 provide。Cordis 定义是进程内装配协议，不是 HTTP 或跨进程传输；未来远程适配也须单独兑现业务契约。

## 验证与维护

持续资源见[测试](../tests/README.md)。公开形状修改时同步真实消费者，行为修改回 [SPEC](../SPEC.md)。本域验证、独立接受和 M2 后真实跨域装配分别取证。
