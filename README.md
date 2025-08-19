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

Ниже — краткая «дорожная карта» того, что делает плагин на разных стадиях:

1. Находим «ленивые корни» (dynamic roots)
   - На SSR: хук `resolveDynamicImport` перехватывает `import()` и помечает цель импорта как корень ленивого подграфа.
   - На клиентской сборке: хук `transform` анализирует `getModuleInfo(id)` и:
     - если у модуля есть `dynamicImporters` — он является целью чьего‑то `import()` → тоже корень;
     - дополнительно продвигает `dynamicallyImportedIds` в корни (дети по динамическим рёбрам).

2. Распространяем «ленивость» вниз по зависимостям
   - В `resolveId` если импортёр уже внутри ленивого подграфа, то все его дочерние зависимости становятся «ленивыми» тоже.
   - Для CSS внутри такого подграфа мы не отдаём обычный CSS‑модуль; вместо этого возвращаем виртуальный JS‑модуль (см. п.3).
   - Для не‑CSS ничего не ломаем: возвращаем исходный `resolvedModule.id` (сохраняются query вида `?url`, `?raw`).

3. Генерируем виртуальные CSS‑модули
   - На SSR: `load()` возвращает пустой модуль, чтобы стили не попали в общий CSS страницы.
   - На клиенте: `load()` читает исходный `.css`, при необходимости применяет `postcss-modules` (получаем tokens), минимизирует в проде и генерирует JS‑модуль, который:
     - импортирует общий рантайм из `lazy-css-inliner:runtime`;
     - если это обычный CSS — сразу вызывает `ensureLazyCssInjected(id, css)` (синхронная вставка `<style data-lazy-css-id="...">` в `<head>`);
     - если это CSS Modules — экспортирует `Proxy` над tokens; инъекция выполняется один раз при первом обращении к любому токену.

4. Контролируем прелоад зависимостей
   - В `renderChunk` можно удалять `.css` из массива зависимостей `__vitePreload` (режим `'css'`) либо вычищать все deps (режим `'all'`). Это помогает избежать преждевременных подгрузок.

Важно про чанки: виртуальный код CSS может оказаться внутри «родительского» чанка в результате сплиттинга Rollup. Это не приводит к ранней инъекции — вставка стилей происходит только в момент выполнения виртуального модуля (или при первом доступе к токенам CSS Modules). Если нужно жёстко развести домены, используйте `build.rollupOptions.output.manualChunks`.

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
