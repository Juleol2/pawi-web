import { auth, db } from './firebase.js';

import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { 
    collection, addDoc, getDocs, getDoc, query, where, doc, updateDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    console.log("Main.js cargado - Versión EmailJS Automático");

    // ==========================================
    // 0. LÓGICA DE LA PÁGINA PÚBLICA (ENCONTRADO.HTML)
    // ==========================================
    if (window.location.pathname.includes('encontrado.html')) {
        handleFoundPage();
        return; // Detenemos el resto del script aquí
    }

    async function handleFoundPage() {
        const params = new URLSearchParams(window.location.search);
        const petId = params.get('id');
        const card = document.getElementById('alertCard');
        const loader = document.getElementById('loadingMsg');

        if (!petId) {
            loader.textContent = "Error: Código QR inválido.";
            return;
        }

        try {
            // 1. Obtener datos de la mascota
            const docRef = doc(db, "pets", petId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const pet = docSnap.data();
                
                // Mostrar datos en pantalla
                document.getElementById('foundPetImg').src = pet.photo;
                document.getElementById('foundPetName').textContent = pet.name;
                
                const descTexto = pet.description ? pet.description : "No hay detalles adicionales.";
                document.getElementById('foundPetDesc').textContent = "Mi descripción es: " + descTexto;
                
                loader.style.display = 'none';
                card.style.display = 'block';

                // 2. Configurar el botón de alerta con EMAILJS (MODO DEBUG)
                const btnLocation = document.getElementById('btnSendLocation');
                btnLocation.addEventListener('click', () => {
                    
                    console.log("1. Botón presionado. Verificando GPS..."); // LOG 1

                    if (!navigator.geolocation) {
                        alert("Tu navegador no soporta geolocalización.");
                        return;
                    }

                    btnLocation.textContent = "Enviando alerta...";
                    btnLocation.disabled = true;

                    navigator.geolocation.getCurrentPosition(async (position) => {
                        console.log("2. Coordenadas obtenidas:", position.coords); // LOG 2
                        
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;

                        try {
                            // A) GUARDAR ALERTA EN FIREBASE
                            await addDoc(collection(db, "alerts"), {
                                petId: petId,
                                ownerId: pet.ownerId,
                                petName: pet.name,
                                location: { lat: lat, lng: lng },
                                mapsLink: mapLink,
                                timestamp: new Date(),
                                status: 'unread'
                            });
                            console.log("3. Alerta guardada en Firebase."); // LOG 3

                            // B) ENVIAR CORREO
                            console.log("4. Buscando dueño con ID:", pet.ownerId); // LOG 4
                            
                            const usersRef = collection(db, "users");
                            const q = query(usersRef, where("uid", "==", pet.ownerId));
                            const querySnapshot = await getDocs(q);
                            
                            if (!querySnapshot.empty) {
                                // Tomamos el primer resultado encontrado
                                const ownerData = querySnapshot.docs[0].data();
                                const ownerEmail = ownerData.email;
                                const ownerName = ownerData.fullName || "Dueño";

                                console.log("5. Dueño encontrado:", ownerName, "Correo:", ownerEmail); // LOG 5

                                const emailParams = {
                                    to_name: ownerName,
                                    to_email: ownerEmail, // <--- ESTO ES CRUCIAL
                                    pet_name: pet.name,
                                    map_link: mapLink,
                                    time: new Date().toLocaleString()
                                };

                                // REEMPLAZA ESTOS IDs CON LOS TUYOS DE EMAILJS
                                const SERVICE_ID = 'service_omc1fud'; // <--- PON EL TUYO AQUÍ
                                const TEMPLATE_ID = 'template_vshhv1h'; // <--- PON EL TUYO AQUÍ

                                console.log("6. Intentando enviar email con EmailJS..."); // LOG 6
                                
                                await emailjs.send(SERVICE_ID, TEMPLATE_ID, emailParams);
                                
                                console.log("7. ¡CORREO ENVIADO EXITOSAMENTE!"); // LOG 7
                                alert(`¡Listo! Hemos enviado un correo a ${ownerEmail} con tu ubicación.`);
                            
                            } else {
                                console.error("ERROR: No se encontró el usuario dueño en la base de datos.");
                                alert("Alerta guardada, pero no encontramos el correo del dueño para notificarle.");
                            }

                            document.getElementById('locationStatus').style.display = 'block';
                            btnLocation.style.display = 'none';

                        } catch (err) {
                            console.error("ERROR CRÍTICO:", err); // LOG ERROR
                            alert("Error: " + err.message);
                            btnLocation.disabled = false;
                        }

                    }, (error) => {
                        console.error("Error de GPS:", error);
                        alert("Debes permitir el GPS para enviar la alerta.");
                        btnLocation.textContent = "📍 Reintentar";
                        btnLocation.disabled = false;
                    });
                });

            } else {
                loader.textContent = "Mascota no encontrada en el sistema.";
            }
        } catch (error) {
            console.error(error);
            loader.textContent = "Error de conexión.";
        }
    }

    // ==========================================
    // NUEVA SECCIÓN: REPORTE PÚBLICO (reporte.html)
    // ==========================================
    const publicReportForm = document.getElementById('publicReportForm');
    
    if (publicReportForm) {
        let reportLocation = null; // Aquí guardaremos las coordenadas
        const btnLoc = document.getElementById('btnGetLocation');

        // 1. Lógica del botón de ubicación
        btnLoc.addEventListener('click', () => {
            if (!navigator.geolocation) return alert("GPS no soportado");

            btnLoc.innerHTML = "<span>Obteniendo...</span>";
            
            navigator.geolocation.getCurrentPosition((pos) => {
                reportLocation = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
                // Cambio visual al obtener éxito
                btnLoc.classList.add('active');
                btnLoc.innerHTML = "<span>📍 Ubicación adjuntada</span> <span style='display:inline'>✓</span>";
                btnLoc.style.borderColor = "#10B981";
                btnLoc.style.color = "#10B981";
            }, (err) => {
                alert("Error al obtener GPS. Por favor permite el acceso.");
                btnLoc.innerHTML = "<span>📍 Reintentar ubicación</span>";
            });
        });

        // 2. Lógica al Enviar el formulario
        publicReportForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Obtenemos los valores seleccionados
            const color = document.querySelector('input[name="tagColor"]:checked').value;
            const species = document.querySelector('input[name="species"]:checked').value;
            const description = document.getElementById('reportDesc').value;

            if (!description) return alert("Por favor escribe una breve descripción.");
            if (!reportLocation) return alert("Por favor adjunta la ubicación para saber dónde lo viste.");

            try {
                const btnSubmit = publicReportForm.querySelector('.btn-submit');
                btnSubmit.disabled = true;
                btnSubmit.textContent = "ENVIANDO...";

                // Guardar en colección 'general_reports'
                await addDoc(collection(db, "general_reports"), {
                    tagColor: color,
                    species: species,
                    description: description,
                    location: reportLocation,
                    mapsLink: `https://www.google.com/maps?q=${reportLocation.lat},${reportLocation.lng}`,
                    timestamp: new Date(),
                    status: 'open' // Para que los admins sepan que es nuevo
                });

                alert("¡Reporte enviado! Gracias por ayudar a la comunidad PAWI.");
                window.location.href = 'index.html'; // Volver al inicio

            } catch (error) {
                console.error(error);
                alert("Error al enviar reporte.");
                publicReportForm.querySelector('.btn-submit').disabled = false;
            }
        });
    }


    // ==========================================
    // 1. AUTH (Registro y Login)
    // ==========================================

    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const tipo = document.getElementById('signupType').value;

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const fullNameCap = nombre.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                await addDoc(collection(db, "users"), {
                    uid: userCredential.user.uid,
                    fullName: fullNameCap,
                    email: email,
                    userType: tipo,
                    createdAt: new Date()
                });
                alert("Cuenta creada.");
                window.location.href = 'login.html';
            } catch (error) { alert("Error: " + error.message); }
        });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            try {
                await signInWithEmailAndPassword(auth, email, password);
                window.location.href = 'dashboard.html';
            } catch (error) { alert("Credenciales incorrectas."); }
        });
    }

    // Recuperar Pass
    const resetForm = document.getElementById('resetPasswordForm');
    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('resetEmail').value;
            try {
                await sendPasswordResetEmail(auth, email);
                alert("Enlace enviado.");
                window.location.href = 'login.html';
            } catch (error) { alert("Error: " + error.message); }
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Buscamos elementos en Dashboard Y Foro
            const welcomeName = document.getElementById('welcomeName');
            const navUserName = document.getElementById('navUserName');
            
            // Elementos específicos del Foro
            const forumUserInitials = document.getElementById('forumUserInitials');
            const postInputPlaceholder = document.getElementById('postInputPlaceholder');

            // Si estamos en una página que necesita nombre...
            if (welcomeName || navUserName || forumUserInitials) {
                try {
                    const q = query(collection(db, "users"), where("uid", "==", user.uid));
                    const querySnapshot = await getDocs(q);
                    
                    if (!querySnapshot.empty) {
                        const data = querySnapshot.docs[0].data();
                        let rawName = data.fullName || "Usuario";
                        const fullName = rawName.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        const firstName = fullName.split(' ')[0];

                        // 1. Actualizar Dashboard
                        if (welcomeName) welcomeName.textContent = firstName;
                        
                        // 2. Actualizar Navbar (en todas las paginas)
                        if (navUserName) navUserName.textContent = fullName;

                        // 3. ACTUALIZAR FORO (Nuevo)
                        if (forumUserInitials) {
                            forumUserInitials.textContent = firstName.charAt(0); // Primera letra "J"
                        }
                        if (postInputPlaceholder) {
                            postInputPlaceholder.placeholder = `¿Qué estás pensando, ${firstName}?`;
                        }
                    } 
                } catch (error) { console.error(error); }
            }

            // Cargar datos específicos
            if (document.getElementById('petsGrid')) loadUserPets(user.uid);
            if (document.getElementById('placaForm')) loadPetsForCollar(user.uid);

        } else {
            const path = window.location.pathname;
            if (path.includes('dashboard') || path.includes('mascotas') || path.includes('collar') || path.includes('personaliza') || path.includes('foro')) {
                window.location.href = 'login.html';
            }
        }
    });

    // ==========================================
    // 2. DASHBOARD & GLOBAL AUTH CHECK
    // ==========================================
    // (Ya cubierto arriba)

    // ==========================================
    // 3. GESTIÓN DE MASCOTAS (VER, EDITAR, BORRAR)
    // ==========================================
    const petForm = document.getElementById('petRegisterForm');
    if (petForm) {
        petForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = auth.currentUser;
            if (!user) return alert("Sesión expirada.");

            const name = document.getElementById('petName').value;
            const age = document.getElementById('petAge').value;
            const desc = document.getElementById('petDesc').value;
            const defaultPhoto = "https://cdn-icons-png.flaticon.com/512/616/616408.png";

            try {
                await addDoc(collection(db, "pets"), {
                    ownerId: user.uid,
                    name: name,
                    age: age,
                    description: desc,
                    photo: defaultPhoto,
                    createdAt: new Date()
                });
                alert("Mascota registrada.");
                window.location.href = 'mis_mascotas.html';
            } catch (error) { alert("Error al guardar."); }
        });
    }

    async function loadUserPets(userId) {
        const grid = document.getElementById('petsGrid');
        if (!grid) return;
        grid.innerHTML = "<p>Cargando...</p>";
        
        try {
            const q = query(collection(db, "pets"), where("ownerId", "==", userId));
            const snap = await getDocs(q);
            grid.innerHTML = ""; 

            if (snap.empty) {
                grid.innerHTML = `<p>No tienes mascotas registradas.</p>`;
                return;
            }

            snap.forEach(docSnap => {
                const pet = docSnap.data();
                const petId = docSnap.id;
                
                // QR Generator
               // QR Generator
// 1. Obtenemos la ruta completa (ej: /pawi-app/mis_mascotas.html)
const path = window.location.pathname;
// 2. Quitamos el nombre del archivo final para quedarnos con la carpeta base
const basePath = path.substring(0, path.lastIndexOf('/'));
// 3. Unimos el origen + la carpeta (ej: https://juleol2.github.io + /pawi-app)
const mySite = window.location.origin + basePath; 

const linkDestino = `${mySite}/encontrado.html?id=${petId}`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(linkDestino)}`;

                grid.innerHTML += `
                    <div class="pet-card">
                        <div class="pet-img-area"><img src="${pet.photo}" style="padding:20px;"></div>
                        <div class="pet-info">
                            <div class="pet-name">${pet.name}</div>
                            <div class="pet-age">${pet.age}</div>
                            <div class="pet-desc">${pet.description}</div>
                            
                            <div class="qr-area">
                                <a href="${linkDestino}" target="_blank">
                                    <img src="${qrUrl}" class="qr-img" alt="QR">
                                </a>
                                <div class="qr-label">ESCANÉAME</div>
                            </div>

                            <div class="card-actions" style="margin-top: 15px;">
                                <button class="btn-card btn-edit" 
                                    data-id="${petId}" 
                                    data-name="${pet.name}" 
                                    data-age="${pet.age}" 
                                    data-desc="${pet.description}">
                                    Editar
                                </button>
                                <button class="btn-card btn-delete" data-id="${petId}">Eliminar</button>
                            </div>
                        </div>
                    </div>`;
            });

            attachCardEvents();

        } catch (error) { console.error(error); }
    }

    function attachCardEvents() {
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if(confirm("¿Borrar mascota?")) {
                    await deleteDoc(doc(db, "pets", e.target.dataset.id));
                    location.reload();
                }
            });
        });

        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const d = e.target.dataset;
                openEditModal(d.id, d.name, d.age, d.desc);
            });
        });
    }

    // Modal Lógica
    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editPetForm');

    function openEditModal(id, name, age, desc) {
        if (!editModal) return;
        document.getElementById('editPetId').value = id;
        document.getElementById('editName').value = name;
        document.getElementById('editAge').value = age;
        document.getElementById('editDesc').value = desc;
        editModal.classList.add('active');
    }

    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editPetId').value;
            const newData = {
                name: document.getElementById('editName').value,
                age: document.getElementById('editAge').value,
                description: document.getElementById('editDesc').value
            };
            try {
                await updateDoc(doc(db, "pets", id), newData);
                alert("Actualizado correctamente");
                location.reload();
            } catch (error) { alert("Error al actualizar"); }
        });
    }

    // ==========================================
    // 4. COLLAR PASO 1: SELECCIÓN DE MODELO
    // ==========================================
    const collarItems = document.querySelectorAll('.selectable-item');
    const btnConfirmCollar = document.getElementById('btnConfirmCollar');
    let selectedCollarData = null;

    if (collarItems.length > 0) {
        collarItems.forEach(item => {
            item.addEventListener('click', () => {
                collarItems.forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                selectedCollarData = {
                    modelName: item.dataset.name,
                    price: item.dataset.price,
                    image: item.dataset.img
                };
                if (btnConfirmCollar) {
                    btnConfirmCollar.classList.add('active');
                    btnConfirmCollar.innerText = `Siguiente ($${item.dataset.price}) →`;
                }
            });
        });

        if (btnConfirmCollar) {
            btnConfirmCollar.addEventListener('click', () => {
                if (selectedCollarData) {
                    localStorage.setItem('pawi_order_step1', JSON.stringify(selectedCollarData));
                    window.location.href = 'personaliza_placa.html';
                }
            });
        }
    }

    // ==========================================
    // 5. COLLAR PASO 2: SELECCIONAR MASCOTA
    // ==========================================
    async function loadPetsForCollar(userId) {
        const petSelect = document.getElementById('petSelect');
        const selectedCollar = JSON.parse(localStorage.getItem('pawi_order_step1'));

        if (selectedCollar) {
            document.getElementById('summaryImg').src = selectedCollar.image;
            document.getElementById('summaryName').textContent = selectedCollar.modelName;
            document.getElementById('summaryPrice').textContent = `$${selectedCollar.price}`;
        }

        try {
            const q = query(collection(db, "pets"), where("ownerId", "==", userId));
            const snap = await getDocs(q);

            if (snap.empty) {
                alert("¡Espera! Para configurar un collar, primero necesitas tener una mascota registrada.");
                window.location.href = 'registro_mascota.html';
                return;
            }

            petSelect.innerHTML = '<option value="" disabled selected>Selecciona tu mascota...</option>';
            snap.forEach(doc => {
                const pet = doc.data();
                petSelect.innerHTML += `<option value="${doc.id}">${pet.name}</option>`;
            });

        } catch (error) {
            console.error("Error cargando mascotas para collar:", error);
        }
    }

    const btnVerify = document.getElementById('btnVerifyData');
    if (btnVerify) {
        btnVerify.addEventListener('click', (e) => {
            e.preventDefault();
            const petId = document.getElementById('petSelect').value;
            
            if (!petId) {
                alert("Por favor selecciona a qué mascota pertenece este collar.");
                return;
            }
            alert("¡Perfecto! Datos verificados.");
        });
    }

    // Salir
    const btnSalir = document.querySelector('a[href="login.html"]');
    if (btnSalir) {
        btnSalir.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut(auth);
            window.location.href = 'login.html';
        });
    }

});
