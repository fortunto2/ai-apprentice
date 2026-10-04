// Records the shared screen as webm while the apprentice watches, so a Work Map step can replay the
// expert's moment as video, not a still. Timestamps line up with the session clock (both start together).

export class ScreenRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  start(stream: MediaStream) {
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return false;
    this.chunks = [];
    this.rec = new MediaRecorder(new MediaStream(stream.getVideoTracks()), { mimeType: mime, videoBitsPerSecond: 1_200_000 });
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.rec.start(1000);
    return true;
  }

  get active() {
    return this.rec?.state === "recording";
  }

  stop(): Promise<Blob | null> {
    const rec = this.rec;
    if (!rec || rec.state === "inactive") return Promise.resolve(this.chunks.length ? new Blob(this.chunks, { type: rec?.mimeType }) : null);
    return new Promise((res) => {
      rec.onstop = () => res(new Blob(this.chunks, { type: rec.mimeType }));
      rec.stop();
      this.rec = null;
    });
  }
}
