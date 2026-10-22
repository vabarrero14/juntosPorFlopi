import { requireEventStaff } from "../../js/event-staff-guard.js";
import { renderEntradasNav } from "../../js/entradas-nav.js";
import { getTicketEvent } from "../../../js/ticket-events-service.js";
import { checkInTicket, authorizeReentry, watchTicketsForEvent } from "../../../js/tickets-service.js";
import {
  hasNativeBarcodeDetector,
  createNativeDetector,
  decodeQrFromImageData,
} from "../../../js/qr-utils.js";
import { FLOPI_FEST_ID } from "../../../js/ticket-event-constants.js";

const video = document.getElementById("scanner-video");
const canvas = document.getElementById("scanner-canvas");
const cameraError = document.getElementById("camera-error");
const toggleBtn = document.getElementById("toggle-camera-btn");
const resultCard = document.getElementById("result-card");
const resultBox = document.getElementById("result-box");
const resultActions = document.getElementById("result-actions");
const counterEl = document.getElementById("counter");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let ctx = null;
let scanning = true;
let processing = false;
let scanLoopHandle = null;
let nativeDetector = null;
let allTickets = [];
let resumeTimer = null;

function pad(n) {
  return String(n).padStart(2, "0");
}

function updateCounter() {
  const valid = allTickets.filter((t) => t.status !== "voided");
  const inside = valid.filter((t) => t.status === "checked_in").length;
  counterEl.textContent = `${inside} / ${valid.length} adentro`;
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    await video.play();
    cameraError.hidden = true;
  } catch (error) {
    console.error("Error accediendo a la cámara:", error);
    cameraError.textContent = "No pudimos acceder a la cámara. Podés usar la búsqueda manual de abajo.";
    cameraError.hidden = false;
    return;
  }

  if (hasNativeBarcodeDetector()) {
    try {
      nativeDetector = await createNativeDetector();
    } catch (error) {
      console.warn("BarcodeDetector no disponible, uso jsQR:", error);
      nativeDetector = null;
    }
  }

  scanLoop();
}

async function scanLoop() {
  if (scanLoopHandle) clearInterval(scanLoopHandle);
  scanLoopHandle = setInterval(async () => {
    if (!scanning || processing || video.readyState < 2) return;
    try {
      const code = await detectOnce();
      if (code) await onCodeDetected(code);
    } catch (error) {
      // un frame fallido no es grave, seguimos intentando
      console.warn("Error leyendo un frame:", error);
    }
  }, 300);
}

async function detectOnce() {
  if (nativeDetector) {
    const results = await nativeDetector.detect(video);
    return results.length > 0 ? results[0].rawValue : null;
  }
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  canvas.width = w;
  canvas.height = h;
  const c2d = canvas.getContext("2d");
  c2d.drawImage(video, 0, 0, w, h);
  const imageData = c2d.getImageData(0, 0, w, h);
  return decodeQrFromImageData(imageData);
}

function showResult(type, html, actionsHtml) {
  resultCard.hidden = false;
  resultBox.innerHTML = `<div class="scan-result ${type}">${html}</div>`;
  resultActions.innerHTML = actionsHtml || "";
  resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => resumeScanning(), 4000);
}

function resumeScanning() {
  if (resumeTimer) clearTimeout(resumeTimer);
  processing = false;
  resultCard.hidden = true;
}

function addContinueButton() {
  const btn = document.createElement("button");
  btn.className = "btn btn-outline";
  btn.textContent = "Seguir escaneando";
  btn.addEventListener("click", resumeScanning);
  resultActions.appendChild(btn);
}

