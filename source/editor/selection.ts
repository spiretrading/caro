const MARKER = '[data-keeps-selection]';

/** Returns whether a mouse press landed where the selection is kept. */
export function keepsSelection(target: EventTarget): boolean {
  if(!(target instanceof Element)) {
    return false;
  }
  return target.closest(MARKER) !== null;
}
