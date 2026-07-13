/**
 * Deterministic randomness for the whole test suite.
 *
 * Every test FILE runs in its own worker and loads this setup fresh, so each
 * file draws from its own stable mulberry32 stream. Statistical band suites
 * (phase4/phase6/realism) therefore sample the SAME distribution every run —
 * a band failure reproduces locally instead of flaking once in CI and
 * vanishing on retry.
 *
 * Tests that seed explicitly (exploit-probe gate, seeded-decision tests)
 * pass their own rng/seed parameters, which always take precedence over
 * this global.
 *
 * Note: draw order within a file depends on test order, so `.only`/`.skip`
 * shifts the stream for later tests in that file — expected and fine.
 */
import { mulberry32 } from '../app/utils/rng'

Math.random = mulberry32(0xC0FFEE)
