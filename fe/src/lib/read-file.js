// Not just `await file.text()`: jsdom (the test environment) doesn't
// implement Blob.prototype.text, and a plain FileReader is available
// everywhere real browsers run too, so it's the more portable choice
// even though it's more code. This was an AI-generated `file.text()`
// one-liner that the component test caught.
function readWithFileReader(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

export async function readTextFile(file) {
  if (typeof file.text === 'function') {
    try {
      return await file.text();
    } catch {
      // fall through to FileReader
    }
  }
  return readWithFileReader(file);
}
