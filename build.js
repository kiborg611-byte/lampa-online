// Builds plugin.js (single file for Lampa) from src/ and providers/.
// Usage: node build.js
var fs = require('fs');
var path = require('path');

var parts = [
    'src/polyfill.js',
    'providers/archive.js',
    'providers/custom.js',
    'src/core.js'
];

var out = '/* Lampa Online — https://github.com/kiborg611-byte/lampa-online (built ' + new Date().toISOString().slice(0, 10) + ') */\n' +
    parts.map(function (p) {
        return '\n/* ===== ' + p + ' ===== */\n' + fs.readFileSync(path.join(__dirname, p), 'utf8');
    }).join('\n');

fs.writeFileSync(path.join(__dirname, 'plugin.js'), out);
console.log('plugin.js', out.length, 'bytes');
