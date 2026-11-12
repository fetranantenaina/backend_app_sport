# Correspondance des intitulés du journal (Excel) avec les muscles 3D

Généré depuis db/migrations/001_muscles.sql. Modifiable ensuite via l'écran admin (API /api/anatomie/libelles).

Un intitulé de groupe répartit son volume entre ses muscles (la somme des parts fait 100 %). Si deux intitulés d'un même exercice visent le même muscle, sa part est plafonnée à 100 %.

## Intitulés musculaires

| Intitulé Excel | Traduction | Muscles 3D (part du volume) |
|---|---|---|
| ABDUCTOR | Abducteurs (moyen fessier, tenseur du fascia lata) | Moyen fessier (50 %), Tenseur du fascia lata (50 %) |
| ABS | Abdominaux | Abdominaux |
| ADDUCTOR | Adducteurs | Adducteurs |
| ARMS | Bras (biceps, triceps, avant-bras) | Biceps (33 %), Triceps (33 %), Avant-bras (33 %) |
| BICEPS | Biceps | Biceps |
| CALVES | Mollets | Mollets |
| CHEST | Pectoraux | Haut des pectoraux (50 %), Pectoraux (50 %) |
| CORE | Gainage (abdos, obliques, lombaires) | Lombaires (33 %), Abdominaux (33 %), Obliques (33 %) |
| FOREARMS | Avant-bras | Avant-bras |
| FRONT DELTS | Épaule avant | Épaule avant |
| GLUTES | Fessiers (grand et moyen) | Grand fessier (50 %), Moyen fessier (50 %) |
| HAMSTRING | Ischio-jambiers | Ischio-jambiers |
| LAT | Dorsaux | Dorsaux |
| LATERAL | Épaule côté | Épaule côté |
| LATERAL DELTS | Épaule côté | Épaule côté |
| LATS | Dorsaux | Dorsaux |
| LOWER ABS | Bas des abdominaux | Abdominaux |
| LOWER TRAPS | Bas des trapèzes | Bas des trapèzes |
| LUMBAR | Lombaires | Lombaires |
| MAXIMUS GLUTES | Grand fessier | Grand fessier |
| MAXIMUS GLUTEUS | Grand fessier | Grand fessier |
| MEDIUS GLUTEUS | Moyen fessier | Moyen fessier |
| MIDDLE TRAPS | Milieu des trapèzes | Milieu des trapèzes |
| OBLICS | Obliques | Obliques |
| QUADS | Quadriceps | Quadriceps |
| REAR DELTS | Épaule arrière | Épaule arrière |
| RHOMBOID | Rhomboïdes | Rhomboïdes |
| SHOULDER | Épaules (avant, côté, arrière) | Épaule avant (33 %), Épaule côté (33 %), Épaule arrière (33 %) |
| SHOULDERS | Épaules (avant, côté, arrière) | Épaule avant (33 %), Épaule côté (33 %), Épaule arrière (33 %) |
| TRICEPS | Triceps | Triceps |
| UPPER CHEST | Haut des pectoraux | Haut des pectoraux |
| UPPER TRAPS | Haut des trapèzes | Haut des trapèzes |

## Intitulés hors du corps (badges)

| Intitulé Excel | Traduction | Badge |
|---|---|---|
| BALANCE | Équilibre | Qualité athlétique |
| CARDIO | Cardio | Cardio |
| EXPLOSIVENESS | Explosivité | Qualité athlétique |
| MOBILITY | Mobilité | Échauffement |
| RECOVERY | Récupération | Récupération |
| RELAXING | Relaxation | Récupération |
| STAMINA | Endurance | Cardio |
| WARM-UP | Échauffement | Échauffement |

À rattacher : `LOWER TRAPS L` (séance 7, exercice 5), probablement une faute de frappe pour LOWER TRAPS.

## Muscles du modèle 3D

