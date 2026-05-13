-- =======================================================
-- BTO Insight Hub — Schema Completo + Seed
-- UN SOLO FILE per creare e popolare tutto il DB
-- Esegui in Supabase → SQL Editor → New Query → Run
-- =======================================================

-- =======================================================
-- 0. CLEANUP COMPLETO (idempotente)
-- =======================================================
DROP TABLE IF EXISTS public.badges CASCADE;
DROP TABLE IF EXISTS public.user_upvotes CASCADE;
DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.insights CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- =======================================================
-- 1. PROFILES
-- =======================================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    org_role TEXT NOT NULL DEFAULT 'consulente'
        CHECK (org_role IN (
            'consulente', 'team_leader', 'engagement_manager',
            'lead', 'practice_manager', 'responsabile', 'bu_manager',
            'marketing', 'sales', 'hr', 'operations', 'admin'
        )),
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Trigger: crea profilo automaticamente al signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, org_role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        COALESCE(NEW.raw_user_meta_data->>'org_role', 'consulente')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =======================================================
-- 2. CLIENTS
-- =======================================================
CREATE TABLE public.clients (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sector TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;

-- =======================================================
-- 3. INSIGHTS
-- status: bozza → inserito dal consulente, in attesa di validazione
--         pubblicato → validato da team_leader+
-- =======================================================
CREATE TABLE public.insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    title TEXT NOT NULL,
    client TEXT,
    sector TEXT,
    category TEXT,
    team TEXT,
    snippet TEXT,
    author_email TEXT,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    validated_by TEXT,          -- email di chi ha validato
    validated_at TIMESTAMPTZ,
    upvotes INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'bozza'
        CHECK (status IN ('bozza', 'pubblicato'))
);
ALTER TABLE public.insights DISABLE ROW LEVEL SECURITY;

-- =======================================================
-- 4. USER UPVOTES
-- =======================================================
CREATE TABLE public.user_upvotes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_email TEXT NOT NULL,
    insight_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_email, insight_id)
);
ALTER TABLE public.user_upvotes DISABLE ROW LEVEL SECURITY;

-- =======================================================
-- 5. TEAMS
-- =======================================================
CREATE TABLE public.teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.teams DISABLE ROW LEVEL SECURITY;

CREATE TABLE public.team_members (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_name TEXT,
    UNIQUE(team_id, user_email)
);
ALTER TABLE public.team_members DISABLE ROW LEVEL SECURITY;

-- =======================================================
-- 6. BADGES — milestone personali non competitive
-- =======================================================
CREATE TABLE public.badges (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_email TEXT NOT NULL,
    badge_key TEXT NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_email, badge_key)
);
ALTER TABLE public.badges DISABLE ROW LEVEL SECURITY;

-- =======================================================
-- SEED — PROFILI
-- Aggiorna i profili degli utenti già registrati in Auth
-- =======================================================
INSERT INTO public.profiles (id, email, first_name, last_name, org_role)
SELECT u.id, u.email,
    CASE u.email
        WHEN 'lucabianchi@gmail.com'      THEN 'Luca'
        WHEN 'saraverdi@gmail.com'        THEN 'Sara'
        WHEN 'giuseppeverdi@gmail.com'    THEN 'Giuseppe'
        WHEN 'mariorossi@gmail.com'       THEN 'Mario'
        WHEN 'martaviola@gmail.com'       THEN 'Marta'
        WHEN 'martinogiallo@gmail.com'    THEN 'Martino'
        WHEN 'susannaarancione@gmail.com' THEN 'Susanna'
        WHEN 'danielebianco@gmail.com'    THEN 'Daniele'
        WHEN 'francoblu@gmail.com'        THEN 'Franco'
        WHEN 'giovannineri@gmail.com'     THEN 'Giovanni'
        WHEN 'elenarossi@gmail.com'       THEN 'Elena'
        ELSE split_part(u.email, '@', 1)
    END,
    CASE u.email
        WHEN 'lucabianchi@gmail.com'      THEN 'Bianchi'
        WHEN 'saraverdi@gmail.com'        THEN 'Verdi'
        WHEN 'giuseppeverdi@gmail.com'    THEN 'Verdi'
        WHEN 'mariorossi@gmail.com'       THEN 'Rossi'
        WHEN 'martaviola@gmail.com'       THEN 'Viola'
        WHEN 'martinogiallo@gmail.com'    THEN 'Giallo'
        WHEN 'susannaarancione@gmail.com' THEN 'Arancione'
        WHEN 'danielebianco@gmail.com'    THEN 'Bianco'
        WHEN 'francoblu@gmail.com'        THEN 'Blu'
        WHEN 'giovannineri@gmail.com'     THEN 'Neri'
        WHEN 'elenarossi@gmail.com'       THEN 'Rossi'
        ELSE split_part(u.email, '@', 1)
    END,
    CASE u.email
        WHEN 'lucabianchi@gmail.com'      THEN 'consulente'
        WHEN 'saraverdi@gmail.com'        THEN 'team_leader'
        WHEN 'giuseppeverdi@gmail.com'    THEN 'engagement_manager'
        WHEN 'mariorossi@gmail.com'       THEN 'lead'
        WHEN 'martaviola@gmail.com'       THEN 'practice_manager'
        WHEN 'martinogiallo@gmail.com'    THEN 'responsabile'
        WHEN 'susannaarancione@gmail.com' THEN 'bu_manager'
        WHEN 'danielebianco@gmail.com'    THEN 'marketing'
        WHEN 'francoblu@gmail.com'        THEN 'sales'
        WHEN 'giovannineri@gmail.com'     THEN 'hr'
        WHEN 'elenarossi@gmail.com'       THEN 'operations'
        ELSE 'consulente'
    END
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name  = EXCLUDED.last_name,
    org_role   = EXCLUDED.org_role;

