# macOS Native Audio Helper

Phase 2 will live here.

The target implementation is a small ScreenCaptureKit-based helper that captures system audio without relying on browser tab or screen-share audio. It should output PCM audio to the Electron app over a simple local transport.

Initial constraints:

- Keep microphone capture separate from system audio.
- Do not require BlackHole, Loopback, or another virtual audio device.
- Keep the helper isolated so the existing web app remains runnable.
- Prefer a narrow helper process over moving the full app into Swift.
