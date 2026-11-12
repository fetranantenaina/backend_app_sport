// Tests de la vue anatomique sur une vraie base PostgreSQL chargée avec db/script.sql.
// Usage (base de test locale, jamais la base de production) :
//   DB_NAME=coach_john_test DB_PORT=5433 npm test
// Le test refuse de tourner si DATABASE_URL est défini (Neon) ou si la base ne s'appelle pas *test*.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

if (process.env.DATABASE_URL || !/test/i.test(process.env.DB_NAME || '')) {
  throw new Error('Tests à lancer sur une base locale dont le nom contient "test" (DB_NAME), sans DATABASE_URL');
}

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { migrer } = require('../db/migrer');
const anatomie = require('../objets/anatomie');
const { SECRET_KEY } = require('../middleware/auth');

const CLIENT = 4; // client du fichier Excel importé par script.sql
let serveur;
let base;
const jeton = (id, role) => jwt.sign({ id, role, uniq: `${id}-${role}` }, SECRET_KEY, { expiresIn: '1h' });
const appel = async (methode, chemin, { role = 'user', id = CLIENT, body, entetes = {} } = {}) => {
  const r = await fetch(base + chemin, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton(id, role)}`, 'Content-Type': 'application/json', ...entetes },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch { /* réponse texte */ }
  return { statut: r.status, json, texte };
};

before(async () => {
  await migrer({ silencieux: true });
  const app = express();
  app.use(express.json());
  app.use('/api', require('../routes/anatomie.routes'));
  serveur = http.createServer(app).listen(0);
  base = `http://127.0.0.1:${serveur.address().port}/api`;
});

after(async () => {
  await pool.query("DELETE FROM libelles_cibles WHERE libelle LIKE 'TEST %'");
  await pool.query("DELETE FROM muscles WHERE code LIKE 'test_%'");
  serveur.close();
  await pool.end();
});

test('la migration est idempotente et charge 23 muscles', async () => {
  assert.deepEqual(await migrer({ silencieux: true }), []);
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM muscles');
  assert.equal(r.rows[0].n, 23);
  const parts = await pool.query(
    `SELECT l.libelle, SUM(lm.part) AS total FROM libelles_cibles l JOIN libelle_muscles lm ON lm.libelle_id = l.id
     GROUP BY l.libelle HAVING ABS(SUM(lm.part) - 1) > 0.001`);
  assert.deepEqual(parts.rows, [], 'chaque intitulé musculaire répartit exactement 100 % du volume');
});

// Fautes de frappe connues dans le journal importé (à rattacher via l'écran admin, jamais devinées)
const COQUILLES_CONNUES = ['LOWER TRAPS L'];

test('les intitulés du journal réel sont reconnus, sauf les coquilles signalées', async () => {
  const vue = await anatomie.getVueAnatomique(CLIENT);
  const inconnus = vue.non_reconnus.map((n) => n.libelle);
  assert.deepEqual(inconnus.filter((l) => !COQUILLES_CONNUES.includes(l)), []);
});

test('analyse des cibles : groupes, plafond, activités, inconnus', async () => {
  const r = await anatomie.analyserCibles(' glutes, MAXIMUS GLUTEUS,CARDIO, inconnu ');
  const parCode = Object.fromEntries(r.muscles.map((m) => [m.code, m.part]));
  assert.equal(parCode.grand_fessier, 1, 'GLUTES (0,5) + MAXIMUS GLUTEUS (1) plafonné à 1');
  assert.equal(parCode.moyen_fessier, 0.5);
  assert.deepEqual(r.activites.map((a) => a.activite), ['cardio']);
  assert.deepEqual(r.non_reconnus, ['INCONNU']);

  const core = await anatomie.analyserCibles('CORE');
  assert.deepEqual(core.muscles.map((m) => m.code).sort(), ['grand_droit', 'lombaires', 'obliques']);
});

