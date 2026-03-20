import { useState } from 'react';
import { Button, Icon } from '../ui';

/**
 * Recovery codes, shown once. The person copies or downloads them and confirms they saved
 * them; SnackHub keeps only their hashes, so they can never be shown again.
 */
export default function RecoveryCodes({ codes, onDone, doneLabel = 'I have saved them' }) {
  const [copied, setCopied] = useState(false);
  const text = `SnackHub recovery codes\nEach works once, if you lose your phone.\n\n${codes.join('\n')}\n`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'snackhub-recovery-codes.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <div className="flex items-start gap-3 rounded-2xl bg-sun/25 p-4 text-sm">
        <Icon name="key" className="mt-0.5 h-5 w-5 shrink-0 text-orange-text" />
        <p>
          <b>Save these ten recovery codes now.</b> Each one signs you in once if you lose your phone. Keep them in a password manager or on paper, not in your email. You will not see them again.
        </p>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-grey-800/10 bg-white p-4 font-mono text-base">
        {codes.map((c) => (
          <li key={c} className="rounded-lg bg-grey-50 px-3 py-1.5 text-center tracking-wider">{c}</li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={copy}><Icon name="list" className="h-4 w-4" /> {copied ? 'Copied' : 'Copy'}</Button>
        <Button variant="ghost" size="sm" onClick={download}><Icon name="file" className="h-4 w-4" /> Download</Button>
      </div>
      <Button className="mt-5 w-full" onClick={onDone}>{doneLabel}</Button>
    </div>
  );
}
