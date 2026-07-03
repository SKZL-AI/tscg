# TSCG Website-Konzept

## Kurzpositionierung

TSCG ist eine deterministische Tool-Schema Compression Grammar fuer agentische KI-Systeme. Sie reduziert Tool-Definition-Overhead, macht Werkzeugnutzung fuer kleinere Modelle robuster und liefert messbare Vorteile in MCP-, RAG- und Function-Calling-Workflows.

Empfohlene Website-Kernaussage:

> TSCG makes tool-heavy AI agents cheaper, faster and more reliable by compressing tool schemas without hiding the evidence.

Deutsch gedacht:

> TSCG macht tool-intensive KI-Agenten guenstiger, schneller und robuster: durch deterministische Tool-Schema-Kompression, reproduzierbare Benchmarks und integrationsnahe Packages.

## Strategische Leitidee

Die Website soll kein "AI magic" verkaufen. Sie soll in den ersten Sekunden beweisen:

- Es gibt ein reales Problem: Tool-Schemas fressen Kontext, Kosten und Modellkapazitaet.
- TSCG loest dieses Problem deterministisch, ohne LLM-in-the-loop.
- Der Nutzen ist messbar: Token Savings, Accuracy Retention, Small-Model Enablement, MCP-Proxy-Einsatz.
- Die Forschung ist pruefbar: Papers, Benchmarks, externe Validierungen, Repo, npm-Pakete.
- Der Einstieg ist praktisch: Installation, Codebeispiel, MCP/SDK-Integrationen.

## Primaere Zielgruppen

### 1. Agentic AI Engineers

Sie bauen Tool-using Agents, MCP-Server, LangChain-/Vercel-AI-SDK-Workflows oder interne Agentenplattformen.

Sie brauchen:

- schnelle technische Orientierung
- klares Codebeispiel
- Vergleich "JSON schema vs TSCG"
- Vertrauen, dass Tool-Namen und Parameter semantisch erhalten bleiben
- Hinweise fuer Modellprofile und Produktionsrisiken

### 2. Technical Leads / CTOs

Sie entscheiden ueber Kosten, Latenz und Architektur in produktiven LLM-Systemen.

Sie brauchen:

- Kostenargument
- Reliability-Argument
- Integrationspfad
- Sicherheits-/Determinismusargument
- belegte Ergebnisse statt Claim-Flut

### 3. AI Researchers / Benchmark-Minded Readers

Sie pruefen, ob die Claims methodisch tragfaehig sind.

Sie brauchen:

- Paper-Zugang
- Benchmark-Methodik
- externe Validierung
- Limitationen
- reproduzierbare Harness-/Result-Pfade

### 4. Open-Source Users

Sie wollen installieren, testen, mitwirken.

Sie brauchen:

- Quick Start
- Package-Auswahl
- CLI- und API-Beispiele
- Contribution-Hinweise
- klare Roadmap

## Website-Tonalitaet

Empfohlen: technisch klar, selbstbewusst, aber nicht ueberdreht.

Vermeiden:

- generische AI-gradient-Heroes
- unpruefbare Superlative
- "revolutionary", "magical", "unlock your potential"
- dekorative Code-Walls ohne Bedeutung
- ueberladene Benchmark-Tabellen im ersten Viewport

Nutzen:

- "deterministic"
- "tool-schema compression"
- "agentic AI infrastructure"
- "MCP-ready"
- "measured on 20,000+ API calls"
- "zero dependencies"
- "sub-millisecond compression"
- "small-model enablement"

## Informationsarchitektur

### Hauptnavigation

- Problem
- Results
- How it works
- Integrations
- Research
- Docs
- GitHub

### Seitenstruktur fuer MVP

#### 1. Home

Ziel: In 30 Sekunden verstanden werden.

Abschnitte:

1. Hero mit Kernaussage, 2 CTAs und drei Proof-Metriken.
2. Problem: JSON tool schemas scale badly.
3. Result Strip: token savings, accuracy deltas, small-model recovery, MCP cost savings.
4. How TSCG Works: JSON schema -> compact grammar -> model-ready tool signal.
5. Integration Paths: `@tscg/core`, `@tscg/mcp-proxy`, `@tscg/tool-optimizer`.
6. Evidence: Papers, BFCL/ToolBench/API-Bank/MCP validation, benchmark volume.
7. Quick Start Code.
8. CTA: Install, read paper, inspect GitHub.

#### 2. Results / Evidence

Ziel: Claims pruefbar machen.

Abschnitte:

