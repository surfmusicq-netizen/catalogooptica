// Supabase Configuration
const SB_URL = "https://dwjeejsutmkfsdmldoxq.supabase.co";
const SB_KEY = "sb_publishable_iRRcY7--9c49Tj45fK8RAg_v0sAoMNo";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let camera = null;
let faceMesh = null;
let glassesModel = null;
let scene, renderer, threeCamera;
let currentProducts = [];

// --- VTO Logic ---
async function setupVTO() {
    const videoElement = document.getElementById('input-video');
    const canvasElement = document.getElementById('output-canvas');

    scene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: canvasElement, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene.add(new THREE.AmbientLight(0xffffff, 1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, 5, 5);
    scene.add(dirLight);

    createGlassesModel();

    faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    faceMesh.onResults(onResults);

    camera = new Camera(videoElement, {
        onFrame: async () => { await faceMesh.send({ image: videoElement }); },
        width: 1280, height: 720
    });
}

function createGlassesModel() {
    glassesModel = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.2 });
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x00a3e0, transparent: true, opacity: 0.4, metalness: 1, roughness: 0 });

    const lensGeom = new THREE.CircleGeometry(0.5, 32);
    const leftLens = new THREE.Mesh(lensGeom, lensMat); leftLens.position.set(-0.6, 0, 0.1);
    const rightLens = new THREE.Mesh(lensGeom, lensMat); rightLens.position.set(0.6, 0, 0.1);

    const frameGeom = new THREE.TorusGeometry(0.5, 0.04, 16, 100);
    const leftFrame = new THREE.Mesh(frameGeom, frameMat); leftFrame.position.set(-0.6, 0, 0.1);
    const rightFrame = new THREE.Mesh(frameGeom, frameMat); rightFrame.position.set(0.6, 0, 0.1);

    const bridgeGeom = new THREE.TorusGeometry(0.15, 0.03, 16, 100, Math.PI);
    const bridge = new THREE.Mesh(bridgeGeom, frameMat); bridge.position.set(0, 0.1, 0.1); bridge.rotation.x = Math.PI / 2;

    glassesModel.add(leftLens, rightLens, leftFrame, rightFrame, bridge);
    scene.add(glassesModel);
    glassesModel.visible = false;
}

function onResults(results) {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        glassesModel.visible = true;
        const nose = landmarks[168], leftEye = landmarks[33], rightEye = landmarks[263];

        glassesModel.position.x = (0.5 - nose.x) * 3.5;
        glassesModel.position.y = (0.5 - nose.y) * 3.5;
        glassesModel.position.z = -nose.z * 15;

        const dx = rightEye.x - leftEye.x, dy = rightEye.y - leftEye.y;
        glassesModel.rotation.z = -Math.atan2(dy, dx);
        glassesModel.rotation.y = (landmarks[1].x - nose.x) * 2.5;

        const scale = (Math.sqrt(dx * dx + dy * dy)) * 3;
        glassesModel.scale.set(scale, scale, scale);
        renderer.render(scene, threeCamera);
    } else {
        glassesModel.visible = false;
    }
}

// --- Catalog Logic ---
async function loadCatalog(category = null, showAll = false) {
    const grid = document.getElementById('catalog');
    grid.innerHTML = '<div class="loader-container"><div class="spinner"></div><p>Cargando colección...</p></div>';

    try {
        let query = _supabase.from('products').select('*');
        if (category) query = query.eq('type', category);

        const { data: products, error } = await query;
        if (error) throw error;
        currentProducts = products;

        let displayProducts = products;
        if (!showAll && !category) {
            displayProducts = products.filter(p => p.badge).slice(0, 8);
            if (displayProducts.length === 0) displayProducts = products.slice(0, 8);
        }

        renderProducts(displayProducts);
        document.getElementById('catalog-title').innerText = category ? `Categoría: ${category}` : "Best Sellers";
    } catch (err) {
        console.error(err);
        renderProducts([]); // Show empty if fails
    }
}

function renderProducts(products) {
    const grid = document.getElementById('catalog');
    grid.innerHTML = '';
    if (products.length === 0) { grid.innerHTML = '<p style="text-align:center; grid-column:1/-1;">No se encontraron productos.</p>'; return; }

    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-image">
                <img src="${p.image_url}" alt="${p.name}">
                ${p.badge ? `<div class="badge">${p.badge}</div>` : ''}
            </div>
            <div class="product-info">
                <small>${p.brand || 'Visión Free'}</small>
                <h3>${p.name}</h3>
                <p class="price">S/ ${parseFloat(p.price).toFixed(2)}</p>
            </div>
        `;
        card.onclick = () => openModal(p);
        grid.appendChild(card);
    });
}

function openModal(p) {
    const modal = document.getElementById('product-modal');
    document.getElementById('modal-image').src = p.image_url;
    document.getElementById('modal-brand').innerText = p.brand || 'Visión Free';
    document.getElementById('modal-name').innerText = p.name;
    document.getElementById('modal-price').innerText = `S/ ${parseFloat(p.price).toFixed(2)}`;

    const specs = document.getElementById('modal-specs-list');
    specs.innerHTML = `
        <div style="font-size: 0.9rem; margin-top: 10px;">
            <p><strong>Material:</strong> ${p.material || 'Premium'}</p>
            <p><strong>Color:</strong> ${p.color || 'A elegir'}</p>
            <p><strong>Tipo:</strong> ${p.type || 'Lentes'}</p>
        </div>
    `;

    modal.style.display = 'flex';
    document.getElementById('modal-vto-btn').onclick = () => { modal.style.display = 'none'; startVTO(); };
    document.getElementById('modal-wa-btn').onclick = () => {
        const msg = encodeURIComponent(`Hola, me interesan los lentes ${p.name} de la marca ${p.brand || 'Visión Free'}.`);
        window.open(`https://wa.me/51900000000?text=${msg}`, '_blank');
    };
}

function startVTO() {
    document.getElementById('vto-overlay').style.display = 'block';
    if (!camera) setupVTO();
    camera.start();
}

function stopVTO() {
    document.getElementById('vto-overlay').style.display = 'none';
    if (camera) camera.stop();
    if (glassesModel) glassesModel.visible = false;
}

window.loadCatalogByCategory = (cat) => {
    loadCatalog(cat, true);
    document.getElementById('catalog-section').scrollIntoView({ behavior: 'smooth' });
};

// --- Listeners ---
window.addEventListener('DOMContentLoaded', () => {
    loadCatalog();
    document.querySelector('.close-modal').onclick = () => document.getElementById('product-modal').style.display = 'none';
    window.onclick = (e) => { if (e.target.id === 'product-modal') document.getElementById('product-modal').style.display = 'none'; };
    document.querySelector('.close-vto').onclick = stopVTO;
    document.getElementById('load-all-btn').onclick = () => { loadCatalog(null, true); document.getElementById('load-all-btn').style.display = 'none'; };
    document.getElementById('direct-vto').onclick = startVTO;
});
