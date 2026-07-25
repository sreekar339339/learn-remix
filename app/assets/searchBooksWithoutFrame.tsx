import { clientEntry, css, on, ref, type Handle } from "remix/ui";
import { routes } from "../routes.ts";
import { CustomEvents } from "./utils/customEvents.tsx";

type Book = {
  title: string;
};

let events = new CustomEvents<{
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
        events.create("booksNotFound",
          { reason: { other: json.detail[0].msg } },
          opts,
        ),
      );
    }
    let books = json.docs as Array<Book>;
    input.dispatchEvent(
      books.length
        ? events.create("booksFound", books, opts)
        : events.create("booksNotFound", { reason: "emptyList" }, opts),
    );
  } catch (error) {
    input.dispatchEvent(events.create("errorOccurred", error as Error, opts));
  }
}

export const SearchBooksWithoutFrame = clientEntry(
  import.meta.url,
  function SearchBooksWithoutFrame(handle: Handle<{ initialQuery: string }>) {
    let initialQuery = handle.props.initialQuery.trim();
    events.seed(
      initialQuery
        ? events.create("querySubmitted", { query: initialQuery })
        : events.create("queryEmpty"),
    );

    return () => (
      <>
        <label>
          Search{" "}
          <events.on.change
            render={(changeEvent) => (
              <input
                type="text"
                defaultValue={initialQuery}
                class={
                  changeEvent?.detail.event?.type === "querySubmitted"
                    ? "pending"
                    : ""
                }
                mix={[
                  inputCss,
                  on("input", ({ currentTarget }, signal) => {
                    let query = currentTarget.value.trim();
                    if (!query)
                      return void currentTarget.dispatchEvent(
                        events.create("queryEmpty"),
                      );
                    currentTarget.dispatchEvent(
                      events.create("querySubmitted", { query }),
                    );
                    fetchBooks(query, currentTarget, signal);
                  }),
                  events.on("change", ({ detail, currentTarget }) => {
                    if (detail.event?.type !== "querySubmitted") {
                      currentTarget.select();
                    }
                  }),
                  ref((input) => input.dispatchEvent(new InputEvent("input"))),
                ]}
              />
            )}
          />
        </label>
        <events.on.change
          render={(changeEvent) => {
            let event = changeEvent?.detail.event;
            switch (event?.type) {
              case "queryEmpty":
              case undefined:
                return <p>Enter the title of any book.</p>;
              case "querySubmitted":
                return (
                  <p>
                    {`fetching books with title containing "${event.detail.query}"...`}
                  </p>
                );
              case "booksFound":
                return (
                  <ul>
                    {event.detail.map((book) => (
                      <li>{book.title}</li>
                    ))}
                  </ul>
                );
              case "booksNotFound":
                if (event.detail.reason === "emptyList") {
                  return (
                    <p>No books were found for this title at this time.</p>
                  );
                }
                return (
                  <p>
                    Could not fetch books for this title. Reason:{" "}
                    {event.detail.reason.other}.
                  </p>
                );
              case "errorOccurred":
                return (
                  <p>
                    Unexpected error occured, try again! {event.detail.message}
                    Cause: {event.detail.cause as string}.
                  </p>
                );
            }
          }}
        />
      </>
    );
  },
);

const inputCss = css({
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
});
