-- =======================================================
-- BTO Insight Hub — Schema Unico Completo
-- Esegui in Supabase → SQL Editor → New Query → Run
-- Sostituisce tutti i file .sql precedenti
-- =======================================================

-- 0. CLEANUP idempotente
DROP TABLE IF EXISTS user_upvotes CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS insights CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 1. PROFILES + TRIGGER AUTO-CREAZIONE
-- org_role: gerarchia consulenziale + funzioni di staff
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    role TEXT DEFAULT 'Consulente Junior',
    org_role TEXT NOT NULL DEFAULT 'consulente'
        CHECK (org_role IN (
            'consulente','team_leader','engagement_manager',
            'lead','practice_manager','responsabile','bu_manager',
            'marketing','sales','hr','operations','admin'
        )),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, role, org_role)
    VALUES (
        NEW.id, NEW.email,
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        COALESCE(NEW.raw_user_meta_data->>'role', 'Consulente Junior'),
        COALESCE(NEW.raw_user_meta_data->>'org_role', 'consulente')
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profilo personale" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Aggiorna profilo" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Manager vede profili" ON public.profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
            AND p.org_role IN ('admin','bu_manager','responsabile','practice_manager'))
);

-- 2. CLIENTS
CREATE TABLE public.clients (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tutti leggono clienti" ON public.clients FOR SELECT USING (true);
CREATE POLICY "Autenticati inseriscono clienti" ON public.clients FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 3. INSIGHTS con confidenzialità e author_id
CREATE TABLE public.insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    title TEXT NOT NULL,
    client TEXT,
    category TEXT,
    team TEXT,
    snippet TEXT,
    author_email TEXT,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    upvotes INTEGER DEFAULT 0,
    confidentiality TEXT NOT NULL DEFAULT 'pubblico'
        CHECK (confidentiality IN ('pubblico','riservato','segreto'))
);

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights TO anon, authenticated;

-- Chi può leggere cosa
CREATE POLICY "Leggi pubblici e riservati" ON public.insights
    FOR SELECT USING (confidentiality IN ('pubblico','riservato'));

CREATE POLICY "Leggi segreti solo autore" ON public.insights
    FOR SELECT USING (confidentiality = 'segreto' AND author_email = auth.email());

CREATE POLICY "Inserimento autenticati" ON public.insights
    FOR INSERT WITH CHECK (auth.email() IS NOT NULL);

-- Modifica/elimina: autore o ruoli senior
CREATE POLICY "Modifica autore o senior" ON public.insights FOR UPDATE USING (
    author_email = auth.email() OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
            AND p.org_role IN ('admin','bu_manager','responsabile'))
);
CREATE POLICY "Elimina autore o senior" ON public.insights FOR DELETE USING (
    author_email = auth.email() OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
            AND p.org_role IN ('admin','bu_manager','responsabile'))
);

-- 4. USER_UPVOTES
CREATE TABLE public.user_upvotes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_email TEXT NOT NULL,
    insight_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_email, insight_id)
);
ALTER TABLE public.user_upvotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Upvotes autenticati" ON public.user_upvotes FOR ALL USING (true) WITH CHECK (true);

-- 5. TEAMS + TEAM_MEMBERS
CREATE TABLE public.teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tutti leggono team" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Autenticati creano team" ON public.teams FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Creatore aggiorna team" ON public.teams FOR UPDATE USING (created_by = auth.email());

CREATE TABLE public.team_members (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_name TEXT,
    UNIQUE(team_id, user_email)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members liberi" ON public.team_members FOR ALL USING (true) WITH CHECK (true);

-- =======================================================
-- PERMESSI PER ORG_ROLE (applicati lato app in app.js)
-- consulente:          inserisce, legge, Ask Brain base
-- team_leader:         + vede autori non anonimi nel proprio team
-- engagement_manager:  + filtri cliente avanzati
-- lead:                + export insight
-- practice_manager:    + dashboard analytics
-- responsabile:        + modifica/elimina tutti gli insight
-- bu_manager:          + tutto + gestione utenti
-- marketing:           + AI Correlazioni → LinkedIn post generator
-- sales:               + AI Suggerimenti commerciali
-- hr:                  + AI Analisi clima/cultura
-- operations:          + AI Analisi processi
-- admin:               + accesso totale
-- =======================================================
