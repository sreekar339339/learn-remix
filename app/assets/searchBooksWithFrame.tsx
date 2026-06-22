import { clientEntry, css, Frame, on, ref, type Handle } from "remix/ui";
import { routes } from "../routes.ts";
import { match } from "ts-pattern";
import {} from "./utils/events.ts";
import { SemanticEventTarget } from "./utils/SemanticEventTarget.js";

type SearchEvent =
  | { type: "queryEmpty" }
  | { type: "querySubmitted"; query: string };

export const SearchBooksWithFrame = clientEntry(
  import.meta.url,
  function SearchBooksWithFrame(handle: Handle<{ initialQuery?: string }>) {
    let initialQuery = handle.props.initialQuery?.trim() || "";
    let input: HTMLInputElement;

    let initialEvent: SearchEvent = initialQuery
      ? { type: "querySubmitted", query: initialQuery }
      : { type: "queryEmpty" };

    let searchEvtTarget = new SemanticEventTarget<SearchEvent>({
      event: initialEvent,
      onChange: () => void handle.update(),
      options: { signal: handle.signal },
    });

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
              if (!query)
                return void searchEvtTarget.dispatchEvent("queryEmpty");
              searchEvtTarget.dispatchEvent("querySubmitted", { query });
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
        {match(searchEvtTarget.event)
          .with({ type: "queryEmpty" }, () => (
            <p>Enter the title of any book.</p>
          ))
          .with({ type: "querySubmitted" }, ({ query }) => (
            <Frame
              key={query}
              fallback={
                <p>fetching books with title containing "{query}"...</p>
              }
              src={routes.asyncActions.withFrame.frame.href(undefined, {
                q: query,
              })}
            />
          ))
          .exhaustive()}
      </>
    );
  },
);
