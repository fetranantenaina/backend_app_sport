-- Mensurations : la cuisse se mesure désormais à gauche et à droite (comme les bras et les mollets).
-- L'ancienne colonne cuisses_cm est conservée pour l'historique (affichée « Cuisses (ancien relevé) » dans les courbes).
ALTER TABLE releves_physiques ADD COLUMN IF NOT EXISTS cuisse_gauche_cm NUMERIC(5,2);
ALTER TABLE releves_physiques ADD COLUMN IF NOT EXISTS cuisse_droite_cm NUMERIC(5,2);
