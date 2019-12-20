const { evaluate, analyze, signature } = require('.');
require('./phone_fmt');
require('./country_fmt');

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
                console.log(k, 'used types:', analysis.defTypes);
                console.log(k, 'used stdlib items:', analysis.stdUsage);
            }
        } else {
            console.log(k, '->', evaluate(defs, k, () => null));
        }
    }
});
