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
 

