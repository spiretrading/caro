# Caro

An editor for authoring UI layout specifications, replacing Adobe XD.

## Why

Specifications are currently drawn in Adobe XD and their meaning is recovered
afterwards by geometric and colour heuristics. The drawing is the source of
truth and the model is derived from it, so the derivation is lossy: 8 of the
117 `layout.xd` files in the specification set cannot be read at all, and at
least one media query has been silently dropped from a spec that does parse.

Caro inverts the direction. The model is the source of truth and the picture
is rendered from it. That transform is total, so nothing has to be guessed.

## Decisions

**A web app.** Specifications target CSS layout: `@media`, `@container`,
`dvh`, `calc()`, `aspect-ratio`. A browser previews them with the real engine
rather than an approximation, and the same preview can reuse `dali`. The app
runs locally against the file system and needs no server. Packaging it in
Tauri later requires no change to the code.

**TypeScript and React 17**, matching the conventions and versions used by
the Web Portal, so `dali` drops in unchanged.

**Draw, then snap.** A drawn rectangle is resolved into a tree edit at the
moment of the gesture, while the enclosing cell, the drag origin and the
nearby edges are all still known. The document is always a valid tree; there
is no state holding an unreconciled rectangle. Gaps between siblings become
spacer nodes automatically.

**A hierarchical file format.** Layouts are trees of rows and columns rather
than absolute coordinates, matching what `dali`, flexbox and Qt box layouts
all implement. Coordinates become derived rather than authored, so diffs are
structural and small. All 735 frames across the 109 readable specifications
convert to this form without a single failure.

## Building

    npm install
    npm run build
    npm start

`npm start` serves the app on `http://localhost:8080`. It must be served over
localhost or https: the File System Access API is unavailable on `file://`,
and is only implemented by Chrome and Edge.

## Using

Click **Open specifications** and choose a directory. Caro walks it for
`layout.json` files. Files in the legacy flat box format emitted by
`xd_parser` are converted on load, so existing specifications open directly;
saving writes them back in the hierarchical format.

## Format

    Board
      name: string
      components: Component[]        innermost first
        name: string                 'Element:Name' or 'Name'
        layouts: Layout[]            ascending priority
          condition: string          empty for the default
          constraints: string
          root: Node
          overlays: Node[]           ascending layer order

A `Node` is one of:

- `container` -- `orientation` of `row` or `column`, plus `children` in
  visual order.
- `reference` -- a `name` naming another component in the board.
- `spacer` -- empty space between siblings.

Every node carries a `width` and `height` in pixels as drawn, a
`widthPolicy` and `heightPolicy` of `fixed`, `flexible`, `component` or
`repeat`, and an optional `repeatDirection`.

Layouts replace one another wholesale when their condition is met; they do
not inherit. This differs from component scenarios, which accumulate.

## Status

The model, the file format, the legacy importer and local load and save are
in place. The editing canvas is not: the app currently displays a
specification as an outline rather than letting you draw one.
