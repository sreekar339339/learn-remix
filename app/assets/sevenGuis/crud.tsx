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
  function SevenGuisCrud() {
    let model = customEvents<CrudModel>().withState({
      people: [
        { id: 1, name: "Hans", surname: "Emil" },
        { id: 2, name: "Max", surname: "Mustermann" },
        { id: 3, name: "Roman", surname: "Tisch" },
      ],
      prefix: "",
      selectedId: null,
      draft: { name: "", surname: "" },
      nextId: 4,
    });
    let peopleView = model.events.on(["people", "prefix", "selectedId"]);
    let draftView = model.events.on(["draft", "selectedId"]);

    return () => (
      <section mix={taskCss}>
        <h2>CRUD</h2>
        <label>
          Filter prefix{" "}
          <input
            aria-label="Filter prefix"
            defaultValue={model.prefix}
            mix={[
              inputCss,
              on("input", ({ currentTarget }) => {
                model.patch({ prefix: currentTarget.value });
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
          <peopleView.select
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
                model.patch({
                  selectedId: selected.id,
                  draft: { name: selected.name, surname: selected.surname },
                });
              }),
            ]}
            child={() =>
              visiblePeople(model.people, model.prefix).map(
                (person) => (
                  <option value={person.id}>
                    {person.surname}, {person.name}
                  </option>
                ),
              )
            }
          />
          <draftView.div
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
                        model.patch({
                          draft: {
                            ...model.draft,
                            name: currentTarget.value,
                          },
                        });
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
                        model.patch({
                          draft: {
                            ...model.draft,
                            surname: currentTarget.value,
                          },
                        });
                      }),
                    ]}
                  />
                </label>
                <div mix={rowCss}>
                  <button
                    type="button"
                    disabled={
                      !(
                        model.draft.name.trim() &&
                        model.draft.surname.trim()
                      )
                    }
                    mix={[
                      buttonCss,
                      on("click", () => {
                        let person = {
                          id: model.nextId,
                          ...model.draft,
                        };
                        model.patch({
                          people: [...model.people, person],
                          selectedId: person.id,
                          nextId: person.id + 1,
                        });
                      }),
                    ]}
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    disabled={
                      model.selectedId === null ||
                      !(
                        model.draft.name.trim() &&
                        model.draft.surname.trim()
                      )
                    }
                    mix={[
                      buttonCss,
                      on("click", () => {
                        if (model.selectedId === null) return;
                        model.patch({
                          people: model.people.map((person) =>
                            person.id === model.selectedId
                              ? { ...person, ...model.draft }
                              : person
                          ),
                        });
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
                      on("click", () => {
                        if (model.selectedId === null) return;
                        model.patch({
                          people: model.people.filter(
                            (person) => person.id !== model.selectedId,
                          ),
                          selectedId: null,
                          draft: { name: "", surname: "" },
                        });
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
