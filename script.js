// Supabase Configuration
const SB_URL = "https://dwjeejsutmkfsdmldoxq.supabase.co";
const SB_KEY = "sb_publishable_iRRcY7--9c49Tj45fK8RAg_v0sAoMNo";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let stream = null;
let camera = null;
let faceMesh = null;
let glassesModel = null;
let scene, renderer, threeCamera;
let currentProducts = [];

// --- VTO Core Logic ---
async function setupVTO() {
    const videoElement = document.getElementById('input-video');
    const canvasElement = document.getElementById('output-canvas');
    const vtoLoader = document.getElementById('vto-loader');

    scene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({
        canvas: canvasElement,
        alpha: true,
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(0, 5, 5);
    scene.add(dirLight);

    createGlassesModel();

    faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);

    camera = new Camera(videoElement, {
        onFrame: async () => {
            await faceMesh.send({ image: videoElement });
            if (vtoLoader) vtoLoader.style.display = 'none';
        },
        width: 1280,
        height: 720
    });
}

function createGlassesModel() {
    glassesModel = new THREE.Group();

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x00a3e0,
        metalness: 0.9,
        roughness: 0.1
    });

    const lensMaterial = new THREE.MeshStandardMaterial({
        color: 0x00a3e0,
        transparent: true,
        opacity: 0.3,
        metalness: 1,
        roughness: 0
    });

    const lensGeom = new THREE.CircleGeometry(0.6, 32);
    const leftLens = new THREE.Mesh(lensGeom, lensMaterial);
    leftLens.position.set(-0.7, 0, 0.1);
    const rightLens = new THREE.Mesh(lensGeom, lensMaterial);
    rightLens.position.set(0.7, 0, 0.1);

    const frameGeom = new THREE.TorusGeometry(0.6, 0.05, 16, 100);
    const leftFrame = new THREE.Mesh(frameGeom, frameMaterial);
    leftFrame.position.set(-0.7, 0, 0.1);
    const rightFrame = new THREE.Mesh(frameGeom, frameMaterial);
    rightFrame.position.set(0.7, 0, 0.1);

    const bridgeGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.4);
    const bridge = new THREE.Mesh(bridgeGeom, frameMaterial);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.2, 0.1);

    glassesModel.add(leftLens, rightLens, leftFrame, rightFrame, bridge);
    scene.add(glassesModel);
    glassesModel.visible = false;
}

function onResults(results) {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        glassesModel.visible = true;

        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const noseBridge = landmarks[168];

        const midX = (leftEye.x + rightEye.x) / 2;
        const midY = (leftEye.y + rightEye.y) / 2;

        glassesModel.position.x = (0.5 - noseBridge.x) * 2.8;
        glassesModel.position.y = (0.5 - noseBridge.y) * 2.8;
        glassesModel.position.z = -landmarks[168].z * 10;

        const dx = rightEye.x - leftEye.x;
        const dy = rightEye.y - leftEye.y;
        const angle = Math.atan2(dy, dx);
        glassesModel.rotation.z = -angle;

        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = dist * 2.5;
        glassesModel.scale.set(scale, scale, scale);

        renderer.render(scene, threeCamera);
    } else {
        glassesModel.visible = false;
    }
}

// --- Catalog & UI ---
async function loadCatalog(showAll = false) {
    const catalogGrid = document.getElementById('catalog');

    try {
        const { data: products, error } = await _supabase
            .from('products')
            .select('*');

        if (error) throw error;
        currentProducts = products;

        const filtered = showAll ? products : products.filter(p => p.badge && (p.badge.toLowerCase().includes('nuevo') || p.badge.toLowerCase().includes('oferta') || p.badge.toLowerCase().includes('best')));

        renderProducts(filtered.length > 0 ? filtered : products); // If no tagged items, show all as fallback
    } catch (err) {
        console.error("Error cargando el catálogo:", err);
        const fallbackProducts = [
            { name: "Aviator Cyan Pro", price: 299, image_url: "https://images.unsplash.com/photo-1572635196237-14b3f281503f", badge: "Nuevo" },
            { name: "Visión Free Classic", price: 189, image_url: "https://images.unsplash.com/photo-1511499767390-91f89608021d", badge: "Oferta" },
            { name: "Digital Shield Blue", price: 245, image_url: "https://images.unsplash.com/photo-1591076482161-42ce6da69f67", badge: "Nuevo" }
        ];
        currentProducts = fallbackProducts;
        renderProducts(fallbackProducts);
    }
}

function renderProducts(products) {
    const catalogGrid = document.getElementById('catalog');
    catalogGrid.innerHTML = '';

    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-image">
                <img src="${product.image_url}" alt="${product.name}">
                ${product.badge ? `<div class="badge">${product.badge}</div>` : ''}
            </div>
            <div class="product-info">
                <h3>${product.name}</h3>
                <p class="price">S/ ${parseFloat(product.price).toFixed(2)}</p>
                <button class="btn-whatsapp" onclick="event.stopPropagation(); quoteWhatsApp('${product.name}')">WhatsApp</button>
            </div>
        `;
        card.onclick = () => openProductModal(product);
        catalogGrid.appendChild(card);
    });
}

function openProductModal(product) {
    const modal = document.getElementById('product-modal');
    document.getElementById('modal-image').src = product.image_url;
    document.getElementById('modal-name').innerText = product.name;
    document.getElementById('modal-price').innerText = `S/ ${parseFloat(product.price).toFixed(2)}`;

    const badge = document.getElementById('modal-badge-float');
    if (product.badge) {
        badge.innerText = product.badge;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }

    modal.style.display = 'flex';

    document.getElementById('modal-vto-btn').onclick = () => {
        modal.style.display = 'none';
        startVTO();
    };

    document.getElementById('modal-wa-btn').onclick = () => quoteWhatsApp(product.name);
}

function quoteWhatsApp(productName) {
    const phone = "51900000000";
    const message = encodeURIComponent(`Hola Visión Free, me interesa la montura: ${productName}. ¿Podrían darme más información?`);
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
}

function startVTO() {
    document.getElementById('vto-overlay').style.display = 'flex';
    if (!camera) setupVTO();
    camera.start();
}

function stopVTO() {
    document.getElementById('vto-overlay').style.display = 'none';
    if (camera) camera.stop();
    if (glassesModel) glassesModel.visible = false;
}

// --- Listeners ---
window.addEventListener('DOMContentLoaded', () => {
    loadCatalog();

    document.querySelector('.close-vto').onclick = stopVTO;
    document.querySelector('.close-modal').onclick = () => {
        document.getElementById('product-modal').style.display = 'none';
    };

    window.onclick = (event) => {
        const modal = document.getElementById('product-modal');
        if (event.target == modal) modal.style.display = 'none';
    };

    document.getElementById('load-all-btn').onclick = () => {
        loadCatalog(true);
        document.getElementById('load-all-btn').style.display = 'none';
    };

    document.getElementById('direct-vto').onclick = startVTO;
});
