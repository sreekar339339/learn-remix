import { type Handle } from "remix/ui";
import { SearchBooks } from "../assets/searchBooks.tsx";
import { SearchBooksWithFrame } from "../assets/searchBooksWithFrame.tsx";
import { Layout } from "../ui/layout.tsx";
import { SearchBooksNewEventHandlerParent } from "../assets/searchBooksNewEventHandler.tsx";

export function AsyncActionsPageWithFrame(
  handle: Handle<{ initialQuery: string }>,
) {
  return () => (
    <Layout>
      <h1>Make Async actions</h1>
      <SearchBooksWithFrame initialQuery={handle.props.initialQuery} />
    </Layout>
  );
}

export function AsyncActionsPageWithoutFrame(
  handle: Handle<{ initialQuery: string }>,
) {
  return () => (
    <Layout>
      <h1>Make Async actions without frame</h1>
      {/* <SearchBooks initialQuery={handle.props.initialQuery} /> */}
      <SearchBooksNewEventHandlerParent initialQuery={handle.props.initialQuery}/>
    </Layout>
  );
}
