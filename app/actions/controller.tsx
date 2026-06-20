import { createController } from "remix/router";
import { routes } from "../routes.ts";
import { TicTacToePage } from "./ticTacToePage.tsx";
import {
  AsyncActionsPageWithFrame,
  AsyncActionsPageWithoutFrame,
} from "./asyncActionsPage.tsx";
import { Index } from "./index.tsx";
import { assetServer } from "../assets.ts";
import { SuperHeaders } from "remix/headers";
import { match, P } from "ts-pattern";
import * as s from "remix/data-schema";
import { TodoListPage } from "./todoListPage.tsx";
import {
  addTodos,
  deleteTodos,
  todos,
  updateTodos,
} from "../data/todolist.ts";
import { redirect } from "remix/response/redirect";
import * as f from "remix/data-schema/form-data";
import { maxLength, minLength } from "remix/data-schema/checks";
import { TodoItems } from "../assets/todolist/todoItems.tsx";
import * as coerce from "remix/data-schema/coerce";

export const rootController = createController(routes, {
  actions: {
    ticTacToe({ render }) {
      return render(<TicTacToePage />);
    },
    index({ render, url }) {
      return render(<Index url={url} />);
    },
    async assets(context) {
      return (
        (await assetServer.fetch(context.request)) ??
        new Response("Not Found", { status: 404 })
      );
    },
  },
});

type SearchEvent =
  | { type: "error"; error: Error }
  | { type: "booksFound"; books: Array<{ title: string }> }
  | { type: "booksNotFound"; reason: "emptyList" | { other: string } };

const openLibrarySchema = s.union([
  s.object({
    docs: s.array(
      s.object({
        title: s.string(),
      }),
    ),
  }),
  s.object({
    detail: s.array(s.object({ msg: s.string() })),
  }),
]);

export const asyncActionsWithFrameController = createController(
  routes.asyncActions.withFrame,
  {
    actions: {
      index({ render, url }) {
        const initialQuery = (url.searchParams.get("q") || "").trim();
        return render(
          <AsyncActionsPageWithFrame initialQuery={initialQuery} />,
        );
      },
      async frame({ render, url }) {
        openLibraryUrl.searchParams.set(
          "q",
          (url.searchParams.get("q") || "").trim(),
        );
        openLibraryUrl.searchParams.set("limit", "20");
        let searchEvent: SearchEvent;

        try {
          let resp = await fetch(openLibraryUrl);
          if (!resp.ok)
            throw new Error(resp.statusText, { cause: resp.status });
          let json = await resp.json();
          searchEvent = match(s.parseSafe(openLibrarySchema, json))
            .returnType<SearchEvent>()
            .with(
              { value: { detail: [P.select(), ...P.array()] } },
              ({ msg }) => ({
                type: "booksNotFound",
                reason: { other: msg },
              }),
            )
            .with({ value: { docs: [] } }, () => ({
              type: "booksNotFound",
              reason: "emptyList",
            }))
            .with({ value: { docs: P.select() } }, (books) => ({
              type: "booksFound",
              books,
            }))
            .otherwise(() => ({
              type: "booksNotFound",
              reason: { other: "response shape mismatch" },
            }));
        } catch (error) {
          searchEvent = {
            type: "error",
            error: error as Error,
          };
        }

        return render(
          match(searchEvent)
            .with({ type: "booksFound" }, ({ books }) => (
              <ul>
                {books.map((book) => (
                  <li>{book.title}</li>
                ))}
              </ul>
            ))
            .with({ type: "booksNotFound", reason: "emptyList" }, () => (
              <p>Books not found for this title at this time.</p>
            ))
            .with(
              { type: "booksNotFound", reason: { other: P.select() } },
              (msg) => <p>Could not fetch books. reason: {msg}.</p>,
            )
            .with({ type: "error" }, ({ error }) => (
              <p>
                Unexpected error occured, try again! {error.message} Cause:{" "}
                {error.cause as string}.
              </p>
            ))
            .exhaustive(),
        );
      },
    },
  },
);

