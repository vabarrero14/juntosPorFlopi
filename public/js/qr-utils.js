// Generación de QR en el navegador, sin paso de build: se carga la
// librería "qrcode" vía jsDelivr con su build ESM on-the-fly (+esm),
// igual filosofía que el SDK de Firebase (import() dinámico, para poder
// mostrar un error en vez de colgar la página si el CDN no responde).
let qrModulePromise;
function loadQrLib() {
  if (!qrModulePromise) {
    qrModulePromise = import("https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm");
  }
  return qrModulePromise;
}

// Dibuja el QR del texto dado dentro del <canvas> pasado.
export async function renderQrToCanvas(canvasEl, text, options = {}) {
  const QRCode = (await loadQrLib()).default;
  return QRCode.toCanvas(canvasEl, text, {
    width: options.width || 280,
    margin: options.margin ?? 1,
    color: { dark: options.dark || "#2b2026", light: options.light || "#ffffff" },
  });
}

// --- Lectura de QR (pantalla de puerta) ---------------------------------
//
// Preferimos la BarcodeDetector nativa del navegador (rápida, sin
// descargar nada) cuando existe; si no está disponible (ej. Safari/iOS
// viejo), caemos a jsQR por CDN, que decodifica a mano sobre los
// píxeles de un canvas. Misma filosofía de import() dinámico.
let jsQrModulePromise;
function loadJsQr() {
  if (!jsQrModulePromise) {
    jsQrModulePromise = import("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm");
  }
  return jsQrModulePromise;
}

export function hasNativeBarcodeDetector() {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

export async function createNativeDetector() {
  const formats = await window.BarcodeDetector.getSupportedFormats();
  return new window.BarcodeDetector({ formats: formats.includes("qr_code") ? ["qr_code"] : formats });
}

// Decodifica un QR a partir de un ImageData (canvas 2D). Devuelve el
// texto encontrado, o null si no hay ningún código en el frame.
export async function decodeQrFromImageData(imageData) {
  const jsQR = (await loadJsQr()).default;
  const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
  return result ? result.data : null;
}
