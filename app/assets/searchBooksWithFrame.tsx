import {
  clientEntry,
  css,
  Frame,
  type Handle,
  TypedEventTarget,
  on,
} from "remix/ui";
import { routes } from "../routes.ts";
import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEvent.ts";
import { onCustomEvent } from "./utils/onCustomEvent.tsx";

type SearchEventMap = CustomEventMap<{
  queryEmpty: null;
  querySubmitted: { query: string };
}>;

export const SearchBooksWithFrame = clientEntry(
  import.meta.url,
  function SearchBooksWithFrame(handle: Handle<{ initialQuery?: string }>) {
    let initialQuery = handle.props.initialQuery?.trim() || "";
    let searchTarget = new TypedEventTarget<SearchEventMap>();
    let onSearch = onCustomEvent.with({
      target: searchTarget,
      initial: initialQuery
        ? { querySubmitted: { query: initialQuery } }
        : { queryEmpty: null },
    });

    return () => (
      <>
        <form
          action={routes.searchBooks.books.href()}
          target="response"
          mix={[
            on("submit", (evt, signal) => {
              evt.preventDefault();
              let form = evt.currentTarget;
              let query = (new FormData(form).get("q") as string).trim();
              let opts = {
                target: searchTarget,
                signal,
              };
              if (!query) {
                return void dispatchCustomEvent(opts, { queryEmpty: null });
              }
              dispatchCustomEvent(opts, { querySubmitted: { query } });
            }),
          ]}
        >
          <label>
            Search{" "}
            <input
              name="q"
              type="text"
              defaultValue={initialQuery}
              mix={[
                css({
                  padding: 4,
                  "&.pending": {
                    backgroundImage:
                      "linear-gradient(100deg, transparent 0%, transparent 35%, rgba(45, 172, 249, 0.28) 50%, transparent 65%, transparent 100%)",
                    backgroundSize: "220% 100%",
                    animation: "glimmer 1.15s linear infinite",
                    borderColor: "var(--brand-blue)",
                  },
                }),
                onSearch("change", (_, input) => {
                  input.select();
                }),
              ]}
            />
          </label>
        </form>
        <onSearch.change
          render={({ detail }) => {
            if (Array.isArray(detail.type)) return null;
            if (detail.type === "queryEmpty") {
              return <p>Enter the title of any book.</p>;
            }
            if (detail.type !== "querySubmitted") return null;

            let { query } = detail.detail;
            return (
              <Frame
                key={query}
                fallback={
                  <p>fetching books with title containing "{query}"...</p>
                }
                src={routes.searchBooks.books.href(undefined, {
                  q: query,
                })}
              />
            );
          }}
        />
        {/* <noscript>
          <iframe
            name="response"
            src={routes.searchBooks.books.href(undefined, {
              q: initialQuery,
            })}
          />
        </noscript>  */}
      </>
    );
  },
);
