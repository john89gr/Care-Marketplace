const WEIGHTS = {
    rating: 0.4,
    availableNow: 0.3,
    distance: 0.2,
    text: 0.1,
};
export function matchCandidates(candidates, query) {
    const q = query.query.trim().toLowerCase();
    return candidates
        .filter((card) => {
        if (query.maxDistanceKm !== null && card.distanceKm > query.maxDistanceKm) {
            return false;
        }
        if (query.minRating !== null && card.rating < query.minRating) {
            return false;
        }
        if (query.availableNowOnly && !card.availableNow) {
            return false;
        }
        if (query.roles.length > 0 && !query.roles.some((role) => card.roles.includes(role))) {
            return false;
        }
        if (q && !card.displayName.toLowerCase().includes(q)) {
            return false;
        }
        return true;
    })
        .map((card) => ({ card, score: score(card, q) }))
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.card);
}
function score(card, query) {
    let score = (card.rating / 5) * WEIGHTS.rating;
    if (card.availableNow) {
        score += WEIGHTS.availableNow;
    }
    score += Math.max(0, 1 - card.distanceKm / 50) * WEIGHTS.distance;
    if (query && card.displayName.toLowerCase().includes(query)) {
        score += WEIGHTS.text;
    }
    return score;
}
