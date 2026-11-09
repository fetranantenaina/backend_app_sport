-- =========================================================
-- Base de données : sport
-- Application de suivi sportif, nutritionnel et anatomique
-- SGBD : PostgreSQL
-- =========================================================

-- La base existe déjà (sur Neon : la base 'neondb' ; en local : psql -U postgres -c "CREATE DATABASE sport").
-- Lance ce script DANS cette base :  psql -d sport -f script.sql   (ou colle-le dans l'éditeur SQL de Neon).

-- =========================================================
-- 0. EXTENSIONS UTILES
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- pour gen_random_uuid() / hachage si besoin

-- =========================================================
-- 1. UTILISATEURS & AUTHENTIFICATION
-- =========================================================

CREATE TABLE utilisateurs (
    id SERIAL PRIMARY KEY,
    role VARCHAR(20) NOT NULL DEFAULT 'user',      -- admin, coach, user
    name VARCHAR(50) NOT NULL,
    mdp VARCHAR(255) NOT NULL,                     -- élargi pour un hash bcrypt (60 car.) + marge
    email VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mots de passe de test (hachés en bcrypt, coût 10) : admin/admin · test01/user · test02/user · client_x/client
INSERT INTO utilisateurs (role, name, mdp, email) VALUES
    ('admin', 'admin',    '$2b$10$zsyb9jSEmM8w1jIePKGzee97y/w8F0Wc6mDOUbCeKzdbO3KYpqOaq', 'admin@gmail.com'),
    ('user',  'test01',   '$2b$10$itRRKadX44/ff54PtWn4ge/LpnADp/l9dXJ4vuOBi/TOXOBBCIqsK', 'test01@gmail.com'),
    ('user',  'test02',   '$2b$10$itRRKadX44/ff54PtWn4ge/LpnADp/l9dXJ4vuOBi/TOXOBBCIqsK', 'test02@gmail.com'),
    ('user',  'client_x', '$2b$10$7FsLNqN0SJ0U4c3Npa.tBOlDHCswrfFiKDrMvb7qeQcmrOAJXi7XS', 'client_x@gmail.com');

CREATE TABLE tokens_blacklist (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 2. MODULE 1 — INFORMATIONS PERSONNELLES (Profil / Mensurations)
-- =========================================================

-- Profil de base (1-1 avec utilisateurs) : sexe, PAL, statut de santé
CREATE TABLE profils (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    sexe VARCHAR(10) CHECK (sexe IN ('homme', 'femme', 'autre')),
    date_naissance DATE,
    pal NUMERIC(3,2),                       -- niveau d'activité physique (ex: 1.2 à 2.4)
    objectif TEXT,                          -- GOAL du fichier client (ex: tonification, prise de masse...)
    statut_sante TEXT,                      -- notes / alertes / restrictions médicales
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (utilisateur_id)
);



-- Relevés physiques dans le temps (poids, IMC, masse grasse, mensurations)
-- => alimente l'histogramme physique (module 1)
CREATE TABLE releves_physiques (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    date_releve DATE NOT NULL DEFAULT CURRENT_DATE,
    poids_kg NUMERIC(5,2),
    taille_cm NUMERIC(5,2),
    imc NUMERIC(5,2),                       -- peut être calculé côté app ou stocké ici
    taux_graisse NUMERIC(5,2),              -- % masse grasse
    cou_cm NUMERIC(5,2),
    poitrine_cm NUMERIC(5,2),
    taille_tour_cm NUMERIC(5,2),            -- tour de taille (distinct de "taille_cm")
    bras_gauche_cm NUMERIC(5,2),            -- L.arms du fichier client
    bras_droit_cm NUMERIC(5,2),
    fessiers_cm NUMERIC(5,2),
    cuisses_cm NUMERIC(5,2),
    mollet_gauche_cm NUMERIC(5,2),          -- L.calf du fichier client
    mollet_droit_cm NUMERIC(5,2),           -- R.calf du fichier client
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_releves_physiques_user_date ON releves_physiques (utilisateur_id, date_releve);


-- =========================================================
-- 3. MODULE 2 — JOURNAL D'ENTRAÎNEMENT (Workout log)
-- =========================================================

-- Référentiel des exercices (utilisé aussi par la vue anatomique)
CREATE TABLE exercices (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    groupe_musculaire VARCHAR(100),         -- cible(s) habituelle(s), ex: CHEST, LATS, ADDUCTOR, GLUTES
    methode VARCHAR(50),                    -- méthode habituelle, ex: STRAIGHT SET, SUPERSET
    description TEXT
);

-- Une séance d'entraînement
CREATE TABLE seances (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    date_seance DATE NOT NULL DEFAULT CURRENT_DATE,
    nom_session VARCHAR(100),               -- ex: "Push Day", "Cardio léger"
    cible VARCHAR(100),                     -- objectif de la séance
    notes TEXT,                             -- informations complémentaires
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Détail exercice par exercice au sein d'une séance
CREATE TABLE seance_exercices (
    id SERIAL PRIMARY KEY,
    seance_id INTEGER NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
    exercice_id INTEGER NOT NULL REFERENCES exercices(id),
    niveau VARCHAR(30),                     -- ex: débutant/intermédiaire/avancé
    poids_kg NUMERIC(6,2),
    vitesse NUMERIC(6,2),                   -- pour le cardio (km/h) si applicable
    repetitions INTEGER,
    duree_secondes INTEGER,                 -- alternative aux répétitions (temps)
    series INTEGER,
    repos_secondes INTEGER,
    ordre INTEGER,                          -- ordre d'exécution dans la séance
    fait BOOLEAN NOT NULL DEFAULT FALSE,    -- case à cocher fait / non fait
    cibles TEXT,                            -- TARGET du fichier : muscle(s) ciblé(s), séparés par des virgules
    methode VARCHAR(50),                    -- METHODS du fichier : STRAIGHT SET, SUPERSET, PROGRESSIVE OVERLOAD...
    charge VARCHAR(60),                     -- Weight/Level/Speed tel que saisi : '4kg', 'Lvl 2', 'OB 20kg + 5kg', 'medium band'
    rep_temps VARCHAR(30),                  -- Rep/Time tel que saisi : '15', '20sec', '15mn'
    infos TEXT,                             -- ADDITIONAL INFORMATION
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_seances_user_date ON seances (utilisateur_id, date_seance);
CREATE INDEX idx_seance_exercices_seance ON seance_exercices (seance_id);

-- Indicateurs athlétiques dans le temps (force, endurance, résistance, puissance)
-- => alimente l'histogramme athlétique (module 2)
CREATE TABLE indicateurs_athletiques (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    date_mesure DATE NOT NULL DEFAULT CURRENT_DATE,
    force NUMERIC(5,2),
    endurance NUMERIC(5,2),
    resistance NUMERIC(5,2),
    puissance NUMERIC(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_indic_athl_user_date ON indicateurs_athletiques (utilisateur_id, date_mesure);


-- =========================================================
-- 4. MODULE 3 — NUTRITION + E-BOOK
-- =========================================================

-- Suivi nutritionnel quotidien
CREATE TABLE nutrition_journal (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    date_jour DATE NOT NULL DEFAULT CURRENT_DATE,
    calories NUMERIC(6,2),
    proteines_g NUMERIC(6,2),
    glucides_g NUMERIC(6,2),
    lipides_g NUMERIC(6,2),
    eau_ml INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_nutrition_user_date ON nutrition_journal (utilisateur_id, date_jour);

-- Guide alimentaire (feuille NUTRITION du fichier client) : valeurs pour 100 g
CREATE TABLE aliments_categories (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(80) NOT NULL UNIQUE,
    ordre INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE aliments (
    id SERIAL PRIMARY KEY,
    categorie_id INTEGER NOT NULL REFERENCES aliments_categories(id) ON DELETE CASCADE,
    nom VARCHAR(120) NOT NULL,
    proteines_g NUMERIC(6,2),               -- PROTEINS
    glucides_g NUMERIC(6,2),                -- CARBS
    lipides_g NUMERIC(6,2),                 -- FATS
    ordre INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_aliments_categorie ON aliments (categorie_id, ordre);

-- Contenus de l'e-book déjà rédigé (import du contenu existant)
CREATE TABLE ebook_chapitres (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(150) NOT NULL,
    ordre INTEGER NOT NULL,
    contenu TEXT NOT NULL,                  -- texte du chapitre (déjà rédigé, importé)
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suivi de lecture par utilisateur (progression dans l'e-book)
CREATE TABLE ebook_progression (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    chapitre_id INTEGER NOT NULL REFERENCES ebook_chapitres(id) ON DELETE CASCADE,
    lu BOOLEAN NOT NULL DEFAULT FALSE,
    date_lecture TIMESTAMP,
    UNIQUE (utilisateur_id, chapitre_id)
);


-- =========================================================
-- 5. MODULE 4 — GLOSSAIRE
-- =========================================================

CREATE TABLE glossaire (
    id SERIAL PRIMARY KEY,
    terme VARCHAR(100) NOT NULL UNIQUE,
    definition TEXT NOT NULL,
    categorie VARCHAR(50),                  -- ex: musculation, nutrition, santé
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Liens croisés entre termes du glossaire (fiches liées)
CREATE TABLE glossaire_liens (
    id SERIAL PRIMARY KEY,
    terme_id INTEGER NOT NULL REFERENCES glossaire(id) ON DELETE CASCADE,
    terme_lie_id INTEGER NOT NULL REFERENCES glossaire(id) ON DELETE CASCADE,
    CHECK (terme_id <> terme_lie_id),
    UNIQUE (terme_id, terme_lie_id)
);

CREATE INDEX idx_glossaire_terme ON glossaire (terme);


-- =========================================================
-- 6. MODULE 5 — SYSTÈME DE CHAT (Utilisateur ↔ Coach/Support)
-- =========================================================

-- Une conversation 1-à-1 entre un utilisateur et un coach/support
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    coach_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (utilisateur_id, coach_id)
);

-- Messages échangés (historique, alimente la messagerie temps réel via Socket.io)
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    expediteur_id INTEGER NOT NULL REFERENCES utilisateurs(id),
    contenu TEXT NOT NULL,
    lu BOOLEAN NOT NULL DEFAULT FALSE,
    envoye_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, envoye_at);

-- Notifications de nouveaux messages (ou autres événements de l'app)
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL DEFAULT 'message',   -- message, rappel_nutrition, etc.
    contenu TEXT NOT NULL,
    lu BOOLEAN NOT NULL DEFAULT FALSE,
    reference_id INTEGER,                           -- ex: id du message concerné
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications (utilisateur_id, lu);


-- =========================================================
-- 7. DONNÉES DE TEST
--    Journal, guide alimentaire et glossaire : importés du fichier CLIENT_X_VAPK1.xlsx (client_x = id 4).
--    Profil, relevés, indicateurs, nutrition, e-book et chat : valeurs FICTIVES pour tester l'app.
-- =========================================================

-- Profils (admin = 1, test01 = 2, test02 = 3, client_x = 4)
INSERT INTO profils (utilisateur_id, sexe, date_naissance, pal, objectif, statut_sante) VALUES
    (1, 'homme', '1990-05-12', 1.75, NULL, 'Aucune restriction médicale'),
    (2, 'femme', '1985-11-03', 1.60, 'Perte de poids', 'Allergie au gluten'),
    (3, 'autre', '2000-07-21', 2.10, 'Prise de masse', 'Asthme léger, éviter les environnements poussiéreux'),
    (4, 'femme', '1995-06-15', 1.55, 'Tonification et renforcement musculaire', 'RAS (données de test)');

-- Relevés physiques de client_x (fictifs) : alimentent l'histogramme d'évolution
INSERT INTO releves_physiques (utilisateur_id, date_releve, poids_kg, taille_cm, imc, taux_graisse, cou_cm, poitrine_cm, taille_tour_cm, bras_gauche_cm, bras_droit_cm, fessiers_cm, cuisses_cm, mollet_gauche_cm, mollet_droit_cm) VALUES
    (4, '2026-02-04', 68.0, 165, ROUND(68.0/(1.65*1.65), 2), 31.0, 32.0, 92.0, 76.0, 27.0, 27.5, 101.0, 58.0, 35.0, 35.5),
    (4, '2026-05-10', 66.5, 165, ROUND(66.5/(1.65*1.65), 2), 29.5, 31.5, 91.0, 74.0, 27.5, 28.0, 100.0, 57.0, 35.0, 35.5),
    (4, '2026-09-15', 65.0, 165, ROUND(65.0/(1.65*1.65), 2), 28.0, 31.5, 90.5, 72.5, 28.0, 28.5, 99.0, 56.0, 35.5, 36.0);

-- Indicateurs athlétiques de client_x (fictifs)
INSERT INTO indicateurs_athletiques (utilisateur_id, date_mesure, force, endurance, resistance, puissance) VALUES
    (4, '2026-02-04', 40, 45, 42, 35), (4, '2026-05-10', 55, 58, 52, 48), (4, '2026-09-15', 68, 66, 63, 60);

-- Journal nutritionnel de client_x (fictif)
INSERT INTO nutrition_journal (utilisateur_id, date_jour, calories, proteines_g, glucides_g, lipides_g, eau_ml, notes) VALUES
    (4, CURRENT_DATE, 520, 28, 62, 14, 500, 'Petit-déjeuner : avoine, banane, yaourt'),
    (4, CURRENT_DATE, 640, 45, 55, 22, 750, 'Déjeuner : blanc de poulet, riz brun, brocoli'),
    (4, CURRENT_DATE - 1, 1750, 98, 190, 60, 2000, 'Journée complète');

-- E-book (chapitres d'exemple) + progression de client_x
INSERT INTO ebook_chapitres (titre, ordre, contenu) VALUES
    ('Bien démarrer', 1, 'Chapitre d''exemple : les bases pour bien commencer l''entraînement, l''échauffement et la récupération.'),
    ('Les bases de la nutrition', 2, 'Chapitre d''exemple : protéines, glucides et lipides, et comment composer ses repas.'),
    ('Récupération et sommeil', 3, 'Chapitre d''exemple : pourquoi le repos est indispensable à la progression.');
INSERT INTO ebook_progression (utilisateur_id, chapitre_id, lu, date_lecture) VALUES (4, 1, TRUE, CURRENT_TIMESTAMP);

-- Chat : conversation coach (admin) <-> client_x
INSERT INTO conversations (utilisateur_id, coach_id) VALUES (4, 1);
INSERT INTO messages (conversation_id, expediteur_id, contenu, lu, envoye_at) VALUES
    (1, 1, 'Bonjour ! Bravo pour ta séance de jeudi, on continue sur cette lancée.', TRUE,  CURRENT_TIMESTAMP - INTERVAL '2 hours'),
    (1, 4, 'Merci coach ! Le leg press était trop lourd, je baisse la charge ?', TRUE,  CURRENT_TIMESTAMP - INTERVAL '90 minutes'),
    (1, 1, 'Oui, baisse de 10 kg et garde 12 répétitions propres.', FALSE, CURRENT_TIMESTAMP - INTERVAL '10 minutes');
INSERT INTO notifications (utilisateur_id, type, contenu, reference_id) VALUES
    (4, 'message', 'Nouveau message de admin : Oui, baisse de 10 kg et garde 12 répétitions propres.', 3);
-- Référentiel d'exercices (118 exercices distincts du journal)
INSERT INTO exercices (id, nom, groupe_musculaire, methode) VALUES
    (1, 'eliptical trainer', 'WARM-UP', NULL),
    (2, 'machine seated chest fly', 'CHEST', 'STRAIGHT SET'),
    (3, 'dumbbell flat bench press', 'CHEST', 'STRAIGHT SET'),
    (4, 'dumbbell shoulder press', 'SHOULDER', 'STRAIGHT SET'),
    (5, 'close neutral grip horizontal pullback', 'MIDDLE TRAPS', 'STRAIGHT SET'),
    (6, 'middle pronate grip lat pulldown', 'LATS', 'PROGRESSIVE OVERLOAD'),
    (7, 'stretching', 'RECOVERY, RELAXING', 'STRETCHING'),
    (8, 'treadmill trainer', 'WARM-UP', 'WARM-UP'),
    (9, 'dumbbell alternate backward lunges', 'ADDUCTOR, GLUTES', 'STRAIGHT SET'),
    (10, 'dumbbell bridge', 'MAXIMUS GLUTEUS', 'STRAIGHT SET'),
    (11, 'machine seated leg abduction', 'ABDUCTOR, MEDIUS GLUTEUS', 'STRAIGHT SET'),
    (12, 'lying on the mat banded leg abduction', 'ABDUCTOR, ADDUCTOR, MEDIUS GLUTEUS', 'STRAIGHT SET'),
    (13, 'dumbbell goblet sumo squat', 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD'),
    (14, 'kettlebell alternate backward lunges', 'MAXIMUS GLUTEUS', 'STRAIGHT SET'),
    (15, 'machine lying leg curl', 'HAMSTRING', 'STRAIGHT SET'),
    (16, 'machine hip thrust', 'MAXIMUS GLUTEUS', 'STRAIGHT SET'),
    (17, 'dumbbell stiff leg deadlift', 'LUMBAR', 'PROGRESSIVE OVERLOAD'),
    (18, 'dumbbell step over the box', 'QUADS, BALANCE', 'STRAIGHT SET'),
    (19, 'mountain climber', 'CORE, ABS', 'STRAIGHT SET'),
    (20, 'kettlebell side bend', 'OBLICS, CORE', 'STRAIGHT SET'),
    (21, 'middle pronate grip lat pulldown behind the neck', 'LATS, MIDDLE TRAPS', 'PROGRESSIVE OVERLOAD'),
    (22, 'machine seated neutral grip shoulder press', 'SHOULDER', 'STRAIGHT SET'),
    (23, 'dumbbell skull crushers', 'TRICEPS', 'STRAIGHT SET'),
    (24, 'barbell conventional deadlift', 'LUMBAR', 'SUPERSET'),
    (25, 'alternate battling rope', 'STAMINA, ARMS, SHOULDER', 'SUPERSET'),
    (26, 'kettlebell clean and press', 'SHOULDER, LUMBAR', 'SUPERSET'),
    (27, 'kettlebell swings', 'SHOULDER, LUMBAR, CORE', 'SUPERSET'),
    (28, 'machine seated unilateral row', 'MIDDLE TRAPS, LOWER TRAPS', 'PROGRESSIVE OVERLOAD'),
    (29, 'barbell deadlift', 'LUMBAR', 'PROGRESSIVE OVERLOAD'),
    (30, 'machine seated neutral grip horizontal row', 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET'),
    (31, 'dumbbell incline bench press', 'UPPER CHEST', 'STRAIGHT SET'),
    (32, 'barbell sumo squat', 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD'),
    (33, 'fire hydrant', 'MEDIUS GLUTEUS', 'STRAIGHT SET'),
    (34, 'wide stance leg press', 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD'),
    (35, 'band fire hydrant', 'MEDIUS GLUTEUS, ABDUCTOR', 'STRAIGHT SET'),
    (36, 'dumbbell alternate static backward lunges', 'GLUTES, ADDUCTOR', 'STRAIGHT SET'),
    (37, 'elliptical trainer', 'CARDIO', 'AEROBIC TRAINING'),
    (38, 'dumbbell arnold press', 'SHOULDER', 'STRAIGHT SET'),
    (39, 'dumbbell lateral raise', 'LATERAL DELTS', 'STRAIGHT SET'),
    (40, 'd handle rear delts horizontal pullback', NULL, NULL),
    (41, 'machine seated rear delts reverse fly', 'REAR DELTS', 'STRAIGHT SET'),
    (42, 'high pulley rope triceps extension', NULL, NULL),
    (43, 'low pulley bar biceps curl', 'BICEPS', 'SUPERSET'),
    (44, 'dumbbell hinge sumo squat', 'ADDUCTOR, GLUTES', 'STRAIGHT SET'),
    (45, 'dumbbell static backward lunges', 'MAXIMUS GLUTEUS', 'STRAIGHT SET'),
    (46, 'waking lunges', NULL, NULL),
    (47, 'dumbbell walking lunges', 'QUADS, GLUTES, ADDUCTOR', 'STRAIGHT SET'),
    (48, 'low pulley hdkb', 'MAXIMUS GLUTEUS', 'STRAIGHT SET'),
    (49, 'banded lying on the mat leg abduction', 'ABDUCTOR, ADDUCTOR', 'STRAIGHT SET'),
    (50, 'dumbbell banded bridge', NULL, NULL),
    (51, 'high pulley bar triceps pushdown', 'TRICEPS', 'STRAIGHT SET'),
    (52, 'low pulley biceps curl', NULL, NULL),
    (53, 'crunch', 'ABS, CORE', 'STRAIGHT SET'),
    (54, '3/4 sit-up', NULL, NULL),
    (55, 'low pulley abduction kb', 'MEDIUS GLUTEUS', 'STRAIGHT SET'),
    (56, 'plank', 'ABS, CORE', 'STRAIGHT SET'),
    (57, 'middle supinate grip lat pulldown', 'LATS', 'PROGRESSIVE OVERLOAD'),
    (58, 'dumbbell unilateral row', 'MIDDLE TRAPS', 'STRAIGHT SET'),
    (59, 'banded fire hydrant', 'MEDIUS GLUTEUS', 'STRAIGHT SET'),
    (60, 'banded pulsing fire hydrant', 'MEDIUS GLUTEUS', 'STRAIGHT SET'),
    (61, 'dumbbell sumo hinge squat', 'MEDIUS GLUTEUS, ABDUCTOR', 'STRAIGHT SET'),
    (62, 'dumbbell pull over', 'LATS', 'STRAIGHT SET'),
    (63, 'kneeling push-up', 'CHEST, TRICEPS, FRONT DELTS', 'STRAIGHT SET'),
    (64, 'barbell biceps curl', 'BICEPS', 'SUPERSET'),
    (65, 'machine simultaneous row', 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET'),
    (66, 'hdkb', 'MAXIMUS GLUTEUS', 'STRAIGHT SET'),
    (67, 'barbell clean and press', 'EXPLOSIVENESS, SHOULDER', 'SUPERSET'),
    (68, 'ergo bar horizontal pullback', 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET'),
    (69, 'attempting strict push-up', 'CHEST, TRICEPS, SHOULDERS', 'STRAIGHT SET'),
    (70, 'machine seated shoulder press', 'SHOULDERS', 'STRAIGHT SET'),
    (71, 'kettlebell simultaneous row', 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET'),
    (72, 'dumbbell rdl', 'HAMSTRING, GLUTES', 'STRAIGHT SET'),
    (73, 'stationary bike', 'CARDIO', 'AEROBIC TRAINING'),
    (74, 'dumbbell front raise', 'FRONT DELTS', 'STRAIGHT SET'),
    (75, 'high pulley rope triceps pushdown', 'TRICEPS', 'SUPERSET'),
    (76, 'freestyle battling ropes', 'ARMS, CORE', 'STRAIGHT SET'),
    (77, 'dumbbell walking lunges with leg extension', 'QUADS, GLUTES, ADDUCTOR', 'STRAIGHT SET'),
    (78, 'side crunch with to toe touch', 'OBLICS, CORE', 'STRAIGHT SET'),
    (79, 'dumbbell later raise', 'LATERAL DELTS', 'STRAIGHT SET'),
    (80, 'banded crab walk', 'MEDIUS GLUTEUS', 'STRAIGHT SET'),
    (81, 'strict push-up', 'CHEST, TRICEPS, FRONT DELTS', 'STRAIGHT SET'),
    (82, 'walking lunges', 'ADDUCTOR, GLUTES, QUADS', 'STRAIGHT SET'),
    (83, 'dumbbell triceps overhead extension', 'TRICEPS', 'SUPERSET'),
    (84, 'dumbbell biceps curl without rotation', 'BICEPS', 'SUPERSET'),
    (85, 'freestyle battling rope', 'ARMS, CORE', 'SUPERSET'),
    (86, 'bulgarian split squat', 'MAXIMUS GLUTEUS', 'STRAIGHT SET'),
    (87, 'close neutral grip lat pulldown', 'LAT', 'STRAIGHT SET'),
    (88, 'ergo bar neutral horizontal pullback', 'REAR DELTS', 'STRAIGHT SET'),
    (89, 'dumbbell overhead triceps extension', 'TRICEPS', 'STRAIGHT SET'),
    (90, 'kettlebell rdl', 'GLUTES, HAMSTRING', 'STRAIGHT SET'),
    (91, 'banded hdkb', 'MAXIMUS GLUTEUS', 'STRAIGHT SET'),
    (92, 'rope pullover', 'LATS', 'STRAIGHT SET'),
    (93, 'd handle horizontal double pullback', 'MIDDLE TRAPS', 'STRAIGHT SET'),
    (94, 'dumbbell hammer biceps curl', 'BICEPS, FOREARMS', 'CIRCUIT TRAINING'),
    (95, 'dumbbell overhead triceps', 'TRICEPS', 'CIRCUIT TRAINING'),
    (96, 'lying on the mat hip raise', 'LOWER ABS, CORE', 'STRAIGHT SET'),
    (97, 'lying on the mat toe touch sit-up', 'ABS, CORE', 'STRAIGHT SET'),
    (98, 'lower mobility training', 'MOBILITY', 'MOBILITY TRAINING'),
    (99, 'dumbbell pullover', 'LATS', 'STRAIGHT SET'),
    (100, 'high pulley v bar triceps pushdown', 'TRICEPS', 'SUPERSET'),
    (101, 'dumbbell static alternate backward lunges', 'QUADS, ADDUCTOR, GLUTES', 'STRAIGHT SET'),
    (102, 'pulsing fire hydrant', 'MEDIUS GLUTEUS', 'BISET'),
    (103, 'dumbbell alternate static lunges', NULL, 'STRAIGHT SET'),
    (104, 'dumbbell bent over simultaneous row', NULL, 'STRAIGHT SET'),
    (105, 'dumbbell seated shoulder press', NULL, NULL),
    (106, 'barbell hip thrust', 'MAXIMUS GLUTEUS', 'STRAIGHT SET'),
    (107, 'dumbbell bulgarian split squat', 'GLUTES, QUADS', 'STRAIGHT SET'),
    (108, 'dumbbell fire hydrant', 'MEDIUS GLUTEUS', 'STRAIGHT SET'),
    (109, 'high pulley v bar triceps extension', NULL, 'TRISET'),
    (110, 'hd pulsing kb', NULL, NULL),
    (111, 'dumbbell seated bent over rear delts reverse fly', NULL, NULL),
    (112, 'dumbbell bent over rear delts reverse fly', NULL, NULL),
    (113, 'wall squat', NULL, NULL),
    (114, 'hammer grip row', NULL, NULL),
    (115, 'd handle lat pulldown', NULL, NULL),
    (116, 'ergo grip horizontal pullback', NULL, NULL),
    (117, 'push-up', NULL, NULL),
    (118, 'machine hip', NULL, NULL);

-- Journal d'entraînement de client_x (67 séances, 507 lignes)
INSERT INTO seances (id, utilisateur_id, date_seance, nom_session) VALUES
    (1, 4, '2026-02-04', 'session 1'),
    (2, 4, '2026-02-06', 'session 2'),
    (3, 4, '2026-02-10', 'session 3'),
    (4, 4, '2026-02-17', 'session 4'),
    (5, 4, '2026-02-19', 'session 5'),
    (6, 4, '2026-02-20', 'session 6'),
    (7, 4, '2026-02-25', 'session 7'),
    (8, 4, '2026-02-26', 'session 8'),
    (9, 4, '2026-03-03', 'session 8'),
    (10, 4, '2026-03-05', 'session 8'),
    (11, 4, '2026-03-12', 'session 9'),
    (12, 4, '2026-03-14', 'session 10'),
    (13, 4, '2026-03-16', 'session 11'),
    (14, 4, '2026-03-17', 'session 12'),
    (15, 4, '2026-04-27', 'session 13'),
    (16, 4, '2026-04-28', 'session 14'),
    (17, 4, '2026-04-30', 'session 15'),
    (18, 4, '2026-05-04', 'session 1'),
    (19, 4, '2026-05-05', 'session 2'),
    (20, 4, '2026-05-07', 'session 3'),
    (21, 4, '2026-05-12', 'session 4'),
    (22, 4, '2026-05-14', 'session 5'),
    (23, 4, '2026-05-19', 'session 6'),
    (24, 4, '2026-05-20', 'session 7'),
    (25, 4, '2026-05-22', 'session 8'),
    (26, 4, '2026-05-26', 'session 9'),
    (27, 4, '2026-05-27', 'session 10'),
    (28, 4, '2026-05-29', 'session 11'),
    (29, 4, '2026-06-01', 'session 12'),
    (30, 4, '2026-06-02', 'session 13'),
    (31, 4, '2026-06-04', 'session 14'),
    (32, 4, '2026-06-08', 'session 15'),
    (33, 4, '2026-06-09', 'session 1'),
    (34, 4, '2026-06-11', 'session 2'),
    (35, 4, '2026-06-15', 'session 3'),
    (36, 4, '2026-06-16', 'session 4'),
    (37, 4, '2026-06-18', 'session 5'),
    (38, 4, '2026-06-25', 'session 6'),
    (39, 4, '2026-06-30', 'session 7'),
    (40, 4, '2026-07-02', 'session 8'),
    (41, 4, '2026-07-07', 'session 9'),
    (42, 4, '2026-07-09', 'session 10'),
    (43, 4, '2026-07-13', 'session 11'),
    (44, 4, '2026-07-14', 'session 12'),
    (45, 4, '2026-07-17', 'session 13'),
    (46, 4, '2026-07-21', 'session 14'),
    (47, 4, '2026-07-23', 'session 15'),
    (48, 4, '2026-07-27', 'session 1'),
    (49, 4, '2026-07-28', 'session 2'),
    (50, 4, '2026-07-21', 'session 3'),
    (51, 4, '2026-08-04', 'session 4'),
    (52, 4, '2026-08-07', 'session 5'),
    (53, 4, '2026-08-10', 'session 6'),
    (54, 4, '2026-08-11', 'session 7'),
    (55, 4, '2026-08-27', 'session 8'),
    (56, 4, '2026-08-31', 'session 9'),
    (57, 4, '2026-09-02', 'session 10'),
    (58, 4, '2026-09-03', 'session 11'),
    (59, 4, '2026-09-09', 'session 12'),
    (60, 4, '2026-09-10', 'session 13'),
    (61, 4, '2026-09-11', 'session 14'),
    (62, 4, '2026-09-15', 'session 15'),
    (63, 4, '2026-09-29', 'session 1'),
    (64, 4, '2026-09-30', 'session 2'),
    (65, 4, '2026-10-06', 'session 3'),
    (66, 4, '2026-09-15', 'session 4'),
    (67, 4, '2026-09-15', 'session 5');

INSERT INTO seance_exercices (seance_id, exercice_id, niveau, poids_kg, vitesse, repetitions, duree_secondes, series, repos_secondes, ordre, fait, cibles, methode, charge, rep_temps, infos) VALUES
    (1, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, FALSE, NULL, NULL, NULL, NULL, NULL),
    (1, 2, 'Lvl 2', NULL, NULL, 15, NULL, 3, NULL, 2, TRUE, 'CHEST', 'STRAIGHT SET', 'Lvl 2', '15', NULL),
    (1, 3, NULL, 4, NULL, 15, NULL, 3, NULL, 3, TRUE, 'CHEST', 'STRAIGHT SET', '4kg', '15', NULL),
    (1, 4, NULL, 4, NULL, 15, NULL, 3, NULL, 4, TRUE, 'SHOULDER', 'STRAIGHT SET', '4kg', '15', NULL),
    (1, 5, 'Lvl 2', NULL, NULL, 15, NULL, 3, NULL, 5, TRUE, 'MIDDLE TRAPS', 'STRAIGHT SET', 'Lvl 2', '15', NULL),
    (1, 6, 'Lvl 3', NULL, NULL, 15, NULL, 3, NULL, 6, TRUE, 'LATS', 'STRAIGHT SET', 'Lvl 3', '15', NULL),
    (1, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, NULL, NULL, NULL, NULL, NULL),
    (2, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, NULL, NULL, NULL, NULL, NULL),
    (2, 9, NULL, 4, NULL, 10, NULL, 3, NULL, 2, TRUE, 'ADDUCTOR, GLUTES', 'STRAIGHT SET', '4kg', '10', NULL),
    (2, 10, NULL, 20, NULL, 15, NULL, 3, NULL, 3, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', '20kg', '15', NULL),
    (2, 11, 'Lvl 4', NULL, NULL, 10, NULL, 3, NULL, 4, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 4', '10', NULL),
    (2, 12, NULL, NULL, NULL, 30, NULL, 3, NULL, 5, TRUE, 'ABDUCTOR, ADDUCTOR, MEDIUS GLUTEUS', 'STRAIGHT SET', 'hard band', '30', NULL),
    (2, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, NULL, NULL, NULL, NULL, NULL),
    (3, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, NULL, NULL),
    (3, 13, NULL, 10, NULL, 15, NULL, 2, NULL, 2, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '10kg', '15', NULL),
    (3, 13, NULL, 12, NULL, 12, NULL, 2, NULL, 3, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '12kg', '12', NULL),
    (3, 14, NULL, 4, NULL, 10, NULL, 4, NULL, 4, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', '4kg', '10', NULL),
    (3, 11, 'Lvl 5', NULL, NULL, 12, NULL, 2, NULL, 5, TRUE, 'MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 5', '12', NULL),
    (3, 11, 'Lvl 6', NULL, NULL, 10, NULL, 2, NULL, 6, TRUE, 'MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 6', '10', NULL),
    (3, 15, 'Lvl 2', NULL, NULL, 12, NULL, 4, NULL, 7, TRUE, 'HAMSTRING', 'STRAIGHT SET', 'Lvl 2', '12', NULL),
    (3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (4, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, NULL, NULL, NULL, NULL, NULL),
    (4, 16, 'Lvl 4', NULL, NULL, 10, NULL, 4, NULL, 2, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'Lvl 4', '10', NULL),
    (4, 11, 'Lvl 6', NULL, NULL, 10, NULL, 4, NULL, 3, TRUE, 'MEDIUS GLUTEUS, ABDUCTOR', 'STRAIGHT SET', 'Lvl 6', '10', NULL),
    (4, 17, NULL, 6, NULL, 12, NULL, 2, NULL, 4, TRUE, 'LUMBAR', 'PROGRESSIVE OVERLOAD', '6kg', '12', NULL),
    (4, 17, NULL, 8, NULL, 10, NULL, 2, NULL, 5, TRUE, 'LUMBAR', 'PROGRESSIVE OVERLOAD', '8kg', '10', NULL),
    (4, 18, NULL, 4, NULL, 7, NULL, 4, NULL, 6, TRUE, 'QUADS, BALANCE', 'STRAIGHT SET', '4kg', '7', NULL),
    (4, 19, NULL, NULL, NULL, 10, NULL, 3, NULL, 7, TRUE, 'CORE, ABS', 'STRAIGHT SET', 'bodyweight', '10', NULL),
    (4, 20, NULL, 10, NULL, 10, NULL, 3, NULL, 8, TRUE, 'OBLICS, CORE', 'STRAIGHT SET', '10kg', '10', NULL),
    (4, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (5, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, NULL, NULL, NULL, NULL, NULL),
    (5, 21, 'Lvl 3', NULL, NULL, 15, NULL, 4, NULL, 2, TRUE, 'LATS, MIDDLE TRAPS', 'STRAIGHT SET', 'Lvl 3', '15', NULL),
    (5, 5, 'Lvl 3', NULL, NULL, 15, NULL, 4, NULL, 3, TRUE, 'MIDDLE TRAPS, LOWER TRAPS, RHOMBOID', 'STRAIGHT SET', 'Lvl 3', '15', NULL),
    (5, 22, NULL, NULL, NULL, 15, NULL, 4, NULL, 4, TRUE, 'SHOULDER', 'STRAIGHT SET', 'machine', '15', NULL),
    (5, 23, NULL, 2, NULL, 15, NULL, 4, NULL, 5, TRUE, 'TRICEPS', 'STRAIGHT SET', '2kg', '15', NULL),
    (5, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (6, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, NULL, NULL, NULL, NULL, NULL),
    (6, 24, NULL, 20, NULL, 15, NULL, 4, NULL, 2, TRUE, 'LUMBAR', 'SUPERSET', 'OB 20kg', '15', NULL),
    (6, 25, NULL, NULL, NULL, NULL, 20, 4, NULL, 3, TRUE, 'STAMINA, ARMS, SHOULDER', 'SUPERSET', 'rope', '20sec', NULL),
    (6, 26, NULL, 6, NULL, 10, NULL, 4, NULL, 4, TRUE, 'SHOULDER, LUMBAR', 'SUPERSET', '6kg', '10', NULL),
    (6, 25, NULL, NULL, NULL, NULL, 20, 4, NULL, 5, TRUE, 'STAMINA, ARMS, SHOULDER', 'SUPERSET', 'rope', '20sec', NULL),
    (6, 27, NULL, 16, NULL, 10, NULL, 4, NULL, 6, TRUE, 'SHOULDER, LUMBAR, CORE', 'SUPERSET', '16kg', '10', NULL),
    (6, 25, NULL, NULL, NULL, NULL, 20, 4, NULL, 7, TRUE, 'STAMINA, ARMS, SHOULDER', 'SUPERSET', 'rope', '20sec', NULL),
    (6, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (7, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, NULL, NULL, NULL, '15mn', NULL),
    (7, 28, 'Lvl 3', NULL, NULL, 15, NULL, 2, NULL, 2, TRUE, 'MIDDLE TRAPS, LOWER TRAPS', 'PROGRESSIVE OVERLOAD', 'Lvl 3', '15', NULL),
    (7, 28, 'Lvl 4', NULL, NULL, 12, NULL, 2, NULL, 3, TRUE, 'MIDDLE TRAPS, LOWER TRAPS', 'PROGRESSIVE OVERLOAD', 'Lvl 4', '12', NULL),
    (7, 28, 'Lvl 5', NULL, NULL, 10, NULL, 2, NULL, 4, TRUE, 'MIDDLE TRAPS, LOWER TRAPS', 'PROGRESSIVE OVERLOAD', 'Lvl 5', '10', NULL),
    (7, 5, 'Lvl 3', NULL, NULL, 10, NULL, 4, NULL, 5, TRUE, 'MIDDLE TRAPS, LOWER TRAPS L', 'STRAIGHT SET', 'Lvl 3', '10', NULL),
    (7, 6, 'Lvl 4', NULL, NULL, 8, NULL, 1, NULL, 6, TRUE, 'LATS', 'PROGRESSIVE OVERLOAD', 'Lvl 4', '8', 'trop lourde'),
    (7, 6, 'Lvl 3', NULL, NULL, 10, NULL, 3, NULL, 7, TRUE, 'LATS', 'PROGRESSIVE OVERLOAD', 'Lvl 3', '10', NULL),
    (7, 29, NULL, 20, NULL, 10, NULL, 6, NULL, 8, TRUE, 'LUMBAR', 'STRAIGHT SET', 'OB 20kg', '10', NULL),
    (7, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (8, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, NULL, NULL, NULL, '15mn', NULL),
    (8, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2, TRUE, 'CARDIO', 'AEROBIC TRAINING', NULL, NULL, NULL),
    (8, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (9, 30, 'Lvl 5', NULL, NULL, 12, NULL, 4, NULL, 1, TRUE, 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET', 'Lvl 5', '12', NULL),
    (9, 31, NULL, 4, NULL, 15, NULL, 2, NULL, 2, TRUE, 'UPPER CHEST', 'STRAIGHT SET', '4kg', '15', NULL),
    (9, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, TRUE, 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET', NULL, NULL, NULL),
    (9, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 4, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (10, 1, NULL, NULL, NULL, NULL, 300, NULL, NULL, 1, TRUE, NULL, NULL, NULL, '5mn', NULL),
    (10, 32, NULL, 20, NULL, 10, NULL, 4, NULL, 2, TRUE, 'ADDUCTOR, GLUTES', 'STRAIGHT SET', 'OB 20kg', '10', NULL),
    (10, 11, 'Lvl 6', NULL, NULL, 12, NULL, 2, NULL, 3, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 6', '12', NULL),
    (10, 11, 'Lvl 7', NULL, NULL, 10, NULL, 2, NULL, 4, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 7', '10', NULL),
    (10, 11, 'Lvl 8', NULL, NULL, 8, NULL, 2, NULL, 5, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 8', '8', NULL),
    (10, 33, NULL, NULL, NULL, 30, NULL, 4, NULL, 6, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'bodyweight', '30', NULL),
    (10, 34, NULL, NULL, NULL, 10, NULL, 1, NULL, 7, TRUE, 'ADDUCTOR, GLUTES, HAMSTRING', 'PROGRESSIVE OVERLOAD', 'leg press', '10', NULL),
    (10, 34, NULL, 20, NULL, 10, NULL, 4, NULL, 8, TRUE, 'ADDUCTOR, GLUTES, HAMSTRING', 'PROGRESSIVE OVERLOAD', '20kg', '10', 'dossier incliné à niveau 1, placement des pieds pas trop écarté'),
    (10, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (11, 1, NULL, NULL, NULL, NULL, 300, NULL, NULL, 1, TRUE, NULL, NULL, NULL, '5mn', NULL),
    (11, 34, NULL, NULL, NULL, 15, NULL, 1, NULL, 2, TRUE, 'ADDUCTOR, HAMSTRING, GLUTES', 'PROGRESSIVE OVERLOAD', 'leg press', '15', NULL),
    (11, 34, NULL, 20, NULL, 12, NULL, 4, NULL, 3, TRUE, 'ADDUCTOR, HAMSTRING, GLUTES', 'PROGRESSIVE OVERLOAD', '20kg', '12', NULL),
    (11, 16, 'Lvl 4', NULL, NULL, 12, NULL, 4, NULL, 4, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'Lvl 4', '12', NULL),
    (11, 11, 'Lvl 6', NULL, NULL, 12, NULL, 4, NULL, 5, TRUE, 'MEDIUS GLUTEUS, ABDUCTOR', 'STRAIGHT SET', 'Lvl 6', '12', 'BUSTE PENCHÉ'),
    (11, 11, 'Lvl 6', NULL, NULL, 12, NULL, 4, NULL, 6, TRUE, 'MEDIUS GLUTEUS, ABDUCTOR', 'STRAIGHT SET', 'Lvl 6', '12', 'BUSTE DROIT'),
    (11, 8, NULL, NULL, 5, NULL, NULL, NULL, NULL, 7, TRUE, 'CARDIO', 'AEROBIC TRAINING', 'speed 5/ incline 10%', NULL, 'Nordic walk'),
    (11, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (12, 1, NULL, NULL, NULL, NULL, 300, NULL, NULL, 1, TRUE, NULL, NULL, NULL, '5mn', NULL),
    (12, 32, NULL, 10, NULL, 15, NULL, 4, NULL, 2, TRUE, 'ADDUCTOR, GLUTES', 'STRAIGHT SET', '10kg', '15', NULL),
    (12, 35, NULL, NULL, NULL, 20, NULL, 4, NULL, 3, TRUE, 'MEDIUS GLUTEUS, ABDUCTOR', 'STRAIGHT SET', 'light band', '20', NULL),
    (12, 36, NULL, 6, NULL, 10, NULL, 6, NULL, 4, TRUE, 'GLUTES, ADDUCTOR', 'STRAIGHT SET', '6kg', '10', 'FOOT PLACEMENT'),
    (12, 37, NULL, NULL, NULL, NULL, 1800, 1, NULL, 5, TRUE, 'CARDIO', 'AEROBIC TRAINING', 'RPM + 55', '30mn', NULL),
    (12, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (13, 1, NULL, NULL, NULL, NULL, 300, NULL, NULL, 1, TRUE, NULL, NULL, NULL, '5mn', NULL),
    (13, 38, NULL, 4, NULL, 15, NULL, 2, NULL, 2, TRUE, 'SHOULDER', NULL, '4kg', '15', NULL),
    (13, 38, NULL, 6, NULL, 12, NULL, 1, NULL, 3, TRUE, 'SHOULDER', NULL, '6kg', '12', NULL),
    (13, 39, NULL, 2, NULL, 15, NULL, 3, NULL, 4, TRUE, 'LATERAL', NULL, '2kg', '15', NULL),
    (13, 40, 'Lvl 2', NULL, NULL, 12, NULL, 3, NULL, 5, TRUE, NULL, NULL, 'Lvl 2', '12', NULL),
    (13, 41, 'Lvl 2', NULL, NULL, 12, NULL, 3, NULL, 6, TRUE, NULL, NULL, 'Lvl 2', '12', NULL),
    (13, 42, 'Lvl 2', NULL, NULL, 15, NULL, 3, NULL, 7, TRUE, NULL, NULL, 'Lvl 2', '15', NULL),
    (13, 43, 'Lvl 2', NULL, NULL, 15, NULL, 3, NULL, 8, TRUE, NULL, NULL, 'Lvl 2', '15', NULL),
    (13, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (14, 1, NULL, NULL, NULL, NULL, 300, NULL, NULL, 1, TRUE, NULL, NULL, NULL, '5mn', NULL),
    (14, 44, NULL, 18, NULL, 15, NULL, 2, NULL, 2, TRUE, NULL, NULL, '18kg', '15', NULL),
    (14, 44, NULL, 20, NULL, 12, NULL, 2, NULL, 3, TRUE, NULL, NULL, '20kg', '12', NULL),
    (14, 44, NULL, 24, NULL, 10, NULL, 2, NULL, 4, TRUE, NULL, NULL, '24kg', '10', NULL),
    (14, 16, 'Lvl 4', NULL, NULL, 12, NULL, 2, NULL, 5, TRUE, NULL, NULL, 'Lvl 4', '12', NULL),
    (14, 16, 'Lvl 5', NULL, NULL, 12, NULL, 2, NULL, 6, TRUE, NULL, NULL, 'Lvl 5', '12', NULL),
    (14, 15, 'Lvl 3', NULL, NULL, 12, NULL, 4, NULL, 7, TRUE, NULL, NULL, 'Lvl 3', '12', NULL),
    (14, 45, NULL, 6, NULL, 10, NULL, 3, NULL, 8, TRUE, NULL, NULL, '6kg', '10', NULL),
    (14, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (15, 1, NULL, NULL, NULL, NULL, 300, NULL, NULL, 1, TRUE, NULL, NULL, NULL, '5mn', NULL),
    (15, 46, NULL, NULL, NULL, NULL, NULL, 1, NULL, 2, TRUE, NULL, NULL, 'bodyweight', NULL, NULL),
    (15, 47, NULL, 6, NULL, NULL, NULL, 3, NULL, 3, TRUE, NULL, NULL, '6kg', NULL, NULL),
    (15, 48, 'Lvl 2', NULL, NULL, 15, NULL, 3, NULL, 4, TRUE, NULL, NULL, 'Lvl 2', '15', NULL),
    (15, 49, NULL, NULL, NULL, 20, NULL, 3, NULL, 5, TRUE, NULL, NULL, 'heavy band', '20', NULL),
    (15, 50, NULL, NULL, NULL, 10, NULL, 3, NULL, 6, TRUE, NULL, NULL, 'heavy band', '10', NULL),
    (15, 11, 'Lvl 6', NULL, NULL, 10, NULL, 3, NULL, 7, TRUE, NULL, NULL, 'Lvl 6', '10', NULL),
    (15, 8, NULL, NULL, 5, NULL, NULL, NULL, NULL, 8, TRUE, NULL, NULL, 'speed 5', NULL, NULL),
    (15, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (16, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (16, 51, 'Lvl 3', NULL, NULL, 15, NULL, 2, NULL, 2, TRUE, NULL, NULL, 'Lvl 3', '15', NULL),
    (16, 51, 'Lvl 4', NULL, NULL, 15, NULL, 2, NULL, 3, TRUE, NULL, NULL, 'Lvl 4', '15', NULL),
    (16, 52, 'Lvl 3', NULL, NULL, 15, NULL, 2, NULL, 4, TRUE, NULL, NULL, 'Lvl 3', '15', NULL),
    (16, 52, 'Lvl 4', NULL, NULL, 15, NULL, 2, NULL, 5, TRUE, NULL, NULL, 'Lvl 4', '15', NULL),
    (16, 25, NULL, NULL, NULL, NULL, 30, 3, NULL, 6, TRUE, NULL, NULL, 'rope', '30sec', NULL),
    (16, 53, NULL, NULL, NULL, 30, NULL, 3, NULL, 7, TRUE, NULL, NULL, 'bodyweight', '30', NULL),
    (16, 54, NULL, NULL, NULL, 10, NULL, 3, NULL, 8, TRUE, NULL, NULL, 'bodyweight', '10', NULL),
    (16, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (17, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, NULL, NULL),
    (17, 13, NULL, 10, NULL, 15, NULL, 2, NULL, 2, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '10kg', '15', NULL),
    (17, 13, NULL, 12, NULL, 12, NULL, 2, NULL, 3, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '12kg', '12', NULL),
    (17, 14, NULL, 4, NULL, 10, NULL, 4, NULL, 4, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', '4kg', '10', NULL),
    (17, 11, 'Lvl 5', NULL, NULL, 12, NULL, 2, NULL, 5, TRUE, 'MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 5', '12', NULL),
    (17, 11, 'Lvl 6', NULL, NULL, 10, NULL, 2, NULL, 6, TRUE, 'MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 6', '10', NULL),
    (17, 15, 'Lvl 2', NULL, NULL, 12, NULL, 4, NULL, 7, TRUE, 'HAMSTRING', 'STRAIGHT SET', 'Lvl 2', '12', NULL),
    (17, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (18, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, NULL, NULL),
    (18, 16, 'Lvl 5', NULL, NULL, 12, NULL, 4, NULL, 2, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'Lvl 5', '12', NULL),
    (18, 11, 'Lvl 6', NULL, NULL, 12, NULL, 4, NULL, 3, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 6', '12', NULL),
    (18, 36, NULL, 6, NULL, 10, NULL, 4, NULL, 4, TRUE, 'ADDUCTOR, GLUTES', 'STRAIGHT SET', '6kg', '10', NULL),
    (18, 55, 'Lvl 2', NULL, NULL, 10, NULL, 4, NULL, 5, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 2', '10', NULL),
    (18, 56, NULL, NULL, NULL, NULL, 30, 4, NULL, 6, TRUE, 'ABS, CORE', 'STRAIGHT SET', 'bodyweight', '30sec', NULL),
    (18, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (19, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, NULL, NULL),
    (19, 21, 'Lvl 3', NULL, NULL, 15, NULL, 2, NULL, 2, TRUE, 'LATS, MIDDLE TRAPS', 'PROGRESSIVE OVERLOAD', 'Lvl 3', '15', NULL),
    (19, 21, 'Lvl 4', NULL, NULL, 10, NULL, 2, NULL, 3, TRUE, 'LATS, MIDDLE TRAPS', 'PROGRESSIVE OVERLOAD', 'Lvl 4', '10', NULL),
    (19, 57, 'Lvl 2', NULL, NULL, 15, NULL, 2, NULL, 4, TRUE, 'LATS', 'PROGRESSIVE OVERLOAD', 'Lvl 2', '15', NULL),
    (19, 57, 'Lvl 3', NULL, NULL, 12, NULL, 2, NULL, 5, TRUE, 'LATS', 'PROGRESSIVE OVERLOAD', 'Lvl 3', '12', NULL),
    (19, 58, NULL, 6, NULL, 10, NULL, 4, NULL, 6, TRUE, 'MIDDLE TRAPS', 'STRAIGHT SET', '6kg', '10', NULL),
    (19, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (20, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, NULL, NULL),
    (20, 15, 'Lvl 3', NULL, NULL, 12, NULL, 4, NULL, 2, TRUE, 'HAMSTRING', 'STRAIGHT SET', 'Lvl 3', '12', NULL),
    (20, 48, 'Lvl 3', NULL, NULL, 12, NULL, 4, NULL, 3, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'Lvl 3', '12', NULL),
    (20, 59, NULL, NULL, NULL, 12, NULL, 4, NULL, 4, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'medium band', '12', NULL),
    (20, 60, NULL, NULL, NULL, 20, NULL, 3, NULL, 5, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'medium band', '20', NULL),
    (20, 11, 'Lvl 5', NULL, NULL, 12, NULL, 4, NULL, 6, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 5', '12', NULL),
    (20, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (21, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, NULL, NULL),
    (21, 16, 'Lvl 5', NULL, NULL, 12, NULL, 3, NULL, 2, TRUE, 'MAXIMUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 5', '12', NULL),
    (21, 16, 'Lvl 6', NULL, NULL, 10, NULL, 1, NULL, 3, TRUE, 'MAXIMUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 6', '10', NULL),
    (21, 61, NULL, 16, NULL, 12, NULL, 4, NULL, 4, TRUE, 'MEDIUS GLUTEUS, ABDUCTOR', 'STRAIGHT SET', '16kg', '12', NULL),
    (21, 55, 'Lvl 2', NULL, NULL, 12, NULL, 4, NULL, 5, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 2', '12', NULL),
    (21, 59, NULL, NULL, NULL, 12, NULL, 4, NULL, 6, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'medium band', '12', NULL),
    (21, 49, NULL, NULL, NULL, NULL, NULL, 4, NULL, 7, TRUE, 'ABDUCTOR, ADDUCTOR', 'STRAIGHT SET', 'medium band', '15/15', 'full ROM vs pulsing'),
    (21, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (22, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (22, 62, NULL, 6, NULL, 12, NULL, 2, NULL, 2, TRUE, 'LATS', 'STRAIGHT SET', '6kg', '12', NULL),
    (22, 62, NULL, 8, NULL, 10, NULL, 2, NULL, 3, TRUE, 'LATS', 'STRAIGHT SET', '8kg', '10', NULL),
    (22, 58, NULL, 10, NULL, 12, NULL, 4, NULL, 4, TRUE, 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET', '10kg', '12', NULL),
    (22, 4, NULL, 6, NULL, 12, NULL, 4, NULL, 5, TRUE, 'SHOULDER', 'STRAIGHT SET', '6kg', '12', NULL),
    (22, 39, NULL, 2, NULL, 12, NULL, 2, NULL, 6, TRUE, 'LATERAL DELTS', 'STRAIGHT SET', '2kg', '12', NULL),
    (22, 39, NULL, 4, NULL, 8, NULL, 2, NULL, 7, TRUE, 'LATERAL DELTS', 'STRAIGHT SET', '4kg', '8', NULL),
    (22, 63, NULL, NULL, NULL, 10, NULL, 4, NULL, 8, TRUE, 'CHEST, TRICEPS, FRONT DELTS', 'STRAIGHT SET', 'bodyweight', '10', NULL),
    (22, 23, NULL, 4, NULL, 15, NULL, 3, NULL, 9, TRUE, 'TRICEPS', 'SUPERSET', '4kg', '15', 'Deux exercices à faire en simultané. Une série sur les biceps et une série sur les triceps puis pause.'),
    (22, 64, NULL, NULL, NULL, 15, NULL, 3, NULL, 10, TRUE, 'BICEPS', 'SUPERSET', 'barre', '15', NULL),
    (22, 56, NULL, NULL, NULL, NULL, 60, 3, NULL, 11, TRUE, 'ABS, CORE', 'STRAIGHT SET', 'bodyweight', '1mn', NULL),
    (22, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 12, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (23, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (23, 44, NULL, 16, NULL, 15, NULL, 2, NULL, 2, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '16kg', '15', NULL),
    (23, 44, NULL, 18, NULL, 12, NULL, 2, NULL, 3, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '18kg', '12', NULL),
    (23, 55, 'Lvl 2', NULL, NULL, 12, NULL, 4, NULL, 4, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 2', '12', NULL),
    (23, 11, 'Lvl 6', NULL, NULL, 10, NULL, 3, NULL, 5, TRUE, 'MEDIUS GLUTEUS, ADDUCTOR, ABDUCTOR', 'SUPERSET', 'Lvl 6', '10', NULL),
    (23, 11, 'Lvl 6', NULL, NULL, 10, NULL, 3, NULL, 6, TRUE, 'MEDIUS GLUTEUS, ADDUCTOR, ABDUCTOR', 'SUPERSET', 'Lvl 6', '10', 'full + half'),
    (23, 8, NULL, NULL, 5, NULL, 1200, NULL, NULL, 7, TRUE, 'CARDIO', 'AEROBIC TRAINING', 'speed 5', '20mn', NULL),
    (23, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (24, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (24, 6, 'Lvl 3', NULL, NULL, 15, NULL, 2, NULL, 2, TRUE, 'LATS', 'PROGRESSIVE OVERLOAD', 'Lvl 3', '15', NULL),
    (24, 6, 'Lvl 4', NULL, NULL, 10, NULL, 2, NULL, 3, TRUE, 'LATS', 'PROGRESSIVE OVERLOAD', 'Lvl 4', '10', NULL),
    (24, 5, 'Lvl 3', NULL, NULL, 15, NULL, 3, NULL, 4, TRUE, 'MIDDLE TRAPS', 'PROGRESSIVE OVERLOAD', 'Lvl 3', '15', NULL),
    (24, 5, 'Lvl 2', NULL, NULL, 15, NULL, 3, NULL, 5, TRUE, 'MIDDLE TRAPS', 'PROGRESSIVE OVERLOAD', 'Lvl 2', '15', NULL),
    (24, 29, NULL, 20, NULL, 15, NULL, 4, NULL, 6, TRUE, 'LUMBAR', 'STRAIGHT SET', 'OB 20kg', '15', NULL),
    (24, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (25, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (25, 32, NULL, 20, NULL, 15, NULL, 1, NULL, 2, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', 'OB 20kg', '15', NULL),
    (25, 32, NULL, 30, NULL, 12, NULL, 5, NULL, 3, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', 'OB 20kg + 10kg', '12', NULL),
    (25, 34, NULL, 20, NULL, 15, NULL, 2, NULL, 4, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '20kg', '15', NULL),
    (25, 34, NULL, 30, NULL, 12, NULL, 2, NULL, 5, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '30kg', '12', NULL),
    (25, 55, 'Lvl 2', NULL, NULL, 12, NULL, 4, NULL, 6, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 2', '12', NULL),
    (25, 11, 'Lvl 5', NULL, NULL, 10, NULL, 1, NULL, 7, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 5', '10', NULL),
    (25, 11, 'Lvl 6', NULL, NULL, 10, NULL, 1, NULL, 8, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 6', '10', NULL),
    (25, 11, 'Lvl 7', NULL, NULL, 10, NULL, 1, NULL, 9, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 7', '10', NULL),
    (25, 11, 'Lvl 8', NULL, NULL, 10, NULL, 1, NULL, 10, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 8', '10', NULL),
    (25, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 11, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (26, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (26, 63, NULL, NULL, NULL, 10, NULL, 4, NULL, 2, TRUE, 'CHEST, TRICEPS, FRONT DELTS', 'STRAIGHT SET', 'bodyweight', '10', NULL),
    (26, 58, NULL, 8, NULL, 12, NULL, 2, NULL, 3, TRUE, 'MIDDLE TRAPS', 'PROGRESSIVE OVERLOAD', '8kg', '12', NULL),
    (26, 58, NULL, 10, NULL, 10, NULL, 2, NULL, 4, TRUE, 'MIDDLE TRAPS', 'PROGRESSIVE OVERLOAD', '10kg', '10', NULL),
    (26, 65, 'Lvl 5', NULL, NULL, 10, NULL, 4, NULL, 5, TRUE, 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET', 'Lvl 5', '10', NULL),
    (26, 21, 'Lvl 2', NULL, NULL, 15, NULL, 2, NULL, 6, TRUE, 'LATS, LOWER TRAPS', 'PROGRESSIVE OVERLOAD', 'Lvl 2', '15', NULL),
    (26, 21, 'Lvl 3', NULL, NULL, 12, NULL, 2, NULL, 7, TRUE, 'LATS, LOWER TRAPS', 'PROGRESSIVE OVERLOAD', 'Lvl 3', '12', NULL),
    (26, 21, 'Lvl 4', NULL, NULL, 10, NULL, 2, NULL, 8, TRUE, 'LATS, LOWER TRAPS', 'PROGRESSIVE OVERLOAD', 'Lvl 4', '10', NULL),
    (26, 29, NULL, 20, NULL, 15, NULL, 1, NULL, 9, TRUE, 'LUMBAR', 'PROGRESSIVE OVERLOAD', 'OB 20kg', '15', NULL),
    (26, 29, NULL, 40, NULL, 10, NULL, 1, NULL, 10, TRUE, 'LUMBAR', 'PROGRESSIVE OVERLOAD', 'OB 20kg + 20kg', '10', NULL),
    (26, 29, NULL, 35, NULL, 10, NULL, 1, NULL, 11, TRUE, 'LUMBAR', 'PROGRESSIVE OVERLOAD', 'OB 20kg + 15kg', '10', NULL),
    (26, 29, NULL, 30, NULL, 10, NULL, 2, NULL, 12, TRUE, 'LUMBAR', 'PROGRESSIVE OVERLOAD', 'OB 20kg + 10kg', '10', NULL),
    (26, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 13, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (27, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (27, 66, NULL, NULL, NULL, 20, NULL, 4, NULL, 2, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'bodyweight', '20', NULL),
    (27, 47, NULL, 6, NULL, NULL, NULL, 4, NULL, 3, TRUE, 'QUADS, GLUTES, ADDUCTOR', 'STRAIGHT SET', '6kg', NULL, NULL),
    (27, 44, NULL, 20, NULL, 12, NULL, 4, NULL, 4, TRUE, 'GLUTES, ADDUCTOR', 'STRAIGHT SET', '20kg', '12', NULL),
    (27, 10, NULL, 30, NULL, 12, NULL, 4, NULL, 5, TRUE, 'MAXIMUS GLUTES', 'STRAIGHT SET', '30kg', '12', NULL),
    (27, 59, NULL, NULL, NULL, 20, NULL, 4, NULL, 6, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'medium band', '20', NULL),
    (27, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (28, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (28, 67, NULL, NULL, NULL, 10, NULL, 4, NULL, 2, TRUE, 'EXPLOSIVENESS, SHOULDER', 'SUPERSET', 'OB 10', '10', NULL),
    (28, 38, NULL, 6, NULL, 10, NULL, 4, NULL, 3, TRUE, 'SHOULDER', 'SUPERSET', '6kg', '10', NULL),
    (28, 39, NULL, 4, NULL, 10, NULL, 4, NULL, 4, TRUE, 'LATERAL DELTS', 'STRAIGHT SET', '4kg', '10', NULL),
    (28, 41, 'Lvl 3', NULL, NULL, 10, NULL, 4, NULL, 5, TRUE, 'REAR DELTS', 'STRAIGHT SET', 'Lvl 3', '10', NULL),
    (28, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (29, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (29, 6, 'Lvl 3', NULL, NULL, 15, NULL, 3, NULL, 2, TRUE, 'LATS', 'STRAIGHT SET', 'Lvl 3', '15', NULL),
    (29, 68, 'Lvl 3', NULL, NULL, 15, NULL, 3, NULL, 3, TRUE, 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET', 'Lvl 3', '15', NULL),
    (29, 58, NULL, 8, NULL, 15, NULL, 3, NULL, 4, TRUE, 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET', '8kg', '15', NULL),
    (29, 41, 'Lvl 3', NULL, NULL, 15, NULL, 3, NULL, 5, TRUE, 'REAR DELTS', 'STRAIGHT SET', 'Lvl 3', '15', NULL),
    (29, 39, NULL, 4, NULL, 15, NULL, 3, NULL, 6, TRUE, 'LATERAL DELTS', 'STRAIGHT SET', '4kg', '15', NULL),
    (29, 8, NULL, NULL, 5, NULL, 2700, 1, NULL, 7, TRUE, 'CARDIO', 'AEROBIC TRAINING', 'incline 6/ speed 5', '45mn', NULL),
    (29, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (30, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (30, 47, NULL, 6, NULL, NULL, NULL, 2, NULL, 2, TRUE, 'QUADS, ADDUCTOR, GLUTES', 'STRAIGHT SET', '6kg', NULL, NULL),
    (30, 16, 'Lvl 6', NULL, NULL, 15, NULL, 2, NULL, 3, TRUE, 'MAXIMUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 6', '15', NULL),
    (30, 16, NULL, NULL, NULL, 12, NULL, 2, NULL, 4, TRUE, 'MAXIMUS GLUTEUS', 'PROGRESSIVE OVERLOAD', NULL, '12', NULL),
    (30, 34, NULL, 30, NULL, 15, NULL, 2, NULL, 5, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '30kg', '15', NULL),
    (30, 34, NULL, 35, NULL, 12, NULL, 2, NULL, 6, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '35kg', '12', NULL),
    (30, 34, NULL, 40, NULL, 10, NULL, 2, NULL, 7, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', '40kg', '10', NULL),
    (30, 55, 'Lvl 2', NULL, NULL, 10, NULL, 4, NULL, 8, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 2', '10', NULL),
    (30, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (31, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (31, 69, NULL, NULL, NULL, 5, NULL, 3, NULL, 2, TRUE, 'CHEST, TRICEPS, SHOULDERS', 'STRAIGHT SET', 'bodyweight', '5', NULL),
    (31, 70, NULL, NULL, NULL, 10, NULL, 4, NULL, 3, TRUE, 'SHOULDERS', 'STRAIGHT SET', 'bodyweight', '10', NULL),
    (31, 71, NULL, 12, NULL, 10, NULL, 4, NULL, 4, TRUE, 'MIDDLE TRAPS, LOWER TRAPS', 'STRAIGHT SET', '12kg', '10', NULL),
    (31, 72, NULL, 12, NULL, 10, NULL, 4, NULL, 5, TRUE, 'LUMBAR, GLUTES', 'STRAIGHT SET', '12kg', '10', NULL),
    (31, 11, 'Lvl 6', NULL, NULL, 10, NULL, 4, NULL, 6, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 6', '10', NULL),
    (31, 44, NULL, 24, NULL, 10, NULL, 4, NULL, 7, TRUE, 'GLUTES, ADDUCTOR', 'STRAIGHT SET', '24kg', '10', NULL),
    (31, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (32, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (32, 47, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2, TRUE, NULL, NULL, NULL, NULL, NULL),
    (32, 55, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, TRUE, NULL, NULL, NULL, NULL, NULL),
    (32, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 4, TRUE, NULL, NULL, NULL, NULL, NULL),
    (32, 73, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5, TRUE, NULL, NULL, NULL, NULL, NULL),
    (32, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (33, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, NULL, NULL),
    (33, 4, NULL, 4, NULL, 15, NULL, 2, NULL, 2, TRUE, 'SHOULDER', 'PROGRESSIVE OVERLOAD', '4kg', '15', NULL),
    (33, 4, NULL, 6, NULL, 12, NULL, 2, NULL, 3, TRUE, 'SHOULDER', 'PROGRESSIVE OVERLOAD', '6kg', '12', NULL),
    (33, 39, NULL, 2, NULL, 15, NULL, 4, NULL, 4, TRUE, 'LATERAL DELTS', 'STRAIGHT SET', '2kg', '15', NULL),
    (33, 74, NULL, 6, NULL, 15, NULL, 4, NULL, 5, TRUE, 'FRONT DELTS', 'STRAIGHT SET', '6kg', '15', NULL),
    (33, 41, 'Lvl 3', NULL, NULL, 15, NULL, 2, NULL, 6, TRUE, 'REAR DELTS', 'STRAIGHT SET', 'Lvl 3', '15', NULL),
    (33, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (34, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (34, 75, 'Lvl 2', NULL, NULL, 15, NULL, 6, NULL, 2, TRUE, 'TRICEPS', 'SUPERSET', 'Lvl 2', '15', NULL),
    (34, 43, 'Lvl 2', NULL, NULL, 10, NULL, 6, NULL, 3, TRUE, 'BICEPS', 'SUPERSET', 'Lvl 2', '10', NULL),
    (34, 76, NULL, NULL, NULL, NULL, 30, 4, NULL, 4, TRUE, 'ARMS, CORE', 'STRAIGHT SET', 'rope', '30sec', NULL),
    (34, 20, NULL, 16, NULL, 10, NULL, 4, NULL, 5, TRUE, 'OBLICS, CORE', 'STRAIGHT SET', '16kg', '10', NULL),
    (34, 73, NULL, NULL, NULL, NULL, 1800, 1, NULL, 6, TRUE, 'CARDIO', 'AEROBIC TRAINING', NULL, '30mn', NULL),
    (34, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (35, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (35, 77, NULL, 6, NULL, NULL, NULL, 3, NULL, 2, TRUE, 'QUADS, GLUTES, ADDUCTOR', 'STRAIGHT SET', '6kg', NULL, NULL),
    (35, 55, 'Lvl 2', NULL, NULL, 10, NULL, 6, NULL, 3, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 2', '10', NULL),
    (35, 11, 'Lvl 6', NULL, NULL, 10, NULL, 4, NULL, 4, TRUE, 'MEDIUS GLUTEUS, ABDUCTOR', 'STRAIGHT SET', 'Lvl 6', '10', 'full/half'),
    (35, 16, 'Lvl 5', NULL, NULL, 12, NULL, 4, NULL, 5, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'Lvl 5', '12', NULL),
    (35, 73, NULL, NULL, NULL, NULL, 1200, 1, NULL, 6, TRUE, 'CARDIO', 'AEROBIC TRAINING', NULL, '20mn', NULL),
    (35, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (36, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (36, 75, 'Lvl 2', NULL, NULL, 15, NULL, 6, NULL, 2, TRUE, 'TRICEPS', 'SUPERSET', 'Lvl 2', '15', NULL),
    (36, 43, 'Lvl 2', NULL, NULL, 10, NULL, 6, NULL, 3, TRUE, 'BICEPS', 'SUPERSET', 'Lvl 2', '10', NULL),
    (36, 76, NULL, NULL, NULL, NULL, 30, 4, NULL, 4, TRUE, 'ARMS, CORE', 'STRAIGHT SET', 'rope', '30sec', NULL),
    (36, 20, NULL, 16, NULL, 10, NULL, 4, NULL, 5, TRUE, 'OBLICS, CORE', 'STRAIGHT SET', '16kg', '10', NULL),
    (36, 78, NULL, NULL, NULL, 20, NULL, 4, NULL, 6, TRUE, 'OBLICS, CORE', 'STRAIGHT SET', 'bodyweight', '20', NULL),
    (36, 73, NULL, NULL, NULL, NULL, 1800, 1, NULL, 7, TRUE, 'CARDIO', 'AEROBIC TRAINING', NULL, '30mn', NULL),
    (36, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (37, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (37, 3, NULL, 6, NULL, 15, NULL, 4, NULL, 2, TRUE, 'CHEST', 'STRAIGHT SET', '6kg', '15', NULL),
    (37, 2, 'Lvl 2', NULL, NULL, 15, NULL, 4, NULL, 3, TRUE, 'CHEST', 'STRAIGHT SET', 'Lvl 2', '15', NULL),
    (37, 79, NULL, 2, NULL, 15, NULL, 6, NULL, 4, TRUE, 'LATERAL DELTS', 'STRAIGHT SET', '2kg', '15', NULL),
    (37, 41, 'Lvl 2', NULL, NULL, 15, NULL, 4, NULL, 5, TRUE, 'REAR DELTS', 'STRAIGHT SET', 'Lvl 2', '15', NULL),
    (37, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (39, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (39, 32, NULL, 20, NULL, 15, NULL, 1, NULL, 2, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', 'OB 20kg', '15', NULL),
    (39, 32, NULL, 30, NULL, 10, NULL, 4, NULL, 3, TRUE, 'ADDUCTOR, GLUTES', 'PROGRESSIVE OVERLOAD', 'OB 20kg + 10kg', '10', NULL),
    (39, 16, 'Lvl 4', NULL, NULL, 10, NULL, 4, NULL, 4, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'Lvl 4', '10', NULL),
    (39, 80, NULL, NULL, NULL, NULL, NULL, 4, NULL, 5, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'bodyweight', NULL, NULL),
    (39, 73, NULL, NULL, NULL, NULL, 900, NULL, NULL, 6, TRUE, 'CARDIO', 'AEROBIC TRAINING', NULL, '15mn', NULL),
    (39, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (40, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (40, 63, NULL, NULL, NULL, 10, NULL, 4, NULL, 2, TRUE, 'CHEST, TRICEPS, FRONT DELTS', 'STRAIGHT SET', 'bodyweight', '10', NULL),
    (40, 4, NULL, 6, NULL, 15, NULL, 4, NULL, 3, TRUE, 'SHOULDER', 'STRAIGHT SET', '6kg', '15', NULL),
    (40, 39, NULL, 4, NULL, 15, NULL, 4, NULL, 4, TRUE, 'LATERAL DELTS', 'STRAIGHT SET', '4kg', '15', NULL),
    (40, 41, NULL, 4, NULL, 15, NULL, 4, NULL, 5, TRUE, 'REAR DELTS', 'STRAIGHT SET', '4kg', '15', NULL),
    (40, 51, 'Lvl 3', NULL, NULL, 15, NULL, 4, NULL, 6, TRUE, 'TRICEPS', 'STRAIGHT SET', 'Lvl 3', '15', NULL),
    (40, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (41, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (41, 6, 'Lvl 3', NULL, NULL, 12, NULL, 2, NULL, 2, TRUE, 'LAT', 'PROGRESSIVE OVERLOAD', 'Lvl 3', '12', NULL),
    (41, 6, 'Lvl 4', NULL, NULL, 10, NULL, 2, NULL, 3, TRUE, 'LAT', 'PROGRESSIVE OVERLOAD', 'Lvl 4', '10', NULL),
    (41, 81, NULL, NULL, NULL, 10, NULL, 4, NULL, 4, TRUE, 'CHEST, TRICEPS, FRONT DELTS', 'STRAIGHT SET', 'bodyweight', '10', NULL),
    (41, 58, NULL, 10, NULL, 12, NULL, 4, NULL, 5, TRUE, 'MIDDLE TRAPS', 'STRAIGHT SET', '10kg', '12', NULL),
    (41, 41, NULL, 4, NULL, 12, NULL, 4, NULL, 6, TRUE, 'REAR DELTS', 'STRAIGHT SET', '4kg', '12', NULL),
    (41, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (42, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (42, 10, NULL, 28, NULL, 15, NULL, 2, NULL, 2, TRUE, 'MAXIMUS GLUTEUS', 'PROGRESSIVE OVERLOAD', '28kg', '15', NULL),
    (42, 10, NULL, 30, NULL, 12, NULL, 2, NULL, 3, TRUE, 'MAXIMUS GLUTEUS', 'PROGRESSIVE OVERLOAD', '30kg', '12', NULL),
    (42, 11, 'Lvl 5', NULL, NULL, 15, NULL, 4, NULL, 4, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 5', '15', NULL),
    (42, 82, NULL, NULL, NULL, NULL, NULL, 3, NULL, 5, TRUE, 'ADDUCTOR, GLUTES, QUADS', 'STRAIGHT SET', 'bodyweight', NULL, NULL),
    (42, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (43, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (43, 3, NULL, 6, NULL, 15, NULL, 2, NULL, 2, TRUE, 'CHEST', 'PROGRESSIVE OVERLOAD', '6kg', '15', NULL),
    (43, 3, NULL, 8, NULL, 10, NULL, 2, NULL, 3, TRUE, 'CHEST', 'PROGRESSIVE OVERLOAD', '8kg', '10', NULL),
    (43, 2, 'Lvl 3', NULL, NULL, 10, NULL, 4, NULL, 4, TRUE, 'CHEST', 'STRAIGHT SET', 'Lvl 3', '10', NULL),
    (43, 83, NULL, 8, NULL, 15, NULL, 4, NULL, 5, TRUE, 'TRICEPS', 'SUPERSET', '8kg', '15', NULL),
    (43, 84, NULL, 6, NULL, 15, NULL, 4, NULL, 6, TRUE, 'BICEPS', 'SUPERSET', '6kg', '15', NULL),
    (43, 85, NULL, NULL, NULL, NULL, 30, 4, NULL, 7, TRUE, 'ARMS, CORE', 'SUPERSET', 'rope', '30sec', NULL),
    (43, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (44, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (44, 32, NULL, 20, NULL, 15, NULL, 1, NULL, 2, TRUE, 'ADDUCTOR, GLUTES', 'WARM-UP SET', 'OB 20kg', '15', NULL),
    (44, 32, NULL, 30, NULL, 10, NULL, 4, NULL, 3, TRUE, 'ADDUCTOR, GLUTES', 'STRAIGHT SET', 'OB 20kg + 10kg', '10', NULL),
    (44, 11, 'Lvl 7', NULL, NULL, 10, NULL, 4, NULL, 4, TRUE, 'ABDUCTOR, MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 7', '10', NULL),
    (44, 86, NULL, NULL, NULL, 10, NULL, 4, NULL, 5, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'bodyweight', '10', NULL),
    (44, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (45, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (45, 69, NULL, NULL, NULL, 8, NULL, 3, NULL, 2, TRUE, 'CHEST', 'STRAIGHT SET', 'bodyweight', '8', NULL),
    (45, 87, 'Lvl 3', NULL, NULL, 15, NULL, 3, NULL, 3, TRUE, 'LAT', 'STRAIGHT SET', 'Lvl 3', '15', NULL),
    (45, 56, NULL, NULL, NULL, NULL, 30, 6, NULL, 4, TRUE, 'ABS, CORE', 'SUPERSET', 'bodyweight', '30sec', NULL),
    (45, 20, NULL, 16, NULL, 10, NULL, 6, NULL, 5, TRUE, 'OBLICS, CORE', 'SUPERSET', '16kg', '10', NULL),
    (45, 53, NULL, NULL, NULL, 20, NULL, 4, NULL, 6, TRUE, 'ABS, CORE', 'STRAIGHT SET', 'bodyweight', '20', NULL),
    (45, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (46, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (46, 38, NULL, 4, NULL, 15, NULL, 2, NULL, 2, TRUE, 'SHOULDER', 'STRAIGHT SET', '4kg', '15', NULL),
    (46, 38, NULL, 6, NULL, 10, NULL, 2, NULL, 3, TRUE, 'SHOULDER', 'STRAIGHT SET', '6kg', '10', NULL),
    (46, 31, NULL, 6, NULL, 10, NULL, 4, NULL, 4, TRUE, 'CHEST', 'STRAIGHT SET', '6kg', '10', NULL),
    (46, 88, NULL, 4, NULL, 10, NULL, 4, NULL, 5, TRUE, 'REAR DELTS', 'STRAIGHT SET', '4kg', '10', NULL),
    (46, 84, NULL, 4, NULL, 10, NULL, 4, NULL, 6, TRUE, 'BICEPS', 'STRAIGHT SET', '4kg', '10', NULL),
    (46, 89, NULL, 6, NULL, 15, NULL, 4, NULL, 7, TRUE, 'TRICEPS', 'STRAIGHT SET', '6kg', '15', NULL),
    (46, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (47, 73, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (47, 16, 'Lvl 6', NULL, NULL, 15, NULL, 2, NULL, 2, TRUE, 'MAXIMUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 6', '15', NULL),
    (47, 16, 'Lvl 7', NULL, NULL, 12, NULL, 2, NULL, 3, TRUE, 'MAXIMUS GLUTEUS', 'PROGRESSIVE OVERLOAD', 'Lvl 7', '12', NULL),
    (47, 11, 'Lvl 6', NULL, NULL, 12, NULL, 4, NULL, 4, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 6', '12', NULL),
    (47, 11, 'Lvl 6', NULL, NULL, 12, NULL, 4, NULL, 5, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 6', '12', NULL),
    (47, 90, NULL, 10, NULL, 12, NULL, 4, NULL, 6, TRUE, 'GLUTES, HAMSTRING', 'STRAIGHT SET', '10kg', '12', NULL),
    (47, 56, NULL, NULL, NULL, NULL, 45, 2, NULL, 7, TRUE, 'ABS, CORE', 'STRAIGHT SET', 'bodyweight', '45sec', NULL),
    (47, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (48, 37, 'Lvl 2', NULL, NULL, NULL, 180, 1, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', 'Lvl 2', '3mn', NULL),
    (48, 44, NULL, 20, NULL, 15, NULL, 2, NULL, 2, TRUE, 'ADDUCTOR, GLUTES', 'STRAIGHT SET', '20kg', '15', NULL),
    (48, 91, NULL, NULL, NULL, 12, NULL, 2, NULL, 3, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'medium band', '12', NULL),
    (48, 44, NULL, 24, NULL, 12, NULL, 2, NULL, 4, TRUE, 'ADDUCTOR, GLUTES', 'STRAIGHT SET', '24kg', '12', NULL),
    (48, 91, NULL, NULL, NULL, 12, NULL, 2, NULL, 5, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'medium band', '12', NULL),
    (48, 72, NULL, 14, NULL, 12, NULL, 4, NULL, 6, TRUE, 'HAMSTRING, GLUTES', 'STRAIGHT SET', '14kg', '12', NULL),
    (48, 45, NULL, 8, NULL, 10, NULL, 3, NULL, 7, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', '8kg', '10', NULL),
    (48, 45, NULL, 6, NULL, 10, NULL, 1, NULL, 8, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', '6kg', '10', NULL),
    (48, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (49, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (49, 92, 'Lvl 2', NULL, NULL, 10, NULL, 4, NULL, 2, TRUE, 'LATS', 'STRAIGHT SET', 'Lvl 2', '10', NULL),
    (49, 58, NULL, 10, NULL, 10, NULL, 4, NULL, 3, TRUE, 'MIDDLE TRAPS, RHOMBOID', 'STRAIGHT SET', '10kg', '10', NULL),
    (49, 93, 'Lvl 2', NULL, NULL, 10, NULL, 4, NULL, 4, TRUE, 'MIDDLE TRAPS', 'STRAIGHT SET', 'Lvl 2', '10', NULL),
    (49, 38, NULL, 6, NULL, 10, NULL, 4, NULL, 5, TRUE, 'SHOULDER', 'STRAIGHT SET', '6kg', '10', NULL),
    (49, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (50, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (50, 25, NULL, NULL, NULL, NULL, 30, 3, NULL, 2, TRUE, 'ARMS, CORE, STAMINA', 'CIRCUIT TRAINING', 'rope', '30sec', NULL),
    (50, 94, NULL, 4, NULL, 15, NULL, 3, NULL, 3, TRUE, 'BICEPS, FOREARMS', 'CIRCUIT TRAINING', '4kg', '15', NULL),
    (50, 95, NULL, 8, NULL, 15, NULL, 3, NULL, 4, TRUE, 'TRICEPS', 'CIRCUIT TRAINING', '8kg', '15', NULL),
    (50, 96, NULL, NULL, NULL, 20, NULL, 3, NULL, 5, TRUE, 'LOWER ABS, CORE', 'STRAIGHT SET', 'bodyweight', '20', NULL),
    (50, 97, NULL, NULL, NULL, 20, NULL, 3, NULL, 6, TRUE, 'ABS, CORE', 'STRAIGHT SET', 'bodyweight', '20', NULL),
    (50, 56, NULL, NULL, NULL, NULL, 30, 3, NULL, 7, TRUE, 'ABS, CORE', 'STRAIGHT SET', 'bodyweight', '30sec', NULL),
    (50, 98, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'MOBILITY', 'MOBILITY TRAINING', 'bodyweight', NULL, NULL),
    (50, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (51, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (51, 28, 'Lvl 4', NULL, NULL, 15, NULL, 2, NULL, 2, TRUE, 'MIDDLE TRAPS, RHOMBOID', 'PROGRESSIVE OVERLOAD', 'Lvl 4', '15', NULL),
    (51, 28, 'Lvl 5', NULL, NULL, 12, NULL, 2, NULL, 3, FALSE, 'MIDDLE TRAPS, RHOMBOID', 'PROGRESSIVE OVERLOAD', 'Lvl 5', '12', NULL),
    (51, 99, NULL, 6, NULL, 10, NULL, 4, NULL, 4, TRUE, 'LATS', 'STRAIGHT SET', '6kg', '10', NULL),
    (51, 81, NULL, NULL, NULL, 10, NULL, 2, NULL, 5, TRUE, 'CHEST, TRICEPS, FRONT DELTS', 'STRAIGHT SET', 'bodyweight', '10', NULL),
    (51, 100, 'Lvl 4', NULL, NULL, 15, NULL, 3, NULL, 6, TRUE, 'TRICEPS', 'SUPERSET', 'Lvl 4', '15', NULL),
    (51, 85, NULL, NULL, NULL, NULL, 30, 3, NULL, 7, TRUE, 'ARMS, CORE', 'SUPERSET', 'rope', '30sec', NULL),
    (51, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (52, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (52, 101, NULL, 8, NULL, NULL, NULL, 2, NULL, 2, TRUE, 'QUADS, ADDUCTOR, GLUTES', 'STRAIGHT SET', '8kg', NULL, NULL),
    (52, 48, 'Lvl 3', NULL, NULL, 12, NULL, 4, NULL, 3, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', 'Lvl 3', '12', NULL),
    (52, 72, NULL, 14, NULL, 12, NULL, 4, NULL, 4, TRUE, 'HAMSTRING, GLUTES', 'STRAIGHT SET', '14kg', '12', NULL),
    (52, 44, NULL, 25, NULL, 12, NULL, 2, NULL, 5, TRUE, 'ADDUCTOR, GLUTES', 'STRAIGHT SET', '25kg', '12', NULL),
    (52, 59, NULL, NULL, NULL, 12, NULL, 3, NULL, 6, TRUE, 'MEDIUS GLUTEUS', 'BISET', 'medium band', '12', NULL),
    (52, 102, NULL, NULL, NULL, 20, NULL, 3, NULL, 7, TRUE, 'MEDIUS GLUTEUS', 'BISET', 'medium band', '20', NULL),
    (52, 20, NULL, 16, NULL, 20, NULL, 6, NULL, 8, TRUE, 'OBLICS, CORE', 'SUPERSET', '16kg', '20', NULL),
    (52, 53, NULL, NULL, NULL, 20, NULL, 6, NULL, 9, TRUE, 'ABS, CORE', 'SUPERSET', 'bodyweight', '20', NULL),
    (52, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (53, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (53, 103, NULL, 8, NULL, 10, NULL, 2, NULL, 2, TRUE, NULL, 'STRAIGHT SET', '8kg', '10', NULL),
    (53, 47, NULL, 8, NULL, NULL, NULL, 1, NULL, 3, TRUE, NULL, 'STRAIGHT SET', '8kg', NULL, NULL),
    (53, 16, 'Lvl 5', NULL, NULL, 10, NULL, 4, NULL, 4, TRUE, NULL, 'STRAIGHT SET', 'Lvl 5', '10', NULL),
    (53, 48, 'Lvl 4', NULL, NULL, 10, NULL, 4, NULL, 5, TRUE, NULL, 'STRAIGHT SET', 'Lvl 4', '10', NULL),
    (53, 11, 'Lvl 5', NULL, NULL, 10, NULL, 4, NULL, 6, TRUE, NULL, 'STRAIGHT SET', 'Lvl 5', '10', NULL),
    (53, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (54, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (54, 81, NULL, NULL, NULL, 7, NULL, 3, NULL, 2, TRUE, NULL, 'STRAIGHT SET', 'bodyweight', '7', NULL),
    (54, 3, NULL, 8, NULL, 10, NULL, 3, NULL, 3, TRUE, NULL, 'STRAIGHT SET', '8kg', '10', NULL),
    (54, 6, 'Lvl 3', NULL, NULL, 10, NULL, 3, NULL, 4, TRUE, NULL, 'STRAIGHT SET', 'Lvl 3', '10', NULL),
    (54, 104, NULL, 6, NULL, 10, NULL, 3, NULL, 5, TRUE, NULL, 'STRAIGHT SET', '6kg', '10', NULL),
    (54, 29, NULL, 30, NULL, 10, NULL, 6, NULL, 6, TRUE, NULL, 'STRAIGHT SET', 'OB 20kg + 10kg', '10', NULL),
    (54, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (55, 1, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', NULL, NULL, '15mn', NULL),
    (55, 32, NULL, 20, NULL, 15, NULL, 2, NULL, 2, TRUE, NULL, NULL, 'OB 20kg', '15', NULL),
    (55, 32, NULL, 30, NULL, 10, NULL, 3, NULL, 3, TRUE, NULL, NULL, 'OB 20kg + 10kg', '10', NULL),
    (55, 16, 'Lvl 5', NULL, NULL, 10, NULL, 3, NULL, 4, TRUE, NULL, NULL, 'Lvl 5', '10', NULL),
    (55, 11, 'Lvl 5', NULL, NULL, 10, NULL, 3, NULL, 5, TRUE, NULL, NULL, 'Lvl 5', '10', NULL),
    (55, 6, 'Lvl 3', NULL, NULL, 10, NULL, 3, NULL, 6, TRUE, NULL, NULL, 'Lvl 3', '10', NULL),
    (55, 3, NULL, 6, NULL, 10, NULL, 3, NULL, 7, TRUE, NULL, NULL, '6kg', '10', NULL),
    (55, 105, NULL, 4, NULL, 10, NULL, 3, NULL, 8, TRUE, NULL, NULL, '4kg', '10', NULL),
    (55, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RECOVERY, RELAXING', 'STRETCHING', NULL, NULL, NULL),
    (56, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (56, 101, NULL, 6, NULL, 10, NULL, 4, NULL, 2, TRUE, 'QUADS, ADDUCTOR, GLUTES', 'STRAIGHT SET', '6kg', '10', NULL),
    (56, 106, NULL, 40, NULL, 12, NULL, 4, NULL, 3, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'OB 20kg + 20kg', '12', NULL),
    (56, 107, NULL, 8, NULL, 10, NULL, 4, NULL, 4, TRUE, 'GLUTES, QUADS', 'STRAIGHT SET', '8kg', '10', NULL),
    (56, 48, 'Lvl 4', NULL, NULL, 12, NULL, 4, NULL, 5, TRUE, 'MAXIMUS GLUTEUS', 'STRAIGHT SET', 'Lvl 4', '12', NULL),
    (56, 108, NULL, 6, NULL, 12, NULL, 4, NULL, 6, TRUE, 'MEDIUS GLUTEUS', 'STRAIGHT SET', '6kg', '12', NULL),
    (56, 19, NULL, NULL, NULL, 20, NULL, 3, NULL, 7, TRUE, 'ABS, CORE', 'STRAIGHT SET', 'bodyweight', '20', NULL),
    (56, 20, NULL, 16, NULL, 20, NULL, 6, NULL, 8, TRUE, 'OBLICS, CORE', 'SUPERSET', '16kg', '20', NULL),
    (56, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (57, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (57, 16, 'Lvl 4', NULL, NULL, NULL, NULL, NULL, NULL, 2, TRUE, NULL, NULL, 'Lvl 4', NULL, NULL),
    (57, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, TRUE, NULL, NULL, NULL, NULL, NULL),
    (57, 15, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 4, TRUE, NULL, NULL, NULL, NULL, NULL),
    (57, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (58, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (58, 16, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2, TRUE, NULL, NULL, NULL, NULL, NULL),
    (58, 72, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, TRUE, NULL, NULL, NULL, NULL, NULL),
    (58, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 4, TRUE, NULL, NULL, NULL, NULL, NULL),
    (58, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5, TRUE, NULL, NULL, NULL, NULL, NULL),
    (58, 81, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, NULL, NULL, NULL, NULL, NULL),
    (58, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (59, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (59, 10, NULL, 24, NULL, 15, NULL, 2, NULL, 2, TRUE, NULL, NULL, '24kg', '15', NULL),
    (59, 10, NULL, 28, NULL, 12, NULL, 2, NULL, 3, TRUE, NULL, NULL, '28kg', '12', NULL),
    (59, 59, NULL, NULL, NULL, 20, NULL, 4, NULL, 4, TRUE, NULL, NULL, 'medium band', '20', NULL),
    (59, 48, 'Lvl 2', NULL, NULL, 15, NULL, 4, NULL, 5, TRUE, NULL, NULL, 'Lvl 2', '15', NULL),
    (59, 61, NULL, 24, NULL, 15, NULL, 4, NULL, 6, TRUE, NULL, NULL, '24kg', '15', NULL),
    (59, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (60, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (60, 16, 'Lvl 6', NULL, NULL, 10, NULL, 4, NULL, 2, TRUE, NULL, 'STRAIGHT SET', 'Lvl 6', '10', NULL),
    (60, 59, NULL, NULL, NULL, 10, NULL, 3, NULL, 3, TRUE, NULL, 'STRAIGHT SET', 'hard band', '10', NULL),
    (60, 59, NULL, NULL, NULL, 10, NULL, 3, NULL, 4, TRUE, NULL, 'BISET', 'medium band', '10', NULL),
    (60, 11, 'Lvl 4', NULL, NULL, 10, NULL, 3, NULL, 5, TRUE, NULL, 'BISET', 'Lvl 4', '10', NULL),
    (60, 109, 'Lvl 3', NULL, NULL, 15, NULL, 3, NULL, 6, TRUE, NULL, 'TRISET', 'Lvl 3', '15', NULL),
    (60, 64, NULL, 10, NULL, 8, NULL, 3, NULL, 7, TRUE, NULL, 'TRISET', 'OB 10kg', '8', NULL),
    (60, 25, NULL, NULL, NULL, NULL, 20, 3, NULL, 8, TRUE, NULL, 'TRISET', 'rope', '20sec', NULL),
    (60, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (61, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (61, 48, 'Lvl 3', NULL, NULL, 15, NULL, 3, NULL, 2, TRUE, NULL, NULL, 'Lvl 3', '15', NULL),
    (61, 110, NULL, NULL, NULL, 20, NULL, 3, NULL, 3, TRUE, NULL, NULL, 'bodyweight', '20', NULL),
    (61, 39, NULL, 2, NULL, 15, NULL, 6, NULL, 4, TRUE, NULL, NULL, '2kg', '15', NULL),
    (61, 111, NULL, 4, NULL, 10, NULL, 4, NULL, 5, TRUE, NULL, NULL, '4kg', '10', NULL),
    (61, 83, NULL, 10, NULL, 15, NULL, 1, NULL, 6, TRUE, NULL, NULL, '10kg', '15', NULL),
    (61, 83, NULL, 8, NULL, 15, NULL, 4, NULL, 7, TRUE, NULL, NULL, '8kg', '15', NULL),
    (61, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (62, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (62, 16, 'Lvl 5', NULL, NULL, 15, NULL, 2, NULL, 2, TRUE, NULL, NULL, 'Lvl 5', '15', NULL),
    (62, 16, 'Lvl 6', NULL, NULL, 12, NULL, 2, NULL, 3, TRUE, NULL, NULL, 'Lvl 6', '12', NULL),
    (62, 68, 'Lvl 3', NULL, NULL, 15, NULL, 3, NULL, 4, TRUE, NULL, NULL, 'Lvl 3', '15', NULL),
    (62, 112, NULL, 2, NULL, 15, NULL, 2, NULL, 5, TRUE, NULL, NULL, '2kg', '15', NULL),
    (62, 112, NULL, 4, NULL, 12, NULL, 2, NULL, 6, TRUE, NULL, NULL, '4kg', '12', NULL),
    (62, 39, NULL, 2, NULL, 15, NULL, 2, NULL, 7, TRUE, NULL, NULL, '2kg', '15', NULL),
    (62, 39, NULL, 4, NULL, 10, NULL, 2, NULL, 8, TRUE, NULL, NULL, '4kg', '10', NULL),
    (62, 63, NULL, NULL, NULL, 10, NULL, 4, NULL, 9, TRUE, NULL, NULL, 'bodyweight', '10', NULL),
    (62, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (63, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, FALSE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (63, 16, 'Lvl 5', NULL, NULL, 10, NULL, 3, NULL, 2, FALSE, NULL, NULL, 'Lvl 5', '10', NULL),
    (63, 82, NULL, NULL, NULL, NULL, NULL, 3, NULL, 3, FALSE, NULL, NULL, 'bodyweight', NULL, NULL),
    (63, 48, 'Lvl 3', NULL, NULL, 10, NULL, 3, NULL, 4, FALSE, NULL, NULL, 'Lvl 3', '10', NULL),
    (63, 11, 'Lvl 5', NULL, NULL, 10, NULL, 3, NULL, 5, FALSE, NULL, NULL, 'Lvl 5', '10', NULL),
    (63, 72, NULL, 6, NULL, 10, NULL, 3, NULL, 6, FALSE, NULL, NULL, '6kg', '10', NULL),
    (63, 113, NULL, NULL, NULL, NULL, 30, 3, NULL, 7, FALSE, NULL, NULL, 'bodyweight', '30sec', NULL),
    (63, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (64, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (64, 16, 'Lvl 5', NULL, NULL, 15, NULL, 1, NULL, 2, FALSE, NULL, NULL, 'Lvl 5', '15', NULL),
    (64, 16, 'Lvl 6', NULL, NULL, 10, NULL, 3, NULL, 3, FALSE, NULL, NULL, 'Lvl 6', '10', NULL),
    (64, 16, 'Lvl 7', NULL, NULL, 10, NULL, 1, NULL, 4, FALSE, NULL, NULL, 'Lvl 7', '10', NULL),
    (64, 55, 'Lvl 3', NULL, NULL, 15, NULL, 1, NULL, 5, FALSE, NULL, NULL, 'Lvl 3', '15', NULL),
    (64, 55, 'Lvl 4', NULL, NULL, 10, NULL, 3, NULL, 6, FALSE, NULL, NULL, 'Lvl 4', '10', NULL),
    (64, 114, NULL, 10, NULL, 15, NULL, 1, NULL, 7, FALSE, NULL, NULL, 'OB 10kg', '15', NULL),
    (64, 114, NULL, 20, NULL, 10, NULL, 3, NULL, 8, FALSE, NULL, NULL, 'OB 10kg + 10kg', '10', NULL),
    (64, 6, 'Lvl 3', NULL, NULL, 10, NULL, 3, NULL, 9, FALSE, NULL, NULL, 'Lvl 3', '10', NULL),
    (64, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (65, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (65, 44, NULL, 24, NULL, 15, NULL, 2, NULL, 2, FALSE, NULL, NULL, '24kg', '15', NULL),
    (65, 44, NULL, 28, NULL, 12, NULL, 2, NULL, 3, FALSE, NULL, NULL, '28kg', '12', NULL),
    (65, 44, NULL, 30, NULL, 10, NULL, 2, NULL, 4, FALSE, NULL, NULL, '30kg', '10', NULL),
    (65, 11, 'Lvl 8', NULL, NULL, 10, NULL, 4, NULL, 5, FALSE, NULL, NULL, 'Lvl 8', '10', NULL),
    (65, 115, 'Lvl 5', NULL, NULL, 10, NULL, 3, NULL, 6, FALSE, NULL, NULL, 'Lvl 5', '10', NULL),
    (65, 116, 'Lvl 2', NULL, NULL, 15, NULL, 2, NULL, 7, FALSE, NULL, NULL, 'Lvl 2', '15', NULL),
    (65, 116, 'Lvl 4', NULL, NULL, 10, NULL, 4, NULL, 8, FALSE, NULL, NULL, 'Lvl 4', '10', NULL),
    (65, 29, NULL, 20, NULL, 15, NULL, 1, NULL, 9, FALSE, NULL, NULL, 'OB 20kg', '15', NULL),
    (65, 29, NULL, 25, NULL, 10, NULL, 4, NULL, 10, FALSE, NULL, NULL, 'OB 20kg + 5kg', '10', NULL),
    (65, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 11, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (66, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (66, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2, FALSE, NULL, NULL, NULL, NULL, NULL),
    (66, 117, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3, FALSE, NULL, NULL, NULL, NULL, NULL),
    (66, 47, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 4, FALSE, NULL, NULL, NULL, NULL, NULL),
    (66, 44, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5, FALSE, NULL, NULL, NULL, NULL, NULL),
    (66, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6, TRUE, 'RELAXING, MOBILITY', 'STRETCHING', NULL, NULL, NULL),
    (67, 8, NULL, NULL, NULL, NULL, 900, NULL, NULL, 1, TRUE, 'WARM-UP', 'WARM-UP', NULL, '15mn', NULL),
    (67, 118, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2, FALSE, NULL, NULL, NULL, NULL, NULL);

-- Guide alimentaire (valeurs pour 100 g) : 6 catégories, 26 aliments
INSERT INTO aliments_categories (id, nom, ordre) VALUES
    (1, 'CÉRÉALES COMPLÈTES', 1),
    (2, 'FRUITS', 2),
    (3, 'LÉGUMES', 3),
    (4, 'VIANDES', 4),
    (5, 'VOLAILLES', 5),
    (6, 'POISSONS ET FRUITS DE MER', 6);
INSERT INTO aliments (categorie_id, nom, proteines_g, glucides_g, lipides_g, ordre) VALUES
    (1, 'avoine', 16.9, 66.3, 5, 1),
    (1, 'riz brun', 2.6, 23, 1.9, 2),
    (1, 'pâtes aux blé complet', 11.8, 67.6, 2.2, 3),
    (1, 'quinoa', 11.3, 69, 5.6, 4),
    (1, 'orge', 12, 73, 2.3, 5),
    (1, 'weetabix', NULL, NULL, NULL, 6),
    (2, 'pomme', 0.3, 14, 0.2, 1),
    (2, 'banane', 1.1, 23, 0.3, 2),
    (2, 'baies de goji', 13.7, 64.4, 2.2, 3),
    (2, 'pêche', 0.9, 10, 0.3, 4),
    (2, 'fraise', 0.7, 8, 0.3, 5),
    (2, 'raisin', 0.6, 17, 0.4, 6),
    (2, 'pastèque', 0.6, 8, 0.2, 7),
    (2, 'orange', NULL, NULL, NULL, 8),
    (3, 'patate', 2.1, 17.2, 1.37, 1),
    (3, 'poireaux', 1.5, 14, 0.3, 2),
    (3, 'brocoli', 2.8, 7, 0.4, 3),
    (3, 'choux blanc', 1.3, 6, 0.1, 4),
    (3, 'choux rouge', 1.4, 7, 0.2, 5),
    (3, 'choux fleur', 1.9, 5, 0.3, 6),
    (3, 'carotte', 0.9, 10, 0.2, 7),
    (3, 'asperge', 2.2, 3.9, 0.1, 8),
    (4, 'zébu', 26, 0, 15, 1),
    (5, 'blanc de dinde sans la peau', 29, 0.1, 7, 1),
    (5, 'blanc de poulet sans la peau', 27, 0, 14, 2),
    (6, 'crevette', 19, 1.8, 1.1, 1);

-- Glossaire (fichier client). Les termes sans définition dans le fichier reçoivent un texte à compléter.
INSERT INTO glossaire (terme, definition, categorie) VALUES
    ('1RM', 'Mot à mot 1RM signifie Une Répétition Maximale et désigne la charge maximale déplacée sur une seule répétition. Après le warm up la 1RM est souvent réalisée ou approchée (2RM ou 3RM) afin d''effectuer le Metcon qui suit à la bonne intensité au niveau des charges déplacées si on a décidé de le scaler. Elle est estimée avec la formule mathématique suivante: ((0,0333 X nombre maximal de répétitions) + 1) X charge déplacée', 'entraînement'),
    ('AMRAP', 'Abréviation de As Many Rounds As Possible, en Français autant de tours que possible. Faire autant de rounds que possible des exercices spécifiés et des répétitions demandées dans le temps imparti.', 'entraînement'),
    ('BODYBUILDING', 'Aussi appelé culturisme, il consiste à sculpter son corps grâce au maniement de résistances additionnelles, mais aussi à l''aide de son propre poids de corps. C''est une activité sportive à part entière visant à développer la force musculaire en augmentant la masse des muscles par un effort physique répété, séries effectuées pour chaque groupe musculaire.', 'entraînement'),
    ('CROSSTRAINING', 'Définition à compléter.', 'entraînement'),
    ('CROSSFIT', 'Le CrossFit est une marque commerciale d''entraînement croisé promu par la société CrossFit Inc. Il combine principalement la force athlétique, l''haltérophilie, la gymnastique et les sports d''endurance. Les pratiquants courent, rament, grimpent à la corde, sautent, déplacent des objets, pratiquent des mouvements olympiques d''haltérophilie ainsi que des exercices au poids du corps, utilisent des haltères. Le CrossFit axe son fonctionnement autour de dix compétences athlétiques : endurance cardiovasculaire et respiratoire, endurance musculaire, force, souplesse, puissance, vitesse, agilité, psychomotricité, équilibre et précision.', 'entraînement'),
    ('EMOM', 'Abréviation de Every Minute On the Minute. Chaque minute à la minute faire l''exercice spécifié. Par exemple, pour un EMOM de 10 minutes de 5 burpees et 5 pullups on fait 5 burpees, 5 pullups à T+0 puis 5 burpees, 5 pullups à T+ 1'', puis 5 burpees, 5 pullups à T+ 2'', et ainsi de suite durant 10 minutes. En terminant les exercices en 20 secondes, il reste 40 secondes de récupération jusqu''à ce que la minute suivante commence. S''il n''est pas possible de compléter les exercices dans la minute il faut réduire les répétitions ou simplifier techniquement l''exercice demandé. Cette méthode permet de faire progresser la résistance musculaire et la récupération.', 'entraînement'),
    ('EPOC', 'EPOC signifie Excess Post Oxygen Consumption ou Excès de consommation d''oxygène après l''exercice. Beaucoup l''appellent aussi: "afterburn".', 'entraînement'),
    ('FOR TIME', 'Définition à compléter.', 'entraînement'),
    ('HIIT', 'Définition à compléter.', 'entraînement'),
    ('METCON', 'Définition à compléter.', 'entraînement'),
    ('PERSONAL TRAINER', 'Un "personal trainer" ou entraîneur personnel est un professionnel chargé d''assister des personnes dans leur entraînement physique. Il motive ses élèves et les aide à se fixer des objectifs en leur apportant son expertise sur la faisabilité. Les coachs évaluent les points forts et les faiblesses de leurs élèves ainsi que leur forme physique. Ces évaluations sont de préférence réalisées avant et après un programme d''exercices (macro-cycle) pour mesurer l''amélioration de la condition physique. Ils peuvent également informer leurs clients sur leur bien-être, leur santé en général et leur donner des directives sur la nutrition. Un coach sportif est issu d''une formation qualifiante généraliste des métiers de la forme (fitness).', 'entraînement'),
    ('STRENGTH TRAINING', 'Définition à compléter.', 'entraînement'),
    ('VO² max', 'La consommation maximale d''oxygène ou VO²max est le volume maximal d''oxygène qu''un organisme aérobie, en général, ou le sujet humain en particulier peut consommer par unité de temps lors d''un exercice dynamique aérobie maximal. Chez l''humain, le ou la VO²max s''exprime habituellement en litres de dioxygène par minute (L/min). Afin de personnaliser la mesure et tenir compte des différentes constitutions (enfant ou adulte, petits ou grands gabarits...) la valeur observée est le plus souvent rapportée à l''unité de masse corporelle pour déterminer un VO²max dit « spécifique », qui s''exprimera alors en ml/min/kg. Cette dernière valeur est un excellent indicateur de la performance potentielle du sujet dans les épreuves d''endurance, (sportives ou non) : plus elle est élevée, meilleure sera la performance éventuellement réalisée.', 'entraînement'),
    ('WOD', 'Workout Of the Day', 'entraînement'),
    ('HDKB', 'High Donkey Kick Back (HDKB) est un exercice qui sollicite les muscles glutéaux / fessiers qui relient le bassin et les fémurs : le minimus gluteus ou petit fessier, le medius gluteus ou moyen fessier et maximus gluteus ou grand fessier.', 'entraînement'),
    ('IMC', 'Indice de Masse Corporelle : rapport entre le poids et la taille au carré.', 'santé'),
    ('PAL', 'Physical Activity Level : niveau d''activité physique quotidien.', 'santé'),
    ('Répétition', 'Une exécution complète d''un mouvement d''exercice.', 'musculation');

-- Liens croisés (fiches liées) : exemples
INSERT INTO glossaire_liens (terme_id, terme_lie_id)
SELECT a.id, b.id FROM (VALUES ('HIIT','EPOC'),('AMRAP','EMOM'),('AMRAP','FOR TIME'),('CROSSFIT','WOD'),('METCON','WOD'),('1RM','STRENGTH TRAINING'),('BODYBUILDING','STRENGTH TRAINING'),('CROSSFIT','CROSSTRAINING'),('HIIT','VO² max'),('1RM','Répétition')) v(x,y)
JOIN glossaire a ON a.terme = v.x JOIN glossaire b ON b.terme = v.y;

-- Remise à niveau des compteurs d'identifiants (les lignes ci-dessus ont des id explicites)
SELECT setval(pg_get_serial_sequence('exercices', 'id'), (SELECT MAX(id) FROM exercices));
SELECT setval(pg_get_serial_sequence('seances', 'id'), (SELECT MAX(id) FROM seances));
SELECT setval(pg_get_serial_sequence('aliments_categories', 'id'), (SELECT MAX(id) FROM aliments_categories));
