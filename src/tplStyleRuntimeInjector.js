// Don't use template literals in this file!
// it's inlined into a template literal later and has issues with escaping
function injectLazyCss(id, css) {
    var map = window.__lazyCssMap || (window.__lazyCssMap = new Map());
    var styleTag = map.get(id) || document.querySelector('style[data-lazy-css-id="' + id + '"]');

    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.setAttribute('type', 'text/css');
        styleTag.setAttribute('data-lazy-css-id', id);
        document.head.appendChild(styleTag);
        map.set(id, styleTag);
    }
    if (styleTag.textContent !== css) {
        styleTag.textContent = css;
    }
}

// Safe wrapper: only injects in the browser environment.
function ensureLazyCssInjected(id, css) {
    if (typeof document === 'undefined') return;
    injectLazyCss(id, css);
}

// For CSS Modules: returns a Proxy that injects CSS once on first token access.
function createCssModuleProxy(tokens, id, css) {
    var isInjected = false;

    function init() {
        if (isInjected) return;
        ensureLazyCssInjected(id, css);
        isInjected = true;
    }
    
    // Proxy to inject CSS once on first access to tokens.
    return new Proxy(tokens, {
        get: function (target, prop, receiver) { init(); return Reflect.get(target, prop, receiver); },
        has: function (target, prop) { init(); return Reflect.has(target, prop); },
        ownKeys: function (target) { init(); return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor: function (target, prop) { init(); return Object.getOwnPropertyDescriptor(target, prop); }
    });
}
