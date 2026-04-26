# Troubleshooting

## Common Issues

### 1. "Cannot find module '@tscg/core'"

**Cause**: @tscg/core peer dependency not installed.

**Fix**: `npm install @tscg/core@^1.4.1`

### 2. Compression not working (tools unchanged)

**Cause**: Plugin may be failing silently (graceful degradation).

**Fix**: Check logs for `[tscg] Compression failed` messages. Run `tscg-openclaw doctor` to diagnose.

### 3. "Profile cache is X days old"

**Cause**: Cached profile may be outdated.

**Fix**: Re-run `tscg-openclaw tune --model <model> --force`

### 4. High accuracy regression after enabling TSCG

**Cause**: Wrong profile for your model.

**Fix**:
1. Run `tscg-openclaw show-profile <model>` to see current profile
2. Run `tscg-openclaw tune --model <model> --full` for a full benchmark
3. Use `--optimize-for accuracy` flag to prioritize accuracy

### 5. Ollama connection errors

**Cause**: Ollama not running or wrong port.

**Fix**:
1. Ensure Ollama is running: `ollama serve`
2. Check port: default is `http://localhost:11434`
3. Set custom URL: `OLLAMA_BASE_URL=http://custom:port`

### 6. "Unacceptable accuracy regression" in tune results

**Cause**: All conditions failed the -5pp accuracy gate.

**Fix**: This is expected for some models. The fallback conservative profile (SDM only) will be used, which is safe but provides less savings.

### 7. Stats not recording

**Cause**: Stats JSONL file write failure.

**Fix**: Ensure `~/.openclaw/` directory exists and is writable. Run `tscg-openclaw doctor`.
