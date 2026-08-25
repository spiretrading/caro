import { Board, Component, Container, Layout, Orientation,
  SizePolicy } from '../layout';

/** Returns whether a scenario has been left untouched. */
export function isBlank(layout: Layout): boolean {
  if(layout.condition !== '') {
    return false;
  }
  if(!(layout.root instanceof Container)) {
    return false;
  }
  return layout.root.children.length === 0;
}

/** Returns a scenario with nothing in it. */
export function makeBlank(): Layout {
  return new Layout('', '', new Container(Orientation.COLUMN, 0, 0,
    SizePolicy.FILL, SizePolicy.FILL, []), []);
}

/** Keeps a blank scenario waiting past the default of a component. */
export function ensureBlank(component: Component): void {
  const layouts = component.layouts;
  if(layouts.length > 1 && isBlank(layouts[layouts.length - 1])) {
    return;
  }
  layouts.push(makeBlank());
}

/** Returns a copy of a board without the blank scenarios waiting at the end
    of each component, which carry no condition and would therefore match
    everything and, being last, take precedence over every scenario before
    them. */
export function prune(board: Board): Board {
  const copy = board.clone();
  for(const component of copy.components) {
    const layouts = component.layouts;
    while(layouts.length > 1 && isBlank(layouts[layouts.length - 1])) {
      layouts.pop();
    }
  }
  return copy;
}
