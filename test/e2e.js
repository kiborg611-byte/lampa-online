// End-to-end test: real Lampa 3.x web build + plugin installed via Lampa's plugin list.
// Network is mocked (archive.org / TMDB fixtures), everything else is real Lampa code.
// Usage: node test/e2e.js <lampa-build-dir> <plugin.js>
var path = require('path');
var fs = require('fs');
var http = require('http');
var pw = require(process.env.PW_MODULE || 'playwright');

var WWW = process.argv[2];
var PLUGIN = process.argv[3];
var FX = path.join(__dirname, 'fixtures');
var SHOTS = path.join(__dirname, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

var TYPES = { js: 'application/javascript', css: 'text/css', html: 'text/html; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff: 'font/woff', ttf: 'font/ttf', ogg: 'audio/ogg', ico: 'image/x-icon', mp4: 'video/mp4' };

function serveFile(res, file, extraHeaders) {
    fs.readFile(file, function (err, data) {
        if (err) { res.writeHead(404); return res.end(); }
        var h = Object.assign({ 'Content-Type': TYPES[file.split('.').pop()] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }, extraHeaders || {});
        res.writeHead(200, h);
        res.end(data);
    });
}

var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://localhost');
    var p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    if (p === '/plugin.js') return serveFile(res, PLUGIN);
    serveFile(res, path.join(WWW, p));
});

function json(route, obj) {
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(obj) });
}

var requests = [];
var allReq = [];

