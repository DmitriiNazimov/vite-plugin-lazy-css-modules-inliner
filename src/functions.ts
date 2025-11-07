import path from 'node:path';
import { createHash } from 'node:crypto';
import type MagicString from 'magic-string';
import type { StripPreloadDepsMode, ProcessCssResult, ProcessCssParams } from './types';
import {
    CSS_MODULES_PLUGIN_ID,
    CSS_NANO_PLUGIN_ID,
    FILTER_CSS_FN,
    FILTER_CSS_FN_RTL,
    RUNTIME_MODULE_ID,
    MARKER_CSS_START,
    MARKER_CSS_END,
    MARKER_ID_START,
    MARKER_ID_END,
    RTL_DIR,
} from './constants';
import postcss, { type AcceptedPlugin } from 'postcss';
import cssnano from 'cssnano';
import structuredClone from '@ungap/structured-clone';
// @ts-expect-error: no official types for rtlcss
import rtlcss from 'rtlcss';
import postcssModules from 'postcss-modules';
import { readFile } from 'fs/promises';
import { VIRTUAL_PREFIX } from './constants';
import type { ResolvedConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OutputChunk, RenderedChunk } from 'rollup';
import loadPostcssConfig from 'postcss-load-config';

// Cache for runtime injector script to avoid reading file multiple times
let runtimeStylesInjectorCache: string | null = null;

// Normalize Rollup/Vite ids: drop leading "\0" (virtual) and any query string.
export const normalizeId = (id: string): string => id.replace(/^\u0000+/, '').split('?')[0];

// Generic CSS predicate for lazy-subtree routing.
export const isCssFile = (id: string): boolean => /\.(css|scss|sass|less|styl)(?:$|\?)/.test(id);

// CSS Modules predicate (scoped styles that should return tokens).
const isCssModuleFile = (id: string): boolean => /\.module\.(css|scss|sass|less|styl)(?:$|\?)/.test(id);

// Map our virtual ids "\0lazy-dyn-css:<abs>.css.js" back to original CSS file id.
// We deliberately use a .js suffix on virtual ids to bypass the default CSS plugin in Vite on load().
export function getOriginalIdFromVirtual(virtualId: string): string {
    if (!virtualId.startsWith(VIRTUAL_PREFIX)) {
        return virtualId;
    }

    return virtualId.slice(VIRTUAL_PREFIX.length).replace(/\.js$/, '');
}

// Build a unique virtual id for CSS file, optionally namespaced by importer id to
// avoid hoisting into shared chunks and to keep injection bound to the importer chunk.
export function getVirtualCssModuleId(originalCssId: string): string {
    const baseId = normalizeId(originalCssId);
    return `${VIRTUAL_PREFIX}${baseId}.js`;
}

// Check if an id belongs to the includedPathes directory passedfrom config. And not in excludedPathes.
export function isAllowPath(id: string | undefined, includedPathes: string[], excludedPathes: string[]): boolean {
    if (!id) {
        return false;
    }

    const shortId = id.split('?')[0];
    const inInclude = includedPathes.length === 0 || includedPathes.some((path) => shortId.startsWith(path));

    if (!inInclude) {
        return false;
    }

    if (excludedPathes.length > 0 && excludedPathes.some((path) => shortId.includes(path))) {
        return false;
    }

    return true;
}

// Patch __vitePreload(...) calls to control preloading behavior.
// - mode 'all': remove all args after the first one
// - mode 'css': wrap deps array with a filter that drops .css entries
export function stripPreloadDeps(
    node: any,
    code: string,
    mode: StripPreloadDepsMode,
    magic: MagicString,
    runtimeIsRtlCondition?: string
): void {
    const isPreloadCall =
        node &&
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === '__vitePreload';

    if (!isPreloadCall) {
        return;
    }

    if (!Array.isArray(node.arguments) || node.arguments.length < 2) {
        return;
    }

    const [firstArg, depsArg] = node.arguments;

    if (mode === 'all') {
        magic.remove(firstArg.end, node.end - 1);
        return;
    }

    if (mode === 'css' && depsArg) {
        const src = code.slice(depsArg.start, depsArg.end);
        const filterFn = runtimeIsRtlCondition ? FILTER_CSS_FN_RTL(runtimeIsRtlCondition) : FILTER_CSS_FN;
        const wrapped = `(__deps=>Array.isArray(__deps)?__deps.filter(${filterFn}):__deps)(${src})`;
        magic.overwrite(depsArg.start, depsArg.end, wrapped);
    }
}

