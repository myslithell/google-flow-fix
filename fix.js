// ==UserScript==
// @name         Google Flow & Labs Country Unlocker
// @namespace    http://tampermonkey.net/
// @version      4.1
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
    console.log('[Flow Unlocker v4.1] 🚀 Initialized on:', location.href);

    // Safeguard: Redirect old dummy test project ID to root
    if (location.href.includes('3d3ec587-30a3-488a-a3b7-03fae3d45417')) {
        console.log('[Flow Unlocker] Detected dummy project URL, redirecting to Flow root...');
        location.replace('https://flow.google.com/');
        return;
    }

    // 1. Ensure WIZ_global_data.awbSEf = true (for Angular signed-in state)
    try {
        let _wiz = win.WIZ_global_data || {};
        _wiz.awbSEf = true;
        win.WIZ_global_data = new Proxy(_wiz, {
            set: function(target, prop, value) {
                target[prop] = value;
                target.awbSEf = true;
                return true;
            }
        });
        Object.defineProperty(win, 'WIZ_global_data', {
            get: () => _wiz,
            set: (v) => {
                if (v && typeof v === 'object') {
                    v.awbSEf = true;
                    _wiz = new Proxy(v, {
                        set: function(target, prop, value) {
                            target[prop] = value;
                            target.awbSEf = true;
                            return true;
                        }
                    });
                }
            },
            configurable: true,
            enumerable: true
        });
    } catch(e) {
        console.warn('[Flow Unlocker] WIZ_global_data hook warning:', e);
    }

    // 2. Native Closure-compatible Stream & Batch Patcher
    const TARGET_RPCS = ['cPZSdc', 'KV2T2d', 'rThb8d', 'cO7JOb', 'md9xJf'];

    function patchProtobufJson(str, rpcid) {
        try {
            let inner = JSON.parse(str);
            if (Array.isArray(inner)) {
                if (rpcid === 'cPZSdc') {
                    // FLOW_APP_CONFIG: field 31 (country supported), field 32 (age supported)
                    while (inner.length < 32) inner.push(null);
                    inner[30] = 1; // is_country_supported = true
                    inner[31] = 1; // is_age_supported = true
                    console.log('[Flow Unlocker] ✅ Patched cPZSdc (country=1, age=1)');
                } else if (TARGET_RPCS.includes(rpcid)) {
                    // CheckToolAvailability / CheckFlowAvailability / CheckAppAvailability
                    if (inner.length === 0) inner.push(1);
                    else inner[0] = 1; // field 1 = AVAILABLE / TIER_ONE
                    console.log(`[Flow Unlocker] ✅ Patched ${rpcid} (status=1 AVAILABLE)`);
                }
                return JSON.stringify(inner);
            }
        } catch(e) {}
        return str;
    }

    function patchGoogleStream(raw) {
        if (!raw || typeof raw !== 'string') return raw;
        if (!TARGET_RPCS.some(id => raw.includes(id))) return raw;

        // Check Google prefix
        let headerEnd = raw.indexOf(")]}'\n\n");
        let ua = 0;
        let prefix = "";
        if (headerEnd >= 0) {
            ua = headerEnd + 6;
            prefix = raw.slice(0, ua);
        } else {
            headerEnd = raw.indexOf("\n\n");
            if (headerEnd >= 0) {
                ua = headerEnd + 2;
                prefix = raw.slice(0, ua);
            }
        }

        // Strategy A: Try parsing as standard JSON batch first
        let body = raw.slice(ua);
        try {
            let data = JSON.parse(body);
            if (Array.isArray(data)) {
                let modified = false;
                for (let item of data) {
                    if (Array.isArray(item) && TARGET_RPCS.includes(item[1]) && typeof item[2] === 'string') {
                        item[2] = patchProtobufJson(item[2], item[1]);
                        modified = true;
                    }
                }
                if (modified) {
                    return prefix + JSON.stringify(data);
                }
            }
        } catch(_) {}

        // Strategy B: Native Closure MFa stream parser & rebuilder
        let out = prefix;
        let pos = ua;
        let anyModified = false;

        while (pos < raw.length) {
            let nextNl = raw.indexOf("\n", pos);
            if (nextNl === -1) {
                out += raw.slice(pos);
                break;
            }
            let lenStr = raw.substring(pos, nextNl);
            let len = Number(lenStr);
            if (isNaN(len) || nextNl + len > raw.length) {
                out += raw.slice(pos);
                break;
            }

            let chunkWithNl = raw.substr(nextNl, len); // starts with \n
            let chunkJson = chunkWithNl.slice(1);      // strip leading \n
            try {
                let chunk = JSON.parse(chunkJson);
                let chunkModified = false;
                for (let item of chunk) {
                    if (Array.isArray(item) && TARGET_RPCS.includes(item[1]) && typeof item[2] === 'string') {
                        item[2] = patchProtobufJson(item[2], item[1]);
                        chunkModified = true;
                        anyModified = true;
                    }
                }
                if (chunkModified) {
                    let newChunkJson = JSON.stringify(chunk);
                    let newLen = 1 + newChunkJson.length; // 1 for leading \n required by Closure!
                    out += String(newLen) + '\n' + newChunkJson;
                } else {
                    out += lenStr + chunkWithNl;
                }
            } catch(err) {
                out += lenStr + chunkWithNl;
            }
            pos = nextNl + len;
        }

        return anyModified ? out : raw;
    }

    // 3. Recursive JSON patcher for Next.js tRPC & REST endpoints (labs.google)
    function patchDeepJson(data) {
        if (!data || typeof data !== 'object') return data;
        if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                data[i] = patchDeepJson(data[i]);
            }
        } else {
            for (let k of Object.keys(data)) {
                if (k === 'availabilityState') {
                    if (data[k] !== 'AVAILABLE') {
                        console.log(`[Flow Unlocker] ✅ Patched availabilityState: "${data[k]}" -> "AVAILABLE"`);
                        data[k] = 'AVAILABLE';
                    }
                } else if (k === 'isCountrySupported' || k === 'is_country_supported') {
                    data[k] = true;
                } else if (k === 'isAgeSupported' || k === 'is_age_supported') {
                    data[k] = true;
                } else if (typeof data[k] === 'object') {
                    data[k] = patchDeepJson(data[k]);
                }
            }
        }
        return data;
    }

    // 4. Hook XMLHttpRequest (Angular flow.google.com batchexecute)
    try {
        const XHR = win.XMLHttpRequest;
        if (XHR && XHR.prototype) {
            const origTextDesc = Object.getOwnPropertyDescriptor(XHR.prototype, 'responseText');
            const origRespDesc = Object.getOwnPropertyDescriptor(XHR.prototype, 'response');

            if (origTextDesc && origTextDesc.get) {
                Object.defineProperty(XHR.prototype, 'responseText', {
                    get: function() {
                        try {
                            if (this.responseType && this.responseType !== 'text') {
                                return origTextDesc.get.call(this);
                            }
                            const raw = origTextDesc.get.call(this);
                            return patchGoogleStream(raw);
                        } catch(e) {
                            try { return origTextDesc.get.call(this); } catch(_) { return ''; }
                        }
                    },
                    configurable: true
                });
            }

            if (origRespDesc && origRespDesc.get) {
                Object.defineProperty(XHR.prototype, 'response', {
                    get: function() {
                        try {
                            if (this.responseType && this.responseType !== 'text' && this.responseType !== '') {
                                return origRespDesc.get.call(this);
                            }
                            const raw = origRespDesc.get.call(this);
                            if (typeof raw === 'string') {
                                return patchGoogleStream(raw);
                            }
                            return raw;
                        } catch(e) {
                            try { return origRespDesc.get.call(this); } catch(_) { return null; }
                        }
                    },
                    configurable: true
                });
            }
        }
    } catch(e) {
        console.error('[Flow Unlocker] XHR hook error:', e);
    }

    // 5. Hook window.fetch (Next.js labs.google tRPC & Google AI API)
    try {
        const origFetch = win.fetch;
        win.fetch = async function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');

            // Prevent NextAuth signOut trigger
            if (url.includes('api/auth/signout')) {
                console.warn('[Flow Unlocker] 🚫 Prevented NextAuth signOut call');
                return new Response(JSON.stringify({ url: location.href }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const res = await origFetch.apply(this, args);

            // Batchexecute over fetch
            if (url.includes('batchexecute')) {
                try {
                    const raw = await res.text();
                    const patched = patchGoogleStream(raw);
                    const headers = new Headers(res.headers);
                    headers.delete('content-length');
                    return new Response(patched, {
                        status: res.status,
                        statusText: res.statusText,
                        headers: headers
                    });
                } catch(e) {
                    return res;
                }
            }

            // Only inspect JSON responses for availability endpoints
            if (url.includes('fetchToolAvailability') ||
                url.includes('checkAppAvailability') ||
                url.includes('trpc/general.')) {
                try {
                    const text = await res.text();
                    let headers = new Headers(res.headers);
                    headers.delete('content-length');
                    try {
                        const data = JSON.parse(text);
                        patchDeepJson(data);
                        return new Response(JSON.stringify(data), {
                            status: 200,
                            statusText: 'OK',
                            headers: headers
                        });
                    } catch(err) {
                        return new Response(text, {
                            status: res.status,
                            statusText: res.statusText,
                            headers: headers
                        });
                    }
                } catch(e) {
                    return res;
                }
            }

            return res;
        };
    } catch(e) {
        console.error('[Flow Unlocker] Fetch hook error:', e);
    }

    // 6. Navigation safety fallback (if landed on unsupported-country or unavailable, redirect to root)
    if (location.pathname.includes('unsupported-country') || location.pathname.includes('unavailable')) {
        console.log('[Flow Unlocker] Blocked path detected, navigating to /');
        location.replace('/');
    }
})();
