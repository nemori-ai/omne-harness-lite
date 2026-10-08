# @omne-harness-lite/mcp-endpoint

[English](README.md)

提供作者声明的 MCP 连接目标、超时、动作副本与 OAuth 绑定表示的纯数据模块。根据接入点与调用方显式传入的动作副本推出资产声明。

本包是尚未发布的私有 ESM workspace 成员。请在本仓库内使用声明的 Node 与 pnpm 版本，环境准备见[开发指南](../../../docs/development.md)。以下导入均使用包的公开入口，每个示例都可以独立使用。

| 公开 API                                   | 用途                               |
| ------------------------------------------ | ---------------------------------- |
| `judgeMcpEndpoint`、`judgeMcpValue`        | 判定接入点与相关表示               |
| `deriveMcpDeclarations`                    | 推出固定设置与已知的逐动作权限声明 |
| `actionEntryName`                          | 构造可投影的工具条目名             |
| `mcpBodyContract`                          | 为资产模型提供 MCP 正文规则        |
| `validate`、`schemaId`、`SCHEMA_DEF_NAMES` | 使用 Schema 校验面                 |

## 判定连接目标

接入点名字独立于正文传入。示例地址只是数据，不会发起连接。

```ts
import { judgeMcpEndpoint, judgeMcpValue, type McpEndpoint } from '@omne-harness-lite/mcp-endpoint'

const endpoint: McpEndpoint = {
  transport: { kind: 'streamable_http', url: 'https://mcp.example.invalid/api' },
  timeouts: { connect: 'PT5S', call: 'PT30S' },
  permissions: { execute: { default: 'ask' } },
}
console.log(judgeMcpEndpoint(endpoint, { capabilityName: 'repo' })) // { ok: true }
console.log(
  judgeMcpEndpoint({
    ...endpoint,
    transport: { kind: 'streamable_http', url: 'https://user:secret@example.invalid' },
  }),
) // { rejected: 'url_invalid' }
console.log(
  judgeMcpValue('OAuthBinding', {
    id: 'oauth_binding_1',
    state: 'granted',
    since: '2026-09-26T10:00:00Z',
  }),
) // { ok: true }
```

## 保留动作副本信息并投影名字

已经取得的空动作集合与尚未取得动作集合不同；两种情况下都能推出固定连接设置。

```ts
import {
  deriveMcpDeclarations,
  actionEntryName,
  judgeMcpValue,
  type McpEndpoint,
  type ActionSnapshot,
} from '@omne-harness-lite/mcp-endpoint'

const endpoint: McpEndpoint = {
  transport: { kind: 'stdio', command: 'repo-mcp', args: ['--readonly'] },
  timeouts: { connect: 'PT5S', call: 'PT30S' },
  permissions: { execute: { default: 'ask' } },
}
const actions: ActionSnapshot = {
  kind: 'fetched',
  fetchedAt: '2026-09-26T10:00:00Z',
  tools: [
    {
      name: 'read',
      description: 'Read a file',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
      },
    },
  ],
}
console.log(judgeMcpValue('ActionSnapshot', actions)) // { ok: true }
const known = deriveMcpDeclarations(endpoint, actions)
console.log(known.actionSnapshotKind) // fetched
console.log(known.declarations.map(item => item.item))
// ['connectionTarget', 'credential', 'connectTimeout', 'callTimeout', 'execute:read']
console.log(deriveMcpDeclarations(endpoint, { kind: 'not_fetched' }).actionSnapshotKind) // not_fetched
console.log(deriveMcpDeclarations(endpoint).actionSnapshotKind) // undefined
console.log(actionEntryName('repo', 'read')) // { ok: 'repo:read' }
console.log(actionEntryName('repo', 'has space')) // { notProjectable: true }
```

## 失败与边界

判定返回 `{ ok: true }` 或 `{ rejected }`，`malformed` 带 `M` 诊断。名字投影返回 `{ ok: name }` 或 `{ notProjectable: true }`。动作条目名只提供向前构造；应分别保留接入点与对端名字，不通过拼接后的名字反解它们。

MCP 描述的拓展字段保留为 JSON 数据。这里不编译或修补 `inputSchema`；投影为可执行 Tool 定义需要消费者进行 Tool 接收判定。动作副本的信息显式区分：未传入、`not_fetched`、`fetched` 是三种情况。只有取得副本后才推出逐动作权限；没有副本不表示已知动作集合为空。

本包不启动 stdio 进程，不连接 HTTP，不发现或调用工具，不执行 OAuth，不解析凭据，不刷新副本。OAuth 绑定描述数据，不授权状态转移。URL 检查只验证语法，不判定端点可信性或秘密；凭据应放在接入点正文之外。运行时传输、授权与生命周期归消费者负责。

JSON Schema 通过 `@omne-harness-lite/mcp-endpoint/schema` 公开。参见[源码导出](src/index.ts)、[测试](tests/)与[资产求值](../asset-evaluation/README_ZH.md)。

行为与验证职责见[薄 SPEC](SPEC.md)和[验证入口](verification/README.md)。
