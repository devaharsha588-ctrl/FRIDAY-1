import { FormEvent, KeyboardEvent, useState } from 'react';
import { Mic, SendHorizontal, Square } from 'lucide-react';

type ChatComposerProps = {
  disabled: boolean;
  onSubmit: (message: string) => void;
};

export function ChatComposer({ disabled, onSubmit }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const speechSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  function submit(event: FormEvent) {
    event.preventDefault();
    submitMessage();
  }

  function submitFromKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submitMessage();
  }

  function submitMessage() {
    const message = value.trim();
    if (!message || disabled) return;
    setValue('');
    onSubmit(message);
  }

  return (
    <form className="composer" onSubmit={submit}>
      <button
        className="icon-button"
        type="button"
        disabled={!speechSupported || disabled}
        title={speechSupported ? 'Voice input' : 'Voice input is not supported by this browser'}
        aria-label="Voice input"
      >
        {disabled ? <Square size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
      </button>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        placeholder="Ask FRIDAY to answer, plan, open a URL, launch Notepad, or list files."
        rows={1}
        onKeyDown={submitFromKeyboard}
      />
      <button className="send-button" type="submit" disabled={disabled || !value.trim()} title="Send" aria-label="Send">
        <SendHorizontal size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
