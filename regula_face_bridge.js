window.regulaFaceBridge = (function () {
  let stream = null;
  let video = null;
  let overlay = null;
  let statusText = null;
  let captureBtn = null;
  let cancelBtn = null;
  let resolveFn = null;
  let rejectFn = null;
  let faceCheckTimer = null;
  let isCompleting = false;

  function log(...args) {
    console.log("[regulaFaceBridge]", ...args);
  }

  function cleanup() {
    log("cleanup start");
    try {
      if (faceCheckTimer) {
        clearInterval(faceCheckTimer);
        faceCheckTimer = null;
      }

      if (video) {
        try {
          video.pause();
        } catch (_) {}
        try {
          video.srcObject = null;
        } catch (_) {}
      }

      if (stream) {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }

      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    } catch (e) {
      log("cleanup error", e);
    }

    stream = null;
    video = null;
    overlay = null;
    statusText = null;
    captureBtn = null;
    cancelBtn = null;
    resolveFn = null;
    rejectFn = null;
    faceCheckTimer = null;
    isCompleting = false;
    log("cleanup end");
  }

  function makeResponse(errorCode, message, bitmap) {
    return {
      exception: {
        errorCode: errorCode,
        message: message || ""
      },
      image: bitmap
        ? {
            imageType: 3,
            bitmap: bitmap
          }
        : {}
    };
  }

  function setStatus(text) {
    log("status:", text);
    if (statusText) statusText.textContent = text;
  }

  function complete(response) {
    if (isCompleting) return;
    isCompleting = true;
    log("complete called", response);
    const done = resolveFn;
    cleanup();
    if (done) done(response);
  }

  function captureCurrentFrame() {
    log("captureCurrentFrame start");

    if (!video) {
      log("captureCurrentFrame failed: no video");
      return makeResponse(2, "Video element not available", null);
    }

    if (!video.videoWidth || !video.videoHeight) {
      log("captureCurrentFrame failed: invalid frame size", video.videoWidth, video.videoHeight);
      return makeResponse(2, "Unable to read camera frame", null);
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const base64Image = dataUrl.split(",")[1];

    log("captureCurrentFrame success, base64 length:", base64Image ? base64Image.length : 0);
    return makeResponse(0, "", base64Image);
  }

  function buildOverlay() {
    log("buildOverlay");

    overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.background = "rgba(0,0,0,0.90)";
    overlay.style.zIndex = "999999";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const previewWrap = document.createElement("div");
    previewWrap.style.position = "relative";
    previewWrap.style.width = "360px";
    previewWrap.style.maxWidth = "92vw";
    previewWrap.style.height = "520px";
    previewWrap.style.maxHeight = "78vh";
    previewWrap.style.background = "#000";
    previewWrap.style.borderRadius = "20px";
    previewWrap.style.overflow = "hidden";
    previewWrap.style.boxShadow = "0 10px 30px rgba(0,0,0,0.4)";

    const guide = document.createElement("div");
    guide.style.position = "absolute";
    guide.style.left = "50%";
    guide.style.top = "46%";
    guide.style.transform = "translate(-50%, -50%)";
    guide.style.width = "220px";
    guide.style.height = "280px";
    guide.style.border = "3px solid #fff";
    guide.style.borderRadius = "50%";
    guide.style.boxShadow = "0 0 0 9999px rgba(0,0,0,0.35)";
    guide.style.pointerEvents = "none";

    statusText = document.createElement("div");
    statusText.textContent = "Starting camera...";
    statusText.style.color = "#fff";
    statusText.style.marginTop = "18px";
    statusText.style.fontSize = "16px";
    statusText.style.fontWeight = "600";
    statusText.style.textAlign = "center";

    captureBtn = document.createElement("button");
    captureBtn.textContent = "Capture";
    captureBtn.style.marginTop = "16px";
    captureBtn.style.padding = "12px 22px";
    captureBtn.style.borderRadius = "12px";
    captureBtn.style.border = "none";
    captureBtn.style.cursor = "pointer";
    captureBtn.style.fontSize = "15px";
    captureBtn.style.fontWeight = "600";

    cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.marginTop = "10px";
    cancelBtn.style.padding = "10px 18px";
    cancelBtn.style.borderRadius = "12px";
    cancelBtn.style.border = "1px solid #ccc";
    cancelBtn.style.background = "transparent";
    cancelBtn.style.color = "#fff";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.style.fontSize = "14px";

    previewWrap.appendChild(video);
    previewWrap.appendChild(guide);

    overlay.appendChild(previewWrap);
    overlay.appendChild(statusText);
    overlay.appendChild(captureBtn);
    overlay.appendChild(cancelBtn);

    document.body.appendChild(overlay);

    captureBtn.onclick = function () {
      log("Capture button clicked");
      const response = captureCurrentFrame();
      complete(response);
    };

    cancelBtn.onclick = function () {
      log("Cancel button clicked");
      complete(makeResponse(1, "Face capture cancelled", null));
    };
  }

  async function tryAutoDetect() {
    if (!("FaceDetector" in window)) {
      log("FaceDetector not available, manual capture only");
      setStatus("Align face and press Capture");
      return;
    }

    log("FaceDetector available");
    const detector = new FaceDetector({
      fastMode: true,
      maxDetectedFaces: 1
    });

    let stableCount = 0;

    faceCheckTimer = setInterval(async () => {
      try {
        if (!video || !video.videoWidth || !video.videoHeight) {
          setStatus("Waiting for camera...");
          return;
        }

        const faces = await detector.detect(video);
        log("faces detected:", faces ? faces.length : 0);

        if (!faces || faces.length !== 1) {
          stableCount = 0;
          setStatus(!faces || faces.length === 0 ? "No face detected" : "Multiple faces detected");
          return;
        }

        const box = faces[0].boundingBox;
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;

        const centered =
          centerX > vw * 0.35 &&
          centerX < vw * 0.65 &&
          centerY > vh * 0.30 &&
          centerY < vh * 0.70;

        const largeEnough =
          box.width > vw * 0.22 &&
          box.height > vh * 0.22;

        log("face box:", box, "centered:", centered, "largeEnough:", largeEnough);

        if (centered && largeEnough) {
          stableCount++;
          setStatus("Hold still...");
        } else {
          stableCount = 0;
          setStatus("Move face into the circle");
        }

        if (stableCount >= 3) {
          log("Auto capture triggered");
          const response = captureCurrentFrame();
          complete(response);
        }
      } catch (e) {
        log("Auto detect error:", e);
        setStatus("Align face and press Capture");
      }
    }, 350);
  }

  return {
    async initialize() {
      log("initialize called");
      return true;
    },

    async presentFaceCaptureActivity() {
      log("presentFaceCaptureActivity called");

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          log("getUserMedia not supported");
          return makeResponse(2, "Camera API not supported", null);
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        log("stream received");

        video = document.createElement("video");
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";

        await video.play();
        log("video playing", video.videoWidth, video.videoHeight);

        buildOverlay();
        setStatus("Align your face");

        setTimeout(() => {
          tryAutoDetect();
        }, 900);

        return await new Promise((resolve, reject) => {
          resolveFn = resolve;
          rejectFn = reject;
        });
      } catch (e) {
        log("presentFaceCaptureActivity error:", e);
        cleanup();
        return makeResponse(2, String(e), null);
      }
    },

    async stopFaceCaptureActivity() {
      log("stopFaceCaptureActivity called");
      cleanup();
      return true;
    }
  };
})();