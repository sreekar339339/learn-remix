import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { renderToString } from "remix/ui/server";

import { SearchBooksWithFrame } from "./searchBooksWithFrame.tsx";

describe("SearchBooksWithFrame SSR", () => {
  it("renders initial search children on the server", async () => {
    let html = await renderToString(<SearchBooksWithFrame initialQuery="" />);

    assert.match(html, /Enter the title of any book\./);
  });
});
