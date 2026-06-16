import { css, type Handle } from "remix/ui";
import { TicTacToe } from "../assets/ticTcToe.tsx";

export function TicTacToePage(handle: Handle) {
  return () => (
    <section mix={css({display: 'flex', flexDirection: 'column', alignItems: 'center'})}>
      <h1>Play Tic Tac Toe!</h1>
      <TicTacToe />
    </section>
  );
}
