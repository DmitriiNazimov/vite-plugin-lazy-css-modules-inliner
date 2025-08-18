# vite-plugin-lazy-css-modules-inliner

Note: A Russian version of this README is available below.

A Vite plugin that enables true on-demand CSS for dynamically imported code by virtualizing CSS Modules. It prevents lazy components' styles from being bundled into the page CSS and injects them only when the corresponding JS is loaded.

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

## How it works (build pipeline)

1. Detect dynamic roots
    - SSR: `resolveDynamicImport` marks `import()` targets as roots
    - Client: `transform` reads `getModuleInfo(id).dynamicImporters` and marks such modules as roots
2. Propagate laziness
    - `resolveId` marks children of lazy importers as part of the lazy graph and reroutes CSS imports to virtual modules
3. Virtual CSS modules
    - SSR `load`: returns an empty module — styles are not collected into page CSS
    - Client `load`: reads CSS, applies `postcss-modules` (tokens), minifies with `cssnano` in prod, injects `<style data-lazy-css-id="...">`
4. Strip CSS deps from `__vitePreload`
    - `renderChunk` wraps deps array so `.css` entries are filtered out

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

- Mixed static + dynamic imports of the same module can duplicate CSS by design. Prefer picking one strategy or accept the trade‑off (warning in build output).
- Above‑the‑fold dynamic modules will inject CSS very early — consider static import instead.

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
            stripPreloadDepsMode: 'css',
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

Плагин Vite, виртуализирующий CSS Modules для динамически импортируемого кода. Стили ленивых модулей не попадают в общий CSS страницы и инжектятся только при загрузке соответствующего JS.

## Поддержка

- Vite (vanilla)
- Astro + Vite
- React / Vue / Svelte — при подключении `*.module.css`

Ограничения: встроенные стили SFC (`<style>` внутри `.svelte`/`.vue`) вне зоны ответственности.

## Цели

- Держать страничный CSS чистым от стилей ленивых модулей
- Грузить JS+CSS одним чанком по требованию
- Сохранять консистентность хэшей CSS Modules между SSR и клиентом
- Удалять `.css` из `__vitePreload` в динамических чанках

## Как работает

1. Определение корней динамики: SSR — `resolveDynamicImport`, клиент — `transform`/`dynamicImporters`
2. Распространение «ленивости»: `resolveId` помечает потомков и перенаправляет CSS на виртуальные модули
3. Виртуальные CSS‑модули: SSR — пустой экспорт, клиент — `<style data-lazy-css-id="...">` + tokens
4. Чистка `__vitePreload`: удаляем `.css` из deps

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

- Смешение статического и динамического импорта одного модуля может привести к дублям CSS — это ожидаемо. Лучше выбрать один подход.
- Для блоков «над сгибом» лучше статический импорт — динамика инжектит CSS позднее.

## Примеры

См. секцию выше для vite/astro конфигураций.
