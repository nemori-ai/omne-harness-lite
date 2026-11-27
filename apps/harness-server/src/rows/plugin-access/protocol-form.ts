/** What the code of a plugin gives back for the point access.protocols, in a sentence: the guest form's gives. */
export const PROTOCOL_GIVES =
  "a protocol written as data and its handlers: { contract: { name, major, operations }, handlers }. Each operation is { effect: read or commit, limit: small or input, body: a rule, result: a rule }; each handler takes (input, { ports }) and answers { outcome: succeeded, body } or one of denied, basis-unavailable, unknown. The key is <name>/v<major>; the protocol is the tenant's own."

/** A member to copy for the point access.protocols, and its file. */
export const PROTOCOL_EXAMPLE = [
  '{"point":"access.protocols","key":"weather/v1","module":"protocol.js","export":"protocol"}',
  'protocol.js:',
  'const text = { kind: "text" }',
  'export function protocol() {',
  '  return {',
  '    contract: { name: "weather", major: 1, operations: { forecast: { effect: "read", limit: "small", body: { kind: "object", fields: { city: { rule: text } } }, result: text } } },',
  '    handlers: { async forecast(input) { return { outcome: "succeeded", body: "sunny in " + input.city } } },',
  '  }',
  '}',
].join('\n')
