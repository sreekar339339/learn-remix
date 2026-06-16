import { clientEntry, css, Frame, on, ref, type Handle } from "remix/ui";
import { routes } from "../routes.ts";
import { match, P } from "ts-pattern";
import { createSemanticEventListener } from "./utils/events.ts";

type SearchEvent = { type: "idle" } | { type: "querySubmitted"; query: string };

export const SearchBooksWithFrame = clientEntry(
  import.meta.url,
  function SearchBooksWithFrame(handle: Handle<{ initialQuery?: string }>) {
    let initialQuery = handle.props.initialQuery?.trim() || "";
    let input: HTMLInputElement;

    let searchEvent: SearchEvent = initialQuery
      ? { type: "querySubmitted", query: initialQuery }
      : { type: "idle" };

    let dispatchSearchEvent = createSemanticEventListener<SearchEvent>(
      (evt) => {
        searchEvent = evt;
        handle.update();
      },
      { signal: handle.signal },
    );

    handle.queueTask(() => {
      input.select();
    });

    return () => (
      <>
        <form
          mix={[
            on("submit", async (evt) => {
              evt.preventDefault();
              let query = input.value.trim();
              if (!query) return void dispatchSearchEvent({ type: "idle" });
              dispatchSearchEvent({ type: "querySubmitted", query });
              input.select();
            }),
          ]}
        >
          <label>
            Search{" "}
            <input
              type="text"
              defaultValue={initialQuery}
              mix={[css({ padding: 4 }), ref((node) => (input = node))]}
            />
          </label>
        </form>
        {match(searchEvent)
          .with({ type: "idle" }, () => <p>Enter the title of any book.</p>)
          .with({ type: "querySubmitted" }, ({ query }) => (
            <Frame
              key={query}
              fallback={<p>fetching books with title containing {query}...</p>}
              src={routes.asyncActions.frame.href(undefined, { q: query })}
            />
          ))
          .exhaustive()}
      </>
    );
  },
);
