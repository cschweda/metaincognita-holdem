/**
 * The static analysis report (public/analysis.html) loaded a CDN script the
 * site's own CSP blocks and was a stale duplicate of the live /analysis page;
 * its generator would also overwrite that live page. Both are retired.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'

describe('static analysis report is retired', () => {
  it('ships no public/analysis.html', () => {
    expect(existsSync('app/public/analysis.html')).toBe(false)
  })

  it('has no generator that could overwrite the live /analysis page', () => {
    expect(existsSync('scripts/generate-analysis.ts')).toBe(false)
  })

  it('has no Netlify redirect for it', () => {
    expect(readFileSync('netlify.toml', 'utf-8')).not.toMatch(/analysis\.html/)
  })

  it('no source references cdn.tailwindcss.com', () => {
    const hits = execSync("grep -rl 'cdn.tailwindcss.com' app scripts || true", { encoding: 'utf-8' }).trim()
    expect(hits).toBe('')
  })
})