test('vue anatomique : séries par muscle recalculées indépendamment', async () => {
  const { statut, json } = await appel('GET', '/anatomie/vue');
  assert.equal(statut, 200);
  assert.equal(json.muscles.length, 23);
  assert.equal(json.periode.periode, 'tout');

  // Recalcul en JS à partir des lignes brutes du journal
  const lignes = (await pool.query(
    `SELECT COALESCE(NULLIF(se.cibles, ''), e.groupe_musculaire) AS cibles, COALESCE(se.series, 1) AS series,
            COALESCE(se.poids_kg, 0) * COALESCE(se.repetitions, 0) AS charge
     FROM seance_exercices se JOIN seances s ON s.id = se.seance_id JOIN exercices e ON e.id = se.exercice_id
     WHERE s.utilisateur_id = $1 AND se.fait`, [CLIENT])).rows;
  const attendu = {};
  for (const l of lignes) {
    const a = await anatomie.analyserCibles(l.cibles);
    for (const m of a.muscles) {
      attendu[m.code] = attendu[m.code] || { series: 0, volume: 0 };
      attendu[m.code].series += l.series * m.part;
      attendu[m.code].volume += Number(l.charge) * l.series * m.part;
    }
  }
  for (const m of json.muscles) {
    const a = attendu[m.code] || { series: 0, volume: 0 };
    assert.ok(Math.abs(m.nb_series - a.series) < 0.05, `${m.code} : ${m.nb_series} séries, attendu ${a.series}`);
    assert.ok(Math.abs(m.volume_kg - a.volume) < 0.5, `${m.code} : ${m.volume_kg} kg, attendu ${a.volume}`);
  }
  assert.ok(json.muscles.find((m) => m.code === 'adducteurs').nb_series > 0);
  assert.equal(json.maximums.nb_series, Math.max(...json.muscles.map((m) => m.nb_series)));
});

test('activités : cardio, échauffement, récupération hors du corps', async () => {
  const { json } = await appel('GET', '/anatomie/vue');
  assert.deepEqual(json.activites.map((a) => a.activite), ['cardio', 'echauffement', 'recuperation', 'qualite']);
  const cardio = json.activites.find((a) => a.activite === 'cardio');
  assert.ok(cardio.nb_exercices > 0);
});

test('période : filtre de dates, préréglages et erreurs', async () => {
  const tout = (await appel('GET', '/anatomie/vue')).json;
  const mai = (await appel('GET', '/anatomie/vue?from=2026-05-01&to=2026-05-31')).json;
  const total = (v) => v.muscles.reduce((s, m) => s + m.nb_series, 0);
  assert.ok(total(mai) > 0 && total(mai) < total(tout));
  for (const m of mai.muscles) {
    if (m.derniere_sollicitation) assert.ok(m.derniere_sollicitation >= '2026-05-01' && m.derniere_sollicitation <= '2026-05-31');
  }
  assert.deepEqual(anatomie.resoudrePeriode({ periode: '7j' }, new Date(2026, 10, 12)),
    { periode: '7j', from: '2026-11-06', to: null });
  assert.equal((await appel('GET', '/anatomie/vue?periode=2j')).statut, 400);
  assert.equal((await appel('GET', '/anatomie/vue?from=12/05/2026')).statut, 400);
  // un autre client ne voit rien du client 4
  const autre = (await appel('GET', '/anatomie/vue', { id: 2 })).json;
  assert.equal(total(autre), 0);
});

test('fiche muscle : stats et 10 derniers exercices', async () => {
  const { statut, json } = await appel('GET', '/anatomie/muscles/moyen_fessier');
  assert.equal(statut, 200);
  assert.equal(json.muscle.nom_fr, 'Moyen fessier');
  assert.ok(json.muscle.libelles.includes('MEDIUS GLUTEUS'));
  assert.ok(json.derniers_exercices.length > 0 && json.derniers_exercices.length <= 10);
  const dates = json.derniers_exercices.map((e) => e.date_seance);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.equal(json.stats.derniere_sollicitation, dates[0]);
  assert.equal((await appel('GET', '/anatomie/muscles/nexiste_pas')).statut, 404);
});

