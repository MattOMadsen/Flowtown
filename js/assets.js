/**
 * Load place/vehicle/tile assets.
 */

const PLACE_SRC = {
  town: 'assets/places/town.png',
  town2: 'assets/places/town2.png',
  town3: 'assets/places/town3.png',
  capital: 'assets/places/capital.png',
  farm: 'assets/places/farm.png',
  factory: 'assets/places/factory.png',
  harbor: 'assets/places/harbor.png'
};

const VEHICLE_SRC = {
  car: 'assets/vehicles/car.png',
  truck: 'assets/vehicles/truck.png',
  car_fast: 'assets/vehicles/car_fast.png',
  truck_heavy: 'assets/vehicles/truck_heavy.png',
  bus: 'assets/vehicles/bus.png',
  van: 'assets/vehicles/van.png'
};

const TILE_SRC = {
  grass: 'assets/tiles/grass.png',
  grass2: 'assets/tiles/grass2.png',
  grass3: 'assets/tiles/grass3.png',
  dirt: 'assets/tiles/dirt.png',
  dirt2: 'assets/tiles/dirt2.png',
  dirt3: 'assets/tiles/dirt3.png',
  forest: 'assets/tiles/forest.png',
  water: 'assets/tiles/water.png',
  asphalt: 'assets/tiles/asphalt.png'
};

const placeImgs = {};
const vehicleImgs = {};
const tileImgs = {};
let ready = false;
let loadPromise = null;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadMap(srcMap, target) {
  const entries = Object.entries(srcMap);
  const imgs = await Promise.all(entries.map(([, src]) => loadImage(src)));
  entries.forEach(([k], i) => { target[k] = imgs[i]; });
}

export function loadGameAssets() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await Promise.all([
      loadMap(PLACE_SRC, placeImgs),
      loadMap(VEHICLE_SRC, vehicleImgs),
      loadMap(TILE_SRC, tileImgs)
    ]);
    ready = true;
    return { placeImgs, vehicleImgs, tileImgs };
  })();
  return loadPromise;
}

export function getPlaceSprite(type, variant = null) {
  if (variant && placeImgs[variant]) return placeImgs[variant];
  if (type === 'town') {
    // fallback chain for variants
    return placeImgs.town || placeImgs.town2 || placeImgs.town3 || null;
  }
  return placeImgs[type] || placeImgs.town || null;
}

/**
 * Content bounds (alpha-crop) for place sprites – undgår “flyvende” byer
 * pga. sort/tom padding i PNG.
 * @returns {{ left:number, top:number, right:number, bottom:number, w:number, h:number }|null}
 */
export function getImageContentBounds(img, alphaThreshold = 12) {
  if (!img || !img.complete || !img.naturalWidth) return null;
  if (img._contentBounds) return img._contentBounds;
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    let left = w;
    let top = h;
    let right = 0;
    let bottom = 0;
    let found = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > alphaThreshold) {
          found = true;
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (!found) {
      img._contentBounds = { left: 0, top: 0, right: w - 1, bottom: h - 1, w, h: h };
      return img._contentBounds;
    }
    // Lille padding så kanter ikke skæres skarpt
    const pad = 2;
    left = Math.max(0, left - pad);
    top = Math.max(0, top - pad);
    right = Math.min(w - 1, right + pad);
    bottom = Math.min(h - 1, bottom + pad);
    img._contentBounds = {
      left,
      top,
      right,
      bottom,
      w: right - left + 1,
      h: bottom - top + 1
    };
    return img._contentBounds;
  } catch {
    return null;
  }
}

export function getVehicleSprite(classId, kind) {
  if (classId && vehicleImgs[classId]) return vehicleImgs[classId];
  // class id aliases
  if (classId === 'car_std') return vehicleImgs.car || null;
  if (classId === 'truck_std') return vehicleImgs.truck || null;
  if (kind === 'truck') return vehicleImgs.truck || vehicleImgs.van || null;
  return vehicleImgs.car || vehicleImgs.bus || null;
}

export function getTileImages() {
  return tileImgs;
}

export function getAsphaltImage() {
  return tileImgs.asphalt || null;
}

export function assetsReady() {
  return ready;
}
