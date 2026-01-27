import { auth, db } from './firebase.js';
// IMPORTANTE: Aquí están todos los imports necesarios, incluido orderBy
import { collection, addDoc, getDocs, getDoc, query, where, doc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();

// Variables Globales
let coordenadasReporte = { lat: -2.14, lng: -79.96 }; 
let coordenadasAlertaDueño = null;

// ==========================================
// 1. CARGA INICIAL
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("PAWI System: Iniciando...");

    // A) Lógica de QR (Encontrado)
    if (window.location.pathname.includes('encontrado.html')) {
        await handleFoundPage();
        return; // Detenemos el resto si estamos en la página pública
    }

    // B) Lógica de Reporte Público
    const publicForm = document.getElementById('publicReportForm');
    if (publicForm) handlePublicReport(publicForm);

    // C) Autenticación y Rutas Protegidas
    onAuthStateChanged(auth, async (user) => {
        const path = window.location.pathname;
        const protegidas = ['dashboard', 'mis_mascotas', 'generar_alerta', 'foro'];
        
        // Si no hay usuario y trata de entrar a una protegida -> Login
        if (!user && protegidas.some(p => path.includes(p))) {
            window.location.href = 'login.html';
            return;
        }

        // Si hay usuario -> Cargar interfaz
        if (user) await inicializarInterfazUsuario(user);
    });

    // D) Configurar Formularios (Login, Registro, Mascotas)
    setupForms();
});

// ==========================================
// 2. CONFIGURACIÓN DE FORMULARIOS
// ==========================================
function setupForms() {
    // Registro de Usuario
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const tipo = document.getElementById('signupType').value;
            const btn = signupForm.querySelector('.btn-submit');
            
            try {
                btn.disabled = true; btn.textContent = "Creando...";
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                
                // Formato de nombre (Primera mayúscula)
                const fullName = nombre.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
                
                await addDoc(collection(db, "users"), {
                    uid: cred.user.uid, fullName, email, userType: tipo, createdAt: new Date()
                });
                
                localStorage.setItem('pawi_user_name', fullName);
                window.location.href = 'dashboard.html';
            } catch (err) { alert("Error: " + err.message); btn.disabled = false; }
        });
    }

    // Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('.btn-submit');
            try {
                btn.disabled = true; btn.textContent = "Ingresando...";
                const email = document.getElementById('loginEmail').value;
                const password = document.getElementById('loginPassword').value;
                const cred = await signInWithEmailAndPassword(auth, email, password);
                
                // Guardar nombre en caché para velocidad
                const q = query(collection(db, "users"), where("uid", "==", cred.user.uid));
                const snap = await getDocs(q);
                if (!snap.empty) localStorage.setItem('pawi_user_name', snap.docs[0].data().fullName);
                
                window.location.href = 'dashboard.html';
            } catch (error) { alert("Credenciales incorrectas."); btn.disabled = false; btn.textContent = "Iniciar Sesión"; }
        });
    }

    // Registro de Mascota
    const petForm = document.getElementById('petRegisterForm');
    if (petForm) {
        petForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = petForm.querySelector('.btn-submit');
            btn.disabled = true; btn.textContent = "Guardando...";
            try {
                const user = auth.currentUser;
                const imgElement = document.getElementById('previewImage');
                const photoSrc = imgElement.src.includes('base64') || imgElement.src.includes('http') ? imgElement.src : 'https://cdn-icons-png.flaticon.com/512/616/616408.png';
                
                await addDoc(collection(db, "pets"), {
                    ownerId: user.uid,
                    name: document.getElementById('petName').value,
                    age: document.getElementById('petAge').value,
                    description: document.getElementById('petDesc').value,
                    photo: photoSrc,
                    createdAt: new Date()
                });
                
                localStorage.removeItem('pawi_cached_pets'); // Limpiar caché
                alert("¡Mascota registrada!");
                window.location.href = 'mis_mascotas.html';
            } catch (err) { console.error(err); alert("Error al registrar."); btn.disabled = false; }
        });
    }
}

