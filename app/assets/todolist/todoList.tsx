import { addEventListeners, clientEntry, Frame, type Handle } from "remix/ui";
import { AddTodo } from "./addTodo.tsx";
import { routes } from "../../routes.ts";
import { SemanticEventTarget } from "../utils/SemanticEventTarget.js";
import { Glyph } from "remix/ui/glyph";
import { TodoItems } from "./todoItems.tsx";
import type { Todo } from "../../data/todolist.ts";
import { RequestEventTarget } from "../utils/RequestEventTarget.js";


export const TodoList = clientEntry(
  import.meta.url,
  function TodoList(
    handle: Handle<{todos: Todo[]}, RequestEventTarget<unknown>>,
  ) {
    handle.context.set(new RequestEventTarget())
    return () => (
      <>
        <AddTodo />
        <Spinner />
        {/* <Frame name="todoItems" src={routes.todolist.todos.index.href()} /> */}
        <TodoItems todos={handle.props.todos} />
      </>
    );
  },
);

function Spinner(handle: Handle) {
  let actionEventTarget = handle.context.get(TodoList);
  let spinnerRevealTimeoutId: any;
  addEventListeners(actionEventTarget, handle.signal, {
    async change(evt) {
      if (evt.type === "requestSubmitted") {
        spinnerRevealTimeoutId = setTimeout(() => handle.update(), 900);
      } else {
        clearTimeout(spinnerRevealTimeoutId);
        handle.update();
      }
    },
  });

  return () => (
    <Glyph
      visibility={
        actionEventTarget.event.type === "requestSubmitted"
          ? "visible"
          : "hidden"
      }
      name="spinner"
      height={24}
      width={24}
    />
  );
}
