const triggerFileDownload = (filename: string, url: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
};

export const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  triggerFileDownload(filename, url);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const downloadTextFile = (filename: string, content: string, mimeType = "application/json") => {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(filename, blob);
};
