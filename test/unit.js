// Node unit test for providers + fallback logic (no network; fixtures).
// node test/unit.js
var fs = require('fs');
var path = require('path');
var assert = require('assert');

global.window = global;
var fx = function (n) { return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8')); };

var factories = [];
window.LampaOnlineProviders = { push: function (f) { factories.push(f); } };
require('../providers/archive.js');
require('../providers/custom.js');

var requested = [];
var ctx = {
    log: function () {},
    storage: function (k, d) { return k === 'lampa_online_custom_url' ? 'https://example.com/c.json' : d; },
    http: {
        json: function (url) {
            requested.push(url);
            if (/advancedsearch/.test(url)) {
                var q = decodeURIComponent(url.split('q=')[1].split('&')[0]);
                if (/His Girl Friday/i.test(q)) return Promise.resolve(fx('search_his_girl_friday.json'));
                if (/Broken/.test(q)) return Promise.reject(new Error('network error'));
                return Promise.resolve({ response: { docs: [] } });
            }
            if (/metadata\/his_girl_friday/.test(url)) return Promise.resolve(fx('meta_his_girl_friday.json'));
            if (/metadata\//.test(url)) return Promise.resolve(fx('meta_dark.json'));
            if (/example\.com/.test(url)) return Promise.resolve({ items: [{ title: 'Home Video', year: 2020, tmdb_id: 42, streams: [{ url: 'https://x/v.mp4', quality: '1080p' }] }] });
            return Promise.reject(new Error('unexpected ' + url));
        }
    }
};

var archive = factories[0](ctx);
var custom = factories[1](ctx);

(async function () {
    // 1. search by TMDB-style card data (ru title + original title)
    var r = await archive.search({ title: 'Его девушка Пятница', original_title: 'His Girl Friday', year: 1940, imdb_id: 'tt0032599', type: 'movie' });
    assert.ok(r.length >= 1, 'found');
    assert.strictEqual(r[0].id, 'his_girl_friday');
    assert.ok(!r.some(function (x) { return x.id === 'his_girl_friday_1940_pirate'; }), 'unlicensed item excluded');
    assert.ok(!r.some(function (x) { return x.id === 'HisGirlFridayTrailer'; }), 'unlicensed trailer excluded');
    console.log('search ok:', r.map(function (x) { return x.id; }));

    // 2. streams: mp4 h.264 first, ogv last, thumbnails excluded
    var s = await archive.getStreams(r[0]);
    assert.strictEqual(s[0].file, 'his_girl_friday.mp4');
    assert.strictEqual(s[0].quality, '480p');
    assert.strictEqual(s[0].type, 'mp4');
    assert.strictEqual(s[0].url, 'https://archive.org/download/his_girl_friday/his_girl_friday.mp4');
    assert.strictEqual(s[s.length - 1].type, 'ogv');
    assert.strictEqual(s.length, 3);
    ['source', 'title', 'quality', 'translation', 'url', 'type'].forEach(function (k) { assert.ok(k in s[0], 'normalized field ' + k); });
    console.log('streams ok:', s.map(function (x) { return x.quality + ' ' + x.type + ' ' + x.file; }));

    // 3. dark item -> error "no files"
    await archive.getStreams({ id: 'night_of_the_living_dead' }).then(function () { throw new Error('should fail'); }, function (e) {
        assert.ok(/no files/.test(e.message));
    });
    console.log('dark item ok');

    // 4. not found
    var nf = await archive.search({ title: 'Несуществующий фильм', original_title: 'Nonexistent Movie Xyz', year: 2023, type: 'movie' });
    assert.strictEqual(nf.length, 0);
    console.log('not found ok');

    // 5. source down -> throws (core shows "Источник временно недоступен")
    await archive.search({ title: 'Broken', original_title: 'Broken', year: 2000 }).then(function () { throw new Error('should fail'); }, function (e) {
        assert.ok(/unavailable/.test(e.message));
    });
    console.log('source down ok');

    // 6. catalog
    var c = await archive.catalog();
    assert.ok(c.length >= 10);
    console.log('catalog ok:', c.length, 'films');

    // 7. catalog match even if archive search returns nothing (e.g. Nosferatu has no license field)
    var nos = await archive.search({ title: 'Носферату, симфония ужаса', original_title: 'Nosferatu', year: 1922, type: 'movie' });
    assert.strictEqual(nos[0].id, 'Nosferatu_most_complete_version_93_mins.');
    console.log('curated match ok');

    // 8. custom provider
    var cs = await custom.search({ title: 'X', tmdb_id: 42 });
    assert.strictEqual(cs.length, 1);
    var cst = await custom.getStreams(cs[0]);
    assert.strictEqual(cst[0].url, 'https://x/v.mp4');
    console.log('custom ok');

    console.log('\nALL UNIT TESTS PASSED');
})().catch(function (e) { console.error('FAIL', e); process.exit(1); });
