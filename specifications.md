# Reading a layout.json

This describes the file caro writes, so that anyone picking one up -- a
person, or an agent asked to build from it -- can read it without opening the
editor. For the drawings these files are converted from, and the colour key
the drawings use, see `xd_parser`'s own `specifications.md`.

A specification says how a screen is divided, not what it looks like. It
names regions, says where they sit and how each is sized, and says how the
division changes with the state of the application or the width of the
window. Everything else -- what a region contains, how it is styled, what it
is bound to -- lives in the component specification and the model beside it.

## The two formats

Caro reads two files and writes only the first.

**Its own**, described here, with `widthPolicy`, `properties` and `overlays`.

**The flat format `xd_parser` emits**, with `width_policy`, `constraints` and
`frame`, which caro converts on opening. The conversion renames the policies
(`flexible` becomes `fill`, `component` becomes `fit`), drops the `@`-prefixed
names the parser gives unnamed boxes, and **reverses the order of the
sections**: the flat format lists them innermost first, because that is how
the drawings are stacked down a board, while caro starts from the outermost
and works inwards.

Saving always writes caro's format. A file that has been opened and saved is
no longer in the flat one.

## Structure

    Board
      name: string
      components: Component[]        outermost first
        name: string                 'Element:Name' or 'Name'
        layouts: Layout[]
          condition: string          empty for the default
          properties: string         free text, may be empty
          boxes: Box[]
          overlays: Box[][]          ascending layer order
            name: string             empty when the box is only space
            x, y: number             pixels from the layout's top left
            width, height: number    pixels as drawn
            widthPolicy: string      fixed | fill | fit | repeat
            heightPolicy: string     fixed | fill | fit | repeat
            repeatDirection: string  left | right | up | down, absent
                                     unless the box repeats

## Sections

Each entry in `components` is a named region. The name is either `Name` or
`Element:Name`, where the element type says what kind of thing the region is
in the target -- `Div:Content`, `Section:SubmissionBlock`. Strip the prefix
to get the name a box refers to.

**Sections run outermost first.** The first is the page or the widget as a
whole; the last is a leaf. A specification therefore opens on the thing it is
about rather than on some fragment buried inside it.

**A named box refers to a section by its bare name.** `Content` refers to
`Div:Content`. Most names refer to nothing in the same file: of 2130 named
boxes across the specifications as they stand, 699 name a section in their own
file and 1431 do not, because a specification is one file and names like
`PageLayout`, `Select` and `Apply` belong to `ui_kit` or to another page. A
name that resolves to nothing is normal and is not an error; look for it in
the sibling specifications.

## Scenarios

Each entry in `layouts` is one complete arrangement -- a scenario. Scenarios
do not inherit from one another: a scenario replaces the one that would
otherwise apply, wholesale. This is the opposite of component scenarios in
`components.json`, which accumulate from left to right, and the two are easy
to confuse.

**How one is chosen.** Read the scenarios from the last towards the first and
take the first whose condition is met. The first is the default and normally
carries no condition, so reading terminates there.

Normally, not always: 39 sections across the specifications begin with a
scenario that does carry a condition, which means the section has no default
and nothing is drawn when nothing matches. That is sometimes deliberate -- a
fallback or a message that exists only under a condition -- so caro does not
report it, but do not assume a first scenario always applies.

It follows that a scenario after the first carrying no condition is met
always, and every scenario before it is unreachable; and that two scenarios
carrying the same condition leave the earlier of them unreachable. Caro
reports both. They occur in the specifications as they stand, so a file you
are handed may contain them.

**Conditions are free text and nothing parses them.** A selector means one
thing to a web target and another to a Qt one, so caro carries the text and
leaves it alone. Two forms are conventional:

    any < status is IN_PROGRESS        the state of the application
    @media (768px <= width < 1036px)   the width of the window
    @container (732px <= width)        the width of the region

The names after `any <` refer to state declared in `model.txt`. Nothing checks
them, so a name there may be misspelt.

**Properties** is free text too, applying to the scenario and to the boxes it
names. It is where a link the geometry cannot express is written:

    PageLayout:
      content: Main

That says the page's `PageLayout` takes `Main` as its content. Since properties
are not parsed, this reference is invisible to anything reading the boxes
alone -- worth knowing when a section appears to be referred to by nothing.

