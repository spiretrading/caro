import { Board, Box, Component, Layout, SizePolicy } from '../layout';

const LEGACY = {
  fixed: SizePolicy.FIXED,
  flexible: SizePolicy.FILL,
  component: SizePolicy.FIT,
  repeat: SizePolicy.REPEAT
} as {[name: string]: SizePolicy};

/** Returns whether a parsed value uses the format xd_parser emits. */
export function isFlatBoard(value: any): boolean {
  const layout = value?.components?.[0]?.layouts?.[0];
  if(layout === undefined) {
    return false;
  }
  if(layout.frame !== undefined) {
    return true;
  }
  const box = layout.boxes?.[0];
  return box !== undefined && box.width_policy !== undefined;
}

/** Converts a board in the format xd_parser emits, reversing the order of
    its components: that format lists them innermost first because that is
    how the drawings are stacked, whereas an editor starts from the outermost
    and works inwards. */
export function importFlatBoard(value: any): Board {
  const components = value.components.map((component: any) =>
    new Component(component.name, component.layouts.map((layout: any) =>
      new Layout(layout.condition, layout.constraints,
        importFrame(layout.frame ?? {boxes: layout.boxes}),
        (layout.overlays ?? []).map(importFrame)))));
  components.reverse();
  return new Board(value.name, components);
}

/** Converts one frame of the legacy format into boxes. */
export function importFrame(frame: any): Box[] {
  const boxes = frame.boxes ?? frame;
  return boxes.map((box: any) => {
    const made = new Box(nameOf(box), box.x, box.y, box.width, box.height,
      toPolicy(box.width_policy), toPolicy(box.height_policy));
    if(box.repeat_direction !== undefined && box.repeat_direction !== '') {
      made.repeatDirection = box.repeat_direction;
    }
    return made;
  });
}

function nameOf(box: any): string {
  if(box.name === undefined || box.name === '' || box.name.startsWith('@')) {
    return '';
  }
  return box.name;
}

function toPolicy(name: string): SizePolicy {
  const policy = LEGACY[name];
  if(policy === undefined) {
    return SizePolicy.FIXED;
  }
  return policy;
}
