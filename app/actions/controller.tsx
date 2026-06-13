import { createController } from "remix/router";
import { routes } from "../routes.ts";
import { TicTacToePage } from "./ticTacToePage.tsx";
import { AsyncActionsPage } from "./asyncActionsPage.tsx";
import { Index } from "./index.tsx";
import { Layout } from "../ui/layout.tsx";
import { assetServer } from "../assets.ts";
import { SuperHeaders } from "remix/headers";

export default createController(routes, {
  actions: {
    ticTacToe({render}) {
      return render(<Layout><TicTacToePage /></Layout>);
    },
    asyncActions({render, url}) {
      const initialQuery = (url.searchParams.get('q') || '').trim()
      return render(<Layout><AsyncActionsPage initialQuery={initialQuery} /></Layout>);
    },
    index({render}) {
      return render(<Layout><Index /></Layout>)
    },
    async assets(context) {
      return (
        (await assetServer.fetch(context.request)) ?? new Response('Not Found', { status: 404 })
      )
    },
  },
});

export const apiController = createController(routes.api, {
  actions: {
    async books({url, }) {
      const query = (url.searchParams.get('q') || '').trim()
      try {
        let resp = await fetch(
          "https://openlibrary.org/search.json?q=" + query + "&limit=20"
        )
        let results = await resp.json()
        return new Response(JSON.stringify(results), {
          ...resp,
        })
      } catch (error) {
        return new Response('Error occured', { status: 500 })
      }
    }
  }
})
