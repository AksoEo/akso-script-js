const { evaluate, analyze, signature, isConcrete, doesHalt } = require('.');
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
            const analysis = analyze([defs], k, {});
            if (!analysis.valid) {
                console.log(k, ':: invalid', analysis.error);
            } else {
                console.log(k, '::', signature(analysis.type));

                let attrs = [];
                if (isConcrete(analysis.type)) attrs.push('concrete');
                const halts = doesHalt(analysis.type);
                if (halts === true) attrs.push('halts');
                else if (halts === null) attrs.push('halts?');

                console.log(k, 'type attrs:', attrs.join(', '));
                console.log(k, 'used types:', analysis.defTypes);
                console.log(k, 'used stdlib items:', analysis.stdUsage);
            }
        } else {
            console.log(k, '->', evaluate([defs], k, () => null));
        }
    }
});