-- =======================================================
-- SEED — CLIENTI
-- =======================================================
INSERT INTO public.clients (name, sector) VALUES
    ('Luxottica',        'Manifatturiero'),
    ('Ferrero',          'Food & Beverage'),
    ('Esselunga',        'Retail'),
    ('Gruppo Mondadori', 'Media & Publishing'),
    ('Banca Generali',   'Finance'),
    ('Enel',             'Energy & Utilities'),
    ('Ferrari',          'Automotive'),
    ('Recordati',        'Pharma')
ON CONFLICT (name) DO NOTHING;

-- =======================================================
-- SEED — TEAMS
-- =======================================================
INSERT INTO public.teams (name, created_by) VALUES
    ('Team AI Transformation', 'saraverdi@gmail.com'),
    ('Team Cloud Journey',     'giuseppeverdi@gmail.com'),
    ('Team CyberSecurity',     'mariorossi@gmail.com'),
    ('Team Agile Governance',  'martaviola@gmail.com')
ON CONFLICT (name) DO NOTHING;

-- =======================================================
-- SEED — TEAM MEMBERS
-- =======================================================
INSERT INTO public.team_members (team_id, user_email, user_name)
SELECT t.id, m.email, m.name FROM public.teams t
JOIN (VALUES
    ('Team AI Transformation', 'saraverdi@gmail.com',     'Sara Verdi'),
    ('Team AI Transformation', 'lucabianchi@gmail.com',   'Luca Bianchi'),
    ('Team AI Transformation', 'danielebianco@gmail.com', 'Daniele Bianco'),
    ('Team Cloud Journey',     'giuseppeverdi@gmail.com', 'Giuseppe Verdi'),
    ('Team Cloud Journey',     'mariorossi@gmail.com',    'Mario Rossi'),
    ('Team Cloud Journey',     'lucabianchi@gmail.com',   'Luca Bianchi'),
    ('Team CyberSecurity',     'mariorossi@gmail.com',    'Mario Rossi'),
    ('Team CyberSecurity',     'martaviola@gmail.com',    'Marta Viola'),
    ('Team Agile Governance',  'martaviola@gmail.com',    'Marta Viola'),
    ('Team Agile Governance',  'martinogiallo@gmail.com', 'Martino Giallo'),
    ('Team Agile Governance',  'francoblu@gmail.com',     'Franco Blu')
) AS m(team, email, name) ON t.name = m.team
ON CONFLICT (team_id, user_email) DO NOTHING;

-- =======================================================
-- SEED — INSIGHTS
-- Mix di bozze e pubblicati per testare il flusso
-- =======================================================
INSERT INTO public.insights
    (title, client, sector, category, team, snippet, author_email, upvotes, status, validated_by, validated_at)