// Mark a module as part of the lazy graph (dynamic subtrees).
// - dynamicRoots: dynamic import entry points
// - lazyGraph: closure of dynamicRoots via static imports
export function markDynamicModule(
    id: string,
    dynamicRoots: Set<string>,
    lazyGraph: Set<string>,
    isDynamicRoot: boolean = false
): string {
    const normId = normalizeId(id);

    if (isDynamicRoot) {
        dynamicRoots.add(normId);
    }

    lazyGraph.add(normId);

    return normId;
}

// Read and process CSS file - apply postcss plugins, minify in production, collect tokens.
export async function processCss({
    originalId,
    cssModulesConfig,
    postcssPlugins = [],
}: ProcessCssParams): Promise<ProcessCssResult> {
    const cssSource = await readFile(originalId, 'utf-8');
    const tokens: Record<string, string> = {};
    const plugins: AcceptedPlugin[] = postcssPlugins.filter(Boolean);
    const pluginIds = new Set(plugins.map((plugin) => getPostcssPluginId(plugin)));

    // Add css-modules plugin if needed
    const hasPostcssModulesInConfig = pluginIds.has(CSS_MODULES_PLUGIN_ID);
    const isModule = isCssModuleFile(originalId) && Boolean(cssModulesConfig);

    if (isModule && !hasPostcssModulesInConfig && cssModulesConfig) {
        plugins.push(
            postcssModules({
                generateScopedName: cssModulesConfig.generateScopedName,
                localsConvention: cssModulesConfig.localsConvention || 'camelCaseOnly',
                getJSON: (_file: string, json: Record<string, string>) => Object.assign(tokens, json),
            })
        );
    }

    const result = await postcss(deduplicatePlugins(plugins)).process(cssSource, { from: originalId });

    return { css: result.css, tokens: tokens };
}

// Get the runtime styles injector script from the file system. And cache it to avoid reading file multiple times.
export function getRuntimeStylesInjectorScript(): string {
    if (runtimeStylesInjectorCache) {
        return runtimeStylesInjectorCache;
    }

    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    runtimeStylesInjectorCache = readFileSync(path.resolve(thisDir, './tplStyleRuntimeInjector.js'), 'utf-8');

    return runtimeStylesInjectorCache;
}

// Emit a JS module that injects CSS at runtime and exports CSS Module tokens.
// Uses an IIFE to guard against SSR, a global singleton Map on window to avoid
// duplicates across dev/HMR, and reuses existing <style data-lazy-css-id="..."> if present.
export async function generateVirtualModuleCode(
    css: string,
    tokens: Record<string, string>,
    originalId: string,
    isDev: boolean
): Promise<string> {
    const lazyCssId = getLazyCssId(originalId, isDev, css);
    const isCssModule = isCssModuleFile(originalId);
    const header = `import { ensureLazyCssInjected, createCssModuleProxy } from ${JSON.stringify(RUNTIME_MODULE_ID)};`;
    const cssCode = `${MARKER_CSS_START}${css}${MARKER_CSS_END}`;
    const id = `${MARKER_ID_START}${lazyCssId}${MARKER_ID_END}`;

    if (!isCssModule) {
        // Plain CSS side-effect import: inject immediately on evaluation
        return `
    ${header}
    ensureLazyCssInjected(${JSON.stringify(id)}, ${JSON.stringify(cssCode)});
    export default {};
  `;
    }

    // CSS Modules: inject lazily on first token access using a Proxy
    return `
    ${header}
    const __tokens = ${JSON.stringify(tokens)};
    export default createCssModuleProxy(__tokens, ${JSON.stringify(id)}, ${JSON.stringify(cssCode)});
  `;
}

export function hasAllowedModule(chunk: RenderedChunk, includedPathes: string[], excludedPathes: string[]): boolean {
    const modules = chunk.modules || {};
    return Object.keys(modules).some((id) => isAllowPath(id, includedPathes, excludedPathes));
}

