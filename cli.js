const evaluate = require('.');
let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.resume();
process.stdin.on('end', () => {
    const defs = JSON.parse(input);
    for (const k in defs) console.log(k, '->', evaluate(defs, k));
});