test('fiche d\'exercice : muscles travaillés', async () => {
  const { json } = await appel('GET', '/anatomie/exercices/12'); // ABDUCTOR, ADDUCTOR, MEDIUS GLUTEUS
  const codes = json.muscles.map((m) => m.code).sort();
  assert.deepEqual(codes, ['adducteurs', 'moyen_fessier', 'tenseur_fascia_lata']);
  assert.equal(json.muscles.find((m) => m.code === 'tenseur_fascia_lata').part, 0.5);
  assert.equal(json.muscles.find((m) => m.code === 'moyen_fessier').part, 1);
  assert.equal((await appel('GET', '/anatomie/exercices/999999')).statut, 404);
});

test('admin : créer un intitulé et un muscle, droits refusés aux autres rôles', async () => {
  const corps = { type: 'muscle', nom_fr: 'Test', muscles: [{ code: 'biceps' }, { code: 'triceps' }, { code: 'avant_bras' }] };
  assert.equal((await appel('PUT', '/anatomie/libelles/TEST%20BRAS', { body: corps })).statut, 403);
  assert.equal((await appel('PUT', '/anatomie/libelles/TEST%20BRAS', { role: 'coach', id: 1, body: corps })).statut, 403);

  const ok = await appel('PUT', '/anatomie/libelles/test%20bras', { role: 'admin', id: 1, body: corps });
  assert.equal(ok.statut, 200);
  assert.equal(ok.json.libelle, 'TEST BRAS');
  assert.ok(Math.abs(ok.json.muscles.reduce((s, m) => s + m.part, 0) - 1) < 0.001);

  // remplacement : un seul muscle désormais
  const r2 = await appel('PUT', '/anatomie/libelles/TEST%20BRAS', { role: 'admin', id: 1, body: { type: 'muscle', muscles: [{ code: 'biceps' }] } });
  assert.deepEqual(r2.json.muscles.map((m) => [m.code, m.part]), [['biceps', 1]]);
  // passage en activité : plus aucun muscle
  const r3 = await appel('PUT', '/anatomie/libelles/TEST%20BRAS', { role: 'admin', id: 1, body: { type: 'activite', activite: 'cardio' } });
  assert.deepEqual(r3.json.muscles, []);

  assert.equal((await appel('PUT', '/anatomie/libelles/TEST%20X', { role: 'admin', id: 1, body: { type: 'muscle', muscles: [{ code: 'zzz' }] } })).statut, 400);

  const m = await appel('POST', '/anatomie/muscles', { role: 'admin', id: 1, body: { code: 'test_mollet', nom_fr: 'Test', region: 'jambes' } });
  assert.equal(m.statut, 201);
  assert.deepEqual(m.json.objets_3d, ['test_mollet_g', 'test_mollet_d']);
  assert.equal((await appel('POST', '/anatomie/muscles', { role: 'admin', id: 1, body: { code: 'test_mollet', nom_fr: 'Test', region: 'jambes' } })).statut, 409);
  assert.equal((await appel('POST', '/anatomie/muscles', { role: 'admin', id: 1, body: { code: 'Mauvais Code', nom_fr: 'x', region: 'jambes' } })).statut, 400);
  const maj = await appel('PUT', '/anatomie/muscles/test_mollet', { role: 'admin', id: 1, body: { vue: 'dos' } });
  assert.equal(maj.json.vue, 'dos');
  assert.equal((await appel('DELETE', '/anatomie/muscles/test_mollet', { role: 'admin', id: 1 })).statut, 200);
  assert.equal((await appel('DELETE', '/anatomie/libelles/TEST%20BRAS', { role: 'admin', id: 1 })).statut, 200);
});

test('l\'admin consulte la vue d\'un client via X-Utilisateur-Id', async () => {
  const { json } = await appel('GET', '/anatomie/vue', { role: 'admin', id: 1, entetes: { 'X-Utilisateur-Id': String(CLIENT) } });
  assert.ok(json.muscles.some((m) => m.nb_series > 0));
});
