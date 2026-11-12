-- =========================================================
-- Migration 001 — Référentiel des muscles (vue anatomique 3D)
--   muscles          : muscles affichés sur le modèle 3D (nom français, explication, objets 3D)
--   libelles_cibles  : intitulés saisis dans le journal (TARGET de l'Excel : "GLUTES", "CORE", "CARDIO"...)
--   libelle_muscles  : correspondance intitulé -> muscle(s), avec la part du volume attribuée à chacun
-- Un intitulé est soit "muscle" (colore le corps), soit "activite" (cardio, échauffement... : badge hors du corps).
-- Idempotente : peut être rejouée sans effet.
-- =========================================================

CREATE TABLE IF NOT EXISTS muscles (
    id SERIAL PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,            -- identifiant stable, préfixe des objets 3D (ex: grand_fessier)
    nom_fr VARCHAR(80) NOT NULL,
    nom_latin VARCHAR(120),
    region VARCHAR(30) NOT NULL,                 -- épaules, bras, poitrine, dos, tronc, hanches, jambes
    vue VARCHAR(10) NOT NULL DEFAULT 'face' CHECK (vue IN ('face', 'dos', 'cote')),  -- côté le plus visible (rotation auto)
    description TEXT,                            -- explication affichée sur la fiche muscle
    objets_3d TEXT[] NOT NULL DEFAULT '{}',      -- noms des objets dans corps.glb (ex: {grand_fessier_g, grand_fessier_d})
    ordre INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS libelles_cibles (
    id SERIAL PRIMARY KEY,
    libelle VARCHAR(60) NOT NULL UNIQUE,         -- toujours en MAJUSCULES, sans espaces autour
    type VARCHAR(10) NOT NULL CHECK (type IN ('muscle', 'activite')),
    activite VARCHAR(20) CHECK (activite IN ('cardio', 'echauffement', 'recuperation', 'qualite')),
    nom_fr VARCHAR(80),                          -- traduction affichée (ex: CORE -> "Gainage (abdos, obliques, lombaires)")
    CHECK ((type = 'activite') = (activite IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS libelle_muscles (
    libelle_id INTEGER NOT NULL REFERENCES libelles_cibles(id) ON DELETE CASCADE,
    muscle_id INTEGER NOT NULL REFERENCES muscles(id) ON DELETE CASCADE,
    part NUMERIC(4,3) NOT NULL DEFAULT 1 CHECK (part > 0 AND part <= 1),
    PRIMARY KEY (libelle_id, muscle_id)
);

-- ---------------------------------------------------------
-- Muscles du modèle 3D (23)
-- ---------------------------------------------------------
INSERT INTO muscles (code, nom_fr, nom_latin, region, vue, ordre, description) VALUES
 ('pectoral_claviculaire', 'Haut des pectoraux', 'Pectoralis major, pars clavicularis', 'poitrine', 'face', 1,
  'Partie haute du grand pectoral, attachée à la clavicule. Elle avance le bras vers le haut : développé incliné, écarté incliné.'),
 ('grand_pectoral', 'Pectoraux', 'Pectoralis major, pars sternocostalis', 'poitrine', 'face', 2,
  'Grand muscle de la poitrine. Il rapproche les bras devant le corps et pousse vers l''avant : pompes, développé couché, écarté.'),
 ('deltoide_anterieur', 'Épaule avant', 'Deltoideus, pars clavicularis', 'épaules', 'face', 3,
  'Avant de l''épaule. Il lève le bras devant soi : développé militaire, élévations frontales, et il aide les pectoraux.'),
 ('deltoide_lateral', 'Épaule côté', 'Deltoideus, pars acromialis', 'épaules', 'cote', 4,
  'Côté de l''épaule, qui donne la largeur des épaules. Il écarte le bras sur le côté : élévations latérales.'),
 ('deltoide_posterieur', 'Épaule arrière', 'Deltoideus, pars spinalis', 'épaules', 'dos', 5,
  'Arrière de l''épaule. Il tire le bras vers l''arrière : oiseau, face pull, tirages. Important pour la posture.'),
 ('biceps', 'Biceps', 'Biceps brachii et brachialis', 'bras', 'face', 6,
  'Avant du bras. Il plie le coude et tourne la paume vers le haut : curls, tractions, rowing.'),
 ('triceps', 'Triceps', 'Triceps brachii', 'bras', 'dos', 7,
  'Arrière du bras, environ deux tiers du volume du bras. Il tend le coude : dips, extensions, pompes serrées, développés.'),
 ('avant_bras', 'Avant-bras', 'Flexores et extensores antebrachii', 'bras', 'face', 8,
  'Muscles de l''avant-bras. Ils ferment la main et bougent le poignet : la force de préhension pour tenir les charges.'),
 ('grand_dorsal', 'Dorsaux', 'Latissimus dorsi et teres major', 'dos', 'dos', 9,
  'Grand muscle du dos qui donne la forme en V. Il tire les bras vers le bas et l''arrière : tractions, tirage vertical, rowing.'),
 ('trapeze_superieur', 'Haut des trapèzes', 'Trapezius, pars descendens', 'dos', 'dos', 10,
  'Haut du trapèze, entre le cou et l''épaule. Il hausse les épaules : shrugs, port de charges lourdes.'),
 ('trapeze_moyen', 'Milieu des trapèzes', 'Trapezius, pars transversa', 'dos', 'dos', 11,
  'Milieu du trapèze, entre les omoplates. Il serre les omoplates : rowing, oiseau, tirage poitrine. Clé d''une bonne posture.'),
 ('trapeze_inferieur', 'Bas des trapèzes', 'Trapezius, pars ascendens', 'dos', 'dos', 12,
  'Bas du trapèze. Il abaisse et stabilise les omoplates : Y-raises, tractions. Protège les épaules.'),
 ('rhomboides', 'Rhomboïdes', 'Rhomboideus major et minor', 'dos', 'dos', 13,
  'Sous les trapèzes, entre la colonne et les omoplates. Ils rapprochent les omoplates : rowing, tirages.'),
 ('lombaires', 'Lombaires', 'Erector spinae', 'tronc', 'dos', 14,
  'Muscles le long de la colonne, en bas du dos. Ils redressent et protègent le dos : soulevé de terre, extensions, gainage.'),
 ('grand_droit', 'Abdominaux', 'Rectus abdominis', 'tronc', 'face', 15,
  'Les « tablettes ». Ils enroulent le buste vers le bassin et tiennent le ventre : crunchs, relevés de jambes, gainage.'),
 ('obliques', 'Obliques', 'Obliquus externus et internus abdominis', 'tronc', 'cote', 16,
  'Côtés de la taille. Ils tournent et inclinent le buste et stabilisent le tronc : rotations, flexions latérales, gainage latéral.'),
 ('grand_fessier', 'Grand fessier', 'Gluteus maximus', 'hanches', 'dos', 17,
  'Le plus gros muscle du corps, qui donne la forme des fesses. Il tend la hanche : hip thrust, squat, fentes, soulevé de terre.'),
 ('moyen_fessier', 'Moyen fessier', 'Gluteus medius', 'hanches', 'cote', 18,
  'Haut et côté de la fesse. Il écarte la jambe et stabilise le bassin à chaque pas : abductions, fire hydrant, marche en crabe.'),
 ('tenseur_fascia_lata', 'Tenseur du fascia lata', 'Tensor fasciae latae', 'hanches', 'cote', 19,
  'Petit muscle sur le côté de la hanche. Il aide le moyen fessier à écarter la jambe et stabilise le genou.'),
 ('adducteurs', 'Adducteurs', 'Adductores, gracilis et pectineus', 'jambes', 'face', 20,
  'Intérieur de la cuisse. Ils rapprochent les jambes et stabilisent le bassin : squat sumo, fentes, machine adducteurs.'),
 ('quadriceps', 'Quadriceps', 'Quadriceps femoris', 'jambes', 'face', 21,
  'Avant de la cuisse, quatre muscles. Ils tendent le genou : squat, presse, fentes, leg extension.'),
 ('ischio_jambiers', 'Ischio-jambiers', 'Biceps femoris, semitendinosus et semimembranosus', 'jambes', 'dos', 22,
  'Arrière de la cuisse. Ils plient le genou et tendent la hanche : soulevé de terre jambes tendues, leg curl.'),
 ('mollets', 'Mollets', 'Gastrocnemius et soleus', 'jambes', 'dos', 23,
  'Arrière de la jambe. Ils poussent sur la pointe des pieds : extensions mollets, course, sauts.')
ON CONFLICT (code) DO NOTHING;

-- Objets 3D par défaut : un objet par côté (_g gauche, _d droite) dans corps.glb
UPDATE muscles SET objets_3d = ARRAY[code || '_g', code || '_d'] WHERE objets_3d = '{}';

-- ---------------------------------------------------------
-- Intitulés du journal (colonne TARGET de l'Excel)
-- ---------------------------------------------------------
INSERT INTO libelles_cibles (libelle, type, activite, nom_fr) VALUES
 ('CHEST', 'muscle', NULL, 'Pectoraux'),
 ('UPPER CHEST', 'muscle', NULL, 'Haut des pectoraux'),
 ('FRONT DELTS', 'muscle', NULL, 'Épaule avant'),
 ('LATERAL DELTS', 'muscle', NULL, 'Épaule côté'),
 ('LATERAL', 'muscle', NULL, 'Épaule côté'),
 ('REAR DELTS', 'muscle', NULL, 'Épaule arrière'),
 ('SHOULDER', 'muscle', NULL, 'Épaules (avant, côté, arrière)'),
 ('SHOULDERS', 'muscle', NULL, 'Épaules (avant, côté, arrière)'),
 ('BICEPS', 'muscle', NULL, 'Biceps'),
 ('TRICEPS', 'muscle', NULL, 'Triceps'),
 ('FOREARMS', 'muscle', NULL, 'Avant-bras'),
 ('ARMS', 'muscle', NULL, 'Bras (biceps, triceps, avant-bras)'),
 ('LATS', 'muscle', NULL, 'Dorsaux'),
 ('LAT', 'muscle', NULL, 'Dorsaux'),
 ('MIDDLE TRAPS', 'muscle', NULL, 'Milieu des trapèzes'),
 ('LOWER TRAPS', 'muscle', NULL, 'Bas des trapèzes'),
 ('UPPER TRAPS', 'muscle', NULL, 'Haut des trapèzes'),
 ('RHOMBOID', 'muscle', NULL, 'Rhomboïdes'),
 ('LUMBAR', 'muscle', NULL, 'Lombaires'),
 ('ABS', 'muscle', NULL, 'Abdominaux'),
 ('LOWER ABS', 'muscle', NULL, 'Bas des abdominaux'),
 ('OBLICS', 'muscle', NULL, 'Obliques'),
 ('CORE', 'muscle', NULL, 'Gainage (abdos, obliques, lombaires)'),
 ('MAXIMUS GLUTEUS', 'muscle', NULL, 'Grand fessier'),
 ('MAXIMUS GLUTES', 'muscle', NULL, 'Grand fessier'),
 ('MEDIUS GLUTEUS', 'muscle', NULL, 'Moyen fessier'),
 ('GLUTES', 'muscle', NULL, 'Fessiers (grand et moyen)'),
 ('ABDUCTOR', 'muscle', NULL, 'Abducteurs (moyen fessier, tenseur du fascia lata)'),
 ('ADDUCTOR', 'muscle', NULL, 'Adducteurs'),
 ('QUADS', 'muscle', NULL, 'Quadriceps'),
 ('HAMSTRING', 'muscle', NULL, 'Ischio-jambiers'),
 ('CALVES', 'muscle', NULL, 'Mollets'),
 ('CARDIO', 'activite', 'cardio', 'Cardio'),
 ('STAMINA', 'activite', 'cardio', 'Endurance'),
 ('WARM-UP', 'activite', 'echauffement', 'Échauffement'),
 ('MOBILITY', 'activite', 'echauffement', 'Mobilité'),
 ('RECOVERY', 'activite', 'recuperation', 'Récupération'),
 ('RELAXING', 'activite', 'recuperation', 'Relaxation'),
 ('BALANCE', 'activite', 'qualite', 'Équilibre'),
 ('EXPLOSIVENESS', 'activite', 'qualite', 'Explosivité')
ON CONFLICT (libelle) DO NOTHING;

-- Correspondances intitulé -> muscle(s) et part du volume (les groupes répartissent leur volume)
INSERT INTO libelle_muscles (libelle_id, muscle_id, part)
SELECT l.id, m.id, c.part
FROM (VALUES
 ('CHEST', 'grand_pectoral', 0.5), ('CHEST', 'pectoral_claviculaire', 0.5),
 ('UPPER CHEST', 'pectoral_claviculaire', 1),
 ('FRONT DELTS', 'deltoide_anterieur', 1),
 ('LATERAL DELTS', 'deltoide_lateral', 1),
 ('LATERAL', 'deltoide_lateral', 1),
 ('REAR DELTS', 'deltoide_posterieur', 1),
 ('SHOULDER', 'deltoide_anterieur', 0.333), ('SHOULDER', 'deltoide_lateral', 0.333), ('SHOULDER', 'deltoide_posterieur', 0.334),
 ('SHOULDERS', 'deltoide_anterieur', 0.333), ('SHOULDERS', 'deltoide_lateral', 0.333), ('SHOULDERS', 'deltoide_posterieur', 0.334),
 ('BICEPS', 'biceps', 1),
 ('TRICEPS', 'triceps', 1),
 ('FOREARMS', 'avant_bras', 1),
 ('ARMS', 'biceps', 0.333), ('ARMS', 'triceps', 0.333), ('ARMS', 'avant_bras', 0.334),
 ('LATS', 'grand_dorsal', 1),
 ('LAT', 'grand_dorsal', 1),
 ('MIDDLE TRAPS', 'trapeze_moyen', 1),
 ('LOWER TRAPS', 'trapeze_inferieur', 1),
 ('UPPER TRAPS', 'trapeze_superieur', 1),
 ('RHOMBOID', 'rhomboides', 1),
 ('LUMBAR', 'lombaires', 1),
 ('ABS', 'grand_droit', 1),
 ('LOWER ABS', 'grand_droit', 1),
 ('OBLICS', 'obliques', 1),
 ('CORE', 'grand_droit', 0.333), ('CORE', 'obliques', 0.333), ('CORE', 'lombaires', 0.334),
 ('MAXIMUS GLUTEUS', 'grand_fessier', 1),
 ('MAXIMUS GLUTES', 'grand_fessier', 1),
 ('MEDIUS GLUTEUS', 'moyen_fessier', 1),
 ('GLUTES', 'grand_fessier', 0.5), ('GLUTES', 'moyen_fessier', 0.5),
 ('ABDUCTOR', 'moyen_fessier', 0.5), ('ABDUCTOR', 'tenseur_fascia_lata', 0.5),
 ('ADDUCTOR', 'adducteurs', 1),
 ('QUADS', 'quadriceps', 1),
 ('HAMSTRING', 'ischio_jambiers', 1),
 ('CALVES', 'mollets', 1)
) AS c(libelle, code, part)
JOIN libelles_cibles l ON l.libelle = c.libelle
JOIN muscles m ON m.code = c.code
ON CONFLICT (libelle_id, muscle_id) DO NOTHING;
