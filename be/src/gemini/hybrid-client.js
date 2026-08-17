// "Text is live, images are mocked" — the mode GEMINI_IMAGE_FAKE=1 turns
// on. This is the mode the actual submission runs in for the
// reviewer-facing demo: style/characters/chapters are real Gemini
// output, only the pixels are stubbed, because the assessment's mocking
// allowance covers image generation specifically, not text.
export function createHybridClient({ real, fake, imageModel }) {
  async function uploadFile(args) {
    // The book upload is a File API call, not a generation call, and
    // it's free either way, so there's no reason to fake it.
    return real.uploadFile(args);
  }

  async function createInteraction({ model, ...rest }) {
    const client = model === imageModel ? fake : real;
    return client.createInteraction({ model, ...rest });
  }

  return { uploadFile, createInteraction };
}
