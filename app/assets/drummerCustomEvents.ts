import { TypedEventTarget } from "remix/ui";
import { customEvents } from "./utils/customEvents.tsx";

const drummerEvents = customEvents<{
  play: { tempoBpm: number };
  stop: { tempoBpm: number };
  tempo: { tempoBpm: number };
}>();

export class DrummerCustomEvents extends TypedEventTarget<DrummerCustomEventMap> {
  #isPlaying = false;
  #tempoBpm = 90;

  constructor() {
    super();
    drummerEvents.host(this);
  }

  get isPlaying() {
    return this.#isPlaying;
  }

  get bpm() {
    return this.#tempoBpm;
  }

  setTempo(bpm: number) {
    this.#tempoBpm = Math.max(30, Math.min(300, Math.floor(bpm || 90)));
    this.dispatchEvent(drummerEvents.tempo({ tempoBpm: this.#tempoBpm }));
  }

  play(bpm = this.#tempoBpm) {
    this.setTempo(bpm);
    if (this.#isPlaying) return;
    this.#isPlaying = true;
    this.dispatchEvent(drummerEvents.play({ tempoBpm: this.#tempoBpm }));
  }

  stop() {
    if (!this.#isPlaying) return;
    this.#isPlaying = false;
    this.dispatchEvent(drummerEvents.stop({ tempoBpm: this.#tempoBpm }));
  }
}

export type DrummerCustomEventMap = (typeof drummerEvents)["eventMap"];
