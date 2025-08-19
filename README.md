# vite-plugin-lazy-css-modules-inliner

Note: A Russian version of this README is available below.

A Vite plugin that enables true on-demand CSS for dynamically imported code by virtualizing CSS Modules. It prevents lazy components' styles from being bundled into the page CSS and injects them only when the corresponding JS is actually used.

## Installation

`npm i vite-plugin-lazy-css-modules-inliner --save-dev`

Example of usages see in section `Examples`.

## Supported stacks

- Vite (vanilla)
- CSS-modules
- Astro + Vite
- React / Vue / Svelte — when styles are imported as external `*.module.css`

Limitations: native SFC styles (`<style>` inside `.svelte`/`.vue`) are out of scope.

## Goals

- Keep page (synchronous) CSS clean from lazy modules' styles
- Load lazy JS + CSS together on demand
- Preserve CSS Modules hashing consistency between SSR and client
- Avoid preloading page CSS/JS from `__vitePreload` in dynamic chunks

## How it works (build pipeline and runtime)

1. Detect dynamic roots
    - SSR: `resolveDynamicImport` marks `import()` targets as roots
    - Client: `transform` uses `getModuleInfo(id).dynamicImporters` and also promotes `dynamicallyImportedIds` as roots
2. Propagate laziness
    - `resolveId` treats children of lazy importers as part of the lazy graph
    - CSS imports inside the lazy graph are rerouted to virtual JS modules
3. Virtual CSS modules
    - SSR `load`: returns an empty module — styles are not collected into the page CSS bundle
    - Client `load`:
        - reads CSS, applies `postcss-modules` if needed, minifies with `cssnano` in prod
        - generates a virtual JS module that imports a shared runtime (`lazy-css-inliner:runtime`)
          and either:
            - plain CSS: calls `ensureLazyCssInjected(id, css)` immediately
            - CSS Modules: exports a Proxy that injects CSS only on the first token access
4. Strip CSS deps from `__vitePreload`
    - `renderChunk` filters out `.css` entries when `stripPreloadDepsMode: 'css'` (or all deps when `'all'`)

Note about bundling: virtual CSS code can still end up inside a shared parent chunk depending on Rollup splitting. This does not inject styles early — injection happens only when the virtual module executes (or when CSS‑Module tokens are accessed). If you want stricter chunk boundaries, add simple `manualChunks` rules in your Vite config.

## Options

```ts
export type StripPreloadDepsMode = 'all' | 'css';

export interface PluginOptions {
    stripPreloadDepsMode?: StripPreloadDepsMode; // default: 'css'
    isDev?: boolean; // dev switch (sourcemaps/minify)
    includedPathes?: string[]; // roots to include; default: [path.join(root,'src')]
    excludedPathes?: string[]; // paths to exclude; default: ['node_modules']
}
```

Defaults are applied at `configResolved` when not provided.

## Diagnostics

- Mixed static + dynamic imports of the same module can duplicate CSS by design. Prefer picking one strategy or accept the trade‑off.
- Above‑the‑fold dynamic modules will inject CSS very early — consider static import instead.
- If virtual CSS appears in a shared parent chunk, consider `build.rollupOptions.output.manualChunks` to separate domains (dialogs, overlays, etc.).

## Examples

- vite.config.ts

```ts
import { defineConfig } from 'vite';
import { viteLazyCssInliner } from 'vite-plugin-lazy-css-modules-inliner';
import path from 'node:path';

export default defineConfig({
    plugins: [
        viteLazyCssInliner({
            includedPathes: [path.join(process.cwd(), 'src')],
            excludedPathes: ['node_modules'],
            stripPreloadDepsMode: 'css', // or 'all' to disable all __vitePreload deps
            isDev: process.env.NODE_ENV === 'development',
        }),
    ],
});
```

- astro.config.mjs

```js
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { viteLazyCssInliner } from 'vite-plugin-lazy-css-modules-inliner';
import path from 'node:path';

export default defineConfig({
    integrations: [svelte({ emitCss: false })],
    build: { inlineStylesheets: 'never' },
    vite: {
        plugins: [
            viteLazyCssInliner({
                includedPathes: [path.join(process.cwd(), 'src')],
                excludedPathes: ['node_modules'],
                stripPreloadDepsMode: 'css',
                isDev: process.env.NODE_ENV === 'development',
            }),
        ],
    },
});
```

---

# vite-plugin-lazy-css-modules-inliner (Русская версия)

Плагин Vite, виртуализирующий CSS Modules для динамически импортируемого кода. Стили ленивых модулей не попадают в общий CSS страницы и инжектятся только при фактическом использовании соответствующего кода.

## Установка

`npm i vite-plugin-lazy-css-modules-inliner --save-dev`

Примеры использования см. в секции `Examples`.

## Поддержка

- Vite (vanilla)
- Astro + Vite
- React / Vue / Svelte — при подключении `*.module.css`

Ограничения: встроенные стили SFC (`<style>` внутри `.svelte`/`.vue`) вне зоны ответственности.

## Цели

- Держать страничный CSS чистым от стилей ленивых модулей
- Грузить JS+CSS по требованию
- Сохранять консистентность хэшей CSS Modules между SSR и клиентом
- Удалять `.css` из `__vitePreload` в динамических чанках

## Как работает (пайплайн и рантайм)

1. Определение корней динамики: SSR — `resolveDynamicImport`, клиент — `transform`/`dynamicImporters` + продвижение `dynamicallyImportedIds`
2. Распространение «ленивости»: `resolveId` помечает потомков; CSS в «ленивом» подграфе превращаются в виртуальные JS‑модули
3. Виртуальные CSS‑модули:
    - SSR — пустой модуль (ничего не собирается в общий CSS)
    - Клиент — импорт общего рантайма (`lazy-css-inliner:runtime`) и:
        - для обычного CSS — немедленная инъекция через `ensureLazyCssInjected`
        - для CSS Modules — экспорт Proxy, инъекция при первом доступе к токенам
4. Чистка `__vitePreload`: фильтруем `.css` из deps (или все deps при режиме `'all'`)

Замечание про чанки: виртуальный CSS‑код может оказаться в «родительском» чанке из‑за стратегии сплиттинга Rollup. Это не приводит к ранней инъекции — вставка стилей происходит только при выполнении виртуального модуля (или при первом обращении к токенам). Для более строгого разделения используйте `manualChunks`.

## Опции

```ts
export interface PluginOptions {
    stripPreloadDepsMode?: 'css' | 'all'; // по умолчанию 'css'
    isDev?: boolean; // dev‑режим
    includedPathes?: string[]; // директории для обработки; по умолчанию [root/src]
    excludedPathes?: string[]; // исключения; по умолчанию ['node_modules']
}
```

Значения по умолчанию подставляются в `configResolved`, если опции не заданы.

## Диагностика

- Смешение статического и динамического импорта одного и того же модуля может привести к дублям CSS — это ожидаемо. Лучше выбрать один подход.
- Для блоков «над сгибом» лучше статический импорт — динамика инжектит CSS позднее.
- Если виртуальный CSS попадает в общий чанк — настройте `manualChunks` (например, разнести диалоги, оверлеи по отдельным чанкам).

## Примеры

См. секцию выше для vite/astro конфигураций.
