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
is no state holding an unreconciled rectangle. Empty space is drawn as a box
like anything else, one left unnamed; caro never conjures a box to fill a gap
it finds, because a gap is a mistake to be reported rather than papered over.

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

Click **Open** and choose a specification. A file in the legacy flat box
format emitted by `xd_parser` is converted on load, so an existing
specification opens directly; **Save** writes it back in the hierarchical
format, asking where to put a specification that has no file yet.

## Format

    Board
      name: string
      components: Component[]        outermost first
        name: string                 'Element:Name' or 'Name'
        layouts: Layout[]            ascending priority
          condition: string          empty for the default
          properties: string         free text, may be empty
          root: Node
          overlays: Node[]           ascending layer order

A `Node` is one of:

- `container` -- `orientation` of `row` or `column`, plus `children` in
  visual order.
- `reference` -- a `name` naming another component in the board.
- `spacer` -- empty space between siblings.

Every node carries a `width` and `height` in pixels as drawn, a
`widthPolicy` and `heightPolicy` of `fixed`, `fill`, `fit` or `repeat`, and
an optional `repeatDirection`.

A `fixed` size is a literal value taken from the visual, a `fill` size takes
the available space and shares it equally between siblings, and a `fit` size
is determined by the contents. The terms and their meanings come from
https://wiki.spiretrading.com/index.php/Layout; the colours come from
`xd_parser`, which decodes the drawings themselves: yellow `fixed`, blue
`fill`, green `fit`, purple `repeat`.

Layouts replace one another wholesale when their condition is met; they do
not inherit. This differs from component scenarios, which accumulate.

## Status

The app opens on an empty specification, ready to draw, with New, Open and
Save on the toolbar. Open and Save work on a single file rather than a folder.

The section picker names the section being edited and chooses among the
others: the field renames, the chevron opens the list. It is one control
rather than a dropdown paired with a text field, which showed the same name
twice, and rather than an input backed by a datalist, which cannot tell
picking a name from typing one, and section names may repeat. Controls beside
it add and delete a section; a new one is inserted after the selected section,
next to whatever it was added for. Sections are edited one at a time, so their
order is never on screen and there is nothing to reorder.

Sections run outermost first, so a specification opens on its page rather than
on some leaf buried inside it. The legacy format lists them the other way
round, innermost first, because that is the order the cards are stacked down
an XD board; the importer reverses them.

A section's scenarios are laid out side by side, as the XD boards draw them.
The leftmost is the default: it always exists, carries no condition, and
cannot be moved or deleted, because evaluation runs right to left and takes
the first match, so anything to the default's left could never be reached.
Every other scenario carries a condition written as free text and can be
reordered or deleted. Conditions are not parsed: a selector means something
different to a web target than to a Qt one, and the condition is a field on
the scenario rather than a label floating beside it, which is what made them
losable in XD.

A blank scenario always waits past the default, from the moment a
specification is started. Drawing into it or naming its condition puts another
blank beside it, so there is no button to press and
no empty scenario to clean up. The waiting blank cannot be moved or deleted,
and it is dropped when the specification is written out: carrying no
condition, a saved blank would match everything and, sitting last, would take
precedence over every scenario before it.

A scenario may carry layers: frames superimposed on its layout, occupying the
same space. Each is drawn on a canvas of its own below the layout it covers,
captioned and deleted on its own, which is how the XD boards stack them and
the only arrangement that leaves both of them somewhere to be drawn into. 20
of the 709 layouts in the existing specifications carry one, 26 layers in all,
and they are nearly always the same shape: an unnamed box taking the room and
a named component pinned to the edge it leaves over, which is how a
specification says an action sheet or a save bar floats above a page. A layer
is a tree of its own, so a box drawn into one is drawn into that one alone and
deleting it leaves the layout beneath untouched.

What order they stack in is not settled. Caro numbers them upwards from the
layout and takes a later one to be drawn over an earlier one; the wiki
describes layers as a z-priority indexed from zero, where a lower number takes
priority, which is the opposite. Nothing composites them yet, so nothing turns
on the answer until something does.

Below each scenario's canvas sit its properties, the part of a layout that the
tree cannot express, written as free text and stored verbatim. About a sixth
of the layouts in the existing specifications carry a block, most of them a
line or two, either properties of the layout itself or properties indented
under the name of one of its boxes. They are not called constraints: the tree
already carries the layout's constraints in its policies and sizes, and only
about half of what these blocks hold constrains anything, the rest binding
content, animating, or positioning. They are not parsed either, because a
value reaches across the specification and into runtime state, naming another
component's height, a scroll extent, or a slot to fill, and a field that
refuses what a designer needs to write is worse than no field at all. They
belong to the scenario and not to the section because they differ between
scenarios, which is how a collapse is written: a box bounded by its contents
under one condition and by nothing under another. The waiting blank carries no
properties field, so touching a blank scenario always means drawing into it.

