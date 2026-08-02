# ELM Math Fixer v1.2.9

This release makes the compact (small-window) top bar controls follow the layout: they now track the top bar when a banner pushes it down, stay in place while a full-page overlay like the model picker menu is open, and no longer get stuck between the banner and the top bar when the window is resized quickly.

## What's New since v1.2.8

### Fixes
- **Banner-safe compact positioning**: when a banner appears above the top bar, the compact fixer toggle and prompt button now follow the top bar down instead of floating over the banner.
- **Overlay-aware compact positioning**: while a full-page menu (e.g. the model picker) is open, the compact controls stay in place so the overlay hides them naturally, just like ELM's own controls.
- **Resize-transition robustness**: rapidly resizing the window no longer leaves the compact controls stranded between the banner and the top bar.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.2.9.zip`.
