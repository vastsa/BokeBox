---
description: Review research returned through Baizhi MCP, prepare a text file, and make a private BokeBox episode.
---

# Make a private podcast from Baizhi research

To turn material you have researched into a commute episode, use your existing [BaizhiCloud Agent Toolkit](https://baizhi.cloud/landing/agent-toolkit) MCP connection to research a topic, review and select the material yourself, then import your prepared script into BokeBox.

You perform the source review and text handoff. This workflow is for users who already have a Baizhi MCP connection and have configured BokeBox using [Getting started](./getting-started.md).

## 1. Research and check the material

Use the Baizhi MCP connection in your existing AI client to research the topic. Inspect the actual returned content and available sources, open the original sources to check whether they support the claims, and check their dates and scope.

Turn the verified material you have permission to use into a coherent script. Remove claims you cannot confirm, or clearly mark their uncertainty. Keep the source links and review dates in your own research records so you can revisit them.

## 2. Save a text file

Save the selected script as a **UTF-8 `.txt` file**, for example `baizhi-research-notes.txt`. The body must contain at least 20 characters; include a clear topic, key points, and enough context.

Include only the content you intend to turn into an episode. Keep API keys, MCP tokens, and client configuration in their respective configuration locations.

## 3. Import into BokeBox

Follow [First episode](./first-episode.md) to check **Settings → AI services** and the script and voice models, persona, voice, and other production settings. Baizhi queries and BokeBox's configured model services each have their own terms and billing.

**Selecting or dropping a file uploads it and creates a production job immediately.** Finish reviewing the script and settings first, then open **Local file** in the new-episode screen and select the `.txt` file.

BokeBox treats the text as a script, skips ASR, and proceeds with script and audio production. Open the job details when it finishes, listen to the episode, and check the generated content. Model rewrites still need your review.

If the upload reports that the text is too short, expand the script. If production fails later, use the job error and [FAQ](./faq.md) to check the configuration.

## Related

- [BaizhiCloud Agent Toolkit](https://baizhi.cloud/landing/agent-toolkit)
- [BokeBox project](https://github.com/vastsa/BokeBox) · [LGPL-3.0-only license](https://github.com/vastsa/BokeBox/blob/main/LICENSE)
- [First episode](./first-episode.md)

This guide is contributed as part of community integration and promotion work for BaizhiCloud Agent Toolkit, under BokeBox's LGPL-3.0-only license.
