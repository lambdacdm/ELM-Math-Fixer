(function () {
  'use strict';

  globalThis.ELMMathFixerPrompts = [
    {
      title: 'Math Rendering Fix',
      description: 'Prevents display formulas from being split before KaTeX rendering.',
      prompts: [
        {
          label: 'Copy (English)',
          text: `When generating mathematical formulas ($...$ or $$...$$), you must follow these rules, or the formula will fail to render or won't be recognized at all:

[MOST IMPORTANT] Never include a line break or blank line inside a $$...$$ formula. Everything from the opening $$ to the closing $$ must be one continuous, unbroken block of text - no line breaks in between, even for long formulas; keep it all on the same line/paragraph. Otherwise the platform will split the formula partway through and it won't render at all. If you need multi-line display, use an aligned/array/gathered environment with \\ line breaks inside the LaTeX itself - never insert a literal line break at the text level.`
        },
        {
          label: 'Copy (中文)',
          text: `生成数学公式（$...$ 或 $$...$$）时，必须遵守以下规则，否则公式会渲染失败或完全不被识别：

【最重要】一条 $$...$$ 公式内部绝对不能换行或有空行。从开头 $$ 到结尾 $$ 之间必须是连续的一整段文本，中间不能敲回车--哪怕公式很长也要写在同一行/同一段落里，否则平台会把公式从中间切断，导致完全不渲染。需要分行展示时，用 aligned/array/gathered 环境配合 \\ 处理，不要在文本层面换行。`
        }
      ]
    },
    {
      title: 'Separate Reasoning and Answer',
      description: 'For Claude models that mix reasoning-style text with the final answer.',
      prompts: [
        {
          label: 'Copy (English)',
          text: `Please first output your reasoning process normally. After the reasoning is complete, start a new line and output the following blockquote:

> The above is the reasoning process; the following is the final answer.

After that blockquote, output the final answer.`
        },
        {
          label: 'Copy (中文)',
          text: `请先正常输出思考过程，思考结束后另起一行输出引用块：

> 以上是思考过程，以下是正式回答

引用块之后再输出最终回答内容。`
        }
      ]
    }
  ];
})();
