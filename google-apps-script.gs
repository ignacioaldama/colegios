// ============================================================================
// Backend de votaciones para el mapa de colegios (Google Apps Script + Sheet).
// COMO PUBLICARLO:
//   1. Crea una hoja de calculo en https://sheets.google.com
//   2. Menu  Extensiones > Apps Script
//   3. Borra el contenido y pega TODO este archivo. Guarda.
//   4. Pulsa  Implementar > Nueva implementacion > Tipo: Aplicacion web.
//        - Ejecutar como: Yo
//        - Quien tiene acceso: Cualquier persona
//   5. Copia la URL que termina en /exec y pegala en la web
//        (constante VOTES_ENDPOINT del archivo mapa-colegios-google-sites.html).
// ============================================================================

const SHEET_NAME = "Votos";

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["codigo", "categoria", "sum", "count"]);
  }
  return sheet;
}

function readAll(sheet) {
  const values = sheet.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < values.length; i++) {
    const codigo = String(values[i][0]);
    const categoria = String(values[i][1]);
    if (!codigo) continue;
    out[codigo] = out[codigo] || {};
    out[codigo][categoria] = {
      sum: Number(values[i][2]) || 0,
      count: Number(values[i][3]) || 0
    };
  }
  return out;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const data = readAll(getSheet());
  const json = JSON.stringify(data);
  // JSONP: si llega ?callback=xxx se devuelve JavaScript para evitar CORS al leer.
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse(e.postData.contents);
    const codigo = String(payload.codigo || "").trim();
    const categoria = String(payload.categoria || "").trim();
    const valor = parseInt(payload.valor, 10);
    let anterior = parseInt(payload.anterior, 10);
    if (isNaN(anterior)) anterior = 0;

    if (!codigo || !categoria || valor < 1 || valor > 5) {
      return jsonOutput({ ok: false, error: "Datos invalidos" });
    }

    const sheet = getSheet();
    const values = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === codigo && String(values[i][1]) === categoria) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      sheet.appendRow([codigo, categoria, valor, 1]);
    } else {
      let sum = Number(values[rowIndex - 1][2]) || 0;
      let count = Number(values[rowIndex - 1][3]) || 0;
      if (anterior >= 1 && anterior <= 5 && count > 0) {
        sum += valor - anterior;
      } else {
        sum += valor;
        count += 1;
      }
      sheet.getRange(rowIndex, 3).setValue(Math.max(sum, 0));
      sheet.getRange(rowIndex, 4).setValue(count);
    }

    return jsonOutput({ ok: true });
  } finally {
    lock.releaseLock();
  }
}
