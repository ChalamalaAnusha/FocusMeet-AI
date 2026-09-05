const PROHIBITED_REGEX =
  /\b(f+u+c+k+|s+h+i+t+|b+i+t+c+h+|a+s+s+h+o+l+e+|b+a+s+t+a+r+d+|d+i+c+k+|p+u+s+s+y+|c+u+n+t+|stfu|die|idiot|trash|loser|kill\s+yourself)\b/i;

export function preCheckMessage(text: string): { isClean: boolean; reason?: string } {
  if (PROHIBITED_REGEX.test(text)) {
    return {
      isClean: false,
      reason: 'This message appears to contain abusive, offensive, or harassing words.',
    };
  }
  return { isClean: true };
}