const openLibraryUrl = new URL("https://openlibrary.org/search.json");

export const asyncActionsWithoutFrameApiController = createController(
  routes.asyncActions.withoutFrame.api,
  {
    actions: {
      async books({ url }) {
        openLibraryUrl.searchParams.set(
          "q",
          (url.searchParams.get("q") || "").trim(),
        );
        openLibraryUrl.searchParams.set("limit", "20");
        const resp = await fetch(openLibraryUrl);
        const headers = new SuperHeaders(resp.headers);
        headers.contentEncoding = null;
        return new Response(resp.body, { ...resp, headers });
      },
    },
  },
);

export const asyncActionsWithoutFrameController = createController(
  routes.asyncActions.withoutFrame,
  {
    actions: {
      index({ render, url }) {
        return render(
          <AsyncActionsPageWithoutFrame
            initialQuery={(url.searchParams.get("q") || "").trim()}
          />,
        );
      },
    },
  },
);

let delay = (ms = 2000) => new Promise((res) => setTimeout(res, ms));

export const todolistController = createController(routes.todolist, {
  actions: {
    index({ render }) {
      return render(<TodoListPage />);
    },
  },
});

const intent = {
  create: "create",
  delete: "delete",
  update: "update",
  none: "none",
} as const;

const inputFields = {
  redirectTo: f.field(s.optional(s.literal(intent.none))),
  intent<T>(val: T) { return f.field(s.literal(val)) },
  textField: f.field(s.defaulted(s.string().pipe(minLength(3), maxLength(100)), ""))
}

const todoSchema = f.object({
  id: f.field(s.string().pipe()),
  text: inputFields.textField,
  completed: f.field(coerce.boolean()),
});

const todoActionInputSchema = s.union([
  s.object({
    searchParams: f.object({
      intent: inputFields.intent(intent.create),
      redirectTo: inputFields.redirectTo,
    }),
    formData: f.object({
      text: inputFields.textField,
    }),
  }),
  s.object({
    searchParams: f.object({
      intent: inputFields.intent(intent.delete),
      redirectTo: inputFields.redirectTo,
    }),
    formData: todoSchema,
  }),
  s.object({
    searchParams: f.object({
      intent: inputFields.intent(intent.update),
      field: f.field(s.enum_(["text", "completed"])),
      redirectTo: inputFields.redirectTo,
    }),
    formData: todoSchema,
  }),
]);

export const todosCrudController = createController(routes.todolist.todos, {
  actions: {
    async index({ render }) {
      // await delay();
      return render(<TodoItems todos={todos} />);
    },
    action({ formData, url: { searchParams } }) {
      try {
        let input = s.parse(todoActionInputSchema, { searchParams, formData });
        match(input)
          .with(
            {
              searchParams: { intent: "create" },
              formData: { text: P.select() },
            },
            addTodos,
          )
          .with(
            { searchParams: { intent: "delete" }, formData: P.select() },
            deleteTodos,
          )
          .with(
            { searchParams: { field: "completed" }, formData: P.select() },
            (todo) => {
              todo.completed = !todo.completed;
              updateTodos(todo);
            },
          )
          .with(
            { searchParams: { field: "text" }, formData: P.select() },
            updateTodos,
          )
          .exhaustive();
        if (input.searchParams.redirectTo === "none") {
          return new Response(null, { status: 204 });
        }
        return redirect(routes.todolist.index.href());
      } catch (e) {
        return match(e)
          .with(
            P.instanceOf(s.ValidationError),
            (error) =>
              new Response(error.issues[0].message, {
                status: 400,
                statusText: error.name,
              }),
          )
          .with(
            P.instanceOf(Error),
            (err) =>
              new Response(err.message + err.cause, {
                status: 500,
                statusText: err.name,
              }),
          )
          .otherwise(
            () => new Response("Unexpected server error", { status: 500 }),
          );
      }
    },
  },
});
