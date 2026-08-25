/** Specifies how a node is sized along a single axis. */
export enum SizePolicy {

  /** The node is sized in pixels, exactly as drawn. */
  FIXED = 'fixed',

  /** The node grows or shrinks to fill the available space. */
  FLEXIBLE = 'flexible',

  /** The referenced component's own layout determines the size. */
  COMPONENT = 'component',

  /** The node is repeated once per item in a collection. */
  REPEAT = 'repeat'
}

/** Specifies the direction along which a repeated node is laid out. */
export enum RepeatDirection {
  LEFT = 'left',
  RIGHT = 'right',
  UP = 'up',
  DOWN = 'down'
}

/** Specifies the axis along which a container arranges its children. */
export enum Orientation {

  /** Children are arranged left to right. */
  ROW = 'row',

  /** Children are arranged top to bottom. */
  COLUMN = 'column'
}
