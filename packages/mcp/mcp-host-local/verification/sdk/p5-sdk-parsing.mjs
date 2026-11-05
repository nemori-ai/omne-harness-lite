// P5: what the SDK 2.4.0 parsing primitives do with the lines and messages that T2 names.
// Run from the package root: node verification/sdk/p5-sdk-parsing.mjs
// The SDK resolves from this package's devDependencies (@modelcontextprotocol/client 2.4.0).
import {
  LATEST_PROTOCOL_VERSION,
  ReadBuffer,
  SUPPORTED_PROTOCOL_VERSIONS,
  extractWWWAuthenticateParams,
  parseJSONRPCMessage,
} from '@modelcontextprotocol/client'

console.log(
  'LATEST_PROTOCOL_VERSION',
  LATEST_PROTOCOL_VERSION,
  'SUPPORTED_PROTOCOL_VERSIONS',
  SUPPORTED_PROTOCOL_VERSIONS,
)

// ReadBuffer on a non-JSON line followed by an answer.
{
  const buffer = new ReadBuffer()
  buffer.append(Buffer.from('garbage line\n{"jsonrpc":"2.0","id":"r1","result":{}}\n'))
  const first = buffer.readMessage()
  console.log('ReadBuffer non-JSON then answer: first readMessage ->', JSON.stringify(first))
}
// ReadBuffer on a JSON line that is not JSON-RPC: throws, line lost.
{
  const buffer = new ReadBuffer()
  buffer.append(
    Buffer.from(
      '{"jsonrpc":"2.0","id":"r1","error":{"message":"no code"}}\n{"jsonrpc":"2.0","id":"r1","result":{}}\n',
    ),
  )
  try {
    console.log('ReadBuffer unreadable error object ->', JSON.stringify(buffer.readMessage()))
  } catch (error) {
    console.log(
      'ReadBuffer unreadable error object -> throws',
      error.name,
      '; next readMessage ->',
      JSON.stringify(buffer.readMessage()),
    )
  }
}
// JSONRPCMessageSchema on an envelope with both result and error.
for (const [label, value] of [
  ['result+error', { jsonrpc: '2.0', id: 'r1', result: {}, error: { code: -32602, message: 'x' } }],
  ['error without code', { jsonrpc: '2.0', id: 'r1', error: { message: 'no code' } }],
  ['error with fractional code', { jsonrpc: '2.0', id: 'r1', error: { code: 1.5, message: 'x' } }],
  ['error with null id', { jsonrpc: '2.0', id: null, error: { code: -32602, message: 'x' } }],
  ['result with extra key', { jsonrpc: '2.0', id: 'r1', result: {}, extra: 1 }],
  ['no jsonrpc', { id: 'r1', result: {} }],
]) {
  try {
    console.log(`parseJSONRPCMessage ${label} ->`, JSON.stringify(parseJSONRPCMessage(value)))
  } catch (error) {
    console.log(`parseJSONRPCMessage ${label} -> throws ${error.name}`)
  }
}
// extractWWWAuthenticateParams on the challenges the suite uses.
for (const header of [
  'Bearer resource_metadata="https://peer.test/.well-known/oauth-protected-resource/mcp", scope="files:read"',
  'Bearer error="insufficient_scope", scope="files:write"',
  'Bearer scope="a b"',
  'Bearer realm="mcp"',
  'Basic realm="x"',
  'DPoP scope="a"',
]) {
  const response = new Response(null, { headers: { 'www-authenticate': header } })
  console.log(
    `extractWWWAuthenticateParams ${JSON.stringify(header)} ->`,
    JSON.stringify(extractWWWAuthenticateParams(response)),
  )
}