async function main() {
    await new Promise(function (r) { server.listen(8099, '127.0.0.1', r); });
    var browser = await pw.chromium.launch({
        executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        args: ['--autoplay-policy=no-user-gesture-required', '--no-proxy-server']
    });
    var page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    var logs = [];
    page.on('console', function (m) { logs.push(m.text()); });
    page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });

    // block every external host except mocked ones
    await page.route(function (url) { return !/^http:\/\/127\.0\.0\.1:8099\//.test(url.href); }, function (route) {
        var u = new URL(route.request().url());
        allReq.push(u.href.slice(0, 160));
        if (u.host === 'archive.org') {
            requests.push(u.pathname + (u.search ? decodeURIComponent(u.search).slice(0, 120) : ''));
            if (u.pathname === '/advancedsearch.php') {
                var q = u.searchParams.get('q') || '';
                if (/His Girl Friday/i.test(q)) return route.fulfill({ path: FX + '/search_his_girl_friday.json', contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
                return json(route, { response: { docs: [] } });
            }
            if (u.pathname.indexOf('/metadata/') === 0) {
                var id = decodeURIComponent(u.pathname.slice(10));
                if (id === 'his_girl_friday') return route.fulfill({ path: FX + '/meta_his_girl_friday.json', contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
                // generic: first (best ranked) file is broken -> tests automatic fallback to next file
                return json(route, {
                    metadata: { identifier: id, title: id, year: '1930', language: 'English' },
                    files: [
                        { name: id + '_hd.mp4', format: 'h.264', height: '720', length: '5000' },
                        { name: id + '.mp4', format: 'MPEG4', height: '480', length: '5000' },
                        { name: id + '.ogv', format: 'Ogg Video', height: '304', length: '5000' }
                    ]
                });
            }
            if (u.pathname.indexOf('/download/') === 0) {
                if (/_hd\.mp4$/.test(u.pathname)) return route.fulfill({ status: 404, body: 'not found' });
                return route.fulfill({ path: FX + '/sample.mp4', contentType: 'video/mp4', headers: { 'Access-Control-Allow-Origin': '*' } });
            }
            return route.fulfill({ path: WWW + '/img/img_load.svg', contentType: 'image/svg+xml' });
        }
        if (/themoviedb|tmdb/.test(u.host) && /\/3\//.test(u.pathname)) {
            if (/movie\/3085\/(credits|recommendations|similar)/.test(u.pathname)) return json(route, { cast: [], crew: [], results: [], page: 1, total_pages: 0 });
            if (/movie\/3085$/.test(u.pathname)) return route.fulfill({ path: FX + '/tmdb_3085.json', contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
            return json(route, { results: [], page: 1, total_pages: 0 });
        }
        if (/\.(png|jpe?g|webp|svg)$/i.test(u.pathname)) return route.fulfill({ path: WWW + '/img/img_load.svg', contentType: 'image/svg+xml' });
        return route.fulfill({ status: 404, body: '' });
    });

    await page.addInitScript(function () {
        if (!localStorage.getItem('__e2e')) {
            localStorage.setItem('__e2e', '1');
            localStorage.setItem('plugins', JSON.stringify([{ url: 'http://127.0.0.1:8099/plugin.js', status: 1 }]));
            localStorage.setItem('language', 'ru');
            localStorage.setItem('source', 'tmdb');
        }
    });

    var results = {};
    function step(name, ok, info) {
        results[name] = ok;
        console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : ''));
    }

    await page.goto('http://127.0.0.1:8099/');
    await page.waitForFunction(function () { return window.appready === true; }, null, { timeout: 60000 });
    await page.waitForTimeout(2500);

    var st = await page.evaluate(function () {
        return {
            app: Lampa.Manifest.app_version,
            plugin: !!window.LampaOnline,
            providers: window.LampaOnline ? window.LampaOnline.providers().map(function (p) { return p.id; }) : [],
            menu: document.querySelectorAll('.lampa-online-menu').length
        };
    });
    step('plugin loaded via Lampa plugin list (Lampa ' + st.app + ')', st.plugin, JSON.stringify(st));
    step('providers registered', st.providers.join(',') === 'archive,custom', st.providers.join(','));
    step('menu item "Бесплатные фильмы" added once', st.menu === 1);
    await page.screenshot({ path: SHOTS + '/01-main.png' });

    // ---- double-initialization: load plugin script again
    await page.evaluate(function () {
        return new Promise(function (r) {
            var s = document.createElement('script');
            s.src = 'http://127.0.0.1:8099/plugin.js?again=1';
            s.onload = r; s.onerror = r;
            document.body.appendChild(s);
        });
    });
    await page.waitForTimeout(500);
    var again = await page.evaluate(function () { return document.querySelectorAll('.lampa-online-menu').length + '/' + document.querySelectorAll('#lampa-online-css').length; });
    step('no double initialization', again === '1/1', again);

    // ---- full card: open TMDB card, check button, press via remote
    await page.evaluate(function () {
        Lampa.Activity.push({ url: '', component: 'full', id: 3085, method: 'movie', source: 'tmdb', card: { id: 3085, title: 'Его девушка Пятница', original_title: 'His Girl Friday', release_date: '1940-01-11', source: 'tmdb' } });
    });
    await page.waitForSelector('.lampa-online-btn', { timeout: 20000, state: 'attached' }).catch(function () {});
    var btn = await page.evaluate(function () { return document.querySelectorAll('.lampa-online-btn').length; });
    step('"Смотреть онлайн" button in movie card', btn === 1, 'count=' + btn);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SHOTS + '/02-card.png' });

    // press "Смотреть" (button--play) with the remote: focus it and press Enter
    var played = await page.evaluate(function () {
        var play = document.querySelector('.full-start-new__buttons .button--play');
        if (!play) return 'no-play-button';
        Lampa.Controller.focus(play);
        return 'focused';
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    var afterPlay = await page.evaluate(function () {
        var a = Lampa.Activity.active();
        var sel = document.querySelector('.selectbox');
        return { component: a.component, selectbox: !!(sel && sel.offsetParent !== null), text: sel ? sel.innerText.slice(0, 200) : '' };
    });
    if (afterPlay.selectbox) {
        // several sources installed: choose ours in the "Смотреть" menu
        var idx = await page.evaluate(function () {
            var items = Array.prototype.slice.call(document.querySelectorAll('.selectbox .selector'));
            var target = items.filter(function (i) { return /Смотреть онлайн/.test(i.innerText); })[0];
            if (target) { Lampa.Controller.focus(target); return items.indexOf(target); }
            return -1;
        });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
        afterPlay = await page.evaluate(function () { return { component: Lampa.Activity.active().component }; });
    }
    step('"Смотреть" opens plugin screen', afterPlay.component === 'lampa_online', played + ' -> ' + JSON.stringify(afterPlay));

    await page.waitForSelector('.lo-item', { timeout: 20000 }).catch(function () {});
    var list = await page.evaluate(function () {
        return Array.prototype.map.call(document.querySelectorAll('.lo-item'), function (e) { return e.innerText.replace(/\s+/g, ' '); });
    });
    step('search found movie in Internet Archive', list.length >= 1 && /His Girl Friday/.test(list[0]), JSON.stringify(list));
    var focused = await page.evaluate(function () { var f = document.querySelector('.lo-item.focus'); return f ? f.innerText.replace(/\s+/g, ' ') : ''; });
    step('remote focus is on first result', /His Girl Friday/.test(focused), focused);
    await page.screenshot({ path: SHOTS + '/03-results.png' });

    await page.keyboard.press('Enter');
    await page.waitForFunction(function () {
        var v = document.querySelector('.player video');
        return v && v.currentTime > 0.5;
    }, null, { timeout: 20000 }).catch(function () {});
    var pv = await page.evaluate(function () {
        var v = document.querySelector('.player video');
        return v ? { src: v.currentSrc || v.src, t: v.currentTime, paused: v.paused, w: v.videoWidth } : null;
    });
    step('Lampa.Player plays archive.org mp4 (h.264 first)', !!(pv && pv.t > 0.5 && /\/download\/his_girl_friday\/his_girl_friday\.mp4$/.test(pv.src)), JSON.stringify(pv));
    await page.screenshot({ path: SHOTS + '/04-player.png' });

    // close player
    await page.evaluate(function () { Lampa.Player.close(); });
    await page.waitForTimeout(800);

    // ---- not found case
    await page.evaluate(function () {
        Lampa.Activity.push({ url: '', title: 'Смотреть онлайн', component: 'lampa_online', movie: { id: 1, title: 'Несуществующий фильм', original_title: 'Nonexistent Movie', release_date: '2024-01-01' }, page: 1 });
    });
    await page.waitForSelector('.lo-status', { timeout: 10000 });
    await page.waitForFunction(function () { var a = document.querySelectorAll('.lo-status'); return /не найден|недоступен/.test((a[a.length - 1] || {}).innerText || ''); }, null, { timeout: 15000 }).catch(function () {});
    var nf = await page.evaluate(function () { var a = document.querySelectorAll('.lo-status'); return a[a.length - 1].innerText; });
    step('not found message', nf === 'Фильм не найден в доступных источниках', nf);
    await page.screenshot({ path: SHOTS + '/05-notfound.png' });

    // ---- free catalog via left menu with remote
    await page.evaluate(function () {
        var m = document.querySelector('.lampa-online-menu');
        $(m).trigger('hover:enter');
    });
    await page.waitForSelector('.lo-card', { timeout: 10000 });
    await page.waitForTimeout(600);
    var cat = await page.evaluate(function () {
        return { comp: Lampa.Activity.active().component, cards: document.querySelectorAll('.lo-card').length, focus: (document.querySelector('.lo-card.focus') || {}).innerText };
    });
    step('"Бесплатные фильмы" catalog opens with cards', cat.comp === 'lampa_online_free' && cat.cards >= 10, JSON.stringify(cat).replace(/\\n/g, ' '));
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    var f2 = await page.evaluate(function () { return (document.querySelector('.lo-card.focus .lo-card__title') || {}).innerText; });
    step('remote navigation right in grid', !!f2, f2);
    await page.screenshot({ path: SHOTS + '/06-catalog.png' });

    await page.keyboard.press('Enter');
    await page.waitForFunction(function () {
        var v = document.querySelector('.player video');
        return v && v.currentTime > 0.5;
    }, null, { timeout: 25000 }).catch(function () {});
    var pv2 = await page.evaluate(function () {
        var v = document.querySelector('.player video');
        return v ? { src: v.currentSrc || v.src, t: v.currentTime } : null;
    });
    step('catalog film plays; broken file auto-fallback to next stream', !!(pv2 && pv2.t > 0.5 && /\.mp4$/.test(pv2.src) && !/_hd\.mp4$/.test(pv2.src)), JSON.stringify(pv2));
    await page.screenshot({ path: SHOTS + '/07-player-fallback.png' });

    var tagged = logs.filter(function (l) { return l.indexOf('[LAMPA-ONLINE]') === 0; });
    ['search', 'movie found', 'stream found', 'play', 'error'].forEach(function (k) {
        step('debug log "' + k + '"', tagged.some(function (l) { return l.indexOf('[LAMPA-ONLINE] ' + k) === 0; }));
    });
    var pageErrors = logs.filter(function (l) { return /PAGEERROR/.test(l) && /lampa-online|LampaOnline|lo-/i.test(l); });
    step('no plugin page errors', pageErrors.length === 0, pageErrors.join(' | '));

    fs.writeFileSync(path.join(__dirname, 'e2e-log.txt'), tagged.join('\n') + '\n\nARCHIVE REQUESTS:\n' + requests.join('\n') + '\n\nALL EXTERNAL:\n' + allReq.join('\n') + '\n\nCONSOLE:\n' + logs.slice(-150).join('\n'));
    await browser.close();
    server.close();

    var failed = Object.keys(results).filter(function (k) { return !results[k]; });
    console.log('\n' + (failed.length ? 'FAILED: ' + failed.length : 'ALL E2E TESTS PASSED') + ' (' + Object.keys(results).length + ' checks)');
    process.exit(failed.length ? 1 : 0);
}

main().catch(function (e) { console.error(e); server.close(); process.exit(2); });
