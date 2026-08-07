# ELM Math Fixer v1.3.5

## What's New since v1.3.4

### Other
- **Math Rendering Fix prompt extended with standard-command rules** (v1.3.5): the bundled prompt now also tells the model to use only LaTeX commands the platform's renderer knows, to build notation from standard pieces (`\operatorname`, `\mathrm`, `\mathbb`, `\mathcal`, `\text`), and to never invent commands (e.g. `\Ext`, `\fp`, `\cO`, `\PL`) — the same commands that would otherwise render as red errors. The prompt copy count is unchanged (English and Chinese only).

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.5.zip`.