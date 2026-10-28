// ==UserScript==
// @name         Google Flow & Labs Country Unlocker
// @namespace    http://tampermonkey.net/
// @version      6.1
// @description  Bypasses client-side country checks for Google Flow and Google Labs using native Google Closure stream parser
// @match        https://flow.google.com/*
// @match        https://labs.google/*
// @match        https://*.google.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @all-frames   true
// ==/UserScript==

(function() {
    'use strict';

    const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    console.log('[Flow Unlocker v6.1] 🚀 Initialized on:', win.location.href);

    // 1. Если адресная строка залипла на экране заглушки — перенаправляем на корень
    if (win.location.pathname.includes('unsupported-country') || win.location.pathname.includes('unavailable')) {
        console.log('[Flow Unlocker v6.1] 🔄 Redirecting from blocked path to /');
        win.location.replace('/');
        return;
    }

    // 2. Блокируем SPA-роутеру переход на заглушку
    const origPush = win.history.pushState;
    win.history.pushState = function(state, title, url) {
        if (url && (String(url).includes('unsupported-country') || String(url).includes('unavailable'))) {
            console.warn('[Flow Unlocker v6.1] 🚫 Blocked router navigation to:', url);
            return;
        }
        return origPush.apply(this, arguments);
    };

    const origReplace = win.history.replaceState;
    win.history.replaceState = function(state, title, url) {
        if (url && (String(url).includes('unsupported-country') || String(url).includes('unavailable'))) {
            console.warn('[Flow Unlocker v6.1] 🚫 Blocked router replaceState to:', url);
            return;
        }
        return origReplace.apply(this, arguments);
    };

    // 3. Авторизация и регион в WIZ_global_data
    try {
        let _wiz = win.WIZ_global_data || {};
        _wiz.awbSEf = true;
        if (!_wiz.KLD0Rc) _wiz.KLD0Rc = "global";

        const wizHandler = {
            set: function(target, prop, value) {
                target[prop] = value;
                target.awbSEf = true;
                if (!target.KLD0Rc) target.KLD0Rc = "global";
                return true;
            }
        };

        win.WIZ_global_data = new Proxy(_wiz, wizHandler);
        Object.defineProperty(win, 'WIZ_global_data', {
            get: () => _wiz,
            set: (v) => {
                if (v && typeof v === 'object') {
                    v.awbSEf = true;
                    if (!v.KLD0Rc) v.KLD0Rc = "global";
                    _wiz = new Proxy(v, wizHandler);
                }
            },
            configurable: true,
            enumerable: true
        });
    } catch(e) {}

    // 4. ПЕРЕХВАТ JSON.parse — надежная подмена данных batchexecute в памяти
    const TARGET_RPCS = ['cPZSdc', 'KV2T2d', 'rThb8d', 'cO7JOb', 'md9xJf'];

    function patchDeepJson(data) {
        if (!data || typeof data !== 'object') return data;
        if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) patchDeepJson(data[i]);
        } else {
            for (let k of Object.keys(data)) {
                if (k === 'availabilityState') {
                    data[k] = 'AVAILABLE';
                } else if (k === 'isCountrySupported' || k === 'is_country_supported') {
                    data[k] = true;
                } else if (k === 'isAgeSupported' || k === 'is_age_supported') {
                    data[k] = true;
                } else if (typeof data[k] === 'object') {
                    patchDeepJson(data[k]);
                }
            }
        }
        return data;
    }

    const origParse = win.JSON.parse;
    win.JSON.parse = function(text, reviver) {
        let data = origParse.apply(this, arguments);
        if (!data) return data;

        // Перехват массива ответов Google Closure batchexecute: [["wrb.fr", rpcid, jsonPayloadStr, ...]]
        if (Array.isArray(data)) {
            for (let item of data) {
                if (Array.isArray(item) && item[0] === 'wrb.fr') {
                    const rpcid = item[1];
                    if (rpcid === 'cPZSdc' && typeof item[2] === 'string') {
                        try {
                            let inner = origParse(item[2]);
                            if (Array.isArray(inner)) {
                                while (inner.length < 35) inner.push(null);
                                inner[30] = 1; // field 31: is_country_supported
                                inner[31] = 1; // field 32: is_age_supported
                                inner[33] = 1;
                                item[2] = JSON.stringify(inner);
                                console.log('[Flow Unlocker v6.1] 🎯 Patched cPZSdc (country=1, age=1)');
                            }
                        } catch(e) {}
                    } else if (TARGET_RPCS.includes(rpcid) && typeof item[2] === 'string') {
                        try {
                            let inner = origParse(item[2]);
                            if (Array.isArray(inner)) {
                                if (inner.length === 0) inner.push(1);
                                else inner[0] = 1;
                                item[2] = JSON.stringify(inner);
                                console.log(`[Flow Unlocker v6.1] 🎯 Patched ${rpcid} (status=1 AVAILABLE)`);
                            }
                        } catch(e) {}
                    }
                }
            }
        }

        // Подмена REST/tRPC ответов
        if (typeof data === 'object') {
            patchDeepJson(data);
        }

        return data;
    };
})();