// ==========================================
// 3. INTERFAZ DE USUARIO (Dashboard, Nav)
// ==========================================
async function inicializarInterfazUsuario(user) {
    // Cargar nombre del usuario
    let fullName = localStorage.getItem('pawi_user_name');
    if (!fullName) {
        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
            fullName = snap.docs[0].data().fullName;
            localStorage.setItem('pawi_user_name', fullName);
        }
    }
    
    // Actualizar elementos visuales
    if (fullName) {
        const els = { 
            welcome: document.getElementById('welcomeName'), 
            nav: document.getElementById('navUserName'), 
            display: document.getElementById('displayUserName'), 
            avatar: document.getElementById('forumUserInitials') 
        };
        const first = fullName.split(' ')[0];
        if(els.welcome) els.welcome.textContent = first;
        if(els.nav) els.nav.textContent = fullName;
        if(els.display) els.display.textContent = fullName;
        if(els.avatar) els.avatar.textContent = first.charAt(0).toUpperCase();
    }

    // Cargas específicas por página
    if (document.getElementById('petsContainer')) loadUserPets(user.uid);
    if (document.getElementById('alertPetSelector')) loadPetsForAlert(user.uid);
}

// ==========================================
// 4. FUNCIONALIDAD: MIS MASCOTAS
// ==========================================
async function loadUserPets(userId) {
    const grid = document.getElementById('petsContainer');
    if (!grid) return;

    // Intentar caché primero
    const cachedData = localStorage.getItem('pawi_cached_pets');
    if (cachedData) renderPetsToGrid(JSON.parse(cachedData), grid);
    else grid.innerHTML = "<p style='grid-column: 1/-1; text-align: center;'>Cargando mascotas...</p>";

    try {
        const q = query(collection(db, "pets"), where("ownerId", "==", userId));
        const snap = await getDocs(q);
        let list = [];
        
        // Simulación para usuario demo "Stephanie"
        const name = localStorage.getItem('pawi_user_name') || "";
        if (name.toLowerCase().includes('stephanie')) {
            list.push({ id: 's1', name: 'Max', age: '9 Años', description: 'Husky...', photo: 'Max01.png' }, { id: 's2', name: 'Tommy', age: '8 Meses', description: 'Gato...', photo: 'Tommy01.jpeg' });
        }

        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        localStorage.setItem('pawi_cached_pets', JSON.stringify(list));
        renderPetsToGrid(list, grid);
    } catch (e) { console.error(e); }
}

function renderPetsToGrid(list, grid) {
    if (list.length === 0) { grid.innerHTML = "<p style='text-align:center'>No tienes mascotas registradas.</p>"; return; }
    grid.innerHTML = ""; 
    
    list.forEach(p => {
        // Generar enlace QR dinámico
        const currentUrl = window.location.href;
        const basePath = currentUrl.substring(0, currentUrl.lastIndexOf('/'));
        const fullLink = `${basePath}/encontrado.html?id=${p.id}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(fullLink)}`;

        grid.innerHTML += `
            <div class="pet-card" style="background: white; border-radius: 20px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); text-align: center; border: 1px solid #f0f0f0;">
                <div style="width: 100%; height: 160px; overflow: hidden; border-radius: 12px; margin-bottom: 12px;">
                    <img src="${p.photo}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://cdn-icons-png.flaticon.com/512/616/616408.png'">
                </div>
                <div style="margin-bottom: 15px;">
                    <div style="color: #ff9800; font-weight: 800; font-size: 1.2rem; margin-bottom: 4px;">${p.name}</div>
                    <div style="color: #666; font-size: 0.9rem; margin-bottom: 6px;">${p.age || 'Edad no definida'}</div>
                    <p style="color: #888; font-size: 0.85rem; line-height: 1.4; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.description || ''}</p>
                </div>
                <div style="border-top: 1px dashed #eee; padding-top: 15px; margin-top: 10px;">
                    <div style="margin-bottom: 15px; display: flex; justify-content: center;">
                        <img src="${qrUrl}" style="width: 90px; height: 90px; border: 4px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button class="btn-delete" data-id="${p.id}" data-name="${p.name}" style="flex: 1; background: #fff5f5; border: 1px solid #fee2e2; color: #e53e3e; padding: 8px; border-radius: 10px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">Eliminar</button>
                    </div>
                </div>
            </div>`;
    });

    // Activar botones eliminar
    grid.querySelectorAll('.btn-delete').forEach(btn => {
        btn.onclick = async function() {
            if (confirm("¿Estás seguro de eliminar a " + this.getAttribute('data-name') + "?")) { 
                try { 
                    await deleteDoc(doc(db, "pets", this.getAttribute('data-id'))); 
                    localStorage.removeItem('pawi_cached_pets'); 
                    location.reload(); 
                } catch (e) { alert("Error al eliminar."); }
            }
        };
    });
}

