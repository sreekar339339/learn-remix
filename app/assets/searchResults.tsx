import { clientEntry, css, on, type Handle } from "remix/ui";
import { routes } from "../routes.ts";

export const SearchResults = clientEntry(
  import.meta.url,
  function (handle: Handle<{ initialQuery?: string }>) {
    let { initialQuery } = handle.props;
    let status = initialQuery ? "loading" : "idle";
    let results: Array<{title: string}> = [];
    handle.queueTask(async (signal) => {
      if (!initialQuery) return;
      let resp = await fetch(routes.api.books.href(undefined, {q: initialQuery}), {
        signal,
      });
      results = (await resp.json()).docs
      if (signal.aborted) return
      status = "idle";
      handle.update();
    });
    return () => (
      <>
        <div>
          <label>
            Search pokemons:{" "}
            <input
              type="text"
              defaultValue={initialQuery}
              mix={[
                on("input", async (evt, signal) => {
                  const query = evt.currentTarget.value.trim();
                  if (!query) return
                  status = "loading";
                  handle.update();
                  let resp = await fetch(routes.api.books.href(undefined, {q: query}), {
                    signal,
                  });
                  results = (await resp.json()).docs;
                  if (signal.aborted) return
                  status = "idle";
                  handle.update();
                }),
                css({ padding: 4 }),
              ]}
            />
          </label>
        </div>
        {status === "loading" ? (
          <p>loading...</p>
        ) : status === "error" ? (
          <p>Error, try again.</p>
        ) : results.length ? (
          <ul>
            {results.map((book) => (
              <li>{book.title}</li>
            ))}
          </ul>
        ) : null}
      </>
    );
  },
);
