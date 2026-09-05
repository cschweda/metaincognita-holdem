/**
 * Repository links. The canonical repo is cschweda/metaincognita-holdem;
 * an older name (holdem-simulator) was templated from package.json `name`
 * and 404s everywhere it appears (Round 8). Every CHANGELOG heading for a
 * version that has a git tag must also carry a link definition, or the
 * rendered list shows a mix of links and bare bracketed text.
 */
import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'

const REPO = 'cschweda/metaincognita-holdem'
const FILES = ['README.md', 'CHANGELOG.md', 'app/pages/index.vue', 'package.json']

describe('repository links', () => {
  for (const f of FILES) {
    it(`${f} has no stale holdem-simulator GitHub URL`, () => {
      const src = readFileSync(f, 'utf-8')
      expect(src).not.toMatch(/github\.com\/cschweda\/holdem-simulator/)
    })
  }

  it('package.json names the canonical repository', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
    expect(pkg.repository).toBe(`github:${REPO}`)
  })

  it('every CHANGELOG version heading with a tag has a link definition', () => {
    const src = readFileSync('CHANGELOG.md', 'utf-8')
    const headings = [...src.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(m => m[1]!)
    const defs = new Set([...src.matchAll(/^\[(\d+\.\d+\.\d+)\]:/gm)].map(m => m[1]!))
    // v0.11.0 was never tagged (the release went out as v0.11.1), so it
    // deliberately has no compare link — nothing to compare against.
    const untagged = new Set(['0.11.0'])
    const missing = headings.filter(h => !defs.has(h) && !untagged.has(h))
    expect(missing).toEqual([])
  })

  it('every CHANGELOG link definition points at the canonical repo', () => {
    const src = readFileSync('CHANGELOG.md', 'utf-8')
    const defs = [...src.matchAll(/^\[[^\]]+\]: (\S+)/gm)].map(m => m[1]!)
    expect(defs.length).toBeGreaterThan(20)
    for (const url of defs) expect(url).toContain(REPO)
  })
})
