import MagicString from 'magic-string';
import { walk } from 'estree-walker';
import type { CSSModulesOptions, Plugin } from 'vite';
import { VIRTUAL_PREFIX } from './constants';
import type { PluginOptions } from './types';
import {
    normalizeId,
    isCssFile,
    isAllowPath,
    stripPreloadDeps,
    markDynamicModule,
    processCss,
    generateVirtualModuleCode,
    getOriginalIdFromVirtual,
    hasAllowedModule,
} from './functions';
import type { ModuleInfo, ProgramNode } from 'rollup';

export function viteLazyCssModulesInliner({
    stripPreloadDepsMode = 'css',
    isDev,
    includedPathes = [],
    excludedPathes = ['node_modules'],
}: PluginOptions): Plugin {
    // Dynamic import roots (modules that are loaded via import(), also known as dynamic imports or dynamic entry points)
    const dynamicRoots = new Set<string>();
    // Entire subgraph of modules belonging to any of the dynamic roots
    const lazyGraph = new Set<string>();

    let isSSRBuild = false;
    let cssModulesConfig: CSSModulesOptions | undefined | false = undefined;

    return {
        name: 'vite-lazy-dynamic-css-inliner',
        enforce: 'pre',

        configResolved(config) {
            isSSRBuild = Boolean(config.build?.ssr);
            cssModulesConfig = config.css?.modules;

            if (!includedPathes || includedPathes.length === 0) {
                throw new Error(`[lazy-css-modules-inliner: configResolved] includedPathes is required. 
          Please provide it in the config like this: viteLazyCssInliner({ includedPathes: [path.join(process.cwd(), "src")] })`);
            }

            if (isDev === undefined) {
                throw new Error(`[lazy-css-modules-inliner: configResolved] isDev is required. 
          Please provide it in the config like this: const isDev = process.env.NODE_ENV === 'development'; viteLazyCssInliner({ isDev })`);
            }
        },

        buildStart() {
            // Reset state to avoid memory leaks in dev mode
            if (isDev) {
                dynamicRoots.clear();
                lazyGraph.clear();
            }
        },

        async resolveDynamicImport(specifier, importer, resolveOpts) {
            // Mark modules that are dynamically imported as dynamic roots
            // Notes:
            // - specifier can be a string literal or an AST node; we only process string literals
            // - we only need this on the SSR pass; on client we infer roots from getModuleInfo
            const isSpecifierIsString = typeof specifier === 'string';
            const shouldSkipDynamicImport = !isSSRBuild || !isSpecifierIsString;

            if (shouldSkipDynamicImport) {
                return null;
            }

            const resolvedModule = await this.resolve(specifier, importer, {
                ...resolveOpts,
                // skipSelf: exclude current plugin from resolution to avoid self-recursion
                skipSelf: true,
            });

            const shouldMarkAsDynamic =
                resolvedModule &&
                !resolvedModule.external &&
                isAllowPath(resolvedModule.id, includedPathes, excludedPathes);

            if (shouldMarkAsDynamic) {
                markDynamicModule(resolvedModule.id, dynamicRoots, lazyGraph, true);
            }

            return null;
        },

        // When the importer already belongs to a lazy subtree, treat its children accordingly:
        //  - If the child is a CSS file, rewrite its id to a virtual CSS id so the default Vite CSS pipeline
        //    is bypassed. This prevents the child's styles from being included in the page-level CSS bundle.
        //    That CSS will later be read and inlined into a <style> tag at runtime by the client-side `load` hook.
        //  - If the child is NOT CSS, mark it as part of the lazy graph so the laziness propagates further
        //    down the dependency tree. This keeps the entire subtree isolated from page CSS collection.
        async resolveId(source, importer, resolveOpts) {
            // Only handle string imports with a concrete importer (skip entries)
            if (!importer || typeof source !== 'string') {
                return null;
            }

            const importerId = normalizeId(importer);

            if (!isAllowPath(importerId, includedPathes, excludedPathes)) {
                return null;
            }

            const importerIsLazy = lazyGraph.has(importerId) || dynamicRoots.has(importerId);

            if (!importerIsLazy) {
                return null;
            }

            const resolvedModule = await this.resolve(source, importer, {
                ...resolveOpts,
                // Avoid self-recursion and double-processing of the same id
                skipSelf: true,
            });

            if (!resolvedModule) {
                return null;
            }

            if (!isAllowPath(resolvedModule.id, includedPathes, excludedPathes)) {
                return null;
            }

            // Propagate laziness for children (not roots)
            const childModuleId = markDynamicModule(resolvedModule.id, dynamicRoots, lazyGraph, false);

            if (isCssFile(childModuleId)) {
                return VIRTUAL_PREFIX + childModuleId + '.js';
            }

            return childModuleId;
        },

        // Detect dynamic roots by checking getModuleInfo().dynamicImporters.
        // Note: moduleInfo.dynamicImporters is an array of module ids that import current id via import().
        transform(_code, id) {
            if (!isAllowPath(id, includedPathes, excludedPathes)) {
                return null;
            }

            if (!this.getModuleInfo) {
                return null;
            }

            let moduleInfo: ModuleInfo | null = null;

            try {
                moduleInfo = this.getModuleInfo(id);
            } catch {
                return null;
            }

            // A module is a dynamic root if at least one other module imports it via import().
            const dynamicImporters = (moduleInfo?.dynamicImporters ?? []) as string[];
            // Some module import current module via dynamic import.
            const hasDynamicImporters = Array.isArray(dynamicImporters) && dynamicImporters.length > 0;

            if (hasDynamicImporters) {
                // Client-side detection of dynamic root
                markDynamicModule(id, dynamicRoots, lazyGraph, true);
            }

            return null;
        },

        // Serve virtual CSS modules:
        //  - On SSR: return an empty module so these styles are not collected into the page CSS bundle.
        //  - On client: read the original CSS from disk, apply CSS Modules hashing using Vite's css.modules
        //    config (to keep classnames consistent), minify in production, inject a <style> tag into <head>,
        //    and export tokens for *.module.css so the component can use hashed classnames.
        async load(id) {
            const isVirtualModule = id.startsWith(VIRTUAL_PREFIX);

            if (!isVirtualModule) {
                return null;
            }

            if (isSSRBuild) {
                return 'export default {}';
            }

            // Extract original CSS id from a virtual id like "\0lazy-dyn-css:<abs>.css.js"
            const originalId = getOriginalIdFromVirtual(id);

            if (!isAllowPath(originalId, includedPathes, excludedPathes)) {
                return null;
            }

            try {
                const { css, tokens } = await processCss(originalId, cssModulesConfig, isDev!);
                return await generateVirtualModuleCode(css, tokens, originalId, isDev!);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                this.error(`[lazy-css-modules-inliner: load] Failed to load CSS for: ${originalId}: ${msg}`);
            }
        },

        // Strip deps from __vitePreload calls to prevent duplicate loading chunks (avoid issue with loading page CSS|JS)
        renderChunk(code, chunk) {
            const isChunk = chunk.type === 'chunk';
            const hasVitePreload = code.includes('__vitePreload(');

            if (isSSRBuild || !isChunk || !hasVitePreload) {
                return null;
            }

            if (!hasAllowedModule(chunk, includedPathes, excludedPathes)) {
                return null;
            }

            let ast: ProgramNode;

            try {
                ast = this.parse(code);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                this.warn(`[lazy-css-modules-inliner: renderChunk] failed to parse ast for ${chunk.name}: ${msg}`);
                return null;
            }

            const codeMagicString = new MagicString(code);

            walk(ast, {
                enter: (node) => stripPreloadDeps(node, code, stripPreloadDepsMode, codeMagicString),
            });

            if (codeMagicString.hasChanged()) {
                return {
                    code: codeMagicString.toString(),
                    map: codeMagicString.generateMap({ hires: true }),
                };
            }

            return null;
        },
    };
}
 

