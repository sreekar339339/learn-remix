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
    let progressEvents = timer.events.on(["elapsed", "duration"]);

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
              timer.patch({
                elapsed: Math.min(timer.duration, timer.elapsed + delta),
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
          <progressEvents.progress
            value={() => Math.min(1, timer.elapsed / timer.duration)}
            max={1}
          />
          <timer.events.on.elapsed.output
            child={() => `${timer.elapsed.toFixed(1)}s elapsed`}
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
                timer.patch({
                  duration,
                  elapsed: Math.min(timer.elapsed, duration),
                });
              }),
            ]}
          />
          <timer.events.on.duration.span
            child={() => `${timer.duration.toFixed(1)}s`}
          />
        </label>
        <button
          type="button"
          mix={[
            buttonCss,
            on("click", () => {
              timer.patch({ elapsed: 0 });
            }),
          ]}
        >
          Reset
        </button>
      </section>
    );
  },
);
