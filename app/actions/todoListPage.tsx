import { Layout } from "../ui/layout.tsx";
import { TodoList } from "../assets/todolist/todoList.tsx";
import type { Handle } from "remix/ui";
import type { Todo } from "../data/todolist.ts";

export function TodoListPage(handle: Handle<{todos: Todo[]}>) {
  return () => (
    <Layout>
      <section>
        <h1>Todo-list</h1>
        <TodoList todos={handle.props.todos} />
      </section>
    </Layout>
  )
}