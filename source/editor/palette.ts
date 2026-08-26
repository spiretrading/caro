import { SizePolicy } from '../layout';

/** The colour a policy paints a box, taken from `xd_parser`, which decodes
    the drawings themselves. */
export const POLICY_COLOR = {
  [SizePolicy.FIXED]: '#FFB800',
  [SizePolicy.FILL]: '#0066FF',
  [SizePolicy.FIT]: '#00BF2D',
  [SizePolicy.REPEAT]: '#744BFF'
};

/** The darker shade of each policy colour, used where a colour meets the
    white behind it: an edge against a fill, or a word against a page. */
export const POLICY_EDGE = {
  [SizePolicy.FIXED]: '#B28100',
  [SizePolicy.FILL]: '#0047B2',
  [SizePolicy.FIT]: '#008620',
  [SizePolicy.REPEAT]: '#5135B2'
};

/** The colour a name is written in over each policy colour. */
export const POLICY_INK = {
  [SizePolicy.FIXED]: '#000000',
  [SizePolicy.FILL]: '#FFFFFF',
  [SizePolicy.FIT]: '#000000',
  [SizePolicy.REPEAT]: '#FFFFFF'
};
