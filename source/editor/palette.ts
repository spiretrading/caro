import { SizePolicy } from '../layout';

/** The colour a policy paints a box, taken from `xd_parser`, which decodes
    the drawings themselves. */
export const POLICY_COLOR = {
  [SizePolicy.FIXED]: '#FFBB00',
  [SizePolicy.FILL]: '#0066FF',
  [SizePolicy.FIT]: '#00BF2D',
  [SizePolicy.REPEAT]: '#D7CBFF'
};

/** The colour the direction a box repeats in is marked in, which the
    specifications keep apart from the colour of the repeat itself. */
export const REPEAT_DIRECTION = '#744BFF';

/** The darker shade of each policy colour, used where a colour meets the
    white behind it: an edge against a fill, or a word against a page. */
export const POLICY_EDGE = {
  [SizePolicy.FIXED]: '#B28300',
  [SizePolicy.FILL]: '#0047B2',
  [SizePolicy.FIT]: '#008620',
  [SizePolicy.REPEAT]: '#5135B2'
};

/** The colour something amiss is written in. */
export const PROBLEM_COLOR = '#B22222';

/** The colour something worth another look is written in. */
export const WARNING_COLOR = '#8A6D00';

/** The colour a layout with nothing amiss is written in. */
export const VALID_COLOR = '#008620';

/** The colour a name is written in over each policy colour. */
export const POLICY_INK = {
  [SizePolicy.FIXED]: '#000000',
  [SizePolicy.FILL]: '#FFFFFF',
  [SizePolicy.FIT]: '#000000',
  [SizePolicy.REPEAT]: '#000000'
};
