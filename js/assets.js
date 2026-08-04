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
