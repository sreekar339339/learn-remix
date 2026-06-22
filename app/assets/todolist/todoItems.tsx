import {
  addEventListeners,
  clientEntry,
  css,
  on,
  type Dispatched,
  type Handle,
} from "remix/ui";
import { routes } from "../../routes.ts";
import type { Todo } from "../../data/todolist.ts";
import { RequestEventTarget } from "../utils/RequestEventTarget.js";

export const TodoItems = clientEntry(
  import.meta.url,
  function TodoItems(handle: Handle<{ todos: Todo[] }>) {
    let actionEventTarget = new RequestEventTarget();

    let submit = async (
      evt: Dispatched<SubmitEvent, HTMLFormElement>,
      signal: AbortSignal,
    ) => {
      evt.preventDefault();
      const formAction = new URL(
        (evt.submitter as HTMLButtonElement).formAction,
      );
      formAction.searchParams.set("redirectTo", "none");
      actionEventTarget.dispatchEvent("requestSubmitted");
      try {
        let resp = await fetch(formAction, {
          method: "POST",
          body: new FormData(evt.currentTarget),
          signal,
        });
        if (!resp.ok) new Error(resp.statusText, { cause: resp.status });
        if (signal.aborted) return;
        handle.frame.reload()
        actionEventTarget.dispatchEvent("requestSucceeded", {});
      } catch (error) {
        if (signal.aborted) return;
        actionEventTarget.dispatchEvent("requestErrored", {
          error: error as Error,
        });
      }
    };

    return () => {
      const { todos } = handle.props;
      return (
        <ul
          mix={[
            css({
              listStyleType: "none",
              padding: 0,
              "& > li": { marginTop: 4 },
            }),
          ]}
        >
          {todos.map(({ id, completed, text }) => (
            <li key={id}>
              <form
                method="POST"
                mix={[
                  on("submit", submit),
                  css({ display: "flex", alignItems: "center" }),
                ]}
              >
                <input hidden name="id" value={id} />
                <input hidden name="completed" value={String(completed)} />
                <button
                  hidden
                  formAction={routes.todolist.todos.action.href(null, {
                    intent: "update",
                    field: "text",
                  })}
                >
                  hidden submit button for input
                </button>
                <button
                  mix={[
                    css({
                      border: "none",
                      backgroundColor: "transparent",
                      cursor: "pointer",
                      paddingRight: 6,
                    }),
                  ]}
                  formAction={routes.todolist.todos.action.href(null, {
                    intent: "delete",
                  })}
                >
                  🗑️
                </button>
                <input
                  mix={[
                    css({
                      border: "1px solid transparent",
                      background: "transparent",
                      padding: 0,
                      font: "inherit",
                      color: "inherit",
                      outline: "none",
                      flex: 1,
                      "&:focus,&:hover": {
                        borderColor: "#888",
                      },
                    }),
                  ]}
                  defaultValue={text}
                  name="text"
                />
                <button
                  formAction={routes.todolist.todos.action.href(null, {
                    intent: "update",
                    field: "completed",
                  })}
                  mix={[
                    css({
                      width: "20px",
                      height: "20px",
                      borderRadius: "9999px",
                      border: "1px solid #ccc",
                      backgroundColor: "#fff",
                      color: "#111",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      cursor: "pointer",
                      padding: 0,
                    }),
                  ]}
                >
                  {completed ? "✓" : " "}
                </button>
              </form>
            </li>
          ))}
        </ul>
      );
    };
  },
);
