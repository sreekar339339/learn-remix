import {
  addEventListeners,
  clientEntry,
  css,
  ref,
  type Handle,
  type Props,
} from "remix/ui";
import { routes } from "../../routes.ts";
import type { Todo } from "../../data/todolist.ts";
import { _TodoList, type TodoActionEventMap } from "./todoList.tsx";
import { getInput } from "../utils/dom.ts";
import { dispatchCustomEvent } from "../utils/customEvent.ts";

interface TodoItemsProps extends Props<"ul"> {
  todos: Todo[];
}

export function TodoItems(handle: Handle<TodoItemsProps>) {
  let actionEventTargetRef = (target: TodoActionEventMap["target"]["ul"]) => {
    let lastEvent:
      | TodoActionEventMap["types"]["todo:change"]["detail"]
      | undefined;
    addEventListeners(target, handle.signal, {
      "todo:actionSubmitted"({ detail }) {
        getInput(detail.form)?.select();
      },
      "todo:actionSucceeded"({ detail }) {
        let input = getInput(detail.form);
        if (!input) return;
        const end = input.value.length;
        input.setSelectionRange(end, end);
      },
      "todo:change"(evt) {
        lastEvent = evt.detail;
      },
      focusout(evt) {
        if (!lastEvent) return;
        if (
          !(lastEvent.event === 'todo:actionErrored') ||
          !lastEvent.detail.form
        )
          return;
        let { form } = lastEvent.detail;
        dispatchCustomEvent(target, handle.signal, "todo:idle");
        let inputInErrorEvt = getInput(form);
        if (!(evt.target instanceof HTMLInputElement)) return;
        if (inputInErrorEvt !== evt.target) return;
        inputInErrorEvt.value = inputInErrorEvt.defaultValue;
      },
      async submit(evt, signal) {
        let dispatch = dispatchCustomEvent(target, signal);
        evt.preventDefault();
        let form = evt.target as HTMLFormElement;
        let formData = new FormData(form, evt.submitter);
        formData.set("redirectTo", "none");
        try {
          dispatch("todo:actionSubmitted", { form });
          // await new Promise((res) => setTimeout(res, 1000));
          let resp = await fetch(form.action, {
            method: "POST",
            body: formData,
            signal,
          });
          if (!resp.ok) {
            throw new Error(`${resp.status} ${resp.statusText}`, {
              cause: await resp.text(),
            });
          }
          // await new Promise((res, rej) => setTimeout(rej, 0, new Error('laude lag gaye')));
          await handle.frame.reload();
          dispatch("todo:actionSucceeded", { form });
        } catch (error) {
          dispatch(
            "todo:actionErrored",
            { error: error as Error, form },
          );
        }
      },
    });
  };

  return () => (
    <ul
      mix={[
        ref(actionEventTargetRef),
        css({
          listStyleType: "none",
          padding: 0,
          "& > li": { marginTop: 4 },
        }),
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
          <form method="POST" action={routes.todolist.todos.action.href()}>
            <button hidden name="intent" value="update" />
            <input
              mix={[
                css({
                  borderColor: "transparent",
                  background: "transparent",
                  padding: 2,
                  font: "inherit",
                  color: "inherit",
                  outline: "none",
                  flex: 1,
                  "&:focus,&:hover": {
                    background: "revert",
                    outline: "revert",
                    borderColor: "revert",
                  },
                }),
              ]}
              defaultValue={text}
              name="text"
            />
            <input hidden name="id" value={id} />
          </form>
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

export const TodoItemsClientEntryMarked = clientEntry(
  import.meta.url,
  function TodoItemsClientEntryMarked(handle: Handle<{ todos: Todo[] }>) {
    return () => <TodoItems todos={handle.props.todos} />;
  },
);
