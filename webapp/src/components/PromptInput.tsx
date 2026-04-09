import { useCallback } from 'react';

const EXAMPLES = [
  {
    label: 'Factual',
    prompt:
      'Please help me find the capital of France. I would really appreciate it if you could tell me the answer.',
  },
  {
    label: 'Reasoning',
    prompt:
      'A store has 45 apples. They sell 12 and receive 30 more. How many apples remain?',
  },
  {
    label: 'Classification',
    prompt:
      'Classify the sentiment of the following text as positive, negative, or neutral: "This product exceeded all my expectations and I love it!"',
  },
  {
    label: 'Multiple Choice',
    prompt:
      'What is the primary mechanism of heat transfer through direct molecular contact?\nA. Radiation\nB. Conduction\nC. Convection\nD. Evaporation\nReply with one letter.',
  },
];

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
}

export default function PromptInput({ value, onChange }: PromptInputProps) {
  const estimatedTokens = Math.ceil(value.length / 4);

  const handleExampleClick = useCallback(
    (prompt: string) => {
      onChange(prompt);
    },
    [onChange]
  );

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Input Prompt</span>
        <div className="example-group">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              className="example-btn"
              onClick={() => handleExampleClick(ex.prompt)}
              title={ex.prompt.slice(0, 80) + '...'}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-body">
        <textarea
          className="prompt-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter a natural language prompt to optimize...\n\nExamples:\n- "Please help me find the capital of France..."\n- "A store has 45 apples. They sell 12..."\n- "Classify the sentiment of this text..."\n\nThe optimizer will apply TSCG transforms in real-time.`}
          spellCheck={false}
        />
        <div className="textarea-footer">
          <span className="char-count">
            {value.length > 0
              ? `${value.length} chars`
              : 'No input'}
          </span>
          <span className="char-count">
            {value.length > 0
              ? `~${estimatedTokens} tokens (est.)`
              : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
