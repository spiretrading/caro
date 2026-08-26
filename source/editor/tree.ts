import { Container, Node, Orientation, SizePolicy } from '../layout';

/** How far apart two edges may be and still count as the same seam. */
const TOLERANCE = 0.5;

/** A node and the place it occupies. */
export interface Placement {
  node: Node;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Identifies the side of a box that a dropped box attaches to. */
export enum Side {
  TOP = 'top',
  BOTTOM = 'bottom',
  LEFT = 'left',
  RIGHT = 'right'
}

/** Returns every leaf of a tree, in visual order. */
export function leaves(node: Node): Node[] {
  if(!(node instanceof Container)) {
    return [node];
  }
  const found = [] as Node[];
  for(const child of node.children) {
    found.push(...leaves(child));
  }
  return found;
}

/** Returns the container holding a node, null when there is none. */
export function parentOf(root: Container, node: Node): Container {
  for(const child of root.children) {
    if(child === node) {
      return root;
    }
    if(child instanceof Container) {
      const found = parentOf(child, node);
      if(found !== null) {
        return found;
      }
    }
  }
  return null;
}

/** Returns whether a node is somewhere within a tree. */
export function contains(root: Container, node: Node): boolean {
  return root === node || parentOf(root, node) !== null;
}

/** Removes a node, collapsing any container left with a single child. */
export function detach(root: Container, node: Node): void {
  const parent = parentOf(root, node);
  if(parent === null) {
    return;
  }
  parent.children.splice(parent.children.indexOf(node), 1);
  collapse(root, parent);
}

/** Inserts a node against one side of another node. */
export function attach(root: Container, node: Node, target: Node,
    side: Side): void {
  if(target === null) {
    root.children.push(node);
    return;
  }
  const orientation = toOrientation(side);
  const anchor = ascend(root, target, orientation, node);
  if(anchor === null) {
    reroot(root, node, orientation, side);
    return;
  }
  const parent = parentOf(root, anchor);
  if(parent === null) {
    return;
  }
  const index = parent.children.indexOf(anchor);
  if(parent.orientation === orientation) {
    const at = (() => {
      if(side === Side.TOP || side === Side.LEFT) {
        return index;
      }
      return index + 1;
    })();
    parent.children.splice(at, 0, node);
    return;
  }
  const children = (() => {
    if(side === Side.TOP || side === Side.LEFT) {
      return [node, anchor];
    }
    return [anchor, node];
  })();
  parent.children.splice(index, 1, new Container(orientation, anchor.width,
    anchor.height, anchor.widthPolicy, anchor.heightPolicy, children));
}

/** Builds a tree out of nodes and the places they occupy, cutting the region
    they cover into rows and columns. Returns null when they cannot be cut
    apart, which only happens if they overlap. */
export function assemble(placements: Placement[]): Node {
  if(placements.length === 1) {
    return placements[0].node;
  }
  const horizontal = seams(placements, 'y');
  const vertical = seams(placements, 'x');
  const axis = (() => {
    if(horizontal.length >= vertical.length && horizontal.length > 0) {
      return 'y' as 'y';
    } else if(vertical.length > 0) {
      return 'x' as 'x';
    }
    return null;
  })();
  if(axis === null) {
    return null;
  }
  const positions = (() => {
    if(axis === 'y') {
      return horizontal;
    }
    return vertical;
  })();
  const children = [] as Node[];
  for(const band of divide(placements, axis, positions)) {
    const child = assemble(band);
    if(child === null) {
      return null;
    }
    children.push(child);
  }
  const orientation = (() => {
    if(axis === 'y') {
      return Orientation.COLUMN;
    }
    return Orientation.ROW;
  })();
  const container = new Container(orientation, 0, 0, SizePolicy.FIXED,
    SizePolicy.FIXED, children);
  normalize(container);
  return container;
}

/** Splices a container's children into its parent when the two run the same
    way, so that moving a group of boxes leaves no level behind. */
export function flatten(root: Container, node: Node): void {
  if(!(node instanceof Container)) {
    return;
  }
  const parent = parentOf(root, node);
  if(parent === null || parent.orientation !== node.orientation) {
    return;
  }
  parent.children.splice(parent.children.indexOf(node), 1, ...node.children);
}

function spanOf(placement: Placement, axis: 'x' | 'y'): number {
  if(axis === 'x') {
    return placement.width;
  }
  return placement.height;
}

function seams(placements: Placement[], axis: 'x' | 'y'): number[] {
  const edges = new Set<number>();
  for(const placement of placements) {
    edges.add(placement[axis]);
    edges.add(placement[axis] + spanOf(placement, axis));
  }
  const low = Math.min(...placements.map(placement => placement[axis]));
  const high = Math.max(...placements.map(placement =>
    placement[axis] + spanOf(placement, axis)));
  const found = [] as number[];
  for(const edge of [...edges].sort((left, right) => left - right)) {
    if(edge <= low + TOLERANCE || edge >= high - TOLERANCE) {
      continue;
    }
    const straddles = placements.some(placement =>
      placement[axis] < edge - TOLERANCE &&
      placement[axis] + spanOf(placement, axis) > edge + TOLERANCE);
    if(!straddles) {
      found.push(edge);
    }
  }
  return found;
}

function divide(placements: Placement[], axis: 'x' | 'y',
    positions: number[]): Placement[][] {
  const bands = [] as Placement[][];
  let previous = -Infinity;
  for(const position of [...positions, Infinity]) {
    const band = placements.filter(placement =>
      placement[axis] >= previous - TOLERANCE &&
      placement[axis] < position - TOLERANCE);
    if(band.length > 0) {
      bands.push(band);
    }
    previous = position;
  }
  return bands;
}

/** Returns whether a node already sits against one side of a target, either
    directly or inside the container occupying that slot. */
export function isPlaced(root: Container, node: Node, target: Node,
    side: Side): boolean {
  const orientation = toOrientation(side);
  const anchor = ascend(root, target, orientation, node);
  if(anchor === null) {
    return false;
  }
  const parent = parentOf(root, anchor);
  if(parent === null || parent.orientation !== orientation) {
    return false;
  }
  const index = parent.children.indexOf(anchor);
  const neighbour = (() => {
    if(side === Side.TOP || side === Side.LEFT) {
      return parent.children[index - 1];
    }
    return parent.children[index + 1];
  })();
  if(neighbour === undefined) {
    return false;
  }
  if(neighbour === node) {
    return true;
  }
  return neighbour instanceof Container && contains(neighbour, node);
}

/** Recomputes the size and policies of every container in a tree. */
export function normalize(node: Node): void {
  if(!(node instanceof Container)) {
    return;
  }
  for(const child of node.children) {
    normalize(child);
  }
  if(node.children.length === 0) {
    return;
  }
  const widths = node.children.map(child => child.width);
  const heights = node.children.map(child => child.height);
  if(node.orientation === Orientation.ROW) {
    node.width = widths.reduce((total, width) => total + width, 0);
    node.height = Math.max(...heights);
  } else {
    node.width = Math.max(...widths);
    node.height = heights.reduce((total, height) => total + height, 0);
  }
  node.widthPolicy = aggregate(node.children, 'widthPolicy');
  node.heightPolicy = aggregate(node.children, 'heightPolicy');
}

/** Returns the orientation a side implies for its container. */
export function toOrientation(side: Side): Orientation {
  if(side === Side.TOP || side === Side.BOTTOM) {
    return Orientation.COLUMN;
  }
  return Orientation.ROW;
}

function absorb(root: Container): void {
  while(root.children.length === 1 &&
      root.children[0] instanceof Container) {
    const child = root.children[0] as Container;
    root.orientation = child.orientation;
    root.children = child.children;
  }
}

function ascend(root: Container, target: Node, orientation: Orientation,
    ignore: Node): Node {
  let anchor = target;
  let parent = parentOf(root, anchor);
  while(parent !== null && parent.orientation !== orientation &&
      spans(parent, anchor, orientation, ignore)) {
    if(parent === root) {
      return null;
    }
    anchor = parent;
    parent = parentOf(root, anchor);
  }
  return anchor;
}

function spans(container: Container, child: Node, orientation: Orientation,
    ignore: Node): boolean {
  if(policyOf(child, orientation) === SizePolicy.FILL) {
    return true;
  }
  let extent = 0;
  let found = false;
  for(const sibling of container.children) {
    if(sibling === ignore) {
      continue;
    }
    if(policyOf(sibling, orientation) === SizePolicy.FILL) {
      return false;
    }
    found = true;
    extent = Math.max(extent, extentOf(sibling, orientation));
  }
  if(!found) {
    return true;
  }
  return Math.abs(extentOf(child, orientation) - extent) < 1;
}

function policyOf(node: Node, orientation: Orientation): SizePolicy {
  if(orientation === Orientation.ROW) {
    return node.widthPolicy;
  }
  return node.heightPolicy;
}

function extentOf(node: Node, orientation: Orientation): number {
  if(orientation === Orientation.ROW) {
    return node.width;
  }
  return node.height;
}

function reroot(root: Container, node: Node, orientation: Orientation,
    side: Side): void {
  const inner = (() => {
    if(root.children.length === 1) {
      return root.children[0];
    }
    return new Container(root.orientation, root.width, root.height,
      root.widthPolicy, root.heightPolicy, root.children.slice());
  })();
  root.orientation = orientation;
  if(side === Side.TOP || side === Side.LEFT) {
    root.children = [node, inner];
  } else {
    root.children = [inner, node];
  }
}

function collapse(root: Container, container: Container): void {
  if(container === root) {
    absorb(root);
    return;
  }
  const parent = parentOf(root, container);
  if(parent === null) {
    return;
  }
  if(container.children.length === 1) {
    parent.children.splice(parent.children.indexOf(container), 1,
      container.children[0]);
    collapse(root, parent);
  } else if(container.children.length === 0) {
    parent.children.splice(parent.children.indexOf(container), 1);
    collapse(root, parent);
  }
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
