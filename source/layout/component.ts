import { Layout } from './layout';

/** A named region of a specification, with one layout per state. */
export class Component {

  /** The name, either 'Element:Name' or just 'Name'. */
  public name: string;

  /** The layouts, in ascending order of priority. */
  public layouts: Layout[];

  constructor(name: string, layouts: Layout[]) {
    this.name = name;
    this.layouts = layouts;
  }

  /** Returns the element type, empty when the name declares none. */
  public get element(): string {
    const separator = this.name.indexOf(':');
    if(separator === -1) {
      return '';
    }
    return this.name.substring(0, separator);
  }

  /** Returns the name with any element type removed. */
  public get identifier(): string {
    const separator = this.name.indexOf(':');
    if(separator === -1) {
      return this.name;
    }
    return this.name.substring(separator + 1);
  }

  /** Returns a deep copy of this component. */
  public clone(): Component {
    return new Component(this.name,
      this.layouts.map(layout => layout.clone()));
  }

  /** Converts this component to its JSON representation. */
  public toObject(): any {
    return {
      name: this.name,
      layouts: this.layouts.map(layout => layout.toObject())
    };
  }

  /** Builds a component from its JSON representation. */
  public static fromObject(value: any): Component {
    return new Component(value.name,
      value.layouts.map((layout: any) => Layout.fromObject(layout)));
  }
}
