import {
  addEventListeners,
  clientEntry,
  css,
  ref,
  TypedEventTarget,
  type Handle,
  type RefCallback,
} from "remix/ui";
import { routes } from "../../routes.ts";
import type { Todo } from "../../data/todolist.ts";
import { _TodoList, type TodoActionEventMap } from "./todoList.tsx";
import { getInput } from "../utils/dom.ts";
import { dispatchCustomEvent } from "../utils/customEvent.ts";

export function TodoItems(handle: Handle<{ todos: Todo[] }>) {
  let listRef: RefCallback<HTMLUListElement> = (list, signal) => {
    let actionTarget = new TypedEventTarget<TodoActionEventMap>
    addEventListeners(actionTarget, signal, {
      change(evt) {
        if (!evt.detail.event) return
        let { type, detail } = evt.detail.event
        let input = getInput(detail.form)
        if (input) {
          if (type === 'actionSubmitted') {
            input.select();
            input.classList.add("pending");
            input.disabled = true
          } else {
            if (type === 'actionSucceeded') {
              const end = input.value.length;
              input.setSelectionRange(end, end);
            } 
            if (type === 'actionErrored') {
              input.value = input.defaultValue
            }
            input.classList.remove("pending");
            input.disabled = false
          }
        }
        list.parentElement?.dispatchEvent(new CustomEvent(evt.type, evt))
      }
    })
    addEventListeners(list, signal, {
      focusout(evt) {
        if (!(evt.target instanceof HTMLInputElement)) return;
        let input = evt.target
        if (input.classList.contains('pending')) return
        input.value = input.defaultValue;
      },
      async submit(evt) {
        let dispatch = dispatchCustomEvent(actionTarget, signal);
        evt.preventDefault();
        let form = evt.target as HTMLFormElement;
        let formData = new FormData(form, evt.submitter);
        formData.set("redirectTo", "none");
        try {
          dispatch("actionSubmitted", { form });
          // await new Promise((res, rej) => setTimeout(rej, 25000, new Error('laude lag gaye')));
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
          await handle.frame.reload();
          dispatch("actionSucceeded", { form });
        } catch (error) {
          dispatch("actionErrored", { error: error as Error, form });
        }
      },
    });
  };

  return () => (
    <ul
      mix={[
        ref(listRef),
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
