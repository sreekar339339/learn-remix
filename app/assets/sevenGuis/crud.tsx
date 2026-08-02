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
                model.update((draft) => {
                  draft.prefix = currentTarget.value;
                });
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
          <model.events.select
            on={(event) => [event.people, event.prefix, event.selectedId]}
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
                model.update((draft) => {
                  draft.selectedId = selected.id;
                  draft.draft.name = selected.name;
                  draft.draft.surname = selected.surname;
                });
              }),
            ]}
          >
            {() =>
              visiblePeople(model.people, model.prefix).map((person) => (
                <option value={person.id}>
                  {person.surname}, {person.name}
                </option>
              ))
            }
          </model.events.select>
          <model.events.div
            on={(event) => [event.draft, event.selectedId]}
            mix={css({ display: "grid", gap: 8 })}
          >
            {() => (
              <>
                <label>
                  Name{" "}
                  <input
                    aria-label="Name"
                    value={model.draft.name}
                    mix={[
                      inputCss,
                      on("input", ({ currentTarget }) => {
                        model.update((draft) => {
                          draft.draft.name = currentTarget.value;
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
                        model.update((draft) => {
                          draft.draft.surname = currentTarget.value;
                        });
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
                      on("click", () => {
                        model.update((draft) => {
                          let person = {
                            id: draft.nextId++,
                            ...draft.draft,
                          };
                          draft.people.push(person);
                          draft.selectedId = person.id;
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
                      !(model.draft.name.trim() && model.draft.surname.trim())
                    }
                    mix={[
                      buttonCss,
                      on("click", () => {
                        if (model.selectedId === null) return;
                        model.update((draft) => {
                          let person = draft.people.find(
                            (person) => person.id === draft.selectedId,
                          );
                          if (person) Object.assign(person, draft.draft);
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
                        model.update((draft) => {
                          let index = draft.people.findIndex(
                            (person) => person.id === draft.selectedId,
                          );
                          if (index !== -1) draft.people.splice(index, 1);
                          draft.selectedId = null;
                          draft.draft.name = "";
                          draft.draft.surname = "";
                        });
                      }),
                    ]}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </model.events.div>
        </div>
      </section>
    );
  },
);
