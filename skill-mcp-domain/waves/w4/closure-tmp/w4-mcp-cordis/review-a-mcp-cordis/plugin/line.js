// The line port: what the session needs from one wire. A line moves bytes and reports what the
// wire did; it does not classify anything and judges nothing. The session turns an exchange and
// the line events into contract wire events, classifies them with `classifyWireEvent`, and draws
// the conclusion with the contract's decision layer. Two lines implement this port:
// `stdio-line.ts` and `http-line.ts` (Streamable HTTP, with the legacy HTTP+SSE mode).
export {};
//# sourceMappingURL=line.js.map