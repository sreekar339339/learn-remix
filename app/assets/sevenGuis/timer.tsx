import { clientEntry, on, ref } from "remix/ui";
import { customEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, inputCss, rowCss, taskCss } from "./styles.ts";

type TimerModel = { elapsed: number; duration: number };
export const SevenGuisTimer = clientEntry(
  import.meta.url,
  function SevenGuisTimer() {
    let timer = customEvents<TimerModel>().withState({
      elapsed: 0,
      duration: 10,
    });
    return () => (
      <section
        mix={[
          taskCss,
          ref((_, signal) => {
            let last = performance.now();
            let id = window.setInterval(() => {
              let now = performance.now();
              let delta = (now - last) / 1000;
              last = now;
              if (timer.elapsed >= timer.duration) return;
              timer.update((draft) => {
                draft.elapsed = Math.min(
                  draft.duration,
                  draft.elapsed + delta,
                );
              });
            }, 100);
            signal.addEventListener("abort", () => window.clearInterval(id), {
              once: true,
            });
          }),
        ]}
      >
        <h2>Timer</h2>
        <div>
          <timer.events.progress
            on={(event) => [event.elapsed, event.duration]}
            value={() => Math.min(1, timer.elapsed / timer.duration)}
            max={1}
          />
          <timer.events.output
            on={(event) => event.elapsed}
            children={(event) => `${event.detail.toFixed(1)}s elapsed`}
          />
        </div>
        <label mix={rowCss}>
          Duration
          <input
            type="range"
            min={1}
            max={30}
            step={0.5}
            defaultValue={10}
            mix={[
              inputCss,
              on("input", ({ currentTarget }) => {
                let duration = currentTarget.valueAsNumber;
                timer.update((draft) => {
                  draft.duration = duration;
                  draft.elapsed = Math.min(draft.elapsed, duration);
                });
              }),
            ]}
          />
          <timer.events.span
            on={(event) => event.duration}
            children={(event) => `${event.detail.toFixed(1)}s`}
          />
        </label>
        <button
          type="button"
          mix={[
            buttonCss,
            on("click", () => {
              timer.update((draft) => {
                draft.elapsed = 0;
              });
            }),
          ]}
        >
          Reset
        </button>
      </section>
    );
  },
);
