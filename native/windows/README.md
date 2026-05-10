# Windows Native Audio Helper

Phase 3 will live here.

The target implementation is a small WASAPI loopback helper that captures system output audio without relying on browser screen-share behavior. It should output PCM audio to the Electron app over a simple local transport.

Initial constraints:

- Keep microphone capture separate from system audio.
- Do not require VB-Cable or another virtual audio driver.
- Keep the helper isolated so the existing web app remains runnable.
- Match the PCM format expected by the Deepgram streaming path.
