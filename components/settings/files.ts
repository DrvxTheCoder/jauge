/** Hands the user a text file to save. */
export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Reads the file picked in an <input type="file">, then clears it so the same file can be picked again. */
export async function takeFile(e: React.ChangeEvent<HTMLInputElement>): Promise<{ name: string; text: string } | null> {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return null;
  return { name: file.name, text: await file.text() };
}
