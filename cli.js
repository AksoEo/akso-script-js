const { evaluate, analyze } = require('.');

const doAnalyze = process.argv.includes('analyze');

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.resume();
process.stdin.on('end', () => {
    const defs = JSON.parse(input);
    for (const k in defs) {
        const out = doAnalyze ? analyze(defs, k) : evaluate(defs, k);
        console.log(k, '->', out);
    }
});
