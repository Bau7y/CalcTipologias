// ════════════════════════════════════════════════════════════════
// CARGA DE DATOS — Las bases de datos del ONT (tipologías, zonas
// homogéneas, características de vivienda, etc.) viven como archivos
// JSON independientes en assets/data/, no como constantes en este
// archivo. Esto separa los datos (lo que cambia cuando el ONT publica
// una actualización) de la lógica (lo que no debería cambiar nunca).
// init() llama a cargarDatos() antes de poblar cualquier selector.
// ════════════════════════════════════════════════════════════════

let TIPOLOGIAS = {};
let ESTADOS_CONSERVACION = [];
let CARACTERISTICAS_VIVIENDA = {};
let PISCINAS_ONT = [];
let OPCIONES_PAREDES = [];
let OPCIONES_CUBIERTA = [];
let OPCIONES_CIELO = [];
let OPCIONES_PISOS = [];
let ZONAS_HOMOGENEAS = {};

async function cargarDatos(){
  const base = 'assets/data/';
  const [tipologias, estados, caracteristicas, piscinas, opciones, zonas] = await Promise.all([
    fetch(base + 'tipologias.json').then(r => r.json()),
    fetch(base + 'estados_conservacion.json').then(r => r.json()),
    fetch(base + 'caracteristicas_vivienda.json').then(r => r.json()),
    fetch(base + 'piscinas_ont.json').then(r => r.json()),
    fetch(base + 'opciones_constructivas.json').then(r => r.json()),
    fetch(base + 'zonas_homogeneas.json').then(r => r.json()),
  ]);
  TIPOLOGIAS = tipologias;
  ESTADOS_CONSERVACION = estados;
  CARACTERISTICAS_VIVIENDA = caracteristicas;
  PISCINAS_ONT = piscinas;
  OPCIONES_PAREDES = opciones.paredes;
  OPCIONES_CUBIERTA = opciones.cubierta;
  OPCIONES_CIELO = opciones.cielo;
  OPCIONES_PISOS = opciones.pisos;
  ZONAS_HOMOGENEAS = zonas;
}

let contadorFilas = 0;

// ════════════════════════════════════════════════════════════════
// MOTOR DE COINCIDENCIA — Asistente de Tipificación
// ════════════════════════════════════════════════════════════════
function poblarFamiliasAsistente(){
  const select = document.getElementById('asis-familia');
  Object.keys(CARACTERISTICAS_VIVIENDA).forEach(fam=>{
    const opt = document.createElement('option');
    opt.value = fam;
    opt.textContent = fam;
    select.appendChild(opt);
  });
}

function generarPreguntasAsistente(){
  const familia = document.getElementById('asis-familia').value;
  const cont = document.getElementById('asis-preguntas');
  document.getElementById('asis-resultado').classList.remove('visible');

  if(!familia){ cont.innerHTML=''; return; }

  const construirSelect = (id, etiqueta, opciones, ayuda) => `
    <div class="campo">
      <label>${etiqueta}</label>
      <select id="${id}">
        <option value="">— Seleccione lo que describe el propietario —</option>
        ${opciones.map(o=>`<option value="${o.valor}">${o.texto}</option>`).join('')}
      </select>
      ${ayuda ? `<span class="ayuda">${ayuda}</span>` : ''}
    </div>`;

  cont.innerHTML = `
    <div class="grid-form">
      ${construirSelect('asis-paredes', '¿Cómo describe las paredes?', OPCIONES_PAREDES)}
      ${construirSelect('asis-cubierta', '¿Cómo describe el techo / cubierta?', OPCIONES_CUBIERTA)}
      ${construirSelect('asis-cielo', '¿Cómo describe el cielo (cielorraso)?', OPCIONES_CIELO)}
      ${construirSelect('asis-pisos', '¿Cómo describe los pisos?', OPCIONES_PISOS)}
      <div class="campo">
        <label>¿Cuántos baños tiene?</label>
        <input type="number" id="asis-banos" placeholder="Ej: 2" min="0" step="0.5">
      </div>
      <div class="campo">
        <label>Área aproximada (m²)</label>
        <input type="number" id="asis-area" placeholder="Ej: 145" min="0" step="0.01">
      </div>
      <div class="campo">
        <label>Antigüedad aproximada (años)</label>
        <input type="number" id="asis-antiguedad" placeholder="Ej: 12" min="0" step="1">
        <span class="ayuda">Lo que indique el propietario; se usará luego en la Calculadora de Depreciación</span>
      </div>
    </div>
    <button class="btn-principal" onclick="sugerirTipologia('${familia}')">Sugerir tipología</button>
  `;
}

