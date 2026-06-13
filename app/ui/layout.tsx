import { css, link, type Handle, type RemixNode } from "remix/ui";
import { Document } from "./document.tsx";
import { routes } from "../routes.ts";
// import { NavLinks } from "../assets/navLinks.tsx";

export function Layout(handle: Handle<{children: RemixNode}>) {
  return () => (
    <Document>
      {/* <NavLinks /> */}
      {handle.props.children}
    </Document>
  );
}
