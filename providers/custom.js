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
