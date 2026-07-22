import { clientEntry, css, Frame, on, ref, type Handle } from "remix/ui";
import { routes } from "../routes.ts";
import { CustomEvents } from "./utils/customEvents.tsx";

type EventMap = {
  queryEmpty: null;
  querySubmitted: string;
};

export const SearchBooksWithFrame = clientEntry(
  import.meta.url,
  function SearchBooksWithFrame(handle: Handle<{ initialQuery?: string }>) {
    let searchEvents = new CustomEvents<EventMap>();
    let initialQuery = handle.props.initialQuery?.trim() ?? "";

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
        <searchEvents.on.change
          seed={
            initialQuery
              ? searchEvents.querySubmitted(initialQuery)
              : searchEvents.queryEmpty()
          }
          render={(changeEvent) => {
            switch (changeEvent.detail.event?.type) {
              case "queryEmpty":
              case undefined:
                return <p>Enter the title of any book.</p>;
              case "querySubmitted":
                let query = changeEvent.detail.event.detail;
                return (
                  <Frame
                    key={query}
                    fallback={
                      <p>fetching books with title containing "{query}"...</p>
                    }
                    src={routes.searchBooks.books.href(undefined, { q: query })}
                  />
                );
            }
          }}
        />
      </>
    );
  },
);
