import { Component } from './component';

/** A complete layout specification. */
export class Board {

  /** The name of the specification. */
  public name: string;

  /** The components, from innermost to outermost. */
  public components: Component[];

  constructor(name: string, components: Component[]) {
    this.name = name;
    this.components = components;
  }

  /** Returns the component with a given name, null when there is none. */
  public find(name: string): Component {
    for(const component of this.components) {
      if(component.name === name) {
        return component;
      }
    }
    return null;
  }

  /** Returns a deep copy of this board. */
  public clone(): Board {
    return new Board(this.name,
      this.components.map(component => component.clone()));
  }

  /** Serializes this board to a JSON string. */
  public toJson(): string {
    const value = {
      name: this.name,
      components: this.components.map(component => component.toObject())
    };
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  /** Deserializes a board from a JSON string. */
  public static fromJson(text: string): Board {
    const value = JSON.parse(text);
    return new Board(value.name,
      value.components.map((component: any) =>
        Component.fromObject(component)));
  }
}