- headline benchmarks
- frontier model results
- small-model enablement
- external validation
- production metrics
- limitations and caveats

#### 3. How It Works

Ziel: Technisches Mental Model vermitteln.

Abschnitte:

- input problem: repeated JSON schema overhead
- transform pipeline
- model profiles
- deterministic compression
- why structured schemas compress better than natural language

#### 4. Integrations

Ziel: Developer zum Test bringen.

Abschnitte:

- Core package
- MCP Proxy
- Tool Optimizer wrappers
- LangChain / Vercel AI SDK notes
- CLI

#### 5. Research

Ziel: Paper- und Methodik-Tiefe.

Abschnitte:

- Paper 1
- Paper 2: Agentic RAG Enablement
- Benchmark methodology
- reproducibility
- known limitations

#### 6. Docs

Ziel: Einstieg in bestehende Repo-Dokumentation.

Abschnitte:

- Setup Guide
- Architecture
- Reproducibility
- Findings
- API docs

## Home Page Content Blueprint

### Hero

Headline:

> Compress tool schemas. Preserve tool intelligence.

Subline:

> TSCG is a deterministic grammar for reducing LLM tool-definition overhead by 50-72% while keeping agent workflows inspectable, reproducible and MCP-ready.

Primary CTA:

> Install TSCG

Secondary CTA:

> Read the benchmark results

Proof metrics:

- 50-72% tool-schema token savings
- 20,000+ benchmark calls
- Zero dependencies
- Sub-millisecond compression

### Problem Section

Core message:

> Every tool-heavy agent pays a hidden tax: repeated JSON Schemas consume context before the model can reason about the user task.

Show a side-by-side visual:

- left: verbose JSON schema block
- right: compact TSCG grammar line
- bottom: "same tool signal, less context pressure"

### Results Section

Use compact evidence cards:

- Small models: JSON 0-49% -> TSCG 65-90%
- MCP Proxy: 56-72% token savings
- Frontier models: BFCL gains across Claude/GPT models
- RAG: TSCG enables tool-heavy agentic RAG under constrained contexts

### How It Works Section

Use a 3-step process:

1. Parse tool schemas.
2. Apply deterministic TSCG transforms.
3. Render compact model-targeted grammar.

Keep this visual precise, not decorative.

### Integrations Section

Show three package tracks:

- `@tscg/core` - compression engine
- `@tscg/mcp-proxy` - transparent MCP middleware
- `@tscg/tool-optimizer` - framework integrations

### Research Section

Message:

> TSCG is built as research infrastructure first: papers, benchmark harnesses, raw methodology docs and reproducibility notes live in the repo.

Link targets:

- `TSCG-paper.pdf`
- `TSCG-RAG-Benchmark-Paper.pdf`
- `docs/TSCG-Reproducibility.md`
- `findings/tscg-master-empirical-report-v1.4.2.md`

## Visual Direction

### Mood

Precise, technical, energetic, research-grade.

### Layout

- Dense but readable.
- First viewport must show product name, claim, metric proof and CTA.
- Avoid marketing fluff and oversized empty hero space.
- Use structured evidence bands, tables and code panels.
- Keep cards for repeated items only: metrics, packages, integrations, evidence blocks.

### Palette

Avoid generic purple-blue AI gradients as dominant theme.

Suggested palette:

- Background: near-white or very dark charcoal, not middle gray.
- Primary accent: electric cyan or signal green.
- Secondary accent: amber or red-orange for warnings/problem pressure.
- Neutral text: high contrast.
- Code panels: dark, crisp, syntax-highlighted.

### Typography

- Technical sans for UI.
- Monospace for code, metrics and grammar snippets.
- No viewport-width font scaling.
- Use tight hierarchy: hero big, panels compact.

### Interaction

Useful interactions only:

- toggle JSON vs TSCG
- package selector
- metric tabs by model family
- copy-to-clipboard code
- benchmark filter chips

Avoid:

- decorative particle fields
- random neural-network animations
- heavy 3D unless it directly explains schema compression

## MVP Scope

Build one strong landing page first:

- Hero
- Problem
- Results
- How it works
- Integrations
- Quick start
- Research proof
- Footer

Do not start with a generic blog, pricing page or full docs redesign. The repo already carries docs; the website should make the project understandable and credible.

## Open Decisions

- Final domain and deployment platform.
- Whether the website should be static-only or use a framework.
- Whether the first implementation should be Astro, Next.js or a single static prototype from Claude.
- Whether German content is needed. Recommendation: primary website in English, German internal concept docs remain useful for planning.

