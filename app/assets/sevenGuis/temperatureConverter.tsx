import { clientEntry, on } from "remix/ui";
import { customEvents } from "../utils/customEvents/index.tsx";
import { inputCss, rowCss, taskCss } from "./styles.ts";

function parseTemperature(value: string) {
  let number = Number(value);
  return Number.isFinite(number) && value.trim() !== "" ? number : undefined;
}

function formatTemperature(value: number) {
  return Number(value.toFixed(2)).toString();
}

export const SevenGuisTemperatureConverter = clientEntry(
  import.meta.url,
  function SevenGuisTemperatureConverter() {
    let temperature = customEvents<{
      celsius: string;
      fahrenheit: string;
    }>().withState({ celsius: "", fahrenheit: "" });

    return () => (
      <section mix={taskCss}>
        <h2>Temperature Converter</h2>
        <div mix={rowCss}>
          <temperature.view.input
            on={temperature.events.celsius}
            aria-label="Celsius"
            value={(event) => event.detail}
            mix={[
              inputCss,
              on("input", ({ currentTarget }) => {
                let value = currentTarget.value;
                let number = parseTemperature(value);
                if (number === undefined) return;
                temperature.update((draft) => {
                  draft.celsius = value;
                  draft.fahrenheit = formatTemperature(number * (9 / 5) + 32);
                });
              }),
            ]}
          />
          <span>Celsius =</span>
          <temperature.view.input
            on={temperature.events.fahrenheit}
            aria-label="Fahrenheit"
            value={(event) => event.detail}
            mix={[
              inputCss,
              on("input", ({ currentTarget }) => {
                let value = currentTarget.value;
                let number = parseTemperature(value);
                if (number === undefined) return;
                temperature.update((draft) => {
                  draft.celsius = formatTemperature((number - 32) * (5 / 9));
                  draft.fahrenheit = value;
                });
              }),
            ]}
          />
          <span>Fahrenheit</span>
        </div>
      </section>
    );
  },
);