| Code (objets 3D) | Nom | Région | Vue | Explication |
|---|---|---|---|---|
| pectoral_claviculaire | Haut des pectoraux | poitrine | face | Partie haute du grand pectoral, attachée à la clavicule. Elle avance le bras vers le haut : développé incliné, écarté incliné. |
| grand_pectoral | Pectoraux | poitrine | face | Grand muscle de la poitrine. Il rapproche les bras devant le corps et pousse vers l'avant : pompes, développé couché, écarté. |
| deltoide_anterieur | Épaule avant | épaules | face | Avant de l'épaule. Il lève le bras devant soi : développé militaire, élévations frontales, et il aide les pectoraux. |
| deltoide_lateral | Épaule côté | épaules | cote | Côté de l'épaule, qui donne la largeur des épaules. Il écarte le bras sur le côté : élévations latérales. |
| deltoide_posterieur | Épaule arrière | épaules | dos | Arrière de l'épaule. Il tire le bras vers l'arrière : oiseau, face pull, tirages. Important pour la posture. |
| biceps | Biceps | bras | face | Avant du bras. Il plie le coude et tourne la paume vers le haut : curls, tractions, rowing. |
| triceps | Triceps | bras | dos | Arrière du bras, environ deux tiers du volume du bras. Il tend le coude : dips, extensions, pompes serrées, développés. |
| avant_bras | Avant-bras | bras | face | Muscles de l'avant-bras. Ils ferment la main et bougent le poignet : la force de préhension pour tenir les charges. |
| grand_dorsal | Dorsaux | dos | dos | Grand muscle du dos qui donne la forme en V. Il tire les bras vers le bas et l'arrière : tractions, tirage vertical, rowing. |
| trapeze_superieur | Haut des trapèzes | dos | dos | Haut du trapèze, entre le cou et l'épaule. Il hausse les épaules : shrugs, port de charges lourdes. |
| trapeze_moyen | Milieu des trapèzes | dos | dos | Milieu du trapèze, entre les omoplates. Il serre les omoplates : rowing, oiseau, tirage poitrine. Clé d'une bonne posture. |
| trapeze_inferieur | Bas des trapèzes | dos | dos | Bas du trapèze. Il abaisse et stabilise les omoplates : Y-raises, tractions. Protège les épaules. |
| rhomboides | Rhomboïdes | dos | dos | Sous les trapèzes, entre la colonne et les omoplates. Ils rapprochent les omoplates : rowing, tirages. |
| lombaires | Lombaires | tronc | dos | Muscles le long de la colonne, en bas du dos. Ils redressent et protègent le dos : soulevé de terre, extensions, gainage. |
| grand_droit | Abdominaux | tronc | face | Les « tablettes ». Ils enroulent le buste vers le bassin et tiennent le ventre : crunchs, relevés de jambes, gainage. |
| obliques | Obliques | tronc | cote | Côtés de la taille. Ils tournent et inclinent le buste et stabilisent le tronc : rotations, flexions latérales, gainage latéral. |
| grand_fessier | Grand fessier | hanches | dos | Le plus gros muscle du corps, qui donne la forme des fesses. Il tend la hanche : hip thrust, squat, fentes, soulevé de terre. |
| moyen_fessier | Moyen fessier | hanches | cote | Haut et côté de la fesse. Il écarte la jambe et stabilise le bassin à chaque pas : abductions, fire hydrant, marche en crabe. |
| tenseur_fascia_lata | Tenseur du fascia lata | hanches | cote | Petit muscle sur le côté de la hanche. Il aide le moyen fessier à écarter la jambe et stabilise le genou. |
| adducteurs | Adducteurs | jambes | face | Intérieur de la cuisse. Ils rapprochent les jambes et stabilisent le bassin : squat sumo, fentes, machine adducteurs. |
| quadriceps | Quadriceps | jambes | face | Avant de la cuisse, quatre muscles. Ils tendent le genou : squat, presse, fentes, leg extension. |
| ischio_jambiers | Ischio-jambiers | jambes | dos | Arrière de la cuisse. Ils plient le genou et tendent la hanche : soulevé de terre jambes tendues, leg curl. |
| mollets | Mollets | jambes | dos | Arrière de la jambe. Ils poussent sur la pointe des pieds : extensions mollets, course, sauts. |
