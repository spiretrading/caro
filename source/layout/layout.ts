import { Box } from './box';

/** A single arrangement of a component, used when its condition is met. */
export class Layout {

  /** When this layout applies, empty for the default. */
  public condition: string;

  /** The properties applied to this layout and to the boxes it names. */
  public properties: string;

  /** The boxes making up the layout. */
  public boxes: Box[];

  /** The layers superimposed on the layout, in ascending order. */
  public overlays: Box[][];

  constructor(condition: string, properties: string, boxes: Box[],
      overlays: Box[][]) {
    this.condition = condition;
    this.properties = properties;
    this.boxes = boxes;
    this.overlays = overlays;
  }

  /** Returns a deep copy of this layout. */
  public clone(): Layout {
    return new Layout(this.condition, this.properties,
      this.boxes.map(box => box.clone()),
      this.overlays.map(layer => layer.map(box => box.clone())));
  }

  /** Converts this layout to its JSON representation. */
  public toObject(): any {
    return {
      condition: this.condition,
      properties: this.properties,
      boxes: this.boxes.map(box => box.toObject()),
      overlays: this.overlays.map(
        layer => layer.map(box => box.toObject()))
    };
  }

  /** Builds a layout from its JSON representation. */
  public static fromObject(value: any): Layout {
    return new Layout(value.condition, value.properties,
      value.boxes.map((box: any) => Box.fromObject(box)),
      (value.overlays ?? []).map(
        (layer: any) => layer.map((box: any) => Box.fromObject(box))));
  }
}
