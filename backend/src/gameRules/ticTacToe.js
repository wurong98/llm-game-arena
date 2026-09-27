const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export const ticTacToe = {
  game_type: "tic_tac_toe",
  name: "井字棋",
  players_per_match: 2,

  board_shape() {
    return { type: "grid", rows: 3, cols: 3 };
  },

  init_board() {
    return Array(9).fill("");
  },

  validate_move(board, mark, pos) {
    if (typeof pos !== "number" || pos < 0 || pos > 8 || !Number.isInteger(pos)) {
      return { ok: false, error: "invalid_position" };
    }
    if (board[pos] !== "") {
      return { ok: false, error: "position_occupied" };
    }
    return { ok: true };
  },

  apply_move(board, mark, pos) {
    const next = [...board];
    next[pos] = mark;
    return next;
  },

  check_end(board) {
    for (const [a, b, c] of LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { finished: true, winner: board[a] };
      }
    }
    if (board.every((c) => c !== "")) {
      return { finished: true, winner: "draw" };
    }
    return { finished: false, winner: null };
  },
};
