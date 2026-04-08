import Anthropic from '@anthropic-ai/sdk'

// Server-side only — never import this in client components
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export const MODELS = {
  analysis: 'claude-sonnet-4-6',
  parsing: 'claude-haiku-4-5-20251001',
} as const
