import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
export function createHash(algorithm) { if(algorithm!=='sha256')throw new Error('Unsupported hash');const hash=sha256.create();return {update(value){hash.update(typeof value==='string'?new TextEncoder().encode(value):value);return this},digest(format){const value=hash.digest();return format==='hex'?bytesToHex(value):value}} }
export function randomUUID(){return crypto.randomUUID()}
export function randomBytes(count){const value=crypto.getRandomValues(new Uint8Array(count));return {toString(format){if(format==='hex')return bytesToHex(value);let text='';for(const x of value)text+=String.fromCharCode(x);return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}}}
