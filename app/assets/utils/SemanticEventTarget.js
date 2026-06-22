export class SemanticEventTarget extends EventTarget {
  __eventMap;

  event;
  state;

  #listeners = new Map();
  #kind;
  #reducer;

  constructor(init) {
    super();

    if (!init || typeof init !== "object") {
      throw new TypeError(
        "SemanticEventTarget requires an init object with either `event` or `state`.",
      );
    }

    const hasEvent = Object.prototype.hasOwnProperty.call(init, "event");

    const hasState = Object.prototype.hasOwnProperty.call(init, "state");

    if (!hasEvent && !hasState) {
      throw new TypeError(
        "SemanticEventTarget init must contain either `event` or `state`.",
      );
    }

    this.#kind = hasEvent ? "event" : "object";
    this.#reducer = init.reducer;

    this.event = hasEvent ? init.event : undefined;

    this.state = hasState ? init.state : init.event;

    if (init.onChange) {
      this.addEventListener("change", init.onChange, init.options);
    }
  }

  addEventListener(type, listener, options = {}) {
    if (
      listener == null ||
      (typeof listener !== "function" &&
        typeof listener.handleEvent !== "function")
    ) {
      return;
    }

    const normalizedOptions =
      typeof options === "boolean" ? { capture: options } : options;

    let listeners = this.#listeners.get(type);

    if (!listeners) {
      listeners = new Set();
      this.#listeners.set(type, listeners);
    }

    for (const entry of listeners) {
      if (entry.listener === listener) {
        return;
      }
    }

    const entry = {
      listener,
      once: Boolean(normalizedOptions.once),
      signal: normalizedOptions.signal,
      abortHandler: undefined,
    };

    if (entry.signal?.aborted) {
      return;
    }

    if (entry.signal) {
      entry.abortHandler = () => {
        listeners.delete(entry);
      };

      entry.signal.addEventListener("abort", entry.abortHandler, {
        once: true,
      });
    }

    listeners.add(entry);
  }

  removeEventListener(type, listener) {
    const listeners = this.#listeners.get(type);

    if (!listeners) {
      return;
    }

    for (const entry of [...listeners]) {
      if (entry.listener === listener) {
        if (entry.signal && entry.abortHandler) {
          entry.signal.removeEventListener("abort", entry.abortHandler);
        }

        listeners.delete(entry);
      }
    }

    if (listeners.size === 0) {
      this.#listeners.delete(type);
    }
  }

  dispatchEvent(arg1, arg2) {
    if (arg1 instanceof Event) {
      return super.dispatchEvent(arg1);
    }

    return this.#dispatchSemanticEvent(arg1, arg2);
  }

  async #dispatchSemanticEvent(type, payload = {}) {
    const normalized =
      this.#kind === "event"
        ? this.#normalizeEventDispatch(type, payload)
        : this.#normalizeObjectDispatch(type, payload);

    this.event = normalized.event;

    await this.#updateState(normalized);

    await Promise.all([
      ...this.#invokeListeners(type, normalized.listenerPayload),
      ...this.#invokeListeners("change", normalized.event),
    ]);

    super.dispatchEvent(
      new CustomEvent(type, {
        detail: normalized.listenerPayload,
      }),
    );

    super.dispatchEvent(
      new CustomEvent("change", {
        detail: normalized.event,
      }),
    );
  }

  #normalizeEventDispatch(type, payload) {
    const event =
      payload && typeof payload === "object" ? { type, ...payload } : { type };

    return {
      kind: "event",
      type,
      payload,
      listenerPayload: payload,
      event,
      statePatch: event,
      stateKey: undefined,
    };
  }

  #normalizeObjectDispatch(type, payload) {
    if (!type.endsWith("Change")) {
      throw new TypeError(
        `POJO-backed SemanticEventTarget expects event names ending in "Change". Received "${type}".`,
      );
    }

    const key = type.slice(0, -"Change".length);

    const event = {
      type,
      [key]: payload,
    };

    const statePatch = {
      [key]: payload,
    };

    return {
      kind: "object",
      type,
      payload,
      listenerPayload: payload,
      event,
      statePatch,
      stateKey: key,
    };
  }

  async #updateState(normalized) {
    if (this.#reducer) {
      const nextState = await this.#reducer(this.state, normalized.event, {
        kind: normalized.kind,
        type: normalized.type,
        payload: normalized.payload,
        stateKey: normalized.stateKey,
        statePatch: normalized.statePatch,
      });

      if (nextState !== undefined) {
        this.state = nextState;
      }

      return;
    }

    if (normalized.kind === "event") {
      this.state = normalized.event;
      return;
    }

    if (this.state && typeof this.state === "object") {
      Object.assign(this.state, normalized.statePatch);
    } else {
      this.state = { ...normalized.statePatch };
    }
  }

  #invokeListeners(type, payload) {
    const listeners = this.#listeners.get(type);

    if (!listeners?.size) {
      return [];
    }

    const promises = [];

    for (const entry of [...listeners]) {
      const { listener, once, signal } = entry;

      if (signal?.aborted) {
        listeners.delete(entry);
        continue;
      }

      try {
        const result =
          typeof listener === "function"
            ? listener(payload)
            : listener.handleEvent(payload);

        promises.push(Promise.resolve(result));
      } finally {
        if (once) {
          listeners.delete(entry);
        }
      }
    }

    if (listeners.size === 0) {
      this.#listeners.delete(type);
    }

    return promises;
  }
}
