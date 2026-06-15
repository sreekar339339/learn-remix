import { createController } from "remix/router";
import { routes } from "../routes.ts";
import { TicTacToePage } from "./ticTacToePage.tsx";
import { AsyncActionsPage } from "./asyncActionsPage.tsx";
import { Index } from "./index.tsx";
import { Layout } from "../ui/layout.tsx";
import { assetServer } from "../assets.ts";
import { SuperHeaders } from "remix/headers";

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
