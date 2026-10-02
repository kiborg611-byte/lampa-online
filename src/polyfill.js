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
