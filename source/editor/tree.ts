import { Container, Node, Orientation, SizePolicy } from '../layout';

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
  const parent = parentOf(root, target);
  if(parent === null) {
    return;
  }
  const orientation = toOrientation(side);
  const index = parent.children.indexOf(target);
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
      return [node, target];
    }
    return [target, node];
  })();
  parent.children.splice(index, 1, new Container(orientation, target.width,
    target.height, target.widthPolicy, target.heightPolicy, children));
}

/** Returns whether a node already sits against one side of a target, either
    directly or inside the container occupying that slot. */
export function isPlaced(root: Container, node: Node, target: Node,
    side: Side): boolean {
  const parent = parentOf(root, target);
  if(parent === null || parent.orientation !== toOrientation(side)) {
    return false;
  }
  const index = parent.children.indexOf(target);
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

function collapse(root: Container, container: Container): void {
  if(container === root) {
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
  for(const policy of [SizePolicy.FLEXIBLE, SizePolicy.REPEAT,
      SizePolicy.COMPONENT]) {
    if(children.some(child => child[key] === policy)) {
      return policy;
    }
  }
  return SizePolicy.FIXED;
}