async function onCodeDetected(code) {
  processing = true;
  try {
    const r = await checkInTicket(code, { byUid: ctx.user.uid, byEmail: ctx.user.email });

    if (r.result === "not_found") {
      showResult("notfound", `<h2>NO ENCONTRADA</h2><p>Este código no corresponde a ninguna entrada.</p>`);
      addContinueButton();
      return;
    }
    if (r.result === "voided") {
      showResult("voided", `<h2>ANULADA</h2><p>${esc(r.ticket.holderName)}</p>`);
      addContinueButton();
      return;
    }
    if (r.result === "already") {
      const when = r.ticket.checkedInAt?.toDate
        ? r.ticket.checkedInAt.toDate()
        : r.ticket.checkedInAt instanceof Date
        ? r.ticket.checkedInAt
        : null;
      const timeStr = when ? `${pad(when.getHours())}:${pad(when.getMinutes())}` : "";
      showResult(
        "already",
        `<h2>YA INGRESÓ</h2><p>${esc(r.ticket.holderName)}${timeStr ? " · a las " + timeStr : ""}</p>`
      );
      const reentryBtn = document.createElement("button");
      reentryBtn.className = "btn btn-primary";
      reentryBtn.textContent = "Autorizar reingreso";
      reentryBtn.addEventListener("click", async () => {
        reentryBtn.disabled = true;
        try {
          await authorizeReentry(code);
          showResult("ok", `<h2>REINGRESO OK</h2><p>${esc(r.ticket.holderName)}</p>`);
          addContinueButton();
        } catch (error) {
          console.error("Error autorizando reingreso:", error);
          window.alert("No pudimos autorizar el reingreso.");
          reentryBtn.disabled = false;
        }
      });
      resultActions.appendChild(reentryBtn);
      addContinueButton();
      return;
    }

    // result === "ok"
    showResult("ok", `<h2>VÁLIDA</h2><p>${esc(r.ticket.holderName)}</p>`);
    addContinueButton();
  } catch (error) {
    console.error("Error procesando el escaneo:", error);
    showResult("notfound", `<h2>ERROR</h2><p>No pudimos procesar este código. Probá de nuevo.</p>`);
    addContinueButton();
  }
}

function renderSearchResults(items) {
  if (items.length === 0) {
    searchResults.innerHTML = `<p class="mute">Sin resultados.</p>`;
    return;
  }
  searchResults.innerHTML = "";
  items.slice(0, 20).forEach((t) => {
    const row = document.createElement("div");
    row.className = "entry-row";
    const statusLabel = t.status === "checked_in" ? "Ya ingresó" : t.status === "voided" ? "Anulada" : "Válida";
    row.innerHTML = `
      <div>
        <strong>${esc(t.holderName)}</strong>
        <span class="badge ${t.status}">${statusLabel}</span>
        <div class="form-help">${esc(t.holderPhone || "")} · ${t.shortCode}</div>
      </div>
    `;
    if (t.status === "issued") {
      const btn = document.createElement("button");
      btn.className = "btn btn-primary";
      btn.textContent = "Registrar ingreso";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await onCodeDetected(t.id);
        btn.disabled = false;
      });
      row.appendChild(btn);
    }
    searchResults.appendChild(row);
  });
}

function onSearchInput() {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) {
    searchResults.innerHTML = "";
    return;
  }
  const matches = allTickets.filter(
    (t) =>
      (t.holderName || "").toLowerCase().includes(term) ||
      (t.holderPhone || "").includes(term) ||
      (t.shortCode || "").toLowerCase().includes(term)
  );
  renderSearchResults(matches);
}

async function init() {
  ctx = await requireEventStaff();
  renderEntradasNav({ ...ctx, activePage: "puerta" });

  const event = await getTicketEvent(FLOPI_FEST_ID);
  if (!event) {
    document.getElementById("scanner-card").hidden = true;
    cameraError.textContent = "Todavía no se configuró el evento.";
    cameraError.hidden = false;
  }

  watchTicketsForEvent(
    FLOPI_FEST_ID,
    (tickets) => {
      allTickets = tickets;
      updateCounter();
      if (searchInput.value.trim()) onSearchInput();
    },
    (error) => console.error("Error cargando entradas:", error)
  );

  searchInput.addEventListener("input", onSearchInput);

  toggleBtn.addEventListener("click", () => {
    scanning = !scanning;
    toggleBtn.textContent = scanning ? "Pausar cámara" : "Reanudar cámara";
  });

  await startCamera();
}

init();
