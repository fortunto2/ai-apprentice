// Screen capture → frame every N ms → pixel diff → only changed frames go to the vision model.

export type Frame = { id: string; t: number; dataUrl: string; w: number; h: number };

export type CaptureOptions = {
  intervalMs?: number; // default 1500
  width?: number; // downscaled width sent to the model, default 896
  diffThreshold?: number; // fraction of sampled pixels that must change, default 0.012
  onFrame: (frame: Frame, changed: boolean, diff: number) => void;
  startedAt: number;
};

export class FrameCapture {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: number | null = null;
  private prevSample: Uint8ClampedArray | null = null;
  private seq = 0;

  constructor(private opts: CaptureOptions) {}

  async start() {
    const dm = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia(c: MediaStreamConstraints & { preferCurrentTab?: boolean; selfBrowserSurface?: string; surfaceSwitching?: string }): Promise<MediaStream>;
    };
    this.stream = await dm.getDisplayMedia({
      video: { frameRate: 4 },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "exclude",
    });
    const video = document.createElement("video");
    video.srcObject = this.stream;
    video.muted = true;
    await video.play();
    this.video = video;
    this.stream.getVideoTracks()[0].addEventListener("ended", () => this.stop());
    const tick = () => this.capture();
    this.timer = window.setInterval(tick, this.opts.intervalMs ?? 1500);
    setTimeout(tick, 300);
    return this.stream;
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
  }

  get active() {
    return this.stream !== null;
  }

  private capture() {
    const v = this.video;
    if (!v || v.videoWidth === 0) return;
    const W = this.opts.width ?? 896;
    const H = Math.round((v.videoHeight / v.videoWidth) * W);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, W, H);

    // Diff on a coarse grayscale sample (64x36) so the check costs nothing.
    const sw = 64;
    const sh = Math.max(1, Math.round((H / W) * sw));
    const sc = document.createElement("canvas");
    sc.width = sw;
    sc.height = sh;
    const sctx = sc.getContext("2d", { willReadFrequently: true })!;
    sctx.drawImage(canvas, 0, 0, sw, sh);
    const px = sctx.getImageData(0, 0, sw, sh).data;
    const gray = new Uint8ClampedArray(sw * sh);
    for (let i = 0; i < gray.length; i++) gray[i] = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    let changedPx = 0;
    if (this.prevSample) {
      for (let i = 0; i < gray.length; i++) if (Math.abs(gray[i] - this.prevSample[i]) > 18) changedPx++;
    } else changedPx = gray.length;
    const diff = changedPx / gray.length;
    const changed = diff >= (this.opts.diffThreshold ?? 0.012);
    this.prevSample = gray;

    const frame: Frame = {
      id: `f${String(++this.seq).padStart(4, "0")}`,
      t: Date.now() - this.opts.startedAt,
      dataUrl: canvas.toDataURL("image/jpeg", 0.72),
      w: W,
      h: H,
    };
    this.opts.onFrame(frame, changed, diff);
  }
}
