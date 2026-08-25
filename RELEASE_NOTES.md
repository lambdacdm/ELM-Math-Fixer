# ELM Math Fixer v1.3.9

## What's New since v1.3.8

### Bug fixes
- **Fixer switch always docks in the top bar row** (v1.3.9): the top bar row is now identified by known ELM top bar labels (e.g. "Request an ELM API Key"), so the chat composer can never win the anchor vote - not even on the welcome screen of a tall viewport, where the centered composer row previously out-voted the top bar and swallowed the switch.
- **Fixer switch is covered by menus instead of fleeing them** (v1.3.9): when an overlay such as the model picker menu covers part of the top bar, the switch stays docked and is hidden naturally like ELM's own controls, instead of turning into a floating compact icon anchored to menu items. It returns to its slot when the menu closes.
- **Fixer switch now appears on the welcome page** (v1.3.9): the switch (and the prompt launcher) are created as soon as the chat composer is present, so the fixer can be toggled before the first message is sent; the prompt launcher still hides itself until the sidebar is available.
- **Top bar region tightened** (v1.3.9): candidate controls must now sit within the top half of the viewport, and controls at or below the composer input are excluded from anchoring outright.

### Removed
- **Onboarding guide bubble removed** (v1.3.9): the "Fixer Prompts is inside Tools" hint bubble and the attention pulse are gone. Fixer Prompts is an auxiliary feature; users who need it will find it in Tools.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.9.zip`.
