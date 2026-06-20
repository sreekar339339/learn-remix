/**
 * An `EventTarget` subclass with typed event maps.
 */
export class SemanticEventTarget extends EventTarget {
  constructor(changeEventListener, options) {
    super()
    if (changeEventListener) {
      this.addEventListener('change', changeEventListener, options)
    }
  }
  dispatchEvent(shape) {
    super.dispatchEvent(new CustomEvent('change', {detail: shape}))
    super.dispatchEvent(new CustomEvent(shape.type, {detail: shape}))
  }
  addEventListener(type, listener, options) {
    super.addEventListener(type, (evt) => listener(evt.detail), options)
  }
  removeEventListener(type, listener, options) {
    super.removeEventListener(type, (evt) => listener(evt.detail), options)
  }
}