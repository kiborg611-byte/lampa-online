/* Lampa Online — https://github.com/kiborg611-byte/lampa-online (built 2026-10-02) */

/* ===== src/polyfill.js ===== */
/* Minimal Promise polyfill for very old Smart TV engines (only used if window.Promise is missing) */
(function () {
    if (typeof window.Promise === 'function') return;
    function P(fn) {
        var self = this, state = 0, value, handlers = [];
        function settle(s, v) {
            if (state) return;
            if (s === 1 && v && typeof v.then === 'function') { v.then(function (x) { settle(1, x); }, function (e) { settle(2, e); }); return; }
            state = s; value = v;
            setTimeout(function () { handlers.forEach(run); handlers = []; }, 0);
        }
        function run(h) {
            var cb = state === 1 ? h.ok : h.fail;
            if (typeof cb !== 'function') { (state === 1 ? h.resolve : h.reject)(value); return; }
            try { h.resolve(cb(value)); } catch (e) { h.reject(e); }
        }
        this.then = function (ok, fail) {
            return new P(function (resolve, reject) {
                var h = { ok: ok, fail: fail, resolve: resolve, reject: reject };
                if (state) setTimeout(function () { run(h); }, 0); else handlers.push(h);
            });
        };
        this['catch'] = function (fail) { return self.then(null, fail); };
        try { fn(function (v) { settle(1, v); }, function (e) { settle(2, e); }); } catch (e) { settle(2, e); }
    }
    P.resolve = function (v) { return new P(function (r) { r(v); }); };
    P.reject = function (e) { return new P(function (r, j) { j(e); }); };
    window.Promise = P;
})();


/* ===== providers/archive.js ===== */
/*
 * Provider: Internet Archive (archive.org)
 * Only items that declare a Public Domain / Creative Commons license
 * (or are in the hand-checked public-domain catalog below) are returned.
 *
 * Interface: search(movie) getMovie(item) getSeasons(item) getEpisodes(item, season) getStreams(item)
 */
