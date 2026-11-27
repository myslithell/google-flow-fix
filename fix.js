// ==UserScript==
// @name         Google Flow & Labs Country Unlocker
// @namespace    https://tampermonkey.net/
// @version      7.0
// @description  Bypasses client-side country checks for Google Flow and Google Labs using native Google Closure stream parser
// @match        https://flow.google.com/*
// @match        https://labs.google/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const RE = /unsupported-country|\/unavailable/;
    const blocked = u => RE.test(u);

    // 1) Редирект с заглушки, не чаще раза в 5 с (анти-петля)
    if (blocked(win.location.pathname)) {
        try {
            const t = +win.sessionStorage.getItem('__fu') || 0;
            if (Date.now() - t > 5000) {
                win.sessionStorage.setItem('__fu', String(Date.now()));
                win.location.replace('/');
            }
        } catch (e) {}
        return;
    }

    // 2) Не даём SPA-роутеру уйти на заглушку
    for (const m of ['pushState', 'replaceState']) {
        const orig = win.history[m];
        win.history[m] = function (state, title, url) {
            if (url != null && blocked(url)) return;
            return orig.apply(this, arguments);
        };
    }

    // 3) Патч ответов batchexecute и REST
    const STATUS_RPCS = ['KV2T2d']; // если Flow закрылся: добавьте 'rThb8d', 'cO7JOb', 'md9xJf'
    const origParse = win.JSON.parse;

    function patchEnvelope(rows) {
        for (const r of rows) {
            if (!Array.isArray(r) || r[0] !== 'wrb.fr' || typeof r[2] !== 'string') continue;
            const id = r[1];
            if (id !== 'cPZSdc' && !STATUS_RPCS.includes(id)) continue;
            try {
                const inner = origParse(r[2]);
                if (!Array.isArray(inner)) continue;
                if (id === 'cPZSdc') {
                    while (inner.length < 35) inner.push(null);
                    inner[30] = inner[31] = inner[33] = 1; // country / age / доп. флаг
                } else {
                    inner[0] = 1;
                }
                r[2] = JSON.stringify(inner);
            } catch (e) {}
        }
    }

    function patchKeys(o, seen) {
        if (o === null || typeof o !== 'object' || seen.has(o)) return;
        seen.add(o);
        for (const k of Object.keys(o)) {
            if (k === 'availabilityState') {
                o[k] = 'AVAILABLE';
            } else if (k === 'isCountrySupported' || k === 'is_country_supported' ||
                k === 'isAgeSupported' || k === 'is_age_supported') {
                o[k] = true;
            } else if (o[k] && typeof o[k] === 'object') {
                patchKeys(o[k], seen);
            }
        }
    }

    win.JSON.parse = function (text) {
        const data = origParse.apply(this, arguments);
        if (typeof text === 'string' && data && typeof data === 'object' &&
            (text.includes('wrb.fr') || text.includes('upported') || text.includes('availabilityState'))) {
            if (Array.isArray(data)) patchEnvelope(data);
            try {
                patchKeys(data, new WeakSet());
            } catch (e) {}
        }
        return data;
    };
})();
