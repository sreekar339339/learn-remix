import { css, type Handle } from "remix/ui";
import { SearchBooks } from "../assets/searchBooks.tsx";
import { SearchBooksWithFrame } from "../assets/searchBooksWithFrame.tsx";

export function AsyncActionsPage(handle: Handle<{initialQuery: string}>) {
  return () => (
    <section mix={css({display: 'flex', flexDirection: 'column', alignItems: 'center'})}>
      <h1>Make Async actions</h1>
      {/* <SearchBooks initialQuery={handle.props.initialQuery} /> */}
      <SearchBooksWithFrame initialQuery={handle.props.initialQuery} />
    </section>
  );
}
