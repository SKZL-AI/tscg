# TSCG Complete Setup, Usage & Deployment Guide

**Version:** 0.2.0
**Date:** 2026-02-27

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Core Installation](#2-core-installation)
3. [CLI Usage](#3-cli-usage-phase-4)
4. [Programmatic API](#4-programmatic-api)
5. [Browser Bundle](#5-browser-bundle-phase-1)
6. [Chrome Extension](#6-chrome-extension-phase-2)
7. [Web App](#7-web-app-phase-3)
8. [Running Benchmarks](#8-running-benchmarks)
9. [Research Paper](#9-research-paper-phase-6)
10. [Scientific Evaluation Docs](#10-scientific-evaluation-docs-phase-5)

---

## 1. Prerequisites

| Software | Minimum Version | Install |
|----------|-----------------|---------|
| **Node.js** | 18.0.0 | https://nodejs.org |
| **npm** | 9.x | Comes with Node.js |
| **Git** | Any | https://git-scm.com |
| **Chrome** | 116+ | For extension (Phase 2) |
| **LaTeX** (optional) | TeX Live 2024+ | For paper compilation (Phase 6) |

**Optional for hybrid mode / benchmarks:**
- Anthropic API key (`ANTHROPIC_API_KEY` env variable)

---

## 2. Core Installation

```bash
# Clone the repository
git clone <repository-url> tscg
cd tscg

# Install dependencies
npm install

# Build TypeScript
npm run build

# Build browser bundle
npm run build:browser

# Verify everything works
npm test
```

**Expected output:**
```
Test Files  5 passed (5)
     Tests  77 passed (77)
```

**Build outputs:**
- `dist/` — Compiled TypeScript (Node.js)
- `dist/tscg.browser.js` — Browser bundle (28.5KB / 10.1KB gzipped)

---

## 3. CLI Usage (Phase 4)

### 3.1 Basic Optimization (Local, No API)

```bash
# Optimize a prompt (default: balanced profile)
npx tscg optimize "Please help me figure out what the capital city of France is"

# Choose a profile
npx tscg optimize --profile=full "A store has 45 apples. They sell 12 and receive 30. How many remain?"

# Available profiles: minimal, balanced, max_compress, max_accuracy, full
```

### 3.2 Output Formats

```bash
# Quiet mode (output only the optimized prompt)
npx tscg optimize --quiet "What is the atomic number of gold?"

# JSON output
npx tscg optimize --json "List the top 3 countries by GDP"

# Markdown output
npx tscg optimize --markdown "Compare Python and JavaScript"

# Save to file
npx tscg optimize --json --out=result.json "Your prompt here"
```

### 3.3 Pipe Support

```bash
# Pipe from another command
echo "Please kindly help me find the capital of France" | npx tscg optimize --quiet

# Pipe from a file
cat prompt.txt | npx tscg optimize --quiet

# Chain with other tools
echo "What is 2+2?" | npx tscg optimize --quiet | pbcopy
```

### 3.4 Interactive REPL Mode

```bash
npx tscg optimize --interactive

# Or with a specific profile:
npx tscg optimize --interactive --profile=full
```

**REPL commands:**
- Type a prompt and press Enter to optimize
- `:profile <name>` — Change profile (minimal/balanced/max_compress/max_accuracy/full)
- `:help` — Show commands
- `:quit` or `:q` — Exit

### 3.5 Compare All Profiles

```bash
npx tscg optimize --compare "What is the capital of France?"
```

This shows a side-by-side table of all 5 profiles with compression ratios and token counts.

### 3.6 File Input

```bash
npx tscg optimize --file prompt.txt
npx tscg optimize --file prompt.txt --json --out=optimized.json
```

### 3.7 Advanced Options

```bash
# Disable SAD-F (anchor duplication)
npx tscg optimize --no-sadf "Your prompt"

# Disable CCP (causal closure)
npx tscg optimize --no-ccp "Your prompt"

# Set SAD-F anchor count
npx tscg optimize --sad-k=6 "Your prompt"

# Verbose mode (show each transform step)
npx tscg optimize --verbose "Your prompt"
```

### 3.8 Hybrid Mode (Requires API Key)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
npx tscg optimize --hybrid "List the top 3 countries by GDP as JSON"
```

### 3.9 Compile NL to TSCG (Requires API Key)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
npx tscg compile "What is the capital of France?"
```

---

## 4. Programmatic API

### 4.1 Local Optimization (No API)

```typescript
import { optimizePrompt, batchOptimize } from 'tscg';

// Single prompt
const result = optimizePrompt("Please help me find the capital of France", {
  profile: 'balanced',
  enableSADF: true,
  enableCCP: true,
  sadTopK: 4,
  verbose: false,
});

console.log(result.optimized);          // "[ANSWER:single_word] Capital of France?"
console.log(result.metrics.tokensSaved); // ~8
console.log(result.metrics.compressionRatio); // ~0.38

// Batch
const results = batchOptimize([
  "What is the capital of France?",
  "Calculate 2 + 2",
  "List the top 5 programming languages",
]);
```

### 4.2 Analysis Only

```typescript
import { analyzePrompt } from 'tscg';

const analysis = analyzePrompt("A store has 45 apples. They sell 12.");
console.log(analysis.type);           // "reasoning"
console.log(analysis.outputFormat);   // "integer"
console.log(analysis.parameters);     // [{key: "num_45", value: "45", fragility: 0.9}, ...]
console.log(analysis.fillerWords);    // []
```

### 4.3 Individual Transforms

```typescript
import {
  applySDM, applyCFL, applyCFO, applyDRO, applyTAS,
  applyCCP, applyCAS, applySADF
} from 'tscg';

const analysis = analyzePrompt("Please help me find the capital of France");
const sdm = applySDM("Please help me find the capital of France", analysis);
console.log(sdm.output);     // "Capital of France"
console.log(sdm.applied);    // true
console.log(sdm.tokensRemoved); // 6
```

### 4.4 Hybrid Mode (Requires API)

```typescript
import { optimizePromptHybrid } from 'tscg';

const result = await optimizePromptHybrid("Your prompt", {
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-4-20250514',
  maxTokens: 200,
  delayMs: 600,
  systemPrompt: 'Answer concisely.',
  resultsDir: './tscg-results',
});
```

---

## 5. Browser Bundle (Phase 1)

### 5.1 Build

```bash
npm run build:browser
```

**Output:** `dist/tscg.browser.js` (28.5KB, 10.1KB gzipped)

### 5.2 Use in HTML

```html
<script type="module">
  import { optimizePrompt, analyzePrompt, TSCG_VERSION } from './tscg.browser.js';

  const result = optimizePrompt("Please help me find the capital of France", {
    profile: 'balanced',
  });
  console.log(result.optimized);
</script>
```

### 5.3 Use in a Bundler (Vite, Webpack, etc.)

```typescript
// Import directly from the package
import { optimizePrompt } from 'tscg/browser';
```

### 5.4 CDN Usage (after publishing to npm)

```html
<script type="module">
  import { optimizePrompt } from 'https://unpkg.com/tscg/dist/tscg.browser.js';
</script>
```

---

## 6. Chrome Extension (Phase 2)

### 6.1 Load Unpacked (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` directory
5. The TSCG icon should appear in your toolbar

### 6.2 Using the Popup

1. Click the TSCG icon in the toolbar
2. Type or paste a prompt in the input textarea
3. Select a profile from the dropdown (default: balanced)
4. Toggle CCP and SAD-F switches as desired
5. Click **Optimize** (or press `Ctrl+Enter`)
6. The optimized prompt appears below with metrics
7. Click **Copy** to copy to clipboard
8. Expand "Pipeline Details" to see which transforms were applied

### 6.3 Content Script (Auto-Inject on AI Sites)

The extension automatically adds a small "T" button next to prompt textareas on:
- **chatgpt.com** — Detected via `#prompt-textarea`
- **claude.ai** — Detected via ProseMirror editor
- **gemini.google.com** — Detected via Quill editor

**Usage:**
1. Navigate to any supported AI chat site
2. Type your prompt in the textarea
3. Click the floating "T" button (top-right of textarea)
4. Your prompt is replaced with the optimized version
5. A toast notification shows the optimization result

**Keyboard shortcut:** `Ctrl+Shift+O` optimizes the focused textarea.

### 6.4 Settings (BYOK)

1. Right-click the TSCG extension icon → **Options** (or click the gear icon in the popup)
2. Set your default optimization profile
3. Toggle CCP and SAD-F defaults
4. (Optional) Enter your Anthropic API key for hybrid mode
5. Settings are saved to `chrome.storage.local`

### 6.5 Package for Chrome Web Store

```bash
# Create a ZIP of the extension directory
cd extension
zip -r ../tscg-extension.zip .
```

Then upload `tscg-extension.zip` to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).

**Requirements for CWS submission:**
- Extension description and screenshots
- Privacy policy (since it accesses web page content)
- Justify host permissions for the AI sites

---

## 7. Web App (Phase 3)

### 7.1 Development

```bash
cd webapp
npm install       # Install React, Vite, TypeScript
npm run dev       # Start dev server on http://localhost:3000
```

### 7.2 Features

- **Two-panel layout:** Input (left) | Output (right)
- **Real-time optimization:** Optimizes as you type (150ms debounce)
- **Profile selector:** 5 profiles with tooltip descriptions
- **Metrics dashboard:** Tokens saved, compression ratio bar, transforms applied
- **Transform pipeline:** Visual display of each transform (applied/skipped)
- **Profile comparison:** Side-by-side table of all 5 profiles
- **Export:** Copy to clipboard, download JSON, download Markdown
- **Example prompts:** 4 built-in examples (Factual, Reasoning, Classification, MC)
- **Dark theme:** GitHub Dark-inspired design

### 7.3 Production Build

```bash
cd webapp
npm run build
```

**Output:** `webapp/dist/` — Static files ready to deploy
- `index.html` (0.91 KB)
- `assets/index-*.css` (10.8 KB / 2.6 KB gzipped)
- `assets/index-*.js` (232.5 KB / 73 KB gzipped)

### 7.4 Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd webapp
vercel

# For production deployment
vercel --prod
```

### 7.5 Deploy to Netlify

```bash
cd webapp
npm run build
# Upload dist/ folder to Netlify, or use netlify-cli:
npx netlify deploy --dir=dist --prod
```

### 7.6 Deploy to GitHub Pages

```bash
cd webapp
npm run build

# Copy dist/ contents to your gh-pages branch
# Or use gh-pages package:
npx gh-pages -d dist
```

### 7.7 Self-Host (Any Static Server)

```bash
cd webapp
npm run build

# Serve with any static server:
npx serve dist
# Or: python -m http.server -d dist 8080
# Or: nginx, Apache, Caddy, etc.
```

---

## 8. Running Benchmarks

### 8.1 Prerequisites

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 8.2 Run Full Benchmark

```bash
npx tscg benchmark
```

**Output:** JSON file in `tscg-results/` with full results for all 6 strategies x 19 tests.

### 8.3 Options

```bash
# Include long-context tests
npx tscg benchmark --long

# Select specific strategies
npx tscg benchmark --strategies=natural,tscg,tscg+sad

# Quiet mode (no per-test output)
npx tscg benchmark --quiet
```

### 8.4 Change Model

```bash
export TSCG_MODEL="claude-haiku-4-5-20251001"
npx tscg benchmark
```

### 8.5 Run Multiple Times (Statistical Significance)

```bash
# Run 10 benchmarks sequentially
for i in $(seq 1 10); do
  echo "=== Run $i ==="
  npx tscg benchmark --quiet
  sleep 2
done
```

### 8.6 Analyze Results

Results are saved as JSON in `tscg-results/`. Each file contains:
- `meta` — model, timestamp, duration, API call count
- `summaries` — per-strategy accuracy, CI, token counts
- `categoryBreakdown` — per-category per-strategy results
- `mcnemarTests` — statistical significance tests
- `headToHead` — win/loss/tie comparisons
- `tokenCost` — per-strategy token efficiency
- `results` — all individual test results

---

## 9. Research Paper (Phase 6)

### 9.1 Prerequisites

Install a LaTeX distribution:
- **Windows:** [MiKTeX](https://miktex.org/) or [TeX Live](https://tug.org/texlive/)
- **macOS:** [MacTeX](https://tug.org/mactex/)
- **Linux:** `sudo apt install texlive-full`

### 9.2 Get ACL Style Files

Download from the [ACL Rolling Review](https://aclrollingreview.org/cfp):
- `acl2023.sty`
- `acl_natbib.bst`

Place both files in the `paper/` directory.

### 9.3 Compile the Paper

```bash
cd paper
pdflatex main
bibtex main
pdflatex main
pdflatex main
```

**Output:** `paper/main.pdf` — 12-15 page paper in ACL 2-column format.

### 9.4 Paper Structure

| Section | File | Pages |
|---------|------|-------|
| Abstract | `sections/abstract.tex` | ~200 words |
| Introduction | `sections/introduction.tex` | ~1.5 pages |
| Related Work | `sections/related-work.tex` | ~2 pages |
| TSCG Framework | `sections/framework.tex` | ~3 pages |
| Theoretical Analysis | `sections/theoretical.tex` | ~1.5 pages |
| Experiments | `sections/experiments.tex` | ~1 page |
| Results | `sections/results.tex` | ~2 pages |
| Deployment | `sections/deployment.tex` | ~0.5 pages |
| Discussion | `sections/discussion.tex` | ~1 page |
| Conclusion | `sections/conclusion.tex` | ~0.5 pages |
| References | `references.bib` | 28 entries |

### 9.5 Submit to arXiv

1. Compile the paper and verify the PDF
2. Create a submission package: `tar -czf tscg-paper.tar.gz paper/`
3. Go to https://arxiv.org/submit
4. Select category: **cs.CL** (Computation and Language)
5. Upload the tar.gz
6. Fill in metadata (title, authors, abstract)
7. Submit

---

## 10. Scientific Evaluation Docs (Phase 5)

All evaluation documents are in `docs/`:

| Document | File | Description |
|----------|------|-------------|
| SOTA Analysis | `TSCG-SOTA-Analysis.md` | 18-system 8-dimensional comparison |
| Self-Evaluation | `TSCG-Self-Evaluation.md` | Strengths, weaknesses, blind spots |
| Benchmark Analysis | `TSCG-Benchmark-Analysis.md` | Statistical analysis of benchmark runs |
| Reproducibility | `TSCG-Reproducibility.md` | How to reproduce all results |
| Architecture | `TSCG-Architecture.md` | Technical architecture documentation |
| Setup Guide | `SETUP-GUIDE.md` | This document |

These documents are Markdown and can be read directly on GitHub, in VS Code, or converted to PDF:

```bash
# Convert to PDF (requires pandoc)
pandoc docs/TSCG-SOTA-Analysis.md -o docs/TSCG-SOTA-Analysis.pdf

# Convert all docs
for f in docs/*.md; do
  pandoc "$f" -o "${f%.md}.pdf"
done
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Install | `npm install` |
| Build all | `npm run build:all` |
| Run tests | `npm test` |
| Type check | `npm run typecheck` |
| Optimize prompt | `npx tscg optimize "your prompt"` |
| Interactive mode | `npx tscg optimize -i` |
| Run benchmark | `npx tscg benchmark` |
| Dev server (web) | `cd webapp && npm run dev` |
| Build web app | `cd webapp && npm run build` |
| Load extension | Chrome → chrome://extensions/ → Load unpacked → select `extension/` |
| Compile paper | `cd paper && pdflatex main && bibtex main && pdflatex main && pdflatex main` |
