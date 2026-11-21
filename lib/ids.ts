import { randomBytes, randomInt } from 'node:crypto';
export function makePublicId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = (n: number) => Array.from({length:n}, () => alphabet[randomInt(alphabet.length)]).join('');
  return `TN-${part(4)}-${part(4)}`;
}
export function makeRecoveryCode() { return randomBytes(18).toString('base64url').toUpperCase().match(/.{1,6}/g)!.join('-'); }
