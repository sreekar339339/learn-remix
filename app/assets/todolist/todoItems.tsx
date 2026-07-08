import {
  clientEntry,
  css,
  on,
  TypedEventTarget,
  type Dispatched,
  type Handle,
} from "remix/ui";
import { routes } from "../../routes.ts";
import type { Todo } from "../../data/todolist.ts";
import {
  _TodoList,
  actionTarget,
  type TodoActionEventMap,
} from "./todoList.tsx";
import { dispatchCustomEvent } from "../utils/customEvent.ts";
import { onTarget, sourceContainsElement } from "../utils/onTarget.ts";


export function TodoItems(
  handle: Handle<{ todos: Todo[] }, TypedEventTarget<TodoActionEventMap>>,
) {
  const onAction = onTarget.with({
    target: actionTarget,
    guard: sourceContainsElement,
  });

  let onSubmit = async (
    evt: Dispatched<SubmitEvent, HTMLUListElement>,
  ) => {
    evt.preventDefault();
    let form = evt.target as HTMLFormElement;
    let submitter = evt.submitter as HTMLButtonElement;
    let formData = new FormData(form, submitter);
    formData.set("redirectTo", "none");
    let dispatch = dispatchCustomEvent.bind(null, {
      target: actionTarget,
      signal: handle.signal,
      source: form,
    });
    try {
      dispatch({ actionSubmitted: null });
      // await new Promise((res, rej) => setTimeout(rej, 25000, new Error('laude lag gaye')));
      let resp = await fetch(form.action, {
        method: "POST",
        body: formData,
        signal: handle.signal
      });
      if (!resp.ok) {
        throw new Error(`${resp.status} ${resp.statusText}`, {
          cause: await resp.text(),
        });
      }
      await handle.frame.reload();
      dispatch({ actionSucceeded: null });
    } catch (error) {
      dispatch({ actionErrored: { error: error as Error } });
    }
  };

  return () => (
    <ul
      mix={[
        css({
          listStyleType: "none",
          padding: 0,
          "& > li": { marginTop: 4 },
        }),
        on("submit", onSubmit),
      ]}
    >
      {handle.props.todos.map(({ id, completed, text }) => (
        <li
          key={id}
          mix={[
            css({
              display: "flex",
              alignItems: "center",
              "& > form:nth-child(2)": {
                flex: "1",
                "& > input": {
                  width: "95%",
                },
              },
            }),
          ]}
        >
          <form method="POST" action={routes.todolist.todos.action.href()}>
            <button
              mix={[
                css({
                  position: "relative",
                  width: 28,
                  height: 28,
                  border: "none",
                  borderRadius: "9999px",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  "&.pending": {
                    color: "var(--text-primary)",
                  },
                  "&.pending::before": {
                    content: '""',
                    position: "absolute",
                    inset: -3,
                    borderRadius: "9999px",
                    border: "2px solid transparent",
                    borderTopColor: "var(--brand-blue)",
                    borderRightColor: "rgba(45, 172, 249, 0.35)",
                    animation: "todoActionSpin 0.75s linear infinite",
                    pointerEvents: "none",
                  },
                  "@media (prefers-reduced-motion: reduce)": {
                    "&.pending::before": {
                      animation: "none",
                    },
                  },
                }),
                onAction("change", (event, button) => {
                  let isActionSubmitted = event.detail.type === "actionSubmitted";
                  button.classList.toggle("pending", isActionSubmitted);
                  button.toggleAttribute("disabled", isActionSubmitted);
                }),
              ]}
              name="intent"
              value="delete"
            >
              🗑️
            </button>
            <input hidden name="id" value={id} />
          </form>
          <TextForm text={text} id={id} />
          <form method="POST" action={routes.todolist.todos.action.href()}>
            <input hidden name="completed" value={String(!completed)} />
            <input hidden name="id" value={id} />
            <button
              mix={[
                css({
                  position: "relative",
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
                  "&.pending::before": {
                    content: '""',
                    position: "absolute",
                    inset: -4,
                    borderRadius: "9999px",
                    border: "2px solid transparent",
                    borderTopColor: "var(--brand-blue)",
                    borderRightColor: "rgba(45, 172, 249, 0.35)",
                    animation: "todoActionSpin 0.75s linear infinite",
                    pointerEvents: "none",
                  },
                  "@media (prefers-reduced-motion: reduce)": {
                    "&.pending::before": {
                      animation: "none",
                    },
                  },
                }),
                onAction("change", (event, button) => {
                  let isActionSubmitted = event.detail.type === "actionSubmitted";
                  button.classList.toggle("pending", isActionSubmitted);
                  button.toggleAttribute("disabled", isActionSubmitted);
                }),
              ]}
              name="intent"
              value="update"
            >
              {completed ? "✓" : " "}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function TextForm(handle: Handle<{ text: string; id: string }>) {
  const onAction = onTarget.with({
    target: actionTarget,
    guard: sourceContainsElement,
  });
  let isActionSubmitted: boolean = false
  return () => (
    <form
      mix={[
        onAction("actionErrored", (_, form) => {
          form.reset();
        }),
        on("focusout", ({currentTarget}) => {
          if (isActionSubmitted) return;
          currentTarget.reset();
        }),
      ]}
      method="POST"
      action={routes.todolist.todos.action.href()}
    >
      <button hidden name="intent" value="update" />
      <input hidden name="id" value={handle.props.id} />
      <input
        mix={[
          onAction("change", (event, input) => {
            isActionSubmitted = event.detail.type === "actionSubmitted";
            input.classList.toggle("pending", isActionSubmitted);
            input.toggleAttribute("disabled", isActionSubmitted);
          }),
          css({
            borderColor: "transparent",
            backgroundColor: "transparent",
            padding: 2,
            font: "inherit",
            color: "inherit",
            outline: "none",
            "&:focus,&:hover": {
              backgroundColor: "revert",
              outline: "revert",
              borderColor: "revert",
            },
            "&.pending": {
              backgroundImage:
                "linear-gradient(100deg, transparent 0%, transparent 35%, rgba(45, 172, 249, 0.28) 50%, transparent 65%, transparent 100%)",
              backgroundSize: "220% 100%",
              animation: "glimmer 1.15s linear infinite",
            },
            "@media (prefers-reduced-motion: reduce)": {
              "&.pending": {
                animation: "none",
              },
            },
          }),
        ]}
        defaultValue={handle.props.text}
        name="text"
      />
    </form>
  );
}

export const TodoItemsClientEntryMarked = clientEntry(
  import.meta.url,
  function TodoItemsClientEntryMarked(handle: Handle<{ todos: Todo[] }>) {
    return () => <TodoItems todos={handle.props.todos} />;
  },
);
