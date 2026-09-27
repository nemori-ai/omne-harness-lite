import assert from 'node:assert/strict';
import { readJsonStrict, writeJsonLossless, judgeContentBlock, validate, LosslessNumber } from '@omne-harness-lite/content-blocks';
const numbers=['9007199254740993','12345678901234567890','0.1000000000000000055511151231257827','1.10','-0','1e400'];
for(const input of numbers){const read=readJsonStrict(input);assert.ok('ok' in read);assert.equal(writeJsonLossless(read.ok),input);assert.equal(writeJsonLossless(readJsonStrict(writeJsonLossless(read.ok)).ok),input);}
const duplicates=['{"a":1,"a":2}','{"x":{"a":1,"\\u0061":2}}','{"__proto__":1,"__proto__":2}'];
for(const input of duplicates) assert.deepEqual(readJsonStrict(input),{failed:'duplicate_member'});
const wire='{"id":"b","kind":"tool_call","visibility":{"toHuman":false,"toModel":true},"complete":true,"callId":"c","tool":"read_file","arguments":{"n":9007199254740993,"null":null}}';
const parsed=readJsonStrict(wire);assert.ok('ok' in parsed);const judged=judgeContentBlock(parsed.ok);assert.ok('ok' in judged);assert.equal(writeJsonLossless(judged.ok),wire);assert.ok(Object.isFrozen(judged.ok));
assert.equal(validate('AttachmentRef',{storage:'s',key:'k',mediaType:'application/pdf',bytes:new LosslessNumber('-0.1')}).valid,false);
assert.equal(validate('AttachmentRef',{storage:'s',key:'k',mediaType:'application/pdf',bytes:new LosslessNumber('1e400')}).valid,true);
console.log(JSON.stringify({node:process.version,precision:numbers.length,duplicates:duplicates.length,publicToolCallRoundtrip:true,exactBytes:true,result:'pass'},null,2));
