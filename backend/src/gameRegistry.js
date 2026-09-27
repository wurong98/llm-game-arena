import { ticTacToe } from "./gameRules/ticTacToe.js";

const registry = {
  [ticTacToe.game_type]: ticTacToe,
};

export function getGameRule(game_type) {
  return registry[game_type];
}

export function listGames() {
  return Object.values(registry).map((g) => ({
    game_type: g.game_type,
    name: g.name,
    board_shape: g.board_shape(),
    players_per_match: g.players_per_match,
  }));
}
