# ELM Math Fixer v1.3.8

## What's New since v1.3.7

### Bug fixes
- **Fixer switch no longer lands in the chat input bar** (v1.3.8): the top bar scan now only considers controls within the top 70% of the viewport, so the Fixer switch can no longer anchor to the chat composer at the bottom of the page, even when the composer holds more buttons than the top bar.
- **Fixer switch stays on the top bar when the announcement banner is shown** (v1.3.8): with the dismissible message banner above the top bar, the switch is anchored to the top bar control cluster even when the banner wraps tall and pushes the top bar down. A lone banner dismiss control is never treated as a top bar anchor; without at least two top bar controls the switch falls back to the compact floating control instead.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.8.zip`.
