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
