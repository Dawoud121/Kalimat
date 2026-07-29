/**
 * SM-2 Spaced Repetition Algorithm implementation.
 *
 * Quality ratings map:
 *   0 = Hard  → SM-2 q=1  (didn't recall, reset)
 *   1 = Easy  → SM-2 q=4  (recalled correctly, advance)
 */
export function applyRating(card, quality) {
  // Map app quality (0-1) to SM-2 scale (1-5)
  const q = [1, 4][quality];

  let { repetitions = 0, easeFactor = 2.5, interval = 1 } = card;

  if (q < 3) {
    // Failed recall — reset
    repetitions = 0;
    interval = 1;
  } else {
    // Successful recall
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // Update ease factor
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

  // Calculate next review date (start of day)
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);
  nextReviewDate.setHours(0, 0, 0, 0);

  return {
    repetitions,
    easeFactor,
    interval,
    nextReviewDate: nextReviewDate.toISOString(),
    lastReviewed: new Date().toISOString(),
  };
}

/**
 * Returns the SRS status label for a card.
 */
export function getSRSStatus(card) {
  if (!card || card.repetitions === 0) return 'new';
  if (card.interval <= 1) return 'learning';
  if (card.interval >= 21) return 'mastered';
  return 'review';
}

/**
 * Compute the estimated next interval for each rating — used to show
 * labels on the rating buttons ("1d", "6d", etc.)
 */
export function previewIntervals(card) {
  const results = {};
  [0, 1].forEach(quality => {
    const updated = applyRating(card, quality);
    const days = updated.interval;
    results[quality] = days === 1 ? '1d' : days < 30 ? `${days}d` : `${Math.round(days / 30)}mo`;
  });
  return results;
}