Scenarios are independent. Only one is ever laid out at a time, and editing
one never touches another. A scenario's canvas
grows with its contents and never falls below a floor, so a blank one still
has room to draw into. Drag on empty space to draw a box, drag an existing box
and it follows the cursor while the layout behind it settles into what the
drop would make of it,
and drag a box's edge to resize it, or a corner to resize both axes at once,
down to a single pixel; a box you want gone is deleted rather than collapsed.

The boundary between two boxes belongs to both of them, so dragging it is a
splitter: one box grows by exactly what the other gives up and the total is
unchanged, clamping when either reaches a pixel. Because both sizes are
computed from the extents captured when the drag began, dragging past the
clamp and back restores them exactly. Only the outer edges of a stack resize
a box on their own, and they grow the container with it. An edge with nothing
across it offers no handle at all rather than a control that silently moves
the opposite edge: the leading edge of a first child, every cross-axis leading
edge, and any boundary against a container, whose size is derived from its
contents and would be overwritten. A resize never changes a policy; size and
policy are independent.
While a box is moved or resized, any edge of it that lines up with an edge of
another box draws a red line across the canvas along that edge, and every box
that line touches is tinted and outlined so it is clear which boxes the line
connects. A drag measures the box where it actually is, under the cursor,
never where it would land if let go. Those are the same box, and a box cannot
be aligned with itself: measuring the landing place drew a guide between the
box and its own preview, and drew it always, since a box that has landed meets
its neighbours by construction. Overlays are
positioned against the canvas's padding box rather than its bounding
rectangle, since an absolutely positioned child measures from inside the
border; measuring from the bounding rectangle draws every overlay a border
width off. Escape cancels
a gesture. Delete or Backspace removes the selected box, as
does the control on the box itself and the button in the properties panel. A
press anywhere clears the selection, except on a box or inside the properties
panel, which keeps it because its Delete button acts on it; Escape clears it
too once no gesture is running. A press outside the field holding focus drops
that focus, so a box picked after typing in a condition or a properties block
still answers the keyboard, which it otherwise would not: the canvas
suppresses the default on its presses, and that leaves focus sitting in the
field. A box carries its name centred as `<Name>` and shows nothing when
unnamed; the properties panel names the selection and sets each of its axes to
fixed, fill or fit, each choice carrying the colour it paints the box.

Shift and a press adds a box to the selection or takes it back out, and what
is selected is then moved, deleted and resized as one. A selection stays
within a single canvas, because a gesture does. The properties panel steps
aside while more than one box is selected: a name, a size and a pair of
policies describe one box and say nothing of several.

Moving several of them is a move. They need not be siblings or even share a
container: they are measured where they lie, lifted out, rebuilt into one node
arranged the way they were drawn, and dropped the way a single box is dropped.
The rebuilding is the same cut into rows and columns that reads the legacy
format, which is why it needs no rules of its own. A group landing somewhere
that runs the same way as itself is spliced in rather than nested, so dragging
the same boxes twice does not bury them a level deeper each time. What follows
the cursor is the group as it stands, each of its boxes drawn at its own size,
rather than one rectangle the size of all of them: the point of picking up
several boxes is that you can still tell which ones you have.

Resizing several of them treats them as one box. The selection's bounds are
the union of what is in it, and dragging an edge of that rectangle moves only
the boxes sitting on it: the right edge widens the right-most boxes and leaves
the rest as they are, the bottom edge lowers the bottom-most. A corner does
both. Boxes inside the group never take room from one another, so the splitter
applies exactly where the group meets what lies outside it, and a box that
does not reach the edge being dragged is left alone.

Dropping a box against the top or bottom of another places it as a sibling;
dropping against the left or right nests both into a row, and the reverse
inside a row. Containers left holding a single child collapse, and a root left
wrapping a lone container absorbs it, so the tree stays canonical no matter how
much a box is dragged around.

A drag shows what dropping would do. The box travels with the cursor and the
layout behind it reflows into the arrangement it would have on release, so
what is on screen when the button comes up is what stays.

