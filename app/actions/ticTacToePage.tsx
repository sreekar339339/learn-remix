import { type Handle } from "remix/ui";
import { TicTacToe } from "../assets/ticTcToe.tsx";
import { Layout } from "../ui/layout.tsx";

export function TicTacToePage(handle: Handle) {
  return () => (
    <Layout>
      <h1>Play Tic Tac Toe!</h1>
      <TicTacToe />
    </Layout>
  );
}
