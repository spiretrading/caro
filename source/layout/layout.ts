import { Node } from './node';

/** A single arrangement of a component, used when its condition is met. */
export class Layout {

  /** When this layout applies, empty for the default. */
  public condition: string;

  /** Additional sizing constraints applied to this layout. */
  public constraints: string;

  /** The root of the layout tree. */
  public root: Node;

  /** The trees superimposed over the root, in ascending layer order. */
  public overlays: Node[];

  constructor(condition: string, constraints: string, root: Node,
      overlays: Node[]) {
    this.condition = condition;
    this.constraints = constraints;
    this.root = root;
    this.overlays = overlays;
  }

  /** Returns a deep copy of this layout. */
  public clone(): Layout {
    return new Layout(this.condition, this.constraints, this.root.clone(),
      this.overlays.map(overlay => overlay.clone()));
  }

  /** Converts this layout to its JSON representation. */
  public toObject(): any {
    return {
      condition: this.condition,
      constraints: this.constraints,
      root: this.root.toObject(),
      overlays: this.overlays.map(overlay => overlay.toObject())
    };
  }

  /** Builds a layout from its JSON representation. */
  public static fromObject(value: any): Layout {
    return new Layout(value.condition, value.constraints,
      Node.fromObject(value.root),
      value.overlays.map((overlay: any) => Node.fromObject(overlay)));
  }
}
