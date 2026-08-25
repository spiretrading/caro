/** Specifies how a node is sized along a single axis. */
export enum SizePolicy {

  /** The size is a literal value taken from the visual. */
  FIXED = 'fixed',

  /** The size fills the available space, shared equally between siblings. */
  FILL = 'fill',

  /** The size is determined by the contents. */
  FIT = 'fit',

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
