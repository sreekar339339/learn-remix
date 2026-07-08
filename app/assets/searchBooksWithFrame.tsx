import {
  clientEntry,
  css,
  Frame,
  addEventListeners,
  ref,
  type Handle,
  TypedEventTarget,
  on,
} from "remix/ui";
import { routes } from "../routes.ts";
import { match, P } from "ts-pattern";
import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEvent.ts";
import { onTarget } from "./utils/onTarget.ts";

type SearchEventMap = CustomEventMap<{
  queryEmpty: null;
  querySubmitted: { query: string };
}>;

export const SearchBooksWithFrame = clientEntry(
  import.meta.url,
  function SearchBooksWithFrame(handle: Handle<{ initialQuery?: string }>) {
    let searchTarget = new TypedEventTarget<SearchEventMap>();
    addEventListeners(searchTarget, handle.signal, {
      change({ detail }) {
        searchEvent = detail;
        handle.update();
      },
    });
    let onSearch = onTarget.with({target: searchTarget})
    let initialQuery = handle.props.initialQuery?.trim() || "";
    let searchEvent: SearchEventMap["change"]["detail"] = initialQuery
      ? {
          type: "querySubmitted",
          detail: { query: initialQuery },
        }
      : { type: "queryEmpty", detail: null };

    return () => (
      <>
        <form
          action={routes.asyncActions.withFrame.index.href()}
          mix={on("submit", (evt, signal) => {
            evt.preventDefault();
            let form = evt.currentTarget;
            let query = (new FormData(form).get("q") as string).trim();
            let currentQuery = searchEvent.type === "querySubmitted"
              ? searchEvent.detail.query
              : "";
            if (query === currentQuery) return;
            let opts = {
              target: searchTarget,
              signal,
            };
            if (!query) return void dispatchCustomEvent(opts, { queryEmpty: null });
            dispatchCustomEvent(opts, { querySubmitted: { query } });
          })}
        >
          <label>
            Search{" "}
            <input
              name="q"
              type="text"
              defaultValue={initialQuery}
              mix={[
                css({ padding: 4 }),
                onSearch('querySubmitted', (_, input) => {
                  input.select()
                })
              ]}
            />
          </label>
        </form>
        {match(searchEvent)
          .with({ type: "queryEmpty" }, () => (
            <p>Enter the title of any book.</p>
          ))
          .with({ type: "querySubmitted" }, ({ detail: { query } }) => (
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
          .with({ type: P.array() }, () => null)
          .exhaustive()}
      </>
    );
  },
);
