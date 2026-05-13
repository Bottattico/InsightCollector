(async function initApp() {
    console.log("SYSTEM: Initializing with Supabase & Groq");

    try {
        // --- INIZIALIZZA SUPABASE ---
        const supa = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

        // --- AUTHENTICATION LOGIC ---
        let isLoginMode = true;
        const authContainer = document.getElementById('auth-container');
        const mainApp = document.getElementById('main-app');
        const authForm = document.getElementById('auth-form');
        const authEmail = document.getElementById('auth-email');
        const authPassword = document.getElementById('auth-password');
        const authTitle = document.getElementById('auth-title');
        const authSubmitBtn = document.getElementById('auth-submit-btn');
        const authSwitchLink = document.getElementById('auth-switch-link');
        const authError = document.getElementById('auth-error');
        const logoutBtn = document.getElementById('logout-btn');

        let currentUser = null;

        async function updateAuthState(session) {
            if (session) {
                currentUser = session.user.email;
                if(authContainer) authContainer.style.display = 'none';
                if(mainApp) mainApp.style.display = 'flex';
                
                // Update UI Profile names (usa nome e cognome se disponibili)
                const meta = session.user.user_metadata || {};
                const userNameDisplay = (meta.first_name && meta.last_name) 
                    ? `${meta.first_name} ${meta.last_name}` 
                    : currentUser.split('@')[0];
                const sidebarName = document.getElementById('sidebar-name');
                const profileName = document.getElementById('profile-name-large');
                if(sidebarName) sidebarName.textContent = userNameDisplay;
                if(profileName) profileName.textContent = userNameDisplay;

                // Salva il nome nel greeting per updateUIByRole
                const greetingEl = document.getElementById('topbar-greeting');
                if(greetingEl) greetingEl.dataset.firstname = meta.first_name || userNameDisplay;

                // Update Role
                const userRole = session.user.user_metadata?.role || "Consulente";
                const sidebarRole = document.getElementById('sidebar-role');
                const profileRole = document.getElementById('profile-role-large');
                if(sidebarRole) sidebarRole.textContent = userRole;
                if(profileRole) profileRole.textContent = userRole;
                
                const avatarUrl = `https://ui-avatars.com/api/?name=${userNameDisplay}&background=3B82F6&color=fff`;
                const sidebarAv = document.getElementById('sidebar-avatar');
                const profileAv = document.getElementById('profile-avatar-large');
                if(sidebarAv) sidebarAv.src = avatarUrl;
                if(profileAv) profileAv.src = avatarUrl + "&size=120";

                // Load Data
                try {
                    // Carica org_role dal profilo Supabase
                    const { data: profile } = await supa
                        .from('profiles')
                        .select('org_role')
                        .eq('id', session.user.id)
                        .single();
                    if (profile?.org_role) {
                        currentUserOrgRole = profile.org_role;
                    }
                    updateUIByRole();
                    await loadMyUpvotes();
                    loadInsights();
                    populateDatalists();
                } catch(e) {
                    console.warn("Dati non caricati (controlla tabelle SQL):", e);
                }
            } else {
                currentUser = null;
                if(authContainer) authContainer.style.display = 'flex';
                if(mainApp) mainApp.style.display = 'none';
            }
        }

        // Check session on load
        const { data: { session } } = await supa.auth.getSession();
        updateAuthState(session);

        if(authSwitchLink) {
            authSwitchLink.addEventListener('click', (e) => {
                e.preventDefault();
                isLoginMode = !isLoginMode;
                authTitle.textContent = isLoginMode ? "Accedi al Cervello Aziendale" : "Crea un nuovo Account";
                authSubmitBtn.textContent = isLoginMode ? "Accedi" : "Registrati";
                authSwitchLink.textContent = isLoginMode ? "Registrati" : "Accedi";
                authSwitchLink.parentElement.firstChild.textContent = isLoginMode ? "Non hai un account? " : "Hai già un account? ";
                authError.style.display = 'none';
                
                const nameGroup = document.getElementById('auth-name-group');
                const surnameGroup = document.getElementById('auth-surname-group');
                const roleGroup = document.getElementById('auth-role-group');
                const showMode = isLoginMode ? 'none' : 'flex';
                if(nameGroup) nameGroup.style.display = showMode;
                if(surnameGroup) surnameGroup.style.display = showMode;
                if(roleGroup) roleGroup.style.display = showMode;
            });
        }

        if(authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                authSubmitBtn.disabled = true;
                authSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Attendere...';
                authError.style.display = 'none';

                try {
                    if (isLoginMode) {
                        const { data, error } = await supa.auth.signInWithPassword({
                            email: authEmail.value,
                            password: authPassword.value,
                        });
                        if (error) throw error;
                        updateAuthState(data.session);
                    } else {
                        const nameVal = document.getElementById('auth-name')?.value.trim() || '';
                        const surnameVal = document.getElementById('auth-surname')?.value.trim() || '';
                        const orgRoleVal = document.getElementById('auth-role')?.value || "consulente";
                        const { data, error } = await supa.auth.signUp({
                            email: authEmail.value,
                            password: authPassword.value,
                            options: {
                                data: {
                                    first_name: nameVal,
                                    last_name: surnameVal,
                                    role: orgRoleVal,
                                    org_role: orgRoleVal
                                }
                            }
                        });
                        if (error) throw error;
                        if(data.session) {
                            updateAuthState(data.session);
                        } else {
                            authError.textContent = "Controlla la tua email per confermare la registrazione!";
                            authError.style.display = 'block';
                        }
                    }
                } catch (err) {
                    authError.textContent = err.message || "Errore di autenticazione";
                    authError.style.display = 'block';
                } finally {
                    authSubmitBtn.disabled = false;
                    authSubmitBtn.textContent = isLoginMode ? "Accedi" : "Registrati";
                }
            });
        }

        if(logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await supa.auth.signOut();
                updateAuthState(null);
            });
        }

        // --- ELEMENTI DOM ---
        const form = document.getElementById('insight-form');
        const submitBtn = document.getElementById('submit-btn');
        const toast = document.getElementById('toast');
        const toastTitle = document.getElementById('toast-title');
        const toastMessage = document.getElementById('toast-message');
        const toastIconI = document.getElementById('toast-icon-i');
        
        const totalPointsEl = document.getElementById('total-points');
        const weeklyProgressEl = document.getElementById('weekly-progress');
        const goalTextEl = document.getElementById('goal-text');
        const goalHintEl = document.querySelector('.goal-hint');

        const navItems = document.querySelectorAll('.nav-item[data-target], .user-profile[data-target]');
        const viewSections = document.querySelectorAll('.view-section');

        const insightsGrid = document.getElementById('insights-grid');
        const searchInput = document.getElementById('search-input');
        
        const clientListDOM = document.getElementById('client-list');
        const categoryListDOM = document.getElementById('category-list');
        const teamListDOM = document.getElementById('team-list');

        const profileTotalPoints = document.getElementById('profile-total-points');
        const profileTotalInsights = document.getElementById('profile-total-insights');
        const profileTotalUpvotes = document.getElementById('profile-total-upvotes');
        const profileInsightsGrid = document.getElementById('profile-insights-grid');

        const leaderboardInd = document.getElementById('leaderboard-individuals');
        const leaderboardTeams = document.getElementById('leaderboard-teams');

        // AI Chat DOM
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        const chatHistory = document.getElementById('chat-history');

        // --- STATO ---
        let allInsights = [];
        let draftInsights = [];
        let currentUserOrgRole = 'consulente';
        let points = 0;
        let weeklyInsights = 0;
        const weeklyGoal = 5;

        // Livello gerarchico per confronti rapidi
        const ORG_ROLE_LEVEL = {
            consulente: 0, team_leader: 1, engagement_manager: 2,
            lead: 3, practice_manager: 4, responsabile: 5, bu_manager: 6,
            marketing: 1, sales: 1, hr: 1, operations: 1, admin: 99
        };

        // true se l'utente ha almeno il livello minRole
        function hasOrgRole(minRole) {
            return (ORG_ROLE_LEVEL[currentUserOrgRole] ?? 0) >= (ORG_ROLE_LEVEL[minRole] ?? 0);
        }
        function isStaffRole(fn) { return currentUserOrgRole === fn; }
        
        // Categorie e team base (in produzione verrebbero anche questi dal DB)
        let mockCategories = ["Strategia", "Tecnologia", "Processi", "Competitor", "Cultura", "CyberSecurity"];
        let mockTeams = ["Team AI Transformation", "Team Cloud Journey", "Team Agile Governance", "Team CyberSecurity"];
        let dbClients = [];
        let userTeams = [];

        async function populateDatalists() {
            if(categoryListDOM) categoryListDOM.innerHTML = mockCategories.map(c => `<option value="${c}"></option>`).join('');
            
            // Carica clienti dal database
            try {
                const { data, error } = await supa.from('clients').select('name').order('name');
                if (!error && data) {
                    dbClients = data.map(c => c.name);
                    if(clientListDOM) clientListDOM.innerHTML = dbClients.map(c => `<option value="${c}"></option>`).join('');
                }
            } catch(e) {
                console.error('Errore caricamento clienti:', e);
            }

            // Carica i team dell'utente dal database
            try {
                if (currentUser) {
                    const { data: memberships, error: memErr } = await supa
                        .from('team_members')
                        .select('team_id')
                        .eq('user_email', currentUser);
                    
                    if (!memErr && memberships && memberships.length > 0) {
                        const teamIds = memberships.map(m => m.team_id);
                        const { data: teams, error: teamErr } = await supa
                            .from('teams')
                            .select('name')
                            .in('id', teamIds);
                        
                        if (!teamErr && teams) {
                            userTeams = teams.map(t => t.name);
                        }
                    }
                }
                // Mostra i team dell'utente, o quelli di default se non ne ha ancora
                const teamsToShow = userTeams.length > 0 ? userTeams : mockTeams;
                if(teamListDOM) teamListDOM.innerHTML = teamsToShow.map(t => `<option value="${t}"></option>`).join('');
            } catch(e) {
                console.error('Errore caricamento team:', e);
                if(teamListDOM) teamListDOM.innerHTML = mockTeams.map(t => `<option value="${t}"></option>`).join('');
            }
        }
        // Non chiamare populateDatalists qui — viene chiamato dopo login da updateAuthState

        // --- AGGIORNAMENTO UI IN BASE AL RUOLO ---
        function updateUIByRole() {
            // ── Da Validare — solo team_leader+
            const validaNav = document.querySelector('[data-target="view-valida"]');
            if (validaNav) {
                validaNav.style.display = hasOrgRole('team_leader') ? 'flex' : 'none';
            }

            // ── Nuovo Insight: solo team_leader+ può inserire
            const nuovoInsightNav = document.querySelector('[data-target="view-nuovo-insight"]');
            if (nuovoInsightNav) {
                nuovoInsightNav.style.display = hasOrgRole('team_leader') ? 'flex' : 'none';
            }

            // ── Crea Team: solo team_leader+
            const createTeamBtnEl = document.getElementById('create-team-btn');
            if (createTeamBtnEl) {
                createTeamBtnEl.style.display = hasOrgRole('team_leader') ? 'flex' : 'none';
            }

            // ── Se consulente base, redireziona a Esplora (vista default)
            if (!hasOrgRole('team_leader')) {
                const nuovoView = document.getElementById('view-nuovo-insight');
                if (nuovoView && nuovoView.classList.contains('active')) {
                    nuovoView.classList.remove('active');
                    nuovoView.classList.add('hidden');
                    const esploraView = document.getElementById('view-esplora-dati');
                    if (esploraView) {
                        esploraView.classList.remove('hidden');
                        esploraView.classList.add('active');
                    }
                    // Attiva nav item Esplora
                    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                    const esploraNav = document.querySelector('[data-target="view-esplora-dati"]');
                    if (esploraNav) esploraNav.classList.add('active');
                }
            }

            // ── Esporta CSV — solo lead+
            const exportBtn = document.getElementById('export-btn');
            if (exportBtn) exportBtn.style.display = hasOrgRole('lead') ? 'flex' : 'none';

            // ── Marketing AI — solo marketing o admin
            const marketingNav = document.querySelector('[data-target="view-marketing"]');
            if (marketingNav) marketingNav.style.display =
                (isStaffRole('marketing') || currentUserOrgRole === 'admin') ? 'flex' : 'none';

            // ── Analytics — solo practice_manager+
            const analyticsNav = document.querySelector('[data-target="view-analytics"]');
            if (analyticsNav) analyticsNav.style.display = hasOrgRole('practice_manager') ? 'flex' : 'none';

            // ── Badge ruolo org
            const orgRoleBadge = document.getElementById('org-role-badge');
            if (orgRoleBadge) {
                const labels = {
                    consulente: 'Consulente', team_leader: 'Team Leader',
                    engagement_manager: 'Engagement Manager', lead: 'Lead',
                    practice_manager: 'Practice Manager', responsabile: 'Responsabile',
                    bu_manager: 'BU Manager', marketing: 'Marketing', sales: 'Sales',
                    hr: 'HR', operations: 'Operations', admin: 'Admin'
                };
                const roleLabel = labels[currentUserOrgRole] || currentUserOrgRole;
                orgRoleBadge.textContent = roleLabel;

                // Greeting dinamico
                const hour = new Date().getHours();
                const saluto = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
                const greetingEl = document.getElementById('topbar-greeting');
                if (greetingEl) {
                    const firstName = greetingEl.dataset.firstname || roleLabel;
                    greetingEl.textContent = `${saluto}, ${firstName}`;
                }
            }
        }

        // --- UPVOTES PERSISTENTI ---
        let myUpvotedIds = new Set();

        async function loadMyUpvotes() {
            if (!currentUser) return;
            try {
                const { data, error } = await supa
                    .from('user_upvotes')
                    .select('insight_id')
                    .eq('user_email', currentUser);
                if (!error && data) {
                    myUpvotedIds = new Set(data.map(u => u.insight_id));
                }
            } catch(e) {
                console.error('Errore caricamento upvotes:', e);
            }
        }

        // --- MAGIC INSERT AI LOGIC ---
        const aiParseBtn = document.getElementById('ai-parse-btn');
        const aiRawText = document.getElementById('ai-raw-text');
        
        if (aiParseBtn && aiRawText) {
            aiParseBtn.addEventListener('click', async () => {
                const text = aiRawText.value.trim();
                if (!text) return;
                
                const origHtml = aiParseBtn.innerHTML;
                aiParseBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Elaborazione...';
                aiParseBtn.disabled = true;
                
                try {
                    const res = await fetch('/api/parse-insight', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text })
                    });
                    
                    if (!res.ok) throw new Error("Errore API");
                    const data = await res.json();
                    
                    document.getElementById('title').value = data.title || '';
                    document.getElementById('client').value = data.client || '';
                    document.getElementById('category').value = data.category || '';
                    document.getElementById('team').value = data.team || '';
                    document.getElementById('details').value = data.snippet || '';
                    
                    showToast("Magia completata", "Controlla i dati estratti e clicca Invia Insight", "fa-wand-magic-sparkles");
                } catch (err) {
                    showToast("Errore", "Impossibile analizzare il testo", "fa-triangle-exclamation", false);
                } finally {
                    aiParseBtn.innerHTML = origHtml;
                    aiParseBtn.disabled = false;
                }
            });
        }

        // --- MICROPHONE LOGIC ---
        const micBtn = document.getElementById('ai-mic-btn');
        let mediaRecorder = null;
        let audioChunks = [];
        let isRecording = false;

        if (micBtn) {
            micBtn.addEventListener('click', async () => {
                if (!isRecording) {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        mediaRecorder = new MediaRecorder(stream);
                        
                        mediaRecorder.ondataavailable = event => {
                            audioChunks.push(event.data);
                        };

                        mediaRecorder.onstop = async () => {
                            micBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                            
                            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            audioChunks = [];
                            
                            const reader = new FileReader();
                            reader.readAsDataURL(audioBlob);
                            reader.onloadend = async () => {
                                const base64data = reader.result;
                                
                                try {
                                    const res = await fetch('/api/transcribe', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ audioBase64: base64data })
                                    });
                                    if(!res.ok) throw new Error("Errore trascrizione");
                                    const data = await res.json();
                                    
                                    const currentVal = aiRawText.value;
                                    aiRawText.value = currentVal ? currentVal + " " + data.text : data.text;
                                    
                                    showToast("Trascrizione pronta", "Puoi modificare il testo o cliccare Analizza Appunti", "fa-comment-dots");
                                } catch (err) {
                                    showToast("Errore API Audio", "Assicurati di essere in cloud", "fa-microphone-slash", false);
                                } finally {
                                    micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
                                    micBtn.classList.remove('recording');
                                }
                            };
                        };

                        mediaRecorder.start();
                        isRecording = true;
                        micBtn.classList.add('recording');
                        showToast("In ascolto...", "Parla ora. Clicca di nuovo per terminare.", "fa-microphone");

                    } catch (err) {
                        alert("Devi autorizzare il microfono per usare questa funzione.");
                    }
                } else {
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                        mediaRecorder.stop();
                        mediaRecorder.stream.getTracks().forEach(track => track.stop());
                    }
                    isRecording = false;
                }
            });
        }

        // --- SPA NAVIGATION ---
        navItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                if(item.tagName === 'A') e.preventDefault();
                
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                if(item.classList.contains('nav-item')) item.classList.add('active');

                viewSections.forEach(section => {
                    section.classList.remove('active');
                    section.classList.add('hidden');
                    if(section.id === 'view-ai') section.style.display = 'none';
                });

                const targetId = item.getAttribute('data-target');
                const targetSection = document.getElementById(targetId);
                
                if(targetSection) {
                    targetSection.classList.remove('hidden');
                    targetSection.classList.add('active');
                    if(targetId === 'view-ai') targetSection.style.display = 'flex';
                    
                    if(targetId === 'view-esplora-dati') {
                        // Ricarichiamo dal db ogni volta che entra per freschezza
                        loadInsights(); 
                        renderInsights(allInsights, insightsGrid, true);
                        if(searchInput) searchInput.value = '';
                    }
                    if(targetId === 'view-valida')     renderDraftInsights();
                    if(targetId === 'view-classifica') renderLeaderboards();
                    if(targetId === 'view-profilo') renderProfile();
                }
            });
        });

        // --- FORM LOGIC (Insert in Supabase) ---
        if(form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const originalBtnText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';

                const titleVal = document.getElementById('title').value.trim();
                const clientVal = document.getElementById('client').value.trim();
                const catVal = document.getElementById('category').value.trim();
                const teamVal = document.getElementById('team').value.trim();
                const detailsVal = document.getElementById('details').value.trim();
                const confidentialityVal = document.getElementById('confidentiality')?.value || 'pubblico';
                
                try {
                    // INSERIMENTO REALE SUPABASE
                    const { data: authData } = await supa.auth.getSession();
                    const { data, error } = await supa
                        .from('insights')
                        .insert([
                            { 
                                title: titleVal, 
                                client: clientVal, 
                                category: catVal, 
                                team: teamVal, 
                                snippet: detailsVal, 
                                author_email: currentUser,
                                author_id: authData?.session?.user?.id || null,
                                upvotes: 0,
                                confidentiality: confidentialityVal
                            }
                        ]);

                    if (error) throw error;

                    points += 50; 
                    weeklyInsights += 1;
                    animateValue(totalPointsEl, points - 50, points, 1000);
                    updateProgressBar();
                    showToast("Insight Inviato!", `Hai guadagnato <strong class="highlight">+50 punti</strong> per il tuo contributo.`, "fa-check-circle");

                    form.reset(); 
                    
                    // Auto-aggiungi il cliente alla tabella clients se è nuovo
                    if (clientVal && !dbClients.includes(clientVal)) {
                        await supa.from('clients').insert([{ name: clientVal }]).single();
                        populateDatalists(); // Ricarica la lista
                    }

                    // Ricarica dati
                    loadInsights();

                    // Cambia vista
                    const esploraLink = document.querySelector('[data-target="view-esplora-dati"]');
                    if(esploraLink) esploraLink.click();

                } catch (err) {
                    console.error("Errore salvataggio:", err);
                    alert("ERRORE DATABASE: " + (err.message || JSON.stringify(err)) + "\n\nSe dice 'relation insights does not exist' significa che non hai creato la tabella su Supabase! Se dice 'new row violates row-level security' devi disabilitare RLS sulla tabella.");
                    showToast("Errore di Salvataggio", "C'è stato un problema nel salvare l'insight nel database. Riprova.", "fa-xmark", false);
                } finally {
                    submitBtn.disabled = false; 
                    submitBtn.innerHTML = originalBtnText;
                }
            });
        }

        // --- CARD RENDERER (Con Anonimato) ---
        function renderInsights(insights, container, forceAnonymous = false) {
            if(!container) return;
            container.innerHTML = '';
            
            if(insights.length === 0) {
                container.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1;">Nessun insight trovato. Sii il primo a inserirne uno!</p>';
                return;
            }

            insights.forEach(insight => {
                const card = document.createElement('div');
                card.className = 'insight-card';
                
                // Formatta Data
                const dateObj = new Date(insight.created_at);
                const dateStr = isNaN(dateObj) ? "Data sconosciuta" : dateObj.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

                // Anonimato: i team_leader+ vedono gli autori; consulenti base vedono anonimo
                const canSeeAuthor = !forceAnonymous || hasOrgRole('team_leader');
                const rawAuthor = insight.author_email || insight.author || "Utente Sconosciuto";
                const displayAuthor = canSeeAuthor ? rawAuthor : "Consulente (Anonimo)";
                const avatarUrl = canSeeAuthor
                    ? `https://ui-avatars.com/api/?name=${rawAuthor.replace('@','').replace('.',' ')}&background=1E293B&color=fff`
                    : "https://ui-avatars.com/api/?name=C+A&background=1E293B&color=94A3B8";

                // Confidenzialità: badge e oscuramento cliente
                const conf = insight.confidentiality || 'pubblico';
                const confBadge = conf === 'segreto'
                    ? `<span class="badge" style="background:rgba(239,68,68,0.1);color:#EF4444;font-size:0.7rem;"><i class="fa-solid fa-lock"></i> Segreto</span>`
                    : conf === 'riservato'
                    ? `<span class="badge" style="background:rgba(245,158,11,0.1);color:#F59E0B;font-size:0.7rem;"><i class="fa-solid fa-eye-slash"></i> Riservato</span>`
                    : '';
                const displayClient = conf === 'riservato' ? 'Cliente Riservato' : (insight.client || 'N/A');

                // Upvote
                const isMyInsight = (insight.author_email || insight.author) === currentUser;
                const alreadyUpvoted = myUpvotedIds.has(insight.id);
                let upvoteHtml;
                if (isMyInsight) {
                    upvoteHtml = `<span style="font-size: 0.8rem; color: var(--text-muted);"><i class="fa-solid fa-check"></i> Utile (${insight.upvotes || 0})</span>`;
                } else if (alreadyUpvoted) {
                    upvoteHtml = `<button class="btn-upvote upvoted" data-id="${insight.id}" disabled><i class="fa-solid fa-check-double"></i> Utile <span class="upvote-count">(${insight.upvotes || 0})</span></button>`;
                } else {
                    upvoteHtml = `<button class="btn-upvote" data-id="${insight.id}"><i class="fa-solid fa-check"></i> Utile <span class="upvote-count">(${insight.upvotes || 0})</span></button>`;
                }

                // Elimina: autore, oppure responsabile+
                const canDelete = isMyInsight || hasOrgRole('responsabile');
                const deleteHtml = canDelete
                    ? `<button class="btn-delete-insight" data-id="${insight.id}" style="background:transparent;border:1px solid rgba(239,68,68,0.3);color:var(--danger);padding:0.35rem 0.75rem;border-radius:var(--radius-full);font-size:0.8rem;display:flex;align-items:center;gap:0.4rem;" title="Elimina insight"><i class="fa-solid fa-trash-can"></i></button>`
                    : '';

                card.innerHTML = `
                    <div class="card-header">
                        <div class="card-badges">
                            <span class="badge badge-client"><i class="fa-solid fa-building"></i> ${displayClient}</span>
                            <span class="badge badge-category"><i class="fa-solid fa-tag"></i> ${insight.category || 'N/A'}</span>
                            <span class="badge badge-team"><i class="fa-solid fa-users"></i> ${insight.team || 'N/A'}</span>
                            ${confBadge}
                        </div>
                    </div>
                    <h3 class="card-title">${insight.title || 'Senza Titolo'}</h3>
                    <p class="card-snippet">${insight.snippet || ''}</p>
                    <div class="card-footer">
                        <div class="card-author">
                            <img src="${avatarUrl}" alt="Author">
                            <span>${displayAuthor} • ${dateStr}</span>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            ${upvoteHtml}
                            ${deleteHtml}
                        </div>
                    </div>
                `;
                container.appendChild(card);

            }); // fine forEach insights
            // Gestione UPVOTE (Update in Supabase)
            container.querySelectorAll('.btn-upvote').forEach(btn => {
                btn.addEventListener('click', async function() {
                    if(this.classList.contains('upvoted')) return;
                    
                    const id = this.getAttribute('data-id');
                    const targetInsight = allInsights.find(i => i.id == id);
                    if(!targetInsight) return;

                    const newUpvotes = (targetInsight.upvotes || 0) + 1;
                    
                    // Ottimistica
                    this.classList.add('upvoted');
                    const countSpan = this.querySelector('.upvote-count');
                    countSpan.textContent = `(${newUpvotes})`;
                    this.innerHTML = `<i class="fa-solid fa-check-double"></i> Utile <span class="upvote-count">(${newUpvotes})</span>`;
                    
                    targetInsight.upvotes = newUpvotes;

                    // Update Supabase
                    try {
                        await supa.from('insights').update({ upvotes: newUpvotes }).eq('id', id);
                        // Salva l'upvote in modo persistente
                        await supa.from('user_upvotes').insert([{ user_email: currentUser, insight_id: id }]);
                        myUpvotedIds.add(id);
                        showToast("Feedback Registrato", `Hai validato questa informazione. L'autore riceverà <strong class="highlight">+10 punti</strong>.`, "fa-check-double", true);
                    } catch (err) {
                        console.error("Errore upvote", err);
                    }
                });
            });

            // Gestione ELIMINA INSIGHT
            container.querySelectorAll('.btn-delete-insight').forEach(btn => {
                btn.addEventListener('click', async function() {
                    const id = this.getAttribute('data-id');
                    if (!confirm('Sei sicuro di voler eliminare questo insight?')) return;
                    
                    try {
                        const { error } = await supa.from('insights').delete().eq('id', id);
                        if (error) throw error;
                        
                        // Rimuovi dalla lista locale
                        allInsights = allInsights.filter(i => i.id != id);
                        showToast("Insight Eliminato", "L'insight è stato rimosso dal database.", "fa-trash-can");
                        
                        // Ricarica la vista profilo
                        renderProfile();
                    } catch (err) {
                        console.error('Errore eliminazione:', err);
                        showToast("Errore", "Impossibile eliminare l'insight.", "fa-triangle-exclamation", false);
                    }
                });
            });
        }

        if(searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                if(query === '') { renderInsights(allInsights, insightsGrid, true); return; }
                const filtered = allInsights.filter(insight => {
                    return (insight.title || '').toLowerCase().includes(query) || 
                           (insight.client || '').toLowerCase().includes(query) ||
                           (insight.category || '').toLowerCase().includes(query) || 
                           (insight.team || '').toLowerCase().includes(query) ||
                           (insight.snippet || '').toLowerCase().includes(query);
                });
                renderInsights(filtered, insightsGrid, true);
            });
        }

        // --- LEADERBOARD & PROFILE ---
        function renderLeaderboards() {
            if(!leaderboardInd || !leaderboardTeams) return;
            const userScores = {};
            allInsights.forEach(i => {
                const author = i.author_email || i.author || 'Anonimo';
                if(!userScores[author]) userScores[author] = { points: 0, insights: 0 };
                userScores[author].points += 50 + ((i.upvotes || 0) * 10);
                userScores[author].insights += 1;
            });

            // Aggiungi l'utente corrente solo se ha davvero inserito insight
            if(currentUser && !userScores[currentUser] && points > 0) {
                userScores[currentUser] = { points, insights: allInsights.filter(i => (i.author_email || i.author) === currentUser).length };
            }

            leaderboardInd.innerHTML = Object.keys(userScores)
                .map(u => ({ name: u, ...userScores[u] }))
                .sort((a, b) => b.points - a.points).slice(0, 10)
                .map((u, idx) => `
                <li class="leaderboard-item rank-${idx+1}">
                    <div class="rank-info">
                        <div class="rank-number">${idx+1}</div>
                        <div class="player-details">
                            <img src="https://ui-avatars.com/api/?name=${u.name.replace(' ', '+')}&background=1E293B&color=fff" alt="${u.name}">
                            <div><span class="player-name">${u.name}</span><span class="player-team">${u.insights} Insight condivisi</span></div>
                        </div>
                    </div>
                    <div class="score-badge">${u.points} pt</div>
                </li>`).join('');

            const teamScores = {};
            allInsights.forEach(i => {
                const t = i.team || 'Senza Team';
                if(!teamScores[t]) teamScores[t] = { points: 0, insightCount: 0 };
                teamScores[t].points += 50 + ((i.upvotes || 0) * 10);
                teamScores[t].insightCount += 1;
            });

            leaderboardTeams.innerHTML = Object.keys(teamScores)
                .map(t => ({ name: t, ...teamScores[t] }))
                .sort((a, b) => b.points - a.points).slice(0, 5)
                .map((t, idx) => `
                <li class="leaderboard-item rank-${idx+1}">
                    <div class="rank-info">
                        <div class="rank-number">${idx+1}</div>
                        <div class="player-details">
                            <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); display:flex; align-items:center; justify-content:center; color: var(--success); font-size: 1.2rem;"><i class="fa-solid fa-users"></i></div>
                            <div><span class="player-name">${t.name}</span><span class="player-team">${t.insightCount} Insight validati</span></div>
                        </div>
                    </div>
                    <div class="score-badge" style="color: var(--success); background: rgba(16, 185, 129, 0.1);">${t.points} pt</div>
                </li>`).join('');
        }

        function renderProfileStats() {
            const myInsights = allInsights.filter(i => (i.author_email || i.author) === currentUser);
            const myUpvotes = myInsights.reduce((sum, i) => sum + (i.upvotes || 0), 0);
            const realTotalPoints = points + (myUpvotes * 10); 
            animateValue(profileTotalPoints, 0, realTotalPoints, 800);
            animateValue(profileTotalInsights, 0, myInsights.length, 800);
            animateValue(profileTotalUpvotes, 0, myUpvotes, 800);
        }
        
        function renderProfile() {
            renderProfileStats();
            renderInsights(allInsights.filter(i => (i.author_email || i.author) === currentUser), profileInsightsGrid, false);
            loadUserTeams();

            // Crea Team — solo team_leader+
            const createTeamBtn = document.getElementById('create-team-btn');
            if (createTeamBtn) {
                createTeamBtn.style.display = hasOrgRole('team_leader') ? 'flex' : 'none';
            }
        }

        // --- TEAM MANAGEMENT ---
        async function loadUserTeams() {
            const teamsGrid = document.getElementById('teams-grid');
            const noTeamsMsg = document.getElementById('no-teams-msg');
            if (!teamsGrid) return;

            try {
                // 1. Trova tutti i team_id di cui l'utente è membro
                const { data: memberships, error: memErr } = await supa
                    .from('team_members')
                    .select('team_id')
                    .eq('user_email', currentUser);

                if (memErr) throw memErr;

                if (!memberships || memberships.length === 0) {
                    teamsGrid.innerHTML = '';
                    if (noTeamsMsg) noTeamsMsg.style.display = 'block';
                    return;
                }
                if (noTeamsMsg) noTeamsMsg.style.display = 'none';

                const teamIds = memberships.map(m => m.team_id);

                // 2. Carica i dettagli dei team
                const { data: teams, error: teamErr } = await supa
                    .from('teams')
                    .select('*')
                    .in('id', teamIds);

                if (teamErr) throw teamErr;

                // 3. Carica tutti i membri dei team trovati
                const { data: allMembers, error: allMemErr } = await supa
                    .from('team_members')
                    .select('*')
                    .in('team_id', teamIds);

                if (allMemErr) throw allMemErr;

                // 4. Renderizza le card
                teamsGrid.innerHTML = teams.map(team => {
                    const members = allMembers.filter(m => m.team_id === team.id);
                    const membersHtml = members.map(m => {
                        const name = m.user_name || m.user_email.split('@')[0];
                        return `<div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0;">
                            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1E293B&color=fff&size=28" style="width: 28px; height: 28px; border-radius: 50%;">
                            <span style="font-size: 0.85rem; color: var(--text-secondary);">${name}</span>
                        </div>`;
                    }).join('');

                    return `<div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.5rem; transition: var(--transition);"
                        onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-lg)'"
                        onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">
                            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-primary); font-size: 1.1rem;">
                                <i class="fa-solid fa-users"></i>
                            </div>
                            <div>
                                <h4 style="color: var(--text-primary); font-size: 1rem;">${team.name}</h4>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">${members.length} membr${members.length === 1 ? 'o' : 'i'}</span>
                            </div>
                        </div>
                        <div>${membersHtml}</div>
                    </div>`;
                }).join('');

            } catch (err) {
                console.error('Errore caricamento team:', err);
                teamsGrid.innerHTML = '<p style="color: var(--danger);">Errore nel caricamento dei team.</p>';
            }
        }

        // Gestione creazione team
        const createTeamBtn = document.getElementById('create-team-btn');
        const createTeamForm = document.getElementById('create-team-form');
        const cancelTeamBtn = document.getElementById('cancel-team-btn');
        const saveTeamBtn = document.getElementById('save-team-btn');

        if (createTeamBtn && createTeamForm) {
            createTeamBtn.addEventListener('click', () => {
                createTeamForm.style.display = 'block';
                createTeamBtn.style.display = 'none';
            });
        }
        if (cancelTeamBtn) {
            cancelTeamBtn.addEventListener('click', () => {
                createTeamForm.style.display = 'none';
                if (createTeamBtn) createTeamBtn.style.display = 'flex';
            });
        }
        if (saveTeamBtn) {
            saveTeamBtn.addEventListener('click', async () => {
                const teamName = document.getElementById('new-team-name')?.value.trim();
                const membersText = document.getElementById('new-team-members')?.value.trim();

                if (!teamName) { alert('Inserisci un nome per il team'); return; }

                saveTeamBtn.disabled = true;
                saveTeamBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creazione...';

                try {
                    // 1. Crea il team
                    const { data: newTeam, error: teamErr } = await supa
                        .from('teams')
                        .insert([{ name: teamName, created_by: currentUser }])
                        .select()
                        .single();

                    if (teamErr) throw teamErr;

                    // 2. Prepara la lista membri (il creatore + quelli inseriti)
                    const { data: { session: s } } = await supa.auth.getSession();
                    const creatorMeta = s?.user?.user_metadata || {};
                    const creatorName = (creatorMeta.first_name && creatorMeta.last_name)
                        ? `${creatorMeta.first_name} ${creatorMeta.last_name}`
                        : currentUser.split('@')[0];

                    const membersToInsert = [{ team_id: newTeam.id, user_email: currentUser, user_name: creatorName }];

                    if (membersText) {
                        const emails = membersText.split('\n').map(e => e.trim()).filter(e => e && e.includes('@'));
                        emails.forEach(email => {
                            if (email !== currentUser) {
                                membersToInsert.push({ team_id: newTeam.id, user_email: email, user_name: email.split('@')[0] });
                            }
                        });
                    }

                    const { error: memErr } = await supa.from('team_members').insert(membersToInsert);
                    if (memErr) throw memErr;

                    // 3. Reset form e ricarica
                    document.getElementById('new-team-name').value = '';
                    document.getElementById('new-team-members').value = '';
                    createTeamForm.style.display = 'none';
                    if (createTeamBtn) createTeamBtn.style.display = 'flex';

                    showToast("Team Creato!", `"${teamName}" è stato creato con ${membersToInsert.length} membr${membersToInsert.length === 1 ? 'o' : 'i'}.`, "fa-people-group");
                    loadUserTeams();

                } catch (err) {
                    console.error('Errore creazione team:', err);
                    showToast("Errore", "Impossibile creare il team: " + err.message, "fa-triangle-exclamation", false);
                } finally {
                    saveTeamBtn.disabled = false;
                    saveTeamBtn.innerHTML = '<i class="fa-solid fa-check"></i> Crea';
                }
            });
        }

        // --- AI ASSISTANT LOGIC (Call Vercel API with Groq) ---
        if(chatForm) {
            chatForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const text = chatInput.value.trim();
                if(!text) return;

                // Messaggio Utente
                appendChatMessage('user', text);
                chatInput.value = '';

                // Typing Indicator
                const typingId = appendTypingIndicator();
                chatHistory.scrollTop = chatHistory.scrollHeight;

                try {
                    // Chiamata alla Serverless Function (se su Vercel)
                    // NOTA: Se si è in locale senza Vercel CLI, questa API potrebbe dare 404,
                    // in produzione funzionerà perfettamente.
                    const response = await fetch('/api/ask-brain', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: text })
                    });
                    
                    if (!response.ok) {
                        throw new Error("Errore API Network: " + response.status);
                    }

                    const data = await response.json();
                    
                    document.getElementById(typingId).remove();
                    
                    // Converte Markdown a HTML basico se necessario, oppure Groq risponde già formattato bene
                    const formattedAnswer = data.answer.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    appendChatMessage('ai', formattedAnswer);
                    
                } catch (error) {
                    console.error("AI Error:", error);
                    document.getElementById(typingId).remove();
                    appendChatMessage('ai', "Si è verificato un errore di connessione al cervello aziendale. Assicurati che l'app sia deploiata su Vercel affinché l'API Groq funzioni.");
                }

                chatHistory.scrollTop = chatHistory.scrollHeight;
            });
        }

        function appendChatMessage(sender, htmlContent) {
            const div = document.createElement('div');
            div.className = `chat-message ${sender}`;
            const avatarIcon = sender === 'ai' ? 'fa-robot' : 'fa-user';
            div.innerHTML = `
                <div class="msg-avatar"><i class="fa-solid ${avatarIcon}"></i></div>
                <div class="msg-content">${htmlContent}</div>
            `;
            chatHistory.appendChild(div);
        }

        function appendTypingIndicator() {
            const id = 'typing-' + Date.now();
            const div = document.createElement('div');
            div.className = `chat-message ai`;
            div.id = id;
            div.innerHTML = `
                <div class="msg-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="msg-content">
                    <div class="typing-indicator"><span></span><span></span><span></span></div>
                </div>
            `;
            chatHistory.appendChild(div);
            return id;
        }

        function updateProgressBar() {
            const percentage = Math.min((weeklyInsights / weeklyGoal) * 100, 100);
            weeklyProgressEl.style.width = `${percentage}%`;
            goalTextEl.textContent = `${weeklyInsights}/${weeklyGoal} Insight`;

            if (weeklyInsights >= weeklyGoal) {
                goalHintEl.innerHTML = `<i class="fa-solid fa-trophy" style="color: #F59E0B"></i> Hai raggiunto l'obiettivo settimanale! Ottimo lavoro.`;
                goalHintEl.style.color = '#10B981';
            } else {
                const remaining = weeklyGoal - weeklyInsights;
                goalHintEl.textContent = `Ancora ${remaining} insight per sbloccare il badge "Observer della Settimana"!`;
            }
        }

        function showToast(title, message, iconClass, success = true) {
            toastTitle.textContent = title;
            toastMessage.innerHTML = message;
            toastIconI.className = `fa-solid ${iconClass}`;
            
            if(!success) {
                toast.style.borderLeftColor = "var(--accent-primary)";
                toastIconI.style.color = "var(--accent-primary)";
            } else {
                toast.style.borderLeftColor = "var(--success)";
                toastIconI.style.color = "var(--success)";
            }

            toast.classList.remove('hidden');
            void toast.offsetWidth; 
            toast.classList.add('show');

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    toast.classList.add('hidden');
                }, 400);
            }, 4000);
        }

        function animateValue(obj, start, end, duration) {
            if(!obj) return;
            let startTimestamp = null;
            const step = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                obj.innerHTML = Math.floor(progress * (end - start) + start);
                if (progress < 1) {
                    window.requestAnimationFrame(step);
                }
            };
            window.requestAnimationFrame(step);
        }
        
        // --- FUNZIONI SUPABASE DATA FETCH ---
        async function loadInsights() {
            try {
                const { data, error } = await supa
                    .from('insights')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (error) {
                    console.error("Errore fetch Supabase:", error);
                    return;
                }
                
                const all = data || [];

                // Esplora mostra solo pubblicati + le mie bozze
                allInsights = all.filter(i =>
                    i.status === 'pubblicato' ||
                    (i.author_email || i.author) === currentUser
                );

                // Bozze da validare: tutte le bozze non mie (per chi può validare)
                draftInsights = all.filter(i =>
                    i.status === 'bozza' &&
                    (i.author_email || i.author) !== currentUser
                );

                // Calcolo badge milestone
                const myAll = all.filter(i => (i.author_email || i.author) === currentUser);
                checkAndAwardBadges(myAll);

                // Aggiorna contatore "Da Validare" nel menu
                const validaBadge = document.getElementById('valida-count-badge');
                if (validaBadge) {
                    validaBadge.textContent = draftInsights.length;
                    validaBadge.style.display = draftInsights.length > 0 ? 'inline-flex' : 'none';
                }

                // Refresh viste aperte
                if (document.getElementById('view-esplora-dati')?.classList.contains('active')) {
                    renderInsights(allInsights, insightsGrid);
                }
                if (document.getElementById('view-valida')?.classList.contains('active')) {
                    renderDraftInsights();
                }
                if (document.getElementById('view-profilo')?.classList.contains('active')) {
                    renderProfile();
                }

            } catch (e) {
                console.error("Errore caricamento DB:", e);
            }
        }

        // ─── UTILS ───────────────────────────────────────────────────────────
        function formatDate(iso) {
            const d = new Date(iso);
            return isNaN(d) ? 'Data sconosciuta'
                : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
        }

        // ─── BADGE MILESTONE ──────────────────────────────────────────────────
        const BADGE_DEFINITIONS = {
            primo_insight:     { label: '🌱 Primo Passo',        desc: 'Hai inserito il tuo primo insight' },
            insight_5:         { label: '📚 Knowledge Builder',  desc: 'Hai inserito 5 insight' },
            insight_10:        { label: '🧠 Expert Contributor', desc: 'Hai inserito 10 insight' },
            prima_validazione: { label: '✅ Validato!',           desc: 'Il tuo primo insight è stato validato' },
            validazioni_5:     { label: '🏅 Affidabile',         desc: '5 tuoi insight validati dalla community' },
            team_player:       { label: '🤝 Team Player',        desc: 'Hai validato 3 insight di colleghi' },
            knowledge_sharer:  { label: '💡 Knowledge Sharer',   desc: 'Hai ricevuto 10 upvote totali' },
        };

        async function checkAndAwardBadges(myInsights) {
            const toAward = [];
            const published = myInsights.filter(i => i.status === 'pubblicato');

            if (myInsights.length >= 1)  toAward.push('primo_insight');
            if (myInsights.length >= 5)  toAward.push('insight_5');
            if (myInsights.length >= 10) toAward.push('insight_10');
            if (published.length >= 1)   toAward.push('prima_validazione');
            if (published.length >= 5)   toAward.push('validazioni_5');
            const myUpvotes = myInsights.reduce((s, i) => s + (i.upvotes || 0), 0);
            if (myUpvotes >= 10) toAward.push('knowledge_sharer');

            for (const key of toAward) {
                // upsert con onConflict — non genera errori se già esiste
                await supa.from('badges')
                    .upsert({ user_email: currentUser, badge_key: key }, { onConflict: 'user_email,badge_key', ignoreDuplicates: true });
            }
        }

        async function renderDraftInsights() {
            const container = document.getElementById('draft-insights-grid');
            if (!container) return;
            container.innerHTML = '<p style="color:var(--text-muted);">Caricamento...</p>';

            // Carica direttamente dal DB tutte le bozze non mie
            const { data, error } = await supa
                .from('insights')
                .select('*')
                .eq('status', 'bozza')
                .neq('author_email', currentUser)
                .order('created_at', { ascending: false });

            if (error) {
                container.innerHTML = '<p style="color:var(--danger);">Errore caricamento bozze.</p>';
                return;
            }

            let toShow = data || [];

            // team_leader vede solo bozze del proprio team; responsabile+ vede tutte
            if (!hasOrgRole('responsabile') && toShow.length > 0) {
                const { data: memberships } = await supa
                    .from('team_members').select('team_id').eq('user_email', currentUser);
                const { data: myTeams } = await supa
                    .from('teams').select('name')
                    .in('id', (memberships || []).map(m => m.team_id));
                const myTeamNames = (myTeams || []).map(t => t.name);
                toShow = toShow.filter(i => !i.team || myTeamNames.includes(i.team));
            }

            container.innerHTML = '';

            if (toShow.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;padding:2rem 0;">Nessun insight in attesa di validazione. Ottimo lavoro del team!</p>';
                return;
            }

            toShow.forEach(insight => {
                const card = document.createElement('div');
                card.className = 'insight-card';
                card.style.border = '1px solid rgba(245,158,11,0.4)';
                const dateStr = formatDate(insight.created_at);
                const rawAuthor = insight.author_email || 'Utente Sconosciuto';
                card.innerHTML = `
                    <div class="card-header">
                        <div class="card-badges">
                            <span class="badge badge-client"><i class="fa-solid fa-building"></i> ${insight.client || 'N/A'}</span>
                            <span class="badge badge-category"><i class="fa-solid fa-tag"></i> ${insight.category || 'N/A'}</span>
                            <span class="badge badge-team"><i class="fa-solid fa-users"></i> ${insight.team || 'N/A'}</span>
                            <span class="badge" style="background:rgba(245,158,11,0.1);color:#F59E0B;font-size:0.7rem;">
                                <i class="fa-solid fa-clock"></i> In attesa
                            </span>
                        </div>
                    </div>
                    <h3 class="card-title">${insight.title || 'Senza Titolo'}</h3>
                    <p class="card-snippet">${insight.snippet || ''}</p>
                    <div class="card-footer">
                        <div class="card-author">
                            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(rawAuthor)}&background=1E293B&color=fff" alt="Author">
                            <span>${rawAuthor} • ${dateStr}</span>
                        </div>
                        <button class="btn-valida btn-primary" data-id="${insight.id}"
                            style="padding:0.4rem 1rem;font-size:0.85rem;background:rgba(16,185,129,0.15);
                                   color:#10B981;border:1px solid rgba(16,185,129,0.3);">
                            <i class="fa-solid fa-check-circle"></i> Valida
                        </button>
                    </div>
                `;
                container.appendChild(card);
            });

            container.querySelectorAll('.btn-valida').forEach(btn => {
                btn.addEventListener('click', async function () {
                    const id = this.getAttribute('data-id');
                    this.disabled = true;
                    this.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    try {
                        const { error } = await supa.from('insights').update({
                            status: 'pubblicato',
                            validated_by: currentUser,
                            validated_at: new Date().toISOString()
                        }).eq('id', id);
                        if (error) throw error;
                        await supa.from('badges').upsert(
                            { user_email: currentUser, badge_key: 'team_player' },
                            { onConflict: 'user_email,badge_key', ignoreDuplicates: true }
                        );
                        showToast('Insight Validato!', 'L\'insight è ora visibile a tutti i consulenti.', 'fa-check-circle');
                        await loadInsights();
                        renderDraftInsights();
                    } catch (err) {
                        showToast('Errore', 'Impossibile validare: ' + err.message, 'fa-triangle-exclamation', false);
                        this.disabled = false;
                        this.innerHTML = '<i class="fa-solid fa-check-circle"></i> Valida';
                    }
                });
            });
        }

    } catch(err) {
        document.body.innerHTML += `<div style="position:fixed;top:0;left:0;right:0;background:red;color:white;padding:20px;z-index:99999;">JS ERROR: ${err.message} <br> ${err.stack}</div>`;
        console.error(err);
    }
})();