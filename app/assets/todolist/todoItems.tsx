import {
  addEventListeners,
  clientEntry,
  css,
  on,
  ref,
  TypedEventTarget,
  type Dispatched,
  type Handle,
  type RefCallback,
} from "remix/ui";
import { routes } from "../../routes.ts";
import type { Todo } from "../../data/todolist.ts";
import {
  _TodoList,
  actionTarget,
  type TodoActionEventMap,
} from "./todoList.tsx";
import { dispatchCustomEvent } from "../utils/customEvent.ts";

export function TodoItems(
  handle: Handle<{ todos: Todo[] }, TypedEventTarget<TodoActionEventMap>>,
) {
  let onSubmit = async (
    evt: Dispatched<SubmitEvent, HTMLUListElement>,
  ) => {
    evt.preventDefault();
    let form = evt.target as HTMLFormElement;
    let submitter = evt.submitter as HTMLButtonElement;
    let formData = new FormData(form, submitter);
    formData.set("redirectTo", "none");
    let dispatch = dispatchCustomEvent(actionTarget, handle.signal);
    try {
      dispatch("actionSubmitted", { form });
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
      dispatch("actionSucceeded", { form });
    } catch (error) {
      dispatch("actionErrored", { error: error as Error, form });
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
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  paddingRight: 6,
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
  let actionEvent: TodoActionEventMap["change"]["detail"]["event"];
  return () => (
    <form
      mix={[
        ref((form, signal) => {
          addEventListeners(actionTarget, signal, {
            async change({ detail: { event } }) {
              if (event?.detail.form !== form) return;
              actionEvent = event;
              handle.update();
            },
            actionErrored({ detail }) {
              if (detail.form !== form) return;
              form.reset();
            },
          });
        }),
        on("focusout", (evt => {
          if (actionEvent?.type === "actionSubmitted") return;
          evt.currentTarget.reset()
        })),
      ]}
      method="POST"
      action={routes.todolist.todos.action.href()}
    >
      <button hidden name="intent" value="update" />
      <input hidden name="id" value={handle.props.id} />
      <input
        class={actionEvent?.type === "actionSubmitted" ? "pending" : ""}
        disabled={actionEvent?.type === "actionSubmitted"}
        mix={[
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
