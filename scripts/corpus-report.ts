/**
 * RAPPORTO SUL CORPUS — il confronto fra i due aghi, in numeri.
 *
 *     npm run corpus            tutte le sedute
 *     npm run corpus -- 2026-08 un mese solo
 *
 * Legge `~/EQUILIBRIUM/corpus/*.jsonl` e stampa. Tutta la logica sta in
 * `engine/corpusAnalysis.ts`, che è puro e ha i suoi test: qui c'è solo lettura di file e
 * impaginazione, perché su un rapporto non si scrivono prove.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseCorpus, eegLeadSeconds, fnConcordance,
         type CorpusRecord, type SessionRecord } from '../src/engine/corpus';
import { appaia, matriceCorrispondenza, dispersione, profiloSolitarie,
         ampiezzeAppaiate, correlazione, quotaPerCaso,
         simulaSensibilita, distanzeDaItem, ripetizioni, resaAgo,
         type ResaAgo } from '../src/engine/corpusAnalysis';

const CARTELLA = join(homedir(), 'EQUILIBRIUM', 'corpus');
const filtro = process.argv[2] ?? '';

if (!existsSync(CARTELLA)) {
  console.log(`Nessun archivio in ${CARTELLA} — non è ancora stata registrata nessuna seduta.`);
  process.exit(0);
}

const files = readdirSync(CARTELLA)
  .filter(f => f.endsWith('.jsonl'))
  .filter(f => !filtro || f.startsWith(filtro))
  .sort();

if (!files.length) {
  console.log(`Nessun file${filtro ? ` per « ${filtro} »` : ''} in ${CARTELLA}.`);
  process.exit(0);
}

const righe: CorpusRecord[] = [];
for (const f of files) righe.push(...parseCorpus(readFileSync(join(CARTELLA, f), 'utf8')));

const sedute = righe.filter((r): r is SessionRecord => r.t === 'session');
const conDue = new Set(sedute.filter(s => s.inst.muse && s.inst.theta).map(s => s.s));

const ms = (v: number) => `${v >= 0 ? '+' : ''}${(v * 1000).toFixed(0)} ms`;
const tit = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m\n${'─'.repeat(s.length)}`);

console.log(`\x1b[1mCORPUS\x1b[0m  ${files.length} file · ${righe.length} righe · ${sedute.length} sedute`);
console.log(`di cui con ENTRAMBI gli strumenti: ${conDue.size}`);

if (!conDue.size) {
  console.log('\nIl confronto fra i due aghi richiede sedute con MUSE e METER insieme.');
  console.log('Le altre restano nell\'archivio e servono lo stesso — ma qui non c\'è niente da confrontare.');
  process.exit(0);
}

// Solo le sedute a due strumenti: mescolare le altre falserebbe ogni conteggio.
const due = righe.filter(r => conDue.has(r.s));
const { coppie, soloEeg, soloTheta } = appaia(due);

tit('CHI VEDE COSA');
const nEeg = due.filter(r => r.t === 'reaction' && r.src === 'eeg').length;
const nTh  = due.filter(r => r.t === 'reaction' && r.src === 'theta').length;
console.log(`reazioni MUSE ${nEeg} · reazioni METER ${nTh}`);
console.log(`viste da entrambi ${coppie.length} · solo MUSE ${soloEeg.length} · solo METER ${soloTheta.length}`);

tit('CORRISPONDENZA — quando il MUSE dice X, l\'ago vero dice…');
const m = matriceCorrispondenza(coppie);
const breve = (k: string) => k.replace('reaction_', '').replace('_', ' ');
for (const [ke, riga] of [...m.celle].sort()) {
  const parti = [...riga].sort((a, b) => b[1] - a[1])
    .map(([kt, n]) => `${breve(kt)} ×${n}`);
  console.log(`  ${breve(ke).padEnd(12)} → ${parti.join(' · ')}`);
}
console.log(`  ── identiche ${m.uguali}/${m.totale}` +
            `${m.totale ? ` (${((m.uguali / m.totale) * 100).toFixed(0)} %)` : ''}`);
// ⚠️ Una percentuale di coincidenze non si legge da sola: con distribuzioni sbilanciate una
// parte arriva gratis. Il confronto è con quello che darebbe il caso, a parità di marginali.
if (!Number.isNaN(m.uguali_perCaso)) {
  console.log(`     il CASO, con queste distribuzioni, ne darebbe ${m.uguali_perCaso.toFixed(1)}`);
  const scarto = m.uguali - m.uguali_perCaso;
  console.log(Math.abs(scarto) < 2
    ? '     → COME IL CASO: i due aghi non si accordano più di due estrazioni indipendenti.'
    : scarto > 0
    ? '     → sopra il caso: qualcosa in comune c\'è.'
    : '     → SOTTO il caso: si accordano MENO di due estrazioni indipendenti.');
}

tit('ANTICIPO — di quanto il MUSE precede l\'ago vero');
const d = dispersione(coppie.map(c => c.leadSec));
if (!d.n) console.log('  nessuna coppia');
else {
  console.log(`  mediana ${ms(d.mediana)} · da ${ms(d.p10)} a ${ms(d.p90)} (decili)`);
  console.log(`  media ${ms(d.media)} · scarto ${ms(d.scarto)} · n=${d.n}`);
  console.log(d.scarto < 0.4
    ? '  → raccolto: l\'anticipo è una grandezza vera, si può usare.'
    : '  → SPARSO: la mediana non descrive niente. Non trattarlo come un ritardo fisso.');
}
const lead = eegLeadSeconds(due);
if (lead.length !== d.n) console.log(`  (accoppiamento largo di eegLeadSeconds: ${lead.length} coppie)`);

tit('LE SOLITARIE — valgono, o è rumore?');
for (const [nome, rs] of [['solo MUSE', soloEeg], ['solo METER', soloTheta]] as const) {
  const p = profiloSolitarie(rs);
  console.log(`  ${nome}: ${p.n}` + (p.n ? ` — ${[...p.perTipo].map(([k, n]) => `${breve(k)} ×${n}`).join(' · ')}` : ''));
  if (p.n) console.log(`    di cui durante un ASSESSMENT: ${p.inAssess}` +
    (p.n - p.inAssess ? ` · fuori assessment ${p.n - p.inAssess} (non giudicabili: in seduta il` +
     ` preclear pensa di suo, e la vicinanza all'item non vuol dire niente)` : ''));
  // ⚠️ La distanza si RICALCOLA qui dalle righe `item`: quella scritta in seduta è viziata dal
  // ritardo della trascrizione (~940 ms), che apriva un buco artificiale subito dopo ogni item.
  const dist = nome === 'solo MUSE' ? distanzeDaItem(due) : [];
  if (dist.length >= 3) {
    const dd = dispersione(dist);
    const vic = dist.filter(x => x <= 2).length;
    const quota = (vic / dist.length) * 100;
    console.log(`    entro 2 s dall'item, IN ASSESSMENT: ${vic}/${dist.length} (${quota.toFixed(0)} %)`);
    console.log(`    distanza dall'item: mediana ${dd.mediana.toFixed(2)} s · scarto ${dd.scarto.toFixed(2)} s`);
    // ⚠️ Il confronto che conta NON è con una soglia scelta a mano: è con quello che darebbe
    // il caso, che dipende da come sono spaziati gli item.
    const caso = quotaPerCaso(due) * 100;
    if (Number.isNaN(caso)) {
      console.log('    (istanti degli item non registrati: non si può dire cosa darebbe il caso)');
    } else {
      console.log(`    il CASO, con questi intervalli, darebbe ${caso.toFixed(0)} %`);
      console.log(quota > caso + 10
        ? '    → PIÙ del caso: si accalcano davvero attorno agli item.'
        : quota < caso - 10
        ? '    → MENO del caso: non seguono gli item.'
        : '    → come il caso: questo test, con item così ravvicinati, non distingue niente.'
        + '\n      Servono item PIÙ DISTANZIATI (8–10 s) perché la domanda abbia una risposta.');
    }
  } else if (p.inAssess) {
    console.log('    (troppo poche IN ASSESSMENT per giudicare)');
  } else if (p.n) {
    console.log('    (nessuna in assessment: niente da giudicare — serve una seduta di soli item)');
  }
}

tit('AMPIEZZE');
{
  // ⚠️ v1 e v2 non si mescolano: fino al 01/08/2026 « ampiezza » voleva dire due cose diverse
  // dai due lati (vedi CORPUS_VERSION). Sommarle darebbe una correlazione priva di senso.
  const v2 = coppie.filter(c => (c.eeg.v ?? 1) >= 2 && (c.theta.v ?? 1) >= 2);
  const v1 = coppie.length - v2.length;
  if (v1) console.log(`  ${v1} coppie in formato v1 (ampiezze non confrontabili) — escluse.`);

  const amp = ampiezzeAppaiate(v2).filter(a => typeof a.moveR === 'number');
  if (amp.length < 3) {
    console.log(`  ${amp.length} coppie confrontabili: troppo poche.`);
    console.log('  Serve una seduta registrata con la v2: da lì i due aghi archiviano');
    console.log('  entrambi una CORSA in unità di quadrante, e si possono confrontare.');
  } else {
    console.log('  corsa del MUSE (moveR, 0,5 s) contro corsa dell\'ago vero — due misure,');
    console.log('  stesse unità. Le finestre temporali restano diverse.');
    const c = correlazione(amp.map(a => a.moveR as number), amp.map(a => a.peak));
    console.log(`  n=${amp.length} · correlazione ${c.toFixed(2)}`);
    console.log(Math.abs(c) > 0.5
      ? '  → salgono e scendono insieme: le due scale si possono mettere in relazione.'
      : '  → non vanno insieme: misurano cose diverse, o una delle due non misura niente.');
    // La CARICA resta un confronto a parte: è un'altra grandezza, non un'ampiezza.
    const cq = correlazione(amp.map(a => a.ql), amp.map(a => a.peak));
    if (!Number.isNaN(cq)) console.log(`  (per confronto, carica qL contro corsa dell'ago: ${cq.toFixed(2)})`);
  }
}

tit('RIPETIBILITÀ — lo stesso item dato più volte');
{
  const rip = ripetizioni(due);
  if (!rip.length) {
    console.log('  Nessun item ripetuto. È la prova che decide: dai lo STESSO item due o tre');
    console.log('  volte, a distanza, finché la reazione si esaurisce.');
  } else {
    for (const r of rip) console.log(`  item #${r.g}: ${r.letture.join(' → ')}` +
      `${r.costante ? '   COSTANTE' : r.siEsaurisce ? '   si esaurisce' : ''}` +
      `${r.bloccoChiusoSuNull ? '   \x1b[33m⚠ blocco chiuso su NULL\x1b[0m' : ''}`);
    // ⚠️ Prima di ogni verdetto: quante di queste sequenze sono utilizzabili come PROVA.
    const viziate = rip.filter(r => r.bloccoChiusoSuNull);
    if (viziate.length) {
      console.log(`\n  ⚠️  ${viziate.length}/${rip.length} sequenze sono un BLOCCO CHIUSO SU NULL:`);
      console.log('     l\'item è stato dato di fila e l\'auditor è passato al successivo appena');
      console.log('     ha smesso di leggere. La lunghezza del gruppo è allora un ESITO, non un');
      console.log('     piano — e qualunque test su « come finisce » ritrova la regola di arresto.');
      console.log('     È la procedura giusta in seduta, e rende la sequenza inutile come prova.');
      console.log('     Per provare qualcosa servono item ALTERNATI e un numero di ripetizioni');
      console.log('     deciso PRIMA.');
    }
    const buone = rip.filter(r => !r.bloccoChiusoSuNull);
    const cost = buone.filter(r => r.costante).length;
    const esa  = buone.filter(r => r.siEsaurisce).length;
    console.log(`\n  ── ${rip.length} item ripetuti, di cui ${buone.length} utilizzabili` +
                ` · ${cost} costanti · ${esa} in esaurimento · ${buone.length - cost - esa} scorrelati`);
    if (!buone.length) console.log('  → nessuna sequenza utilizzabile: non si può dire niente.');
    else console.log((cost + esa) / buone.length >= 0.6
      ? '  → si ripetono: lo strumento segue l\'item, non fa rumore.'
      : '  → letture scorrelate fra una ripetizione e l\'altra.');
  }
}

// È la sola domanda a cui i due aghi non possono rispondere fra loro: si sono trovati d'accordo
// una volta su 89. Il preclear sì — e il criterio si raccoglie nel modulo R&I, vista MANUALE
// o direttamente sulla riga dell'item assessato.
tit('R&I — la reazione INDICA al preclear?');
{
  const M = resaAgo(due, r => r.readMuse);
  const T = resaAgo(due, r => r.readMeter);
  if (!M.n && !T.n) {
    console.log('  Nessuna riga con questo giudizio.');
    console.log('  Nel modulo R&I: due bottoni « INDICA AL PC? » sotto ogni item assessato, e');
    console.log('  nella vista MANUALE per gli item trovati in un altro modo.');
  } else {
    const riga = (nome: string, x: ResaAgo) => {
      if (!x.n) { console.log(`  ${nome.padEnd(6)} — non era collegato`); return; }
      const sens = x.carichi ? (100 * x.presi) / x.carichi : NaN;
      const altri = x.n - x.carichi;
      const spec = altri ? (100 * (altri - x.falsi)) / altri : NaN;
      console.log(`  ${nome.padEnd(6)} trova ${x.presi}/${x.carichi} indicanti` +
        `${Number.isNaN(sens) ? '' : ` (${sens.toFixed(0)} %)`}` +
        ` · legge ${x.falsi}/${altri} degli altri` +
        `${Number.isNaN(spec) ? '' : ` (ne lascia stare il ${spec.toFixed(0)} %)`}`);
    };
    console.log(`  ${Math.max(M.n, T.n)} righe giudicate · ${Math.max(M.carichi, T.carichi)} indicanti\n`);
    riga('MUSE', M);
    riga('METER', T);
    // ⚠️ Un ago che legge TUTTO trova tutto senza sapere niente: i due numeri si leggono
    // insieme, sempre — è lo stesso errore della « corrispondenza » senza baseline.
    console.log('\n  ⚠️  I due numeri si leggono INSIEME: un ago che legge ogni riga trova il');
    console.log('     100 % senza sapere niente.');
    console.log('  ⚠️  Qui il preclear ha VISTO la reazione indicata: è la procedura, non un');
    console.log('     esperimento cieco. Dice se lo strumento è utilizzabile in seduta.');
  }
}

tit('E SE IL MUSE FOSSE MENO SENSIBILE? — simulazione');
console.log('  Si alza la soglia del MUSE un gradino per volta. Se vede la STESSA cosa più');
console.log('  finemente, al livello in cui i due hanno lo stesso NUMERO di reazioni devono');
console.log('  incontrarsi. (L\'F/N resta fuori: non è un\'ampiezza.)\n');
console.log('  soglia MUSE      reazioni   appaiate col meter   identiche');
for (const l of simulaSensibilita(due)) {
  const nome = l.da.replace('reaction_', '').replace('_', ' ');
  console.log(`  ${(nome + ' e oltre').padEnd(17)}${String(l.rimaste).padStart(6)}` +
              `${`${l.appaiate}/${l.suMeter}`.padStart(19)}${String(l.identiche).padStart(12)}`);
}

tit('F/N — la prova di falsificabilità dell\'AS-IS');
const f = fnConcordance(due);
if (Number.isNaN(f.agreement)) console.log('  nessun F/N registrato.');
else {
  console.log(`  concordi ${f.both} · solo MUSE ${f.onlyEeg} · solo METER ${f.onlyTheta}` +
              ` · accordo ${(f.agreement * 100).toFixed(0)} %`);
  console.log(`  AS-IS dichiarati su un F/N che l'ago vero NON ha confermato: \x1b[1m${f.asIsUnconfirmed}\x1b[0m`);
}
console.log();
