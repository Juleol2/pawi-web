import { auth, db } from './firebase.js';
import { 
    collection, addDoc, getDocs, getDoc, query, where, doc, updateDoc, deleteDoc, orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. GESTIÓN DE SESIÓN ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await inicializarInterfazUsuario(user);
        } else if (['dashboard', 'foro', 'generar_alerta', 'mis_mascotas'].some(p => window.location.pathname.includes(p))) {
            window.location.href = 'login.html';
        }
    });

    // --- 2. LANZAR ALERTA (CORREGIDO) ---
    const btnAlert = document.getElementById('btnLanzarAlerta');
    if (btnAlert) {
        btnAlert.addEventListener('click', async () => {
            const selected = document.querySelector('.pet-option.selected');
            const lastSeen = document.getElementById('lastSeen').value;
            const extraInfo = document.getElementById('extraInfo').value;

            if (!selected) return alert("Por favor, selecciona qué mascota se perdió.");

            try {
                btnAlert.disabled = true;
                btnAlert.textContent = "PUBLICANDO...";
                
                // Guardamos exactamente lo que el foro necesita leer
                await addDoc(collection(db, "alerts"), {
                    authorName: localStorage.getItem('pawi_user_name') || "Usuario PAWI",
                    ownerEmail: auth.currentUser.email,
                    petName: selected.dataset.name,
                    petPhoto: selected.querySelector('img').src,
                    content: extraInfo || `¡Ayuda! Mi mascota ${selected.dataset.name} se ha perdido.`, //document.getElementById('extraInfo').value || "¡Ayuda! Mi mascota se ha perdido.",
                    lastSeenLocation: lastSeen || "Ubicación no especificada",
                    status: 'active',
                    apoyos: 0,
                    apoyosUsuarios: [],
                    ownerId: auth.currentUser.uid,
                    timestamp: new Date()
                });
                window.location.href = 'foro.html';
            } catch (err) { 
                alert("Error al lanzar alerta."); 
                btnAlert.disabled = false; 
                btnAlert.textContent = "¡LANZAR ALERTA AHORA!";
            }
        });
    }
});

