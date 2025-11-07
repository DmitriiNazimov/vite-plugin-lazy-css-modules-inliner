import { AcceptedPlugin } from 'postcss';
import { CSSModulesOptions } from 'vite';

export type StripPreloadDepsMode = 'all' | 'css';

export interface PluginOptions {
    stripPreloadDepsMode?: StripPreloadDepsMode;
    isDev?: boolean;
    includedPathes?: string[]; // absolute paths to include (e.g. [path.join(root,'src')])
    excludedPathes?: string[]; // absolute (or substring) paths to exclude (e.g. ['node_modules'])
    runtimeIsRtlCondition?: string; // condition to check if rtl is enabled in runtime in browser (example: 'window.isRtl')
}

export interface ProcessCssResult {
    css: string;
    tokens: Record<string, string>;
}

export interface ProcessCssParams {
    originalId: string;
    cssModulesConfig: CSSModulesOptions | undefined | false;
    postcssPlugins: AcceptedPlugin[];
    hasRtl?: boolean; // when true, apply rtlcss before cssnano
}
