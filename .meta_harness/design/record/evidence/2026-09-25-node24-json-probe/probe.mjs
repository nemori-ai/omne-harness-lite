// 取证：Node 24 的 JSON.parse reviver 第三参 context.source 与 JSON.rawJSON / JSON.isRawJSON 是否可用
const src = '{"a":9007199254740993,"b":1.10,"c":[1e400,-0,0.1]}';
const seen = [];
JSON.parse(src, (k, v, ctx) => { if (typeof v === 'number') seen.push([k, v, ctx && ctx.source]); return v; });
console.log('node', process.version, 'v8', process.versions.v8);
console.log('context.source', JSON.stringify(seen));
console.log('typeof JSON.rawJSON', typeof JSON.rawJSON, 'typeof JSON.isRawJSON', typeof JSON.isRawJSON);
console.log('rawJSON stringify', JSON.stringify({ x: JSON.rawJSON('9007199254740993'), y: JSON.rawJSON('1.10') }));
