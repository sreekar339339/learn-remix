import { TodolistIndex } from "../assets/todolist/index.tsx";
import { Layout } from "../ui/layout.tsx";

export function TodoListPage() {
  return () => (
    <Layout>
      <section>
        <h1>Todo-list</h1>
        <TodolistIndex />
      </section>
    </Layout>
  )
}