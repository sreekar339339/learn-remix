import { css, type Handle, type RemixNode } from "remix/ui";
import { Document } from "./document.tsx";
import { routes } from "../routes.ts";
// import { NavLinks } from "../assets/navLinks.tsx";

export function Layout(handle: Handle<{ children: RemixNode }>) {
  return () => (
    <Document>
      <main mix={css({ height: "100vh" })}>
        <nav
          mix={css({
            display: "flex",
            gap: 18,
            padding: 16,
          })}
        >
          <a href={routes.index.href()}>Home</a>
          <a href={routes.ticTacToe.href()}>Tic Tac Toe</a>
          <a href={routes.asyncActions.index.href()}>Async actions</a>
        </nav>
        {handle.props.children}
      </main>
    </Document>
  );
}