(function () {
    'use strict';

    window.LampaOnlineProviders = window.LampaOnlineProviders || [];

    window.LampaOnlineProviders.push(function (ctx) {
        var API = 'https://archive.org';
        var VIDEO_EXT = /\.(mp4|m4v|webm|ogv)$/i;

        // Hand-checked public-domain / CC feature films (files verified on archive.org)
        var CATALOG = [
            { id: 'his_girl_friday', title: 'His Girl Friday', ru: 'Его девушка Пятница', year: 1940, imdb: 'tt0032599', lang: 'English' },
            { id: 'Detour', title: 'Detour', ru: 'Объезд', year: 1945, imdb: 'tt0037638', lang: 'English' },
            { id: 'CarnivalofSouls', title: 'Carnival of Souls', ru: 'Карнавал душ', year: 1962, imdb: 'tt0055830', lang: 'English' },
            { id: 'ScarletStreet', title: 'Scarlet Street', ru: 'Улица греха', year: 1945, imdb: 'tt0038057', lang: 'English' },
            { id: 'TheStranger_0', title: 'The Stranger', ru: 'Чужестранец', year: 1946, imdb: 'tt0038991', lang: 'English' },
            { id: 'meet_john_doe', title: 'Meet John Doe', ru: 'Знакомьтесь, Джон Доу', year: 1941, imdb: 'tt0033891', lang: 'English' },
            { id: 'house_on_haunted_hill_ipod', title: 'House on Haunted Hill', ru: 'Дом ночных призраков', year: 1959, imdb: 'tt0051744', lang: 'English' },
            { id: 'gullivers_travels1939', title: "Gulliver's Travels", ru: 'Путешествия Гулливера', year: 1939, imdb: 'tt0031397', lang: 'English' },
            { id: 'Hitchcock_Secret_Agent', title: 'Secret Agent', ru: 'Секретный агент', year: 1936, imdb: 'tt0028231', lang: 'English' },
            { id: 'dressed_to_kill', title: 'Dressed to Kill', ru: 'Шерлок Холмс: Одетая для убийства', year: 1946, imdb: 'tt0038475', lang: 'English' },
            { id: 'Sita_Sings_the_Blues', title: 'Sita Sings the Blues', ru: 'Сита поёт блюз', year: 2008, imdb: 'tt1172203', lang: 'English' },
            { id: 'DasKabinettdesDoktorCaligariTheCabinetofDrCaligari', title: 'The Cabinet of Dr. Caligari', ru: 'Кабинет доктора Калигари', year: 1920, imdb: 'tt0010323', lang: 'Немое кино' },
            { id: 'Nosferatu_most_complete_version_93_mins.', title: 'Nosferatu', ru: 'Носферату. Симфония ужаса', year: 1922, imdb: 'tt0013442', lang: 'Немое кино' },
            { id: 'BattleshipPotemkin', title: 'Battleship Potemkin', ru: 'Броненосец «Потёмкин»', year: 1925, imdb: 'tt0015648', lang: 'Немое кино' },
            { id: 'ThePhantomoftheOpera', title: 'The Phantom of the Opera', ru: 'Призрак оперы', year: 1925, imdb: 'tt0016220', lang: 'Немое кино' }
        ];

        function norm(s) {
            return String(s || '').toLowerCase()
                .replace(/ё/g, 'е')
                .replace(/&/g, ' and ')
                .replace(/[^a-z0-9а-я]+/g, ' ')
                .replace(/^(the|a|an) /, '')
                .trim();
        }

        function first(v) { return Array.isArray(v) ? v[0] : v; }

        function yearOf(doc) {
            var y = parseInt(first(doc.year) || String(first(doc.date) || '').slice(0, 4), 10);
            return isNaN(y) ? 0 : y;
        }

        function licensed(doc) {
            var l = String(first(doc.licenseurl) || '').toLowerCase();
            return l.indexOf('creativecommons.org') >= 0 || l.indexOf('publicdomain') >= 0;
        }

        function catalogItem(c) {
            return {
                source: 'archive',
                id: c.id,
                title: c.title,
                title_ru: c.ru,
                year: c.year,
                language: c.lang,
                quality: '',
                poster: API + '/services/img/' + encodeURIComponent(c.id),
                verified: true
            };
        }

        function catalogMatch(movie) {
            var titles = [norm(movie.original_title), norm(movie.title)];
            return CATALOG.filter(function (c) {
                if (movie.imdb_id && c.imdb === movie.imdb_id) return true;
                var t = norm(c.title), r = norm(c.ru);
                var titleOk = titles.indexOf(t) >= 0 || (r && titles.indexOf(r) >= 0);
                var yearOk = !movie.year || Math.abs(movie.year - c.year) <= 1;
                return titleOk && yearOk;
            }).map(catalogItem);
        }

        function query(title, year) {
            var t = String(title).replace(/["\\:()\[\]{}^~*?!+\-]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!t) return null;
            var q = 'title:(' + t + ') AND mediatype:(movies)';
            if (year) q += ' AND year:[' + (year - 1) + ' TO ' + (year + 1) + ']';
            return API + '/advancedsearch.php?q=' + encodeURIComponent(q) +
                '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=date&fl%5B%5D=language&fl%5B%5D=licenseurl&fl%5B%5D=downloads&fl%5B%5D=collection' +
                '&sort%5B%5D=downloads+desc&rows=50&page=1&output=json';
        }

        function score(doc, movie) {
            var dt = norm(first(doc.title));
            var s = 0;
            [movie.original_title, movie.title].forEach(function (t) {
                var n = norm(t);
                if (!n) return;
                if (dt === n) s = Math.max(s, 100);
                else if (dt.indexOf(n) === 0) s = Math.max(s, 70);
                else if (dt.indexOf(n) >= 0) s = Math.max(s, 50);
            });
            var y = yearOf(doc);
            if (movie.year && y) {
                if (y === movie.year) s += 30;
                else if (Math.abs(y - movie.year) <= 1) s += 15;
                else s -= 40;
            }
            var col = [].concat(doc.collection || []);
            if (col.indexOf('feature_films') >= 0) s += 10;
            s += Math.min(10, Math.log(1 + (doc.downloads || 0)));
            return s;
        }

        function search(movie) {
            var found = catalogMatch(movie);
            var urls = [];
            [movie.original_title, movie.title].forEach(function (t) {
                if (!t) return;
                var u1 = query(t, movie.year);
                if (u1 && urls.indexOf(u1) < 0) urls.push(u1);
            });

            var seen = {};
            found.forEach(function (f) { seen[f.id] = true; });

            var chain = Promise.resolve();
            var docs = [];
            var errors = 0;
            urls.forEach(function (u) {
                chain = chain.then(function () {
                    if (docs.length) return;
                    return ctx.http.json(u, { jsonp: 'callback' }).then(function (json) {
                        var list = (json && json.response && json.response.docs) || [];
                        docs = list;
                    }, function (e) {
                        errors++;
                        ctx.log('error', 'archive search request failed', e && e.message);
                    });
                });
            });

            return chain.then(function () {
                if (!docs.length && errors && errors === urls.length && !found.length) {
                    throw new Error('archive unavailable');
                }
                docs.filter(licensed).map(function (d) {
                    return { d: d, s: score(d, movie) };
                }).filter(function (x) { return x.s >= 50; })
                    .sort(function (a, b) { return b.s - a.s; })
                    .slice(0, 15)
                    .forEach(function (x) {
                        var d = x.d;
                        if (seen[d.identifier]) return;
                        seen[d.identifier] = true;
                        found.push({
                            source: 'archive',
                            id: d.identifier,
                            title: first(d.title),
                            year: yearOf(d),
                            language: [].concat(d.language || []).join(', '),
                            quality: '',
                            poster: API + '/services/img/' + encodeURIComponent(d.identifier)
                        });
                    });
                return found;
            });
        }

        var metaCache = {};

        function getMovie(item) {
            if (metaCache[item.id]) return Promise.resolve(metaCache[item.id]);
            return ctx.http.json(API + '/metadata/' + encodeURIComponent(item.id)).then(function (json) {
                if (!json || json.is_dark || !json.files || !json.files.length) {
                    throw new Error('item has no files (dark or removed)');
                }
                metaCache[item.id] = json;
                return json;
            });
        }

        function qualityOf(h) {
            h = parseInt(h, 10) || 0;
            if (h >= 1000) return '1080p';
            if (h >= 700) return '720p';
            if (h >= 460) return '480p';
            if (h >= 340) return '360p';
            if (h > 0) return '240p';
            return '';
        }

        function rank(f) {
            var fmt = String(f.format || '').toLowerCase();
            var name = String(f.name).toLowerCase();
            var r = 0;
            if (/\.(mp4|m4v)$/.test(name)) r += 1000;
            else if (/\.webm$/.test(name)) r += 400;
            else r += 100; // ogv - last resort (no Tizen/webOS/iOS support)
            if (fmt.indexOf('h.264') >= 0) r += 300;
            else if (fmt === 'mpeg4') r += 250;
            else if (fmt.indexOf('512kb') >= 0) r += 100;
            r += Math.min(1080, parseInt(f.height, 10) || 0) / 10;
            return r;
        }

        function fileUrl(id, name) {
            return API + '/download/' + encodeURIComponent(id) + '/' +
                String(name).split('/').map(encodeURIComponent).join('/');
        }

        function getStreams(item) {
            return getMovie(item).then(function (meta) {
                var md = meta.metadata || {};
                var files = (meta.files || []).filter(function (f) {
                    if (!VIDEO_EXT.test(f.name || '')) return false;
                    if (/sample|trailer|thumb/i.test(f.name)) return false;
                    if (f.private === 'true' || f.private === true) return false;
                    return true;
                });

                // longest duration in item = the feature film
                var maxLen = 0;
                files.forEach(function (f) { maxLen = Math.max(maxLen, parseFloat(f.length) || 0); });

                var streams = files.filter(function (f) {
                    var len = parseFloat(f.length) || 0;
                    return !maxLen || !len || len >= maxLen * 0.8;
                }).sort(function (a, b) { return rank(b) - rank(a); }).map(function (f) {
                    var ext = String(f.name).split('.').pop().toLowerCase();
                    return {
                        source: 'archive',
                        title: md.title ? first(md.title) : item.title,
                        quality: qualityOf(f.height),
                        translation: 'Original',
                        language: [].concat(md.language || item.language || []).join(', '),
                        url: fileUrl(meta.metadata && meta.metadata.identifier || item.id, f.name),
                        type: ext === 'm4v' ? 'mp4' : ext,
                        format: f.format || '',
                        size: parseInt(f.size, 10) || 0,
                        duration: parseFloat(f.length) || 0,
                        file: f.name
                    };
                });
                return streams;
            });
        }

        return {
            id: 'archive',
            name: 'Internet Archive',
            types: ['movie'],
            search: search,
            getMovie: getMovie,
            getSeasons: function () { return Promise.resolve([]); },
            getEpisodes: function () { return Promise.resolve([]); },
            getStreams: getStreams,
            catalog: function () { return Promise.resolve(CATALOG.map(catalogItem)); }
        };
    });
})();


/* ===== providers/custom.js ===== */
/*
 * Provider: Custom JSON catalog (your own legal media: home server, Jellyfin/Plex direct links, etc.)
 * Enabled only when "Свой каталог (URL JSON)" is set in Settings → Смотреть онлайн.
 *
 * JSON format:
 * {
 *   "items": [
 *     {
 *       "title": "Мой фильм", "original_title": "My Movie", "year": 2001,
 *       "tmdb_id": 123, "imdb_id": "tt0000000", "type": "movie",
 *       "streams": [ { "url": "https://.../movie.mp4", "quality": "1080p", "translation": "Original", "type": "mp4" } ],
 *       "seasons": [ { "season": 1, "episodes": [ { "episode": 1, "title": "Pilot", "streams": [ ... ] } ] } ]
 *     }
 *   ]
 * }
 */
(function () {
    'use strict';

    window.LampaOnlineProviders = window.LampaOnlineProviders || [];

    window.LampaOnlineProviders.push(function (ctx) {
        var cache = { url: '', items: null };

        function catalogUrl() {
            return String(ctx.storage('lampa_online_custom_url', '') || '').trim();
        }

        function load() {
            var url = catalogUrl();
            if (!url) return Promise.resolve([]);
            if (cache.url === url && cache.items) return Promise.resolve(cache.items);
            return ctx.http.json(url).then(function (json) {
                var items = (json && (json.items || json)) || [];
                cache.url = url;
                cache.items = Array.isArray(items) ? items : [];
                return cache.items;
            });
        }

        function norm(s) {
            return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/g, ' ').trim();
        }

        function toItem(x, i) {
            return {
                source: 'custom',
                id: String(i),
                title: x.title || x.original_title || 'Video',
                year: parseInt(x.year, 10) || 0,
                quality: (x.streams && x.streams[0] && x.streams[0].quality) || '',
                language: x.language || '',
                poster: x.poster || '',
                raw: x
            };
        }

        function normStream(s, item) {
            var url = typeof s === 'string' ? s : s.url;
            var ext = String(url || '').split('?')[0].split('.').pop().toLowerCase();
            return {
                source: 'custom',
                title: (s && s.title) || item.title,
                quality: (s && s.quality) || '',
                translation: (s && s.translation) || 'Original',
                language: (s && s.language) || item.language || '',
                url: url,
                type: (s && s.type) || (ext === 'm3u8' ? 'hls' : ext)
            };
        }

        return {
            id: 'custom',
            name: 'Свой каталог',
            types: ['movie', 'tv'],
            enabled: function () { return !!catalogUrl(); },
            search: function (movie) {
                return load().then(function (items) {
                    var titles = [norm(movie.title), norm(movie.original_title)];
                    return items.map(toItem).filter(function (it) {
                        var x = it.raw;
                        if (movie.tmdb_id && x.tmdb_id && String(x.tmdb_id) === String(movie.tmdb_id)) return true;
                        if (movie.imdb_id && x.imdb_id && x.imdb_id === movie.imdb_id) return true;
                        var ok = titles.indexOf(norm(x.title)) >= 0 || titles.indexOf(norm(x.original_title)) >= 0;
                        return ok && (!movie.year || !it.year || Math.abs(movie.year - it.year) <= 1);
                    });
                });
            },
            getMovie: function (item) { return Promise.resolve(item.raw); },
            getSeasons: function (item) {
                return Promise.resolve((item.raw.seasons || []).map(function (s) {
                    return { season: s.season, title: s.title || ('Сезон ' + s.season) };
                }));
            },
            getEpisodes: function (item, season) {
                var s = (item.raw.seasons || []).filter(function (x) { return String(x.season) === String(season); })[0];
                return Promise.resolve(((s && s.episodes) || []).map(function (e) {
                    return {
                        season: season, episode: e.episode, title: e.title || ('Серия ' + e.episode),
                        streams: (e.streams || []).map(function (st) { return normStream(st, item); })
                    };
                }));
            },
            getStreams: function (item) {
                return Promise.resolve((item.raw.streams || []).map(function (s) { return normStream(s, item); }));
            },
            catalog: function () { return load().then(function (items) { return items.map(toItem); }); }
        };
    });
})();


/* ===== src/core.js ===== */
/*
 * Lampa Online — core (provider registry, network, UI, player)
 * Written in ES5 for old Smart TV browsers (Tizen / webOS / Android TV WebView).
 */
(function () {
    'use strict';

    var VERSION = '1.0.0';
    var TAG = '[LAMPA-ONLINE]';

    if (window.lampa_online_plugin_ready) return; // защита от двойной инициализации
    window.lampa_online_plugin_ready = true;

    /* ---------------------------------------------------------------- utils */

    function log(stage) {
        try {
            var args = Array.prototype.slice.call(arguments, 1);
            // Lampa's console wrapper turns the first argument into a "[LAMPA-ONLINE]" group
            // (visible in DevTools and in Lampa → Settings → Console on TV devices)
            console.log.apply(console, [TAG.replace(/[\[\]]/g, ''), stage].concat(args));
        } catch (e) {}
    }

    function noty(text) {
        try { Lampa.Noty.show(text); } catch (e) { log('error', text); }
    }

    function storage(key, def) {
        try { return Lampa.Storage.get(key, def); } catch (e) { return def; }
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function withTimeout(promise, ms, label) {
        return new Promise(function (resolve, reject) {
            var done = false;
            var t = setTimeout(function () {
                if (done) return;
                done = true;
                reject(new Error((label || 'request') + ' timeout'));
            }, ms);
            promise.then(function (v) {
                if (done) return;
                done = true; clearTimeout(t); resolve(v);
            }, function (e) {
                if (done) return;
                done = true; clearTimeout(t); reject(e);
            });
        });
    }

    /* ---------------------------------------------------------------- http */

    var jsonpId = 0;

    function xhrJson(url, timeout) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = timeout;
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch (e) { reject(new Error('bad json')); }
                } else reject(new Error('http ' + xhr.status));
            };
            xhr.onerror = function () { reject(new Error('network error')); };
            xhr.ontimeout = function () { reject(new Error('timeout')); };
            xhr.send();
        });
    }

    function jsonp(url, param, timeout) {
        return new Promise(function (resolve, reject) {
            var name = 'lampa_online_jsonp_' + (++jsonpId) + '_' + Date.now();
            var script = document.createElement('script');
            var timer;
            function cleanup() {
                clearTimeout(timer);
                try { delete window[name]; } catch (e) { window[name] = undefined; }
                if (script.parentNode) script.parentNode.removeChild(script);
            }
            window[name] = function (data) { cleanup(); resolve(data); };
            script.onerror = function () { cleanup(); reject(new Error('jsonp error')); };
            timer = setTimeout(function () { cleanup(); reject(new Error('jsonp timeout')); }, timeout);
            script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + param + '=' + name;
            document.head.appendChild(script);
        });
    }

    var http = {
        json: function (url, opts) {
            opts = opts || {};
            var timeout = opts.timeout || 15000;
            return xhrJson(url, timeout).then(null, function (e) {
                if (!opts.jsonp) throw e;
                log('error', 'xhr failed, trying jsonp', url, e && e.message);
                return jsonp(url, opts.jsonp, timeout);
            });
        }
    };

    /* ---------------------------------------------------------------- providers */

    var ctx = { http: http, log: log, storage: storage, version: VERSION };
    var providers = [];

    function registerProvider(factory) {
        try {
            var p = typeof factory === 'function' ? factory(ctx) : factory;
            if (!p || !p.id || typeof p.search !== 'function' || typeof p.getStreams !== 'function') {
                log('error', 'provider rejected: bad interface');
                return;
            }
            providers = providers.filter(function (x) { return x.id !== p.id; });
            providers.push(p);
            log('provider', p.id, 'registered');
        } catch (e) {
            log('error', 'provider init failed', e && e.message);
        }
    }

    (window.LampaOnlineProviders || []).forEach(registerProvider);
    // later providers can be pushed by other scripts
    window.LampaOnlineProviders = { push: registerProvider };

    function activeProviders(type) {
        return providers.filter(function (p) {
            try {
                if (p.enabled && !p.enabled()) return false;
                if (p.types && type && p.types.indexOf(type) < 0) return false;
                return true;
            } catch (e) { return false; }
        });
    }

    function getProvider(id) {
        return providers.filter(function (p) { return p.id === id; })[0];
    }

    /**
     * Fallback chain: Provider 1 → (not found / error) → Provider 2 → ...
     * resolves {items, provider, errors, tried}
     */
    function searchAll(movie) {
        var list = activeProviders(movie.type);
        var result = { items: [], provider: null, errors: 0, tried: 0 };
        var chain = Promise.resolve();

        list.forEach(function (p) {
            chain = chain.then(function () {
                if (result.items.length) return;
                result.tried++;
                log('search', p.id, movie.title, movie.original_title, movie.year);
                var call;
                try { call = Promise.resolve(p.search(movie)); }
                catch (e) { call = Promise.reject(e); }
                return withTimeout(call, 25000, p.id).then(function (items) {
                    items = (items || []).map(function (it) {
                        it.source = it.source || p.id;
                        return it;
                    });
                    if (items.length) {
                        result.items = items;
                        result.provider = p;
                        log('movie found', p.id, items.length + ' results');
                    }
                }, function (e) {
                    result.errors++;
                    log('error', p.id, 'search failed:', e && e.message);
                });
            });
        });

        return chain.then(function () { return result; });
    }

    /* ---------------------------------------------------------------- card data */

    function movieFromCard(card) {
        card = card || {};
        var isTv = !!(card.name || card.original_name || card.first_air_date || card.number_of_seasons) && !card.title;
        var date = card.release_date || card.first_air_date || '';
        var imdb = card.imdb_id || (card.external_ids && card.external_ids.imdb_id) || '';
        return {
            title: card.title || card.name || '',
            original_title: card.original_title || card.original_name || '',
            year: parseInt(String(date).slice(0, 4), 10) || 0,
            tmdb_id: card.id || 0,
            imdb_id: imdb,
            type: isTv ? 'tv' : 'movie',
            card: card
        };
    }

    /* ---------------------------------------------------------------- player */

    var BROWSER_HARD_FORMATS = /^(ogv|webm)$/;

    function platformIs(name) {
        try { return Lampa.Platform.is(name); } catch (e) { return false; }
    }

    function orderStreams(streams) {
        // Tizen / webOS / Apple do not play Ogg/WebM — keep them only as the last resort
        var tv = platformIs('tizen') || platformIs('webos') || platformIs('apple') || platformIs('apple_tv');
        var good = [], hard = [];
        streams.forEach(function (s) {
            if (!s || !s.url) return;
            (BROWSER_HARD_FORMATS.test(s.type) ? hard : good).push(s);
        });
        return tv ? good : good.concat(hard);
    }

    function playStreams(streams, item, card) {
        streams = orderStreams(streams);
        if (!streams.length) {
            log('error', 'no playable streams', item && item.id);
            noty('Фильм не найден в доступных источниках');
            return false;
        }

        var index = 0;
        var first = streams[0];
        var quality = {};
        streams.forEach(function (s) {
            if (s.type === 'mp4' && s.quality && !quality[s.quality]) quality[s.quality] = s.url;
        });

        var data = {
            url: first.url,
            title: (item && (item.title_ru || item.title)) || first.title || 'Video',
            quality: quality,
            card: card || undefined,
            error: function (work, setUrl) {
                index++;
                var next = streams[index];
                log('error', 'stream failed, index', index - 1, work && work.url);
                if (next) {
                    log('play', 'fallback stream', next.url);
                    noty('Файл не воспроизводится, пробую следующий (' + (next.quality || next.type) + ')');
                    work.url = next.url;
                    setUrl(next.url);
                } else {
                    noty('Не удалось воспроизвести ни один файл');
                }
            }
        };

        log('play', data.url, data.title);
        try {
            Lampa.Player.play(data);
            Lampa.Player.playlist([{ title: data.title, url: data.url, quality: quality }]);
        } catch (e) {
            log('error', 'Player.play failed', e && e.message);
            noty('Ошибка запуска плеера');
            return false;
        }
        return true;
    }

    function loadAndPlay(item, card) {
        var p = getProvider(item.source);
        if (!p) { noty('Источник временно недоступен'); return Promise.resolve(false); }

        try { Lampa.Loading.start(function () { Lampa.Loading.stop(); }); } catch (e) {}

        var call;
        try { call = Promise.resolve(p.getStreams(item)); } catch (e) { call = Promise.reject(e); }

        return withTimeout(call, 25000, p.id).then(function (streams) {
            try { Lampa.Loading.stop(); } catch (e) {}
            streams = streams || [];
            log('stream found', item.source, item.id, streams.length + ' files', streams[0] && streams[0].url);
            if (streams.length) item.quality = streams[0].quality || item.quality;
            return playStreams(streams, item, card);
        }, function (e) {
            try { Lampa.Loading.stop(); } catch (err) {}
            log('error', p.id, 'getStreams failed:', e && e.message);
            noty(/no files/.test(e && e.message) ? 'Фильм не найден в доступных источниках' : 'Источник временно недоступен');
            return false;
        });
    }

    /* ---------------------------------------------------------------- styles / templates */

    var CSS = '' +
        '.lo-screen{padding:1.5em 2em 3em}' +
        '.lo-head{font-size:2em;font-weight:600;margin-bottom:.2em}' +
        '.lo-sub{opacity:.6;margin-bottom:1.2em;font-size:1.1em}' +
        '.lo-status{font-size:1.3em;opacity:.8;margin:1em 0}' +
        '.lo-item{display:flex;align-items:center;padding:.8em;margin-bottom:.6em;border-radius:.6em;background:rgba(255,255,255,.06)}' +
        '.lo-item.focus,.lo-item.hover{background:#fff;color:#000}' +
        '.lo-item__poster{width:6em;height:4.5em;flex-shrink:0;border-radius:.4em;overflow:hidden;background:rgba(255,255,255,.1);margin-right:1.2em}' +
        '.lo-item__poster img{width:100%;height:100%;object-fit:cover;display:block}' +
        '.lo-item__title{font-size:1.4em;font-weight:600;line-height:1.25}' +
        '.lo-item__info{opacity:.7;margin-top:.3em;font-size:1.05em}' +
        '.lo-btn{display:inline-block;padding:.7em 1.4em;margin:.6em .6em 0 0;border-radius:.5em;background:rgba(255,255,255,.1);font-size:1.2em}' +
        '.lo-btn.focus,.lo-btn.hover{background:#fff;color:#000}' +
        '.lo-grid{display:flex;flex-wrap:wrap;margin:0 -.6em}' +
        '.lo-card{width:12em;margin:0 .6em 1.4em;border-radius:.6em;padding:.4em}' +
        '.lo-card__img{width:100%;height:16em;border-radius:.5em;overflow:hidden;background:rgba(255,255,255,.08)}' +
        '.lo-card__img img{width:100%;height:100%;object-fit:cover;display:block}' +
        '.lo-card__title{margin-top:.6em;font-size:1.15em;font-weight:600;line-height:1.25}' +
        '.lo-card__info{opacity:.6;font-size:.95em;margin-top:.2em}' +
        '.lo-card.focus,.lo-card.hover{background:#fff;color:#000}' +
        '.lo-card.focus .lo-card__info{opacity:.8}';

    var ICON = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor"/></svg>';

    function infoLine(it) {
        var parts = [];
        if (it.year) parts.push(it.year);
        if (it.quality) parts.push(it.quality);
        parts.push(it.source_name || (getProvider(it.source) || {}).name || it.source);
        if (it.language) parts.push(it.language);
        return parts.join(' · ');
    }

    /* ---------------------------------------------------------------- common component base */

    function baseComponent(self, object) {
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
        var html = $('<div class="lo-screen"></div>');
        var last = null;
        self._alive = true;

        scroll.append(html[0]);

        self.html = html;
        self.scroll = scroll;

        self.bindFocus = function (el) {
            el.on('hover:focus', function () {
                last = el[0];
                scroll.update(el, true);
            });
            return el;
        };

        self.render = function (js) { return js ? scroll.render(true) : scroll.render(); };

        self.start = function () {
            if (Lampa.Activity.active().activity !== self.activity) return;
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () { if (Navigator.canmove('down')) Navigator.move('down'); },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () { if (Navigator.canmove('right')) Navigator.move('right'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        self.pause = function () {};
        self.stop = function () {};
        self.destroy = function () {
            self._alive = false;
            try { scroll.destroy(); } catch (e) {}
            html.remove();
        };

        self.ready = function () {
            self.activity.loader(false);
            self.activity.toggle();
        };
    }

    function freeButton() {
        return $('<div class="lo-btn selector">Бесплатные фильмы</div>').on('hover:enter', openCatalog);
    }

    /* ---------------------------------------------------------------- component: search results */

    function OnlineComponent(object) {
        var self = this;
        baseComponent(this, object);
        var movie = movieFromCard(object.movie);

        this.create = function () {
            this.activity.loader(true);
            var html = this.html;
            html.append('<div class="lo-head">' + esc(movie.title || movie.original_title) + '</div>');
            html.append('<div class="lo-sub">' + esc([movie.original_title !== movie.title ? movie.original_title : '', movie.year || ''].filter(Boolean).join(' · ')) + '</div>');
            var status = $('<div class="lo-status">Поиск в доступных источниках…</div>');
            var list = $('<div class="lo-list"></div>');
            html.append(status).append(list);

            searchAll(movie).then(function (res) {
                if (!self._alive) return;
                if (!res.items.length) {
                    var text = res.errors && res.errors === res.tried ? 'Источник временно недоступен' : 'Фильм не найден в доступных источниках';
                    log('error', text);
                    status.text(text);
                    list.append(self.bindFocus(freeButton()));
                    list.append(self.bindFocus($('<div class="lo-btn selector">Назад</div>').on('hover:enter', function () { Lampa.Activity.backward(); })));
                    self.ready();
                    return;
                }
                status.text('Найдено: ' + res.items.length + ' · ' + res.provider.name + ' — выберите вариант');
                res.items.forEach(function (it) {
                    var row = $('<div class="lo-item selector">' +
                        '<div class="lo-item__poster">' + (it.poster ? '<img src="' + esc(it.poster) + '" loading="lazy">' : '') + '</div>' +
                        '<div class="lo-item__body"><div class="lo-item__title">' + esc(it.title) + '</div>' +
                        '<div class="lo-item__info">' + esc(infoLine(it)) + '</div></div></div>');
                    row.find('img').on('error', function () { $(this).remove(); });
                    row.on('hover:enter', function () {
                        loadAndPlay(it, object.movie).then(function () {
                            row.find('.lo-item__info').text(infoLine(it));
                        });
                    });
                    list.append(self.bindFocus(row));
                });
                self.ready();
            }, function (e) {
                if (!self._alive) return;
                log('error', 'search crashed', e && e.message);
                status.text('Источник временно недоступен');
                list.append(self.bindFocus(freeButton()));
                self.ready();
            });

            return this.render();
        };
    }

    /* ---------------------------------------------------------------- component: free catalog */

    function CatalogComponent(object) {
        var self = this;
        baseComponent(this, object);

        this.create = function () {
            this.activity.loader(true);
            var html = this.html;
            html.append('<div class="lo-head">Бесплатные фильмы</div>');
            html.append('<div class="lo-sub">Public domain и Creative Commons · Internet Archive · выберите фильм, воспроизведение начнётся сразу</div>');
            var grid = $('<div class="lo-grid"></div>');
            html.append(grid);

            var list = providers.filter(function (p) {
                try { return typeof p.catalog === 'function' && (!p.enabled || p.enabled()); } catch (e) { return false; }
            });
            var chain = Promise.resolve();
            var total = 0;

            list.forEach(function (p) {
                chain = chain.then(function () {
                    return withTimeout(Promise.resolve(p.catalog()), 20000, p.id).then(function (items) {
                        (items || []).forEach(function (it) {
                            it.source = it.source || p.id;
                            total++;
                            var card = $('<div class="lo-card selector">' +
                                '<div class="lo-card__img">' + (it.poster ? '<img src="' + esc(it.poster) + '">' : '') + '</div>' +
                                '<div class="lo-card__title">' + esc(it.title_ru || it.title) + '</div>' +
                                '<div class="lo-card__info">' + esc((it.title_ru && it.title_ru !== it.title ? it.title + ' · ' : '') + infoLine(it)) + '</div></div>');
                            card.find('img').on('error', function () { $(this).remove(); });
                            card.on('hover:enter', function () { loadAndPlay(it, null); });
                            grid.append(self.bindFocus(card));
                        });
                    }, function (e) {
                        log('error', p.id, 'catalog failed', e && e.message);
                    });
                });
            });

            chain.then(function () {
                if (!self._alive) return;
                if (!total) html.append('<div class="lo-status">Источник временно недоступен</div>');
                self.ready();
            });

            return this.render();
        };
    }

    /* ---------------------------------------------------------------- integration */

    function openOnline(card) {
        Lampa.Activity.push({
            url: '',
            title: 'Смотреть онлайн',
            component: 'lampa_online',
            movie: card,
            page: 1
        });
    }

    function openCatalog() {
        Lampa.Activity.push({
            url: '',
            title: 'Бесплатные фильмы',
            component: 'lampa_online_free',
            page: 1
        });
    }

    function buttonHtml() {
        return '<div class="full-start__button selector view--online lampa-online-btn" data-subtitle="Internet Archive · v' + VERSION + '">' +
            ICON + '<span>Смотреть онлайн</span></div>';
    }

    function addCardButton(e) {
        try {
            var render = e.object.activity.render();
            if (render.find('.lampa-online-btn').length) return;
            var btn = $(buttonHtml());
            btn.on('hover:enter', function () { openOnline(e.data.movie); });

            var anchor = render.find('.view--torrent').last();
            if (anchor.length) anchor.after(btn);
            else {
                var cont = render.find('.full-start-new__buttons, .full-start__buttons').first();
                if (cont.length) cont.append(btn);
                else return log('error', 'card buttons container not found');
            }
            log('button', 'added for', e.data.movie && (e.data.movie.title || e.data.movie.name));
        } catch (err) {
            log('error', 'button inject failed', err && err.message);
        }
    }

    function addMenu() {
        if ($('.menu .menu__list .lampa-online-menu').length) return;
        var item = $('<li class="menu__item selector lampa-online-menu">' +
            '<div class="menu__ico">' + ICON + '</div>' +
            '<div class="menu__text">Бесплатные фильмы</div></li>');
        item.on('hover:enter', openCatalog);
        $('.menu .menu__list').eq(0).append(item);
    }

    function addSettings() {
        try {
            if (!Lampa.SettingsApi) return;
            Lampa.SettingsApi.addComponent({
                component: 'lampa_online',
                name: 'Смотреть онлайн',
                icon: ICON
            });
            Lampa.SettingsApi.addParam({
                component: 'lampa_online',
                param: { name: 'lampa_online_custom_url', type: 'input', values: '', default: '', placeholder: 'https://example.com/catalog.json' },
                field: { name: 'Свой каталог (URL JSON)', description: 'Дополнительный источник: JSON со ссылками на ваши собственные видео. Формат — в README.' }
            });
        } catch (e) {
            log('error', 'settings failed', e && e.message);
        }
    }

    function init() {
        if (window.lampa_online_inited) return;
        window.lampa_online_inited = true;

        $('body').append('<style id="lampa-online-css">' + CSS + '</style>');

        Lampa.Component.add('lampa_online', OnlineComponent);
        Lampa.Component.add('lampa_online_free', CatalogComponent);

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') addCardButton(e);
        });

        Lampa.Manifest.plugins = {
            type: 'video',
            version: VERSION,
            name: 'Смотреть онлайн',
            description: 'Легальные бесплатные фильмы: Internet Archive (public domain / CC)',
            component: 'lampa_online',
            onContextMenu: function () { return { name: 'Смотреть онлайн', description: '' }; },
            onContextLauch: function (card) { openOnline(card); }
        };

        addMenu();
        addSettings();

        window.LampaOnline = {
            version: VERSION,
            providers: function () { return providers.slice(); },
            register: registerProvider,
            search: searchAll,
            open: openOnline,
            catalog: openCatalog,
            play: loadAndPlay,
            movieFromCard: movieFromCard
        };

        log('ready', 'v' + VERSION, providers.map(function (p) { return p.id; }).join(','));
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
})();