// ==========================================
// 5. FUNCIONALIDAD: GENERAR ALERTA (DUEÑO)
// ==========================================
async function loadPetsForAlert(userId) {
    const selector = document.getElementById('alertPetSelector');
    if(!selector) return;
    
    // Carga de mascotas para el selector
    const q = query(collection(db, "pets"), where("ownerId", "==", userId));
    const snap = await getDocs(q);
    selector.innerHTML = "";
    
    if (snap.empty) { selector.innerHTML = "<p>No tienes mascotas registradas.</p>"; return; }

    snap.forEach(doc => {
        const pet = doc.data();
        const div = document.createElement('div');
        div.className = 'pet-option';
        div.dataset.id = doc.id;
        div.dataset.name = pet.name;
        div.innerHTML = `<img src="${pet.photo}" class="pet-thumb"><span>${pet.name}</span>`;
        div.onclick = () => { 
            document.querySelectorAll('.pet-option').forEach(o => o.classList.remove('selected')); 
            div.classList.add('selected'); 
        };
        selector.appendChild(div);
    });

    // Botón GPS
    const btnGps = document.getElementById('btnGetGps');
    if(btnGps) {
        btnGps.onclick = () => {
            if(!navigator.geolocation) return alert("Tu navegador no soporta GPS");
            btnGps.innerText = "⏳ Buscando...";
            navigator.geolocation.getCurrentPosition(pos => {
                coordenadasAlertaDueño = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                btnGps.innerText = "✅ Ubicación Lista";
                btnGps.style.background = "#dcfce7";
                btnGps.style.color = "#166534";
            }, () => { alert("Permite el acceso al GPS."); btnGps.innerText = "Error GPS"; });
        };
    }

    // Botón Publicar Alerta
    const btnLanzar = document.getElementById('btnLanzarAlerta');
    if(btnLanzar) {
        btnLanzar.onclick = async () => {
            const selected = document.querySelector('.pet-option.selected');
            const lastSeen = document.getElementById('lastSeen').value;
            const extra = document.getElementById('extraInfo').value;

            if(!selected) return alert("Selecciona qué mascota se perdió.");
            if(!lastSeen) return alert("Escribe dónde fue vista por última vez.");

            try {
                btnLanzar.disabled = true; btnLanzar.innerText = "Publicando...";
                await addDoc(collection(db, "alerts"), {
                    authorName: localStorage.getItem('pawi_user_name'),
                    ownerEmail: auth.currentUser.email,
                    petName: selected.dataset.name,
                    petPhoto: selected.querySelector('img').src,
                    content: extra || `¡Ayuda! ${selected.dataset.name} se ha perdido.`,
                    lastSeenLocation: lastSeen,
                    gps: coordenadasAlertaDueño,
                    status: 'active',
                    ownerId: userId,
                    timestamp: new Date().toISOString(),
                    apoyos: 0, 
                    apoyosUsuarios: []
                });
                alert("¡Alerta publicada en el foro!");
                window.location.href = 'foro.html';
            } catch (e) { console.error(e); alert("Error al publicar."); btnLanzar.disabled = false; }
        };
    }
}