export async function resolvePostcssPlugins(viteConfig: ResolvedConfig): Promise<AcceptedPlugin[]> {
    const postcssConfig = viteConfig?.css?.postcss;

    if (!postcssConfig) {
        return [];
    }

    const postcssConfigIsPath = typeof postcssConfig === 'string';

    if (postcssConfigIsPath) {
        try {
            const cwd = path.dirname(postcssConfig);
            const { plugins } = await loadPostcssConfig({}, cwd);
            return (plugins || []).filter(filterPostcssPlugins);
        } catch {
            return [];
        }
    }

    return (postcssConfig?.plugins || []).filter(filterPostcssPlugins);
}

// Compute value for data-lazy-css-id attribute on injected <style> tags.
// Dev: normalized full path (easy to debug). Prod: basename + short hash from CSS (avoid collisions).
export function getLazyCssId(originalId: string, isDev: boolean, css?: string, isRtl: boolean = false): string {
    if (isDev) {
        return normalizeId(originalId);
    }

    const base = isRtl ? path.basename(originalId.replace('.css', '.rtl.css')) : path.basename(originalId);

    if (css && css.length > 0) {
        const hash = createHash('sha1').update(css).digest('base64url').slice(0, 5);
        return `${base}-${hash}`;
    }

    return base;
}

export function escapeJson(str: string) {
    return JSON.stringify(str).slice(1, -1);
}

// Helpers for generateBundle
export function makeReplaceCssLtr(isDev: boolean) {
    return (_m: string, ltrCssCode: string) => minifyCssWithMarker(ltrCssCode, isDev);
}

export function makeReplaceCssRtl(isDev: boolean) {
    return (_m: string, ltrCssCode: string) => {
        try {
            const rtlCssCode = postcss([rtlcss()]).process(ltrCssCode, { from: undefined }).css;
            return minifyCssWithMarker(rtlCssCode, isDev);
        } catch {
            return minifyCssWithMarker(ltrCssCode, isDev);
        }
    };
}

export function convertLtrIdToRtl(_full: string, id: string): string {
    const newId = id.endsWith('.rtl') ? id : `${id}.rtl`;
    return `${MARKER_ID_START}${newId}${MARKER_ID_END}`;
}

export function getRtlFileName(fileName: string): string {
    const parts = fileName.split('/');
    const base = parts.pop()!;
    const dir = parts.join('/');
    return dir ? `${dir}${RTL_DIR}${base}` : `${RTL_DIR}${base}`;
}

export function createRtlChunk(chunk: OutputChunk, fileName: string, code: string): OutputChunk {
    return {
        ...structuredClone(chunk),
        code,
        fileName,
        name: chunk.name + '_rtl',
        facadeModuleId: chunk.facadeModuleId + '?rtl',
        moduleIds: Array.from(chunk.moduleIds, (id) => id + '?rtl'),
    };
}

const tryToMinifyCss = (css: string, isDev: boolean = false): string => {
    if (isDev) {
        return css;
    }

    try {
        return postcss([cssnano({ preset: 'default' })]).process(css, { from: undefined }).css;
    } catch {
        return css;
    }
};

function minifyCssWithMarker(css: string, isDev: boolean): string {
    return `${MARKER_CSS_START}${escapeJson(tryToMinifyCss(css, isDev))}${MARKER_CSS_END}`;
}

// Get plugin id to deduplicate PostCSS plugins
function getPostcssPluginId(plugin: AcceptedPlugin): string | undefined {
    if (plugin && 'postcssPlugin' in plugin) {
        return plugin.postcssPlugin;
    }

    return undefined;
}

// Deduplicate plugins list by id while preserving first occurrence (user's order)
function deduplicatePlugins(plugins: AcceptedPlugin[]): AcceptedPlugin[] {
    const seen = new Set<string>();

    return plugins.filter((p) => {
        const id = getPostcssPluginId(p) || String(p);
        if (seen.has(id)) return false;
        seen.add(id);

        return true;
    });
}

const filterPostcssPlugins = (plugin: AcceptedPlugin | undefined) =>
    // Exclude cssnano to avoid double-minification; plugin handles minification in generateBundle
    plugin && getPostcssPluginId(plugin) !== CSS_NANO_PLUGIN_ID;
