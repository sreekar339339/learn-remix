import { clientEntry, Frame, type Handle } from "remix/ui";
import { AddTodo } from "./addTodo.tsx";
import { routes } from "../../routes.ts";
import { SemanticEventTarget } from "../utils/SemanticEventTarget.js";

type Context = 'todoItems' | 'addTodo'

type ActionEvent =
  | { type: "initiated", context: Context }
  | { type: "errored"; error: Error, context: Context }
  | { type: "succeeded", context: Context }
  | { type: "idle", context: Context };

export const TodoList = clientEntry(
  import.meta.url,
  function TodoList(handle: Handle<{}, SemanticEventTarget<ActionEvent>>) {
    let actionEventTarget = new SemanticEventTarget<ActionEvent>();
    handle.context.set(actionEventTarget);
    return () => (
      <>
        <AddTodo />
        <Frame name="todoItems" src={routes.todolist.todos.index.href()} />
      </>
    );
  },
);
