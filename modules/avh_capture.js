export const register = (navi) => {
  let stream = null;

  function stopCamera() {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  const capture = {
    stopCamera,

    async startCamera(videoEl) {
      if (!videoEl) throw new Error("video element required");
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      videoEl.srcObject = stream;
      await videoEl.play();
      return stream;
    },

    async snapFromVideo(videoEl) {
      if (!videoEl?.videoWidth) {
        throw new Error("camera not ready");
      }
      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoEl, 0, 0);
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("capture failed"))),
          "image/jpeg",
          0.92
        );
      });
    },

    buildScanTitle(code, docId) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      return `scan/${code}/${docId}/${ts}`;
    },

    async persistScan(code, blob, options = {}) {
      const regMod = navi.mod.avh_registry;
      if (!regMod?.registry) {
        throw new Error("registry not mounted");
      }
      const { registry } = regMod;
      registry.validateCode(code);
      const docId = registry.newDocId(code);
      const storagePath = `avh:owners/${code}/documents/${docId}.jpg`;
      const content = await blobToBase64(blob);
      await navi.storage.file.save(storagePath, {
        media: content,
        mime: "image/jpeg",
      });
      const doc = {
        id: docId,
        type: "scan",
        title: capture.buildScanTitle(code, docId),
        created: new Date().toISOString(),
        storagePath,
        mime: "image/jpeg",
      };
      if (options.petId) {
        doc.petId = options.petId;
      }
      await registry.addDoc(code, doc);
      return doc;
    },
  };

  return {
    name: "avh_capture",
    version: "0.1.1",
    description: "Camera capture for owner document scans (L2)",

    moduleInfo: {
      name: "avh_capture",
      version: "0.1.1",
      description: "Camera capture for owner document scans (L2)",
    },

    capture,

    onMount: async () => {
      navi.callout("[avh_capture] L2 capture ready");
    },

    onUnmount: () => {
      stopCamera();
    },
  };
};
