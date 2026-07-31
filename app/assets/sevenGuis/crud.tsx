import { clientEntry, css, on } from "remix/ui";
import { customEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, inputCss, rowCss, taskCss } from "./styles.ts";

type Person = {
  id: number;
  name: string;
  surname: string;
};

type CrudModel = {
  people: Array<Person>;
  prefix: string;
  selectedId: number | null;
  draft: { name: string; surname: string };
  nextId: number;
};

function visiblePeople(people: Array<Person>, prefix: string) {
  return people.filter((person) =>
    person.surname.toLowerCase().startsWith(prefix.toLowerCase()),
  );
}

export const SevenGuisCrud = clientEntry(
  import.meta.url,
  function SevenGuisCrud(handle) {
    let events = customEvents<
      "filterApplied" | "personSelected" | "draftEdited" | "peopleChanged"
    >();
    let peopleViewEvents = events.on(["filterApplied", "personSelected"]);
    let model: CrudModel = {
      people: [
        { id: 1, name: "Hans", surname: "Emil" },
        { id: 2, name: "Max", surname: "Mustermann" },
        { id: 3, name: "Roman", surname: "Tisch" },
      ],
      prefix: "",
      selectedId: null,
      draft: { name: "", surname: "" },
      nextId: 4,
    };

    return () => (
      <section
        mix={[
          taskCss,
          events.host(),
          events.on("peopleChanged", () => handle.update()),
        ]}
      >
        <h2>CRUD</h2>
        <label>
          Filter prefix{" "}
          <input
            aria-label="Filter prefix"
            defaultValue={model.prefix}
            mix={[
              inputCss,
              on("input", ({ currentTarget }) => {
                model.prefix = currentTarget.value;
                currentTarget.dispatchEvent(events("filterApplied"));
              }),
            ]}
          />
        </label>
        <div
          mix={[
            rowCss,
            css({
              display: "grid",
              gridTemplateColumns: "minmax(180px, 1fr) auto",
              alignItems: "start",
            }),
          ]}
        >
          <peopleViewEvents.select
            size={7}
            aria-label="People"
            value={() => model.selectedId ?? ""}
            mix={[
              inputCss,
              on("change", ({ currentTarget }) => {
                let selected = model.people.find(
                  (person) => person.id === Number(currentTarget.value),
                );
                if (!selected) return;
                model.selectedId = selected.id;
                model.draft.name = selected.name;
                model.draft.surname = selected.surname;
                currentTarget.dispatchEvent(
                  events(["personSelected", "draftEdited"]),
                );
              }),
            ]}
            child={() =>
              visiblePeople(model.people, model.prefix).map((person) => (
                <option value={person.id}>
                  {person.surname}, {person.name}
                </option>
              ))
            }
          />
          <events.on.draftEdited.div
            mix={css({ display: "grid", gap: 8 })}
            child={() => (
              <>
                <label>
                  Name{" "}
                  <input
                    aria-label="Name"
                    value={model.draft.name}
                    mix={[
                      inputCss,
                      on("input", ({ currentTarget }) => {
                        model.draft.name = currentTarget.value;
                        currentTarget.dispatchEvent(events("draftEdited"));
                      }),
                    ]}
                  />
                </label>
                <label>
                  Surname{" "}
                  <input
                    aria-label="Surname"
                    value={model.draft.surname}
                    mix={[
                      inputCss,
                      on("input", ({ currentTarget }) => {
                        model.draft.surname = currentTarget.value;
                        currentTarget.dispatchEvent(events("draftEdited"));
                      }),
                    ]}
                  />
                </label>
                <div mix={rowCss}>
                  <button
                    type="button"
                    disabled={
                      !(model.draft.name.trim() && model.draft.surname.trim())
                    }
                    mix={[
                      buttonCss,
                      on("click", ({ currentTarget }) => {
                        let person = { id: model.nextId, ...model.draft };
                        model.people.push(person);
                        model.selectedId = person.id;
                        model.nextId = person.id + 1;
                        currentTarget.dispatchEvent(events("peopleChanged"));
                      }),
                    ]}
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    disabled={
                      model.selectedId === null ||
                      !(model.draft.name.trim() && model.draft.surname.trim())
                    }
                    mix={[
                      buttonCss,
                      on("click", ({ currentTarget }) => {
                        if (model.selectedId === null) return;
                        let person = model.people.find(
                          (person) => person.id === model.selectedId,
                        );
                        if (!person) return;
                        person.name = model.draft.name;
                        person.surname = model.draft.surname;
                        currentTarget.dispatchEvent(events("peopleChanged"));
                      }),
                    ]}
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    disabled={model.selectedId === null}
                    mix={[
                      buttonCss,
                      on("click", ({ currentTarget }) => {
                        if (model.selectedId === null) return;
                        let index = model.people.findIndex(
                          (person) => person.id === model.selectedId,
                        );
                        if (index !== -1) model.people.splice(index, 1);
                        model.selectedId = null;
                        model.draft.name = "";
                        model.draft.surname = "";
                        currentTarget.dispatchEvent(events("peopleChanged"));
                      }),
                    ]}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          />
        </div>
      </section>
    );
  },
);
