import { clientEntry, css, Frame, on, ref, type Handle } from "remix/ui";
import { routes } from "../routes.ts";
import { CustomEvents } from "./utils/customEvents.tsx";

let searchEvents = new CustomEvents<{
  queryEmpty: null;
  querySubmitted: string;
}>();

export const SearchBooksWithFrameCustomEvents = clientEntry(
  import.meta.url,
  function SearchBooksWithFrameCustomEvents(
    handle: Handle<{ initialQuery?: string }>,
  ) {
    let initialQuery = handle.props.initialQuery?.trim() ?? "";
    searchEvents.seed(
      initialQuery
        ? searchEvents.querySubmitted(initialQuery)
        : searchEvents.queryEmpty(),
    );

    return () => (
      <>
        <form
          action={routes.searchBooks.books.href()}
          mix={[
            on("submit", (evt) => {
              evt.preventDefault();
              let query = (
                new FormData(evt.currentTarget).get("q") as string
              ).trim();
              evt.currentTarget.dispatchEvent(
                query
                  ? searchEvents.querySubmitted(query)
                  : searchEvents.queryEmpty(),
              );
            }),
          ]}
        >
          <label>
            Search{" "}
            <input
              name="q"
              type="text"
              defaultValue={initialQuery}
              autofocus
              mix={[
                css({
                  padding: 4,
                  "&.pending": {
                    backgroundImage:
                      "linear-gradient(100deg, transparent 0%, transparent 35%, rgba(45, 172, 249, 0.28) 50%, transparent 65%, transparent 100%)",
                    backgroundSize: "220% 100%",
                    animation: "glimmer 1.15s linear infinite",
                  },
                }),
                searchEvents.on("change", ({ currentTarget, detail }) => {
                  if (detail.event?.type !== "querySubmitted") {
                    currentTarget.select();
                  }
                }),
              ]}
            />
          </label>
        </form>
        <searchEvents.change
          render={({ detail: { event } }) => {
            if (!event) return null;
            if (event.type === "queryEmpty") {
              return <p>Enter the title of any book.</p>;
            }
            let query = event.detail;
            return (
              <Frame
                key={query}
                fallback={
                  <p>fetching books with title containing "{query}"...</p>
                }
                src={routes.searchBooks.books.href(undefined, { q: query })}
              />
            );
          }}
        />
      </>
    );
  },
);
