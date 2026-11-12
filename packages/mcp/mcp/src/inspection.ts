// The category port `EndpointInspection`: the contract's body contract for category `mcp`, plus
// `inspect` on any JSON tree. Both read the body with the one parser of the contract; no rule is
// repeated here.
import {
  mcpEndpointBodyContract,
  parseEndpointBody,
  type EndpointInspection,
} from '@omne-harness/mcp-contract'

export function createInspection(): EndpointInspection {
  return {
    ...mcpEndpointBodyContract(),
    inspect: body => parseEndpointBody(body),
  }
}
