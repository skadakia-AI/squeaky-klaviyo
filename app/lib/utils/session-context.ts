import { readFile } from './storage'

// Artifacts in the order they are created during the workflow.
// Each has a label used as a section header in the context string.
// raw_jd.md is intentionally excluded — decoded_jd.md supersedes it once available,
// and at jd_loaded (before decode) the raw JD is too large and unstructured to be useful.
const ARTIFACTS: { filename: string; label: string }[] = [
  { filename: 'decoded_jd.md',     label: 'Decoded Job Description' },
  { filename: 'resume_main.md',    label: 'Resume'                  },
  { filename: 'fit_assessment.md', label: 'Fit Assessment'          },
]

// Loads whatever session artifacts exist so far and returns them as a
// formatted string for injection into the handleChat system prompt.
// Files that don't exist yet are silently skipped — this is expected
// early in the workflow.

export async function resolveSessionContext(
  userId: string,
  sessionId: string
): Promise<string> {
  const sections: string[] = []

  for (const { filename, label } of ARTIFACTS) {
    try {
      const content = await readFile(userId, sessionId, filename)
      if (content.trim()) {
        sections.push(`## ${label}\n${content.trim()}`)
      }
    } catch {
      // File doesn't exist yet — skip
    }
  }

  return sections.join('\n\n')
}
