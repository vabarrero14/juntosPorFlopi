// Redimensiona y comprime una foto en el navegador (canvas) antes de
// guardarla como base64 en Firestore. Evita depender de Firebase
// Storage: un documento de Firestore admite hasta 1 MiB, así que con un
// máximo de ~900px de lado y compresión JPEG alcanza de sobra para una
// foto de producto y deja margen para el resto de los campos.
export function compressImageToDataUrl(file, { maxSize = 900, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("Elegí un archivo de imagen."));
      return;
    }
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      img.onerror = () => reject(new Error("No se pudo procesar la imagen."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length > 900 * 1024) {
          reject(new Error("La imagen sigue siendo muy pesada incluso comprimida. Probá con otra foto."));
          return;
        }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
