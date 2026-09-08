# ELM Math Fixer v1.4.1

## What's New since v1.4

### Fixes
- **Fixer switch stays put during streaming** (v1.4.1): the switch no longer disappears or bounces into compact mode when ELM re-renders the top bar mid-stream (e.g. the send-to-stop swap). An already-docked switch keeps its position, and a freshly created one can no longer take an early-return path that left it detached.
- **Toggling during streaming no longer jumps the page** (v1.4.1): scroll-correcting restores now wait for a short quiet window after sustained math-content growth (single bursts still apply instantly). The on/off state itself still flips instantly; only the viewport correction is deferred and applied once.
- **Bottom- and top-following readers stay put** (v1.4.1): restores re-pin a bottom-following scroller to the new maximum (only when the scroll range is meaningful) and keep a top-anchored reader at the top, instead of chasing a viewport-center anchor that growth below has pushed away.
- **Settled second-pass correction** (v1.4.1): after the first restore, the same saved anchor is re-applied once follow-up scans settle and fonts load (with a timeout fallback). The pass is skipped if you scrolled meanwhile or clicked again, so it never fights you.
- **No more double-counted corrections** (v1.4.1): restores now adjust from the current scroll position, since the browser may already have auto-clamped or anchor-adjusted it between capture and restore. Using the stale pre-transition value overshot straight into the clamp.
- **Own teardown no longer trips the streaming gate** (v1.4.1): toggle-initiated repairs/restores run with the page observer disconnected and dismantled repair DOM no longer counts as page growth, so one toggle can never defer the next toggle's work.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.4.1.zip`.
