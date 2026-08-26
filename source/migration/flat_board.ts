import { Board, Component, Container, Layout, Node, Orientation, Reference,
  SizePolicy, Spacer } from '../layout';

const TOLERANCE = 0.5;

const LEGACY = {
  fixed: SizePolicy.FIXED,
  flexible: SizePolicy.FILL,
  component: SizePolicy.FIT,
  repeat: SizePolicy.REPEAT
} as {[name: string]: SizePolicy};

interface FlatBox {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  width_policy: string;
  height_policy: string;
  repeat_direction?: string;
}

/** Returns whether a parsed value uses the legacy flat box format. */
export function isFlatBoard(value: any): boolean {
  const component = value?.components?.[0];
  const layout = component?.layouts?.[0];
  if(layout === undefined) {
    return false;
  }
  return layout.root === undefined &&
    (layout.frame !== undefined || layout.boxes !== undefined);
}

/** Converts a board in the legacy flat box format into a Board. */
export function importFlatBoard(value: any): Board {
  return new Board(value.name, value.components.map((component: any) =>
    new Component(component.name, component.layouts.map((layout: any) =>
      new Layout(layout.condition, layout.constraints,
        importFrame(layout.frame ?? {boxes: layout.boxes}),
        (layout.overlays ?? []).map(importFrame))))));
}

/** Converts a single flat frame of boxes into a layout tree, always rooted
    at a container so that a layout of one box is still an arrangement. */
export function importFrame(frame: any): Container {
  const boxes = frame.boxes ?? frame;
  if(boxes.length === 0) {
    throw new Error('A frame contains no boxes.');
  }
  const root = build(boxes);
  if(root instanceof Container) {
    return root;
  }
  return new Container(Orientation.COLUMN, root.width, root.height,
    root.widthPolicy, root.heightPolicy, [root]);
}

function build(boxes: FlatBox[]): Node {
  if(boxes.length === 1) {
    return makeLeaf(boxes[0]);
  }
  const horizontal = findCuts(boxes, 'y');
  const vertical = findCuts(boxes, 'x');
  const axis = (() => {
    if(horizontal.length >= vertical.length && horizontal.length > 0) {
      return 'y';
    } else if(vertical.length > 0) {
      return 'x';
    }
    return null;
  })();
  if(axis === null) {
    throw new Error(
      `${boxes.length} boxes cannot be separated into rows or columns.`);
  }
  const positions = (() => {
    if(axis === 'y') {
      return horizontal;
    }
    return vertical;
  })();
  const children = partition(boxes, axis, positions).map(build);
  const region = measure(boxes);
  const orientation = (() => {
    if(axis === 'y') {
      return Orientation.COLUMN;
    }
    return Orientation.ROW;
  })();
  return new Container(orientation, region.x2 - region.x,
    region.y2 - region.y, aggregate(children, 'widthPolicy'),
    aggregate(children, 'heightPolicy'), children);
}

function makeLeaf(box: FlatBox): Node {
  const node = (() => {
    if(box.name !== undefined && box.name !== '' &&
        !box.name.startsWith('@')) {
      return new Reference(box.name, box.width, box.height,
        toPolicy(box.width_policy), toPolicy(box.height_policy));
    }
    return new Spacer(box.width, box.height, toPolicy(box.width_policy),
      toPolicy(box.height_policy));
  })();
  if(box.repeat_direction !== undefined && box.repeat_direction !== '') {
    node.repeatDirection = box.repeat_direction as any;
  }
  return node;
}

function toPolicy(name: string): SizePolicy {
  const policy = LEGACY[name];
  if(policy === undefined) {
    throw new Error(`Unrecognized size policy '${name}'.`);
  }
  return policy;
}

function measure(boxes: FlatBox[]) {
  return {
    x: Math.min(...boxes.map(box => box.x)),
    y: Math.min(...boxes.map(box => box.y)),
    x2: Math.max(...boxes.map(box => box.x + box.width)),
    y2: Math.max(...boxes.map(box => box.y + box.height))
  };
}

function findCuts(boxes: FlatBox[], axis: 'x' | 'y'): number[] {
  const start = axis;
  const extent = (() => {
    if(axis === 'x') {
      return 'width' as 'width';
    }
    return 'height' as 'height';
  })();
  const edges = new Set<number>();
  for(const box of boxes) {
    edges.add(box[start]);
    edges.add(box[start] + box[extent]);
  }
  const region = measure(boxes);
  const low = (() => {
    if(axis === 'x') {
      return region.x;
    }
    return region.y;
  })();
  const high = (() => {
    if(axis === 'x') {
      return region.x2;
    }
    return region.y2;
  })();
  const cuts = [] as number[];
  for(const edge of [...edges].sort((left, right) => left - right)) {
    if(edge <= low + TOLERANCE || edge >= high - TOLERANCE) {
      continue;
    }
    const straddles = boxes.some(box => box[start] < edge - TOLERANCE &&
      box[start] + box[extent] > edge + TOLERANCE);
    if(!straddles) {
      cuts.push(edge);
    }
  }
  return cuts;
}

function partition(boxes: FlatBox[], axis: 'x' | 'y',
    positions: number[]): FlatBox[][] {
  const groups = [] as FlatBox[][];
  let previous = -Infinity;
  for(const position of [...positions, Infinity]) {
    const group = boxes.filter(box => box[axis] >= previous - TOLERANCE &&
      box[axis] < position - TOLERANCE);
    if(group.length > 0) {
      groups.push(group);
    }
    previous = position;
  }
  return groups;
}

function aggregate(children: Node[],
    key: 'widthPolicy' | 'heightPolicy'): SizePolicy {
  for(const policy of [SizePolicy.FILL, SizePolicy.REPEAT,
      SizePolicy.FIT]) {
    if(children.some(child => child[key] === policy)) {
      return policy;
    }
  }
  return SizePolicy.FIXED;
}
