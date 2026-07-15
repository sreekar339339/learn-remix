import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { renderToString } from "remix/ui/server";

import { TicTacToeCustomEvents } from "./ticTacToeCustomEvents.tsx";

describe("TicTacToeCustomEvents SSR", () => {
  it("server-renders initial game status", async () => {
    let html = await renderToString(<TicTacToeCustomEvents />);

    assert.match(html, /Game in progress/);
  });
});
