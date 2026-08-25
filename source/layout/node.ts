import { Orientation, RepeatDirection, SizePolicy } from './size_policy';

/** Base class for every element making up a layout tree. */
export abstract class Node {

  /** The width in pixels as drawn. */
  public width: number;

  /** The height in pixels as drawn. */
  public height: number;

  /** How the node is sized horizontally. */
  public widthPolicy: SizePolicy;

  /** How the node is sized vertically. */
  public heightPolicy: SizePolicy;

  /** The direction the node repeats in, null if it does not repeat. */
  public repeatDirection: RepeatDirection;

  constructor(width: number, height: number, widthPolicy: SizePolicy,
      heightPolicy: SizePolicy) {
    this.width = width;
    this.height = height;
    this.widthPolicy = widthPolicy;
    this.heightPolicy = heightPolicy;
    this.repeatDirection = null;
  }

  /** Returns a deep copy of this node. */
  public abstract clone(): Node;

  /** Converts this node to its JSON representation. */
  public abstract toObject(): any;

  /** Builds a node from its JSON representation. */
  public static fromObject(value: any): Node {
    if(value.kind === 'container') {
      return Container.fromObject(value);
    } else if(value.kind === 'reference') {
      return Reference.fromObject(value);
    } else if(value.kind === 'spacer') {
      return Spacer.fromObject(value);
    }
    throw new Error(`Unrecognized node kind '${value.kind}'.`);
  }

  protected assign(value: any): void {
    value.width = this.width;
    value.height = this.height;
    value.widthPolicy = this.widthPolicy;
    value.heightPolicy = this.heightPolicy;
    if(this.repeatDirection !== null) {
      value.repeatDirection = this.repeatDirection;
    }
  }

  protected restore(value: any): void {
    if(value.repeatDirection !== undefined) {
      this.repeatDirection = value.repeatDirection;
    }
  }
}

/** A node arranging its children along a single axis. */
export class Container extends Node {

  /** The axis the children are arranged along. */
  public orientation: Orientation;

  /** The children, in visual order. */
  public children: Node[];

  constructor(orientation: Orientation, width: number, height: number,
      widthPolicy: SizePolicy, heightPolicy: SizePolicy, children: Node[]) {
    super(width, height, widthPolicy, heightPolicy);
    this.orientation = orientation;
    this.children = children;
  }

  public clone(): Container {
    const children = this.children.map(child => child.clone());
    const copy = new Container(this.orientation, this.width, this.height,
      this.widthPolicy, this.heightPolicy, children);
    copy.repeatDirection = this.repeatDirection;
    return copy;
  }

  public toObject(): any {
    const value = {kind: 'container', orientation: this.orientation} as any;
    this.assign(value);
    value.children = this.children.map(child => child.toObject());
    return value;
  }

  public static fromObject(value: any): Container {
    const children = value.children.map(
      (child: any) => Node.fromObject(child));
    const node = new Container(value.orientation, value.width, value.height,
      value.widthPolicy, value.heightPolicy, children);
    node.restore(value);
    return node;
  }
}

/** A node referring to another component by name. */
export class Reference extends Node {

  /** The name of the referenced component. */
  public name: string;

  constructor(name: string, width: number, height: number,
      widthPolicy: SizePolicy, heightPolicy: SizePolicy) {
    super(width, height, widthPolicy, heightPolicy);
    this.name = name;
  }

  public clone(): Reference {
    const copy = new Reference(this.name, this.width, this.height,
      this.widthPolicy, this.heightPolicy);
    copy.repeatDirection = this.repeatDirection;
    return copy;
  }

  public toObject(): any {
    const value = {kind: 'reference', name: this.name} as any;
    this.assign(value);
    return value;
  }

  public static fromObject(value: any): Reference {
    const node = new Reference(value.name, value.width, value.height,
      value.widthPolicy, value.heightPolicy);
    node.restore(value);
    return node;
  }
}

/** A node occupying empty space between its siblings. */
export class Spacer extends Node {

  public clone(): Spacer {
    const copy = new Spacer(this.width, this.height, this.widthPolicy,
      this.heightPolicy);
    copy.repeatDirection = this.repeatDirection;
    return copy;
  }

  public toObject(): any {
    const value = {kind: 'spacer'} as any;
    this.assign(value);
    return value;
  }

  public static fromObject(value: any): Spacer {
    const node = new Spacer(value.width, value.height, value.widthPolicy,
      value.heightPolicy);
    node.restore(value);
    return node;
  }
}
