import { useState, useCallback } from 'react';
import type { OptimizeResult } from '@tscg/optimizer/optimizer.js';

interface ExportPanelProps {
  result: OptimizeResult;
  onExportJSON: () => void;
  onExportMarkdown: () => void;
}

export default function ExportPanel({
  result,
  onExportJSON,
  onExportMarkdown,
}: ExportPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result.optimized);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = result.optimized;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result.optimized]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Export</span>
      </div>
      <div className="card-body">
        <div className="export-group">
          <button
            className={`btn ${copied ? 'copy-feedback btn-success' : 'btn-primary'}`}
            onClick={handleCopy}
          >
            {copied ? '\u2713 Copied!' : 'Copy to Clipboard'}
          </button>
          <button className="btn btn-secondary" onClick={onExportJSON}>
            Download JSON
          </button>
          <button className="btn btn-secondary" onClick={onExportMarkdown}>
            Download Markdown
          </button>
        </div>
      </div>
    </div>
  );
}
