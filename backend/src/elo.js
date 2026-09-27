const K = 32;

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateElo(ratingA, ratingB, scoreA) {
  const expA = expectedScore(ratingA, ratingB);
  const expB = 1 - expA;
  const scoreB = 1 - scoreA;
  return {
    ratingA: ratingA + K * (scoreA - expA),
    ratingB: ratingB + K * (scoreB - expB),
  };
}
