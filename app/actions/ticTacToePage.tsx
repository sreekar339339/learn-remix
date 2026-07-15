import { type Handle } from "remix/ui";
import { TicTacToe } from "../assets/ticTcToe.tsx";
import { Layout } from "../ui/layout.tsx";
import { TicTacToeCustomEvents } from "../assets/ticTacToeCustomEvents.tsx";

export function TicTacToePage(handle: Handle) {
  return () => (
    <Layout>
      <h1>Play Tic Tac Toe!</h1>
      {/* <TicTacToe /> */}
      <TicTacToeCustomEvents />
    </Layout>
  );
}
