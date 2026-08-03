import { clientEntry, on } from "remix/ui";
import { customEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, inputCss, rowCss, taskCss } from "./styles.ts";

type FlightKind = "one-way flight" | "return flight";
type Flight = {
  kind: FlightKind;
  startDate: string;
  returnDate: string;
};
type FlightEvents = Flight | "bookingConfirmed";

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  let [year, month, day] = value.split("-").map(Number);
  let date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function canBook({ kind, startDate, returnDate }: Flight) {
  if (!isValidDate(startDate)) return false;
  return (
    kind === "one-way flight" ||
    (isValidDate(returnDate) && returnDate >= startDate)
  );
}

function presentValidation(flight: Flight) {
  return {
    startDateInvalid: !isValidDate(flight.startDate),
    returnDateDisabled: flight.kind === "one-way flight",
    returnDateInvalid:
      flight.kind === "return flight" &&
      (!isValidDate(flight.returnDate) || flight.returnDate < flight.startDate),
  };
}

export const SevenGuisFlightBooker = clientEntry(
  import.meta.url,
  function SevenGuisFlightBooker(handle) {
    let today = new Date().toISOString().slice(0, 10);
    let flight = customEvents<FlightEvents>().withState({
      kind: "one-way flight",
      startDate: today,
      returnDate: today,
    });
    let confirmedFlight: Flight | null = null;
    return () => (
      <section
        mix={[
          taskCss,
          flight.events.on((event) => {
            if (event.type !== "bookingConfirmed") return handle.update();
          }),
        ]}
      >
        <h2>Flight Booker</h2>
        <select
          aria-label="Flight type"
          defaultValue={flight.state.kind}
          mix={[
            inputCss,
            on("change", ({ currentTarget }) => {
              flight.update((draft) => {
                draft.kind = currentTarget.value as FlightKind;
              });
            }),
          ]}
        >
          <option>one-way flight</option>
          <option>return flight</option>
        </select>
        <div mix={rowCss}>
          <input
            aria-label="Start date"
            defaultValue={flight.state.startDate}
            aria-invalid={presentValidation(flight.state).startDateInvalid}
            mix={[
              inputCss,
              on("input", ({ currentTarget }) => {
                flight.update((draft) => {
                  draft.startDate = currentTarget.value;
                });
              }),
            ]}
          />
          <input
            aria-label="Return date"
            defaultValue={flight.state.returnDate}
            disabled={presentValidation(flight.state).returnDateDisabled}
            aria-invalid={presentValidation(flight.state).returnDateInvalid}
            mix={[
              inputCss,
              on("input", ({ currentTarget }) => {
                flight.update((draft) => {
                  draft.returnDate = currentTarget.value;
                });
              }),
            ]}
          />
        </div>
        <button
          type="button"
          disabled={!canBook(flight.state)}
          mix={[
            buttonCss,
            on("click", () => {
              confirmedFlight = {
                kind: flight.state.kind,
                startDate: flight.state.startDate,
                returnDate: flight.state.returnDate,
              };
              flight.dispatchEvent(flight.events.create("bookingConfirmed"));
            }),
          ]}
        >
          Book
        </button>
        <flight.view.output
          on={flight.events.bookingConfirmed}
          hidden={({ detail }) => detail === undefined}
        >
          {({ detail }) => {
            if (detail === undefined || !confirmedFlight) return null;
            return confirmedFlight.kind === "one-way flight"
              ? `You have booked a one-way flight on ${confirmedFlight.startDate}.`
              : `You have booked a return flight from ${confirmedFlight.startDate} to ${confirmedFlight.returnDate}.`;
          }}
        </flight.view.output>
      </section>
    );
  },
);