// ==========================================
// 6. FUNCIONALIDAD: REPORTE PÚBLICO
// ==========================================
function handlePublicReport(form) {
    const btnLocation = document.getElementById('btnGetLocation');
    if (btnLocation) {
        btnLocation.addEventListener('click', () => {
            if (navigator.geolocation) {
                btnLocation.innerHTML = "<span>⏳ Buscando...</span>";
                navigator.geolocation.getCurrentPosition((pos) => {
                    coordenadasReporte = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    btnLocation.innerHTML = "<span>📍 Ubicación Adjunta</span> ✓";
                    btnLocation.classList.add('active');
                }, () => { alert("Error GPS."); });
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const species = document.querySelector('input[name="species"]:checked');
        const color = document.querySelector('input[name="tagColor"]:checked');
        const desc = document.getElementById('reportDesc').value;

        if (!desc) return alert("Añade una descripción.");

        try {
            await addDoc(collection(db, "alerts"), {
                authorName: "Ciudadano Anónimo",
                petName: `Avistamiento: ${species ? species.value : "Mascota"}`,
                petPhoto: 'https://cdn-icons-png.flaticon.com/512/616/616408.png',
                content: desc,
                lastSeenLocation: "Reportado vía GPS Público",
                placaColor: color ? color.value : "Desconocido",
                gps: coordenadasReporte,
                status: 'active',
                timestamp: new Date().toISOString()
            });
            alert("Gracias. Tu reporte ha sido enviado.");
            window.location.href = 'index.html';
        } catch (err) { alert("Error al enviar."); }
    });
}

// ==========================================
// 7. FUNCIONALIDAD CRÍTICA: QR ENCONTRADO
// ==========================================
async function handleFoundPage() {
    console.log("📍 Iniciando sistema QR...");
    const loader = document.getElementById('loadingMsg');
    const card = document.getElementById('alertCard');

    // Validación 1: EmailJS
    if (typeof emailjs === 'undefined') {
        if(loader) loader.innerHTML = "<p style='color:red'>Error: Falta EmailJS.</p>";
        return;
    }

    // Validación 2: ID en URL
    const params = new URLSearchParams(window.location.search);
    const petId = params.get('id');
    if (!petId) {
        if(loader) loader.innerHTML = "<p>⚠️ Enlace no válido (Falta ID).</p>";
        return;
    }

    try {
        const docRef = doc(db, "pets", petId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const pet = docSnap.data();
            console.log("Mascota:", pet.name);

            // Mostrar datos
            document.getElementById('foundPetName').textContent = pet.name;
            document.getElementById('foundPetDesc').textContent = pet.description || "Sin descripción.";
            const img = document.getElementById('foundPetImg');
            if(img) img.src = pet.photo || "https://cdn-icons-png.flaticon.com/512/616/616408.png";

            if(loader) loader.style.display = 'none';
            if(card) card.style.display = 'block';

            // Lógica Botón Enviar
            const btn = document.getElementById('btnSendLocation');
            if(btn) {
                // Clonamos para evitar eventos duplicados
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);

                newBtn.addEventListener('click', () => {
                    if (!navigator.geolocation) return alert("Por favor activa tu GPS.");
                    newBtn.textContent = "Enviando ubicación..."; newBtn.disabled = true;

                    navigator.geolocation.getCurrentPosition(async (pos) => {
                        const lat = pos.coords.latitude;
                        const lng = pos.coords.longitude;
                        
                        // CORRECCIÓN DEL LINK Y HORA
                        const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
                        const now = new Date();
                        const horaReporte = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

                        try {
                            let email = "admin@pawi.com";
                            let ownerName = "Dueño";

                            if (pet.ownerId) {
                                const qUser = query(collection(db, "users"), where("uid", "==", pet.ownerId));
                                const uSnap = await getDocs(qUser);
                                if (!uSnap.empty) {
                                    email = uSnap.docs[0].data().email;
                                    ownerName = uSnap.docs[0].data().fullName;
                                }
                            }

                            // Enviar Email con los nombres exactos
                            await emailjs.send('service_omc1fud', 'template_vshhv1h', {
                                to_email: email,
                                to_name: ownerName,
                                pet_name: pet.name,
                                google_maps_link: mapLink,
                                report_time: horaReporte,
                                message: "¡Alerta de QR escaneado!"
                            });

                            // Guardar en BD
                            await addDoc(collection(db, "alerts"), {
                                type: 'FOUND_SCAN', petId, ownerId: pet.ownerId, petName: pet.name,
                                location: { lat, lng }, content: "QR Escaneado", timestamp: new Date().toISOString(), status: 'unread'
                            });

                            newBtn.style.display = 'none';
                            document.getElementById('locationStatus').style.display = 'block';
                            alert(`Ubicación enviada a ${ownerName}`);

                        } catch (e) { 
                            console.error(e); 
                            alert("Error al enviar alerta."); 
                            newBtn.disabled = false;
                            newBtn.textContent = "Reintentar";
                        }
                    }, (err) => {
                        alert("Permite el acceso al GPS.");
                        newBtn.disabled = false;
                        newBtn.textContent = "📍 Notificar ubicación";
                    });
                });
            }
        } else {
            if(loader) loader.innerHTML = "<p>⚠️ Mascota no encontrada en la base de datos.</p>";
        }
    } catch (e) {
        console.error(e);
        if(loader) loader.innerHTML = "<p style='color:red'>Error de conexión.</p>";
    }
}