function sugerirTipologia(familia){
  const paredes = document.getElementById('asis-paredes').value;
  const cubierta = document.getElementById('asis-cubierta').value;
  const cielo = document.getElementById('asis-cielo').value;
  const pisos = document.getElementById('asis-pisos').value;
  const banos = parseFloat(document.getElementById('asis-banos').value) || null;
  const area = parseFloat(document.getElementById('asis-area').value) || null;

  const candidatos = CARACTERISTICAS_VIVIENDA[familia];
  if(!candidatos){ return; }

  // Sistema de puntuación por coincidencia mayoritaria
  const resultados = candidatos.map(c=>{
    let puntos = 0, totalCriterios = 0;

    if(paredes){ totalCriterios++; if(c.paredes===paredes) puntos++; }
    if(cubierta){ totalCriterios++; if(c.cubierta===cubierta) puntos++; }
    if(cielo){ totalCriterios++; if(c.cielo===cielo) puntos++; }
    if(pisos){ totalCriterios++; if(c.pisos===pisos) puntos++; }
    if(banos!==null){
      totalCriterios++;
      const difBanos = Math.abs(c.banos - banos);
      if(difBanos <= 0.5) puntos += 1;
      else if(difBanos <= 1) puntos += 0.5;
    }
    if(area!==null){
      totalCriterios++;
      if(area >= c.areaMin && area <= c.areaMax) puntos += 1;
      else {
        // coincidencia parcial si está cerca del rango
        const distancia = area < c.areaMin ? c.areaMin - area : area - c.areaMax;
        if(distancia <= 20) puntos += 0.4;
      }
    }

    const porcentaje = totalCriterios>0 ? (puntos/totalCriterios)*100 : 0;
    return {...c, puntos, totalCriterios, porcentaje};
  });

  resultados.sort((a,b)=>b.porcentaje - a.porcentaje);
  const ganador = resultados[0];
  const segundo = resultados[1];

  const resultDiv = document.getElementById('asis-resultado');
  const bodyDiv = document.getElementById('asis-resultado-body');
  resultDiv.classList.add('visible');

  if(!ganador || ganador.porcentaje===0){
    bodyDiv.innerHTML = `<p>No se encontraron coincidencias suficientes. Verifique las características marcadas o revise manualmente el manual ONT 2023.</p>`;
    return;
  }

  let html = `
    <div class="resultado-grid">
      <div class="dato-card">
        <div class="etiqueta">Código sugerido</div>
        <div class="valor codigo">${ganador.codigo}</div>
      </div>
      <div class="dato-card">
        <div class="etiqueta">Coincidencia</div>
        <div class="valor">${ganador.porcentaje.toFixed(0)}%</div>
      </div>
      <div class="dato-card">
        <div class="etiqueta">Vida útil probable</div>
        <div class="valor">${ganador.vidaUtil} años</div>
      </div>
      <div class="dato-card">
        <div class="etiqueta">Rango de área oficial</div>
        <div class="valor" style="font-size:14px;">${ganador.areaMin}–${ganador.areaMax===9999?'+':ganador.areaMax} m²</div>
      </div>
    </div>
    <div class="nota-tecnica" style="border-left-color:var(--verde-med);">
      <strong>Etiqueta de tipificación oficial ONT — ${ganador.codigo}:</strong><br>${ganador.etiqueta}
    </div>`;

  if(segundo && segundo.porcentaje > 0 && segundo.porcentaje >= ganador.porcentaje - 25){
    html += `<div class="nota-tecnica">
      <strong>Segunda opción cercana (${segundo.porcentaje.toFixed(0)}% de coincidencia):</strong> ${segundo.codigo} — ${segundo.etiqueta}
      <br><em>Si tiene dudas entre ambas, compare directamente contra el manual impreso antes de decidir.</em>
    </div>`;
  }

  html += `<div class="nota-tecnica">Use el código <strong>${ganador.codigo}</strong> en la pestaña "Clasificador por Código" o directamente en "Calculadora de Depreciación" para completar la valoración.</div>`;

  bodyDiv.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// PANEL 0 — VALORACIÓN DE TERRENO POR ZONAS HOMOGÉNEAS
// Motor de cálculo reconstruido y verificado exactamente contra
// PLANTILLA_ACTUALIZADA.xls (hoja CalculoValor, Oficina de
// Valoraciones, Municipalidad de San Carlos)
// ════════════════════════════════════════════════════════════════

const ORDEN_DISTRITOS = ["01","02","03","04","05","06","07","08","09","10","11","12","13"];
const EULER = 2.71828182845904; // constante usada literalmente en la plantilla Excel

// ── Leyendas de códigos (extraídas de las fórmulas reales de IngresoDatos) ──

const LEYENDA_UBICACION = {
  1: "Manzanero", 2: "Cabecero", 3: "Esquinero", 4: "Medianero (2 frentes)",
  5: "Medianero", 6: "Callejón lateral", 7: "Callejón en fondo", 8: "Servidumbre"
};

const LEYENDA_TIPO_VIA = {
  1: "Comercial", 2: "Comercial-Industrial y Residencial", 3: "Residencial-Industrial",
  4: "Residencial", 5: "Lastre", 6: "Grueso o Tierra", 7: "Tierra",
  8: "Trochas", 9: "Servidumbre angosta", 10: "Fluvial", 11: "Férrea"
};

const LEYENDA_SUELO = {
  1: "Excelente", 2: "Muy bueno - óptimo", 3: "Muy bueno - regular", 4: "Bueno",
  5: "Regular - óptimo", 6: "Regular - regular", 7: "Regular - malo", 8: "Malo"
};

const LEYENDA_HIDROLOGIA = {
  1: "Excelente", 2: "Bueno", 3: "Normal", 4: "Regular", 5: "Malo"
};

function leyendaServicios1Texto(cod){
  const acera = (cod===3 || cod===4) ? "sí" : "no";
  const cordonCano = (cod===2 || cod===4) ? "sí" : "no";
  return `${cod} — Acera: ${acera}, Cordón y caño: ${cordonCano}`;
}

function leyendaServicios2Texto(cod){
  const caneria = (cod===5||cod===8||cod===10||cod===11||cod===13||cod===14||cod===15||cod===16) ? "sí" : "no";
  const electricidad = (cod===4||cod===7||cod===9||cod===11||cod===12||cod===14||cod===15||cod===16) ? "sí" : "no";
  const telefono = (cod===10||cod===13||cod===16||(cod%3===0)) ? "sí" : "no";
  const alumbrado = (cod===2||cod===6||cod===7||cod===8||cod===12||cod===13||cod===14||cod===16) ? "sí" : "no";
  return `${cod} — Cañería: ${caneria}, Electric.: ${electricidad}, Teléfono: ${telefono}, Alumbrado: ${alumbrado}`;
}

const ROMANOS_A_NUM = {"I":1,"II":2,"III":3,"IV":4,"V":5,"VI":6,"VII":7,"VIII":8};
function romanoANumero(r){ return r ? (ROMANOS_A_NUM[r] ?? null) : null; }

function round2(n){ return Math.round(n*100)/100; }
function round3(n){ return Math.round(n*1000)/1000; }

// ════════════════════════════════════════════════════════════════
// MOTOR DE CÁLCULO PRINCIPAL — replica exactamente CalculoValor!G23:G25
// ════════════════════════════════════════════════════════════════
function calcularValorTerrenoCompleto(lote, zona){
  const esUrbano = lote.areaLote < 5000;

  // 1. Factor ÁREA (E16) — siempre aplica
  const E7 = lote.areaLote, E8 = zona.areaZona;
  const expE7 = E7 < 30000 ? 0.33 : (E7 > 100000 ? (0.275 - 0.00000025*E7) : (0.364 - 0.00000113*E7));
  const expE8 = E8 < 30000 ? 0.33 : (E8 > 100000 ? (0.275 - 0.00000025*E8) : (0.364 - 0.00000113*E8));
  let factorArea;
  if(esUrbano){
    factorArea = round2(Math.pow(E8, expE7) / Math.pow(E7, expE8));
  } else {
    const ratio = E8/E7;
    const expRatio = ratio <= 1 ? 0.15 : (ratio > 12 ? 0.25 : (0.141 + 0.009*ratio));
    factorArea = round2(Math.pow(ratio, expRatio));
  }

  // 2. Factor FRENTE (I16) — siempre aplica
  const I7 = lote.frenteLote, I8 = zona.frenteZona;
  let factorFrente;
  if(esUrbano){
    const base = I8 >= I7 ? I8 : I7;
    let exp;
    if(base <= 30) exp = 0.25;
    else if(base <= 200) exp = 0.2585 - base*0.0003;
    else if(base <= 480) exp = 0.215 - base*0.000009;
    else exp = 0.17;
    factorFrente = round2(Math.pow(I7/I8, exp));
  } else {
    factorFrente = round2(Math.pow(EULER, (I7-I8)*0.000125));
  }

  // 3. Factor PENDIENTE (A18) — siempre aplica
  const factorPendiente = round2(Math.pow(EULER, (zona.pendienteZona - lote.pendienteLote)/78));

  // 4. Factor NIVEL (E18) — solo rama urbana
  let factorNivel = null;
  if(esUrbano){
    const E9 = lote.nivelLote, E10 = zona.nivelZona ?? 0;
    const t1 = (E9<0 ? -0.05 : -0.03) * Math.abs(E9);
    const t2 = (E10<0 ? -0.05 : -0.03) * Math.abs(E10);
    factorNivel = round2(Math.pow(EULER, t1-t2));
  }

  // 5. Factor UBICACIÓN (I18) — solo rama urbana
  let factorUbicacion = null;
  if(esUrbano){
    const I9 = lote.ubicacionLote;
    const coef = -0.111; // la columna "Res-Com" de la matriz nunca contiene "r" literal -> siempre -0.111
    if(I9 < 5 && E7 > E8){
      factorUbicacion = round2((((Math.pow(EULER, coef*(I9-5)))-1)*(E8/E7))+1);
    } else {
      factorUbicacion = round2(Math.pow(EULER, coef*(I9-5)));
    }
  }

  // 6. Factor REGULARIDAD (A20) — siempre aplica
  const A11 = lote.regularidadLote, A12 = zona.regularidadZona;
  const expA11 = E7<500?0.5:(E7<1500?0.33:(E7<50000?0.25:(E7<200000?0.15:0.1)));
  const expA12 = E8<500?0.5:(E8<1500?0.33:(E8<50000?0.25:(E8<200000?0.15:0.1)));
  const factorRegularidad = round2(Math.pow(A11, expA11) / Math.pow(A12, expA12));

  // 7. Factor TIPO DE VÍA (E20) — siempre aplica
  const factorVia = round2(Math.pow(EULER, (zona.viaZona - lote.tipoViaLote)*0.0646));

  // 8. Factor SERVICIOS(1) (I20) — solo rama urbana
  let factorServicios1 = null;
  if(esUrbano){
    factorServicios1 = round2(Math.pow(EULER, (lote.servicios1Lote - zona.servicios1Zona)*0.03));
  }

  // 9. Factor SERVICIOS(2) (A22) — siempre aplica, redondeo a 3 decimales
  const factorServicios2 = round3(Math.pow(EULER, (lote.servicios2Lote - zona.servicios2Zona)*0.03));

  // 10. Factor USO DE SUELO (E22) — solo rama rural
  let factorUsoSuelo = null;
  if(!esUrbano){
    factorUsoSuelo = round2(Math.pow(EULER, (lote.sueloLote - zona.usoSueloZona)*-0.112));
  }

  // 11. Factor HIDROLOGÍA (I22) — solo rama rural
  let factorHidrologia = null;
  if(!esUrbano){
    factorHidrologia = round2(Math.pow(EULER, (lote.hidrologiaLote - zona.hidrologiaZona)*-0.175));
  }

  // Factor compuesto total (G23)
  let factorCompuesto;
  if(esUrbano){
    factorCompuesto = round2(factorArea*factorFrente*factorPendiente*factorNivel*factorUbicacion*factorRegularidad*factorVia*factorServicios1*factorServicios2);
  } else {
    factorCompuesto = round2(factorArea*factorFrente*factorPendiente*factorRegularidad*factorVia*factorServicios2*factorUsoSuelo*factorHidrologia);
  }

  const valorUnitarioAjustado = zona.valorZona * factorCompuesto; // G24
  const valorTotalTerreno = lote.areaLote * zona.valorZona * factorCompuesto; // G25

  return {
    esUrbano,
    factores: { factorArea, factorFrente, factorPendiente, factorNivel, factorUbicacion,
      factorRegularidad, factorVia, factorServicios1, factorServicios2,
      factorUsoSuelo, factorHidrologia },
    factorCompuesto, valorUnitarioAjustado, valorTotalTerreno
  };
}

// ════════════════════════════════════════════════════════════════
// UI — selectores y eventos
// ════════════════════════════════════════════════════════════════

function poblarDistritosTerreno(){
  const sel = document.getElementById('terr-distrito');
  ORDEN_DISTRITOS.forEach(cod=>{
    const d = ZONAS_HOMOGENEAS[cod];
    const opt = document.createElement('option');
    opt.value = cod;
    opt.textContent = `Distrito ${cod} — ${d.nombre}`;
    sel.appendChild(opt);
  });
  poblarSelectoresLote();
}

function poblarSelectoresLote(){
  const llenar = (id, leyenda) => {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    Object.keys(leyenda).forEach(k=>{
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = `${k} — ${leyenda[k]}`;
      sel.appendChild(opt);
    });
  };
  llenar('terr-via-lote', LEYENDA_TIPO_VIA);
  llenar('terr-ubicacion-lote', LEYENDA_UBICACION);
  llenar('terr-suelo-lote', LEYENDA_SUELO);
  llenar('terr-hidrologia-lote', LEYENDA_HIDROLOGIA);

  const selS1 = document.getElementById('terr-servicios1-lote');
  selS1.innerHTML = '';
  for(let i=1;i<=4;i++){
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = leyendaServicios1Texto(i);
    selS1.appendChild(opt);
  }

  const selS2 = document.getElementById('terr-servicios2-lote');
  selS2.innerHTML = '';
  for(let i=1;i<=16;i++){
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = leyendaServicios2Texto(i);
    selS2.appendChild(opt);
  }
}

function cargarZonasDistrito(){
  const codDistrito = document.getElementById('terr-distrito').value;
  const selZona = document.getElementById('terr-zona');
  selZona.innerHTML = '';
  document.getElementById('terr-datos-zona').innerHTML = '';
  document.getElementById('terr-form-lote').style.display = 'none';
  document.getElementById('terr-resultado').classList.remove('visible');

  if(!codDistrito){
    selZona.disabled = true;
    selZona.innerHTML = '<option value="">— Primero seleccione un distrito —</option>';
    return;
  }

  selZona.disabled = false;
  selZona.innerHTML = '<option value="">— Seleccione la zona —</option>';
  const distrito = ZONAS_HOMOGENEAS[codDistrito];
  distrito.zonas.forEach((z, idx)=>{
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${z.codigo} — ${z.nombre} (₡${z.valor.toLocaleString('es-CR')}/m²)`;
    selZona.appendChild(opt);
  });
}

function mostrarDatosZona(){
  const codDistrito = document.getElementById('terr-distrito').value;
  const idxZona = document.getElementById('terr-zona').value;
  const cont = document.getElementById('terr-datos-zona');
  const formLote = document.getElementById('terr-form-lote');

  if(idxZona === ''){
    cont.innerHTML = '';
    formLote.style.display = 'none';
    document.getElementById('terr-resultado').classList.remove('visible');
    return;
  }

  const z = ZONAS_HOMOGENEAS[codDistrito].zonas[idxZona];
  const esRural = z.codigo.includes('-R');

  const fmtVal = (v) => v === null || v === undefined ? '—' : v;

  cont.innerHTML = `
    <div class="caja-info">
      <div class="caja-info-titulo">${z.codigo} — ${z.nombre} ${esRural ? '<span class="badge-rural">RURAL</span>' : '<span class="badge-urbano">URBANO</span>'}</div>
      <div class="datos-zona-grid">
        <div><span class="dz-label">Valor base oficial</span><span class="dz-valor">₡${z.valor.toLocaleString('es-CR')} / m²</span></div>
        <div><span class="dz-label">Área de referencia</span><span class="dz-valor">${z.area.toLocaleString('es-CR')} m²</span></div>
        <div><span class="dz-label">Frente de referencia</span><span class="dz-valor">${z.frente} m</span></div>
        <div><span class="dz-label">Regularidad</span><span class="dz-valor">${fmtVal(z.regularidad)}</span></div>
        <div><span class="dz-label">Tipo de vía</span><span class="dz-valor">${fmtVal(z.tipoVia)} <span class="dz-nota">${LEYENDA_TIPO_VIA[z.tipoVia]||''}</span></span></div>
        <div><span class="dz-label">Pendiente de referencia</span><span class="dz-valor">${fmtVal(z.pendiente)}%</span></div>
        <div><span class="dz-label">Servicios 1</span><span class="dz-valor">${fmtVal(z.servicios1)} <span class="dz-nota">${z.servicios1?leyendaServicios1Texto(parseInt(z.servicios1)).split('—')[1]:''}</span></span></div>
        <div><span class="dz-label">Servicios 2</span><span class="dz-valor">${fmtVal(z.servicios2)} <span class="dz-nota">${z.servicios2?leyendaServicios2Texto(parseInt(z.servicios2)).split('—')[1]:''}</span></span></div>
        <div><span class="dz-label">Nivel</span><span class="dz-valor">${fmtVal(z.nivel)}</span></div>
        <div><span class="dz-label">Ubicación</span><span class="dz-valor">${fmtVal(z.ubicacion)} <span class="dz-nota">${LEYENDA_UBICACION[z.ubicacion]||''}</span></span></div>
        ${z.tipoResidencial ? `<div><span class="dz-label">Tipología residencial asociada</span><span class="dz-valor">${z.tipoResidencial}</span></div>` : ''}
        ${z.tipoComercio ? `<div><span class="dz-label">Tipología de comercio asociada</span><span class="dz-valor">${z.tipoComercio}</span></div>` : ''}
        ${z.hidrologia !== null && z.hidrologia !== undefined ? `<div><span class="dz-label">Hidrología</span><span class="dz-valor">${z.hidrologia} <span class="dz-nota">${LEYENDA_HIDROLOGIA[z.hidrologia]||''}</span></span></div>` : ''}
        ${z.capUsoTierra ? `<div><span class="dz-label">Cap. de uso de la tierra</span><span class="dz-valor">${z.capUsoTierra}</span></div>` : ''}
      </div>
    </div>
  `;

  formLote.style.display = 'block';
  actualizarVisibilidadCamposLote();
  calcularValorTerreno();
}

function actualizarVisibilidadCamposLote(){
  const areaInput = document.getElementById('terr-area-lote').value;
  const area = areaInput ? parseFloat(areaInput) : null;
  const esUrbano = area !== null && area < 5000;
  const camposUrbanos = document.getElementById('terr-campos-urbanos');
  const camposRurales = document.getElementById('terr-campos-rurales');

  if(area === null){
    camposUrbanos.style.opacity = '0.5';
    camposRurales.style.opacity = '0.5';
    return;
  }
  camposUrbanos.style.opacity = esUrbano ? '1' : '0.35';
  camposRurales.style.opacity = esUrbano ? '0.35' : '1';
}

function calcularValorTerreno(){
  actualizarVisibilidadCamposLote();

  const codDistrito = document.getElementById('terr-distrito').value;
  const idxZona = document.getElementById('terr-zona').value;
  const cuerpo = document.getElementById('terr-resultado-body');

  if(!codDistrito || idxZona === ''){
    cuerpo.innerHTML = '<p class="texto-tenue">Seleccione una zona homogénea para calcular el valor del terreno.</p>';
    return;
  }

  const z = ZONAS_HOMOGENEAS[codDistrito].zonas[idxZona];

  const areaInput = document.getElementById('terr-area-lote').value;
  const area = areaInput ? parseFloat(areaInput) : null;

  if(!area || area <= 0){
    cuerpo.innerHTML = '<p class="texto-tenue">Ingrese el área del lote para calcular el valor del terreno.</p>';
    return;
  }

  const frenteInput = document.getElementById('terr-frente-lote').value;
  const frente = frenteInput ? parseFloat(frenteInput) : null;
  const pendienteInput = document.getElementById('terr-pendiente-lote').value;
  const pendiente = pendienteInput !== '' ? parseFloat(pendienteInput) : 0;

  if(!frente || frente <= 0){
    cuerpo.innerHTML = '<p class="texto-tenue">Ingrese el frente del lote para calcular el valor del terreno.</p>';
    return;
  }

  const esUrbano = area < 5000;

  const lote = {
    areaLote: area,
    frenteLote: frente,
    pendienteLote: pendiente,
    regularidadLote: parseFloat(document.getElementById('terr-regularidad-lote').value),
    tipoViaLote: parseInt(document.getElementById('terr-via-lote').value),
    servicios2Lote: parseInt(document.getElementById('terr-servicios2-lote').value),
    nivelLote: esUrbano ? parseFloat(document.getElementById('terr-nivel-lote').value || '0') : null,
    ubicacionLote: esUrbano ? parseInt(document.getElementById('terr-ubicacion-lote').value) : null,
    servicios1Lote: esUrbano ? parseInt(document.getElementById('terr-servicios1-lote').value) : null,
    sueloLote: !esUrbano ? parseInt(document.getElementById('terr-suelo-lote').value) : null,
    hidrologiaLote: !esUrbano ? parseInt(document.getElementById('terr-hidrologia-lote').value) : null,
  };

  const zona = {
    valorZona: z.valor,
    areaZona: z.area,
    frenteZona: z.frente,
    regularidadZona: z.regularidad ?? 1,
    viaZona: z.tipoVia,
    pendienteZona: z.pendiente ?? 0,
    servicios1Zona: z.servicios1 !== null ? parseInt(z.servicios1) : null,
    servicios2Zona: z.servicios2 !== null ? parseInt(z.servicios2) : null,
    nivelZona: z.nivel ?? 0,
    hidrologiaZona: z.hidrologia,
    usoSueloZona: romanoANumero(z.capUsoTierra),
  };

  // Verificar que la zona tenga todos los datos necesarios para la rama correspondiente
  const camposFaltantes = [];
  if(zona.regularidadZona===null||zona.regularidadZona===undefined) camposFaltantes.push('Regularidad');
  if(zona.viaZona===null||zona.viaZona===undefined) camposFaltantes.push('Tipo de vía');
  if(zona.pendienteZona===null||zona.pendienteZona===undefined) camposFaltantes.push('Pendiente');
  if(zona.servicios2Zona===null||zona.servicios2Zona===undefined) camposFaltantes.push('Servicios(2)');
  if(esUrbano && (zona.servicios1Zona===null||zona.servicios1Zona===undefined)) camposFaltantes.push('Servicios(1)');
  if(!esUrbano && (zona.hidrologiaZona===null||zona.hidrologiaZona===undefined)) camposFaltantes.push('Hidrología');
  if(!esUrbano && (zona.usoSueloZona===null||zona.usoSueloZona===undefined)) camposFaltantes.push('Capacidad de uso de la tierra');

  if(camposFaltantes.length > 0){
    cuerpo.innerHTML = `<div class="aviso-pendiente">⚠ La matriz oficial no tiene definido(s) para esta zona: ${camposFaltantes.join(', ')}. No es posible calcular el valor del terreno automáticamente — verifique estos datos manualmente con el departamento.</div>`;
    return;
  }

  const r = calcularValorTerrenoCompleto(lote, zona);
  const f = r.factores;

  const filaFactor = (nombre, valor) => valor === null ? '' :
    `<div class="linea-calculo"><span>${nombre}</span><span>${valor}</span></div>`;

  cuerpo.innerHTML = `
    <div class="valor-final-box">
      <div class="vf-etiqueta">Valor total del terreno</div>
      <div class="vf-monto">₡${r.valorTotalTerreno.toLocaleString('es-CR', {maximumFractionDigits:0})}</div>
      <div class="vf-detalle">₡${r.valorUnitarioAjustado.toLocaleString('es-CR', {maximumFractionDigits:2})} / m² × ${area.toLocaleString('es-CR')} m²</div>
    </div>

    <button type="button" class="detalle-toggle" onclick="toggleDetalleFactores()">
      <span id="terr-detalle-flecha">▸</span> Ver desglose de factores de ajuste
    </button>
    <div id="terr-detalle-factores" class="detalle-factores" style="display:none;">
      <div class="linea-calculo"><span>Valor base de la zona</span><span>₡${z.valor.toLocaleString('es-CR')} / m²</span></div>
      ${filaFactor('Factor área', f.factorArea)}
      ${filaFactor('Factor frente', f.factorFrente)}
      ${filaFactor('Factor pendiente', f.factorPendiente)}
      ${filaFactor('Factor nivel', f.factorNivel)}
      ${filaFactor('Factor ubicación', f.factorUbicacion)}
      ${filaFactor('Factor regularidad', f.factorRegularidad)}
      ${filaFactor('Factor tipo de vía', f.factorVia)}
      ${filaFactor('Factor servicios (1)', f.factorServicios1)}
      ${filaFactor('Factor servicios (2)', f.factorServicios2)}
      ${filaFactor('Factor uso de suelo', f.factorUsoSuelo)}
      ${filaFactor('Factor hidrología', f.factorHidrologia)}
      <div class="linea-calculo total"><span>Factor compuesto total</span><span>${r.factorCompuesto}</span></div>
      <div class="linea-calculo total"><span>Valor unitario ajustado</span><span>₡${r.valorUnitarioAjustado.toLocaleString('es-CR', {maximumFractionDigits:2})} / m²</span></div>
      <div class="linea-calculo"><span>× Área del lote</span><span>${area.toLocaleString('es-CR')} m²</span></div>
      <div class="linea-calculo total grande"><span>VALOR TOTAL DEL TERRENO</span><span>₡${r.valorTotalTerreno.toLocaleString('es-CR', {maximumFractionDigits:0})}</span></div>
    </div>
  `;

  document.getElementById('terr-resultado').classList.add('visible');
}

function toggleDetalleFactores(){
  const det = document.getElementById('terr-detalle-factores');
  const flecha = document.getElementById('terr-detalle-flecha');
  const visible = det.style.display !== 'none';
  det.style.display = visible ? 'none' : 'block';
  flecha.textContent = visible ? '▸' : '▾';
}


async function init(){
  await cargarDatos();
  poblarDistritosTerreno();
  const selectTipo = document.getElementById('tipo-construccion');
  Object.keys(TIPOLOGIAS).forEach(tipo=>{
    const opt = document.createElement('option');
    opt.value = tipo;
    opt.textContent = tipo;
    selectTipo.appendChild(opt);
  });
  poblarFamiliasAsistente();
  agregarFila(); // primera fila por defecto en la calculadora
}

function cambiarTab(nombre){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('activo'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('activo'));
  const botones = document.querySelectorAll('.tab-btn');
  if(nombre==='terreno'){
    botones[0].classList.add('activo');
    document.getElementById('panel-terreno').classList.add('activo');
  } else if(nombre==='asistente'){
    botones[1].classList.add('activo');
    document.getElementById('panel-asistente').classList.add('activo');
  } else if(nombre==='clasificador'){
    botones[2].classList.add('activo');
    document.getElementById('panel-clasificador').classList.add('activo');
  } else {
    botones[3].classList.add('activo');
    document.getElementById('panel-depreciacion').classList.add('activo');
  }
}

// ════════════════════════════════════════════════════════════════
// PANEL 1 — CLASIFICADOR
// ════════════════════════════════════════════════════════════════
function actualizarNiveles(){
  const tipo = document.getElementById('tipo-construccion').value;
  const selectNivel = document.getElementById('nivel-acabado');
  selectNivel.innerHTML = '';

  if(!tipo){
    selectNivel.innerHTML = '<option value="">— Primero seleccione el tipo —</option>';
    return;
  }

  const niveles = TIPOLOGIAS[tipo].niveles;
  selectNivel.innerHTML = '<option value="">— Seleccione el nivel —</option>';
  niveles.forEach((n, idx)=>{
    const opt = document.createElement('option');
    opt.value = idx;
    const valorTxt = n.valor ? `¢${n.valor.toLocaleString('es-CR')}` : 'consultar manual';
    opt.textContent = `${n.codigo} — ${n.nombre} (${valorTxt})`;
    selectNivel.appendChild(opt);
  });
}

function clasificarTipologia(){
  const tipo = document.getElementById('tipo-construccion').value;
  const nivelIdx = document.getElementById('nivel-acabado').value;
  const area = parseFloat(document.getElementById('area-construida').value) || 0;
  const anio = parseInt(document.getElementById('anio-construccion').value) || null;

  const resultadoDiv = document.getElementById('resultado-clasificador');
  const headerDiv = document.getElementById('rc-header');
  const bodyDiv = document.getElementById('rc-body');

  if(!tipo || nivelIdx===''){
    headerDiv.textContent = 'Falta información';
    headerDiv.className = 'resultado-header error';
    bodyDiv.className = 'resultado-body error';
    bodyDiv.innerHTML = '<p>Seleccione el tipo de construcción y el nivel de acabados para continuar.</p>';
    resultadoDiv.classList.add('visible');
    return;
  }

  const tipologia = TIPOLOGIAS[tipo];
  const nivel = tipologia.niveles[nivelIdx];
  const vidaUtil = nivel.vidaUtil;
  const edad = anio ? (2026 - anio) : null;
  const valorTotal = (nivel.valor && area) ? nivel.valor * area : null;

  headerDiv.textContent = `Tipología identificada: ${nivel.codigo}`;
  headerDiv.className = 'resultado-header';
  bodyDiv.className = 'resultado-body';

  let html = `<div class="resultado-grid">
    <div class="dato-card">
      <div class="etiqueta">Código ONT</div>
      <div class="valor codigo">${nivel.codigo}</div>
    </div>
    <div class="dato-card">
      <div class="etiqueta">Valor unitario</div>
      <div class="valor">${nivel.valor ? '¢'+nivel.valor.toLocaleString('es-CR')+' /m²' : 'Consultar manual'}</div>
    </div>
    <div class="dato-card">
      <div class="etiqueta">Vida útil probable</div>
      <div class="valor">${vidaUtil} años</div>
    </div>
    <div class="dato-card">
      <div class="etiqueta">${edad!==null ? 'Edad actual' : 'Área indicada'}</div>
      <div class="valor">${edad!==null ? edad+' años' : (area || '—')+' m²'}</div>
    </div>
  </div>
  <p><strong>${nivel.nombre}</strong> — Familia: ${tipo}</p>`;

  if(valorTotal){
    html += `<div class="nota-tecnica">Valor de reposición estimado (sin depreciar): <strong>¢${valorTotal.toLocaleString('es-CR',{maximumFractionDigits:2})}</strong> (${area} m² × ¢${nivel.valor.toLocaleString('es-CR')}/m²)</div>`;
  }

  if(edad!==null && edad > vidaUtil){
    html += `<div class="nota-tecnica" style="border-left-color:var(--rojo); color:var(--rojo);">⚠ La edad declarada (${edad} años) supera la vida útil probable de esta tipología (${vidaUtil} años). Verifique el año de construcción o considere un estado de conservación deficiente en la calculadora de depreciación.</div>`;
  }

  html += `<div class="nota-tecnica">Para calcular el valor actual depreciado de esta construcción, use la pestaña <strong>"Calculadora de Depreciación"</strong> con esta misma tipología.</div>`;

  bodyDiv.innerHTML = html;
  resultadoDiv.classList.add('visible');
}

// ════════════════════════════════════════════════════════════════
// PANEL 2 — CALCULADORA DE DEPRECIACIÓN ROSS-HEIDECKE
// ════════════════════════════════════════════════════════════════
function agregarFila(){
  contadorFilas++;
  const id = contadorFilas;
  const contenedor = document.getElementById('filas-construcciones');

  const fila = document.createElement('div');
  fila.className = 'fila-construccion';
  fila.id = `fila-${id}`;

  fila.innerHTML = `
    <div class="campo">
      <label>Tipología (familia + código)</label>
      <select id="tipo-${id}" onchange="actualizarCodigos(${id})">
        <option value="">— Seleccione —</option>
        ${Object.keys(TIPOLOGIAS).map(t=>`<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>
    <div class="campo">
      <label>Área (m²)</label>
      <input type="number" id="area-${id}" placeholder="m²" min="0" step="0.01">
    </div>
    <div class="campo">
      <label>Año constr.</label>
      <input type="number" id="anio-${id}" placeholder="Año" min="1900" max="2026">
    </div>
    <div class="campo">
      <label>Código específico</label>
      <select id="codigo-${id}">
        <option value="">— Primero seleccione tipología —</option>
      </select>
    </div>
    <div class="campo">
      <label>Estado de conservación</label>
      <select id="estado-${id}">
        ${ESTADOS_CONSERVACION.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
      </select>
    </div>
    <button class="btn-quitar" onclick="quitarFila(${id})" title="Quitar esta construcción">×</button>
  `;

  contenedor.appendChild(fila);
}

function quitarFila(id){
  const fila = document.getElementById(`fila-${id}`);
  if(fila) fila.remove();
}

function actualizarCodigos(id){
  const tipo = document.getElementById(`tipo-${id}`).value;
  const selectCodigo = document.getElementById(`codigo-${id}`);
  selectCodigo.innerHTML = '';

  if(!tipo){
    selectCodigo.innerHTML = '<option value="">— Primero seleccione tipología —</option>';
    return;
  }

  const niveles = TIPOLOGIAS[tipo].niveles;
  selectCodigo.innerHTML = '<option value="">— Seleccione —</option>';
  niveles.forEach((n, idx)=>{
    const opt = document.createElement('option');
    opt.value = idx;
    const valorTxt = n.valor ? `¢${n.valor.toLocaleString('es-CR')}` : 'consultar';
    opt.textContent = `${n.codigo} (${valorTxt})`;
    selectCodigo.appendChild(opt);
  });
}

// ── FÓRMULA ROSS-HEIDECKE (notación literal del Manual ONT 2023) ──
// VA = Vn * [1 - 1/2*(x/n + x²/n²)] * E
// E = (100 - coeficiente de depreciación por estado) / 100
// Verificada contra el ejemplo oficial del manual: VC02, 20 años, área 110 m²
function calcularValorActual(Vn, edad, vidaUtil, coefEstado){
  const x = edad;
  const n = vidaUtil;
  const E = (100 - coefEstado) / 100;
  const VA = Vn * (1 - 0.5 * (x/n + Math.pow(x/n, 2))) * E;
  return {VA, x: x/n, C: coefEstado/100, E};
}

function calcularDepreciacion(){
  const filas = document.querySelectorAll('.fila-construccion');
  const cuerpoTabla = document.getElementById('cuerpo-tabla-dep');
  cuerpoTabla.innerHTML = '';

  let totalVn = 0;
  let totalVA = 0;
  let huboError = false;

  filas.forEach(fila=>{
    const id = fila.id.split('-')[1];
    const tipo = document.getElementById(`tipo-${id}`).value;
    const area = parseFloat(document.getElementById(`area-${id}`).value) || 0;
    const anio = parseInt(document.getElementById(`anio-${id}`).value) || null;
    const codigoIdx = document.getElementById(`codigo-${id}`).value;
    const estadoId = parseInt(document.getElementById(`estado-${id}`).value);

    if(!tipo || codigoIdx==='' || !area || !anio){
      return; // omitir filas incompletas
    }

    const nivel = TIPOLOGIAS[tipo].niveles[codigoIdx];
    const vidaUtil = nivel.vidaUtil;
    const edad = 2026 - anio;
    const estado = ESTADOS_CONSERVACION.find(e=>e.id===estadoId);

    if(!nivel.valor){
      huboError = true;
      return;
    }

    const Vn = nivel.valor * area;
    const {VA, x, C} = calcularValorActual(Vn, edad, vidaUtil, estado.coef);
    const depreciacion = Vn - VA;

    totalVn += Vn;
    totalVA += VA;

    const fila_html = document.createElement('tr');
    fila_html.innerHTML = `
      <td style="text-align:left;"><strong>${nivel.codigo}</strong> — ${nivel.nombre}</td>
      <td>${area.toLocaleString('es-CR')}</td>
      <td>${edad}</td>
      <td><span class="badge-estado" style="background:${estado.color}">${estado.nombre}</span></td>
      <td>¢${Vn.toLocaleString('es-CR',{maximumFractionDigits:0})}</td>
      <td>${estado.coef}%</td>
      <td><strong>¢${VA.toLocaleString('es-CR',{maximumFractionDigits:2})}</strong></td>
    `;
    cuerpoTabla.appendChild(fila_html);
  });

  // Fila de totales
  const filaTotal = document.createElement('tr');
  filaTotal.className = 'fila-total';
  filaTotal.innerHTML = `
    <td colspan="4" style="text-align:right;">TOTALES →</td>
    <td>¢${totalVn.toLocaleString('es-CR',{maximumFractionDigits:0})}</td>
    <td>—</td>
    <td>¢${totalVA.toLocaleString('es-CR',{maximumFractionDigits:2})}</td>
  `;
  cuerpoTabla.appendChild(filaTotal);

  // Resumen
  document.getElementById('resumen-vn').textContent = `¢${totalVn.toLocaleString('es-CR',{maximumFractionDigits:0})}`;
  document.getElementById('resumen-dep').textContent = `¢${(totalVn-totalVA).toLocaleString('es-CR',{maximumFractionDigits:0})}`;
  document.getElementById('resumen-va').textContent = `¢${totalVA.toLocaleString('es-CR',{maximumFractionDigits:0})}`;

  document.getElementById('resultado-depreciacion').classList.add('visible');

  if(huboError){
    alert('Algunas tipologías seleccionadas no tienen valor unitario definido en el manual (marcadas como "consultar manual"). Esas filas fueron omitidas del cálculo. Verifique en el documento original del ONT 2023.');
  }
}

init();