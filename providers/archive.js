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
