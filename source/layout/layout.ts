import { Node } from './node';

/** A single arrangement of a component, used when its condition is met. */
export class Layout {

  /** When this layout applies, empty for the default. */
  public condition: string;

  /** The properties applied to this layout and to the boxes it names. */
  public properties: string;

  /** The root of the layout tree. */
  public root: Node;

  /** The trees superimposed over the root, in ascending layer order. */
  public overlays: Node[];

  constructor(condition: string, properties: string, root: Node,
      overlays: Node[]) {
    this.condition = condition;
    this.properties = properties;
    this.root = root;
    this.overlays = overlays;
  }

  /** Returns a deep copy of this layout. */
  public clone(): Layout {
    return new Layout(this.condition, this.properties, this.root.clone(),
      this.overlays.map(overlay => overlay.clone()));
  }

  /** Converts this layout to its JSON representation. */
  public toObject(): any {
    return {
      condition: this.condition,
      properties: this.properties,
      root: this.root.toObject(),
      overlays: this.overlays.map(overlay => overlay.toObject())
    };
  }

  /** Builds a layout from its JSON representation. */
  public static fromObject(value: any): Layout {
    return new Layout(value.condition, value.properties,
      Node.fromObject(value.root),
      value.overlays.map((overlay: any) => Node.fromObject(overlay)));
  }
}
