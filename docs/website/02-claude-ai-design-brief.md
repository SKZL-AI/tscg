# Claude AI Design Brief for TSCG Website

Use this prompt in Claude AI / Claude Artifacts to generate the first frontend design for TSCG.

## Copy-Ready Prompt

```text
You are designing the first production-quality landing page for TSCG, an open-source technical research product.

Product:
TSCG = Tool-Schema Compression Grammar. It is a deterministic tool-schema compression system for LLM agents. It reduces repeated JSON tool-definition overhead, improves tool-use robustness for small models, and integrates with agentic AI workflows such as MCP, LangChain and Vercel AI SDK.

Primary audience:
- AI engineers building tool-heavy LLM agents
- MCP / agent framework developers
- technical leads evaluating cost, latency and reliability
- AI researchers who need reproducible evidence

Core positioning:
"Compress tool schemas. Preserve tool intelligence."

Hero copy:
Headline: Compress tool schemas. Preserve tool intelligence.
Subline: TSCG is a deterministic grammar for reducing LLM tool-definition overhead by 50-72% while keeping agent workflows inspectable, reproducible and MCP-ready.
Primary CTA: Install TSCG
Secondary CTA: Read the benchmark results

Key proof points to show above or directly below the fold:
- 50-72% tool-schema token savings
- 20,000+ benchmark calls
- zero dependencies
- sub-millisecond compression
- MCP-ready
- small-model enablement

Design goal:
Create a serious technical product site, not a generic AI startup landing page. The page should feel credible, sharp, research-backed and developer-friendly. Make the value inspectable within seconds.

Required page sections:
1. Hero
   - product name and core claim
   - 2 CTAs
   - compact proof metric row
   - a meaningful visual showing verbose JSON schema compressed into compact TSCG grammar

2. Problem
   Explain that tool-heavy agents waste context on repeated JSON Schemas before the model can reason about the user task.

3. Results
   Use evidence cards:
   - 50-72% schema token savings
   - small models recover from weak JSON tool use to useful TSCG tool use
   - MCP proxy reduces token cost and latency
   - external validation across benchmark suites

4. How it works
   3-step flow:
   - parse tool schemas
   - apply deterministic TSCG transforms
   - render compact model-targeted grammar

5. Integrations
   Show three package tracks:
   - @tscg/core: compression engine
   - @tscg/mcp-proxy: transparent MCP middleware
   - @tscg/tool-optimizer: framework integrations

6. Quick start
   Include a compact npm install block and TypeScript code snippet:
   npm install @tscg/core
   import { compress } from '@tscg/core';

7. Research proof
   Show papers, reproducibility, benchmark harness and findings as linked proof assets.

8. Footer
   GitHub, npm packages, docs, papers, license.

Visual direction:
- precise, technical, energetic, research-grade
- no generic purple/blue AI gradient as the dominant style
- use a high-contrast palette with charcoal/near-white, signal green or cyan, and restrained amber for problem/cost pressure
- use crisp code panels and metric strips
- use cards only for repeated metric/package/evidence blocks
- do not use decorative orbs, bokeh blobs, random neural networks or vague AI imagery
- keep typography readable and dense; this is a developer/research product
- first viewport must show product name, clear claim, proof metrics and CTAs
- include hover/focus states and accessible contrast
- mobile-first responsive layout

Interaction ideas:
- toggle between "JSON Schema" and "TSCG Grammar"
- copy-to-clipboard code blocks
- filterable metric cards by "Cost", "Accuracy", "Small Models", "MCP"
- package selector tabs for core / mcp-proxy / tool-optimizer

Content snippets you can use:
Problem line:
"Every tool-heavy agent pays a hidden tax: repeated JSON Schemas consume context before the model can reason about the task."

Result line:
"TSCG converts verbose tool definitions into compact, deterministic grammar while preserving the model-facing tool signal."

Research line:
"Built from reproducible benchmarks, not vibes: papers, harnesses and findings are public in the repo."

Package descriptions:
@tscg/core - zero-dependency deterministic compression engine.
@tscg/mcp-proxy - transparent MCP middleware for tool schema compression.
@tscg/tool-optimizer - wrappers for agent frameworks and SDK integrations.

Output:
Create a polished responsive frontend mockup as a single-page website. Use realistic content, not lorem ipsum. Prefer HTML/CSS/React-style component structure if possible. The design should be ready to hand to an engineer for implementation.
```

## Claude Follow-Up Prompt for Iteration

```text
Now refine the TSCG landing page with these constraints:

- Make the first viewport denser and more technical.
- Add a concrete JSON-vs-TSCG comparison visual.
- Replace any vague AI language with measurable claims.
- Ensure the page does not look like a generic SaaS template.
- Add a "Research-backed" section with paper and benchmark references.
- Improve mobile layout so metrics do not overflow.
- Keep all text concise and developer-facing.
```

## Claude Prompt for Component Extraction

```text
Convert this design into reusable frontend sections:

- Hero
- ProofMetrics
- ProblemComparison
- ResultsGrid
- HowItWorks
- IntegrationTabs
- QuickStartCode
- ResearchProof
- SiteFooter

For each component, define props, responsive behavior, accessibility notes and sample content.
```

