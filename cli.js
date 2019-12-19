const { evaluate, analyze, signature } = require('.');

const doAnalyze = process.argv.includes('analyze');

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.resume();
process.stdin.on('end', () => {
    const defs = JSON.parse(input);
    for (const k in defs) {
        if (doAnalyze) {
            const analysis = analyze(defs, k, {});
            if (!analysis.valid) {
                console.log(k, ':: invalid', analysis.error);
            } else {
                console.log(k, '::', signature(analysis.type));
            }
        } else {
            console.log(k, '->', evaluate(defs, k, () => null));
        }
    }
});
