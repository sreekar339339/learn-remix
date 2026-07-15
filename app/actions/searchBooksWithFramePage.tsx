import { type Handle } from "remix/ui";
import { SearchBooksWithFrame } from "../assets/searchBooksWithFrame.tsx";
import { Layout } from "../ui/layout.tsx";
import { SearchBooksWithFrameCustomEvents } from "../assets/searchBooksWithFrameCustomEvents.tsx";

export function SearchBooksWithFramePage(
  handle: Handle<{ initialQuery: string }>,
) {
  return () => (
    <Layout>
      <h1>Search books with frame</h1>
      {/* <SearchBooksWithFrame initialQuery={handle.props.initialQuery} /> */}
      <SearchBooksWithFrameCustomEvents initialQuery={handle.props.initialQuery} />
    </Layout>
  );
}
