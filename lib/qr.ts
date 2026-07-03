/**
 * QR code utilities — no external npm dependencies.
 * Uses the qrserver.com API to generate QR images.
 */

export function getQrImageUrl(url: string, size = 200): string {
  const params = new URLSearchParams({
    size: `${size}x${size}`,
    data: url,
    margin: '0',
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params}`;
}

export async function downloadQr(url: string, filename = 'qr-reservas.png'): Promise<void> {
  const res = await fetch(getQrImageUrl(url, 512));
  if (!res.ok) throw new Error('No se pudo generar el QR');
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objUrl);
}
