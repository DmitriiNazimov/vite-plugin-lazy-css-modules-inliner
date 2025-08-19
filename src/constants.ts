// Rollup/Vite virtual module namespace used by this plugin.
// Important:
// - The leading "\u0000" marks an id as virtual so default resolvers don't touch it.
// - The trailing namespace string must match checks like id.startsWith(VIRTUAL_PREFIX).
export const VIRTUAL_PREFIX = '\u0000lazy-css-inliner:';
// Stable id for the shared runtime module that provides `injectLazyCss`.
// All generated virtual CSS modules import from this id to avoid duplicating the injector code.
export const RUNTIME_MODULE_ID = `${VIRTUAL_PREFIX}runtime`;
export const FILTER_CSS_FN = '(dep) => !(typeof dep === "string" && dep.endsWith(".css"))';
export const CSS_MODULES_PLUGIN_ID = 'postcss-modules';
export const CSS_NANO_PLUGIN_ID = 'cssnano';
