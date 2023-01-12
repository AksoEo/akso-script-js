const rollup = require('rollup');
const babel = require('rollup-plugin-babel');
const pkg = require('./package.json');
const https = require('https');

const countriesSource = 'https://api.akso.org/v1/countries?fields=code,name_eo&limit=300';

const aksoScriptPlugin = (countries) => {
    return {
        name: 'akso-script-build-script-stuff',
        resolveId (source) {
            if (source === 'akso-script-countries-list-see-build-script') {
                return source;
            }
            return null;
        },
        load (id) {
            if (id === 'akso-script-countries-list-see-build-script') {
                return `export default ${JSON.stringify(countries)};`;
            }
            return null;
        }
    };
};

const inputOptions = (esm, countries) => ({
    input: {
        index: 'src/index.js',
        phone_fmt: 'src/phone_fmt.js',
        country_fmt: 'src/country_fmt.js',
    },
    plugins: [
        aksoScriptPlugin(countries),
        esm ? babel({
            presets: [
            ['@babel/preset-env', {
                useBuiltIns: 'usage',
                corejs: pkg.dependencies['core-js']
            }]
        ],
    }) : null,
    ].filter(x => x),
    external: id => id === '.' || id.startsWith('core-js') || id.startsWith('regenerator-runtime') || id === 'google-libphonenumber' || id === 'luxon',
});
const outputOptions = esm => ({
    dir: esm ? 'dist-esm' : 'dist',
    format: esm ? 'esm' : 'cjs',
});

function loadCountriesData () {
    return new Promise((resolve, reject) => {
        process.stdout.write('Loading countries…');
        const req = https.request(countriesSource, res => {
            let b = Buffer.alloc(0);
            res.on('data', d => {
                b = Buffer.concat([b, d]);
                process.stdout.write(`\x1b[2K\x1b[GLoading countries… (${b.length} bytes)`);
            });
            res.on('end', () => {
                console.log(`\x1b[2K\x1b[GLoaded countries (${b.length} bytes)`);
                resolve(b.toString());
            });
        });
        req.on('error', reject);
        req.end();
    });
}
async function loadCountries () {
    const data = await loadCountriesData();
    const parsed = JSON.parse(data);
    const map = {};
    for (const item of parsed) {
        map[item.code] = item.name_eo;
    }
    return map;
}

async function build (esm) {
    const countries = await loadCountries();
    console.log('Running rollup…' + (esm ? ' (esm build)' : ''));
    const bundle = await rollup.rollup(inputOptions(esm, countries));
    await bundle.write(outputOptions(esm));
    console.log('\x1b[32mdone\x1b[m');
}

function onError (err) {
    console.log('\x1b[31m', err, '\x1b[m');
    process.exit(-1);
}

if (process.argv[2] === 'esm') build(true).catch(onError);
else build(false).catch(onError);