// --- 3. CARGAR ALERTAS EN EL FORO (DISEÑO PROFESIONAL + DATOS REALES) ---
async function cargarAlertasForo() {
    const contenedor = document.getElementById('feedDinamico');
    if (!contenedor) return;
    try {
        const q = query(collection(db, "alerts"), where("status", "==", "active"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        contenedor.innerHTML = "";
        
        snap.forEach(docSnap => {
            const alerta = docSnap.data();
            const id = docSnap.id;
            const uid = auth.currentUser?.uid;
            const yaSeSumo = alerta.apoyosUsuarios?.includes(uid);
            const esDueno = alerta.ownerId === uid;

            contenedor.innerHTML += `
                <div class="post-card alert-post" style="border: 1px solid #ef4444; border-radius: 24px; overflow: hidden; margin-bottom: 25px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <div class="post-header" style="padding: 16px 20px; display: flex; align-items: center; gap: 12px;">
                        <div style="width: 44px; height: 44px; background: #111827; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">
                            ${(alerta.authorName || "U")[0].toUpperCase()}
                        </div>
                        <div>
                            <div style="font-weight: 700; color: #111827; font-size: 16px;">${alerta.authorName || "Usuario PAWI"}</div>
                            <div style="font-size: 12px; color: #6b7280;">¡ALERTA ACTIVA! • Hace un momento</div>
                        </div>
                    </div>
                    
                    <div style="padding: 0 20px 12px; color: #374151; font-size: 15px;">${alerta.content}</div>
                    
                    <div style="background: rgba(254, 242, 242, 0.8); color: #dc2626; padding: 10px 20px; font-weight: 700; font-size: 14px; border-top: 1px solid #fee2e2;">
                        📍 Visto por última vez: ${alerta.lastSeenLocation}
                    </div>

                    <img src="${alerta.petPhoto}" style="width: 100%; height: auto; max-height: 400px; object-fit: cover; display: block;">

                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: white; border-top: 1px solid #f3f4f6;">
                        <button onclick="contactarUsuario('${alerta.ownerEmail}')" style="color: #dc2626; border: none; background: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 15px; padding: 0; flex: 1; justify-content: flex-start;">
                            <span style="background: #dc2626; color: white; width: 24px; height: 20px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; line-height: 1;">✉</span> Contactar
                        </button>

                        <button onclick="alert('Funcionalidad en desarrollo')" style="color: #6b7280; border: none; background: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 15px; padding: 0; flex: 1; justify-content: center;">
                            <span style="font-size: 18px; display: flex; align-items: center; justify-content: center; line-height: 1;">💬</span> Tengo info
                        </button>

                        <div style="flex: 1; display: flex; justify-content: flex-end;">
                            <button onclick="sumarseABusqueda('${id}')" 
                                    ${yaSeSumo ? 'disabled' : ''} 
                                    style="color: white; background: ${yaSeSumo ? '#9ca3af' : '#4caf50'}; padding: 10px 20px; border-radius: 30px; border: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 15px;">
                                🐾 ${yaSeSumo ? 'Sumado' : 'Me sumo'} (${alerta.apoyos || 0})
                            </button>
                        </div>
                    </div>

                    ${esDueno ? `
                        <div style="text-align: center; padding: 12px; background: #f9fafb; border-top: 1px solid #eee;">
                            <button onclick="finalizarAlerta('${id}')" style="color: #6b7280; font-size: 13px; cursor: pointer; border: none; background: none; text-decoration: underline; font-weight: 600;">
                                Marcar como Encontrado (Desactivar)
                            </button>
                        </div>
                    ` : ''}
                </div>`;
        });
    } catch (e) { console.error(e); }
}

// --- FUNCIÓN PARA DESACTIVAR ALERTA ---
window.finalizarAlerta = async (id) => {
    if (confirm("¿Encontraste a tu mascota? La alerta dejará de ser visible en el foro.")) {
        try {
            const alertaRef = doc(db, "alerts", id);
            await updateDoc(alertaRef, { status: 'resolved' });
            alert("¡Qué gran noticia! Alerta finalizada.");
            cargarAlertasForo(); // Refresca el foro sin recargar toda la página
        } catch (e) {
            console.error("Error al finalizar alerta:", e);
            alert("No se pudo desactivar la alerta.");
        }
    }
};

// --- 4. FUNCIONES GLOBALES ---
window.contactarUsuario = (email) => { 
    if(email) window.location.href = `mailto:${email}?subject=Mascota Perdida PAWI`; 
};

window.sumarseABusqueda = async (id) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const ref = doc(db, "alerts", id);
    const snap = await getDoc(ref);
    const data = snap.data();
    if (data.apoyosUsuarios?.includes(uid)) return;

    await updateDoc(ref, {
        apoyos: (data.apoyos || 0) + 1,
        apoyosUsuarios: [...(data.apoyosUsuarios || []), uid]
    });
    cargarAlertasForo();
};

// --- 5. INICIALIZACIÓN DE INTERFAZ Y SELECTORES ---
async function inicializarInterfazUsuario(user) {
    const q = query(collection(db, "users"), where("uid", "==", user.uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
        const d = snap.docs[0].data();
        localStorage.setItem('pawi_user_name', d.fullName);
        if (document.getElementById('navUserName')) document.getElementById('navUserName').textContent = d.fullName;
        if (document.getElementById('forumUserInitials')) document.getElementById('forumUserInitials').textContent = d.fullName[0].toUpperCase();
    }
    
    // CARGAS POR PÁGINA
    if (document.getElementById('feedDinamico')) cargarAlertasForo();
    if (document.getElementById('alertPetSelector')) loadPetsForAlert(user.uid);
    if (document.getElementById('petsContainer')) loadUserPets(user.uid);
}

async function loadUserPets(userId) {
    const container = document.getElementById('petsContainer');
    if (!container) return;

    try {
        const q = query(collection(db, "pets"), where("ownerId", "==", userId));
        const snap = await getDocs(q);
        container.innerHTML = "";

        let list = [];
        // Mantener datos de prueba para Stephanie
        if (localStorage.getItem('pawi_user_name')?.toLowerCase().includes('stephanie')) {
            list.push({ 
                id: 'stephanie_max_123', 
                name: 'Max', 
                age: '9 Años', 
                description: 'Husky siberiano, ojos celestes. Muy amigable con otros perros.', 
                photo: 'Max01.png' 
            });
        }

        snap.forEach(docSnap => {
            list.push({ id: docSnap.id, ...docSnap.data() });
        });

        if (list.length === 0) {
            container.innerHTML = "<p style='grid-column: 1/-1; text-align: center;'>Aún no tienes mascotas registradas.</p>";
            return;
        }

        list.forEach(pet => {
            // URL configurada para funcionar tanto en local (permisos de Google Cloud) como en producción
            const urlEscaneo = `${window.location.origin}/perfil_publico.html?id=${pet.id}`;

            container.innerHTML += `
                <div class="pet-card" style="background: white; border-radius: 15px; padding: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); text-align: center; border: 1px solid #eee;">
                    <img src="${pet.photo}" style="width: 100%; height: 180px; object-fit: cover; border-radius: 10px; margin-bottom: 10px;" onerror="this.src='https://cdn-icons-png.flaticon.com/512/616/616408.png'">
                    
                    <h3 style="color: #f39c12; margin: 5px 0; font-size: 1.2rem;">${pet.name}</h3>
                    <p style="font-size: 0.9rem; color: #666; margin-bottom: 5px;">${pet.age || 'Edad no definida'}</p>
                    <p style="font-size: 0.85rem; color: #888; line-height: 1.4; margin-bottom: 15px;">${pet.description || ''}</p>
                    
                    <div style="border-top: 1px dashed #eee; padding-top: 15px; margin-top: 10px;">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlEscaneo)}" 
                             style="width: 100px; height: 100px; margin-bottom: 10px; border: 5px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                        
                        <p style="font-size: 10px; color: #aaa; margin-bottom: 15px;">ID: ${pet.id}</p>
                        
                        <div style="display: flex; gap: 10px; justify-content: center;">
                            <button onclick="alert('Se está trabajando en esta funcionalidad para la siguiente versión')" 
                                    style="flex: 1; background: #f8f9fa; border: 1px solid #ddd; padding: 8px; border-radius: 8px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
                                Editar
                            </button>
                            <button onclick="confirmarEliminacionMascota('${pet.id}', '${pet.name}')" 
                                    style="flex: 1; background: #fff5f5; border: 1px solid #fee2e2; color: #e53e3e; padding: 8px; border-radius: 8px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (e) { console.error("Error al cargar mascotas:", e); }
}

// --- FUNCIÓN DE ELIMINACIÓN CON RECONFIRMACIÓN ---
window.confirmarEliminacionMascota = async (id, nombre) => {
    if (confirm(`¿Estás seguro de que deseas eliminar a ${nombre}? Esta acción no se puede deshacer.`)) {
        try {
            await deleteDoc(doc(db, "pets", id));
            alert(`${nombre} ha sido eliminado de tus mascotas.`);
            // Recargamos la lista automáticamente
            loadUserPets(auth.currentUser.uid);
        } catch (e) {
            console.error("Error al eliminar:", e);
            alert("No se pudo eliminar la mascota. Intenta de nuevo.");
        }
    }
};

// --- 6. CARGAR MASCOTAS EN EL SELECTOR DE ALERTA ---
async function loadPetsForAlert(userId) {
    const selector = document.getElementById('alertPetSelector');
    if (!selector) return;
    
    selector.innerHTML = "<p>Cargando tus mascotas...</p>";
    const q = query(collection(db, "pets"), where("ownerId", "==", userId));
    const snap = await getDocs(q);
    let list = [];
    
    // Lógica para Stephanie
    if (localStorage.getItem('pawi_user_name')?.toLowerCase().includes('stephanie')) {
        list.push({ id: 's1', name: 'Max', photo: 'Max01.png' }, { id: 's2', name: 'Tommy', photo: 'Tommy01.jpeg' });
    }
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));

    selector.innerHTML = "";
    list.forEach(pet => {
        const div = document.createElement('div');
        div.className = 'pet-option';
        div.dataset.name = pet.name;
        div.innerHTML = `<img src="${pet.photo}" class="pet-thumb" onerror="this.src='https://cdn-icons-png.flaticon.com/512/616/616408.png'"><span>${pet.name}</span>`;
        div.onclick = () => {
            document.querySelectorAll('.pet-option').forEach(opt => opt.classList.remove('selected'));
            div.classList.add('selected');
        };
        selector.appendChild(div);
    });
}