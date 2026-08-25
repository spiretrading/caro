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

The app opens on an empty specification, ready to draw, with New, Open and
Save on the toolbar. Drag on empty space to draw a box, drag an existing box
and it follows the cursor while the layout reflows live around a phantom of
it, and drag a box's border to resize it, or a corner to resize both axes at
once.
Escape cancels a gesture. Delete or Backspace removes the selected box, as
does the control on the box itself and the button in the properties panel. A
box carries its name centred as `<Name>` and shows nothing when unnamed; the
properties panel names the selection and sets each of its axes to fixed or
expanding.

Dropping a box against the top or bottom of another places it as a sibling;
dropping against the left or right nests both into a row, and the reverse
inside a row. Containers left holding a single child collapse, and a root left
wrapping a lone container absorbs it, so the tree stays canonical no matter how
much a box is dragged around.

A drag holds its placement while the cursor is over the box being dragged,
never guesses at a nearest box while a box is under the cursor, and will not
undo a placement until the cursor has travelled far enough to mean it. Without
those rules a drag into an edge zone oscillates: nesting two boxes into a row
halves their width, which moves the geometry out from under the cursor, which
nests it somewhere else.

Edge zones are a quarter of a box's edge, floored at 12px and capped at 64px,
so the zones that nest a box beside another are reachable on a short edge and
do not swallow the middle of a long one. Dragging into empty space attaches to
whichever box is nearest, on the side the cursor lies beyond, so a box can be
pulled out of a row by dragging below it.

A drawn box resolves against the centre of the rectangle drawn, not against
the cursor, which would otherwise land in a neighbour's edge zone and nest the
box instead of stacking it.

A box dropped across its neighbour's axis attaches beside the container rather
than beside the neighbour alone, whenever the neighbour spans that container.
Every child of a column spans its width, so the right edge of a box and the
right edge of the column are the same edge, and pairing with the box alone
would leave the column's other children stranded beside a container sized to
its largest member. Whether a box spans is measured against its siblings and
ignores the box being moved, since the container's own size still counts the
box that is about to leave it. A box smaller than its siblings still pairs
with its neighbour, which is how a label and its field end up side by side.

Still missing: spacers are never generated for the gaps between boxes, only
leaves are drop targets, and there is no undo beyond cancelling a gesture in
progress.
