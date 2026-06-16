import { createController } from "remix/router";
import { routes } from "../routes.ts";
import { TicTacToePage } from "./ticTacToePage.tsx";
import { AsyncActionsPage } from "./asyncActionsPage.tsx";
import { Index } from "./index.tsx";
import { Layout } from "../ui/layout.tsx";
import { assetServer } from "../assets.ts";
import { SuperHeaders } from "remix/headers";
import { match, P } from "ts-pattern";
import * as s from "remix/data-schema";

export const rootController = createController(routes, {
  actions: {
    ticTacToe({ render }) {
      return render(
        <Layout>
          <TicTacToePage />
        </Layout>,
      );
    },
    index({ render }) {
      return render(
        <Layout>
          <Index />
        </Layout>,
      );
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

export const asyncActionsController = createController(routes.asyncActions, {
  actions: {
    index({ render, url }) {
      const initialQuery = (url.searchParams.get("q") || "").trim();
      return render(
        <Layout>
          <AsyncActionsPage initialQuery={initialQuery} />
        </Layout>,
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
        if (!resp.ok) throw new Error(resp.statusText, { cause: resp.status });
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
});

const openLibraryUrl = new URL("https://openlibrary.org/search.json");

export const asyncActionsApiController = createController(
  routes.asyncActions.api,
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
        headers.contentEncoding = "";

        return new Response(resp.body, { ...resp, headers });
      },
    },
  },
);
