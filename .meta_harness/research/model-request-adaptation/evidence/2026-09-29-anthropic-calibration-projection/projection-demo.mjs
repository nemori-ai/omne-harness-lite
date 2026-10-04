// Offline research only. Extract the current addBreakpoint function exactly;
// do not import/build the product, tokenize text, or call any model/service.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const checkout = path.resolve(process.argv[2] ?? '.');
const sourcePath = 'packages/model/pi-ai-transport/src/plan.ts';
const source = fs.readFileSync(path.join(checkout, sourcePath), 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');
const expected = 'f84ac1f7356c87c7054ff56a0c56b831b5b6d22517dc09cf19ff6747d947317e';
assert.equal(sha(source), expected, 'Wrong source revision; do not silently test a new implementation');
const start = source.indexOf('function addBreakpoint(');
const end = source.indexOf('export function planRequest(', start);
assert(start >= 0 && end > start);
const fragment = source.slice(start, end);
const signature = 'function addBreakpoint(message: MutableObject, control: JsonObject): void';
assert(fragment.includes(signature));
// Only this known signature is stripped; function body is the product source.
const addBreakpoint = new Function('object',
  `${fragment.replace(signature, 'function addBreakpoint(message, control)')}\nreturn addBreakpoint;`
)(value => typeof value === 'object' && value !== null && !Array.isArray(value));
const clone = value => JSON.parse(JSON.stringify(value));
const stable = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
  return value;
}
const control = { type: 'ephemeral', ttl: '1h' };
function wire(messages) {
  const result = clone(messages);
  const last = result.findLast(m => ['user', 'assistant', 'tool'].includes(m.role));
  if (last) addBreakpoint(last, control);
  return result;
}
function knownControl(value) {
  return value && value.type === 'ephemeral' && value.ttl === '1h'
    && Object.keys(value).every(key => key === 'type' || key === 'ttl');
}
function stripKnownTextMarker(part) {
  if (!part || part.type !== 'text' || typeof part.text !== 'string') return clone(part);
  if (!Object.keys(part).every(key => ['type', 'text', 'cache_control'].includes(key))) return clone(part);
  if (part.cache_control !== undefined && !knownControl(part.cache_control)) return clone(part);
  return { type: 'text', text: part.text };
}
// P1 is the documented ordinary user-text case; other roles stay byte-shaped.
function p1(messages) {
  return messages.map(m => m.role === 'user' && Array.isArray(m.content)
    ? { ...clone(m), content: m.content.map(stripKnownTextMarker) } : clone(m));
}
function sameShapeWithoutTextMarkers(messages) {
  return messages.map(m => Array.isArray(m.content)
    ? { ...clone(m), content: m.content.map(stripKnownTextMarker) } : clone(m));
}
// Structural avoidance proposed by root: choose the same legal representation
// at every request, without claiming equality to the previous wire revision.
function stableArrayWire(messages) {
  return wire(messages.map(m => ['assistant','tool'].includes(m.role)
      && typeof m.content === 'string' && m.content.length > 0
    ? { ...clone(m), content: [{type:'text',text:m.content}] } : clone(m)));
}
// P2 is a local shape hypothesis ONLY; this test cannot certify OR conversion.
function p2ShapeHypothesis(messages) {
  return messages.map(m => {
    const result = clone(m);
    if (Array.isArray(result.content)) result.content = result.content.map(stripKnownTextMarker);
    if (['assistant', 'tool'].includes(m.role) && typeof result.content === 'string'
        && result.content.length > 0) result.content = [{ type: 'text', text: result.content }];
    return result;
  });
}
const prefixEqual = (left, right, project = clone) =>
  stable(project(left)) === stable(project(right).slice(0, left.length));
const text = text => ({ type: 'text', text });
const results = [];
function record(name, value, expectedValue, kind = 'local_shape') {
  assert.equal(value, expectedValue, name);
  results.push({ name, value, kind });
}

const history = [{ role: 'user', content: [text('stable first'), text('stable last')] }];
const oldWire = wire(history);
const nextWire = wire([...history, { role: 'assistant', content: 'answer' },
  { role: 'user', content: [text('new question')] }]);
