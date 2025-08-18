export type StripPreloadDepsMode = 'all' | 'css';

export interface PluginOptions {
    stripPreloadDepsMode?: StripPreloadDepsMode;
    isDev?: boolean;
    includedPathes?: string[]; // absolute paths to include (e.g. [path.join(root,'src')])
    excludedPathes?: string[]; // absolute (or substring) paths to exclude (e.g. ['node_modules'])
}

export interface ProcessCssResult {
    css: string;
    tokens: Record<string, string>;
}
 

