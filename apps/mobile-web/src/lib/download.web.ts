/**
 * Web-only download helper. Saves a data-URL image to the user's downloads.
 */
export function downloadCapture(dataUrl: string, filename?: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename ?? defaultFilename();
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function defaultFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `clearrelay-${stamp}.jpg`;
}