Doing that used to be a fight. A box nested into a row halves its width, that
moves the geometry out from under the cursor, the cursor is then over
something else, and that nests it somewhere else again. Damping held it down
-- a settle distance, a reversal distance, a test for whether a box was
already where it was about to be put -- and all of it was treating a symptom.
What actually cures it is resolving the drag against geometry held still from
the moment the box was picked up: the reflow moves the boxes, but not the
rectangles the placement is computed from. The loop is cut rather than
damped, so the placement cannot change unless the cursor does, and nesting two
full width boxes into a row and halving both of them leaves the drag exactly
where it was.

Where a box lands is decided by the middle of the box rather than by the
cursor, and it goes on the side of its new neighbour that it came from: the
larger of the two distances between the centres picks the axis, and its sign
picks the side. Dragging one box onto another therefore pushes that one aside
in the direction of travel. The same rule reads a drawn rectangle, from the
middle of what was drawn. Nothing is measured against edge zones any more,
which is why the middle of a box is no longer a dead spot that stacks when you
meant to nest.

Canvases magnify from their literal size up to ten times it, stepped from the
toolbar or with the wheel held under control. Magnification is a property of
the board rather than of one scenario, since scenarios sit side by side to be
compared and only one of them fits on screen magnified anyway. The canvas
alone magnifies; the condition and properties fields beside it are controls
rather than drawing, and a text field at ten times helps nobody.

The picture scales; the model does not. A canvas is magnified with CSS `zoom`
rather than a transform, so it occupies the space it is drawn at instead of
overrunning its card, and every hit test keeps comparing a cursor against a
rectangle in the same screen coordinates. What that leaves is the handful of
places where a distance on screen becomes a size in the model: the rectangle a
box is drawn at, the distance an edge is dragged, the extents a splitter
captures when it takes hold, and the offsets the guides, the drop marker and
the rubber band are positioned by. Each divides by the magnification. The
thresholds do not, and should not: a grab margin is eight pixels of screen
whatever the canvas is magnified to, which is what makes a box a single pixel
tall reachable at all -- at ten times it is ten pixels of screen, and ten
pixels of drag move it by exactly one.

Ten times is where the range stops because that is far enough to work a single
pixel comfortably, not because anything gives way there. The name is asked for
a font of 1.2 pixels and is given one, coming back about three percent narrow
from the rounding; everything else measures the same as it does at one.

Names, the prompt on an empty canvas and the control that deletes a box are
drawn at a fixed size on screen instead of being magnified with the drawing.
A name longer than its box is cut off, and since magnifying grows the box on
screen while leaving the name alone, magnifying is how the rest of it is read.
Magnifying the name along with the box would hold the two in the same
proportion and reveal nothing. It also keeps the delete control the size of a
control: the room a box needs to carry one is measured in screen pixels, so a
box magnified until it has room now draws one that fits in it.

Magnifying holds still whatever sits under the cursor, or under the middle of
the board when the toolbar drives it. It does that by measuring the element
under that point before and after, and correcting the scroll by the
difference, rather than by scaling the scroll offset: only the canvases
magnify, so scaling the offset threw the board off screen.

A box drawn across most of the canvas is taken to fill it, but only up to the
canvas itself: drawn past the edge it is fixed at the size it was drawn, and
the section grows to hold it. Filling more than the space available is not a
thing a box can be asked to do, and a fill renders free to shrink, so calling
an oversized draw a fill squeezed the new box back to the space already
there -- leaving the size in the properties panel disagreeing with the
picture.

A box dropped across its neighbour's axis attaches beside the container rather
than beside the neighbour alone, whenever the neighbour spans that container.
Every child of a column spans its width, so the right edge of a box and the
right edge of the column are the same edge, and pairing with the box alone
would leave the column's other children stranded beside a container sized to
its largest member. Whether a box spans is measured against its siblings and
ignores the box being moved, since the container's own size still counts the
box that is about to leave it. A box smaller than its siblings still pairs
with its neighbour, which is how a label and its field end up side by side.

A gap is empty space nothing accounts for, and a layout is not allowed one.
They can only open across a container's cross axis, because `normalize` sizes
a container by summing its children along the main axis and taking the largest
of them across it: siblings always tile the length of a row, but a child
shorter than the tallest one leaves the difference empty beside it. Caro
neither prevents this nor fills it in. Filling it in would invent a box the
designer did not draw, and preventing it would move a box they did, so a gap
stands until the validation view reports it -- the check being that every
child spans its container's cross axis, and the report naming the box and how
much room it leaves over.

Still missing: only leaves are drop targets, and there is no undo beyond
cancelling a gesture in progress.
