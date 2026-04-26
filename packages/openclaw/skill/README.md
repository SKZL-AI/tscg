# @tscg/openclaw Skill

TSCG Tool-Schema Compression for OpenClaw agents. Reduces tool definition token usage by 40-65%.

## Installation

### Via npm (recommended)

```bash
npm install -g @tscg/openclaw
tscg-openclaw install
```

### Via git

```bash
git clone https://github.com/tscg-project/tscg.git
cd tscg/packages/openclaw
npm install
npx tscg-openclaw install
```

## Quick Start

1. Install the plugin
2. Run self-tune (optional, for optimal compression):
   ```bash
   tscg-openclaw tune --model claude-sonnet-4
   ```
3. The plugin automatically compresses tool definitions on every request

## How It Works

The plugin installs a `beforeToolsList` hook that:

1. Detects the current model
2. Resolves the optimal compression profile (4-tier resolution)
3. Applies TSCG compression with the profile's operator configuration
4. Returns compressed tool definitions to the LLM

## Commands

| Command | Description |
|---------|-------------|
| `tune` | Run self-tuning benchmark |
| `list-profiles` | Show cached profiles |
| `show-profile <model>` | Display a model's profile |
| `clear-profile <model>` | Delete cached profile |
| `report <model>` | Show benchmark results |
| `stats` | Show compression statistics |
| `doctor` | Run diagnostic checks |
| `install` | Install skill |
| `uninstall` | Remove skill |
