const rollup = require('rollup');
const babel = require('rollup-plugin-babel');
const pkg = require('./package.json');

const inputOptions = esm => ({
    input: 'src/index.js',
    plugins: [
       esm ? babel({
           presets: [
               ['@babel/preset-env', {
                    useBuiltIns: 'usage',
                    corejs: pkg.dependencies['core-js']
               }]
           ],

       }) : null,
    ].filter(x => x),
    external: id => id.startsWith('core-js') || id.startsWith('regenerator-runtime'),
});
const outputOptions = esm => ({
    dir: esm ? 'dist-esm' : 'dist',
    format: esm ? 'esm' : 'cjs',
});

async function build (esm) {
    console.log('Running rollup…' + (esm ? ' (esm build)' : ''));
    const bundle = await rollup.rollup(inputOptions(esm));
    await bundle.write(outputOptions(esm));
    console.log('\x1b[32mdone\x1b[m');
}

function onError (err) {
  console.log('\x1b[31m', err, '\x1b[m');
  process.exit(-1);
}

if (process.argv[2] === 'esm') build(true).catch(onError);
else build(false).catch(onError);
