import { clientEntry, css, on, ref, type Handle } from "remix/ui";
import { routes } from "../routes.ts";
import { CustomEvents } from "./utils/customEvents.tsx";

type Book = {
  title: string;
};

let searchEvents = new CustomEvents<{
  booksFound: Array<Book>;
  booksNotFound: { reason: "emptyList" | { other: string } };
  errorOccurred: Error;
  queryEmpty: null;
  querySubmitted: { query: string };
}>();

async function fetchBooks(
  query: string,
  input: HTMLInputElement,
  signal: AbortSignal,
) {
  let opts = { signal };
  try {
    let response = await fetch(
      routes.searchBooks.books.href(undefined, { q: query }),
      {
        signal,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`, {
        cause: await response.text(),
      });
    }
    let json = await response.json();
    if (!("docs" in json)) {
      return input.dispatchEvent(
        searchEvents.booksNotFound(
          { reason: { other: json.detail[0].msg } },
          opts,
        ),
      );
    }
    let books = json.docs as Array<Book>;
    input.dispatchEvent(
      books.length
        ? searchEvents.booksFound(books, opts)
        : searchEvents.booksNotFound({ reason: "emptyList" }, opts),
    );
  } catch (error) {
    input.dispatchEvent(searchEvents.errorOccurred(error as Error, opts));
  }
}

export const SearchBooksWithoutFrameCustomEvents = clientEntry(
  import.meta.url,
  function SearchBooksWithoutFrameCustomEvents(
    handle: Handle<{ initialQuery: string }>,
  ) {
    let initialQuery = handle.props.initialQuery.trim();
    searchEvents.seedInitialEvent(
      initialQuery
        ? searchEvents.querySubmitted({ query: initialQuery })
        : searchEvents.queryEmpty(),
    );

    if (initialQuery) {
      handle.queueTask((signal) => {
        if (signal.aborted) return;
        window.dispatchEvent(
          searchEvents.querySubmitted({ query: initialQuery }, { signal }),
        );
      });
    }

    return () => (
      <>
        <label>
          Search{" "}
          <input
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
                "@media (prefers-reduced-motion: reduce)": {
                  animation: "none",
                },
              }),
              on("input", (event) => {
                let input = event.currentTarget;
                let query = input.value.trim();
                input.dispatchEvent(
                  query
                    ? searchEvents.querySubmitted({ query })
                    : searchEvents.queryEmpty(),
                );
              }),
              on(
                searchEvents.names.change,
                ({ currentTarget, detail }, signal) => {
                  currentTarget.classList.toggle(
                    "pending",
                    detail.type === "querySubmitted",
                  );
                  if (detail.type === "querySubmitted") {
                    return void fetchBooks(
                      detail.detail.query,
                      currentTarget,
                      signal,
                    );
                  }
                  currentTarget.select();
                },
              ),
              ref((input) => input.dispatchEvent(new InputEvent('input')))
            ]}
          />
        </label>
        <searchEvents.change
          render={({ detail }) => {
            switch (detail.type) {
              case "queryEmpty":
                return <p>Enter the title of any book.</p>;
              case "querySubmitted":
                return (
                  <p>
                    {`fetching books with title containing "${detail.detail.query}"...`}
                  </p>
                );
              case "booksFound":
                return (
                  <ul>
                    {detail.detail.map((book) => (
                      <li>{book.title}</li>
                    ))}
                  </ul>
                );
              case "booksNotFound":
                if (detail.detail.reason === "emptyList") {
                  return (
                    <p>No books were found for this title at this time.</p>
                  );
                }
                return (
                  <p>
                    Could not fetch books for this title. Reason:{" "}
                    {detail.detail.reason.other}.
                  </p>
                );
              case "errorOccurred":
                return (
                  <p>
                    Unexpected error occured, try again! {detail.detail.message}
                    Cause: {detail.detail.cause as string}.
                  </p>
                );
            }
          }}
        />
      </>
    );
  },
);
