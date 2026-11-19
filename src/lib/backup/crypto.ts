/**
 * Verschlüsselung der Sicherungsdatei mit einem Passwort – nur Bordmittel des Browsers
 * (Web Crypto), keine Bibliothek:
 *
 *  - Schlüssel aus dem Passwort: PBKDF2 mit SHA-256, 600 000 Runden (Empfehlung der OWASP),
 *    zufälliges Salz je Datei. Das macht Durchprobieren von Passwörtern teuer.
 *  - Verschlüsselung: AES-256-GCM mit zufälligem IV. GCM erkennt auch jede Veränderung an der
 *    Datei – ein falsches Passwort und eine beschädigte Datei fallen gleichermaßen auf.
 *  - Vorher gzip, damit die Datei klein bleibt.
 *
 * Das Passwort wird nirgends gespeichert. Ohne Passwort lässt sich die Datei nicht öffnen.
 */

export const KDF_ITERATIONS = 600_000;

export interface EncryptedBlock {
	kdf: 'PBKDF2-SHA256';
	iterations: number;
	cipher: 'AES-256-GCM';
	compression: 'gzip';
	salt: string;
	iv: string;
	data: string;
}

export class WrongPassword extends Error {
	constructor() {
		super('Falsches Passwort – oder die Datei ist beschädigt.');
	}
}

const enc = new TextEncoder();
const dec = new TextDecoder();
/** Bindet den Inhalt an dieses Format: Teile anderer Dateien lassen sich nicht einschmuggeln */
const AAD = enc.encode('ordo-backup/1');

function toB64(bytes: Uint8Array) {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
}
function fromB64(s: string) {
	const bin = atob(s);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
	const res = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
	return new Uint8Array(await res.arrayBuffer());
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
	const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
		'deriveKey'
	]);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function encrypt(
	text: string,
	password: string,
	iterations = KDF_ITERATIONS
): Promise<EncryptedBlock> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(password, salt, iterations);
	const packed = await pipe(enc.encode(text), new CompressionStream('gzip'));
	const data = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: AAD },
		key,
		packed as BufferSource
	);
	return {
		kdf: 'PBKDF2-SHA256',
		iterations,
		cipher: 'AES-256-GCM',
		compression: 'gzip',
		salt: toB64(salt),
		iv: toB64(iv),
		data: toB64(new Uint8Array(data))
	};
}

export async function decrypt(block: EncryptedBlock, password: string): Promise<string> {
	if (block.kdf !== 'PBKDF2-SHA256' || block.cipher !== 'AES-256-GCM')
		throw new Error('Unbekannte Verschlüsselung – ist die Datei von einer neueren Ordo-Version?');
	const key = await deriveKey(password, fromB64(block.salt), block.iterations);
	let plain: ArrayBuffer;
	try {
		plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: fromB64(block.iv) as BufferSource, additionalData: AAD },
			key,
			fromB64(block.data) as BufferSource
		);
	} catch {
		throw new WrongPassword();
	}
	return dec.decode(await pipe(new Uint8Array(plain), new DecompressionStream('gzip')));
}
