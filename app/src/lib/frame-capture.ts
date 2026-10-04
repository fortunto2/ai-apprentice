// Screen capture → frame every N ms → pixel diff → only changed frames are encoded and handed on.

export type Frame = { id: string; t: number; dataUrl: string; w: number; h: number };

export type CaptureOptions = {
  intervalMs?: number; // default 1500
  width?: number; // downscaled width sent to the model, default 896
  diffThreshold?: number; // fraction of sampled pixels that must change, default 0.012
  onFrame: (frame: Frame, diff: number) => void; // called only for changed frames
  startedAt: number;
};

const SAMPLE_W = 64;

export class FrameCapture {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: number | null = null;
  private prevSample: Uint8ClampedArray | null = null;
  private seq = 0;
  // Two reusable canvases: a coarse grayscale sample for the diff, the full frame only when it changed.
  private readonly sample = document.createElement("canvas");
  private readonly full = document.createElement("canvas");

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
    const aspect = v.videoHeight / v.videoWidth;

    // Diff on a 64-px-wide grayscale sample drawn straight from the video; costs nothing.
    const sh = Math.max(1, Math.round(aspect * SAMPLE_W));
    if (this.sample.width !== SAMPLE_W || this.sample.height !== sh) {
      this.sample.width = SAMPLE_W;
      this.sample.height = sh;
    }
    const sctx = this.sample.getContext("2d", { willReadFrequently: true })!;
    sctx.drawImage(v, 0, 0, SAMPLE_W, sh);
    const px = sctx.getImageData(0, 0, SAMPLE_W, sh).data;
    const gray = new Uint8ClampedArray(SAMPLE_W * sh);
    for (let i = 0; i < gray.length; i++) gray[i] = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    let changedPx = gray.length;
    if (this.prevSample && this.prevSample.length === gray.length) {
      changedPx = 0;
      for (let i = 0; i < gray.length; i++) if (Math.abs(gray[i] - this.prevSample[i]) > 18) changedPx++;
    }
    this.prevSample = gray;
    const diff = changedPx / gray.length;
    if (diff < (this.opts.diffThreshold ?? 0.012)) return;

    // Only a changed frame is worth the full draw and the JPEG encode.
    const W = this.opts.width ?? 896;
    const H = Math.round(aspect * W);
    if (this.full.width !== W || this.full.height !== H) {
      this.full.width = W;
      this.full.height = H;
    }
    this.full.getContext("2d")!.drawImage(v, 0, 0, W, H);
    this.opts.onFrame(
      { id: `f${String(++this.seq).padStart(4, "0")}`, t: Date.now() - this.opts.startedAt, dataUrl: this.full.toDataURL("image/jpeg", 0.72), w: W, h: H },
      diff,
    );
  }
}
