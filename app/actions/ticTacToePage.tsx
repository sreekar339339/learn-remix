import type { Handle } from "remix/ui";
import { TicTacToe } from "../assets/ticTcToe.tsx";

export function TicTacToePage(handle: Handle) {
  return () => (
    <section>
      <h1>Play Tic Tac Toe!</h1>
      <TicTacToe />
    </section>
  );
}
