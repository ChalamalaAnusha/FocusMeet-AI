export const FOCUS_THRESHOLDS = {
  focused: 80,
  moderate: 60,
} as const;

export const getFocusCategory = (score: number): 'focused' | 'moderate' | 'low' => {
  if (score >= FOCUS_THRESHOLDS.focused) return 'focused';
  if (score >= FOCUS_THRESHOLDS.moderate) return 'moderate';
  return 'low';
};

export const getFocusStatusLabel = (score: number): 'Focused' | 'Moderate' | 'Low Attention' => {
  const category = getFocusCategory(score);
  if (category === 'focused') return 'Focused';
  if (category === 'moderate') return 'Moderate';
  return 'Low Attention';
};