record('user_append_full_wire_prefix_matches', prefixEqual(oldWire, nextWire), false);
record('user_append_P1_prefix_matches', prefixEqual(oldWire, nextWire, p1), true);
const before = stable(nextWire);
p1(nextWire);
record('P1_preserves_wire', before === stable(nextWire), true);
const badText = clone(nextWire); badText[0].content[0].text += '!';
record('real_text_edit_detected', prefixEqual(oldWire, badText, p1), false);
const badRole = clone(nextWire); badRole[0].role = 'system';
record('real_role_edit_detected', prefixEqual(oldWire, badRole, p1), false);
const badPart = clone(oldWire); badPart[0].content[1].other = true;
record('unknown_text_field_not_erased', prefixEqual(badPart, nextWire, p1), false);
const badControl = clone(oldWire); badControl[0].content[1].cache_control.ttl = '2h';
record('unsupported_TTL_not_erased', prefixEqual(badControl, nextWire, p1), false);
const textData = [{role:'user',content:[text('{"cache_control":{"ttl":"business-value"}}')]}];
record('literal_cache_control_inside_text_preserved',
  p1(wire(textData))[0].content[0].text === textData[0].content[0].text, true);

for (const role of ['assistant', 'tool']) {
  const item = { role, content: 'stable response', ...(role === 'tool' ? { tool_call_id: 'call_1' } : {}) };
  const a = wire([item]);
  const b = wire([item, { role: 'user', content: [text('new')] }]);
  record(`${role}_wrap_full_wire_prefix_matches`, prefixEqual(a, b), false);
  record(`${role}_wrap_P1_prefix_matches`, prefixEqual(a, b, p1), false);
  const stableA = stableArrayWire([item]);
  const stableB = stableArrayWire([item, {role:'user',content:[text('new')]}]);
  record(`${role}_new_revision_always_array`,
    Array.isArray(stableA[0].content) && Array.isArray(stableB[0].content), true);
  record(`${role}_new_revision_same_shape_marker_only`,
    prefixEqual(stableA, stableB, sameShapeWithoutTextMarkers), true,
    'structural_avoidance_not_cross_revision_token_equivalence');
  record(`${role}_wrap_P2_hypothesis_prefix_matches`, prefixEqual(a, b, p2ShapeHypothesis), true,
    'hypothesis_shape_only_not_server_semantics');
  const changed = clone(b); changed[0].content += '!';
  record(`${role}_real_content_edit_detected`, prefixEqual(a, changed, p2ShapeHypothesis), false);
  if (role === 'tool') {
    const changedId = clone(b); changedId[0].tool_call_id = 'call_2';
    record('tool_call_id_edit_detected', prefixEqual(a, changedId, p2ShapeHypothesis), false);
  }
}
const assistantReasoning = { role:'assistant',content:'answer',reasoning_details:[{type:'reasoning.encrypted',data:'A'}] };
const ra = wire([assistantReasoning]);
const rb = wire([{...assistantReasoning,reasoning_details:[{type:'reasoning.encrypted',data:'B'}]},
  {role:'user',content:[text('new')]}]);
record('reasoning_change_not_erased_by_P2', prefixEqual(ra, rb, p2ShapeHypothesis), false);
const twoBlocks = [{role:'assistant',content:[text('a'),text('b')]}];
const oneString = [{role:'assistant',content:'ab'}];
record('multiple_blocks_not_concatenated', prefixEqual(twoBlocks, oneString, p2ShapeHypothesis), false);

// Repeated ordinary append: show cost-path eligibility, never token accuracy.
let rolling = history; let fullWireMatches = 0, projectedMatches = 0;
for (let n = 0; n < 6; n++) {
  const old = wire(rolling);
  const appended = [...rolling,{role:'assistant',content:`answer ${n}`},
    {role:'user',content:[text(`question ${n}`)]}];
  const next = wire(appended);
  fullWireMatches += Number(prefixEqual(old, next));
  projectedMatches += Number(prefixEqual(old, next, p1));
  rolling = appended;
}
assert.equal(fullWireMatches,0); assert.equal(projectedMatches,6);
process.stdout.write(JSON.stringify({
  node:process.version, sourcePath, sourceSha256:sha(source), extractedFunctionSha256:sha(fragment),
  checks:results, rollingAppend:{transitions:6,fullWireMatches,projectedMatches},
  example:{oldWire,nextWire,oldProjection:p1(oldWire),nextProjection:p1(nextWire)},
  scope:'Actual extracted addBreakpoint only, research projection functions; no full planner, tokenizer, model, IO transport, or upstream conversion executed.'
},null,2)+'\n');
