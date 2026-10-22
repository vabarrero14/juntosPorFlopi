import { requireEventStaff } from "../../js/event-staff-guard.js";
import { renderEntradasNav } from "../../js/entradas-nav.js";

async function init() {
  const ctx = await requireEventStaff();
  renderEntradasNav({ ...ctx, activePage: "inicio" });
}

init();
