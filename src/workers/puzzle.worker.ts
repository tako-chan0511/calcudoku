import { handleGenerate } from './handleGenerate.ts'
import { handleVerify } from './handleVerify.ts'
self.onmessage = (event: MessageEvent<unknown>) => {
  const raw = event.data
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'verify') self.postMessage(handleVerify(raw))
  else self.postMessage(handleGenerate(raw, message => self.postMessage(message)))
}
