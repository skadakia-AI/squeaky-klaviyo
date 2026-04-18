// Parses Turn 1 bullet audit output into structured question pairs.
// Matches lines of the form "- [bullet text] — [question]" (em, en, or plain hyphen dash).
export function parseQuantificationQuestions(text: string): { bullet: string; question: string }[] {
  const questions: { bullet: string; question: string }[] = []
  for (const line of text.split('\n')) {
    const match = line.match(/^-\s+(.+?)\s+[—–-]\s+(.+)$/)
    if (match) {
      questions.push({ bullet: match[1].trim(), question: match[2].trim() })
    }
  }
  return questions
}
