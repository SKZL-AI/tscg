# Research-Harmonisierung fuer die TSCG Website

Dieses Dokument beschreibt, wie das Website-Konzept mit der bestehenden TSCG-Forschung und den zusaetzlichen Website-/Portfolio-Researches harmonisiert wurde.

## Interne TSCG-Forschung

Das Website-Konzept stuetzt sich auf folgende Repo-Quellen:

- `README.md` - aktuelle Produktpositionierung, Quick Start, Package-Uebersicht und zentrale Benchmarks.
- `findings/tscg-master-empirical-report-v1.4.2.md` - konsolidierte empirische Ergebnisse ueber 20,000+ API Calls.
- `findings/small-model-enablement-v1.4.2.md` - Argumentationsbasis fuer Small-Model Enablement.
- `findings/production-deployment-metrics-v1.4.2.md` - Kosten-, Latenz- und MCP-Proxy-Nutzen.
- `findings/external-validation-bfcl-toolbench-v1.4.2.md` - externe Validierung und Benchmark-Glaubwuerdigkeit.
- `docs/TSCG-Architecture.md` - technische Pipeline, Transform-Logik und Package-Struktur.
- `docs/TSCG-Reproducibility.md` - Reproduzierbarkeit als Trust-Signal.
- `TSCG-paper.pdf` und `TSCG-RAG-Benchmark-Paper.pdf` - Paper-Ebene fuer Research-Proof.

## Zusaetzliche Website-/Portfolio-Researches

Die externen Researches legen eine klare Richtung nahe:

- Erst Positionierung und Beweisarchitektur, dann visuelle Veredelung.
- Website als Experten-Hub, nicht als austauschbare Portfolio- oder Agentur-Seite.
- Trust-Signale als Beweiskette: Claim, Evidence, Cases, technische Qualitaet, Kontaktierbarkeit.
- Content-first und performance-first Architektur.
- Accessibility als Grundqualitaet, nicht als spaeteres Add-on.
- Spezifische CTAs statt generischer Buttontexte.
- Keine dekorative KI-Aesthetik ohne Informationswert.

Fuer TSCG bedeutet das:

- Die Website muss Benchmark- und Produktnutzen sofort sichtbar machen.
- Der Hero darf nicht nur "AI infrastructure" sagen, sondern muss Token Savings, Determinismus und MCP/Agent-Relevanz zeigen.
- Die Designvisuals sollen echte Produktlogik zeigen: JSON Schema -> TSCG Grammar -> weniger Kontextdruck.
- Research-Proof ist ein Hauptbestandteil der Conversion, nicht ein Footer-Link.

## Harmonisiertes Zielbild

TSCG wird als technisches Research-Produkt positioniert:

> A deterministic compression layer for tool-heavy LLM agents.

Diese Position verbindet:

- Produktnutzen: Kosten, Latenz, Kontextfenster, Tool-Robustheit.
- Forschung: benchmarked, reproducible, externally validated.
- Developer Experience: npm packages, CLI, MCP Proxy, SDK wrappers.
- Agentic-AI-Relevanz: Tool-heavy workflows, constrained contexts, small models, RAG.

## Warum kein klassisches Portfolio-Konzept?

Die Deep-Research-Kette empfiehlt fuer KI-Expert:innen oft eine Portfolio-/Experten-Hub-Struktur. Fuer TSCG muss diese Logik angepasst werden:

- TSCG ist nicht primaer eine Personenseite.
- TSCG ist ein Open-Source-Produkt mit Papers, Packages und Benchmarks.
- Die Website sollte daher eher wie eine Research-backed Developer Product Site funktionieren.

Portfolio-Elemente bleiben aber nutzbar als:

- Case Studies fuer MCP/agentic deployments.
- Benchmarks als Proof Cards.
- Research-Papers als Trust Assets.
- "How it works" als Kompetenznachweis.

## Design-Implikationen

Die Researches sprechen gegen:

- leere Hero-Flaechen
- rein atmosphaerische KI-Bilder
- generische Startup-Sprache
- unuebersichtliche Benchmark-Waende direkt im Einstieg

Sie sprechen fuer:

- klaren ersten Viewport
- kurze Metrikreihe
- visuelle Kompressionserklaerung
- modulare Evidence Cards
- Quick Start vor tiefem Paper-Kontext
- Accessibility- und Performance-Bewusstsein

## Empfohlene erste Umsetzung

Fuer Claude AI Design sollte zuerst ein statischer, hochwertiger Landing-Page-Prototyp entstehen.

Danach kann entschieden werden:

- Astro fuer content-first Website mit Papers/Docs/Blog.
- Next.js, falls interaktive Demos, API-Demos oder Playground frueh relevant werden.
- Reine statische HTML/CSS-Prototypisierung, falls zuerst nur visuelle Richtung gebraucht wird.

Die aktuelle Empfehlung:

1. Claude erzeugt visuelles Landing-Page-Design.
2. Mensch/Codex prueft Messaging, Accessibility und technische Glaubwuerdigkeit.
3. Danach Umsetzung als Astro oder Next.js, je nach Demo-Bedarf.
