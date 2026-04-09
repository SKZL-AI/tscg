import { useState, useCallback, useMemo } from 'react';
import type { OptimizeResult } from '@tscg/optimizer/optimizer.js';

interface OptimizedOutputProps {
  result: OptimizeResult;
}

/**
 * Apply syntax highlighting to TSCG notation.
 * Returns an array of React elements with appropriate CSS classes.
 */
function highlightTSCG(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Regex patterns for TSCG syntax elements (processed in priority order)
  const patterns: Array<{ regex: RegExp; className: string }> = [
    // Constraint tags: [ANSWER:...] [CLASSIFY:...]
    { regex: /\[(?:ANSWER|CLASSIFY):[^\]]*\]/, className: 'tscg-constraint' },
    // Anchor tags: [ANCHOR:...]
    { regex: /\[ANCHOR:[^\]]*\]/, className: 'tscg-anchor' },
    // Context wrappers: <<CTX>> <</CTX>>
    { regex: /<<\/?CTX>>/, className: 'tscg-context' },
    // Causal closure blocks: ###<CC> ... ###</CC>
    { regex: /###<\/?CC>/, className: 'tscg-closure' },
    // Arrows
    { regex: /\u2192/, className: 'tscg-arrow' },
    // Pipes
    { regex: /\|/, className: 'tscg-pipe' },
    // Key:value pairs (word:word, but not inside brackets)
    { regex: /\b\w+:[^\s\u2192|,\]\n]+/, className: 'tscg-keyvalue' },
  ];

  while (remaining.length > 0) {
    let earliestMatch: { index: number; length: number; className: string } | null = null;

    for (const { regex, className } of patterns) {
      const match = remaining.match(regex);
      if (match && match.index !== undefined) {
        if (!earliestMatch || match.index < earliestMatch.index) {
          earliestMatch = {
            index: match.index,
            length: match[0].length,
            className,
          };
        }
      }
    }

    if (!earliestMatch) {
      // No more matches, push remaining text
      nodes.push(<span key={key++}>{remaining}</span>);
      break;
    }

    // Push text before the match
    if (earliestMatch.index > 0) {
      nodes.push(
        <span key={key++}>{remaining.slice(0, earliestMatch.index)}</span>
      );
    }

    // Push the highlighted match
    nodes.push(
      <span key={key++} className={earliestMatch.className}>
        {remaining.slice(
          earliestMatch.index,
          earliestMatch.index + earliestMatch.length
        )}
      </span>
    );

    remaining = remaining.slice(earliestMatch.index + earliestMatch.length);
  }

  return nodes;
}

export default function OptimizedOutput({ result }: OptimizedOutputProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result.optimized);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
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

  const highlighted = useMemo(
    () => highlightTSCG(result.optimized),
    [result.optimized]
  );

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Optimized Output</span>
        <button
          className={`btn btn-sm ${copied ? 'copy-feedback btn-success' : 'btn-secondary'}`}
          onClick={handleCopy}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="card-body">
        <div className="output-block">{highlighted}</div>
      </div>
    </div>
  );
}
