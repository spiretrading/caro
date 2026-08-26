import { RepeatDirection, SizePolicy } from './size_policy';

/** A rectangle in a layout, named for whatever it stands for. */
export class Box {

  /** The component this box stands for, empty when it is only space. */
  public name: string;

  /** How far the box sits from the layout's left edge, in pixels. */
  public x: number;

  /** How far the box sits from the layout's top edge, in pixels. */
  public y: number;

  /** The width in pixels as drawn. */
  public width: number;

  /** The height in pixels as drawn. */
  public height: number;

  /** How the box is sized horizontally. */
  public widthPolicy: SizePolicy;

  /** How the box is sized vertically. */
  public heightPolicy: SizePolicy;

  /** The direction the box repeats in, null if it does not repeat. */
  public repeatDirection: RepeatDirection;

  constructor(name: string, x: number, y: number, width: number,
      height: number, widthPolicy: SizePolicy, heightPolicy: SizePolicy) {
    this.name = name;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.widthPolicy = widthPolicy;
    this.heightPolicy = heightPolicy;
    this.repeatDirection = null;
  }

  /** Returns the coordinate just past the box's right edge. */
  public get right(): number {
    return this.x + this.width;
  }

  /** Returns the coordinate just past the box's bottom edge. */
  public get bottom(): number {
    return this.y + this.height;
  }

  /** Returns whether this box and another cover any of the same space. */
  public overlaps(other: Box): boolean {
    return this.x < other.right && other.x < this.right &&
      this.y < other.bottom && other.y < this.bottom;
  }

  /** Returns a copy of this box. */
  public clone(): Box {
    const copy = new Box(this.name, this.x, this.y, this.width, this.height,
      this.widthPolicy, this.heightPolicy);
    copy.repeatDirection = this.repeatDirection;
    return copy;
  }

  /** Converts this box to its JSON representation. */
  public toObject(): any {
    const value = {
      name: this.name,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      widthPolicy: this.widthPolicy,
      heightPolicy: this.heightPolicy
    } as any;
    if(this.repeatDirection !== null) {
      value.repeatDirection = this.repeatDirection;
    }
    return value;
  }

  /** Builds a box from its JSON representation. */
  public static fromObject(value: any): Box {
    const box = new Box(value.name, value.x, value.y, value.width,
      value.height, value.widthPolicy, value.heightPolicy);
    if(value.repeatDirection !== undefined) {
      box.repeatDirection = value.repeatDirection;
    }
    return box;
  }
}