## Layers

`overlays` are frames superimposed on the scenario's own boxes, occupying the
same space, in ascending order. A layer is how a sheet, a dialog or an
overlay panel is drawn over the layout it covers rather than beside it. Each
layer is an ordinary list of boxes and everything below applies to it.

## Boxes

**A box with no name is space.** Padding, a gutter, a gap between two things.
Roughly half of every specification is space: 1933 of 4063 boxes. It is not
an omission and not an error.

**Boxes carry their own coordinates**, relative to the layout's top left.
There is no nesting: a section's boxes are a flat list, and depth comes from a
box naming another section.

**A box is painted in drawing order**, so where two overlap the later one is
on top and a press finds it. The extent of a scenario is the bounding box of
what is drawn in it; nothing declares it.

## Size policies

Each axis is sized on its own. The terms come from
https://wiki.spiretrading.com/index.php/Layout.

| Policy   | Flat format   | Meaning                                       |
| -------- | ------------- | --------------------------------------------- |
| `fixed`  | `fixed`       | the size drawn, held                          |
| `fill`   | `flexible`    | takes the space left, shared equally          |
| `fit`    | `component`   | whatever the contents ask for                 |
| `repeat` | `repeat`      | drawn once, repeated for each item            |

`fill` shares equally between siblings that also fill, after the fixed and
fitted boxes have been placed. Do not take a `fill` box's drawn size as its
size; it is the size it happened to be in the drawing.

## Repeats

**A box repeats as a whole.** Both axes carry `repeat` together; one axis
repeating alone is malformed and caro will not produce it.

`repeatDirection` is the direction the copies run. It is a separate matter
from the policy, and it may be absent: of 89 repeating boxes across the
specifications, 82 say which way and 7 do not, because their drawings marked
no direction or marked several that disagree.

**What is repeated is whatever lies along the opposite edge.** A box
repeating `down` has the thing it repeats above it; one repeating `right` has
it to the left. That thing must span the repeating box exactly, though
several boxes may span it between them -- a repeated table row is made of
cells. The repeating box itself is the room the copies fill, so its size along
the direction of travel says how much room there is, not how big one copy is.

    Item        0,0    150x26
    Gap         0,26   150x8
    (space)     0,34   150x26   repeat, running down
    Item        0,60   150x26

Here `Gap` lies along the top edge and spans the repeating box, so what
repeats is the item-and-gap pair, filling the 26 pixels drawn and as many more
as there are items.

## What a clean file satisfies

Caro reports these, so a file it calls valid holds all of them. A file
converted straight from a drawing may break several.

Errors:

- No two boxes in one frame cover the same space.
- No space within a frame's extent is unaccounted for by some box.
- No scenario after the first carries no condition.
- No two scenarios carry the same condition.
- Every repeating box has something along the edge it runs from, spanning it.
- Every section has a name, and no two sections share one.

Warnings:

- A repeating box says which way it runs.
- A layer has something drawn in it.

Nothing checks a condition against `model.txt`, and nothing checks a name
against the other files in the set. Both are open.

## A worked example

From `tests/fees_detail_page.json`:

```json
{
  "name": "Header",
  "layouts": [
    {
      "condition": "",
      "properties": "",
      "boxes": [
        {
          "name": "Metadata",
          "x": 0, "y": 24, "width": 320, "height": 80,
          "widthPolicy": "fill", "heightPolicy": "fit"
        },
        {
          "name": "Context",
          "x": 0, "y": 0, "width": 320, "height": 24,
          "widthPolicy": "fill", "heightPolicy": "fit"
        }
      ],
      "overlays": []
    }
  ]
}
```

`Header` is a column 320 wide holding two regions. `Context` sits at the top,
24 tall; `Metadata` sits below it, 80 tall. Both take the full width and both
give their height to their contents, so the numbers 24 and 80 are what the
drawing happened to show and not sizes to hard-code. Neither is space, so both
are looked up: `Context` and `Metadata` are sections of this same file. There
is one scenario and no condition, so this is the only arrangement `Header`
ever takes.

Note that the boxes are not in visual order -- `Metadata` is listed first and
drawn lower. Order in the list is paint order, not position. Sort by `y` and
`x` to read a layout down the screen.
