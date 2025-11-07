// Rollup/Vite virtual module namespace used by this plugin.
// Important:
// - The leading "\u0000" marks an id as virtual so default resolvers don't touch it.
// - The trailing namespace string must match checks like id.startsWith(VIRTUAL_PREFIX).
export const VIRTUAL_PREFIX = '\u0000lazy-css-inliner:';
// Stable id for the shared runtime module that provides `injectLazyCss`.
// All generated virtual CSS modules import from this id to avoid duplicating the injector code.
export const RUNTIME_MODULE_ID = `${VIRTUAL_PREFIX}runtime`;
export const RTL_DIR = '/rtl/';
export const FILTER_CSS_FN = '(dep) => !(typeof dep === "string" && dep.endsWith(".css"))';
export const FILTER_CSS_FN_RTL = (runtimeIsRtlCondition: string) =>
    `(dep) => !(typeof dep === "string" && (dep.endsWith(".css") || (dep.includes("${RTL_DIR}") !== ${runtimeIsRtlCondition})))`;

export const CSS_MODULES_PLUGIN_ID = 'postcss-modules';
export const CSS_NANO_PLUGIN_ID = 'cssnano';

// Markers used to wrap CSS and id values inside generated code for later build-time rewriting.
export const MARKER_CSS_START = '__LAZY_CSS_START__';
export const MARKER_CSS_END = '__LAZY_CSS_END__';
export const MARKER_ID_START = '__LAZY_ID_START__';
export const MARKER_ID_END = '__LAZY_ID_END__';

export const CSS_REGEX = new RegExp(`${MARKER_CSS_START}([\\s\\S]*?)${MARKER_CSS_END}`, 'g');
export const ID_REGEX = new RegExp(`${MARKER_ID_START}\\s*"?([^"|]+)"?\\s*${MARKER_ID_END}`, 'g');
