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