VALUES
(
    'Resistenza culturale all''adozione IoT',
    'Luxottica', 'Manifatturiero', 'Tecnologia', 'Team AI Transformation',
    'I responsabili di produzione non si fidano dei dati automatici dei sensori IoT. Soluzione: sessioni di shadowing tra data analyst e capi reparto, dashboard semplificate con KPI scelti dagli operatori. Adozione passata dal 20% all''85% in 3 settimane.',
    'lucabianchi@gmail.com', 4, 'pubblicato', 'saraverdi@gmail.com', now() - interval '5 days'
),
(
    'Gap tra dati e decisioni operative',
    'Ferrero', 'Food & Beverage', 'Processi', 'Team Cloud Journey',
    'Il cliente fatica a tradurre i dati di produzione in decisioni operative concrete. Manca un processo strutturato di data-driven decision making a livello middle management. Proposta: workshop mensili con i team di operations.',
    'giuseppeverdi@gmail.com', 7, 'pubblicato', 'mariorossi@gmail.com', now() - interval '3 days'
),
(
    'Opportunità automazione Supply Chain',
    'Esselunga', 'Retail', 'Strategia', 'Team AI Transformation',
    'Il team Supply perde fino a 2 ore al giorno nel tracciamento manuale dei colli. L''introduzione di un sistema RFID integrato con il gestionale potrebbe ridurre gli errori del 40% e liberare risorse per attività ad alto valore.',
    'lucabianchi@gmail.com', 2, 'pubblicato', 'saraverdi@gmail.com', now() - interval '2 days'
),
(
    'Competitor avanza su AI generativa',
    'Recordati', 'Pharma', 'Competitor', 'Team Agile Governance',
    'Un competitor diretto ha lanciato internamente un assistente AI per la gestione della documentazione regolatoria. Riduzione stimata del 30% nei tempi di preparazione dossier. Opportunità per BTO di proporre soluzione analoga.',
    'martaviola@gmail.com', 1, 'pubblicato', 'martinogiallo@gmail.com', now() - interval '1 day'
),
(
    'Cultura del dato assente nel middle management',
    'Gruppo Mondadori', 'Media & Publishing', 'Cultura', 'Team Cloud Journey',
    'I manager di linea non leggono i report analytics prodotti dal team data. Le dashboard esistono ma non vengono consultate. Necessario un programma di change management sulla data literacy prima di qualsiasi investimento tecnologico.',
    'mariorossi@gmail.com', 5, 'pubblicato', 'giuseppeverdi@gmail.com', now() - interval '4 days'
),
(
    'Vulnerabilità patch management cloud',
    'Banca Generali', 'Finance', 'CyberSecurity', 'Team CyberSecurity',
    'Rilevata esposizione di endpoint non aggiornati su infrastruttura cloud ibrida. Il cliente non ha un processo di patch management strutturato. Rischio elevato classificato come critico. Proposta piano di remediation in 90 giorni.',
    'mariorossi@gmail.com', 3, 'pubblicato', 'martaviola@gmail.com', now() - interval '6 days'
),
(
    'AI predittiva per gestione scorte retail',
    'Esselunga', 'Retail', 'Tecnologia', 'Team AI Transformation',
    'Il cliente sta valutando AI per la gestione predittiva delle scorte nei punti vendita. Il modello pilota su 5 negozi ha ridotto le rotture di stock del 22%. Caso replicabile su scala nazionale con ROI stimato 8 mesi.',
    'danielebianco@gmail.com', 6, 'pubblicato', 'saraverdi@gmail.com', now() - interval '1 day'
),
(
    'Transizione energetica e digitalizzazione processi',
    'Enel', 'Energy & Utilities', 'Strategia', 'Team Agile Governance',
    'Il cliente sta accelerando la transizione verso rinnovabili ma i processi di gestione degli impianti sono ancora legacy. Opportunità di proporre un twin digitale degli impianti per ottimizzare manutenzione predittiva.',
    'francoblu@gmail.com', 2, 'pubblicato', 'martinogiallo@gmail.com', now() - interval '2 days'
),
-- Insight in stato BOZZA (da validare)
(
    'Nuove esigenze post-fusione societaria',
    'Ferrari', 'Automotive', 'Strategia', 'Team Cloud Journey',
    'A seguito di una fusione interna, il cliente necessita di armonizzare due sistemi ERP incompatibili. Il progetto di migrazione è stimato in 18 mesi ma la finestra operativa disponibile è di 12. Serve un approccio phased.',
    'lucabianchi@gmail.com', 0, 'bozza', NULL, NULL
),
(
    'Resistenza sindacale all''automazione',
    'Ferrero', 'Food & Beverage', 'Cultura', 'Team AI Transformation',
    'Il progetto di automazione della linea produttiva incontra forte resistenza sindacale. La comunicazione interna è stata gestita male. Lezione appresa: coinvolgere i rappresentanti sindacali fin dalla fase di discovery.',
    'lucabianchi@gmail.com', 0, 'bozza', NULL, NULL
),
(
    'Opportunità cross-selling identificata',
    'Banca Generali', 'Finance', 'Strategia', 'Team CyberSecurity',
    'Durante il progetto CyberSecurity è emersa una forte esigenza di compliance DORA non ancora indirizzata. Il cliente è aperto a estendere il mandato. Contatto: responsabile IT Governance.',
    'mariorossi@gmail.com', 0, 'bozza', NULL, NULL
);

-- =======================================================
-- SEED — BADGES
-- =======================================================
INSERT INTO public.badges (user_email, badge_key, earned_at) VALUES
    ('lucabianchi@gmail.com',   'primo_insight',     now() - interval '10 days'),
    ('lucabianchi@gmail.com',   'insight_5',         now() - interval '2 days'),
    ('lucabianchi@gmail.com',   'prima_validazione', now() - interval '5 days'),
    ('giuseppeverdi@gmail.com', 'primo_insight',     now() - interval '8 days'),
    ('giuseppeverdi@gmail.com', 'prima_validazione', now() - interval '3 days'),
    ('mariorossi@gmail.com',    'primo_insight',     now() - interval '6 days'),
    ('mariorossi@gmail.com',    'team_player',       now() - interval '1 day'),
    ('martaviola@gmail.com',    'primo_insight',     now() - interval '7 days'),
    ('danielebianco@gmail.com', 'primo_insight',     now() - interval '4 days'),
    ('danielebianco@gmail.com', 'knowledge_sharer',  now() - interval '1 day')
ON CONFLICT (user_email, badge_key) DO NOTHING;