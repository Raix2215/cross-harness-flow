import { FlowError } from './types.js';
const patterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:sk-(?:proj-)?[\w-]{16,}|AIza[\w-]{24,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{24,}|xox[baprs]-[\w-]{12,}|AKIA[A-Z0-9]{16}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g,
  /\b(?:authorization\s*:\s*bearer|bearer)\s+[\w.+/=_-]{8,}/gi,
  /\b(?:[\w-]*(?:api[_-]?key|oauth[_-]?token|access[_-]?token|refresh[_-]?token)|(?:set-)?cookie|password|client[_-]?secret)\s*[:=]\s*["']?[\w.+/%=:_-]{8,}/gi,
];
export function redact(value: string): string {
  return patterns.reduce((s,r)=>s.replace(r,'[redacted]'),value);
}
export function clean(value: string): string {
  if (redact(value)!==value) throw new FlowError('sensitive_input','Remove credentials and email addresses before submitting.');
  return value;
}
export function input(value: string): string {
  clean(value);
  if (!value.trim() || Buffer.byteLength(value)>1024*1024 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw new FlowError('invalid_args','Use nonempty plain text of at most 1 MiB.');
  return value;
}
